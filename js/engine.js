/**
 * Scoring, revision, streaks, and weekly rollups.
 * Pure module: no DOM. Shared by the browser and the API sanitizer.
 */

import { chapterById, subjectById } from "./syllabus.js";

export const STAGES = [
  { id: "bl", short: "BL", label: "Backlog", weight: 0.5 },
  { id: "th", short: "TH", label: "Theory", weight: 0.5 },
  { id: "mod", short: "MOD", label: "Module", weight: 0.5 },
  { id: "sb", short: "SB", label: "Solved book", weight: 0.5 },
  { id: "pyq", short: "PYQ", label: "PYQs", weight: 1.5 },
  { id: "r1", short: "R1", label: "First revision", weight: 1.5 },
  { id: "r2", short: "R2", label: "Second revision", weight: 1.5 },
  { id: "tst", short: "TST", label: "Test", weight: 1.5 },
  { id: "ma", short: "MA", label: "Mistake analysis", weight: 1.5 },
  { id: "fin", short: "FIN", label: "Final complete", weight: 0.5 },
];

export const STAGE_WEIGHT_TOTAL = STAGES.reduce((sum, stage) => sum + stage.weight, 0);

const MAX_REVISIONS = 200;
const PRIORITIES = new Set(["low", "medium", "high"]);
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso, days) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

export function asDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (DATE_RE.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return todayISO(parsed);
}

export function weekStart(iso) {
  const dateOnly = asDate(iso);
  if (!dateOnly) return null;
  const [y, m, d] = dateOnly.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return todayISO(date);
}

export function emptyChapter() {
  return {
    stages: Object.fromEntries(STAGES.map((stage) => [stage.id, false])),
    difficulty: "medium",
    importance: "medium",
    priority: "medium",
    attempted: 0,
    correct: 0,
    lastStudied: null,
    revisions: [],
    rev1At: null,
    rev2At: null,
    nextRevision: null,
    targetDate: null,
    nextAction: "",
    notes: "",
    backlogClearedAt: null,
    completedAt: null,
    files: [],
  };
}

export function defaultSettings() {
  return {
    examLabel: "MHT-CET",
    examDate: "",
    secondExamLabel: "HSC Board",
    secondExamDate: "",
    dailyChapters: 2,
    dailyQuestions: 40,
    dailyHours: 3,
    pomodoroMin: 25,
    breakMin: 5,
    lastExportAt: null,
  };
}

export function defaultState() {
  return {
    version: 1,
    chapters: {},
    tests: [],
    errors: [],
    logs: [],
    mocks: [],
    cards: [],
    settings: defaultSettings(),
  };
}

