import { SUBJECTS, VIEWS, searchChapters, selectChapters } from "./syllabus.js";
import { summarize } from "./engine.js";
import { getData, getUser, ui } from "./store.js";
import { esc, pct } from "./format.js";
import { route } from "./router.js";

const MAIN_LINKS = [
  ["dashboard", "Dashboard", "D"],
  ["pcm", "PCM board", "P"],
  ["backlog", "Backlog", "B"],
  ["revision", "Revision", "R"],
  ["tests", "Tests", "T"],
  ["errors", "Error log", "E"],
  ["log", "Study log", "L"],
  ["week", "Weekly", "W"],
  ["cards", "Flashcards", "F"],
  ["mocks", "CET mocks", "M"],
];

export function wideNav() {
  return matchMedia("(min-width: 961px)").matches;
}

export function setNav(open, { persist = false } = {}) {
  const shown = Boolean(open);
  document.documentElement.dataset.sidebar = shown ? "open" : "closed";
  document.body.classList.toggle("nav-open", shown && !wideNav());
  document.querySelectorAll(".sidebar").forEach((node) => {
    node.setAttribute("aria-hidden", shown ? "false" : "true");
  });
  if (persist && wideNav()) {
    try { localStorage.setItem("sm-nav", shown ? "open" : "closed"); } catch { /* private mode */ }
  }
  paintNav();
}

export function toggleNav() {
  const shown = wideNav()
    ? document.documentElement.dataset.sidebar === "open"
    : document.body.classList.contains("nav-open");
  setNav(!shown, { persist: true });
}

export function closeOverlayNav() {
  if (wideNav()) return;
  setNav(false);
}

const MENU_BUTTON = `<button type="button" class="menu-btn" data-action="menu" aria-label="Show sidebar" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></button>`;

export function paintNav() {
  const open = document.documentElement.dataset.sidebar === "open";
  const shown = wideNav() ? open : document.body.classList.contains("nav-open");
  document.querySelectorAll(".menu-btn").forEach((button) => {
    button.setAttribute("aria-expanded", shown ? "true" : "false");
    button.setAttribute("aria-label", shown ? "Hide sidebar" : "Show sidebar");
  });
}

export function ensureShell() {
  if (document.querySelector(".app")) return;
  const root = document.getElementById("app");
  root.innerHTML = `<div class="app">
    <aside class="sidebar" aria-label="Sections">
      <a class="brand" href="#/dashboard"><span class="brand-mark">Sm</span><span><b>StudyMantra</b><small>HSC ledger</small></span></a>
      <nav>
        <p class="nav-label">Overview</p>
        ${MAIN_LINKS.slice(0, 2).map(link).join("")}
        <p class="nav-label">Track</p>
        ${MAIN_LINKS.slice(2).map(link).join("")}
        ${[11, 12].map((year) => `<p class="nav-label">Class ${year}</p>${SUBJECTS.map((subject) => subjectLink(year, subject)).join("")}`).join("")}
        <p class="nav-label">Account</p>
        <a class="nav-link" href="#/settings" data-nav="settings"><span class="nav-key">S</span><span>Settings</span></a>
      </nav>
    </aside>
    <button type="button" class="scrim" data-action="menu-close" aria-label="Close menu"></button>
    <div class="main">
      <header class="topbar">
        ${MENU_BUTTON}
        <div class="year-switch" role="group" aria-label="Year">
          <button type="button" data-action="year" data-year="all">Both</button>
          <button type="button" data-action="year" data-year="11">11</button>
          <button type="button" data-action="year" data-year="12">12</button>
        </div>
        <button type="button" class="btn btn-ghost search-btn" data-action="palette">Search</button>
        <button type="button" class="btn btn-ghost timer-btn" data-action="timer-pop" data-timer-readout>Focus</button>
        <span id="save-state" class="save-state">Saved</span>
        <button type="button" class="btn btn-ghost" data-action="theme" aria-label="Toggle theme">Theme</button>
        <a class="identity" href="#/settings" id="identity"></a>
      </header>
      <div class="page" id="page"></div>
    </div>
  </div>
  <div id="palette" class="palette" hidden>
    <button type="button" class="scrim" data-action="palette-close" aria-label="Close search"></button>
    <div class="palette-card" role="dialog" aria-label="Search">
      <input id="palette-input" type="search" placeholder="Jump to a chapter or page" autocomplete="off">
      <div id="palette-list"></div>
    </div>
  </div>
  <div id="timer-pop" class="timer-pop" hidden>
    <div class="timer-card">
      <p class="eyebrow" id="timer-mode">Focus</p>
      <strong id="timer-clock">25:00</strong>
      <div class="form-actions">
        <button type="button" class="btn btn-primary" data-action="timer-run">Start</button>
        <button type="button" class="btn btn-ghost" data-action="timer-reset">Reset</button>
      </div>
      <label class="field"><span>Subject</span><select id="timer-subject">${SUBJECTS.map((subject) => `<option value="${subject.id}">${esc(subject.short)}</option>`).join("")}</select></label>
      <label class="field"><span>Chapter</span><select id="timer-chapter"></select></label>
      <button type="button" class="btn btn-ghost btn-block" data-action="timer-log">Log this focus</button>
    </div>
  </div>`;
  fillTimerChapters("m1");
  paintIdentity();
  paintNav();
}

