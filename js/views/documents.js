import { chapterById } from "../syllabus.js";
import { listDocuments } from "../engine.js";
import { getData, ui } from "../store.js";
import { fileItems } from "../files.js";
import { esc, formatLong, yearLabel } from "../format.js";
import { chapterLink, emptyBlock } from "./bits.js";

export function documentsPage() {
  const query = ui.filters.documents.q;
  const rows = listDocuments(getData()).filter((row) => {
    const meta = chapterById(row.chapterId);
    if (ui.year !== "all" && row.list !== "mocks") {
      if (!meta || String(meta.year) !== String(ui.year)) return false;
    }
    if (!query) return true;
    const hay = `${row.file.name} ${row.source} ${row.topic} ${meta ? `${meta.no} ${meta.title}` : ""}`.toLowerCase();
    return hay.includes(query);
  });

  return `<header class="page-head">
      <div>
        <p class="eyebrow">${esc(yearLabel(ui.year))}</p>
        <h1>Documents</h1>
        <p class="lede">${rows.length} file${rows.length === 1 ? "" : "s"} in this view. Each one stays tied to the chapter or note it was uploaded from. The eye opens a preview.</p>
      </div>
    </header>
    <div class="toolbar">
      <input type="search" placeholder="Search name, chapter, or note" value="${esc(query)}" data-action="ui-search" data-group="documents">
    </div>
    ${rows.length ? `<div class="table-scroll"><table class="sheet sheet-loose docs-sheet">
      <thead><tr><th class="sticky">Document</th><th>From</th><th>Chapter</th><th>Topic</th><th>Date</th><th>View</th></tr></thead>
      <tbody>${rows.map((row) => {
        const meta = chapterById(row.chapterId);
        const target = row.list === "chapters"
          ? { chapter: row.rowId, iconOnly: true }
          : { list: row.list, id: row.rowId, iconOnly: true };
        return `<tr>
          <td class="sticky">${esc(row.file.name)}</td>
          <td>${esc(row.source)}</td>
          <td>${meta ? chapterLink(meta) : "—"}</td>
          <td>${esc(row.topic || (meta ? meta.title : "—"))}</td>
          <td>${esc(formatLong(row.date))}</td>
          <td><ul class="file-list docs-view">${fileItems([row.file], target)}</ul></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>` : emptyBlock("No documents yet", "Attach an image or PDF on a chapter, an error, a study session, a test, or a mock.")}`;
}
