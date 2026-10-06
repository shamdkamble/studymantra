import { chapterProgress, getChapter, latestRevisionAt, revisionStatus, todayISO } from "../engine.js";
import { getData, ui } from "../store.js";
import { bar, esc, formatLong, optionList, pct, yearLabel } from "../format.js";
import { chapterLink, emptyBlock, scoped } from "./bits.js";

const PRIORITY = [["all", "All priorities"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]];
const REV = [["all", "All chapters"], ["due", "Due"], ["upcoming", "Upcoming"], ["not_set", "Not set"], ["none", "Never revised"]];

export function backlogPage() {
  const state = getData();
  const filter = ui.filters.backlog;
  const rows = scoped().map((meta) => ({
    meta,
    chapter: getChapter(state, meta.id),
    progress: chapterProgress(getChapter(state, meta.id)),
  })).filter((row) => !row.chapter.stages.bl)
    .filter((row) => filter.priority === "all" || row.chapter.priority === filter.priority)
    .filter((row) => !filter.started || row.progress.ticked > 0)
    .filter((row) => !filter.q || `${row.meta.title} ${row.meta.no}`.toLowerCase().includes(filter.q))
    .sort((a, b) => rank(a.chapter.priority) - rank(b.chapter.priority) || a.progress.raw - b.progress.raw || a.meta.order - b.meta.order);

  return `<header class="page-head">
      <div>
        <p class="eyebrow">${esc(yearLabel(ui.year))}</p>
        <h1>Backlog</h1>
        <p class="lede">${rows.length} chapter${rows.length === 1 ? "" : "s"} still need the backlog stage. Clear it once the chapter is no longer something you are avoiding.</p>
      </div>
    </header>
    <div class="toolbar">
      <select data-action="ui-filter" data-group="backlog" data-key="priority">${optionList(PRIORITY, filter.priority)}</select>
      <label class="checkline"><input type="checkbox" data-action="ui-flag" data-group="backlog" data-key="started" ${filter.started ? "checked" : ""}> Started only</label>
      <input type="search" placeholder="Search backlog" value="${esc(filter.q)}" data-action="ui-search" data-group="backlog">
    </div>
    ${rows.length ? `<div class="table-scroll"><table class="sheet sheet-loose">
      <thead><tr><th class="sticky">Chapter</th><th>Priority</th><th>Progress</th><th>Next action</th><th>Target</th><th></th></tr></thead>
      <tbody>${rows.map((row) => `<tr class="${row.chapter.targetDate && row.chapter.targetDate < todayISO() ? "is-due" : ""}">
        <th class="sticky">${chapterLink(row.meta)} <small class="muted">Class ${row.meta.year}</small></th>
        <td><select data-bind="chapter" data-field="priority" data-chapter="${row.meta.id}">${optionList([["high", "High"], ["medium", "Medium"], ["low", "Low"]], row.chapter.priority)}</select></td>
        <td class="done"><b>${pct(row.progress.raw)}</b>${bar(row.progress.raw)}</td>
        <td><input class="grow" value="${esc(row.chapter.nextAction)}" data-bind="chapter" data-field="nextAction" data-chapter="${row.meta.id}" data-render="false" placeholder="Next action"></td>
        <td><input type="date" value="${esc(row.chapter.targetDate || "")}" data-bind="chapter" data-field="targetDate" data-chapter="${row.meta.id}"></td>
        <td><button type="button" class="btn btn-small" data-action="clear-backlog" data-chapter="${row.meta.id}">Clear</button></td>
      </tr>`).join("")}</tbody>
    </table></div>` : emptyBlock("Backlog is clear", "Every chapter in this view has the backlog stage ticked.")}`;
}

export function revisionPage() {
  const state = getData();
  const today = todayISO();
  const filter = ui.filters.revision;
  const rows = scoped().map((meta) => {
    const chapter = getChapter(state, meta.id);
    return { meta, chapter, revision: revisionStatus(chapter, today) };
  }).filter((row) => {
    if (filter.status === "none") return row.chapter.revisions.length === 0;
    return filter.status === "all" || row.revision.status === filter.status;
  })
    .filter((row) => !filter.q || `${row.meta.title} ${row.meta.no}`.toLowerCase().includes(filter.q))
    .sort((a, b) => revRank(a.revision.status) - revRank(b.revision.status) || String(a.chapter.nextRevision || "9999").localeCompare(String(b.chapter.nextRevision || "9999")) || b.chapter.revisions.length - a.chapter.revisions.length);

  return `<header class="page-head">
      <div>
        <p class="eyebrow">${esc(yearLabel(ui.year))} · ${esc(formatLong(today))}</p>
        <h1>Revision</h1>
        <p class="lede">Log a pass every time you revise a chapter. The history keeps every date, with no limit at two. The first pass sets the next date 7 days out. Every pass after that sets it 21 days out.</p>
      </div>
    </header>
    <div class="toolbar">
      <select data-action="ui-filter" data-group="revision" data-key="status">${optionList(REV, filter.status)}</select>
      <input type="search" placeholder="Search chapters" value="${esc(filter.q)}" data-action="ui-search" data-group="revision">
    </div>
    ${rows.length ? `<div class="table-scroll"><table class="sheet sheet-loose">
      <thead><tr><th class="sticky">Chapter</th><th>Times</th><th>Last revision</th><th>History</th><th>Next revision</th><th></th></tr></thead>
      <tbody>${rows.map((row) => `<tr class="${row.revision.status === "due" ? "is-due" : ""}">
        <th class="sticky">${chapterLink(row.meta)}<br><span class="pill" data-tone="${tone(row.revision.status)}">${esc(row.revision.label)}</span></th>
        <td class="rev-count">${row.chapter.revisions.length}</td>
        <td>${esc(formatLong(latestRevisionAt(row.chapter)))}</td>
        <td>${historyList(row.chapter, row.meta.id)}</td>
        <td><input type="date" value="${esc(row.chapter.nextRevision || "")}" data-bind="chapter" data-field="nextRevision" data-chapter="${row.meta.id}"></td>
        <td><div class="rev-add"><input class="rev-date" type="date" value="${today}" data-revision-date aria-label="Date revised ${esc(row.meta.title)}"><button type="button" class="btn btn-small" data-action="revision-add" data-chapter="${row.meta.id}">Log</button></div></td>
      </tr>`).join("")}</tbody>
    </table></div>` : emptyBlock("Nothing in this filter", "Change the status filter or widen the year.")}`;
}

function historyList(chapter, chapterId) {
  const items = chapter.revisions || [];
  if (!items.length) return `<span class="muted">None yet</span>`;
  return `<ol class="rev-list">${items.map((item, index) => `<li><span><b>${index + 1}</b> ${esc(formatLong(item.at))}</span><button type="button" class="text-btn" data-action="revision-remove" data-chapter="${chapterId}" data-revision="${esc(item.id)}">Remove</button></li>`).join("")}</ol>`;
}

function rank(priority) {
  if (priority === "high") return 0;
  if (priority === "low") return 2;
  return 1;
}

function revRank(status) {
  if (status === "due") return 0;
  if (status === "upcoming") return 1;
  if (status === "not_set") return 2;
  return 3;
}

function tone(status) {
  if (status === "due") return "red";
  if (status === "completed") return "green";
  if (status === "upcoming") return "blue";
  return "muted";
}