function link([id, label, key]) {
  return `<a class="nav-link" href="#/${id}" data-nav="${id}"><span class="nav-key">${key}</span><span>${label}</span></a>`;
}

function subjectLink(year, subject) {
  return `<a class="nav-link nav-subject" href="#/subject/${year}/${subject.id}" data-nav="subject:${year}:${subject.id}">
    <span class="mark">${esc(subject.mark)}</span>
    <span class="nav-copy">${esc(subject.short)}<i class="nav-meter" data-meter="${year}:${subject.id}"><b></b></i></span>
    <small data-meter-label="${year}:${subject.id}">0%</small>
  </a>`;
}

export function ensureDeskShell() {
  if (document.querySelector(".desk-app")) return;
  const root = document.getElementById("app");
  root.innerHTML = `<div class="app desk-app">
    <aside class="sidebar" aria-label="Desk">
      <a class="brand" href="#/admin"><span class="brand-mark">Sm</span><span><b>StudyMantra</b><small>Admin desk</small></span></a>
      <nav>
        <p class="nav-label">Desk</p>
        <a class="nav-link is-active" href="#/admin" data-nav="admin"><span class="nav-key">A</span><span>Students</span></a>
        <p class="nav-label">Account</p>
        <button type="button" class="nav-link nav-button" data-action="logout">Sign out</button>
      </nav>
    </aside>
    <button type="button" class="scrim" data-action="menu-close" aria-label="Close menu"></button>
    <div class="main">
      <header class="topbar">
        ${MENU_BUTTON}
        <p class="desk-crumb">Desk</p>
        <span class="top-spacer"></span>
        <button type="button" class="btn btn-ghost" data-action="theme" aria-label="Toggle theme">Theme</button>
        <a class="identity" href="#/admin" id="identity"></a>
      </header>
      <div class="page" id="page"></div>
    </div>
  </div>`;
  paintIdentity();
  paintNav();
}

export function paintChrome(current = route()) {
  const key = current.name === "subject" ? `subject:${current.parts[1]}:${current.parts[2]}` : current.name;
  document.querySelectorAll("[data-nav]").forEach((node) => node.classList.toggle("is-active", node.dataset.nav === key));
  document.querySelectorAll("[data-year]").forEach((node) => node.classList.toggle("is-active", node.dataset.year === ui.year));
  const data = getData();
  if (data) {
    document.querySelectorAll("[data-meter]").forEach((node) => {
      const [year, subjectId] = node.dataset.meter.split(":");
      const summary = summarize(selectChapters({ year: Number(year), subjectId }), data);
      const width = Math.round(summary.raw * 100);
      node.querySelector("b").style.width = `${width}%`;
      const label = document.querySelector(`[data-meter-label="${year}:${subjectId}"]`);
      if (label) label.textContent = pct(summary.raw);
    });
  }
  paintIdentity();
  paintNav();
}

export function paintIdentity() {
  const slot = document.getElementById("identity");
  const user = getUser();
  if (!slot || !user) return;
  const face = user.avatarUrl
    ? `<img class="avatar" src="${esc(user.avatarUrl)}" alt="">`
    : `<span class="avatar avatar-fallback">${esc(initials(user.name))}</span>`;
  slot.innerHTML = `${face}<span>${esc(user.name.split(" ")[0])}</span>`;
}

function initials(name) {
  return String(name || "?").split(" ").slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

export function fillTimerChapters(subjectId) {
  const select = document.getElementById("timer-chapter");
  if (!select) return;
  const chapters = selectChapters({ subjectId: subjectId || "m1" });
  select.innerHTML = chapters.map((chapter) => `<option value="${chapter.id}">${chapter.year} · ${esc(chapter.no)} ${esc(chapter.title)}</option>`).join("");
}

export function openPalette() {
  const palette = document.getElementById("palette");
  if (!palette) return;
  palette.hidden = false;
  const input = document.getElementById("palette-input");
  input.value = "";
  paintPalette("");
  input.focus();
}

export function closePalette() {
  const palette = document.getElementById("palette");
  if (palette) palette.hidden = true;
}

export function paintPalette(query) {
  const list = document.getElementById("palette-list");
  if (!list) return;
  const needle = query.trim().toLowerCase();
  const views = VIEWS.filter((view) => !needle || view.label.toLowerCase().includes(needle));
  const chapters = searchChapters(query, 8);
  const viewHtml = views.map((view) => `<a href="${view.href}" data-action="palette-go"><span>${esc(view.label)}</span><kbd>${esc(view.key)}</kbd></a>`).join("");
  const chapterHtml = chapters.map((chapter) => `<a href="#/subject/${chapter.year}/${chapter.subjectId}?chapter=${encodeURIComponent(chapter.id)}" data-action="palette-go"><span>Class ${chapter.year} · ${esc(chapter.no)} ${esc(chapter.title)}</span></a>`).join("");
  list.innerHTML = `${viewHtml}${chapterHtml}` || `<p class="muted">No matches.</p>`;
}

export function toggleTimerPop() {
  const pop = document.getElementById("timer-pop");
  if (!pop) return;
  pop.hidden = !pop.hidden;
}
