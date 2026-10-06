import { api, setToken } from "./api.js";
import { invalidateDesk, setDeskQuery } from "./views/admin.js";
import { selectChapters, VIEWS } from "./syllabus.js";
import { addRevision, applyStageToggle, defaultState, removeRevision, sanitizeState, todayISO, addDays, durationMinutes } from "./engine.js";
import {
  getData,
  getUser,
  resetSession,
  setYear,
  touch,
  ui,
  updateChapter,
} from "./store.js";
import { closeModal, openModal, toast } from "./toast.js";
import { closeOverlayNav, closePalette, fillTimerChapters, openPalette, paintIdentity, paintPalette, toggleNav, toggleTimerPop, wideNav } from "./shell.js";
import { renderCurrent } from "./render.js";
import { compressImage, fileToDataUrl } from "./media.js";
import { clearPending, forgetPending, paintPending, rememberPending, takePending } from "./files.js";
import { esc, formatHours } from "./format.js";
import { logFocusSession, resetTimer, toggleTimer } from "./timer.js";


const CASCADES = {
  "test-subject": ["test-chapter", false],
  "error-subject": ["error-chapter", false],
  "log-subject": ["log-chapter", false],
  "card-subject": ["card-chapter", true],
};

export function bind() {
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("input", onInput);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("keydown", onKey);
}

function onClick(event) {
  const sideLink = event.target.closest(".sidebar a");
  if (sideLink && !wideNav()) closeOverlayNav();
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (action === "menu") {
    toggleNav();
    return;
  }
  if (action === "menu-close" || action === "palette-go") {
    closeOverlayNav();
    closePalette();
    return;
  }
  if (action === "palette") {
    openPalette();
    return;
  }
  if (action === "palette-close" || action === "modal-close") {
    closePalette();
    closeModal();
    return;
  }
  if (action === "modal-confirm") return;
  if (action === "year") {
    setYear(el.dataset.year);
    renderCurrent();
    return;
  }
  if (action === "theme") {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("sm-theme", next);
    return;
  }
  if (action === "timer-pop") {
    toggleTimerPop();
    return;
  }
  if (action === "timer-run") {
    toggleTimer();
    return;
  }
  if (action === "timer-reset") {
    resetTimer();
    return;
  }
  if (action === "timer-log") {
    if (logFocusSession()) renderCurrent({ keep: true });
    return;
  }
  if (action === "expand") {
    ui.expanded = ui.expanded === el.dataset.chapter ? null : el.dataset.chapter;
    renderCurrent({ keep: true });
    return;
  }
  if (action === "revision-add") {
    const host = el.closest("td") || el.closest(".rev-log");
    const date = host?.querySelector("[data-revision-date]")?.value || todayISO();
    let skipped = false;
    let full = false;
    updateChapter(el.dataset.chapter, (chapter) => {
      const next = addRevision(chapter, date);
      skipped = next.revisions.length === chapter.revisions.length;
      full = chapter.revisions.length >= 200;
      return next;
    });
    if (skipped) toast(full ? "This chapter already has 200 revisions." : "Pick a date for this revision.");
    renderCurrent({ keep: true });
    return;
  }
  if (action === "revision-remove") {
    updateChapter(el.dataset.chapter, (chapter) => removeRevision(chapter, el.dataset.revision));
    renderCurrent({ keep: true });
    return;
  }
  if (action === "clear-backlog") {
    const today = todayISO();
    updateChapter(el.dataset.chapter, (chapter) => (
      chapter.stages.bl ? chapter : applyStageToggle(chapter, "bl", true, today)
    ));
    renderCurrent({ keep: true });
    return;
  }
  if (action === "delete-row") {
    removeRow(el.dataset.list, el.dataset.id);
    return;
  }
  if (action === "reveal-card") {
    ui.cardReveal = true;
    renderCurrent({ keep: true });
    return;
  }
  if (action === "grade-card") {
    gradeCard(el.dataset.id, el.dataset.grade);
    return;
  }
  if (action === "detach") {
    detach(el);
    return;
  }
  if (action === "preview-file") {
    openPreview(el);
    return;
  }
  if (action === "preview-close") {
    closePreview();
    return;
  }
  if (action === "remove-avatar") {
    removeAvatar();
    return;
  }
  if (action === "export") {
    exportLedger();
    return;
  }
  if (action === "reset-ask") {
    askReset();
    return;
  }
  if (action === "logout") {
    invalidateDesk();
    clearPending();
    closePreview();
    setToken("");
    resetSession();
    location.hash = "#/login";
    return;
  }
  if (action === "desk-approve" || action === "desk-reject" || action === "desk-disable" || action === "desk-enable") {
    deskAction(action, el.dataset.id);
    return;
  }
  if (action === "desk-copy") {
    copyCode(el.dataset.code);
    return;
  }
  if (action === "help") {
    showHelp();
  }
}

