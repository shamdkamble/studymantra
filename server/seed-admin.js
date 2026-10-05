/**
 * Creates the desk account from ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD.
 * An account that is already the admin is left unchanged, including its password.
 */

import crypto from "crypto";
import { hashPassword } from "./auth.js";
import { accountRole } from "./accounts.js";
import { User } from "./models/User.js";

let pending = null;

export function ensureAdmin() {
  if (!pending) {
    pending = seed().catch((err) => {
      pending = null;
      console.error("[admin] seed failed:", err.message);
    });
  }
  return pending;
}

async function seed() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const name = String(process.env.ADMIN_NAME || "Sham").trim().replace(/\s+/g, " ") || "Sham";
  if (!email || password.length < 8) return;

  const existing = await User.findOne({ email });
  if (!existing) {
    await User.create({
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "admin",
      status: "active",
    });
    console.log("[admin] desk account created");
    return;
  }

  if (accountRole(existing) === "admin") return;

  existing.role = "admin";
  existing.status = "active";
  existing.name = name;
  existing.passwordHash = await hashPassword(password);
  existing.approvalCode = "";
  existing.approvalIssuedAt = null;
  existing.approvalExpiresAt = null;
  await existing.save();
  console.log("[admin] existing account promoted to the desk");
}
