import { subjectById } from "../syllabus.js";
import {
  buildTodayPlan,
  chapterProgress,
  daysUntil,
  getChapter,
  isWeak,
  retestsDue,
  revisionStatus,
  STAGES,
  streakInfo,
  summarize,
  testRollup,
  todayISO,
} from "../engine.js";
import { getData, getUser, ui } from "../store.js";
import { bar, esc, formatHours, formatLong, greeting, pct, pill, weekdayLetter, yearLabel } from "../format.js";
import { chapterLink, emptyBlock, scoped } from "./bits.js";

function backupLine(settings, today) {
  if (!settings.lastExportAt) {
    return `<p class="notice">No backup yet. <a href="#/settings">Export a copy</a> so a browser reset cannot take the ledger with it.</p>`;
  }
  const exported = String(settings.lastExportAt).slice(0, 10);
  const age = -daysUntil(exported, today);
  if (age >= 7) {
    return `<p class="notice">Last export was ${age} days ago. <a href="#/settings">Download a fresh backup</a>.</p>`;
  }
  return "";
}

function countdown(label, iso, today) {
  if (!iso) return "";
  const days = daysUntil(iso, today);
  if (days == null) return "";
  const text = days > 0 ? `${days} day${days === 1 ? "" : "s"}` : days === 0 ? "Today" : `${Math.abs(days)} days ago`;
  return `<div class="count"><span>${esc(label)}</span><strong>${text}</strong></div>`;
}

function planList(plan) {
  if (!plan.length) {
    return emptyBlock("Nothing queued", "Every chapter in this view is complete. Widen the year filter if that seems unlikely.");
  }
  return `<ol class="plan-list">${plan.map((item, index) => `
    <li>
      <span class="plan-index">${index + 1}</span>
      <div>
        <div class="plan-title">${chapterLink(item.meta)}</div>
        <p>${esc(item.reason)} · ${pct(item.progress.raw)} raw · ${pct(item.progress.weighted)} ready</p>
      </div>
      ${pill(item.reason === "Weak topic" ? "Weak" : item.chapter.priority === "high" ? "High" : "Next", item.weak ? "red" : "muted")}
    </li>`).join("")}</ol>`;
}

function attentionList(rows, emptyText) {
  if (!rows.length) return `<p class="muted">${esc(emptyText)}</p>`;
  return `<ul class="plain">${rows.map((row) => `<li>${chapterLink(row.meta)} <span class="muted">${pct(row.progress.raw)}</span></li>`).join("")}</ul>`;
}

