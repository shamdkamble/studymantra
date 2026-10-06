import assert from "node:assert/strict";
import test from "node:test";
import { defaultState } from "../js/engine.js";
import { installState } from "../js/store.js";
import { pageHtml } from "../js/pages.js";

installState(defaultState(), {
  id: "user-1",
  name: "Sham Kamble",
  email: "sham@example.com",
  avatarUrl: "",
});

const route = (name, parts = [name], query = "") => ({
  name,
  parts,
  query: new URLSearchParams(query),
  hash: `#/${parts.join("/")}${query ? `?${query}` : ""}`,
});

test("dashboard, subject, and records render without throwing", () => {
  const dashboard = pageHtml(route("dashboard"));
  assert.match(dashboard, /Exam readiness/);
  assert.match(dashboard, /Today/);
  assert.match(dashboard, /Mathematics Part 1|Maths Part 1/);

  const physics = pageHtml(route("subject", ["subject", "11", "phy"]));
  assert.match(physics, /Laws of Motion/);
  assert.match(physics, /Semiconductors/);
  assert.match(physics, /data-stage="pyq"/);

  const english = pageHtml(route("subject", ["subject", "12", "eng"]));
  assert.match(english, /An Astrologer&#39;s Day|An Astrologer's Day/);
  assert.match(english, /Language study/);
  assert.match(english, /Green Chemistry|Voyaging Towards Excellence/);

  assert.match(pageHtml(route("backlog")), /Backlog/);
  assert.match(pageHtml(route("revision")), /Revision/);
  assert.match(pageHtml(route("tests")), /Add test/);
  assert.match(pageHtml(route("errors")), /Silly mistake/);
  assert.match(pageHtml(route("log")), /Study log/);
  assert.match(pageHtml(route("log")), /data-pending="log"/);
  assert.match(pageHtml(route("errors")), /data-pending="error"/);
  assert.match(pageHtml(route("tests")), /data-pending="test"/);
  assert.match(pageHtml(route("mocks")), /data-pending="mock"/);
  assert.match(pageHtml(route("documents")), /Documents/);
  assert.match(pageHtml(route("documents")), /No documents yet/);
  assert.match(pageHtml(route("week")), /This week/);
  assert.match(pageHtml(route("cards")), /Flashcards/);
  assert.match(pageHtml(route("mocks")), /Percentile/);
  assert.match(pageHtml(route("pcm")), /Mathematics/);
  assert.match(pageHtml(route("settings")), /Cloudflare|File storage|Checking file storage/);
});

test("class 12 chemistry keeps the current final chapter", () => {
  const chemistry = pageHtml(route("subject", ["subject", "12", "chem"]));
  assert.match(chemistry, /Green Chemistry and Nanochemistry/);
  assert.doesNotMatch(chemistry, /Chemistry in Everyday Life/);
});
