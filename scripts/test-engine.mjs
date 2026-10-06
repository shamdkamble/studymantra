import test from "node:test";
import assert from "node:assert/strict";
import { CHAPTERS, selectChapters, subjectById } from "../js/syllabus.js";
import {
  STAGES,
  STAGE_WEIGHT_TOTAL,
  addDays,
  addRevision,
  applyStageToggle,
  buildTodayPlan,
  buildWeeks,
  chapterProgress,
  dayHit,
  defaultState,
  durationMinutes,
  emptyChapter,
  isWeak,
  removeRevision,
  revisionStatus,
  listDocuments,
  sanitizeChapter,
  sanitizeState,
  streakInfo,
  summarize,
  testRollup,
  weekStart,
} from "../js/engine.js";

function count(year, subjectId, core = null) {
  return selectChapters({ year, subjectId, core }).length;
}

test("syllabus counts match the 2026-27 ledger", () => {
  assert.equal(count(11, "m1"), 9);
  assert.equal(count(11, "m2"), 9);
  assert.equal(count(11, "phy"), 14);
  assert.equal(count(11, "chem"), 16);
  assert.equal(count(11, "cs1"), 5);
  assert.equal(count(11, "cs2"), 4);
  assert.equal(count(11, "eng", true), 22);
  assert.equal(count(11, "eng", false), 3);
  assert.equal(count(12, "m1"), 7);
  assert.equal(count(12, "m2"), 8);
  assert.equal(count(12, "phy"), 16);
  assert.equal(count(12, "chem"), 16);
  assert.equal(count(12, "cs1"), 4);
  assert.equal(count(12, "cs2"), 5);
  assert.equal(count(12, "eng", true), 26);
  assert.equal(selectChapters({ pcm: true }).length, 95);
  assert.equal(selectChapters({ year: 11, pcm: true }).length, 48);
  assert.equal(selectChapters({ year: 12, pcm: true }).length, 47);
  assert.equal(new Set(CHAPTERS.map((chapter) => chapter.id)).size, CHAPTERS.length);
  assert.equal(CHAPTERS.some((chapter) => chapter.id.includes(".")), false);
  assert.equal(subjectById("phy").pcm, true);
  assert.equal(CHAPTERS.find((chapter) => chapter.id === "12-chem-16").title, "Green Chemistry and Nanochemistry");
  assert.equal(CHAPTERS.find((chapter) => chapter.id === "12-m1-06").title, "Line and Plane");
});

test("stage weights sum to 10 and raw vs readiness diverge", () => {
  assert.equal(STAGES.length, 10);
  assert.equal(STAGE_WEIGHT_TOTAL, 10);
  const theory = emptyChapter();
  theory.stages.th = true;
  assert.equal(chapterProgress(theory).raw, 0.1);
  assert.equal(chapterProgress(theory).weighted, 0.05);
  assert.equal(chapterProgress(theory).status, "in_progress");

  const pyq = emptyChapter();
  pyq.stages.pyq = true;
  assert.equal(chapterProgress(pyq).weighted, 0.15);

  const done = emptyChapter();
  for (const stage of STAGES) done.stages[stage.id] = true;
  const score = chapterProgress(done);
  assert.equal(score.status, "complete");
  assert.equal(score.raw, 1);
  assert.equal(score.weighted, 1);
  assert.equal(chapterProgress(emptyChapter()).status, "not_started");
  assert.equal(chapterProgress(emptyChapter()).accuracy, null);
});

test("stage toggles stamp backlog, final, and spaced revision", () => {
  const today = "2026-10-05";
  let chapter = emptyChapter();
  chapter = applyStageToggle(chapter, "bl", true, today);
  assert.equal(chapter.backlogClearedAt, today);
  assert.equal(chapter.lastStudied, today);
  chapter = applyStageToggle(chapter, "bl", false, today);
  assert.equal(chapter.backlogClearedAt, null);

  chapter = applyStageToggle(chapter, "r1", true, today);
  assert.equal(chapter.revisions.length, 1);
  assert.equal(chapter.rev1At, today);
  assert.equal(chapter.stages.r1, true);
  assert.equal(chapter.nextRevision, "2026-10-12");
  chapter = applyStageToggle(chapter, "r2", true, "2026-10-31");
  assert.equal(chapter.revisions.length, 2);
  assert.equal(chapter.rev2At, "2026-10-31");
  assert.equal(chapter.nextRevision, "2026-11-21");
  chapter = addRevision(chapter, "2026-11-02");
  assert.equal(chapter.revisions.length, 3);
  assert.equal(chapter.revisions[2].at, "2026-11-02");
  assert.equal(chapter.stages.r2, true);
  assert.equal(chapter.nextRevision, "2026-11-23");
  chapter = addRevision(chapter, "2026-09-01");
  assert.equal(chapter.revisions[0].at, "2026-09-01");
  assert.equal(chapter.rev1At, "2026-09-01");
  assert.equal(chapter.nextRevision, "2026-11-23");
  chapter = addRevision(chapter, "2026-11-02");
  assert.equal(chapter.revisions.length, 5);
  chapter = removeRevision(chapter, chapter.revisions[0].id);
  assert.equal(chapter.revisions.length, 4);
  assert.equal(chapter.revisions[0].at, today);
  chapter = applyStageToggle(chapter, "fin", true, today);
  assert.equal(chapter.completedAt, today);

  assert.equal(revisionStatus(chapter, today).status, "upcoming");
  const due = emptyChapter();
  due.nextRevision = "2026-10-01";
  assert.equal(revisionStatus(due, today).status, "due");
  const upcoming = emptyChapter();
  upcoming.nextRevision = "2026-10-20";
  assert.equal(revisionStatus(upcoming, today).status, "upcoming");
  assert.equal(revisionStatus(emptyChapter(), today).status, "not_set");

  const legacy = sanitizeChapter({ stages: { r1: true, r2: true }, rev1At: "2026-09-01", rev2At: "2026-09-20" });
  assert.equal(legacy.revisions.length, 2);
  assert.equal(legacy.revisions[0].at, "2026-09-01");
  assert.equal(legacy.stages.r1, true);
  let capped = emptyChapter();
  for (let i = 0; i < 205; i += 1) capped = addRevision(capped, "2026-10-05");
  assert.equal(capped.revisions.length, 200);
});

