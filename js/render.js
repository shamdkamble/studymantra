import { token } from "./api.js";
import { PUBLIC, route } from "./router.js";
import { ensureData, refreshHealth, resetSession, ui } from "./store.js";
import { ensureShell, paintChrome } from "./shell.js";
import { authScreen, pageHtml, titleFor } from "./pages.js";
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

async function draw(keep) {
  const current = route();
  if (!token()) {
    if (!PUBLIC.has(current.name)) {
      location.hash = "#/login";
      return;
    }
    authScreen(current.name);
    document.title = `${current.name === "register" ? "Create account" : "Sign in"} · StudyMantra`;
    return;
  }

  if (PUBLIC.has(current.name)) {
    location.hash = "#/dashboard";
    return;
  }

  if (!document.getElementById("page")) {
    document.getElementById("app").innerHTML = `<div class="boot"><p>Opening your ledger…</p></div>`;
  }

  try {
    await ensureData();
  } catch (err) {
    if (err.status === 401) {
      resetSession();
      localStorage.removeItem("sm-token");
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
