import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    avatarUrl: { type: String, default: "" },
    avatarKey: { type: String, default: "" },
  },
  { collection: "study_users", timestamps: true, versionKey: false },
);

export const User = mongoose.models.StudyUser || mongoose.model("StudyUser", userSchema);
