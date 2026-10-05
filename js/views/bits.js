import { selectChapters, subjectById } from "../syllabus.js";
import { ui } from "../store.js";
import { esc } from "../format.js";

export function scoped(extra = {}) {
  const year = ui.year === "all" ? "all" : Number(ui.year);
  return selectChapters({ year, ...extra });
}

export function subjectName(id) {
  return subjectById(id)?.short || "Subject";
}

export function chapterLink(meta) {
  if (!meta) return "<span class=\"muted\">—</span>";
  const subject = subjectById(meta.subjectId);
  return `<a class="jump" href="#/subject/${meta.year}/${meta.subjectId}?chapter=${encodeURIComponent(meta.id)}"><span class="mark">${esc(subject?.mark || "")}</span> ${esc(meta.no)} ${esc(meta.title)}</a>`;
}

export function emptyBlock(title, text) {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${text}</p></div>`;
}

export function subjectOptions(selected = "") {
  const { SUBJECTS } = requireSubject();
  return [`<option value="">Subject</option>`].concat(SUBJECTS.map((subject) => {
    const on = subject.id === selected ? " selected" : "";
    return `<option value="${subject.id}"${on}>${esc(subject.short)}</option>`;
  })).join("");
}

function requireSubject() {
  return { SUBJECTS: subjectList() };
}

function subjectList() {
  return [
    subjectById("m1"),
    subjectById("m2"),
    subjectById("phy"),
    subjectById("chem"),
    subjectById("cs1"),
    subjectById("cs2"),
    subjectById("eng"),
  ].filter(Boolean);
}

export { subjectList };
