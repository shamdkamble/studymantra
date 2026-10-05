/**
 * Email + password sessions. scrypt hashes, HMAC tokens.
 * A student session exists only after the desk code is redeemed.
 */

import crypto from "crypto";
import { promisify } from "util";
import { accountRole, accountStatus } from "./accounts.js";

const scrypt = promisify(crypto.scrypt);
const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(message, status = 400, code = "AUTH_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function secret() {
  return process.env.AUTH_SECRET || "studymantra-dev-secret-change-in-production";
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  if (!stored?.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const derived = await scrypt(password, salt, 64);
  const hashBuffer = Buffer.from(hash, "hex");
  if (derived.length !== hashBuffer.length) return false;
  return crypto.timingSafeEqual(derived, hashBuffer);
}

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function signToken(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS }));
  const signature = crypto.createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string" || token.split(".").length !== 3) {
    throw new AuthError("Sign in again to continue.", 401, "UNAUTHORIZED");
  }
  const [header, body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new AuthError("Sign in again to continue.", 401, "UNAUTHORIZED");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.exp || Date.now() > payload.exp) {
    throw new AuthError("Your session expired. Sign in again.", 401, "TOKEN_EXPIRED");
  }
  return payload;
}

export function readBearer(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function requireAuth(req, res, next) {
  try {
    req.auth = verifyToken(readBearer(req));
    next();
  } catch (err) {
    const status = err.status || 401;
    res.status(status).json({ error: { message: err.message || "Unauthorized.", code: err.code || "UNAUTHORIZED" } });
  }
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || "",
    role: accountRole(user),
    status: accountStatus(user),
  };
}

export function sessionFor(user) {
  const role = accountRole(user);
  return {
    token: signToken({ sub: user.id, email: user.email, role }),
    user: publicUser(user),
  };
}
