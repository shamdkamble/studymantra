import { esc } from "./format.js";

export const FILE_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

const EYE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.75"/></svg>`;

const pendingFiles = { error: [], log: [], test: [], mock: [] };

export function rememberPending(kind, file) {
  const bucket = pendingFiles[kind] || (pendingFiles[kind] = []);
  bucket.push(file);
  if (bucket.length > 8) bucket.splice(0, bucket.length - 8);
}

export function forgetPending(kind, key) {
  pendingFiles[kind] = (pendingFiles[kind] || []).filter((file) => file.key !== key);
}

export function takePending(kind) {
  const files = [...(pendingFiles[kind] || [])];
  pendingFiles[kind] = [];
  return files;
}

export function clearPending() {
  for (const kind of Object.keys(pendingFiles)) pendingFiles[kind] = [];
}

export function paintPending(kind) {
  const list = document.querySelector(`[data-pending-list="${kind}"]`);
  if (list) list.innerHTML = fileItems(pendingFiles[kind], { pending: kind });
}

export function fileItems(files, target = {}) {
  return (files || []).map((file) => `<li>
    ${target.iconOnly ? "" : `<span class="file-name">${esc(file.name)}</span>`}
    <button type="button" class="eye-btn" data-action="preview-file" data-url="${esc(file.url)}" data-name="${esc(file.name)}" data-type="${esc(file.contentType || "")}" aria-label="View ${esc(file.name)}">${EYE}</button>
    <button type="button" class="text-btn" data-action="detach" data-key="${esc(file.key)}"${target.chapter ? ` data-chapter="${esc(target.chapter)}"` : ""}${target.list ? ` data-list="${esc(target.list)}"` : ""}${target.id ? ` data-id="${esc(target.id)}"` : ""}${target.pending ? ` data-pending="${esc(target.pending)}"` : ""}>Remove</button>
  </li>`).join("");
}

function attachControl(target) {
  const attrs = [
    target.chapter ? `data-chapter="${esc(target.chapter)}"` : "",
    target.list ? `data-list="${esc(target.list)}"` : "",
    target.id ? `data-id="${esc(target.id)}"` : "",
    target.pending ? `data-pending="${esc(target.pending)}"` : "",
  ].filter(Boolean).join(" ");
  return `<label class="btn btn-ghost btn-small">Attach image or PDF<input class="sr-only" type="file" accept="${FILE_ACCEPT}" data-action="attach" ${attrs}></label>`;
}

export function fileBlock(files, target = {}) {
  const items = fileItems(files, target);
  if (target.compact && !items) return `<div class="file-block">${attachControl(target)}</div>`;
  return `<div class="file-block">
    ${items ? `<ul class="file-list">${items}</ul>` : `<p class="muted file-empty">No files yet.</p>`}
    ${attachControl(target)}
  </div>`;
}

export function pendingFileField(kind) {
  return `<div class="field field-wide file-field">
    <span>Files</span>
    <ul class="file-list" data-pending-list="${kind}">${fileItems(pendingFiles[kind], { pending: kind })}</ul>
    ${attachControl({ pending: kind })}
    <small>Images and PDFs. The eye opens a preview, and Documents lists every file with the note it came from.</small>
  </div>`;
}
