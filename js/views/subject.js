import { BLURBS, selectChapters, subjectById } from "../syllabus.js";
import { STAGES, chapterProgress, getChapter, isWeak, todayISO } from "../engine.js";

const GRID_STAGES = STAGES.filter((stage) => stage.id !== "r1" && stage.id !== "r2");
const SHEET_COLUMNS = 15;
import { fileBlock } from "../files.js";
import { getData, ui } from "../store.js";
import { bar, esc, formatLong, optionList, pct, statusPill, yearLabel } from "../format.js";
import { emptyBlock } from "./bits.js";

export function subjectPage(current) {
  const year = Number(current.parts[1]);
  const subject = subjectById(current.parts[2]);
  if (!subject || (year !== 11 && year !== 12)) {
    return emptyBlock("No such subject", "Pick a subject from the sidebar.");
  }

  const state = getData();
  const today = todayISO();
  const chapters = selectChapters({ year, subjectId: subject.id });
  const core = chapters.filter((chapter) => chapter.core);
  const rows = chapters.map((meta) => ({
    meta,
    chapter: getChapter(state, meta.id),
    progress: chapterProgress(getChapter(state, meta.id)),
  }));
  const summary = summarizeLocal(rows);
  const query = (ui.subjectQuery || "").trim().toLowerCase();
  const groups = group(chapters);

  return `<header class="page-head">
      <div>
        <p class="eyebrow">${esc(yearLabel(year))} · ${esc(subject.name)}</p>
        <h1>${esc(subject.short)}</h1>
        <p class="lede">${esc(BLURBS[`${year}-${subject.id}`] || "")} ${core.length !== chapters.length ? `${core.length} textbook units are counted apart from language study.` : ""}</p>
      </div>
      <div class="head-side head-stats">
        <div><span>Raw</span><strong>${pct(summary.raw)}</strong></div>
        <div><span>Ready</span><strong>${pct(summary.weighted)}</strong></div>
        <div><span>Accuracy</span><strong>${pct(summary.accuracy)}</strong></div>
      </div>
    </header>
    <section class="kpi-grid subject-kpis" aria-label="Chapter progress">
      ${kpi("Complete", String(summary.complete))}
      ${kpi("In progress", String(summary.progress))}
      ${kpi("Not started", String(summary.notStarted))}
      ${kpi("Remaining", pct(1 - summary.raw))}
    </section>
    <section class="stage-board" aria-label="Stages">
      <div class="panel-head">
        <h2>Stages</h2>
        <span class="muted">Share of chapters with the stage done</span>
      </div>
      <div class="stage-cards">${STAGES.map((stage) => {
        const ratio = rows.length ? rows.filter((row) => row.chapter.stages[stage.id]).length / rows.length : 0;
        const note = stage.id === "r1" || stage.id === "r2" ? "The first two revisions count toward readiness. Later passes stay in the history." : `Weight ${stage.weight}`;
        return `<article title="${esc(note)}"><span>${esc(stageName(stage))}</span><strong>${pct(ratio)}</strong>${bar(ratio)}</article>`;
      }).join("")}</div>
    </section>
    <div class="toolbar">
      <label class="search"><span class="sr-only">Filter chapters</span>
        <input id="chapter-filter" type="search" placeholder="Filter chapters" value="${esc(ui.subjectQuery)}" data-action="filter-chapters">
      </label>
      <p class="muted legend">Raw is stages ÷ 10. The first two revisions count toward readiness. Every later pass is kept in the history.</p>
    </div>
    <div class="table-scroll">
      <table class="sheet">
        <thead>
          <tr>
            <th class="sticky">Chapter</th>
            ${GRID_STAGES.map((stage) => `<th title="${esc(stage.label)}">${esc(stage.short)}</th>`).join("")}
            <th title="How many times this chapter was revised">Rev</th>
            <th>Att</th><th>Correct</th><th>Acc</th><th>Done</th><th>Status</th>
          </tr>
        </thead>
        ${groups.map((group) => `<tbody data-section>
          ${group.section ? `<tr class="section-row"><th colspan="${SHEET_COLUMNS}">${esc(group.section)}</th></tr>` : ""}
          ${group.chapters.map((meta) => chapterRows(meta, state, today, query)).join("")}
        </tbody>`).join("")}
      </table>
    </div>`;
}

