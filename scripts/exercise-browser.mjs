/**
 * Serves nothing itself. The app must already be on STUDY_BASE.
 * API calls are answered inside the browser so the signed-in ledger can be
 * exercised when Atlas is unreachable. Exits 2 when Chrome and Edge are missing.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { defaultState } from "../js/engine.js";

const BASE = process.env.STUDY_BASE || "http://127.0.0.1:8090";
const email = `browser-check-${Date.now()}@studymantra.test`;
const password = `browser-${Date.now()}-pw`;
const browsers = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function browserPath() {
  return browsers.find((candidate) => existsSync(candidate)) || "";
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 0;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      const queue = this.events.get(message.method);
      if (queue) queue.forEach((handler) => handler(message.params));
    });
  }

  on(method, handler) {
    const queue = this.events.get(method) || new Set();
    queue.add(handler);
    this.events.set(method, queue);
  }

  send(method, params = {}, timeout = 20000) {
    const id = ++this.next;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
    });
  }

  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "page error";
      throw new Error(text);
    }
    return result.result?.value;
  }
}

async function waitFor(cdp, expression, label) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < 20000) {
    try {
      last = await cdp.eval(`(() => { try { return (${expression}); } catch (err) { return String(err && err.message || err); } })()`);
      if (last === true || last === "ok") return;
    } catch (err) {
      last = err.message;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label}. Last: ${String(last).slice(0, 240)}`);
}

function mockLedger(cdp) {
  const user = { id: "user-browser", name: "Browser Check", email, avatarUrl: "" };
  let updatedAt = "";
  let state = defaultState();
  const fulfill = (requestId, status, body) => {
    cdp.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: status,
      responseHeaders: [
        { name: "Content-Type", value: "application/json" },
        { name: "Access-Control-Allow-Origin", value: BASE },
      ],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    }).catch(() => {});
  };

  cdp.on("Fetch.requestPaused", (params) => {
    const url = new URL(params.request.url);
    const method = params.request.method;
    let body = {};
    if (params.request.postData) {
      try { body = JSON.parse(params.request.postData); } catch { body = {}; }
    }
    if (url.pathname === "/api/auth/register" || url.pathname === "/api/auth/login") {
      fulfill(params.requestId, 200, { token: "browser-token", user });
      return;
    }
    if (url.pathname === "/api/auth/me") {
      fulfill(params.requestId, 200, { user });
      return;
    }
    if (url.pathname === "/api/state" && method === "GET") {
      fulfill(params.requestId, 200, { state, updatedAt });
      return;
    }
    if (url.pathname === "/api/state" && method === "PUT") {
      const base = String(body.baseUpdatedAt || "");
      if (updatedAt && base && base !== updatedAt) {
        fulfill(params.requestId, 409, {
          error: { message: "This ledger was updated somewhere else.", code: "CONFLICT" },
          state,
          updatedAt,
        });
        return;
      }
      state = body.state || state;
      updatedAt = new Date().toISOString();
      fulfill(params.requestId, 200, { state, updatedAt });
      return;
    }
    if (url.pathname === "/api/health") {
      fulfill(params.requestId, 503, {
        ok: false,
        app: "studymantra",
        mongo: { configured: true, connected: false, database: null, error: "Database unavailable." },
        storage: { configured: false, missing: ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] },
      });
      return;
    }
    cdp.send("Fetch.continueRequest", { requestId: params.requestId }).catch(() => {});
  });
}

async function checkServer() {
  const page = await fetch(`${BASE}/`);
  const html = await page.text();
  if (page.status !== 200 || !html.includes("StudyMantra")) {
    throw new Error(`app page was ${page.status}`);
  }
  const hidden = await fetch(`${BASE}/server/auth.js`);
  if (hidden.status !== 404) throw new Error(`/server/auth.js returned ${hidden.status}`);
  const health = await fetch(`${BASE}/api/health`);
  const body = await health.json();
  if ("uriPreview" in (body.mongo || {})) throw new Error("health leaked a connection string");
  return { health: health.status, database: body.mongo?.database || null, ok: body.ok === true };
}

async function main() {
  const exe = browserPath();
  if (!exe) {
    console.log("NO_BROWSER");
    process.exit(2);
  }
  const server = await checkServer();
  console.log(`SERVER health=${server.health} db=${server.ok ? server.database : "down"}`);

  const profile = await mkdtemp(path.join(tmpdir(), "studymantra-"));
  const chrome = spawn(exe, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--disable-extensions",
    `--remote-debugging-port=0`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("browser did not open a debugging port")), 15000);
      const watch = (chunk) => {
        const match = String(chunk).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/);
        if (!match) return;
        clearTimeout(timer);
        resolve(match[1]);
      };
      chrome.stderr.on("data", watch);
      chrome.stdout.on("data", watch);
      chrome.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`browser exited ${code} before debugging started`));
      });
    });

    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = list.find((item) => item.type === "page");
    if (!page?.webSocketDebuggerUrl) throw new Error("no browser page");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", () => reject(new Error("debugger socket failed")));
    });
    const cdp = new Cdp(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: `${BASE}/api/*` }] });
    mockLedger(cdp);
    cdp.on("Runtime.exceptionThrown", (params) => {
      const detail = params.exceptionDetails;
      console.error("PAGE", detail?.exception?.description || detail?.text || "exception");
    });
    cdp.on("Runtime.consoleAPICalled", (params) => {
      if (params.type !== "error" && params.type !== "warning") return;
      const text = (params.args || []).map((arg) => arg.value || arg.description || "").join(" ");
      console.error("CONSOLE", text);
    });

    const nav = await cdp.send("Page.navigate", { url: `${BASE}/#/register` });
    if (nav?.errorText) console.error("NAV", nav.errorText);
    await waitFor(cdp, `document.querySelector('form[data-form="register"]') ? true : document.body.innerText.slice(0, 140)`, "register form");
    const narrow = await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    }).then(() => cdp.eval(`document.querySelector("form.auth-card") && document.documentElement.scrollWidth <= 390 + 2 ? true : "overflow " + document.documentElement.scrollWidth`));
    if (narrow !== true) throw new Error(`mobile register layout: ${narrow}`);
    await cdp.send("Emulation.clearDeviceMetricsOverride");

    await cdp.eval(`(() => {
      const form = document.querySelector('form[data-form="register"]');
      form.querySelector('[name=name]').value = "Browser Check";
      form.querySelector('[name=email]').value = ${JSON.stringify(email)};
      form.querySelector('[name=password]').value = ${JSON.stringify(password)};
      form.requestSubmit();
      return "ok";
    })()`);
    await waitFor(cdp, `document.body.innerText.includes("Exam readiness") ? true : document.body.innerText.slice(0, 180)`, "dashboard");

    const mobileNav = await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    }).then(async () => {
      const shown = await cdp.eval(`getComputedStyle(document.querySelector(".menu-btn")).display !== "none" ? true : getComputedStyle(document.querySelector(".menu-btn")).display`);
      if (shown !== true) return `menu hidden (${shown})`;
      await cdp.eval(`document.querySelector('[data-action="menu"]').click()`);
      return cdp.eval(`document.body.classList.contains("nav-open") && document.body.innerText.includes("Class 11") ? true : "nav closed"`);
    });
    if (mobileNav !== true) throw new Error(`mobile nav: ${mobileNav}`);
    await cdp.send("Emulation.clearDeviceMetricsOverride");
    await cdp.eval(`document.body.classList.remove("nav-open")`);

    await cdp.send("Page.navigate", { url: `${BASE}/#/subject/11/phy` });
    await waitFor(cdp, `document.body.innerText.includes("Mathematical Methods") && document.body.innerText.includes("Semiconductors") ? true : document.body.innerText.slice(0, 180)`, "physics page");
    const toggled = await cdp.eval(`(() => {
      const box = document.querySelector('input[data-action="stage"][data-chapter="11-phy-02"][data-stage="th"]');
      if (!box) return "missing checkbox";
      box.click();
      return box.checked ? "ok" : "not checked";
    })()`);
    if (toggled !== "ok") throw new Error(toggled);
    await waitFor(cdp, `(() => { const el = document.getElementById("save-state"); return el && el.textContent === "Saved" ? true : (el ? el.textContent : "no save"); })()`, "autosave");

    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, `(() => {
      const box = document.querySelector('input[data-action="stage"][data-chapter="11-phy-02"][data-stage="th"]');
      if (box && box.checked && document.body.innerText.includes("Mathematical Methods")) return true;
      return document.body.innerText.slice(0, 180);
    })()`, "persisted theory tick");

    await cdp.send("Page.navigate", { url: `${BASE}/#/subject/12/chem` });
    await waitFor(cdp, `document.body.innerText.includes("Green Chemistry and Nanochemistry") && !document.body.innerText.includes("Chemistry in Everyday Life") ? true : document.body.innerText.slice(0, 200)`, "class 12 chemistry");

    await cdp.send("Page.navigate", { url: `${BASE}/#/settings` });
    await waitFor(cdp, `document.body.innerText.includes("not private") && document.body.innerText.includes("not connected") ? true : document.body.innerText.slice(0, 220)`, "settings copy");

    ws.close();
    console.log("BROWSER_OK");
  } finally {
    chrome.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
