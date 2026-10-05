import { api } from "../api.js";
import { bar, esc, formatHours, formatLong, pct, pill } from "../format.js";

let overview = null;
let detail = null;
let detailFor = "";
let search = "";

const TONE = {
  pending: ["Waiting", "amber"],
  approved: ["Code out", "blue"],
  active: ["Active", "green"],
  rejected: ["Declined", "red"],
  disabled: ["Disabled", "muted"],
};

export function deskQuery() {
  return search;
}

export function setDeskQuery(value) {
  search = String(value || "");
}

export function invalidateDesk() {
  overview = null;
  detail = null;
  detailFor = "";
}

export async function loadDesk(userId, { fresh = false } = {}) {
  if (fresh || !overview) overview = await api("/api/admin/overview");
  if (!userId) {
    detail = null;
    detailFor = "";
    return overview;
  }
  if (fresh || detailFor !== userId || !detail) {
    detail = await api(`/api/admin/users/${encodeURIComponent(userId)}`);
    detailFor = userId;
  }
  return overview;
}

export function previewDesk(data, person = null) {
  overview = data;
  detail = person ? { user: person } : null;
  detailFor = person?.id || "";
  return deskHtml();
}

export function deskHtml() {
  const data = overview || { counts: {}, queue: [], codes: [], students: [], declined: [], recent: [] };
  const counts = data.counts || {};
  const needle = search.trim().toLowerCase();
  const match = (row) => !needle || `${row.name} ${row.email}`.toLowerCase().includes(needle);
  const person = detail?.user && detail.user.id === detailFor ? detail.user : null;

  return `<header class="page-head">
      <div>
        <p class="eyebrow">StudyMantra</p>
        <h1>Desk</h1>
        <p class="lede">Approve a request to issue a one-time code. The student enters it once, then signs in with the password they chose. Declining lets them ask again. Disabling keeps the ledger and blocks sign-in.</p>
      </div>
    </header>
    <section class="kpi-grid" aria-label="Desk counts">
      ${kpi("Waiting", counts.pending || 0, "No code yet")}
      ${kpi("Codes out", counts.approved || 0, "Not redeemed")}
      ${kpi("Students", counts.active || 0, "Ledgers open")}
      ${kpi("Disabled", counts.disabled || 0, "Sign-in blocked")}
    </section>
    ${person ? detailBlock(person) : ""}
    <label class="field desk-search"><span>Find a student</span><input data-action="desk-search" type="search" value="${esc(search)}" placeholder="Name or email"></label>
    ${section("Waiting for approval", "These students cannot sign in yet.", visible(data.queue, match), (row) => queueRow(row), "No one is waiting.")}
    ${section("Codes to hand out", "Shown here until the student enters the code. A new code replaces the old one.", visible(data.codes, match), (row) => codeRow(row), "No codes are waiting.")}
    ${section("Students", "Progress is the weighted ledger score.", visible(data.students, match), (row) => studentRow(row), "No open ledgers yet.")}
    ${section("Recent activity", "Study logs and tests. Chapter notes stay on the student ledger.", (data.recent || []).filter((row) => !needle || row.name.toLowerCase().includes(needle)), (row) => activityRow(row), "No study activity yet.")}
    ${(data.declined || []).length ? section("Declined", "They can send a new request with the same email.", visible(data.declined, match), (row) => declinedRow(row), "Nothing matches.") : ""}`;
}

function kpi(label, value, hint) {
  return `<article class="kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></article>`;
}

function visible(rows, match) {
  return (rows || []).filter(match);
}

function section(title, hint, rows, render, empty) {
  const body = rows.length
    ? `<ul class="desk-list">${rows.map(render).join("")}</ul>`
    : `<p class="empty">${esc(empty)}</p>`;
  return `<section class="panel"><div class="panel-head"><h2>${esc(title)}</h2><span class="muted">${esc(hint)}</span></div>${body}</section>`;
}

function whoInner(row) {
  const [label, tone] = TONE[row.status] || [row.status, "muted"];
  return `<b>${esc(row.name)}</b><small>${esc(row.email)}</small>${pill(label, tone)}`;
}

function who(row) {
  return `<div class="desk-who">${whoInner(row)}</div>`;
}

function queueRow(row) {
  return `<li class="desk-row">
    ${who(row)}
    <p class="muted">Requested ${esc(formatLong(row.createdAt))}</p>
    <div class="desk-actions">
      <button type="button" class="btn btn-primary btn-small" data-action="desk-approve" data-id="${esc(row.id)}">Approve</button>
      <button type="button" class="btn btn-danger btn-small" data-action="desk-reject" data-id="${esc(row.id)}">Decline</button>
    </div>
  </li>`;
}

