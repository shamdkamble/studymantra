import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    avatarUrl: { type: String, default: "" },
    avatarKey: { type: String, default: "" },
    role: { type: String, enum: ["student", "admin"], default: "student" },
    status: { type: String, enum: ["pending", "approved", "active", "rejected", "disabled"], default: "active" },
    approvalCode: { type: String, default: "" },
    approvalIssuedAt: { type: Date, default: null },
    approvalExpiresAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
  },
  { collection: "study_users", timestamps: true, versionKey: false },
);

export const User = mongoose.models.StudyUser || mongoose.model("StudyUser", userSchema);
