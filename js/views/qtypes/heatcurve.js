// `heatcurve` question type (V5-07, S12d) — student widget, builder editor and review.
// Answer: { segments: [{ phase, process }] } in segment order; see js/lib/qtypes/heatcurve.js.
import { h } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field, switchEl } from '../admin/common.js';
import { def, PHASES, PHASE_LABELS, PROCESSES, PROCESS_LABELS, MAX_POINTS, answerSegments, segCount } from '../../lib/qtypes/heatcurve.js';

const clone = (s) => JSON.parse(JSON.stringify(s));
const W = 360, H = 220, PAD_L = 44, PAD_R = 16, PAD_T = 16, PAD_B = 32;
const svg = (tag, attrs, ...kids) => h(tag, { xmlns: 'http://www.w3.org/2000/svg', ...attrs }, ...kids);

/** SVG of the curve. `active` is the highlighted segment index; `onPick(i)` makes segments clickable. */
function curve(q, active, onPick) {
  const pts = (q.curve || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const root = svg('svg', { class: 'hc-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${q.substance || 'Substance'}: temperature against heat added, ${segCount(q)} segments` });
  if (pts.length < 2) return root;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (v) => PAD_L + ((v - x0) / ((x1 - x0) || 1)) * (W - PAD_L - PAD_R);
  const sy = (v) => H - PAD_B - ((v - y0) / ((y1 - y0) || 1)) * (H - PAD_T - PAD_B);
  const midY = (PAD_T + H - PAD_B) / 2;
  root.append(
    svg('line', { class: 'hc-axis', x1: PAD_L, y1: PAD_T, x2: PAD_L, y2: H - PAD_B }),
    svg('line', { class: 'hc-axis', x1: PAD_L, y1: H - PAD_B, x2: W - PAD_R, y2: H - PAD_B }),
    svg('text', { class: 'hc-axis-label', x: (PAD_L + W - PAD_R) / 2, y: H - 6, 'text-anchor': 'middle' }, 'Heat added'),
    svg('text', { class: 'hc-axis-label', x: 12, y: midY, 'text-anchor': 'middle', transform: `rotate(-90 12 ${midY})` }, 'Temperature'),
    svg('text', { class: 'hc-tick', x: PAD_L - 6, y: sy(y0) + 4, 'text-anchor': 'end' }, String(y0)),
    svg('text', { class: 'hc-tick', x: PAD_L - 6, y: sy(y1) + 4, 'text-anchor': 'end' }, String(y1)));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const on = i === active ? ' is-active' : '';
    root.append(svg('line', { class: `hc-seg${on}`, x1: sx(a.x), y1: sy(a.y), x2: sx(b.x), y2: sy(b.y) }));
    if (onPick) root.append(svg('line', { class: 'hc-hit', x1: sx(a.x), y1: sy(a.y), x2: sx(b.x), y2: sy(b.y), on: { click: () => onPick(i) } }));
    const mx = (sx(a.x) + sx(b.x)) / 2, my = (sy(a.y) + sy(b.y)) / 2;
    const by = Math.abs(sy(a.y) - sy(b.y)) < 2 ? my - 28 : my + 8;
    root.append(
      svg('rect', { class: `hc-badge${on}`, x: mx - 9, y: by - 9, width: 18, height: 18, rx: 4 }),
      svg('text', { class: `hc-badge-text${on}`, x: mx, y: by + 4, 'text-anchor': 'middle' }, String(i + 1)));
  }
  return root;
}

function widget(q, api) {
  let state = answerSegments(q, api.get(q.id));
  let active = -1;
  const chartHolder = h('div', { class: 'hc-chart' });
  let rows = [];
  const drawChart = () => {
    chartHolder.replaceChildren(curve(q, active, (i) => { active = i; drawChart(); const s = rows[i] && rows[i].querySelector('select'); if (s) s.focus(); }));
  };
  const commit = () => {
    const any = state.some((s) => s.phase || s.process);
    api.set(q.id, any ? clone({ segments: state }) : undefined, { debounce: true });
  };
  const sel = (i, key, options, labels, aria) => {
    const s = h('select', { class: 'select hc-select', 'aria-label': aria, dataset: { testid: `heatcurve-${key}-${i}` },
      on: { change: (e) => { state[i][key] = e.target.value; commit(); }, focus: () => { if (active !== i) { active = i; drawChart(); } } } },
      h('option', { value: '' }, 'Choose'), options.map((o) => h('option', { value: o }, labels[o])));
    s.value = state[i][key];
    return s;
  };
  rows = state.map((_, i) => h('div', { class: 'hc-row', role: 'group', 'aria-label': `Segment ${i + 1}`, dataset: { testid: `heatcurve-row-${i}` } },
    h('span', { class: 'hc-row__num' }, String(i + 1)),
    sel(i, 'phase', PHASES, PHASE_LABELS, `Segment ${i + 1} phase`),
    sel(i, 'process', PROCESSES, PROCESS_LABELS, `Segment ${i + 1} equation`)));
  drawChart();
  const root = h('div', { class: 'hc-root', dataset: { testid: 'heatcurve-widget' } },
    h('p', { class: 'hc-hint' }, `${q.substance ? `${q.substance}: ` : ''}label each numbered segment with the phase present and the equation that applies`),
    chartHolder, h('div', { class: 'hc-rows' }, rows));
  return {
    el: root,
    refresh(answer) {
      const next = answerSegments(q, answer);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      if (document.activeElement && root.contains(document.activeElement)) return;
      state = next;
      rows.forEach((r, i) => { const [p, e] = r.querySelectorAll('select'); p.value = state[i].phase; e.value = state[i].process; });
    },
    focus: () => { const s = root.querySelector('select'); if (s) s.focus(); },
  };
}

function editor(q, redraw, changed) {
  const numIn = (p, key, aria, testid) => h('input', { class: 'input hc-num', type: 'number', step: 'any', value: Number.isFinite(p[key]) ? p[key] : '', 'aria-label': aria, dataset: { testid },
    on: { input: (e) => { p[key] = e.target.value.trim() === '' ? NaN : Number(e.target.value); changed(); } } });
  const keep = () => {
    const old = q.segments;
    def.normalize(q);
    q.segments.forEach((s, i) => { if (old[i]) Object.assign(s, old[i]); });
  };
  const pointRows = q.curve.map((p, i) => h('div', { class: 'hc-ed-row' },
    h('span', { class: 'hc-row__num' }, String(i + 1)),
    numIn(p, 'x', `Point ${i + 1} heat`, `heatcurve-ed-x-${i}`), numIn(p, 'y', `Point ${i + 1} temperature`, `heatcurve-ed-y-${i}`),
    h('button', { type: 'button', class: 'btn btn--sm', disabled: q.curve.length <= 2, 'aria-label': `Remove point ${i + 1}`,
      on: { click: () => { q.curve.splice(i, 1); keep(); changed(); redraw(); } } }, 'Remove')));
  const segRows = q.segments.map((s, i) => {
    const mk = (key, options, labels, aria) => h('select', { class: 'select hc-select', 'aria-label': aria, dataset: { testid: `heatcurve-ed-${key}-${i}` },
      on: { change: (e) => { s[key] = e.target.value; changed(); } } },
      h('option', { value: '', selected: !s[key] }, 'Choose'), options.map((o) => h('option', { value: o, selected: s[key] === o }, labels[o])));
    return h('div', { class: 'hc-ed-row' }, h('span', { class: 'hc-row__num' }, String(i + 1)),
      mk('phase', PHASES, PHASE_LABELS, `Segment ${i + 1} phase`), mk('process', PROCESSES, PROCESS_LABELS, `Segment ${i + 1} equation`));
  });
  return h('div', { class: 'stack' },
    field('Substance', h('input', { class: 'input', type: 'text', value: q.substance || '', dataset: { testid: 'heatcurve-ed-substance' },
      on: { input: (e) => { q.substance = e.target.value; changed(); } } })),
    h('div', { class: 'stack' }, h('strong', null, 'Points (heat, temperature)'), pointRows,
      h('button', { type: 'button', class: 'btn btn--sm', disabled: q.curve.length >= MAX_POINTS, dataset: { testid: 'heatcurve-ed-add' },
        on: { click: () => { const last = q.curve[q.curve.length - 1] || { x: 0, y: 0 }; q.curve.push({ x: last.x + 10, y: last.y }); keep(); changed(); redraw(); } } }, 'Add point')),
    h('div', { class: 'hc-ed-preview' }, curve(q, -1)),
    h('div', { class: 'stack' }, h('strong', null, 'Answer key by segment'), segRows),
    switchEl({ label: 'Partial credit', hint: 'Each correct label earns part of the points', checked: q.partialCredit !== false, testid: 'heatcurve-partial',
      onChange: (v) => { q.partialCredit = v; changed(); } }));
}

function review(q, answer, { key } = {}) {
  const text = key ? def.keyText(q) : (def.isAnswered(q, answer) ? def.answerText(q, answer) : null);
  if (!text) return null;
  return h('span', { class: 'hc-review', dataset: { testid: 'heatcurve-review' } }, h('span', { class: 'hc-review__text' }, text));
}

registerTypeUI({ type: 'heatcurve', widget, editor, review });
export default null;
