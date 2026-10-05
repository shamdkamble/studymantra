/**
 * Loads the account behind a token.
 * Admin routes check the database role. The token alone is not enough.
 */

import { AuthError, readBearer, verifyToken } from "./auth.js";
import { accountRole, accountStatus } from "./accounts.js";
import { connectDB } from "./db/mongodb.js";
import { User } from "./models/User.js";

function reject(res, err) {
  const status = err.status || 500;
  if (!err.status) console.error(err);
  res.status(status).json({
    error: {
      message: err.status ? err.message : "Could not check this account.",
      code: err.code || "SERVER_ERROR",
    },
  });
}

function readAuth(req) {
  req.auth = verifyToken(readBearer(req));
}

async function loadUser(req) {
  await connectDB();
  const user = await User.findOne({ id: req.auth.sub });
  if (!user) throw new AuthError("Sign in again to continue.", 401, "UNAUTHORIZED");
  return user;
}

export function requireAdmin(req, res, next) {
  try {
    readAuth(req);
  } catch (err) {
    reject(res, err);
    return;
  }
  loadUser(req).then((user) => {
    if (accountRole(user) !== "admin" || accountStatus(user) !== "active") {
      throw new AuthError("This desk is for the admin account.", 403, "FORBIDDEN");
    }
    req.account = user;
    next();
  }).catch((err) => reject(res, err));
}

export function requireStudent(req, res, next) {
  try {
    readAuth(req);
  } catch (err) {
    reject(res, err);
    return;
  }
  loadUser(req).then((user) => {
    if (accountRole(user) === "admin") {
      throw new AuthError("The desk does not keep a student ledger.", 403, "ADMIN_DESK");
    }
    if (accountStatus(user) !== "active") {
      throw new AuthError("Sign in again to continue.", 401, "UNAUTHORIZED");
    }
    req.account = user;
    next();
  }).catch((err) => reject(res, err));
}