function clipText(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clipBlock(value, max) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function whole(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(max, Math.round(number));
}

function decimal(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(max, Math.round(number * 100) / 100);
}

function choice(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function dateOrNull(value) {
  const date = asDate(value);
  return date && DATE_RE.test(date) ? date : null;
}

export function sanitizeChapter(raw) {
  const base = emptyChapter();
  const src = raw && typeof raw === "object" ? raw : {};
  const stages = { ...base.stages };
  for (const stage of STAGES) stages[stage.id] = Boolean(src.stages?.[stage.id]);
  const attempted = whole(src.attempted, 99999);
  const correct = Math.min(attempted, whole(src.correct, 99999));
  const files = sanitizeFiles(src.files);
  const revisions = sanitizeRevisions(src);
  stages.r1 = revisions.length >= 1;
  stages.r2 = revisions.length >= 2;
  return {
    stages,
    difficulty: choice(src.difficulty, DIFFICULTIES, "medium"),
    importance: choice(src.importance, PRIORITIES, "medium"),
    priority: choice(src.priority, PRIORITIES, "medium"),
    attempted,
    correct,
    lastStudied: dateOrNull(src.lastStudied),
    revisions,
    rev1At: revisions[0]?.at || null,
    rev2At: revisions[1]?.at || null,
    nextRevision: dateOrNull(src.nextRevision),
    targetDate: dateOrNull(src.targetDate),
    nextAction: clipText(src.nextAction, 400),
    notes: clipBlock(src.notes, 20000),
    backlogClearedAt: dateOrNull(src.backlogClearedAt),
    completedAt: dateOrNull(src.completedAt),
    files,
  };
}

function sanitizeFiles(raw) {
  return Array.isArray(raw) ? raw.slice(0, 8).map(sanitizeFile).filter(Boolean) : [];
}

function sanitizeFile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const key = clipText(raw.key, 240);
  const url = clipText(raw.url, 500);
  if (!key.startsWith("study/") || !/^https:\/\//.test(url)) return null;
  return {
    id: clipText(raw.id, 80) || key,
    name: clipText(raw.name, 120) || "Attachment",
    url,
    key,
    contentType: clipText(raw.contentType, 80),
  };
}

export function isPristine(chapter) {
  const empty = emptyChapter();
  if (chapter.notes || chapter.nextAction || chapter.files?.length) return false;
  if (chapter.attempted || chapter.correct) return false;
  if (chapter.lastStudied || chapter.revisions?.length || chapter.rev1At || chapter.rev2At || chapter.nextRevision) return false;
  if (chapter.targetDate || chapter.backlogClearedAt || chapter.completedAt) return false;
  if (chapter.difficulty !== empty.difficulty) return false;
  if (chapter.importance !== empty.importance || chapter.priority !== empty.priority) return false;
  return STAGES.every((stage) => !chapter.stages[stage.id]);
}

export function getChapter(state, id) {
  return sanitizeChapter(state?.chapters?.[id]);
}

export function chapterProgress(chapter) {
  const ch = chapter?.stages ? chapter : emptyChapter();
  let ticked = 0;
  let weightedPoints = 0;
  for (const stage of STAGES) {
    if (!ch.stages[stage.id]) continue;
    ticked += 1;
    weightedPoints += stage.weight;
  }
  const attempted = Number(ch.attempted) || 0;
  const correct = Math.min(Number(ch.correct) || 0, attempted);
  return {
    ticked,
    raw: ticked / STAGES.length,
    weighted: weightedPoints / STAGE_WEIGHT_TOTAL,
    weightedPoints,
    status: ticked === 0 ? "not_started" : ticked === STAGES.length ? "complete" : "in_progress",
    accuracy: attempted > 0 ? correct / attempted : null,
  };
}

function revisionKey(raw, index, used) {
  const cleaned = clipText(raw, 40).replace(/[^a-zA-Z0-9_-]/g, "");
  if (cleaned && !used.has(cleaned)) return cleaned;
  let n = index + 1;
  let id = `rev-${n}`;
  while (used.has(id)) {
    n += 1;
    id = `rev-${n}`;
  }
  return id;
}

function pushRevision(out, used, id, at) {
  const date = dateOrNull(at);
  if (!date || out.length >= MAX_REVISIONS) return;
  const key = revisionKey(id, out.length, used);
  used.add(key);
  out.push({ id: key, at: date });
}

function sanitizeRevisions(src) {
  const out = [];
  const used = new Set();
  if (Array.isArray(src.revisions)) {
    for (const item of src.revisions) {
      if (typeof item === "string") pushRevision(out, used, "", item);
      else pushRevision(out, used, item?.id, item?.at);
    }
  } else {
    const stages = src.stages || {};
    if (stages.r1 || src.rev1At) pushRevision(out, used, "rev-1", src.rev1At || src.lastStudied);
    if (stages.r2 || src.rev2At) pushRevision(out, used, "rev-2", src.rev2At || src.rev1At || src.lastStudied);
  }
  out.sort((a, b) => a.at.localeCompare(b.at));
  return out;
}

function nextRevisionId(revisions) {
  const used = new Set(revisions.map((item) => item.id));
  return revisionKey("", revisions.length, used);
}

function scheduleRevision(chapter, at) {
  chapter.nextRevision = addDays(at, chapter.revisions.length <= 1 ? 7 : 21);
  if (!chapter.lastStudied || at >= chapter.lastStudied) chapter.lastStudied = at;
  return chapter;
}

export function latestRevisionAt(chapter) {
  let latest = null;
  for (const item of chapter?.revisions || []) {
    if (item.at && (!latest || item.at > latest)) latest = item.at;
  }
  return latest;
}

export function addRevision(chapter, date) {
  const at = dateOrNull(date);
  const current = sanitizeChapter(chapter);
  if (!at || current.revisions.length >= MAX_REVISIONS) return current;
  const latest = latestRevisionAt(current) || "";
  const revisions = [...current.revisions, { id: nextRevisionId(current.revisions), at }];
  const next = sanitizeChapter({ ...current, revisions });
  if (at >= latest) scheduleRevision(next, at);
  return next;
}

export function removeRevision(chapter, id) {
  const current = sanitizeChapter(chapter);
  const revisions = current.revisions.filter((item) => item.id !== id);
  if (revisions.length === current.revisions.length) return current;
  return sanitizeChapter({ ...current, revisions });
}

function removeRevisionAt(chapter, index) {
  const current = sanitizeChapter(chapter);
  if (!current.revisions[index]) return current;
  const revisions = current.revisions.filter((_, itemIndex) => itemIndex !== index);
  return sanitizeChapter({ ...current, revisions });
}

export function applyStageToggle(chapter, stageId, on, today) {
  const next = sanitizeChapter(chapter);
  if (!STAGES.some((stage) => stage.id === stageId)) return next;
  if (stageId === "r1" || stageId === "r2") {
    const slot = stageId === "r1" ? 0 : 1;
    if (!on) return removeRevisionAt(next, slot);
    if (next.revisions.length > slot) {
      const revisions = next.revisions.map((item, index) => (index === slot ? { ...item, at: today } : item));
      return scheduleRevision(sanitizeChapter({ ...next, revisions }), today);
    }
    return addRevision(next, today);
  }
  next.stages[stageId] = Boolean(on);
  if (on) next.lastStudied = today;
  if (stageId === "bl") next.backlogClearedAt = on ? (next.backlogClearedAt || today) : null;
  if (stageId === "fin") next.completedAt = on ? (next.completedAt || today) : null;
  return next;
}

export function revisionStatus(chapter, today) {
  if (!chapter.nextRevision) return { status: "not_set", label: "Not set" };
  if (chapter.nextRevision <= today) return { status: "due", label: "Due" };
  return { status: "upcoming", label: "Upcoming" };
}

export function isWeak(chapterId, tests, errors) {
  const related = (tests || []).filter((test) => test.chapterId === chapterId && Number(test.attempted) > 0);
  const attempted = related.reduce((sum, test) => sum + (Number(test.attempted) || 0), 0);
  const correct = related.reduce((sum, test) => sum + (Number(test.correct) || 0), 0);
  if (attempted > 0 && correct / attempted < 0.6) return true;
  const unfixed = (errors || []).filter((error) => error.chapterId === chapterId && !error.fixed).length;
  return unfixed >= 3;
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

export function summarize(metas, state) {
  const list = metas || [];
  const n = list.length;
  let ticks = 0;
  let weight = 0;
  let complete = 0;
  let progress = 0;
  let notStarted = 0;
  let pyq = 0;
  let r1 = 0;
  let r2 = 0;
  let tst = 0;
  let mod = 0;
  let sb = 0;
  let bl = 0;
  let attempted = 0;
  let correct = 0;
  const stageTicks = Object.fromEntries(STAGES.map((stage) => [stage.id, 0]));

  for (const meta of list) {
    const chapter = getChapter(state, meta.id);
    const score = chapterProgress(chapter);
    ticks += score.ticked;
    weight += score.weightedPoints;
    if (score.status === "complete") complete += 1;
    else if (score.status === "in_progress") progress += 1;
    else notStarted += 1;
    for (const stage of STAGES) if (chapter.stages[stage.id]) stageTicks[stage.id] += 1;
    if (chapter.stages.pyq) pyq += 1;
    if (chapter.stages.r1) r1 += 1;
    if (chapter.stages.r2) r2 += 1;
    if (chapter.stages.tst) tst += 1;
    if (chapter.stages.mod) mod += 1;
    if (chapter.stages.sb) sb += 1;
    if (chapter.stages.bl) bl += 1;
    attempted += chapter.attempted;
    correct += chapter.correct;
  }

  const stagesTotal = n * STAGES.length;
  return {
    n,
    raw: stagesTotal ? ticks / stagesTotal : 0,
    weighted: n ? weight / (n * STAGE_WEIGHT_TOTAL) : 0,
    complete,
    progress,
    notStarted,
    remainingChapters: n - complete,
    pyq: n ? pyq / n : 0,
    revision: n ? (r1 + r2) / (n * 2) : 0,
    test: n ? tst / n : 0,
    practice: n ? (mod + sb) / (n * 2) : 0,
    backlog: n ? bl / n : 0,
    accuracy: attempted ? correct / attempted : null,
    attempted,
    correct,
    stageTicks,
  };
}

export function testRollup(tests) {
  const list = tests || [];
  const attempted = list.reduce((sum, test) => sum + (Number(test.attempted) || 0), 0);
  const correct = list.reduce((sum, test) => sum + (Number(test.correct) || 0), 0);
  const scored = list.filter((test) => Number(test.total) > 0);
  const avg = scored.length
    ? scored.reduce((sum, test) => sum + (Number(test.marks) || 0) / Number(test.total), 0) / scored.length
    : null;
  return {
    count: list.length,
    attempted,
    correct,
    accuracy: attempted ? correct / attempted : null,
    average: avg,
  };
}

function priorityRank(chapter) {
  return PRIORITY_RANK[chapter.priority] ?? 1;
}

export function buildTodayPlan(metas, state, today, limit = 5) {
  const items = (metas || []).map((meta) => {
    const chapter = getChapter(state, meta.id);
    return {
      meta,
      chapter,
      progress: chapterProgress(chapter),
      revision: revisionStatus(chapter, today),
      weak: isWeak(meta.id, state.tests, state.errors),
    };
  });

  const ranked = [];
  for (const item of items) {
    let rank = null;
    let reason = null;
    if (item.revision.status === "due") {
      rank = 0;
      reason = "Revision due";
    } else if (item.weak) {
      rank = 1;
      reason = "Weak topic";
    } else if (item.chapter.priority === "high" && item.progress.status === "not_started") {
      rank = 2;
      reason = "High priority, not started";
    } else if (!item.chapter.stages.bl && item.chapter.targetDate && item.chapter.targetDate < today) {
      rank = 3;
      reason = "Backlog overdue";
    } else if (!item.chapter.stages.bl && item.chapter.priority === "high") {
      rank = 4;
      reason = "Backlog pending";
    }
    if (rank !== null) ranked.push({ ...item, rank, reason });
  }

  ranked.sort((a, b) => a.rank - b.rank || priorityRank(a.chapter) - priorityRank(b.chapter) || a.meta.order - b.meta.order);

  const picked = [];
  const seen = new Set();
  for (const item of ranked) {
    if (seen.has(item.meta.id)) continue;
    seen.add(item.meta.id);
    picked.push(item);
    if (picked.length === limit) return picked;
  }

  for (const item of items) {
    if (picked.length === limit) break;
    if (seen.has(item.meta.id) || item.progress.status === "complete") continue;
    picked.push({
      ...item,
      rank: 9,
      reason: item.progress.status === "in_progress" ? "Continue" : "Start here",
    });
    seen.add(item.meta.id);
  }
  return picked;
}

export function durationMinutes(start, end) {
  if (!TIME_RE.test(start || "") || !TIME_RE.test(end || "")) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

export function dayProgress(date, logs, settings) {
  const dayLogs = (logs || []).filter((log) => log.date === date);
  const minutes = dayLogs.reduce((sum, log) => sum + durationMinutes(log.start, log.end), 0);
  const questions = dayLogs.reduce((sum, log) => sum + (Number(log.attempted) || 0), 0);
  const chapters = new Set(dayLogs.map((log) => log.chapterId).filter(Boolean)).size;
  return {
    minutes,
    questions,
    chapters,
    hoursTarget: Number(settings?.dailyHours) || 0,
    questionsTarget: Number(settings?.dailyQuestions) || 0,
    chaptersTarget: Number(settings?.dailyChapters) || 0,
  };
}

export function dayHit(date, logs, settings) {
  const progress = dayProgress(date, logs, settings);
  const checks = [];
  if (progress.hoursTarget > 0) checks.push(progress.minutes >= progress.hoursTarget * 60);
  if (progress.questionsTarget > 0) checks.push(progress.questions >= progress.questionsTarget);
  if (progress.chaptersTarget > 0) checks.push(progress.chapters >= progress.chaptersTarget);
  if (!checks.length) return progress.minutes > 0;
  return checks.every(Boolean);
}

export function streakInfo(logs, settings, today) {
  const todayHit = dayHit(today, logs, settings);
  let streak = 0;
  let cursor = todayHit ? today : addDays(today, -1);
  if (todayHit || dayHit(cursor, logs, settings)) {
    while (dayHit(cursor, logs, settings)) {
      streak += 1;
      cursor = addDays(cursor, -1);
      if (streak > 500) break;
    }
  }
  const strip = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    strip.push({ date, hit: dayHit(date, logs, settings), isToday: date === today });
  }
  return { streak, todayHit, strip, progress: dayProgress(today, logs, settings) };
}

export function buildWeeks(metas, state, today, count = 12) {
  const allowed = new Set((metas || []).map((meta) => meta.id));
  const end = weekStart(today);
  const starts = [];
  for (let i = count - 1; i >= 0; i -= 1) starts.push(addDays(end, -7 * i));

  return starts.map((start) => {
    const finish = addDays(start, 6);
    const inWeek = (value) => {
      const date = asDate(value);
      return Boolean(date && date >= start && date <= finish);
    };
    const logs = (state.logs || []).filter((log) => allowed.has(log.chapterId) && inWeek(log.date));
    const tests = (state.tests || []).filter((test) => allowed.has(test.chapterId) && inWeek(test.date));
    let chaptersDone = 0;
    let backlogCleared = 0;
    for (const id of allowed) {
      const chapter = getChapter(state, id);
      if (inWeek(chapter.completedAt)) chaptersDone += 1;
      if (inWeek(chapter.backlogClearedAt)) backlogCleared += 1;
    }
    const minutes = logs.reduce((sum, log) => sum + durationMinutes(log.start, log.end), 0);
    const attempted = logs.reduce((sum, log) => sum + (Number(log.attempted) || 0), 0);
    const correct = logs.reduce((sum, log) => sum + (Number(log.correct) || 0), 0);
    const rollup = testRollup(tests);
    return {
      start,
      finish,
      minutes,
      chaptersDone,
      backlogCleared,
      attempted,
      correct,
      accuracy: attempted ? correct / attempted : null,
      tests: tests.length,
      average: rollup.average,
    };
  });
}

export function daysUntil(iso, today) {
  if (!DATE_RE.test(iso || "")) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const current = new Date(ty, tm - 1, td);
  return Math.round((target - current) / 86400000);
}

function sanitizeSettings(raw) {
  const base = defaultSettings();
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    examLabel: clipText(src.examLabel, 40) || base.examLabel,
    examDate: dateOrNull(src.examDate) || "",
    secondExamLabel: clipText(src.secondExamLabel, 40) || base.secondExamLabel,
    secondExamDate: dateOrNull(src.secondExamDate) || "",
    dailyChapters: Math.min(20, whole(src.dailyChapters ?? base.dailyChapters, 20)),
    dailyQuestions: Math.min(500, whole(src.dailyQuestions ?? base.dailyQuestions, 500)),
    dailyHours: Math.min(16, whole(src.dailyHours ?? base.dailyHours, 16)),
    pomodoroMin: Math.min(90, Math.max(5, whole(src.pomodoroMin ?? base.pomodoroMin, 90) || 25)),
    breakMin: Math.min(30, Math.max(1, whole(src.breakMin ?? base.breakMin, 30) || 5)),
    lastExportAt: typeof src.lastExportAt === "string" ? src.lastExportAt.slice(0, 40) : null,
  };
}

function withId(raw, index) {
  const id = clipText(raw?.id, 80);
  return id || `row-${index + 1}`;
}

function sanitizeTest(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const subjectId = subjectById(raw.subjectId) ? raw.subjectId : "";
  if (!subjectId) return null;
  const chapter = chapterById(raw.chapterId);
  const attempted = whole(raw.attempted, 9999);
  return {
    id: withId(raw, index),
    date: dateOrNull(raw.date) || todayISO(),
    subjectId,
    chapterId: chapter && chapter.subjectId === subjectId ? chapter.id : "",
    type: clipText(raw.type, 40) || "Chapter test",
    marks: decimal(raw.marks, 1000),
    total: decimal(raw.total, 1000),
    attempted,
    correct: Math.min(attempted, whole(raw.correct, 9999)),
    retestDate: dateOrNull(raw.retestDate),
    mistakes: clipBlock(raw.mistakes, 2000),
    weakConcept: clipText(raw.weakConcept, 240),
    files: sanitizeFiles(raw.files),
  };
}

function sanitizeError(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const subjectId = subjectById(raw.subjectId) ? raw.subjectId : "";
  if (!subjectId) return null;
  const chapter = chapterById(raw.chapterId);
  return {
    id: withId(raw, index),
    date: dateOrNull(raw.date) || todayISO(),
    subjectId,
    chapterId: chapter && chapter.subjectId === subjectId ? chapter.id : "",
    type: clipText(raw.type, 40) || "Conceptual",
    topic: clipText(raw.topic, 160),
    why: clipBlock(raw.why, 2000),
    concept: clipBlock(raw.concept, 2000),
    formula: clipText(raw.formula, 400),
    action: clipText(raw.action, 400),
    retestResult: clipText(raw.retestResult, 160),
    fixed: Boolean(raw.fixed),
    files: sanitizeFiles(raw.files),
  };
}

function sanitizeLog(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const subjectId = subjectById(raw.subjectId) ? raw.subjectId : "";
  if (!subjectId) return null;
  const chapter = chapterById(raw.chapterId);
  const attempted = whole(raw.attempted, 9999);
  const start = TIME_RE.test(raw.start || "") ? raw.start : "";
  const end = TIME_RE.test(raw.end || "") ? raw.end : "";
  return {
    id: withId(raw, index),
    date: dateOrNull(raw.date) || todayISO(),
    subjectId,
    chapterId: chapter && chapter.subjectId === subjectId ? chapter.id : "",
    start,
    end,
    attempted,
    correct: Math.min(attempted, whole(raw.correct, 9999)),
    achievement: clipText(raw.achievement, 400),
    problem: clipText(raw.problem, 400),
    nextAction: clipText(raw.nextAction, 400),
    files: sanitizeFiles(raw.files),
  };
}

function sanitizeMock(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: withId(raw, index),
    date: dateOrNull(raw.date) || todayISO(),
    name: clipText(raw.name, 80) || "Mock",
    percentile: Math.min(100, decimal(raw.percentile, 100)),
    score: decimal(raw.score, 1000),
    total: decimal(raw.total, 1000),
    note: clipText(raw.note, 400),
    files: sanitizeFiles(raw.files),
  };
}

export function listDocuments(state) {
  const rows = [];
  const push = (files, place) => {
    for (const file of files || []) {
      if (!file?.key || !file?.url) continue;
      rows.push({ ...place, file });
    }
  };
  for (const [chapterId, chapter] of Object.entries(state?.chapters || {})) {
    push(chapter.files, { source: "Chapter notes", chapterId, topic: "", date: chapter.lastStudied || "", list: "chapters", rowId: chapterId });
  }
  for (const error of state?.errors || []) {
    push(error.files, { source: "Error log", chapterId: error.chapterId, topic: error.topic || "", date: error.date || "", list: "errors", rowId: error.id });
  }
  for (const log of state?.logs || []) {
    push(log.files, { source: "Study log", chapterId: log.chapterId, topic: log.achievement || log.problem || log.nextAction || "", date: log.date || "", list: "logs", rowId: log.id });
  }
  for (const test of state?.tests || []) {
    push(test.files, { source: "Test", chapterId: test.chapterId, topic: test.weakConcept || test.mistakes || test.type || "", date: test.date || "", list: "tests", rowId: test.id });
  }
  for (const mock of state?.mocks || []) {
    push(mock.files, { source: "CET mock", chapterId: "", topic: mock.note || mock.name || "", date: mock.date || "", list: "mocks", rowId: mock.id });
  }
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.file.name.localeCompare(b.file.name));
}

