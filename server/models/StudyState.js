import mongoose from "mongoose";

const studyStateSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    version: { type: Number, default: 1 },
    chapters: { type: mongoose.Schema.Types.Mixed, default: {} },
    tests: { type: [mongoose.Schema.Types.Mixed], default: [] },
    errorItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
    logs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    mocks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    cards: { type: [mongoose.Schema.Types.Mixed], default: [] },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    clientUpdatedAt: { type: String, default: "" },
  },
  { collection: "study_states", timestamps: true, versionKey: false },
);

export const StudyState = mongoose.models.StudyState || mongoose.model("StudyState", studyStateSchema);