function onChange(event) {
  const el = event.target;
  if (CASCADES[el.id]) {
    refillChapters(el.value, CASCADES[el.id][0], CASCADES[el.id][1]);
    return;
  }
  if (el.id === "timer-subject") {
    fillTimerChapters(el.value);
    return;
  }
  if (el.dataset.action === "stage") {
    const today = todayISO();
    updateChapter(el.dataset.chapter, (chapter) => applyStageToggle(chapter, el.dataset.stage, el.checked, today));
    renderCurrent({ keep: true });
    return;
  }
  if (el.dataset.action === "ui-filter") {
    ui.filters[el.dataset.group][el.dataset.key] = el.value;
    if (el.dataset.group === "cards") {
      ui.cardCursor = 0;
      ui.cardReveal = false;
    }
    renderCurrent({ keep: true });
    return;
  }
  if (el.dataset.action === "ui-flag") {
    ui.filters[el.dataset.group][el.dataset.key] = el.checked;
    renderCurrent({ keep: true });
    return;
  }
  if (el.dataset.action === "fix-error") {
    const row = getData().errors.find((item) => item.id === el.dataset.id);
    if (row) row.fixed = el.checked;
    touch();
    renderCurrent({ keep: true });
    return;
  }
  if (el.dataset.action === "attach") {
    uploadAttachment(el);
    return;
  }
  if (el.dataset.action === "avatar") {
    uploadAvatar(el);
    return;
  }
  if (el.dataset.action === "import") {
    importLedger(el);
    return;
  }
  if (el.dataset.bind === "chapter") {
    const render = el.dataset.render !== "false" || el.type === "number" || el.type === "date" || el.tagName === "SELECT";
    applyChapterField(el, render);
  }
}

function onInput(event) {
  const el = event.target;
  if (el.id === "log-start" || el.id === "log-end") {
    const hint = document.getElementById("log-duration");
    if (!hint) return;
    const minutes = durationMinutes(document.getElementById("log-start").value, document.getElementById("log-end").value);
    hint.textContent = `Duration ${formatHours(minutes)}. Overnight sessions are counted.`;
    return;
  }
  if (el.dataset.action === "desk-search") {
    setDeskQuery(el.value);
    const caret = el.selectionStart;
    renderCurrent({ keep: true });
    const next = document.querySelector("[data-action='desk-search']");
    if (next) {
      next.focus();
      next.setSelectionRange(caret, caret);
    }
    return;
  }
  if (el.id === "palette-input") {
    paintPalette(el.value);
    return;
  }
  if (el.dataset.action === "filter-chapters") {
    ui.subjectQuery = el.value;
    const query = el.value.trim().toLowerCase();
    document.querySelectorAll("[data-chapter-row]").forEach((row) => {
      row.hidden = Boolean(query) && !row.dataset.title.includes(query);
    });
    document.querySelectorAll("[data-section]").forEach((section) => {
      const rows = [...section.querySelectorAll("[data-chapter-row]")];
      section.hidden = rows.length > 0 && rows.every((row) => row.hidden);
    });
    return;
  }
  if (el.dataset.action === "ui-search") {
    ui.filters[el.dataset.group].q = el.value.trim().toLowerCase();
    const caret = el.selectionStart;
    renderCurrent({ keep: true });
    const next = document.querySelector(`[data-action="ui-search"][data-group="${el.dataset.group}"]`);
    if (next) {
      next.focus();
      next.setSelectionRange(caret, caret);
    }
    return;
  }
  if (el.dataset.bind === "chapter" && el.dataset.render === "false" && el.tagName !== "SELECT") {
    applyChapterField(el, false);
  }
}