function kpi(label, value) {
  return `<article class="kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;
}

function stageName(stage) {
  if (stage.id === "pyq") return "Previous year questions";
  return stage.label;
}

function summarizeLocal(rows) {
  const n = rows.length || 1;
  const raw = rows.reduce((sum, row) => sum + row.progress.raw, 0) / (rows.length || 1);
  const weighted = rows.reduce((sum, row) => sum + row.progress.weighted, 0) / (rows.length || 1);
  const attempted = rows.reduce((sum, row) => sum + row.chapter.attempted, 0);
  const correct = rows.reduce((sum, row) => sum + row.chapter.correct, 0);
  return {
    raw: rows.length ? raw : 0,
    weighted: rows.length ? weighted : 0,
    complete: rows.filter((row) => row.progress.status === "complete").length,
    progress: rows.filter((row) => row.progress.status === "in_progress").length,
    notStarted: rows.filter((row) => row.progress.status === "not_started").length,
    accuracy: attempted ? correct / attempted : null,
    n,
  };
}

function group(chapters) {
  const groups = [];
  for (const chapter of chapters) {
    const section = chapter.section || "";
    let bucket = groups.find((item) => item.section === section);
    if (!bucket) {
      bucket = { section, chapters: [] };
      groups.push(bucket);
    }
    bucket.chapters.push(chapter);
  }
  return groups;
}

function chapterRows(meta, state, today, query) {
  const chapter = getChapter(state, meta.id);
  const progress = chapterProgress(chapter);
  const weak = isWeak(meta.id, state.tests, state.errors);
  const title = `${meta.no} ${meta.title}`.toLowerCase();
  const hidden = query && !title.includes(query) ? " hidden" : "";
  const open = ui.expanded === meta.id;
  return `<tr data-chapter-row data-title="${esc(title)}" id="ch-${meta.id}"${hidden}>
      <th class="sticky">
        <button type="button" class="chapter-btn" data-action="expand" data-chapter="${meta.id}" aria-expanded="${open}">
          <span class="chevron">${open ? "▾" : "▸"}</span>
          <span class="chap-no">${esc(meta.no)}</span>
          <span>${esc(meta.title)}</span>
        </button>
        ${weak ? `<span class="pill" data-tone="red">Weak</span>` : ""}
      </th>
      ${GRID_STAGES.map((stage) => `<td><label class="tick"><input type="checkbox" data-action="stage" data-chapter="${meta.id}" data-stage="${stage.id}" ${chapter.stages[stage.id] ? "checked" : ""}><span class="sr-only">${esc(stage.label)} for ${esc(meta.title)}</span></label></td>`).join("")}
      <td class="rev-count" title="${esc((chapter.revisions || []).map((item) => formatLong(item.at)).join(", ") || "No revisions yet")}">${chapter.revisions.length}</td>
      <td><input class="num" type="number" min="0" max="9999" inputmode="numeric" value="${chapter.attempted}" data-bind="chapter" data-field="attempted" data-chapter="${meta.id}" data-render="false"></td>
      <td><input class="num" type="number" min="0" max="9999" inputmode="numeric" value="${chapter.correct}" data-bind="chapter" data-field="correct" data-chapter="${meta.id}" data-render="false"></td>
      <td class="acc" data-tone="${progress.accuracy != null && progress.accuracy < 0.6 ? "bad" : "ok"}">${pct(progress.accuracy)}</td>
      <td class="done"><b>${pct(progress.raw)}</b><small>Ready ${pct(progress.weighted)}</small>${bar(progress.raw)}</td>
      <td>${statusPill(progress.status)}</td>
    </tr>
    ${open ? `<tr class="detail-row" data-chapter-row data-title="${esc(title)}"${hidden}><td colspan="${SHEET_COLUMNS}">${detail(meta, chapter, today)}</td></tr>` : ""}`;
}

function detail(meta, chapter, today) {
  const choices = [["low", "Low"], ["medium", "Medium"], ["high", "High"]];
  const difficulty = [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]];
  return `<div class="detail">
    <label class="field"><span>Difficulty</span><select data-bind="chapter" data-field="difficulty" data-chapter="${meta.id}">${optionList(difficulty, chapter.difficulty)}</select></label>
    <label class="field"><span>Importance</span><select data-bind="chapter" data-field="importance" data-chapter="${meta.id}">${optionList(choices, chapter.importance)}</select></label>
    <label class="field"><span>Exam priority</span><select data-bind="chapter" data-field="priority" data-chapter="${meta.id}">${optionList(choices, chapter.priority)}</select></label>
    <label class="field"><span>Last studied</span><input value="${esc(formatLong(chapter.lastStudied))}" disabled></label>
    <label class="field"><span>Next revision</span><input type="date" value="${esc(chapter.nextRevision || "")}" data-bind="chapter" data-field="nextRevision" data-chapter="${meta.id}"></label>
    <label class="field"><span>Target date</span><input type="date" value="${esc(chapter.targetDate || "")}" data-bind="chapter" data-field="targetDate" data-chapter="${meta.id}"></label>
    <label class="field field-wide"><span>Next action</span><input value="${esc(chapter.nextAction)}" data-bind="chapter" data-field="nextAction" data-chapter="${meta.id}" data-render="false" placeholder="What happens next"></label>
    <label class="field field-wide"><span>Notes</span><textarea rows="4" data-bind="chapter" data-field="notes" data-chapter="${meta.id}" data-render="false" placeholder="Formulas, traps, page numbers">${esc(chapter.notes)}</textarea></label>
    <div class="field field-wide">
      <span>Files</span>
      ${fileBlock(chapter.files, { chapter: meta.id })}
      <small>Images and PDFs. The eye opens a preview. They also show up on Documents. The link is unlisted, not private.</small>
    </div>
    <div class="field field-wide rev-log">
      <span>Revision history · ${chapter.revisions.length} ${chapter.revisions.length === 1 ? "time" : "times"}</span>
      ${chapter.revisions.length ? `<ol class="rev-list">${chapter.revisions.map((item, index) => `<li><span><b>${index + 1}</b> ${esc(formatLong(item.at))}</span><button type="button" class="text-btn" data-action="revision-remove" data-chapter="${meta.id}" data-revision="${esc(item.id)}">Remove</button></li>`).join("")}</ol>` : `<p class="muted">No revisions yet.</p>`}
      <div class="rev-add">
        <input class="rev-date" type="date" value="${today}" data-revision-date aria-label="Date revised">
        <button type="button" class="btn btn-small" data-action="revision-add" data-chapter="${meta.id}">Add revision</button>
      </div>
    </div>
    <p class="muted field-wide">The first revision sets the next date 7 days out. Every revision after that sets it 21 days out. Removing one keeps the next date you set by hand.</p>
  </div>`;
}