export function dashboardPage() {
  const state = getData();
  const today = todayISO();
  const metas = scoped();
  const summary = summarize(metas, state);
  const streak = streakInfo(state.logs, state.settings, today);
  const plan = buildTodayPlan(metas, state, today, 5);
  const progress = streak.progress;
  const hoursRatio = progress.hoursTarget ? Math.min(1, progress.minutes / (progress.hoursTarget * 60)) : 0;
  const questionRatio = progress.questionsTarget ? Math.min(1, progress.questions / progress.questionsTarget) : 0;
  const chapterRatio = progress.chaptersTarget ? Math.min(1, progress.chapters / progress.chaptersTarget) : 0;

  const rows = metas.map((meta) => {
    const chapter = getChapter(state, meta.id);
    return {
      meta,
      chapter,
      progress: chapterProgress(chapter),
      weak: isWeak(meta.id, state.tests, state.errors),
    };
  });
  const high = rows.filter((row) => row.chapter.priority === "high" && row.progress.status === "not_started").slice(0, 5);
  const backlog = rows
    .filter((row) => !row.chapter.stages.bl)
    .sort((a, b) => rank(a.chapter.priority) - rank(b.chapter.priority) || a.progress.raw - b.progress.raw)
    .slice(0, 5);
  const due = rows.filter((row) => revisionStatus(row.chapter, today).status === "due").slice(0, 5);
  const weak = rows.filter((row) => row.weak).slice(0, 8);
  const retests = retestsDue(state.tests, today).slice(0, 4);

  const kpis = [
    ["Overall completion", pct(summary.raw), "Every stage, equal weight"],
    ["Remaining", pct(1 - summary.raw), "Still open"],
    ["Chapters complete", String(summary.complete), `of ${summary.n}`],
    ["In progress", String(summary.progress), "One to nine stages"],
    ["Not started", String(summary.notStarted), "No stage ticked"],
    ["PYQ completion", pct(summary.pyq), "Chapters with PYQs done"],
    ["Revision completion", pct(summary.revision), "Revision 1 and 2"],
    ["Test completion", pct(summary.test), "Test stage ticked"],
    ["Practice completion", pct(summary.practice), "Module and solved book"],
    ["Question accuracy", pct(summary.accuracy), summary.attempted ? `${summary.correct}/${summary.attempted}` : "No questions yet"],
  ];

  const subjects = ["m1", "m2", "phy", "chem", "cs1", "cs2", "eng"].map((id) => {
    const subject = subjectById(id);
    const subjectSummary = summarize(scoped({ subjectId: id }), state);
    return { subject, summary: subjectSummary };
  });

  return `<header class="page-head">
      <div>
        <p class="eyebrow">${esc(yearLabel(ui.year))} · ${esc(formatLong(today))}</p>
        <h1>${esc(greeting(getUser()?.name))}</h1>
        <p class="lede">Exam readiness counts PYQs, both revisions, the test, and mistake analysis three times as much as theory, backlog, or a solved book.</p>
      </div>
      <div class="head-side">
        <div class="counts">
          ${countdown(state.settings.examLabel, state.settings.examDate, today)}
          ${countdown(state.settings.secondExamLabel, state.settings.secondExamDate, today)}
        </div>
        <div class="streak">
          <div><span>Streak</span><strong>${streak.streak}</strong></div>
          <div class="strip" aria-label="Last seven days">${streak.strip.map((day) => `<i class="${day.hit ? "is-hit" : ""} ${day.isToday ? "is-today" : ""}" title="${esc(formatLong(day.date))}${day.hit ? " · target met" : ""}">${esc(weekdayLetter(day.date))}</i>`).join("")}</div>
        </div>
      </div>
    </header>
    ${backupLine(state.settings, today)}
    <section class="hero">
      <article class="panel ring-card">
        <p class="eyebrow">Exam readiness</p>
        <div class="ring-wrap">
          ${ring(summary.weighted)}
          <div><strong>${pct(summary.weighted)}</strong><span>Weighted</span></div>
        </div>
        <dl class="ring-stats">
          <div><dt>Raw completion</dt><dd>${pct(summary.raw)}</dd></div>
          <div><dt>Chapters done</dt><dd>${summary.complete}/${summary.n}</dd></div>
          <div><dt>Today</dt><dd>${streak.todayHit ? "Target met" : "In progress"}</dd></div>
        </dl>
        <div class="today-targets">
          <div><span>Hours ${formatHours(progress.minutes)} / ${progress.hoursTarget}h</span>${bar(hoursRatio)}</div>
          <div><span>Questions ${progress.questions} / ${progress.questionsTarget}</span>${bar(questionRatio)}</div>
          <div><span>Chapters ${progress.chapters} / ${progress.chaptersTarget}</span>${bar(chapterRatio)}</div>
        </div>
      </article>
      <article class="panel plan-card">
        <div class="panel-head"><h2>Today’s plan</h2><a href="#/revision">Revision</a></div>
        ${planList(plan)}
      </article>
    </section>
    <section class="kpi-grid">${kpis.map(([label, value, note]) => `<article class="kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join("")}</section>
    <section class="panel">
      <div class="panel-head"><h2>Subjects</h2><span class="muted">${esc(yearLabel(ui.year))}</span></div>
      <div class="subject-bars">${subjects.map(({ subject, summary: item }) => {
        const links = ui.year === "all"
          ? `<span class="year-links"><a href="#/subject/11/${subject.id}">11</a><a href="#/subject/12/${subject.id}">12</a></span>`
          : `<a class="year-links" href="#/subject/${ui.year}/${subject.id}">Open</a>`;
        return `<div class="subject-bar">
          <span class="mark">${esc(subject.mark)}</span>
          <span class="subject-copy"><b>${esc(subject.short)}</b><small>${item.complete}/${item.n} complete · ready ${pct(item.weighted)}</small>${bar(item.raw)}</span>
          <strong>${pct(item.raw)}</strong>
          ${links}
        </div>`;
      }).join("")}</div>
    </section>
    <section class="split-3">
      <article class="panel"><h2>High priority, not started</h2>${attentionList(high, "Nothing high priority is untouched.")}</article>
      <article class="panel"><h2>Backlog pending</h2>${attentionList(backlog, "Backlog is clear for this view.")}<p class="more"><a href="#/backlog">Open backlog</a></p></article>
      <article class="panel"><h2>Revision due</h2>${attentionList(due, "No revision is due.")}</article>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Stages</h2><span class="muted">Share of chapters with the stage ticked</span></div>
      <div class="stage-grid">${STAGES.map((stage) => {
        const ratio = summary.n ? summary.stageTicks[stage.id] / summary.n : 0;
        return `<div><span>${esc(stage.short)} <small>${esc(stage.label)}</small></span>${bar(ratio)}<b>${pct(ratio)}</b></div>`;
      }).join("")}</div>
    </section>
    ${weak.length ? `<section class="panel"><div class="panel-head"><h2>Weak topics</h2><span class="muted">Test accuracy under 60%, or three unfixed errors</span></div><div class="chip-row">${weak.map((row) => chapterLink(row.meta)).join("")}</div></section>` : ""}
    ${retests.length ? `<section class="panel"><div class="panel-head"><h2>Retests due</h2><a href="#/tests">Test log</a></div><ul class="plain">${retests.map((test) => `<li>${esc(formatLong(test.retestDate))} · ${esc(test.type)} · ${esc(test.weakConcept || "Retest")}</li>`).join("")}</ul></section>` : ""}`;
}

function rank(priority) {
  if (priority === "high") return 0;
  if (priority === "low") return 2;
  return 1;
}

function ring(ratio) {
  const value = Math.max(0, Math.min(1, ratio || 0));
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - value);
  return `<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
    <circle class="ring-track" cx="60" cy="60" r="${radius}"></circle>
    <circle class="ring-value" cx="60" cy="60" r="${radius}" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
  </svg>`;
}

export function pcmPage() {
  const state = getData();
  const all = scoped({ pcm: true });
  const blocks = [
    ["Mathematics", all.filter((chapter) => subjectById(chapter.subjectId)?.math), "Part 1 and Part 2 together."],
    ["Physics", all.filter((chapter) => chapter.subjectId === "phy"), ""],
    ["Chemistry", all.filter((chapter) => chapter.subjectId === "chem"), ""],
  ];
  const overall = summarize(all, state);
  const overallTests = testRollup(state.tests.filter((test) => all.some((chapter) => chapter.id === test.chapterId)));

  return `<header class="page-head">
      <div>
        <p class="eyebrow">PCM · ${esc(yearLabel(ui.year))}</p>
        <h1>${pct(overall.weighted)} ready</h1>
        <p class="lede">${all.length} chapters. Raw completion ${pct(overall.raw)}. This is the number that matters for CET, with English and computer science left on the main dashboard.</p>
      </div>
    </header>
    <section class="kpi-grid">
      ${mini("Backlog cleared", pct(overall.backlog))}
      ${mini("Practice", pct(overall.practice))}
      ${mini("PYQs", pct(overall.pyq))}
      ${mini("Revision", pct(overall.revision))}
      ${mini("Tests stage", pct(overall.test))}
      ${mini("Test accuracy", pct(overallTests.accuracy), overallTests.count ? `${overallTests.count} logged` : "No tests logged")}
    </section>
    <section class="split-3 pcm-blocks">${blocks.map(([title, metas, note]) => block(title, metas, note, state)).join("")}</section>`;
}

function mini(label, value, note = "") {
  return `<article class="kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ""}</article>`;
}

function block(title, metas, note, state) {
  const summary = summarize(metas, state);
  const tests = testRollup(state.tests.filter((test) => metas.some((chapter) => chapter.id === test.chapterId)));
  const lines = [
    ["Completion", summary.raw],
    ["Readiness", summary.weighted],
    ["Backlog", summary.backlog],
    ["Practice", summary.practice],
    ["PYQs", summary.pyq],
    ["Revision", summary.revision],
    ["Tests", summary.test],
  ];
  return `<article class="panel">
    <div class="panel-head"><h2>${esc(title)}</h2><span class="muted">${summary.complete}/${summary.n}</span></div>
    ${note ? `<p class="muted">${esc(note)}</p>` : ""}
    <div class="metric-list">${lines.map(([label, ratio]) => `<div><span>${esc(label)}</span>${bar(ratio)}<b>${pct(ratio)}</b></div>`).join("")}</div>
    <p class="metric-foot">Logged test accuracy <strong>${pct(tests.accuracy)}</strong>${tests.average == null ? "" : ` · average score ${pct(tests.average)}`}</p>
  </article>`;
}