async function onSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  try {
    if (kind === "login" || kind === "register" || kind === "redeem") {
      await authenticate(form, kind);
      return;
    }
    if (kind === "profile") {
      await saveProfile(form);
      return;
    }
    if (kind === "targets" || kind === "exams") {
      saveSettings(form, kind);
      return;
    }
    if (kind === "test") addTest(form);
    else if (kind === "error") addError(form);
    else if (kind === "log") addLog(form);
    else if (kind === "card") addCard(form);
    else if (kind === "mock") addMock(form);
    renderCurrent({ keep: true });
  } catch (err) {
    if (kind === "login" || kind === "register" || kind === "redeem") {
      const message = err.message || "Could not continue.";
      let card = form.querySelector(".form-error");
      if (!card) {
        card = document.createElement("p");
        card.className = "form-error";
        card.setAttribute("role", "alert");
        form.prepend(card);
      }
      card.textContent = message;
      return;
    }
    toast(err.message || "Could not save that.");
  }
}

function onKey(event) {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
  if (event.key === "Escape") {
    closePreview();
    closePalette();
    closeModal();
    const pop = document.getElementById("timer-pop");
    if (pop) pop.hidden = true;
    closeOverlayNav();
    return;
  }
  if (getUser()?.role === "admin") return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openPalette();
    return;
  }
  if (typing) return;
  if (event.key === "?") {
    showHelp();
    return;
  }
  if (event.key === "/") {
    event.preventDefault();
    openPalette();
    return;
  }
  const view = VIEWS.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
  if (view && !event.metaKey && !event.ctrlKey && !event.altKey) location.hash = view.href;
}

const DESK_PATHS = {
  "desk-approve": ["approve", "Code issued"],
  "desk-reject": ["reject", "Request declined"],
  "desk-disable": ["disable", "Account disabled"],
  "desk-enable": ["enable", "Account enabled"],
};

async function deskAction(action, id) {
  const [path, done] = DESK_PATHS[action];
  try {
    const result = await api(`/api/admin/users/${encodeURIComponent(id)}/${path}`, { method: "POST", body: {} });
    invalidateDesk();
    toast(result.code ? `Code ${result.code}` : done);
    renderCurrent({ keep: true });
  } catch (err) {
    toast(err.message || "Could not update that student.");
  }
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    toast("Code copied");
  } catch {
    toast(code);
  }
}

async function authenticate(form, kind) {
  const body = Object.fromEntries(new FormData(form).entries());
  if (kind === "register") {
    const result = await api("/api/auth/register", { method: "POST", body });
    if (result?.token) {
      invalidateDesk();
      setToken(result.token);
      resetSession();
      location.hash = result.user?.role === "admin" ? "#/admin" : "#/dashboard";
      return;
    }
    const email = encodeURIComponent(String(body.email || "").trim());
    location.hash = `#/register?sent=1&email=${email}`;
    return;
  }
  const path = kind === "redeem" ? "/api/auth/redeem" : "/api/auth/login";
  const session = await api(path, { method: "POST", body });
  invalidateDesk();
  setToken(session.token);
  resetSession();
  location.hash = session.user?.role === "admin" ? "#/admin" : "#/dashboard";
}

function applyChapterField(el, shouldRender) {
  const field = el.dataset.field;
  updateChapter(el.dataset.chapter, (chapter) => {
    if (field === "attempted" || field === "correct") {
      chapter[field] = Math.max(0, Math.min(99999, Math.round(Number(el.value) || 0)));
      if (chapter.correct > chapter.attempted) chapter.correct = chapter.attempted;
    } else if (field === "nextRevision" || field === "targetDate") {
      chapter[field] = el.value || null;
    } else {
      chapter[field] = el.value;
    }
    return chapter;
  });
  if (field === "attempted" || field === "correct") {
    const box = document.querySelector(`[data-chapter="${CSS.escape(el.dataset.chapter)}"][data-field="correct"]`);
    if (box && document.activeElement !== box) {
      const chapter = getData().chapters[el.dataset.chapter];
      if (chapter) box.value = chapter.correct;
    }
  }
  if (shouldRender) renderCurrent({ keep: true });
}

