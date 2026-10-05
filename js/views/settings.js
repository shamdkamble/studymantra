import { daysUntil, todayISO } from "../engine.js";
import { getData, getUser, ui } from "../store.js";
import { esc, formatLong } from "../format.js";

function databaseLine() {
  const mongo = ui.health?.mongo;
  if (ui.health?.ok && mongo?.database) {
    return `Database: ${mongo.database} on the same Atlas cluster as DSAMantra, in its own collections.`;
  }
  return "Database is not connected. This browser keeps a copy and will sync when Atlas answers. The database must be study-tracker, not the DSAMantra database.";
}

export function settingsPage() {
  const user = getUser();
  const settings = getData().settings;
  const today = todayISO();
  const storage = ui.health?.storage;
  const storageText = !ui.health
    ? "Checking file storage…"
    : storage?.configured
      ? "Cloudflare R2 is ready. Photos and PDFs go to the DSAMantra bucket, under study/. The bucket is public-read, so a link is unlisted, not private."
      : `File storage is not configured${storage?.missing?.length ? ` (${storage.missing.join(", ")})` : ""}. The ledger still saves. Add the same R2 keys used by DSAMantra.`;

  return `<header class="page-head">
      <div>
        <p class="eyebrow">Account and data</p>
        <h1>Settings</h1>
        <p class="lede">Targets decide the streak. A day counts only when the hour goal, the question goal, and the chapter goal are all met. Set a goal to 0 to ignore it.</p>
      </div>
    </header>
    <div class="settings-grid">
      <section class="panel">
        <h2>Profile</h2>
        <form class="stack" data-form="profile">
          <div class="profile-row">
            ${user.avatarUrl ? `<img class="avatar lg" src="${esc(user.avatarUrl)}" alt="">` : `<span class="avatar lg avatar-fallback">${esc(initials(user.name))}</span>`}
            <div>
              <label class="btn btn-ghost btn-small">Upload photo<input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" data-action="avatar"></label>
              ${user.avatarUrl ? `<button type="button" class="text-btn" data-action="remove-avatar">Remove</button>` : ""}
            </div>
          </div>
          <label class="field"><span>Name</span><input name="name" required minlength="2" maxlength="80" value="${esc(user.name)}"></label>
          <label class="field"><span>Email</span><input value="${esc(user.email)}" disabled></label>
          <button class="btn btn-primary" type="submit">Save profile</button>
        </form>
      </section>
      <section class="panel">
        <h2>Daily target</h2>
        <form class="stack" data-form="targets">
          <label class="field"><span>Chapters touched</span><input name="dailyChapters" type="number" min="0" max="20" value="${settings.dailyChapters}"></label>
          <label class="field"><span>Questions</span><input name="dailyQuestions" type="number" min="0" max="500" value="${settings.dailyQuestions}"></label>
          <label class="field"><span>Hours</span><input name="dailyHours" type="number" min="0" max="16" value="${settings.dailyHours}"></label>
          <label class="field"><span>Focus minutes</span><input name="pomodoroMin" type="number" min="5" max="90" value="${settings.pomodoroMin}"></label>
          <label class="field"><span>Break minutes</span><input name="breakMin" type="number" min="1" max="30" value="${settings.breakMin}"></label>
          <button class="btn btn-primary" type="submit">Save targets</button>
        </form>
      </section>
      <section class="panel">
        <h2>Exams</h2>
        <form class="stack" data-form="exams">
          <label class="field"><span>Primary name</span><input name="examLabel" maxlength="40" value="${esc(settings.examLabel)}"></label>
          <label class="field"><span>Primary date</span><input name="examDate" type="date" value="${esc(settings.examDate || "")}"></label>
          <label class="field"><span>Second name</span><input name="secondExamLabel" maxlength="40" value="${esc(settings.secondExamLabel)}"></label>
          <label class="field"><span>Second date</span><input name="secondExamDate" type="date" value="${esc(settings.secondExamDate || "")}"></label>
          <p class="muted">${countdown(settings.examLabel, settings.examDate, today)} ${countdown(settings.secondExamLabel, settings.secondExamDate, today)}</p>
          <button class="btn btn-primary" type="submit">Save dates</button>
        </form>
      </section>
      <section class="panel">
        <h2>Backup</h2>
        <p>${settings.lastExportAt ? `Last export ${esc(formatLong(String(settings.lastExportAt).slice(0, 10)))}.` : "No export yet."}</p>
        <div class="form-actions">
          <button type="button" class="btn btn-primary" data-action="export">Export JSON</button>
          <label class="btn btn-ghost">Import JSON<input class="sr-only" type="file" accept="application/json,.json" data-action="import"></label>
        </div>
        <button type="button" class="text-btn danger" data-action="reset-ask">Reset ledger…</button>
        <p class="muted">Import replaces the ledger after you confirm. Reset asks you to type RESET.</p>
      </section>
      <section class="panel">
        <h2>Files</h2>
        <p>${esc(storageText)}</p>
        <p class="muted">The shared bucket is public-read. A file link is unlisted, not private.</p>
        <p class="muted">${esc(databaseLine())}</p>
      </section>
      <section class="panel">
        <h2>This ledger</h2>
        <p>Maharashtra HSC, Balbharati 2026–27. Class 11 and 12. Mathematics is split into Part 1 and Part 2. English keeps unseen passages and grammar beside the textbook, not inside a prose chapter. Class 12 chemistry ends with Green Chemistry and Nanochemistry.</p>
        <p class="muted">StudyMantra by Sham Kamble. Shortcuts: press ? . Search: Ctrl K or / .</p>
        <button type="button" class="btn btn-ghost" data-action="logout">Sign out</button>
      </section>
    </div>`;
}

function initials(name) {
  return String(name || "?").split(" ").slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

function countdown(label, iso, today) {
  if (!iso) return "";
  const days = daysUntil(iso, today);
  if (days == null) return "";
  if (days > 0) return `${days} days to ${label}.`;
  if (days === 0) return `${label} is today.`;
  return `${label} was ${Math.abs(days)} days ago.`;
}
