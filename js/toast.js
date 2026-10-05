import { esc } from "./format.js";

export function toast(message, action = null) {
  const root = document.getElementById("toaster");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      action.run();
      el.remove();
    });
    el.appendChild(button);
  }
  root.appendChild(el);
  setTimeout(() => el.remove(), action ? 7000 : 3400);
}

export function closeModal() {
  const root = document.getElementById("modal-root");
  if (!root) return;
  root.innerHTML = "";
  root.hidden = true;
}

export function openModal({ title, body, confirmLabel = "Confirm", danger = false, onConfirm }) {
  const root = document.getElementById("modal-root");
  root.hidden = false;
  root.innerHTML = `<div class="modal-scrim" data-action="modal-close"></div>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">${esc(title)}</h2>
      <div class="modal-body">${body}</div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="modal-close">Cancel</button>
        <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="modal-confirm">${esc(confirmLabel)}</button>
      </div>
    </div>`;
  root.querySelector("[data-action='modal-confirm']").addEventListener("click", async () => {
    const ok = await onConfirm();
    if (ok !== false) closeModal();
  });
}
