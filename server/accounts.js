/**
 * Account role, status, and the one-time approval code.
 * Pure helpers. The desk stores the code until the student redeems it.
 */

import crypto from "crypto";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function accountRole(user) {
  return user?.role === "admin" ? "admin" : "student";
}

export function accountStatus(user) {
  const status = user?.status;
  if (status === "pending" || status === "approved" || status === "active" || status === "rejected" || status === "disabled") {
    return status;
  }
  return "active";
}

export function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatCode(value) {
  const raw = normalizeCode(value);
  if (raw.length <= 4) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function makeApprovalCode() {
  const bytes = crypto.randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i += 1) raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return raw;
}

export function codesMatch(stored, given) {
  const left = Buffer.from(normalizeCode(stored));
  const right = Buffer.from(normalizeCode(given));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function codeExpired(user, now = Date.now()) {
  if (!user?.approvalExpiresAt) return false;
  const time = new Date(user.approvalExpiresAt).getTime();
  return Number.isFinite(time) && time <= now;
}

export function loginDenial(user) {
  const role = accountRole(user);
  const status = accountStatus(user);
  if (role === "admin") {
    if (status === "disabled") {
      return { status: 403, code: "DISABLED", message: "This desk is disabled." };
    }
    return null;
  }
  if (status === "active") return null;
  if (status === "pending") {
    return {
      status: 403,
      code: "PENDING",
      message: "Your request is waiting. When Sham approves it, enter the code on the approval page.",
    };
  }
  if (status === "approved") {
    return {
      status: 403,
      code: "AWAITING_CODE",
      message: "Your request is approved. Enter the code Sham sent you on the approval page.",
    };
  }
  if (status === "rejected") {
    return {
      status: 403,
      code: "REJECTED",
      message: "This request was declined. You can send a new one from the request page.",
    };
  }
  return {
    status: 403,
    code: "DISABLED",
    message: "This account is disabled. Ask Sham if that is a mistake.",
  };
}
