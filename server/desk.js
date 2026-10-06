/**
 * Desk summaries. Progress uses the same scoring as the student ledger.
 * Chapter notes, files, and mistake write-ups stay out of the payload.
 */

import { addDays, defaultState, durationMinutes, sanitizeState, summarize } from "../js/engine.js";
import { chapterById, selectChapters, subjectById } from "../js/syllabus.js";
import { accountRole, accountStatus, codeExpired, formatCode } from "./accounts.js";
import { fromStored } from "./state-doc.js";

const CHAPTERS = selectChapters({});

function indiaToday(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function asIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function stateOf(doc) {
  return sanitizeState(fromStored(doc) || defaultState());
}

function subjectLabel(id) {
  return subjectById(id)?.short || "";
}

function chapterLabel(id) {
  const chapter = chapterById(id);
  if (!chapter) return "";
  return `${chapter.no} ${chapter.title}`.trim();
}

function lastActivity(state, doc) {
  const stamps = [];
  for (const log of state.logs || []) if (log.date) stamps.push(String(log.date));
  for (const test of state.tests || []) if (test.date) stamps.push(String(test.date));
  for (const item of state.errors || []) if (item.date) stamps.push(String(item.date));
  for (const chapter of Object.values(state.chapters || {})) {
    for (const key of ["backlogClearedAt", "completedAt", "rev1At", "rev2At"]) {
      if (chapter[key]) stamps.push(String(chapter[key]));
    }
    for (const revision of chapter.revisions || []) if (revision.at) stamps.push(String(revision.at));
  }
  if (doc?.clientUpdatedAt) stamps.push(String(doc.clientUpdatedAt));
  stamps.sort();
  return stamps.at(-1) || null;
}

function snapshot(user, doc, now) {
  const state = stateOf(doc);
  const summary = summarize(CHAPTERS, state);
  const today = indiaToday(now);
  const from = addDays(today, -6);
  const logs = [...(state.logs || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const tests = [...(state.tests || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const minutesOf = (log) => durationMinutes(log.start, log.end);
  const unfixed = (state.errors || []).filter((item) => !item.fixed);
  const status = accountStatus(user);
  const expired = status === "approved" && codeExpired(user, now.getTime());
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status,
    createdAt: asIso(user.createdAt),
    activatedAt: asIso(user.activatedAt),
    code: status === "approved" && user.approvalCode && !expired ? formatCode(user.approvalCode) : "",
    codeExpiresAt: status === "approved" ? asIso(user.approvalExpiresAt) : null,
    codeExpired: Boolean(expired),
    weighted: summary.weighted,
    raw: summary.raw,
    complete: summary.complete,
    progress: summary.progress,
    notStarted: summary.notStarted,
    chapters: summary.n,
    accuracy: summary.accuracy,
    minutes7: logs.filter((log) => log.date && log.date >= from && log.date <= today).reduce((sum, log) => sum + minutesOf(log), 0),
    minutesAll: logs.reduce((sum, log) => sum + minutesOf(log), 0),
    testCount: (state.tests || []).length,
    unfixedCount: unfixed.length,
    lastActivity: lastActivity(state, doc),
    logs: logs.slice(0, 12).map((log) => ({
      date: log.date,
      subject: subjectLabel(log.subjectId),
      chapter: chapterLabel(log.chapterId),
      minutes: minutesOf(log),
      note: String(log.achievement || "").slice(0, 160),
    })),
    tests: tests.slice(0, 8).map((test) => ({
      date: test.date,
      subject: subjectLabel(test.subjectId),
      chapter: chapterLabel(test.chapterId),
      type: String(test.type || "Test").slice(0, 40),
      marks: Number(test.marks) || 0,
      total: Number(test.total) || 0,
    })),
    unfixed: unfixed.slice(0, 8).map((item) => ({
      date: item.date,
      subject: subjectLabel(item.subjectId),
      topic: String(item.topic || "").slice(0, 160),
      type: String(item.type || "").slice(0, 40),
    })),
  };
}

function light(row) {
  const { logs, tests, unfixed, ...rest } = row;
  return rest;
}

function feedText(entry) {
  if (entry.kind === "test") {
    const where = [entry.subject, entry.chapter].filter(Boolean).join(" · ");
    return `${entry.type} · ${where} · ${entry.marks}/${entry.total}`.replace(/\s+·\s+$/, "");
  }
  const where = [entry.subject, entry.chapter].filter(Boolean).join(" · ");
  const time = entry.minutes ? `${entry.minutes}m` : "session";
  return [where, time].filter(Boolean).join(" · ");
}

export function buildDesk(users, stateDocs, now = new Date()) {
  const byUser = new Map((stateDocs || []).map((doc) => [doc.userId, doc]));
  const full = (users || [])
    .filter((user) => accountRole(user) !== "admin")
    .map((user) => snapshot(user, byUser.get(user.id), now));

  const recent = [];
  for (const row of full) {
    for (const log of row.logs) {
      recent.push({ userId: row.id, name: row.name, date: log.date, kind: "log", text: feedText({ kind: "log", ...log }) });
    }
    for (const test of row.tests) {
      recent.push({ userId: row.id, name: row.name, date: test.date, kind: "test", text: feedText({ kind: "test", ...test }) });
    }
  }
  recent.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.name.localeCompare(b.name));

  const queue = full.filter((row) => row.status === "pending").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const codes = full.filter((row) => row.status === "approved").sort((a, b) => String(a.codeExpiresAt).localeCompare(String(b.codeExpiresAt)));
  const students = full
    .filter((row) => row.status === "active" || row.status === "disabled")
    .sort((a, b) => String(b.lastActivity || "").localeCompare(String(a.lastActivity || "")) || a.name.localeCompare(b.name));
  const declined = full.filter((row) => row.status === "rejected").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return {
    counts: {
      pending: queue.length,
      approved: codes.length,
      active: students.filter((row) => row.status === "active").length,
      disabled: students.filter((row) => row.status === "disabled").length,
      rejected: declined.length,
    },
    queue: queue.map(light),
    codes: codes.map(light),
    students: students.map(light),
    declined: declined.map(light),
    recent: recent.slice(0, 12),
  };
}

export function buildDetail(user, doc, now = new Date()) {
  if (!user || accountRole(user) === "admin") return null;
  return snapshot(user, doc, now);
}