function codeRow(row) {
  const code = row.code
    ? `<button type="button" class="code-chip" data-action="desk-copy" data-code="${esc(row.code)}">${esc(row.code)}</button>`
    : pill(row.codeExpired ? "Expired" : "Missing", "red");
  return `<li class="desk-row">
    ${who(row)}
    <div class="desk-code">${code}<small class="muted">${row.codeExpired ? "Ask is still approved" : `Expires ${esc(formatLong(row.codeExpiresAt))}`}</small></div>
    <div class="desk-actions">
      <button type="button" class="btn btn-small" data-action="desk-approve" data-id="${esc(row.id)}">New code</button>
      <button type="button" class="btn btn-danger btn-small" data-action="desk-reject" data-id="${esc(row.id)}">Withdraw</button>
    </div>
  </li>`;
}

function studentRow(row) {
  const open = row.status === "active";
  return `<li class="desk-row">
    <a class="desk-who" href="#/admin?user=${encodeURIComponent(row.id)}">${whoInner(row)}</a>
    <div class="desk-readiness">${bar(row.weighted, "Weighted readiness")}<small>${pct(row.weighted)} weighted · ${row.complete} complete · last ${esc(formatLong(row.lastActivity))}</small></div>
    <div class="desk-actions">
      <a class="btn btn-small" href="#/admin?user=${encodeURIComponent(row.id)}">Open</a>
      ${open
        ? `<button type="button" class="btn btn-danger btn-small" data-action="desk-disable" data-id="${esc(row.id)}">Disable</button>`
        : `<button type="button" class="btn btn-small" data-action="desk-enable" data-id="${esc(row.id)}">Enable</button>`}
    </div>
  </li>`;
}

function declinedRow(row) {
  return `<li class="desk-row">${who(row)}<p class="muted">Declined request</p><span></span></li>`;
}

function activityRow(row) {
  return `<li class="desk-row desk-activity">
    <a href="#/admin?user=${encodeURIComponent(row.userId)}"><b>${esc(row.name)}</b></a>
    <p>${esc(row.text)}</p>
    <small class="muted">${esc(formatLong(row.date))}</small>
  </li>`;
}

function detailBlock(row) {
  const open = row.status === "active";
  const blocked = row.status === "disabled";
  return `<section class="panel desk-detail">
    <div class="panel-head">
      <div><p class="eyebrow"><a href="#/admin">All students</a></p><h2>${esc(row.name)}</h2><p class="muted">${esc(row.email)}</p></div>
      <div class="desk-actions">
        ${(TONE[row.status] ? pill(TONE[row.status][0], TONE[row.status][1]) : "")}
        ${open ? `<button type="button" class="btn btn-danger btn-small" data-action="desk-disable" data-id="${esc(row.id)}">Disable</button>` : ""}
        ${blocked ? `<button type="button" class="btn btn-small" data-action="desk-enable" data-id="${esc(row.id)}">Enable</button>` : ""}
        ${row.status === "pending" || row.status === "approved" ? `<button type="button" class="btn btn-primary btn-small" data-action="desk-approve" data-id="${esc(row.id)}">${row.code ? "New code" : "Approve"}</button>` : ""}
      </div>
    </div>
    ${row.code ? `<p class="desk-code">Code <button type="button" class="code-chip" data-action="desk-copy" data-code="${esc(row.code)}">${esc(row.code)}</button></p>` : ""}
    <div class="kpi-grid">
      ${kpi("Weighted", pct(row.weighted), `${pct(row.raw)} of stages ticked`)}
      ${kpi("Complete", `${row.complete}/${row.chapters}`, `${row.progress} in progress`)}
      ${kpi("Last 7 days", formatHours(row.minutes7), `${formatHours(row.minutesAll)} logged in total`)}
      ${kpi("Tests", row.testCount || 0, `${row.unfixedCount || 0} unfixed errors`)}
    </div>
    <div class="split-3">
      ${miniList("Study log", row.logs, (item) => `<b>${esc(item.subject || "Study")}</b><small>${esc([item.chapter, formatHours(item.minutes), formatLong(item.date)].filter(Boolean).join(" · "))}</small>${item.note ? `<small>${esc(item.note)}</small>` : ""}`)}
      ${miniList("Tests", row.tests, (item) => `<b>${esc(item.type || "Test")}</b><small>${esc([item.subject, item.chapter, `${item.marks}/${item.total}`, formatLong(item.date)].filter(Boolean).join(" · "))}</small>`)}
      ${miniList("Unfixed errors", row.unfixed, (item) => `<b>${esc(item.topic || "Error")}</b><small>${esc([item.subject, item.type, formatLong(item.date)].filter(Boolean).join(" · "))}</small>`)}
    </div>
  </section>`;
}

function miniList(title, rows, render) {
  const body = rows?.length
    ? `<ul class="plain">${rows.map((item) => `<li>${render(item)}</li>`).join("")}</ul>`
    : `<p class="empty">None yet.</p>`;
  return `<div><h3>${esc(title)}</h3>${body}</div>`;
}
