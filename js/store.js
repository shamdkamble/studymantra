import { api } from "./api.js";
import { getChapter, isPristine, sanitizeState } from "./engine.js";

const CACHE_KEY = "sm-cache";

export const ui = {
  year: readYear(),
  expanded: null,
  jump: "",
  pendingScroll: null,
  subjectQuery: "",
  offline: false,
  health: null,
  filters: {
    backlog: { priority: "all", started: false, q: "" },
    revision: { status: "all", q: "" },
    errors: { subject: "all", type: "all", fixed: "all" },
    tests: { subject: "all" },
    cards: { subject: "all" },
  },
  cardReveal: false,
  cardCursor: 0,
};

let user = null;
let data = null;
let serverUpdatedAt = "";
let dirty = false;
let ready = false;
let saving = false;
let timer = null;
let loading = null;
let onConflict = () => {};
let onSave = () => {};

function readYear() {
  try {
    return localStorage.getItem("sm-year") || "all";
  } catch {
    return "all";
  }
}

export function setYear(year) {
  ui.year = year;
  try {
    localStorage.setItem("sm-year", year);
  } catch {
    /* ignore quota / private mode */
  }
}

export function getUser() {
  return user;
}

export function getData() {
  return data;
}

export function isReady() {
  return ready;
}

export function setConflictHandler(fn) {
  onConflict = fn;
}

export function setSaveHandler(fn) {
  onSave = fn;
}

export function installState(next, nextUser = null) {
  data = sanitizeState(next);
  if (nextUser) user = nextUser;
  ready = true;
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeCache() {
  if (!user || !data) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      userId: user.id,
      updatedAt: data.updatedAt || "",
      baseUpdatedAt: serverUpdatedAt,
      data,
    }));
  } catch {
    /* a full ledger can exceed quota; the server copy still saves */
  }
}

export function paintSave(text, tone = "") {
  const el = document.getElementById("save-state");
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
}

export function touch() {
  if (!data) return;
  data.updatedAt = new Date().toISOString();
  dirty = true;
  writeCache();
  paintSave(ui.offline ? "Saved on this device" : "Saving…", ui.offline ? "error" : "dirty");
  clearTimeout(timer);
  timer = setTimeout(() => { flush(); }, 450);
}

export function putChapter(id, chapter) {
  if (!data.chapters) data.chapters = {};
  if (isPristine(chapter)) delete data.chapters[id];
  else data.chapters[id] = chapter;
  touch();
}

export function updateChapter(id, recipe) {
  const next = recipe(getChapter(data, id));
  putChapter(id, next);
  return next;
}

export async function flush() {
  if (!dirty || !data || saving) return;
  saving = true;
  const payload = sanitizeState(data);
  const base = serverUpdatedAt;
  try {
    const saved = await api("/api/state", {
      method: "PUT",
      body: { state: payload, baseUpdatedAt: base },
      keepalive: true,
    });
    serverUpdatedAt = saved.updatedAt || "";
    dirty = false;
    ui.offline = false;
    writeCache();
    paintSave("Saved", "");
  } catch (err) {
    if (err.status === 409 && err.payload?.state) {
      data = sanitizeState(err.payload.state);
      serverUpdatedAt = err.payload.updatedAt || "";
      data.updatedAt = serverUpdatedAt;
      dirty = false;
      writeCache();
      paintSave("Reloaded", "");
      onConflict();
    } else {
      ui.offline = true;
      paintSave("Saved on this device", "error");
    }
  } finally {
    saving = false;
    onSave();
    if (dirty) {
      clearTimeout(timer);
      timer = setTimeout(() => { flush(); }, 1200);
    }
  }
}

export async function ensureData() {
  if (ready && data && user) return;
  if (!loading) {
    loading = load().finally(() => {
      loading = null;
    });
  }
  await loading;
}

async function load() {
  const me = await api("/api/auth/me");
  user = me.user;
  let remote = null;
  try {
    remote = await api("/api/state");
    ui.offline = false;
  } catch (err) {
    if (err.status === 401) throw err;
    ui.offline = true;
  }

  const cache = readCache();
  const cacheMatches = cache && cache.userId === user.id && cache.data;
  const cacheIsNewer = cacheMatches && (cache.updatedAt || "") > (remote?.updatedAt || "");

  if (cacheIsNewer) {
    const base = cache.baseUpdatedAt || "";
    const serverMoved = remote?.updatedAt && base && remote.updatedAt !== base;
    if (serverMoved) {
      data = sanitizeState(remote.state);
      serverUpdatedAt = remote.updatedAt || "";
      dirty = false;
      writeCache();
    } else {
      data = sanitizeState(cache.data);
      serverUpdatedAt = base || remote?.updatedAt || "";
      dirty = true;
      writeCache();
      touch();
    }
  } else if (remote) {
    data = sanitizeState(remote.state);
    serverUpdatedAt = remote.updatedAt || "";
    dirty = false;
    writeCache();
  } else if (cacheMatches) {
    data = sanitizeState(cache.data);
    serverUpdatedAt = cache.baseUpdatedAt || "";
    dirty = true;
  } else {
    throw new Error("Could not reach the database, and this browser has no saved copy.");
  }
  ready = true;
}

export function resetSession() {
  user = null;
  data = null;
  ready = false;
  dirty = false;
  serverUpdatedAt = "";
  const root = document.getElementById("app");
  if (root) root.innerHTML = "";
}

export async function refreshHealth() {
  try {
    ui.health = await api("/api/health");
  } catch (err) {
    ui.health = err.payload?.storage
      ? { ...err.payload, ok: false }
      : { ok: false, message: err.message, storage: { configured: false, missing: [] } };
  }
  return ui.health;
}
