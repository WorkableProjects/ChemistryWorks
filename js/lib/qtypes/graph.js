// Pure helpers for the `graph` question type (V3-05): grading plot answers and drawing the chart as an SVG string.
// mode 'read': student types a number (graded like `numeric`). mode 'plot': student places points; answer = [[x, y], …].

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isPair = (p) => Array.isArray(p) && p.length === 2 && isNum(Number(p[0])) && isNum(Number(p[1])) && p[0] !== '' && p[1] !== '';

export const W = 440;
export const H = 320;
export const M = { l: 58, r: 16, t: 14, b: 50 };

export function isPlotAnswered(answer) {
  return Array.isArray(answer) && answer.some(isPair);
}

/** Targets matched to distinct placed points (nearest first). Returns the number of targets hit. */
export function plotHits(q, answer) {
  const targets = Array.isArray(q.targets) ? q.targets : [];
  const pts = (Array.isArray(answer) ? answer : []).filter(isPair).map((p) => [Number(p[0]), Number(p[1])]);
  const tx = Number(q.toleranceX) >= 0 ? Number(q.toleranceX) : 0;
  const ty = Number(q.toleranceY) >= 0 ? Number(q.toleranceY) : 0;
  const used = new Set();
  let hits = 0;
  for (const t of targets) {
    let best = -1;
    let bestD = Infinity;
    pts.forEach((p, i) => {
      if (used.has(i)) return;
      const dx = Math.abs(p[0] - t[0]);
      const dy = Math.abs(p[1] - t[1]);
      if (dx <= tx + 1e-9 && dy <= ty + 1e-9) {
        const d = (tx ? dx / tx : dx) + (ty ? dy / ty : dy);
        if (d < bestD) { bestD = d; best = i; }
      }
    });
    if (best >= 0) { used.add(best); hits++; }
  }
  return { hits, placed: pts.length, total: targets.length };
}

export function scorePlot(q, answer) {
  const { hits, placed, total } = plotHits(q, answer);
  if (!total) return { fraction: 0, full: false };
  if (hits === total && placed <= total) return { fraction: 1, full: true };
  return { fraction: q.partialCredit ? hits / total : 0, full: false };
}

const fmt = (n) => String(Number(Number(n).toPrecision(6)));
export const pointsText = (list) => (Array.isArray(list) ? list.filter(isPair).map((p) => `(${fmt(p[0])}, ${fmt(p[1])})`).join(', ') : '');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function chartRange(chart) {
  const c = chart || {};
  const xMin = Number(c.xMin); const xMax = Number(c.xMax); const yMin = Number(c.yMin); const yMax = Number(c.yMax);
  return { xMin: isNum(xMin) ? xMin : 0, xMax: isNum(xMax) && xMax > xMin ? xMax : 10, yMin: isNum(yMin) ? yMin : 0, yMax: isNum(yMax) && yMax > yMin ? yMax : 10 };
}

export const toPx = (r, x, y) => [M.l + ((x - r.xMin) / (r.xMax - r.xMin)) * (W - M.l - M.r), H - M.b - ((y - r.yMin) / (r.yMax - r.yMin)) * (H - M.t - M.b)];
export const fromPx = (r, px, py) => [r.xMin + ((px - M.l) / (W - M.l - M.r)) * (r.xMax - r.xMin), r.yMin + ((H - M.b - py) / (H - M.t - M.b)) * (r.yMax - r.yMin)];

/** Round a coordinate to a precision that follows the axis range (about 200 steps across). */
export function snap(value, min, max) {
  const step = (max - min) / 200;
  const digits = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 1));
  return Number(value.toFixed(digits));
}

function ticks(min, max, n = 5) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(min + ((max - min) * i) / n);
  return out;
}

/**
 * The chart as an SVG string. Only numbers and escaped axis labels are interpolated.
 * opts: { series: bool, points: [[x,y]], cursor: [x,y] | null }
 */
export function chartSvg(chart, { series = true, points = [], cursor = null, label = 'Graph' } = {}) {
  const c = chart || {};
  const r = chartRange(c);
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const parts = [`<svg class="q-graph__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">`];
  parts.push(`<rect class="q-graph__bg" x="${M.l}" y="${M.t}" width="${pw}" height="${ph}"/>`);
  for (const v of ticks(r.xMin, r.xMax)) {
    const [px] = toPx(r, v, r.yMin);
    parts.push(`<line class="q-graph__grid" x1="${px}" y1="${M.t}" x2="${px}" y2="${H - M.b}"/><text class="q-graph__tick" x="${px}" y="${H - M.b + 16}" text-anchor="middle">${esc(fmt(v))}</text>`);
  }
  for (const v of ticks(r.yMin, r.yMax)) {
    const [, py] = toPx(r, r.xMin, v);
    parts.push(`<line class="q-graph__grid" x1="${M.l}" y1="${py}" x2="${W - M.r}" y2="${py}"/><text class="q-graph__tick" x="${M.l - 8}" y="${py + 4}" text-anchor="end">${esc(fmt(v))}</text>`);
  }
  parts.push(`<rect class="q-graph__box" x="${M.l}" y="${M.t}" width="${pw}" height="${ph}"/>`);
  if (c.xLabel) parts.push(`<text class="q-graph__label" x="${M.l + pw / 2}" y="${H - 8}" text-anchor="middle">${esc(c.xLabel)}</text>`);
  if (c.yLabel) parts.push(`<text class="q-graph__label" transform="translate(14 ${M.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(c.yLabel)}</text>`);
  if (series) {
    (Array.isArray(c.series) ? c.series : []).forEach((s, i) => {
      const pts = (Array.isArray(s && s.points) ? s.points : []).filter(isPair).map((p) => toPx(r, Number(p[0]), Number(p[1])));
      if (!pts.length) return;
      parts.push(`<polyline class="q-graph__line q-graph__line--${i % 4}" fill="none" points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}"/>`);
      if (pts.length <= 40) for (const p of pts) parts.push(`<circle class="q-graph__dot q-graph__dot--${i % 4}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3"/>`);
    });
  }
  (Array.isArray(points) ? points : []).filter(isPair).forEach((p, i) => {
    const [px, py] = toPx(r, Number(p[0]), Number(p[1]));
    parts.push(`<circle class="q-graph__pt" data-i="${i}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6"/>`);
  });
  if (cursor && isPair(cursor)) {
    const [px, py] = toPx(r, Number(cursor[0]), Number(cursor[1]));
    parts.push(`<g class="q-graph__cursor"><line x1="${px}" y1="${M.t}" x2="${px}" y2="${H - M.b}"/><line x1="${M.l}" y1="${py}" x2="${W - M.r}" y2="${py}"/><circle cx="${px}" cy="${py}" r="5"/></g>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
