/**
 * Desk actions. Approving issues a fresh code. Redeeming it is a student route.
 */

import { AuthError } from "./auth.js";
import { CODE_TTL_MS, accountRole, accountStatus, formatCode, makeApprovalCode } from "./accounts.js";
import { connectDB } from "./db/mongodb.js";
import { buildDesk, buildDetail } from "./desk.js";
import { requireAdmin } from "./guard.js";
import { StudyState } from "./models/StudyState.js";
import { User } from "./models/User.js";

async function students() {
  await connectDB();
  const users = await User.find({ role: { $ne: "admin" } }).lean();
  const ids = users.map((user) => user.id);
  const states = ids.length ? await StudyState.find({ userId: { $in: ids } }).lean() : [];
  return { users, states };
}

async function studentById(id) {
  await connectDB();
  const user = await User.findOne({ id: String(id || "") });
  if (!user || accountRole(user) === "admin") {
    throw new AuthError("That student was not found.", 404, "NOT_FOUND");
  }
  return user;
}

function issue(user) {
  const code = makeApprovalCode();
  user.status = "approved";
  user.approvalCode = code;
  user.approvalIssuedAt = new Date();
  user.approvalExpiresAt = new Date(Date.now() + CODE_TTL_MS);
  return formatCode(code);
}

export function mountDesk(app, { sendError }) {
  app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
    try {
      const { users, states } = await students();
      res.json(buildDesk(users, states));
    } catch (err) {
      sendError(res, err, "Could not load the desk.");
    }
  });

  app.get("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const user = await studentById(req.params.id);
      const doc = await StudyState.findOne({ userId: user.id }).lean();
      const detail = buildDetail(user, doc);
      if (!detail) throw new AuthError("That student was not found.", 404, "NOT_FOUND");
      res.json({ user: detail });
    } catch (err) {
      sendError(res, err, "Could not load that student.");
    }
  });

  app.post("/api/admin/users/:id/approve", requireAdmin, async (req, res) => {
    try {
      const user = await studentById(req.params.id);
      const status = accountStatus(user);
      if (status === "active") throw new AuthError("This student already has a ledger.", 400, "ALREADY_ACTIVE");
      if (status === "disabled") throw new AuthError("Enable the account instead of issuing a code.", 400, "DISABLED");
      if (status === "rejected") throw new AuthError("This request was declined. They can send a new one.", 400, "REJECTED");
      const code = issue(user);
      await user.save();
      res.json({ code, expiresAt: user.approvalExpiresAt });
    } catch (err) {
      sendError(res, err, "Could not approve that request.");
    }
  });

  app.post("/api/admin/users/:id/reject", requireAdmin, async (req, res) => {
    try {
      const user = await studentById(req.params.id);
      const status = accountStatus(user);
      if (status !== "pending" && status !== "approved") {
        throw new AuthError("Only a waiting request can be declined.", 400, "NOT_PENDING");
      }
      user.status = "rejected";
      user.approvalCode = "";
      user.approvalIssuedAt = null;
      user.approvalExpiresAt = null;
      await user.save();
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err, "Could not decline that request.");
    }
  });

  app.post("/api/admin/users/:id/disable", requireAdmin, async (req, res) => {
    try {
      const user = await studentById(req.params.id);
      if (accountStatus(user) !== "active") throw new AuthError("Only an open ledger can be disabled.", 400, "NOT_ACTIVE");
      user.status = "disabled";
      await user.save();
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err, "Could not disable that account.");
    }
  });

  app.post("/api/admin/users/:id/enable", requireAdmin, async (req, res) => {
    try {
      const user = await studentById(req.params.id);
      if (accountStatus(user) !== "disabled") throw new AuthError("This account is not disabled.", 400, "NOT_DISABLED");
      user.status = "active";
      await user.save();
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err, "Could not enable that account.");
    }
  });
}