function refillChapters(subjectId, targetId, optional) {
  const select = document.getElementById(targetId);
  if (!select) return;
  const year = ui.year === "all" ? "all" : Number(ui.year);
  const chapters = subjectId ? selectChapters({ year, subjectId }) : [];
  const blank = optional ? `<option value="">None</option>` : "";
  select.innerHTML = blank + chapters.map((chapter) => `<option value="${chapter.id}">${chapter.year} · ${esc(chapter.no)} ${esc(chapter.title)}</option>`).join("");
}

function addTest(form) {
  const body = Object.fromEntries(new FormData(form).entries());
  const marks = Number(body.marks) || 0;
  const total = Number(body.total) || 0;
  if (total <= 0) throw new Error("Enter what the test was out of.");
  if (marks > total) throw new Error("Marks cannot be higher than the total.");
  const attempted = Math.max(0, Math.round(Number(body.attempted) || 0));
  const correct = Math.min(attempted, Math.max(0, Math.round(Number(body.correct) || 0)));
  getData().tests.unshift({
    id: crypto.randomUUID(),
    date: body.date,
    subjectId: body.subjectId,
    chapterId: body.chapterId,
    type: body.type,
    marks,
    total,
    attempted,
    correct,
    retestDate: body.retestDate || null,
    mistakes: body.mistakes || "",
    weakConcept: body.weakConcept || "",
    files: takePending("test"),
  });
  touch();
  toast("Test added");
}

function addError(form) {
  const body = Object.fromEntries(new FormData(form).entries());
  if (!body.topic?.trim()) throw new Error("Name the topic that broke.");
  getData().errors.unshift({
    id: crypto.randomUUID(),
    date: body.date,
    subjectId: body.subjectId,
    chapterId: body.chapterId,
    type: body.type,
    topic: body.topic,
    why: body.why || "",
    concept: body.concept || "",
    formula: body.formula || "",
    action: body.action || "",
    retestResult: body.retestResult || "",
    fixed: false,
    files: takePending("error"),
  });
  touch();
  toast("Error logged");
}

function addLog(form) {
  const body = Object.fromEntries(new FormData(form).entries());
  const attempted = Math.max(0, Math.round(Number(body.attempted) || 0));
  const correct = Math.min(attempted, Math.max(0, Math.round(Number(body.correct) || 0)));
  getData().logs.unshift({
    id: crypto.randomUUID(),
    date: body.date,
    subjectId: body.subjectId,
    chapterId: body.chapterId,
    start: body.start,
    end: body.end,
    attempted,
    correct,
    achievement: body.achievement || "",
    problem: body.problem || "",
    nextAction: body.nextAction || "",
    files: takePending("log"),
  });
  updateChapter(body.chapterId, (chapter) => {
    chapter.lastStudied = body.date;
    return chapter;
  });
  toast("Session logged");
}

function addCard(form) {
  const body = Object.fromEntries(new FormData(form).entries());
  if (!body.front?.trim() || !body.back?.trim()) throw new Error("A card needs a front and a back.");
  getData().cards.unshift({
    id: crypto.randomUUID(),
    subjectId: body.subjectId || "",
    chapterId: body.chapterId || "",
    front: body.front,
    back: body.back,
    box: 1,
    due: todayISO(),
  });
  ui.cardReveal = false;
  ui.cardCursor = 0;
  touch();
  toast("Card added");
}

function addMock(form) {
  const body = Object.fromEntries(new FormData(form).entries());
  const percentile = Number(body.percentile);
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 100) throw new Error("Percentile has to be between 0 and 100.");
  getData().mocks.unshift({
    id: crypto.randomUUID(),
    date: body.date,
    name: body.name,
    percentile,
    score: Number(body.score) || 0,
    total: Number(body.total) || 0,
    note: body.note || "",
    files: takePending("mock"),
  });
  touch();
  toast("Mock added");
}

function gradeCard(id, grade) {
  const card = getData().cards.find((item) => item.id === id);
  if (!card) return;
  const today = todayISO();
  if (grade === "again") {
    card.box = 1;
    card.due = addDays(today, 1);
  } else {
    const gap = [1, 3, 7][Math.min(2, (card.box || 1) - 1)];
    card.due = addDays(today, gap);
    card.box = Math.min(3, (card.box || 1) + 1);
  }
  ui.cardReveal = false;
  touch();
  renderCurrent({ keep: true });
}

