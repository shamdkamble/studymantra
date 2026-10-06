/**
 * StudyMantra API.
 * Local: static files + /api. Vercel: /api only.
 */

import "./env.js";
import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB, formatMongoError, getMongoDiagnostics, getMongoUri, isMongoConnected } from "./db/mongodb.js";
import { accountRole, accountStatus, codesMatch, codeExpired, loginDenial, normalizeCode } from "./accounts.js";
import { AuthError, hashPassword, publicUser, requireAuth, sessionFor, verifyPassword } from "./auth.js";
import { mountDesk } from "./desk-routes.js";
import { requireStudent } from "./guard.js";
import { User } from "./models/User.js";
import { StudyState } from "./models/StudyState.js";
import { defaultState, sanitizeState } from "../js/engine.js";
import { fromStored, toStored } from "./state-doc.js";
import { extensionFor, MediaError, ownsKey, prepareUpload, putObject, r2Diagnostics, removeObject } from "./r2.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 8090;
const IS_VERCEL = Boolean(process.env.VERCEL);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

const failures = new Map();

function tooMany(ip) {
  const now = Date.now();
  const recent = (failures.get(ip) || []).filter((stamp) => now - stamp < 10 * 60 * 1000);
  if (recent.length >= 12) {
    failures.set(ip, recent);
    return true;
  }
  recent.push(now);
  failures.set(ip, recent);
  return false;
}

function clearFailures(ip) {
  failures.delete(ip);
}

function sendError(res, err, fallback = "Something went wrong.") {
  if (err instanceof AuthError || err instanceof MediaError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code } });
    return;
  }
  const mongo = formatMongoError(err);
  const missing = !getMongoUri();
  if (missing || /Mongo|ECONN|timed out|buffering/i.test(mongo.message)) {
    res.status(503).json({
      error: {
        message: missing ? mongo.message : `Database unavailable: ${mongo.message}`,
        code: missing ? "MONGODB_URI_MISSING" : "DB_UNAVAILABLE",
      },
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { message: fallback, code: "SERVER_ERROR" } });
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "local").split(",")[0].trim();
}

app.get("/api/health", async (_req, res) => {
  let dbOk = false;
  let dbError = null;
  try {
    await connectDB();
    dbOk = isMongoConnected();
  } catch (err) {
    dbError = formatMongoError(err).message;
  }
  const storage = r2Diagnostics();
  const diag = getMongoDiagnostics();
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    app: "studymantra",
    mongo: {
      configured: diag.configured,
      connected: diag.connected,
      database: diag.database,
      error: dbError ? "Database unavailable." : null,
    },
    storage: { configured: storage.configured, missing: storage.missing },
  });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const ip = clientIp(req);
    if (tooMany(ip)) {
      res.status(429).json({ error: { message: "Too many attempts. Wait a few minutes.", code: "RATE_LIMIT" } });
      return;
    }
    const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (name.length < 2 || name.length > 80) {
      throw new AuthError("Enter your name.");
    }
    if (!EMAIL_RE.test(email) || email.length > 160) throw new AuthError("Enter a valid email.");
    if (password.length < 8 || password.length > 200) throw new AuthError("Use a password of at least 8 characters.");

    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (adminEmail && email === adminEmail) {
      throw new AuthError("An account with that email already exists.", 409, "EMAIL_TAKEN");
    }

    await connectDB();
    const existing = await User.findOne({ email });
    if (existing) {
      const role = accountRole(existing);
      const status = accountStatus(existing);
      if (role === "admin" || status === "active" || status === "disabled" || status === "approved") {
        const code = status === "approved" ? "AWAITING_CODE" : status === "disabled" ? "DISABLED" : "EMAIL_TAKEN";
        const message = status === "approved"
          ? "A code is already waiting for this email. Enter it on the approval page."
          : status === "disabled"
            ? "This account is disabled."
            : "An account with that email already exists.";
        throw new AuthError(message, 409, code);
      }
      existing.name = name;
      existing.passwordHash = await hashPassword(password);
      existing.role = "student";
      existing.status = "pending";
      existing.approvalCode = "";
      existing.approvalIssuedAt = null;
      existing.approvalExpiresAt = null;
      await existing.save();
      clearFailures(ip);
      res.status(202).json({ pending: true, email });
      return;
    }

    await User.create({
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "student",
      status: "pending",
    });
    clearFailures(ip);
    res.status(202).json({ pending: true, email });
  } catch (err) {
    sendError(res, err, "Could not create the account.");
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const ip = clientIp(req);
    if (tooMany(ip)) {
      res.status(429).json({ error: { message: "Too many attempts. Wait a few minutes.", code: "RATE_LIMIT" } });
      return;
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    await connectDB();
    const user = await User.findOne({ email });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AuthError("Email or password is incorrect.", 401, "INVALID_CREDENTIALS");
    }
    clearFailures(ip);
    const denial = loginDenial(user);
    if (denial) throw new AuthError(denial.message, denial.status, denial.code);
    res.json(sessionFor(user));
  } catch (err) {
    sendError(res, err, "Could not sign in.");
  }
});