test("weak topics come from pooled test accuracy or unfixed errors", () => {
  assert.equal(isWeak("11-phy-01", [
    { chapterId: "11-phy-01", attempted: 10, correct: 8 },
    { chapterId: "11-phy-01", attempted: 10, correct: 2 },
  ], []), true);
  assert.equal(isWeak("11-phy-01", [
    { chapterId: "11-phy-01", attempted: 10, correct: 9 },
  ], []), false);
  assert.equal(isWeak("11-phy-01", [], [
    { chapterId: "11-phy-01", fixed: false },
    { chapterId: "11-phy-01", fixed: false },
    { chapterId: "11-phy-01", fixed: true },
  ]), false);
  assert.equal(isWeak("11-phy-01", [], [
    { chapterId: "11-phy-01", fixed: false },
    { chapterId: "11-phy-01", fixed: false },
    { chapterId: "11-phy-01", fixed: false },
  ]), true);
});

test("summaries protect empty cohorts", () => {
  const empty = summarize([], defaultState());
  assert.equal(empty.raw, 0);
  assert.equal(empty.accuracy, null);
  assert.equal(empty.n, 0);
  const state = defaultState();
  state.chapters["11-phy-04"] = applyStageToggle(emptyChapter(), "pyq", true, "2026-10-05");
  state.chapters["11-phy-04"].attempted = 4;
  state.chapters["11-phy-04"].correct = 9;
  const summary = summarize(selectChapters({ year: 11, subjectId: "phy" }), sanitizeState(state));
  assert.equal(summary.n, 14);
  assert.equal(summary.accuracy, 1);
});

test("duration handles overnight sessions and rejects junk", () => {
  assert.equal(durationMinutes("23:30", "01:00"), 90);
  assert.equal(durationMinutes("10:00", "11:15"), 75);
  assert.equal(durationMinutes("10:00", ""), 0);
});

test("streak counts a closed day only when every target is met", () => {
  const settings = { dailyHours: 1, dailyQuestions: 10, dailyChapters: 1 };
  const log = (date) => ({
    date,
    chapterId: "11-phy-01",
    start: "10:00",
    end: "11:00",
    attempted: 10,
  });
  const today = "2026-10-05";
  const info = streakInfo([log("2026-10-04"), log("2026-10-03")], settings, today);
  assert.equal(info.todayHit, false);
  assert.equal(info.streak, 2);
  assert.equal(info.strip.length, 7);
  assert.equal(dayHit("2026-10-04", [{ ...log("2026-10-04"), attempted: 3 }], settings), false);
  const hitToday = streakInfo([log(today), log("2026-10-04")], settings, today);
  assert.equal(hitToday.streak, 2);
  assert.equal(hitToday.todayHit, true);
});

test("weeks start on Monday and roll session stats", () => {
  const start = weekStart("2026-10-05");
  const [y, m, d] = start.split("-").map(Number);
  assert.equal(new Date(y, m - 1, d).getDay(), 1);
  assert.ok(start <= "2026-10-05");
  assert.ok(addDays(start, 6) >= "2026-10-05");

  const state = defaultState();
  state.logs.push({
    id: "l1",
    date: "2026-10-05",
    subjectId: "phy",
    chapterId: "11-phy-01",
    start: "18:00",
    end: "19:30",
    attempted: 20,
    correct: 15,
  });
  state.tests.push({
    id: "t1",
    date: "2026-10-05",
    subjectId: "phy",
    chapterId: "11-phy-01",
    marks: 40,
    total: 50,
    attempted: 20,
    correct: 16,
  });
  state.chapters["11-phy-01"] = applyStageToggle(emptyChapter(), "fin", true, "2026-10-05");
  const weeks = buildWeeks(selectChapters({ year: 11, subjectId: "phy" }), state, "2026-10-05", 4);
  assert.equal(weeks.length, 4);
  const current = weeks[weeks.length - 1];
  assert.equal(current.minutes, 90);
  assert.equal(current.attempted, 20);
  assert.equal(current.correct, 15);
  assert.equal(current.chaptersDone, 1);
  assert.equal(current.tests, 1);
  assert.equal(current.average, 0.8);
  assert.equal(testRollup([]).accuracy, null);
});

