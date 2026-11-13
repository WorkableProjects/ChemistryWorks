// `titration` question type — student titration simulator, builder editor with a live curve preview, review.
// Add titrant with "Add 1.00 mL" / "Add 0.10 mL" or the slider; the meter shows the volume and pH, the chart plots the points
// visited so far. The student records the equivalence-point volume and / or the pH in two boxes.
// Answer = { volume: '25.0', ph: '8.72' } (typed text).
import { h } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field, switchEl } from '../admin/common.js';
import { titrationPH, parseVolume, equivalenceVolume, maxTitrantVolume, curvePoints, keyValues, askedPhVolume } from '../../lib/qtypes/titration.js';
import { parseNum } from '../../lib/qtypes/dimensional.js';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => h(tag, { xmlns: SVG, ...attrs }, ...kids);
const W = 320;
const H = 200;
const M = { l: 38, r: 10, t: 10, b: 30 };
const str = (v) => (v === undefined || v === null ? '' : String(v));

/** Axes + polyline (+ optional dots) as an <svg>. `points` = [{ v, ph }]; `marks` = [{ v, ph, cls }]. */
function chart(q, points, marks = [], label = 'Titration curve: pH against volume of titrant added') {
  const max = maxTitrantVolume(q);
  const x = (v) => M.l + (Math.min(v, max) / max) * (W - M.l - M.r);
  const y = (ph) => M.t + (1 - Math.min(14, Math.max(0, ph)) / 14) * (H - M.t - M.b);
  const grid = [];
  for (let ph = 0; ph <= 14; ph += 2) grid.push(s('line', { class: 'q-tit__grid', x1: M.l, x2: W - M.r, y1: y(ph), y2: y(ph) }), s('text', { class: 'q-tit__tick', x: M.l - 6, y: y(ph) + 4, 'text-anchor': 'end' }, String(ph)));
  for (let i = 0; i <= 4; i++) grid.push(s('text', { class: 'q-tit__tick', x: x(max * i / 4), y: H - M.b + 16, 'text-anchor': 'middle' }, String(Number((max * i / 4).toFixed(1)))));
  const pts = points.map((p) => `${x(p.v).toFixed(1)},${y(p.ph).toFixed(1)}`).join(' ');
  return s('svg', { class: 'q-tit__chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' },
    grid,
    s('text', { class: 'q-tit__axis', x: (W + M.l) / 2, y: H - 4, 'text-anchor': 'middle' }, 'Titrant added (mL)'),
    s('text', { class: 'q-tit__axis', x: 12, y: H / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${H / 2})` }, 'pH'),
    points.length > 1 ? s('polyline', { class: 'q-tit__line', points: pts, fill: 'none' }) : null,
    points.length === 1 ? s('circle', { class: 'q-tit__dot', cx: x(points[0].v), cy: y(points[0].ph), r: 3 }) : null,
    marks.map((m) => s('circle', { class: `q-tit__mark ${m.cls || ''}`, cx: x(m.v), cy: y(m.ph), r: 5 })));
}

function widget(q, api) {
  const max = maxTitrantVolume(q);
  const trace = new Map(); // volume (2 dp) -> pH
  let added = 0;
  const record = () => { trace.set(added.toFixed(2), titrationPH(q, added)); };
  const readout = h('p', { class: 'q-tit__read', 'aria-live': 'polite', dataset: { testid: 'titration-readout' } });
  const chartHost = h('div', { class: 'q-tit__chartwrap' });
  const slider = h('input', { type: 'range', class: 'q-tit__slider', min: 0, max, step: 0.05, value: 0, 'aria-label': `Titrant volume added, 0 to ${max} mL`, dataset: { testid: 'titration-slider' } });
  const update = () => {
    added = Math.max(0, Math.min(max, Math.round(added * 100) / 100));
    record();
    slider.value = String(added);
    const ph = titrationPH(q, added);
    readout.textContent = `Added ${added.toFixed(2)} mL — pH ${ph.toFixed(2)}`;
    const pts = [...trace.entries()].map(([v, p]) => ({ v: Number(v), ph: p })).sort((a, b) => a.v - b.v);
    chartHost.replaceChildren(chart(q, pts, [{ v: added, ph, cls: 'is-now' }], `Titration curve so far. Latest reading: ${added.toFixed(2)} mL added, pH ${ph.toFixed(2)}`));
  };
  const step = (d) => { added += d; update(); };
  slider.addEventListener('input', () => { added = Number(slider.value); update(); });
  const btn = (label, d, id) => h('button', { type: 'button', class: 'btn', dataset: { testid: `titration-add-${id}` }, on: { click: () => step(d) } }, label);
  const asks = { volume: q.ask !== 'ph', ph: q.ask !== 'volume' };
  const state = { volume: '', ph: '' };
  const commit = () => api.set(q.id, state.volume.trim() || state.ph.trim() ? { ...state } : undefined, { debounce: true });
  const inp = (key, label, testid, unit) => {
    const input = h('input', { class: 'input q-input q-tit__in', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-label': label, dataset: { testid }, on: { input: (e) => { state[key] = e.target.value; commit(); } } });
    return { input, el: h('label', { class: 'q-tit__field' }, h('span', { class: 'q-tit__label' }, label), h('span', { class: 'q-tit__inwrap' }, input, unit ? h('span', { class: 'q-tit__unit' }, unit) : null)) };
  };
  const vol = asks.volume ? inp('volume', 'Equivalence-point volume', 'titration-volume', 'mL') : null;
  const phIn = asks.ph ? inp('ph', q.atVolume !== undefined ? `pH after ${q.atVolume} mL` : 'pH at the equivalence point', 'titration-ph', '') : null;
  update();
  const a = q.analyte;
  return {
    el: h('div', { class: 'q-tit' },
      h('p', { class: 'q-tit__setup', dataset: { testid: 'titration-setup' } },
        `Analyte: ${a.volumeMl} mL of ${a.conc} M ${a.kind} ${a.type}${a.kind === 'weak' ? ` (${a.type === 'acid' ? 'Ka' : 'Kb'} = ${a.K})` : ''}. Titrant: ${q.titrant.conc} M strong ${a.type === 'acid' ? 'base' : 'acid'}.`),
      h('div', { class: 'q-tit__sim' },
        chartHost,
        h('div', { class: 'q-tit__controls' }, readout,
          h('div', { class: 'q-tit__buttons' }, btn('Add 1.00 mL', 1, '1'), btn('Add 0.10 mL', 0.1, '0.1'), h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'titration-back' }, on: { click: () => step(-0.1) } }, 'Remove 0.10 mL'),
            h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'titration-reset' }, on: { click: () => { added = 0; trace.clear(); update(); } } }, 'Start over')),
          slider)),
      h('div', { class: 'q-tit__answers' }, vol && vol.el, phIn && phIn.el)),
    refresh(answer) {
      if (document.activeElement === vol?.input || document.activeElement === phIn?.input) return;
      state.volume = str(answer && answer.volume); state.ph = str(answer && answer.ph);
      if (vol) vol.input.value = state.volume;
      if (phIn) phIn.input.value = state.ph;
    },
    focus: () => slider.focus(),
  };
}

function editor(q, redraw, changed) {
  const a = q.analyte;
  const numIn = (label, get, set, testid, { hint = null, step = 'any', min } = {}) => field(label, h('input', { class: 'input', type: 'number', step, min, value: get() ?? '', dataset: { testid }, on: { input: (e) => { set(e.target.value.trim() === '' ? '' : Number(e.target.value)); changed(); preview(); } } }), hint);
  const sel = (label, value, options, set, testid) => field(label, h('select', { class: 'select', dataset: { testid }, on: { change: (e) => { set(e.target.value); redraw(); changed(); } } }, options.map(([v, t]) => h('option', { value: v, selected: v === value }, t))));
  const info = h('p', { class: 'field__hint', 'aria-live': 'polite', dataset: { testid: 'titration-edit-preview' } });
  const chartHost = h('div', { class: 'q-tit__chartwrap' });
  function preview() {
    const eq = equivalenceVolume(q);
    if (!Number.isFinite(eq) || eq <= 0) { info.textContent = 'Fill in the concentrations and the volume to see the curve.'; chartHost.replaceChildren(); return; }
    const key = keyValues(q);
    info.textContent = `Equivalence point: ${eq.toFixed(2)} mL, pH ${titrationPH(q, eq).toFixed(2)}.${q.atVolume !== undefined ? ` The pH asked for is at ${askedPhVolume(q)} mL: ${key.ph.toFixed(2)}.` : ''}`;
    try { chartHost.replaceChildren(chart(q, curvePoints(q), [{ v: eq, ph: titrationPH(q, eq), cls: 'is-key' }])); } catch { chartHost.replaceChildren(); }
  }
  preview();
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--3' },
      sel('Analyte', a.type, [['acid', 'Acid (titrated with a strong base)'], ['base', 'Base (titrated with a strong acid)']], (v) => { a.type = v; }, 'titration-edit-type'),
      sel('Strength', a.kind, [['strong', 'Strong'], ['weak', 'Weak']], (v) => { a.kind = v; if (v === 'weak' && !(a.K > 0)) a.K = 1.8e-5; }, 'titration-edit-kind'),
      a.kind === 'weak' ? numIn(`${a.type === 'acid' ? 'Ka' : 'Kb'} of the analyte`, () => a.K, (v) => { a.K = v; }, 'titration-edit-k', { hint: 'For example 1.8e-5' }) : h('span')),
    h('div', { class: 'adm-grid adm-grid--3' },
      numIn('Analyte concentration (mol/L)', () => a.conc, (v) => { a.conc = v; }, 'titration-edit-conc', { min: '0' }),
      numIn('Analyte volume (mL)', () => a.volumeMl, (v) => { a.volumeMl = v; }, 'titration-edit-volume', { min: '0' }),
      numIn('Titrant concentration (mol/L)', () => q.titrant.conc, (v) => { q.titrant.conc = v; }, 'titration-edit-titrant', { min: '0' })),
    h('div', { class: 'adm-grid adm-grid--3' },
      sel('Students record', q.ask, [['both', 'Volume and pH'], ['volume', 'Equivalence volume only'], ['ph', 'pH only']], (v) => { q.ask = v; }, 'titration-edit-ask'),
      numIn('Ask the pH at this volume (mL, optional)', () => q.atVolume ?? '', (v) => { if (v === '') delete q.atVolume; else q.atVolume = v; }, 'titration-edit-at', { hint: 'Empty = at the equivalence point' }),
      numIn('Largest volume (mL, optional)', () => q.maxVolume ?? '', (v) => { if (v === '') delete q.maxVolume; else q.maxVolume = v; }, 'titration-edit-max')),
    h('div', { class: 'adm-grid adm-grid--2' },
      numIn('Volume tolerance (± mL)', () => q.volumeTolerance, (v) => { q.volumeTolerance = v === '' ? 0 : v; }, 'titration-edit-vol-tol', { min: '0' }),
      numIn('pH tolerance (± pH units)', () => q.phTolerance, (v) => { q.phTolerance = v === '' ? 0 : v; }, 'titration-edit-ph-tol', { min: '0' })),
    switchEl({ label: 'Partial credit', hint: 'Half the points for one right value when both are asked', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }),
    info, chartHost);
}

function review(q, answer, { key } = {}) {
  const eq = equivalenceVolume(q);
  if (!Number.isFinite(eq) || eq <= 0) return null;
  const marks = [];
  if (key) { const k = keyValues(q); marks.push({ v: q.ask === 'ph' ? askedPhVolume(q) : eq, ph: k.ph, cls: 'is-key' }); } else if (answer && typeof answer === 'object') {
    const v = parseVolume(answer.volume);
    const p = parseNum(answer.ph);
    if (Number.isFinite(v) && Number.isFinite(p)) marks.push({ v, ph: p, cls: 'is-student' });
    else if (!Number.isFinite(v) && !Number.isFinite(p)) return null;
  } else return null;
  return h('span', { class: 'q-tit-review', dataset: { testid: 'titration-review' } }, chart(q, curvePoints(q), marks, key ? 'Titration curve with the answer marked' : 'Titration curve with the student answer marked'));
}

registerTypeUI({ type: 'titration', widget, editor, review });
export default null;
