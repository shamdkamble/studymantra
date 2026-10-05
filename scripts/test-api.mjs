/**
 * Hits the real Atlas cluster. Refuses to write unless the database is study-tracker.
 * Creates one throwaway account and deletes it before exit.
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
    if (userId) {
      await StudyState.deleteOne({ userId });
      await User.deleteOne({ id: userId });
    }
    await User.deleteOne({ email });
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) {
    await Promise.race([
      mongoose.disconnect(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
});

test("register, save, conflict, and keep the ledger in study-tracker", { timeout: 60000 }, async () => {
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
  assert.equal(created.status, 201, created.payload.error?.message);
  const token = created.payload.token;
  userId = created.payload.user.id;
  assert.ok(token);
  assert.equal(created.payload.user.email, email);

  const empty = await json("/api/state", { token });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.payload.state.chapters, {});
  assert.equal(empty.payload.updatedAt, "");

  const chapter = {
    stages: { th: true },
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
        errors: [{
          id: "err-1",
          date: "2026-10-05",
          subjectId: "phy",
          chapterId: "11-phy-02",
          type: "Conceptual",
          topic: "Vectors",
          why: "Direction",
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
  assert.equal(saved.payload.state.errors[0].chapterId, "11-phy-02");

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
});