app.post("/api/auth/redeem", async (req, res) => {
  try {
    const ip = clientIp(req);
    if (tooMany(ip)) {
      res.status(429).json({ error: { message: "Too many attempts. Wait a few minutes.", code: "RATE_LIMIT" } });
      return;
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "");
    if (!EMAIL_RE.test(email) || email.length > 160) throw new AuthError("Enter the email you requested with.");
    if (normalizeCode(code).length !== 8) throw new AuthError("Enter the 8-character code.");
    await connectDB();
    const user = await User.findOne({ email });
    if (!user || accountRole(user) === "admin") {
      throw new AuthError("That code does not match this email.", 400, "BAD_CODE");
    }
    const status = accountStatus(user);
    if (status === "active") {
      throw new AuthError("This ledger is already open. Sign in with your password.", 409, "ALREADY_ACTIVE");
    }
    if (status === "pending") throw new AuthError("This request is still waiting for a code.", 403, "PENDING");
    if (status === "rejected") throw new AuthError("This request was declined.", 403, "REJECTED");
    if (status === "disabled") throw new AuthError("This account is disabled.", 403, "DISABLED");
    if (status !== "approved" || !user.approvalCode || !codesMatch(user.approvalCode, code)) {
      throw new AuthError("That code does not match this email.", 400, "BAD_CODE");
    }
    if (codeExpired(user)) throw new AuthError("That code has expired. Ask Sham for a new one.", 400, "CODE_EXPIRED");
    user.status = "active";
    user.approvalCode = "";
    user.approvalIssuedAt = null;
    user.approvalExpiresAt = null;
    user.activatedAt = new Date();
    await user.save();
    clearFailures(ip);
    res.json(sessionFor(user));
  } catch (err) {
    sendError(res, err, "Could not open the ledger.");
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    await connectDB();
    const user = await User.findOne({ id: req.auth.sub }).lean();
    if (!user || accountStatus(user) !== "active") throw new AuthError("Sign in again to continue.", 401, "UNAUTHORIZED");
    res.json({ user: publicUser(user) });
  } catch (err) {
    sendError(res, err, "Could not load your account.");
  }
});

app.patch("/api/auth/me", requireStudent, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 80) throw new AuthError("Enter your name.");
    await connectDB();
    const user = await User.findOneAndUpdate({ id: req.auth.sub }, { name }, { new: true }).lean();
    if (!user) throw new AuthError("Account not found.", 401, "UNAUTHORIZED");
    res.json({ user: publicUser(user) });
  } catch (err) {
    sendError(res, err, "Could not update your profile.");
  }
});

function statePayload(doc) {
  const state = sanitizeState(fromStored(doc) || defaultState());
  return {
    state,
    updatedAt: doc?.clientUpdatedAt || doc?.updatedAt?.toISOString?.() || "",
  };
}

app.get("/api/state", requireStudent, async (req, res) => {
  try {
    await connectDB();
    const doc = await StudyState.findOne({ userId: req.auth.sub }).lean();
    res.json(statePayload(doc));
  } catch (err) {
    sendError(res, err, "Could not load your ledger.");
  }
});