function removeRow(list, id) {
  const rows = getData()[list];
  if (!Array.isArray(rows)) return;
  const index = rows.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [item] = rows.splice(index, 1);
  for (const file of item.files || []) {
    if (file?.key) removeRemote(file.key);
  }
  touch();
  renderCurrent({ keep: true });
  toast("Deleted", {
    label: "Undo",
    run() {
      rows.splice(index, 0, item);
      touch();
      renderCurrent({ keep: true });
    },
  });
}

async function saveProfile(form) {
  const name = String(new FormData(form).get("name") || "").trim();
  const saved = await api("/api/auth/me", { method: "PATCH", body: { name } });
  Object.assign(getUser(), saved.user);
  paintIdentity();
  toast("Profile saved");
  renderCurrent({ keep: true });
}

function saveSettings(form, kind) {
  const body = Object.fromEntries(new FormData(form).entries());
  const settings = getData().settings;
  if (kind === "targets") {
    settings.dailyChapters = clamp(body.dailyChapters, 0, 20);
    settings.dailyQuestions = clamp(body.dailyQuestions, 0, 500);
    settings.dailyHours = clamp(body.dailyHours, 0, 16);
    settings.pomodoroMin = clamp(body.pomodoroMin, 5, 90);
    settings.breakMin = clamp(body.breakMin, 1, 30);
  } else {
    settings.examLabel = body.examLabel || "MHT-CET";
    settings.examDate = body.examDate || "";
    settings.secondExamLabel = body.secondExamLabel || "HSC Board";
    settings.secondExamDate = body.secondExamDate || "";
  }
  touch();
  toast("Saved");
  renderCurrent({ keep: true });
}

function clamp(value, min, max) {
  const number = Math.round(Number(value) || 0);
  return Math.min(max, Math.max(min, number));
}

