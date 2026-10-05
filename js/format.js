export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function pct(ratio) {
  if (ratio == null || Number.isNaN(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
}

export function band(ratio) {
  const n = Math.round((ratio || 0) * 100);
  if (n >= 75) return "good";
  if (n >= 40) return "mid";
  if (n > 0) return "low";
  return "zero";
}

export function bar(ratio, label = "") {
  const width = ratio == null ? 0 : Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const name = label ? ` aria-label="${esc(label)}"` : "";
  return `<span class="bar" data-band="${band(ratio)}"${name}><span style="width:${width}%"></span></span>`;
}

export function pill(text, tone) {
  return `<span class="pill" data-tone="${tone}">${esc(text)}</span>`;
}

export function statusPill(status) {
  if (status === "complete") return pill("Complete", "green");
  if (status === "in_progress") return pill("In progress", "amber");
  return pill("Not started", "muted");
}

export function formatLong(iso) {
  if (!iso) return "—";
  const date = iso.length === 10
    ? new Date(...iso.split("-").map((part, index) => index === 1 ? Number(part) - 1 : Number(part)))
    : new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatHours(minutes) {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

export function yearLabel(year) {
  if (year === "11" || year === 11) return "Class 11";
  if (year === "12" || year === 12) return "Class 12";
  return "Class 11 + 12";
}

export function greeting(name, now = new Date()) {
  const hour = now.getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = String(name || "there").trim().split(" ")[0];
  return `${part}, ${first}`;
}

export function weekdayLetter(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][new Date(y, m - 1, d).getDay()];
}

export function optionList(items, current) {
  return items.map(([value, label]) => {
    const selected = String(value) === String(current) ? " selected" : "";
    return `<option value="${esc(value)}"${selected}>${esc(label)}</option>`;
  }).join("");
}

export function field(label, control, hint = "") {
  return `<label class="field"><span>${esc(label)}</span>${control}${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
}
