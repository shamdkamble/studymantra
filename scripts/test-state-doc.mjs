import test from "node:test";
import assert from "node:assert/strict";
import { fromStored, toStored } from "../server/state-doc.js";

test("error log is stored off the reserved Mongoose path", () => {
  const stored = toStored({
    version: 1,
    chapters: {},
    tests: [],
    errors: [{ id: "e1", topic: "Limits" }],
    logs: [],
    mocks: [],
    cards: [],
    settings: {},
  }, "user-1", "2026-10-05T00:00:00.000Z");
  assert.equal(stored.userId, "user-1");
  assert.equal("errors" in stored, false);
  assert.equal(stored.errorItems[0].topic, "Limits");

  const restored = fromStored(stored);
  assert.equal(restored.errors[0].id, "e1");
  assert.equal(fromStored(null), null);
  assert.equal(fromStored({ errors: [{ id: "old" }] }).errors[0].id, "old");
});