test("today's plan ranks revision, weakness, then a place to start", () => {
  const today = "2026-10-05";
  const metas = selectChapters({ year: 11, subjectId: "cs2" });
  const state = defaultState();
  state.chapters[metas[1].id] = { ...emptyChapter(), nextRevision: "2026-10-01", priority: "low" };
  state.errors.push(
    { chapterId: metas[2].id, fixed: false },
    { chapterId: metas[2].id, fixed: false },
    { chapterId: metas[2].id, fixed: false },
  );
  const plan = buildTodayPlan(metas, state, today, 3);
  assert.equal(plan[0].meta.id, metas[1].id);
  assert.equal(plan[0].reason, "Revision due");
  assert.equal(plan[1].reason, "Weak topic");
  assert.equal(plan[2].reason, "Start here");
});

test("sanitize drops unknown chapters, clamps marks, and keeps formulas", () => {
  const clean = sanitizeState({
    chapters: {
      "nope": { notes: "x" },
      "11-m1-01": { notes: "  (a+b)^2 < c  ", attempted: 5, correct: 9, stages: { th: true } },
    },
    tests: [{ id: "t", subjectId: "m1", chapterId: "11-m1-01", marks: 10, total: 0, attempted: 3, correct: 8 }],
    cards: [{ front: "sin^2+cos^2", back: "1", subjectId: "m1" }],
    settings: { dailyHours: 0, examDate: "2027-05-02" },
  });
  assert.equal(clean.chapters.nope, undefined);
  assert.equal(clean.chapters["11-m1-01"].correct, 5);
  assert.match(clean.chapters["11-m1-01"].notes, /\(a\+b\)\^2 < c/);
  assert.equal(clean.tests[0].correct, 3);
  assert.equal(clean.cards[0].back, "1");
  assert.equal(clean.settings.dailyHours, 0);
  assert.equal(clean.settings.examDate, "2027-05-02");
  assert.equal(clean.settings.pomodoroMin, 25);
});

test("attachments stay with the note they came from", () => {
  const file = {
    id: "f1",
    name: "notes.pdf",
    url: "https://example.com/study/u/files/a.pdf",
    key: "study/u/files/a.pdf",
    contentType: "application/pdf",
  };
  const extra = (index) => ({ ...file, id: `x${index}`, name: `e${index}.pdf`, key: `study/u/files/e${index}.pdf` });
  const clean = sanitizeState({
    chapters: {
      "11-phy-02": {
        files: [file, { ...file, id: "bad", key: "users/other/a.pdf", name: "nope.pdf" }, { url: "http://x", key: "study/u/x" }],
      },
    },
    errors: [{
      id: "e1",
      subjectId: "phy",
      chapterId: "11-phy-02",
      topic: "Vectors",
      date: "2026-10-01",
      files: [file, ...Array.from({ length: 10 }, (_, index) => extra(index))],
    }],
    logs: [{ id: "l1", subjectId: "phy", chapterId: "11-phy-02", date: "2026-10-02", achievement: "Finished examples", files: [file] }],
    tests: [{ id: "t1", subjectId: "phy", chapterId: "11-phy-02", date: "2026-10-03", marks: 8, total: 10, weakConcept: "Dot product", files: [file] }],
    mocks: [{ id: "m1", name: "CET 1", date: "2026-10-04", note: "time pressure", percentile: 90, files: [file] }],
  });
  assert.equal(clean.chapters["11-phy-02"].files.length, 1);
  assert.equal(clean.chapters["11-phy-02"].files[0].name, "notes.pdf");
  assert.equal(clean.errors[0].files.length, 8);
  const docs = listDocuments(clean);
  const counts = {};
  for (const row of docs) counts[row.source] = (counts[row.source] || 0) + 1;
  assert.equal(counts["Chapter notes"], 1);
  assert.equal(counts["Error log"], 8);
  assert.equal(counts["Study log"], 1);
  assert.equal(counts["Test"], 1);
  assert.equal(counts["CET mock"], 1);
  assert.equal(docs[0].source, "CET mock");
  assert.equal(docs.find((row) => row.source === "Error log").topic, "Vectors");
  assert.equal(docs.find((row) => row.source === "Error log").chapterId, "11-phy-02");
  assert.equal(docs.find((row) => row.source === "Study log").topic, "Finished examples");
  assert.equal(docs.find((row) => row.source === "Test").topic, "Dot product");
  assert.equal(docs.find((row) => row.source === "CET mock").list, "mocks");
});
