import { setToken, token } from "./api.js";
import { PUBLIC, route } from "./router.js";
import { ensureData, ensureSession, getUser, refreshHealth, resetSession, ui } from "./store.js";
import { ensureDeskShell, ensureShell, paintChrome } from "./shell.js";
import { authScreen, pageHtml, titleFor } from "./pages.js";
import { deskHtml, loadDesk } from "./views/admin.js";
import { esc } from "./format.js";
import { syncLengths } from "./timer.js";

let running = false;
let pending = false;
let lastPath = "";

export async function renderCurrent({ keep = false } = {}) {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    do {
      pending = false;
      await draw(keep);
      keep = true;
    } while (pending);
  } finally {
    running = false;
  }
}

function authTitle(current) {
  if (current.name === "approve") return "Enter code";
  if (current.name === "register") return current.query.get("sent") === "1" ? "Request received" : "Request a ledger";
  return "Sign in";
}

function leaveSession() {
  setToken("");
  resetSession();
}

async function draw(keep) {
  const current = route();
  if (!token()) {
    if (!PUBLIC.has(current.name)) {
      location.hash = "#/login";
      return;
    }
    authScreen(current);
    document.title = `${authTitle(current)} · StudyMantra`;
    return;
  }

  if (!getUser()) {
    try {
      await ensureSession();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        leaveSession();
        if (route().name !== "login") location.hash = "#/login";
        else authScreen(route());
        return;
      }
      document.getElementById("app").innerHTML = `<div class="boot"><h1>Could not open StudyMantra</h1><p>${esc(err.message)}</p><button type="button" class="btn btn-primary" onclick="location.reload()">Try again</button></div>`;
      return;
    }
  }

  if (getUser()?.role === "admin") {
    if (current.name !== "admin") {
      location.hash = "#/admin";
      return;
    }
    if (!document.querySelector(".desk-app")) {
      document.getElementById("app").innerHTML = `<div class="boot"><p>Opening the desk…</p></div>`;
    }
    try {
      await loadDesk(current.query.get("user") || "", { fresh: !keep });
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        leaveSession();
        location.hash = "#/login";
        return;
      }
      const host = document.getElementById("page") || document.getElementById("app");
      host.innerHTML = `<div class="boot"><h1>Could not open the desk</h1><p>${esc(err.message)}</p><button type="button" class="btn btn-primary" onclick="location.reload()">Try again</button></div>`;
      return;
    }
    ensureDeskShell();
    const deskPage = document.getElementById("page");
    const deskPath = `${current.hash.split("?")[0]}:${current.query.get("user") || ""}`;
    if (!keep || deskPath !== lastPath) deskPage.scrollTop = 0;
    lastPath = deskPath;
    deskPage.innerHTML = deskHtml();
    document.title = "Desk · StudyMantra";
    return;
  }

  if (PUBLIC.has(current.name) || current.name === "admin") {
    location.hash = "#/dashboard";
    return;
  }

  if (!document.getElementById("page")) {
    document.getElementById("app").innerHTML = `<div class="boot"><p>Opening your ledger…</p></div>`;
  }

  try {
    await ensureData();
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      leaveSession();
      location.hash = "#/login";
      return;
    }
    document.getElementById("app").innerHTML = `<div class="boot"><h1>Could not open the ledger</h1><p>${esc(err.message)}</p><button type="button" class="btn btn-primary" onclick="location.reload()">Try again</button></div>`;
    return;
  }

  ensureShell();
  if (current.name === "settings" && !ui.health) {
    refreshHealth().then(() => {
      if (route().name === "settings") renderCurrent({ keep: true });
    });
  }
  if (current.name === "subject") {
    const chapter = current.query.get("chapter");
    if (chapter && ui.jump !== current.hash) {
      ui.expanded = chapter;
      ui.jump = current.hash;
      ui.pendingScroll = chapter;
    }
  }

  paintChrome(current);
  syncLengths();
  const page = document.getElementById("page");
  const path = current.hash.split("?")[0];
  if (!keep || path !== lastPath) page.scrollTop = 0;
  lastPath = path;
  page.innerHTML = pageHtml(current);
  document.title = `${titleFor(current)} · StudyMantra`;
  if (ui.pendingScroll) {
    document.getElementById(`ch-${ui.pendingScroll}`)?.scrollIntoView({ block: "center" });
    ui.pendingScroll = null;
  }
}
