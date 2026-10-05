import { esc } from "./format.js";

export function columnChart(rows, { value, label }) {
  if (!rows.length) return "";
  const peak = Math.max(1, ...rows.map((row) => value(row)));
  const width = 720;
  const height = 168;
  const gap = 10;
  const barWidth = (width - gap * (rows.length + 1)) / rows.length;
  const bars = rows.map((row, index) => {
    const amount = value(row);
    const barHeight = amount ? Math.max(4, (amount / peak) * (height - 36)) : 0;
    const x = gap + index * (barWidth + gap);
    const y = height - 24 - barHeight;
    return `<g>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3"></rect>
      <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle">${esc(label(row))}</text>
    </g>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">${bars}</svg>`;
}

export function lineChart(points, { caption }) {
  if (points.length < 2) return "";
  const width = 720;
  const height = 200;
  const padX = 36;
  const padY = 22;
  const coords = points.map((point, index) => {
    const x = padX + (index / (points.length - 1)) * (width - padX * 2);
    const y = padY + (1 - Math.max(0, Math.min(100, point.y)) / 100) * (height - padY * 2 - 10);
    return { ...point, x, y };
  });
  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const dots = coords.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5"><title>${esc(point.label)}: ${Math.round(point.y)}</title></circle>`).join("");
  const labels = coords.map((point) => `<text x="${point.x.toFixed(1)}" y="${height - 4}" text-anchor="middle">${esc(point.tick || "")}</text>`).join("");
  return `<svg class="chart chart-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(caption)}">
    <path d="${path}"></path>${dots}${labels}
  </svg>`;
}

export function shareBars(entries) {
  const peak = Math.max(1, ...entries.map((entry) => entry.value));
  if (!entries.some((entry) => entry.value > 0)) {
    return `<p class="empty">Nothing logged yet.</p>`;
  }
  return `<div class="share-list">${entries.map((entry) => `
    <div class="share-row">
      <span>${esc(entry.label)}</span>
      <span class="bar" data-band="${entry.value ? "mid" : "zero"}"><span style="width:${Math.round((entry.value / peak) * 100)}%"></span></span>
      <b>${entry.value}</b>
    </div>`).join("")}</div>`;
}