app.put("/api/state", requireStudent, async (req, res) => {
  try {
    await connectDB();
    const incoming = req.body?.state && typeof req.body.state === "object" ? req.body.state : req.body;
    const state = sanitizeState(incoming);
    const encoded = JSON.stringify(state);
    if (encoded.length > 1_500_000) {
      res.status(413).json({ error: { message: "That ledger is too large to save.", code: "PAYLOAD_TOO_LARGE" } });
      return;
    }
    const keepOwned = (files) => (files || []).filter((file) => ownsKey(req.auth.sub, file.key));
    for (const chapter of Object.values(state.chapters)) chapter.files = keepOwned(chapter.files);
    for (const list of [state.tests, state.errors, state.logs, state.mocks]) {
      for (const row of list || []) row.files = keepOwned(row.files);
    }

    const existing = await StudyState.findOne({ userId: req.auth.sub }).lean();
    const base = String(req.body?.baseUpdatedAt || "");
    if (existing?.clientUpdatedAt && base && base !== existing.clientUpdatedAt) {
      res.status(409).json({
        error: { message: "This ledger was updated somewhere else.", code: "CONFLICT" },
        ...statePayload(existing),
      });
      return;
    }

    const clientUpdatedAt = new Date().toISOString();
    const saved = await StudyState.findOneAndUpdate(
      { userId: req.auth.sub },
      { $set: toStored(state, req.auth.sub, clientUpdatedAt) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    res.json(statePayload(saved));
  } catch (err) {
    sendError(res, err, "Could not save your ledger.");
  }
});

function decodePayload(data) {
  const text = String(data || "");
  const match = text.match(/^data:([^;]+);base64,(.+)$/);
  const b64 = match ? match[2] : text;
  const hinted = match ? match[1] : "";
  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length) throw new MediaError("The file is empty.");
  return { buffer, hinted };
}

app.post("/api/media/avatar", requireStudent, async (req, res) => {
  try {
    const { buffer, hinted } = decodePayload(req.body?.data);
    const type = prepareUpload(buffer, req.body?.contentType || hinted, { pdf: false });
    const key = `study/${req.auth.sub}/avatar.${extensionFor(type)}`;
    const url = await putObject({ key, body: buffer, contentType: type });
    await connectDB();
    const user = await User.findOne({ id: req.auth.sub });
    if (!user) throw new AuthError("Account not found.", 401, "UNAUTHORIZED");
    if (user.avatarKey && user.avatarKey !== key) await removeObject(user.avatarKey);
    user.avatarUrl = url;
    user.avatarKey = key;
    await user.save();
    res.json({ user: publicUser(user), url, key });
  } catch (err) {
    sendError(res, err, "Could not upload the photo.");
  }
});

app.delete("/api/media/avatar", requireStudent, async (req, res) => {
  try {
    await connectDB();
    const user = await User.findOne({ id: req.auth.sub });
    if (!user) throw new AuthError("Account not found.", 401, "UNAUTHORIZED");
    if (user.avatarKey) await removeObject(user.avatarKey);
    user.avatarUrl = "";
    user.avatarKey = "";
    await user.save();
    res.json({ user: publicUser(user) });
  } catch (err) {
    sendError(res, err, "Could not remove the photo.");
  }
});

app.post("/api/media/attachment", requireStudent, async (req, res) => {
  try {
    const { buffer, hinted } = decodePayload(req.body?.data);
    const type = prepareUpload(buffer, req.body?.contentType || hinted, { pdf: true });
    const key = `study/${req.auth.sub}/files/${crypto.randomUUID()}.${extensionFor(type)}`;
    const url = await putObject({ key, body: buffer, contentType: type });
    const name = String(req.body?.name || "Attachment").replace(/\s+/g, " ").trim().slice(0, 120) || "Attachment";
    res.json({ file: { id: crypto.randomUUID(), name, url, key, contentType: type } });
  } catch (err) {
    sendError(res, err, "Could not upload the file.");
  }
});

app.delete("/api/media/attachment", requireStudent, async (req, res) => {
  try {
    const key = String(req.body?.key || "");
    if (!ownsKey(req.auth.sub, key)) throw new MediaError("That file is not on your account.", 403, "FORBIDDEN");
    await removeObject(key);
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, "Could not delete the file.");
  }
});

mountDesk(app, { sendError });

app.use("/api", (_req, res) => {
  res.status(404).json({ error: { message: "Not found.", code: "NOT_FOUND" } });
});

if (!IS_VERCEL) {
  app.use((req, res, next) => {
    if (req.path.startsWith("/server") || req.path.startsWith("/scripts")) {
      res.status(404).end();
      return;
    }
    next();
  });
  app.use((req, res, next) => {
    if (req.path.endsWith(".js") || req.path.endsWith(".css") || req.path.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache");
    }
    next();
  });
  app.use(express.static(ROOT, { dotfiles: "ignore", index: "index.html" }));
  app.use((_req, res) => {
    res.sendFile(path.join(ROOT, "index.html"));
  });
}

export default app;

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (!IS_VERCEL && isMain) {
  app.listen(PORT, async () => {
    console.log("");
    console.log("  StudyMantra");
    console.log(`  http://localhost:${PORT}`);
    try {
      await connectDB();
      const diag = getMongoDiagnostics();
      console.log(`  MongoDB  connected → ${diag.database} @ ${diag.host}`);
    } catch (err) {
      console.log(`  MongoDB  FAILED — ${formatMongoError(err).message}`);
    }
    const storage = r2Diagnostics();
    console.log(storage.configured ? "  R2       configured" : `  R2       not configured (${storage.missing.join(", ")})`);
    console.log("");
  });
}
