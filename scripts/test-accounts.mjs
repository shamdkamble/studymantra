import assert from "node:assert/strict";
import test from "node:test";
import { accountStatus, codesMatch, codeExpired, formatCode, loginDenial, normalizeCode } from "../server/accounts.js";
import { buildDesk, buildDetail } from "../server/desk.js";
import { authHtml } from "../js/views/auth.js";
import { previewDesk } from "../js/views/admin.js";

const now = new Date("2026-10-05T08:00:00.000Z");

test("approval codes ignore dashes and case", () => {
  assert.equal(normalizeCode(" abcd-2345 "), "ABCD2345");
  assert.equal(formatCode("abcd2345"), "ABCD-2345");
  assert.equal(codesMatch("ABCD2345", "abcd-2345"), true);
  assert.equal(codesMatch("ABCD2345", "ABCD-2346"), false);
  assert.equal(codesMatch("", "ABCD2345"), false);
  assert.equal(codeExpired({ approvalExpiresAt: "2026-10-01T00:00:00.000Z" }, now.getTime()), true);
  assert.equal(codeExpired({ approvalExpiresAt: "2026-10-20T00:00:00.000Z" }, now.getTime()), false);
});

test("missing status stays an active student, and a waiting login gets no session", () => {
  assert.equal(accountStatus({}), "active");
  assert.equal(accountStatus({ status: "pending" }), "pending");
  assert.equal(loginDenial({ status: "pending" }).code, "PENDING");
  assert.equal(loginDenial({ role: "admin", status: "active" }), null);
  assert.equal(loginDenial({ status: "approved" }).code, "AWAITING_CODE");
});

test("the desk hides notes, files, and mistake write-ups", () => {
  const student = {
    id: "student-1",
    name: "Asha Patil",
    email: "asha@example.com",
    role: "student",
    status: "active",
    passwordHash: "SECRET-HASH",
    createdAt: "2026-10-01T00:00:00.000Z",
    activatedAt: "2026-10-02T00:00:00.000Z",
  };
  const waiting = {
    id: "student-2",
    name: "Waiting Student",
    email: "wait@example.com",
    role: "student",
    status: "approved",
    approvalCode: "abcd2345",
    approvalExpiresAt: "2026-10-20T00:00:00.000Z",
    createdAt: "2026-10-04T00:00:00.000Z",
    passwordHash: "SECRET-HASH",
  };
  const admin = {
    id: "admin-1",
    name: "Sham",
    email: "sham@example.com",
    role: "admin",
    status: "active",
    passwordHash: "SECRET-HASH",
  };
  const doc = {
    userId: "student-1",
    chapters: {
      "11-phy-02": {
        stages: { th: true },
        notes: "SECRET-NOTE-do-not-leak",
        files: [{ url: "https://secret.example/file.pdf", key: "study/student-1/files/secret.pdf" }],
      },
    },
    logs: [{
      id: "log-1",
      date: "2026-10-05",
      subjectId: "phy",
      chapterId: "11-phy-02",
      start: "10:00",
      end: "11:30",
      achievement: "Finished examples",
    }],
    tests: [{
      id: "test-1",
      date: "2026-10-05",
      subjectId: "phy",
      chapterId: "11-phy-02",
      type: "Chapter",
      marks: 18,
      total: 20,
      attempted: 20,
      correct: 18,
      mistakes: "SECRET-MISTAKE",
    }],
    errorItems: [{
      id: "err-1",
      date: "2026-10-05",
      subjectId: "phy",
      chapterId: "11-phy-02",
      type: "Conceptual",
      topic: "Vectors",
      why: "SECRET-WHY",
      fixed: false,
    }],
  };

  const desk = buildDesk([student, waiting, admin], [doc], now);
  const detail = buildDetail(student, doc, now);
  const packed = JSON.stringify({ desk, detail });
  assert.equal(packed.includes("SECRET-"), false);
  assert.equal(packed.includes("secret.example"), false);
  assert.equal(desk.students.some((row) => row.email === "sham@example.com"), false);
  assert.equal(desk.codes[0].code, "ABCD-2345");
  assert.equal(desk.counts.active, 1);
  assert.equal(detail.logs[0].note, "Finished examples");
  assert.equal(detail.unfixed[0].topic, "Vectors");
  assert.ok(detail.minutesAll >= 90);
  assert.ok(detail.weighted > 0);

  const html = previewDesk(desk, detail);
  assert.match(html, /Finished examples/);
  assert.match(html, /ABCD-2345/);
  assert.match(html, /Mathematical Methods/);
  assert.equal(html.includes("SECRET-"), false);
});

test("request screens explain the code instead of opening a ledger", () => {
  const register = authHtml("register");
  assert.equal(register.includes("ready immediately"), false);
  assert.match(register, /Request a ledger/);
  assert.match(register, /data-form="register"/);
  const requested = authHtml("requested", "", { email: "asha@example.com" });
  assert.match(requested, /Request received/);
  assert.match(requested, /asha@example.com/);
  assert.equal(requested.includes("<form"), false);
  assert.match(authHtml("approve"), /data-form="redeem"/);
  assert.match(authHtml("login"), /#\/approve/);
});
