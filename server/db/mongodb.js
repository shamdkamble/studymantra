/**
 * MongoDB Atlas connection, serverless-safe.
 * Defaults to the `study-tracker` database so this app never writes into DSAMantra.
 */

import dns from "dns";
import mongoose from "mongoose";
import { ensureAdmin } from "../seed-admin.js";

const LOG_PREFIX = "[mongodb]";
const DEFAULT_DB_NAME = "study-tracker";

const globalCache = globalThis.__studyMongoCache ?? {
  conn: null,
  promise: null,
  lastError: null,
  source: null,
};
globalThis.__studyMongoCache = globalCache;

function cleanEnv(value) {
  if (!value?.trim()) return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function buildUriFromParts() {
  const user = cleanEnv(process.env.MONGODB_USER);
  const pass = cleanEnv(process.env.MONGODB_PASSWORD);
  const host = cleanEnv(process.env.MONGODB_HOST || process.env.MONGODB_CLUSTER);
  const db = cleanEnv(process.env.MONGODB_DB) || DEFAULT_DB_NAME;
  if (!user || !pass || !host) return null;

  const cleanHost = host.replace(/^mongodb\+srv:\/\//, "").replace(/\/$/, "");
  globalCache.source = "parts";
  return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${cleanHost}/${db}?retryWrites=true&w=majority&appName=StudyMantra`;
}

function normalizeExistingUri(raw) {
  let uri = raw.trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, "");
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    throw new Error("MONGODB_URI must start with mongodb:// or mongodb+srv://");
  }
  const match = uri.match(/^(mongodb(?:\+srv)?:\/\/)(?:([^:@]+)(?::([^@]*))?@)?([^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/);
  if (match) {
    const [, protocol, user, pass, host, path = "", query = "", hash = ""] = match;
    const encodedUser = user ? encodeURIComponent(decodeURIComponent(user)) : "";
    const encodedPass = pass ? encodeURIComponent(decodeURIComponent(pass)) : "";
    const auth = encodedUser ? `${encodedUser}${encodedPass ? `:${encodedPass}` : ""}@` : "";
    let dbPath = (path || "").replace(/^\/+/, "");
    if (!dbPath) dbPath = DEFAULT_DB_NAME;
    const qs = query || "?retryWrites=true&w=majority";
    uri = `${protocol}${auth}${host}/${dbPath}${qs}${hash || ""}`;
  }
  globalCache.source = "uri";
  return uri;
}

export function getMongoUri() {
  const fromParts = buildUriFromParts();
  if (fromParts) return fromParts;
  const raw = process.env.MONGODB_URI;
  if (!raw?.trim()) {
    globalCache.source = null;
    return null;
  }
  return normalizeExistingUri(raw);
}

export function getMongoUriForLogs() {
  try {
    const uri = getMongoUri();
    if (!uri) return "(not set)";
    return uri.replace(/:([^:@/]+)@/, ":***@");
  } catch (err) {
    return `(invalid: ${err.message})`;
  }
}

export function formatMongoError(err) {
  if (!err) return { message: "Unknown database error", code: "DB_ERROR" };
  const base = {
    message: err.message || String(err),
    code: err.code || err.name || "DB_ERROR",
    name: err.name,
  };
  if (err.codeName) base.codeName = err.codeName;
  if (base.message.includes("bad auth") || base.codeName === "AtlasError") {
    base.hint = "Check MONGODB_USER and MONGODB_PASSWORD. This app uses the study-tracker database on the same cluster as DSAMantra.";
  }
  return base;
}

function getConnectOptions() {
  return {
    maxPoolSize: process.env.VERCEL ? 5 : 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 15000,
    family: 4,
    retryWrites: true,
    w: "majority",
  };
}

function remember(conn) {
  globalCache.conn = conn;
  globalCache.lastError = null;
  console.log(`${LOG_PREFIX} connected db=${mongoose.connection.name} host=${mongoose.connection.host}`);
  return conn;
}

export async function connectDB() {
  if (globalCache.conn && mongoose.connection.readyState === 1) {
    await ensureAdmin();
    return globalCache.conn;
  }
  if (mongoose.connection.readyState === 1) {
    globalCache.conn = mongoose;
    await ensureAdmin();
    return mongoose;
  }

  const uri = getMongoUri();
  if (!uri) {
    const err = new Error("MongoDB is not configured. Set MONGODB_USER, MONGODB_PASSWORD, and MONGODB_HOST.");
    err.code = "MONGODB_URI_MISSING";
    throw err;
  }

  if (!globalCache.promise) {
    mongoose.set("strictQuery", true);
    globalCache.promise = (async () => {
      try {
        return await remember(await mongoose.connect(uri, getConnectOptions()));
      } catch (err) {
        const refused = err?.syscall === "querySrv" && (err.code === "ECONNREFUSED" || err.code === "ETIMEOUT" || err.code === "ESERVFAIL");
        if (!refused || globalCache.publicDns) throw err;
        globalCache.publicDns = true;
        try { dns.setServers(["1.1.1.1", "8.8.8.8"]); } catch { /* keep the system resolver */ }
        await mongoose.disconnect().catch(() => {});
        return await remember(await mongoose.connect(uri, getConnectOptions()));
      }
    })().catch((err) => {
      globalCache.promise = null;
      globalCache.conn = null;
      globalCache.lastError = formatMongoError(err);
      console.error(`${LOG_PREFIX} connection failed:`, globalCache.lastError.message);
      throw err;
    });
  }

  const conn = await globalCache.promise;
  await ensureAdmin();
  return conn;
}

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

export function getMongoDiagnostics() {
  let configured = false;
  try {
    configured = Boolean(getMongoUri());
  } catch {
    configured = false;
  }
  return {
    configured,
    source: globalCache.source,
    uriPreview: getMongoUriForLogs(),
    connected: isMongoConnected(),
    database: mongoose.connection.name || null,
    host: mongoose.connection.host || null,
    runtime: process.env.VERCEL ? "vercel" : "node",
    lastError: globalCache.lastError,
  };
}