function sanitizeCard(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const front = clipBlock(raw.front, 2000);
  const back = clipBlock(raw.back, 2000);
  if (!front || !back) return null;
  const subjectId = subjectById(raw.subjectId) ? raw.subjectId : "";
  const chapter = chapterById(raw.chapterId);
  const box = Math.min(3, Math.max(1, whole(raw.box || 1, 3) || 1));
  return {
    id: withId(raw, index),
    subjectId,
    chapterId: chapter && (!subjectId || chapter.subjectId === subjectId) ? chapter.id : "",
    front,
    back,
    box,
    due: dateOrNull(raw.due) || todayISO(),
  };
}

function sanitizeList(list, mapper, max) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list.slice(0, max)) {
    const item = mapper(raw, out.length);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function sanitizeState(input) {
  const src = input && typeof input === "object" ? input : {};
  const chapters = {};
  if (src.chapters && typeof src.chapters === "object" && !Array.isArray(src.chapters)) {
    for (const [id, raw] of Object.entries(src.chapters)) {
      if (!chapterById(id)) continue;
      const chapter = sanitizeChapter(raw);
      if (!isPristine(chapter)) chapters[id] = chapter;
    }
  }
  return {
    version: 1,
    chapters,
    tests: sanitizeList(src.tests, sanitizeTest, 5000),
    errors: sanitizeList(src.errors, sanitizeError, 5000),
    logs: sanitizeList(src.logs, sanitizeLog, 8000),
    mocks: sanitizeList(src.mocks, sanitizeMock, 1000),
    cards: sanitizeList(src.cards, sanitizeCard, 2000),
    settings: sanitizeSettings(src.settings),
  };
}

export function retestsDue(tests, today) {
  return (tests || []).filter((test) => test.retestDate && test.retestDate <= today);
}
