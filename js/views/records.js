import { ERROR_TYPES, TEST_TYPES, selectChapters, subjectById } from "../syllabus.js";
import { buildWeeks, durationMinutes, testRollup, todayISO } from "../engine.js";
import { getData, ui } from "../store.js";
import { columnChart, lineChart, shareBars } from "../charts.js";
import { esc, formatHours, formatLong, optionList, pct, yearLabel } from "../format.js";
import { fileBlock, pendingFileField } from "../files.js";
import { chapterLink, emptyBlock, scoped, subjectList } from "./bits.js";

function subjectSelect(id, selected = "") {
  return `<select id="${id}" name="subjectId" required>${subjectList().map((subject) => `<option value="${subject.id}"${subject.id === selected ? " selected" : ""}>${esc(subject.short)}</option>`).join("")}</select>`;
}

function chapterSelect(id, subjectId) {
  const chapters = selectChapters({ year: ui.year === "all" ? "all" : Number(ui.year), subjectId });
  return `<select id="${id}" name="chapterId" required>${chapters.map((chapter) => `<option value="${chapter.id}">${chapter.year} · ${esc(chapter.no)} ${esc(chapter.title)}</option>`).join("")}</select>`;
}

export function testsPage() {
  const state = getData();
  const today = todayISO();
  const subjectFilter = ui.filters.tests.subject;
  const metas = scoped();
  const rows = state.tests
    .filter((test) => metas.some((meta) => meta.id === test.chapterId) || (subjectFilter === "all" && ui.year === "all"))
    .filter((test) => subjectFilter === "all" || test.subjectId === subjectFilter)
    .filter((test) => ui.year === "all" || !test.chapterId || String(chapterYear(test.chapterId)) === String(ui.year))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const rollup = testRollup(rows);
  const trend = rows.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-10).filter((test) => test.total > 0);

  return `<header class="page-head">
      <div>
        <p class="eyebrow">${esc(yearLabel(ui.year))}</p>
        <h1>Tests</h1>
        <p class="lede">Average score ${pct(rollup.average)}. Accuracy ${pct(rollup.accuracy)} across ${rollup.attempted} attempted questions.</p>
      </div>
    </header>
    <form class="panel form-grid" data-form="test">
      <label class="field"><span>Date</span><input type="date" name="date" required value="${today}"></label>
      <label class="field"><span>Subject</span>${subjectSelect("test-subject")}</label>
      <label class="field"><span>Chapter</span>${chapterSelect("test-chapter", "m1")}</label>
      <label class="field"><span>Type</span><select name="type">${TEST_TYPES.map((type) => `<option>${esc(type)}</option>`).join("")}</select></label>
      <label class="field"><span>Marks</span><input name="marks" type="number" min="0" step="0.5" required value="0"></label>
      <label class="field"><span>Out of</span><input name="total" type="number" min="1" step="0.5" required value="50"></label>
      <label class="field"><span>Attempted</span><input name="attempted" type="number" min="0" step="1" value="0"></label>
      <label class="field"><span>Correct</span><input name="correct" type="number" min="0" step="1" value="0"></label>
      <label class="field"><span>Retest</span><input name="retestDate" type="date"></label>
      <label class="field"><span>Weak concept</span><input name="weakConcept" maxlength="240"></label>
      <label class="field field-wide"><span>Main mistakes</span><textarea name="mistakes" rows="2"></textarea></label>
      ${pendingFileField("test")}
      <div class="form-actions"><button class="btn btn-primary" type="submit">Add test</button></div>
    </form>
    <div class="toolbar">
      <select data-action="ui-filter" data-group="tests" data-key="subject">${optionList([["all", "All subjects"], ...subjectList().map((subject) => [subject.id, subject.short])], subjectFilter)}</select>
    </div>
    ${trend.length >= 2 ? `<section class="panel">${lineChart(trend.map((test) => ({ y: (test.marks / test.total) * 100, label: `${test.date} ${pct(test.marks / test.total)}`, tick: test.date.slice(5) })), { caption: "Test scores" })}</section>` : ""}
    ${rows.length ? `<div class="table-scroll"><table class="sheet sheet-loose">
      <thead><tr><th>Date</th><th>Chapter</th><th>Type</th><th>Score</th><th>Accuracy</th><th>Retest</th><th></th></tr></thead>
      <tbody>${rows.map((test) => {
        const score = test.total ? test.marks / test.total : null;
        const accuracy = test.attempted ? test.correct / test.attempted : null;
        const meta = chapterMeta(test.chapterId);
        return `<tr class="${test.retestDate && test.retestDate <= today ? "is-due" : ""}">
          <td>${esc(formatLong(test.date))}</td>
          <td>${meta ? chapterLink(meta) : esc(subjectName(test.subjectId))}</td>
          <td>${esc(test.type)}<small class="block">${esc(test.weakConcept || test.mistakes || "")}</small>${fileBlock(test.files, { list: "tests", id: test.id, compact: true })}</td>
          <td>${pct(score)} <small class="muted">${test.marks}/${test.total}</small></td>
          <td class="acc" data-tone="${accuracy != null && accuracy < 0.6 ? "bad" : "ok"}">${pct(accuracy)} <small class="muted">${Math.max(0, test.attempted - test.correct)} wrong</small></td>
          <td>${esc(formatLong(test.retestDate))}</td>
          <td><button type="button" class="text-btn" data-action="delete-row" data-list="tests" data-id="${esc(test.id)}">Delete</button></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>` : emptyBlock("No tests in this view", "Log a chapter test and the trend line will start after the second one.")}`;
}

export function errorsPage() {
  const state = getData();
  const filter = ui.filters.errors;
  const rows = state.errors.filter((error) => {
    if (filter.subject !== "all" && error.subjectId !== filter.subject) return false;
    if (filter.type !== "all" && error.type !== filter.type) return false;
    if (filter.fixed === "open" && error.fixed) return false;
    if (filter.fixed === "fixed" && !error.fixed) return false;
    if (ui.year !== "all" && error.chapterId && String(chapterYear(error.chapterId)) !== String(ui.year)) return false;
    return true;
  });
  const unfixed = rows.filter((error) => !error.fixed).length;
  const counts = ERROR_TYPES.map((type) => ({ label: type, value: rows.filter((error) => error.type === type).length }));

  return `<header class="page-head">
      <div>
        <p class="eyebrow">${esc(yearLabel(ui.year))}</p>
        <h1>Error log</h1>
        <p class="lede">${unfixed} unfixed in this view. Three unfixed errors on one chapter mark it weak.</p>
      </div>
    </header>
    <form class="panel form-grid" data-form="error">
      <label class="field"><span>Date</span><input type="date" name="date" required value="${todayISO()}"></label>
      <label class="field"><span>Subject</span>${subjectSelect("error-subject")}</label>
      <label class="field"><span>Chapter</span>${chapterSelect("error-chapter", "m1")}</label>
      <label class="field"><span>Type</span><select name="type">${ERROR_TYPES.map((type) => `<option>${esc(type)}</option>`).join("")}</select></label>
      <label class="field field-wide"><span>Topic</span><input name="topic" required maxlength="160" placeholder="Which idea broke"></label>
      <label class="field"><span>Why it went wrong</span><textarea name="why" rows="2"></textarea></label>
      <label class="field"><span>Correct concept</span><textarea name="concept" rows="2"></textarea></label>
      <label class="field"><span>Formula</span><input name="formula" maxlength="400"></label>
      <label class="field"><span>Action</span><input name="action" maxlength="400"></label>
      <label class="field"><span>Retest result</span><input name="retestResult" maxlength="160"></label>
      ${pendingFileField("error")}
      <div class="form-actions"><button class="btn btn-primary" type="submit">Add error</button></div>
    </form>
    <div class="toolbar">
      <select data-action="ui-filter" data-group="errors" data-key="subject">${optionList([["all", "All subjects"], ...subjectList().map((subject) => [subject.id, subject.short])], filter.subject)}</select>
      <select data-action="ui-filter" data-group="errors" data-key="type">${optionList([["all", "All types"], ...ERROR_TYPES.map((type) => [type, type])], filter.type)}</select>
      <select data-action="ui-filter" data-group="errors" data-key="fixed">${optionList([["all", "Fixed and open"], ["open", "Unfixed"], ["fixed", "Fixed"]], filter.fixed)}</select>
    </div>
    <section class="panel">${shareBars(counts)}</section>
    ${rows.length ? `<div class="table-scroll"><table class="sheet sheet-loose">
      <thead><tr><th>Date</th><th>Chapter</th><th>Error</th><th>Fix</th><th></th></tr></thead>
      <tbody>${rows.map((error) => {
        const meta = chapterMeta(error.chapterId);
        return `<tr>
          <td>${esc(formatLong(error.date))}</td>
          <td>${meta ? chapterLink(meta) : esc(subjectName(error.subjectId))}</td>
          <td><b>${esc(error.type)}</b> · ${esc(error.topic)}<small class="block">${esc(error.why)}</small><small class="block">${esc(error.concept)}</small>${error.formula ? `<code>${esc(error.formula)}</code>` : ""}${fileBlock(error.files, { list: "errors", id: error.id, compact: true })}</td>
          <td><label class="checkline"><input type="checkbox" data-action="fix-error" data-id="${esc(error.id)}" ${error.fixed ? "checked" : ""}> Fixed</label><small class="block">${esc(error.action)}</small></td>
          <td><button type="button" class="text-btn" data-action="delete-row" data-list="errors" data-id="${esc(error.id)}">Delete</button></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>` : emptyBlock("No errors in this view", "That is either excellent news or a log you have not started.")}`;
}

export function logPage() {
  const state = getData();
  const rows = state.logs.filter((log) => ui.year === "all" || !log.chapterId || String(chapterYear(log.chapterId)) === String(ui.year));
  const minutes = rows.reduce((sum, log) => sum + durationMinutes(log.start, log.end), 0);
  const attempted = rows.reduce((sum, log) => sum + log.attempted, 0);
  const correct = rows.reduce((sum, log) => sum + log.correct, 0);

  return `<header class="page-head">
      <div>
        <p class="eyebrow">${esc(yearLabel(ui.year))}</p>
        <h1>Study log</h1>
        <p class="lede">${rows.length} sessions · ${formatHours(minutes)} · accuracy ${pct(attempted ? correct / attempted : null)}. The focus timer can drop a session in here.</p>
      </div>
    </header>
    <form class="panel form-grid" data-form="log">
      <label class="field"><span>Date</span><input type="date" name="date" required value="${todayISO()}"></label>
      <label class="field"><span>Subject</span>${subjectSelect("log-subject")}</label>
      <label class="field"><span>Chapter</span>${chapterSelect("log-chapter", "m1")}</label>
      <label class="field"><span>Start</span><input id="log-start" name="start" type="time" required value="18:00"></label>
      <label class="field"><span>End</span><input id="log-end" name="end" type="time" required value="19:00"></label>
      <p class="hint" id="log-duration">Duration ${formatHours(durationMinutes("18:00", "19:00"))}. Overnight sessions are counted.</p>
      <label class="field"><span>Attempted</span><input name="attempted" type="number" min="0" step="1" value="0"></label>
      <label class="field"><span>Correct</span><input name="correct" type="number" min="0" step="1" value="0"></label>
      <label class="field"><span>What moved</span><input name="achievement" maxlength="400"></label>
      <label class="field"><span>What stuck</span><input name="problem" maxlength="400"></label>
      <label class="field field-wide"><span>Next action</span><input name="nextAction" maxlength="400"></label>
      ${pendingFileField("log")}
      <div class="form-actions"><button class="btn btn-primary" type="submit">Add session</button></div>
    </form>
    ${rows.length ? `<div class="table-scroll"><table class="sheet sheet-loose">
      <thead><tr><th>Date</th><th>Chapter</th><th>Time</th><th>Questions</th><th>Note</th><th></th></tr></thead>
      <tbody>${rows.map((log) => {
        const meta = chapterMeta(log.chapterId);
        const accuracy = log.attempted ? log.correct / log.attempted : null;
        return `<tr>
          <td>${esc(formatLong(log.date))}</td>
          <td>${meta ? chapterLink(meta) : esc(subjectName(log.subjectId))}</td>
          <td>${esc(log.start)}–${esc(log.end)} <small class="muted">${formatHours(durationMinutes(log.start, log.end))}</small></td>
          <td>${log.correct}/${log.attempted} <small class="muted">${pct(accuracy)}</small></td>
          <td>${esc(log.achievement || log.nextAction || log.problem || "—")}${fileBlock(log.files, { list: "logs", id: log.id, compact: true })}</td>
          <td><button type="button" class="text-btn" data-action="delete-row" data-list="logs" data-id="${esc(log.id)}">Delete</button></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>` : emptyBlock("No sessions yet", "Add one, or start the focus timer in the top bar and log it when you stop.")}`;
}

export function weekPage() {
  const state = getData();
  const today = todayISO();
  const weeks = buildWeeks(scoped(), state, today, 12);
  const current = weeks[weeks.length - 1];
  return `<header class="page-head">
      <div>
        <p class="eyebrow">${esc(yearLabel(ui.year))} · week of ${esc(formatLong(current.start))}</p>
        <h1>This week</h1>
        <p class="lede">${formatHours(current.minutes)} studied · ${current.chaptersDone} chapters finished · ${current.backlogCleared} backlogs cleared · accuracy ${pct(current.accuracy)}.</p>
      </div>
    </header>
    <section class="kpi-grid">
      ${stat("Hours", formatHours(current.minutes))}
      ${stat("Chapters done", String(current.chaptersDone))}
      ${stat("Backlog cleared", String(current.backlogCleared))}
      ${stat("Questions", `${current.correct}/${current.attempted}`)}
      ${stat("Tests", String(current.tests))}
      ${stat("Avg test", pct(current.average))}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Hours, last 12 weeks</h2></div>
      ${columnChart(weeks, { value: (week) => week.minutes / 60, label: (week) => week.start.slice(8) + "/" + week.start.slice(5, 7) })}
    </section>
    <div class="table-scroll"><table class="sheet sheet-loose">
      <thead><tr><th>Week</th><th>Hours</th><th>Done</th><th>Backlog</th><th>Questions</th><th>Accuracy</th><th>Tests</th><th>Avg</th></tr></thead>
      <tbody>${weeks.slice().reverse().map((week) => `<tr>
        <td>${esc(formatLong(week.start))} – ${esc(formatLong(week.finish))}</td>
        <td>${formatHours(week.minutes)}</td>
        <td>${week.chaptersDone}</td>
        <td>${week.backlogCleared}</td>
        <td>${week.correct}/${week.attempted}</td>
        <td>${pct(week.accuracy)}</td>
        <td>${week.tests}</td>
        <td>${pct(week.average)}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
}

export function cardsPage() {
  const state = getData();
  const today = todayISO();
  const subject = ui.filters.cards.subject;
  const all = state.cards.filter((card) => subject === "all" || card.subjectId === subject);
  const due = all.filter((card) => card.due <= today);
  const index = Math.min(ui.cardCursor, Math.max(0, due.length - 1));
  const card = due[index];
  return `<header class="page-head">
      <div>
        <p class="eyebrow">Formulas and concepts</p>
        <h1>Flashcards</h1>
        <p class="lede">${due.length} due today · ${all.length} saved. Again shows it tomorrow. Good waits 1, 3, then 7 days.</p>
      </div>
    </header>
    <div class="toolbar">
      <select data-action="ui-filter" data-group="cards" data-key="subject">${optionList([["all", "All subjects"], ...subjectList().map((item) => [item.id, item.short])], subject)}</select>
    </div>
    <section class="panel reviewer">
      ${card ? `<p class="eyebrow">Card ${index + 1} of ${due.length}${card.chapterId ? ` · ${esc(chapterTitle(card.chapterId))}` : ""}</p>
        <div class="card-face">${esc(card.front)}</div>
        ${ui.cardReveal ? `<div class="card-back">${esc(card.back)}</div>
          <div class="form-actions">
            <button type="button" class="btn" data-action="grade-card" data-id="${esc(card.id)}" data-grade="again">Again</button>
            <button type="button" class="btn btn-primary" data-action="grade-card" data-id="${esc(card.id)}" data-grade="good">Good</button>
          </div>` : `<button type="button" class="btn btn-primary" data-action="reveal-card">Show answer</button>`}` : emptyBlock("Nothing due", "Add a formula below, or enjoy the empty queue.")}
    </section>
    <form class="panel form-grid" data-form="card">
      <label class="field"><span>Subject</span><select id="card-subject" name="subjectId"><option value="">None</option>${subjectList().map((item) => `<option value="${item.id}">${esc(item.short)}</option>`).join("")}</select></label>
      <label class="field"><span>Chapter</span><select name="chapterId" id="card-chapter"><option value="">None</option>${selectChapters({ year: ui.year === "all" ? "all" : Number(ui.year), subjectId: "m1" }).map((chapter) => `<option value="${chapter.id}">${esc(chapter.no)} ${esc(chapter.title)}</option>`).join("")}</select></label>
      <label class="field"><span>Front</span><textarea name="front" required rows="2" placeholder="Formula or question"></textarea></label>
      <label class="field"><span>Back</span><textarea name="back" required rows="2" placeholder="Meaning"></textarea></label>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Add card</button></div>
    </form>
    ${all.length ? `<ul class="card-index">${all.map((item) => `<li><b>${esc(item.front)}</b><small>due ${esc(formatLong(item.due))} · box ${item.box}</small><button type="button" class="text-btn" data-action="delete-row" data-list="cards" data-id="${esc(item.id)}">Delete</button></li>`).join("")}</ul>` : ""}`;
}

export function mocksPage() {
  const state = getData();
  const rows = state.mocks.slice().sort((a, b) => a.date.localeCompare(b.date));
  const latest = rows[rows.length - 1];
  return `<header class="page-head">
      <div>
        <p class="eyebrow">MHT-CET</p>
        <h1>${latest ? `${latest.percentile} percentile` : "No mocks yet"}</h1>
        <p class="lede">Percentile is the number that moves a rank. Marks are kept so you can still see the paper.</p>
      </div>
    </header>
    <form class="panel form-grid" data-form="mock">
      <label class="field"><span>Date</span><input type="date" name="date" required value="${todayISO()}"></label>
      <label class="field"><span>Name</span><input name="name" maxlength="80" placeholder="Coaching mock 4" required></label>
      <label class="field"><span>Percentile</span><input name="percentile" type="number" min="0" max="100" step="0.01" required></label>
      <label class="field"><span>Score</span><input name="score" type="number" min="0" step="0.5" value="0"></label>
      <label class="field"><span>Out of</span><input name="total" type="number" min="0" step="0.5" value="200"></label>
      <label class="field field-wide"><span>Note</span><input name="note" maxlength="400"></label>
      ${pendingFileField("mock")}
      <div class="form-actions"><button class="btn btn-primary" type="submit">Add mock</button></div>
    </form>
    ${rows.length >= 2 ? `<section class="panel">${lineChart(rows.map((mock) => ({ y: mock.percentile, label: `${mock.date} ${mock.percentile}`, tick: mock.date.slice(5) })), { caption: "Percentile trend" })}</section>` : ""}
    ${rows.length ? `<div class="table-scroll"><table class="sheet sheet-loose">
      <thead><tr><th>Date</th><th>Mock</th><th>Percentile</th><th>Score</th><th></th></tr></thead>
      <tbody>${rows.slice().reverse().map((mock) => `<tr>
        <td>${esc(formatLong(mock.date))}</td>
        <td>${esc(mock.name)}<small class="block">${esc(mock.note)}</small>${fileBlock(mock.files, { list: "mocks", id: mock.id, compact: true })}</td>
        <td><strong>${mock.percentile}</strong></td>
        <td>${mock.total ? `${mock.score}/${mock.total}` : esc(String(mock.score))}</td>
        <td><button type="button" class="text-btn" data-action="delete-row" data-list="mocks" data-id="${esc(mock.id)}">Delete</button></td>
      </tr>`).join("")}</tbody>
    </table></div>` : emptyBlock("Log the first mock", "Even a disappointing percentile is useful once the second one shows the slope.")}`;
}

function stat(label, value) {
  return `<article class="kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;
}

function chapterMeta(id) {
  return selectChapters().find((chapter) => chapter.id === id) || null;
}

function chapterYear(id) {
  return chapterMeta(id)?.year || "";
}

function chapterTitle(id) {
  const meta = chapterMeta(id);
  return meta ? `${meta.no} ${meta.title}` : "";
}

function subjectName(id) {
  return subjectById(id)?.short || "Subject";
}