function exportLedger() {
  const data = getData();
  data.settings.lastExportAt = new Date().toISOString();
  touch();
  const payload = { app: "studymantra", version: 1, exportedAt: data.settings.lastExportAt, state: sanitizeState(data) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `studymantra-backup-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("Backup downloaded");
  renderCurrent({ keep: true });
}

async function importLedger(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    toast("That file is not JSON.");
    return;
  }
  const clean = sanitizeState(parsed.state || parsed);
  const chapters = Object.keys(clean.chapters).length;
  openModal({
    title: "Replace the ledger?",
    body: `<p>The file has progress for ${chapters} chapters, ${clean.tests.length} tests, ${clean.logs.length} sessions, and ${clean.cards.length} cards. This replaces what is saved now.</p>`,
    confirmLabel: "Replace",
    danger: true,
    onConfirm() {
      clearPending();
      const data = getData();
      data.chapters = clean.chapters;
      data.tests = clean.tests;
      data.errors = clean.errors;
      data.logs = clean.logs;
      data.mocks = clean.mocks;
      data.cards = clean.cards;
      data.settings = clean.settings;
      touch();
      toast("Backup restored");
      renderCurrent();
    },
  });
}

function askReset() {
  openModal({
    title: "Reset the ledger?",
    body: `<p>Progress, logs, cards, and targets will be wiped. Your account stays. Type RESET to confirm.</p><input id="reset-confirm" class="modal-input" autocomplete="off">`,
    confirmLabel: "Wipe ledger",
    danger: true,
    onConfirm() {
      const typed = document.getElementById("reset-confirm")?.value || "";
      if (typed !== "RESET") {
        toast("Type RESET in capitals to confirm.");
        return false;
      }
      clearPending();
      const fresh = defaultState();
      const data = getData();
      data.chapters = fresh.chapters;
      data.tests = fresh.tests;
      data.errors = fresh.errors;
      data.logs = fresh.logs;
      data.mocks = fresh.mocks;
      data.cards = fresh.cards;
      data.settings = fresh.settings;
      touch();
      toast("Ledger reset");
      renderCurrent();
      return true;
    },
  });
}

async function uploadAttachment(input) {
  const file = input.files?.[0];
  const chapterId = input.dataset.chapter;
  const list = input.dataset.list;
  const rowId = input.dataset.id;
  const pending = input.dataset.pending;
  input.value = "";
  if (!file) return;
  try {
    const prepared = file.type === "application/pdf" ? file : await compressImage(file);
    if (prepared.type === "application/pdf" && prepared.size > 2.5 * 1024 * 1024) throw new Error("PDFs must be 2.5 MB or smaller.");
    const saved = await api("/api/media/attachment", {
      method: "POST",
      body: { data: await fileToDataUrl(prepared), contentType: prepared.type, name: file.name },
    });
    if (pending) {
      rememberPending(pending, saved.file);
      paintPending(pending);
      toast("File attached");
      return;
    }
    if (list && rowId) {
      const row = (getData()[list] || []).find((item) => item.id === rowId);
      if (!row) throw new Error("That row is no longer here.");
      row.files = [...(row.files || []), saved.file].slice(-8);
      touch();
      toast("File attached");
      renderCurrent({ keep: true });
      return;
    }
    updateChapter(chapterId, (chapter) => {
      chapter.files = [...(chapter.files || []), saved.file].slice(-8);
      return chapter;
    });
    toast("File attached");
    renderCurrent({ keep: true });
  } catch (err) {
    toast(err.message || "Could not upload that file.");
  }
}

async function uploadAvatar(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const prepared = await compressImage(file, 180 * 1024);
    const saved = await api("/api/media/avatar", {
      method: "POST",
      body: { data: await fileToDataUrl(prepared), contentType: prepared.type },
    });
    Object.assign(getUser(), saved.user);
    paintIdentity();
    toast("Photo updated");
    renderCurrent({ keep: true });
  } catch (err) {
    toast(err.message || "Could not upload that photo.");
  }
}

async function removeAvatar() {
  try {
    const saved = await api("/api/media/avatar", { method: "DELETE" });
    Object.assign(getUser(), saved.user);
    paintIdentity();
    renderCurrent({ keep: true });
  } catch (err) {
    toast(err.message || "Could not remove the photo.");
  }
}

async function removeRemote(key) {
  try {
    await api("/api/media/attachment", { method: "DELETE", body: { key } });
    return true;
  } catch (err) {
    if (err.status === 404) return true;
    toast(err.message || "Could not delete that file.");
    return false;
  }
}

async function detach(el) {
  const key = el.dataset.key;
  const pending = el.dataset.pending;
  const chapterId = el.dataset.chapter;
  const list = el.dataset.list;
  const rowId = el.dataset.id;
  if (!key || !(await removeRemote(key))) return;
  if (pending) {
    forgetPending(pending, key);
    paintPending(pending);
    return;
  }
  if (chapterId) {
    updateChapter(chapterId, (chapter) => {
      chapter.files = (chapter.files || []).filter((file) => file.key !== key);
      return chapter;
    });
    renderCurrent({ keep: true });
    return;
  }
  const row = (getData()[list] || []).find((item) => item.id === rowId);
  if (row) {
    row.files = (row.files || []).filter((file) => file.key !== key);
    touch();
  }
  renderCurrent({ keep: true });
}

function previewKind(type, url) {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (type) return "";
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(url)) return "image";
  if (/\.pdf(\?|$)/i.test(url)) return "pdf";
  return "";
}

function openPreview(el) {
  const root = document.getElementById("preview");
  const body = document.getElementById("preview-body");
  const title = document.getElementById("preview-title");
  if (!root || !body || !title) return;
  const url = el.dataset.url || "";
  const name = el.dataset.name || "Document";
  const type = el.dataset.type || "";
  title.textContent = name;
  body.replaceChildren();
  const kind = url.startsWith("https://") ? previewKind(type, url) : "";
  if (kind === "image") {
    const img = document.createElement("img");
    img.alt = name;
    img.src = url;
    body.append(img);
  } else if (kind === "pdf") {
    const frame = document.createElement("iframe");
    frame.title = name;
    frame.src = url;
    body.append(frame);
  } else {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "This file cannot be previewed. Images and PDFs open here.";
    body.append(note);
  }
  root.hidden = false;
}

export function closePreview() {
  const body = document.getElementById("preview-body");
  if (body) body.replaceChildren();
  const root = document.getElementById("preview");
  if (root) root.hidden = true;
}

function showHelp() {
  const rows = VIEWS.map((view) => `<li><kbd>${view.key}</kbd> ${view.label}</li>`).join("");
  openModal({
    title: "Shortcuts",
    body: `<ul class="help-list">${rows}<li><kbd>/</kbd> Search</li><li><kbd>?</kbd> This list</li></ul>`,
    confirmLabel: "Done",
    onConfirm() { return true; },
  });
}
