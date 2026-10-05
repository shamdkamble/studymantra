/**
 * Hits the real Atlas cluster. Refuses to write unless the database is study-tracker.
 * Requests one throwaway account, approves it from the desk, and deletes it before exit.
 */

import assert from "node:assert/strict";
import dns from "dns/promises";
import test from "node:test";
import mongoose from "mongoose";
import app from "../server/index.js";
import { connectDB } from "../server/db/mongodb.js";
import { User } from "../server/models/User.js";
import { StudyState } from "../server/models/StudyState.js";

const email = `api-check-${Date.now()}@studymantra.test`;
const password = `check-${Date.now()}-pw`;
const extraEmails = [];
let server;
let base;
let userId = "";

async function json(path, { method = "GET", token = "", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

function lookupSrv(host) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error("DNS lookup timed out");
      err.code = "ETIMEOUT";
      reject(err);
    }, 4000);
  });
  return Promise.race([
    dns.resolveSrv(`_mongodb._tcp.${host}`),
    timeout,
  ]).finally(() => clearTimeout(timer));
}

test.before(async () => {
  const host = process.env.MONGODB_HOST || "";
  try {
    await lookupSrv(host);
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA" || err.code === "ETIMEOUT") {
      throw new Error(`Atlas host "${host}" did not resolve (${err.code}). Nothing was written.`);
    }
    throw err;
  }
  await connectDB();
  const name = mongoose.connection.name;
  assert.equal(name, "study-tracker", `refusing to write: connected to ${name}`);
  assert.notEqual(name, "dsa-mastery");
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  base = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (mongoose.connection.name === "study-tracker") {
    const emails = [email, ...extraEmails];
    const users = await User.find({ email: { $in: emails } }).select("id").lean();
    const ids = [...new Set([userId, ...users.map((user) => user.id)].filter(Boolean))];
    if (ids.length) {
      await StudyState.deleteMany({ userId: { $in: ids } });
      await User.deleteMany({ id: { $in: ids } });
    }
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) {
    await Promise.race([
      mongoose.disconnect(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
});

test("register, save, conflict, and keep the ledger in study-tracker", { timeout: 120000 }, async () => {
  const health = await json("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.payload.mongo.database, "study-tracker");
  assert.equal(health.payload.mongo.connected, true);
  assert.equal("uriPreview" in health.payload.mongo, false);
  assert.equal(health.payload.app, "studymantra");

  const blocked = await json("/server/auth.js");
  assert.equal(blocked.status, 404);

  const open = await json("/api/state");
  assert.equal(open.status, 401);

  const created = await json("/api/auth/register", {
    method: "POST",
    body: { name: "Api Check", email, password },
  });
  assert.equal(created.status, 202, created.payload.error?.message);
  assert.equal(created.payload.pending, true);
  assert.equal(created.payload.token, undefined);

  const waiting = await json("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(waiting.status, 403, waiting.payload.error?.message);
  assert.equal(waiting.payload.error.code, "PENDING");

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  assert.ok(adminEmail && adminPassword, "ADMIN_EMAIL and ADMIN_PASSWORD are required");
  const admin = await json("/api/auth/login", {
    method: "POST",
    body: { email: adminEmail, password: adminPassword },
  });
  assert.equal(admin.status, 200, admin.payload.error?.message);
  assert.equal(admin.payload.user.role, "admin");
  const adminToken = admin.payload.token;

  const deskBlocked = await json("/api/state", { token: adminToken });
  assert.equal(deskBlocked.status, 403);
  assert.equal(deskBlocked.payload.error.code, "ADMIN_DESK");

  const overview = await json("/api/admin/overview", { token: adminToken });
  assert.equal(overview.status, 200, overview.payload.error?.message);
  const row = (overview.payload.queue || []).find((item) => item.email === email);
  assert.ok(row, "pending request is missing from the desk");
  userId = row.id;
  assert.equal(JSON.stringify(overview.payload).includes("passwordHash"), false);

  const approved = await json(`/api/admin/users/${userId}/approve`, {
    method: "POST",
    token: adminToken,
    body: {},
  });
  assert.equal(approved.status, 200, approved.payload.error?.message);
  assert.match(approved.payload.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const needsCode = await json("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(needsCode.status, 403);
  assert.equal(needsCode.payload.error.code, "AWAITING_CODE");

  const badCode = await json("/api/auth/redeem", {
    method: "POST",
    body: { email, code: "ZZZZ-ZZZZ" },
  });
  assert.equal(badCode.status, 400);
  assert.equal(badCode.payload.error.code, "BAD_CODE");

  const redeemed = await json("/api/auth/redeem", {
    method: "POST",
    body: { email, code: approved.payload.code },
  });
  assert.equal(redeemed.status, 200, redeemed.payload.error?.message);
  const token = redeemed.payload.token;
  assert.equal(redeemed.payload.user.id, userId);
  assert.equal(redeemed.payload.user.role, "student");
  assert.equal(redeemed.payload.user.status, "active");

  const againCode = await json("/api/auth/redeem", {
    method: "POST",
    body: { email, code: approved.payload.code },
  });
  assert.equal(againCode.status, 409);
  assert.equal(againCode.payload.error.code, "ALREADY_ACTIVE");

  const studentDesk = await json("/api/admin/overview", { token });
  assert.equal(studentDesk.status, 403);

  const empty = await json("/api/state", { token });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.payload.state.chapters, {});
  assert.equal(empty.payload.updatedAt, "");

  const chapter = {
    stages: { th: true },
    notes: "SECRET-NOTE-do-not-leak",
    files: [{
      id: "x",
      name: "note",
      url: "https://example.com/secret.pdf",
      key: "study/someone-else/files/secret.pdf",
      contentType: "application/pdf",
    }],
  };
  const saved = await json("/api/state", {
    method: "PUT",
    token,
    body: {
      baseUpdatedAt: "",
      state: {
        chapters: {
          "11-phy-02": chapter,
          "not-a-real-chapter": { stages: { pyq: true } },
        },
        logs: [{
          id: "log-1",
          date: "2026-10-05",
          subjectId: "phy",
          chapterId: "11-phy-02",
          start: "10:00",
          end: "11:00",
          achievement: "Finished examples",
        }],
        errors: [{
          id: "err-1",
          date: "2026-10-05",
          subjectId: "phy",
          chapterId: "11-phy-02",
          type: "Conceptual",
          topic: "Vectors",
          why: "SECRET-WHY",
          concept: "Components",
          formula: "",
          action: "Redo",
          retest: "",
          fixed: false,
        }],
      },
    },
  });
  assert.equal(saved.status, 200, saved.payload.error?.message);
  assert.equal(saved.payload.state.chapters["11-phy-02"].stages.th, true);
  assert.equal(saved.payload.state.chapters["not-a-real-chapter"], undefined);
  assert.deepEqual(saved.payload.state.chapters["11-phy-02"].files, []);
  assert.ok(saved.payload.updatedAt);
  assert.equal(saved.payload.state.settings.examLabel, "MHT-CET");
  assert.equal(saved.payload.state.settings.examDate, "");
  assert.equal(saved.payload.state.errors[0].topic, "Vectors");
  assert.equal(saved.payload.state.errors[0].why, "SECRET-WHY");
  assert.equal(saved.payload.state.errors[0].chapterId, "11-phy-02");
  assert.equal(saved.payload.state.chapters["11-phy-02"].notes, "SECRET-NOTE-do-not-leak");

  const detail = await json(`/api/admin/users/${userId}`, { token: adminToken });
  assert.equal(detail.status, 200, detail.payload.error?.message);
  const detailText = JSON.stringify(detail.payload);
  assert.equal(detailText.includes("SECRET-"), false);
  assert.equal(detail.payload.user.logs[0].note, "Finished examples");
  assert.equal(detail.payload.user.unfixed[0].topic, "Vectors");
  assert.ok(detail.payload.user.weighted > 0);

  const clash = await json("/api/state", {
    method: "PUT",
    token,
    body: {
      baseUpdatedAt: "2000-01-01T00:00:00.000Z",
      state: { chapters: { "11-phy-02": { stages: { pyq: true } } } },
    },
  });
  assert.equal(clash.status, 409);
  assert.equal(clash.payload.state.chapters["11-phy-02"].stages.th, true);
  assert.equal(clash.payload.state.chapters["11-phy-02"].stages.pyq, false);

  const again = await json("/api/state", { token });
  assert.equal(again.payload.state.chapters["11-phy-02"].stages.th, true);
  assert.equal(again.payload.updatedAt, saved.payload.updatedAt);

  const login = await json("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(login.status, 200, login.payload.error?.message);
  assert.equal(login.payload.user.id, userId);

  const doc = await StudyState.findOne({ userId }).lean();
  assert.ok(doc);
  assert.equal(doc.chapters["11-phy-02"].stages.th, true);
  assert.equal(doc.errorItems[0].topic, "Vectors");
  assert.equal(doc.errors, undefined);
  const collections = await mongoose.connection.db.listCollections().toArray();
  const names = collections.map((item) => item.name);
  assert.ok(names.includes("study_states"));
  assert.ok(names.includes("study_users"));

  const other = `api-reject-${Date.now()}@studymantra.test`;
  extraEmails.push(other);
  const rejected = await json("/api/auth/register", {
    method: "POST",
    body: { name: "Reject Check", email: other, password },
  });
  assert.equal(rejected.status, 202, rejected.payload.error?.message);
  const afterReject = await json("/api/admin/overview", { token: adminToken });
  const otherRow = (afterReject.payload.queue || []).find((item) => item.email === other);
  assert.ok(otherRow);
  const decline = await json(`/api/admin/users/${otherRow.id}/reject`, {
    method: "POST",
    token: adminToken,
    body: {},
  });
  assert.equal(decline.status, 200, decline.payload.error?.message);
  const declinedLogin = await json("/api/auth/login", {
    method: "POST",
    body: { email: other, password },
  });
  assert.equal(declinedLogin.status, 403);
  assert.equal(declinedLogin.payload.error.code, "REJECTED");
  const askedAgain = await json("/api/auth/register", {
    method: "POST",
    body: { name: "Reject Check", email: other, password },
  });
  assert.equal(askedAgain.status, 202, askedAgain.payload.error?.message);

  const adminStill = await User.findOne({ email: adminEmail }).lean();
  assert.equal(adminStill.role, "admin");
  assert.equal(adminStill.status, "active");
});
