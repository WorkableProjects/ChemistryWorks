// `estimate` question type — student slider + number readout, builder editor, review (number line).
// The slider is a native <input type="range"> (arrow keys, Home/End, PageUp/PageDown work); the readout box takes a typed
// number too. Nothing is recorded until the student moves the slider or types a value.
import { h } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field } from '../admin/common.js';
import { formatEstimate } from '../../lib/qtypes/estimate.js';
import { parseNum } from '../../lib/qtypes/dimensional.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const pct = (q, x) => `${(clamp((x - q.min) / (q.max - q.min), 0, 1) * 100).toFixed(2)}%`;

function widget(q, api) {
  const unit = q.unit ? h('span', { class: 'q-est__unit' }, q.unit) : null;
  const range = h('input', { type: 'range', class: 'q-est__range', min: q.min, max: q.max, step: q.step, 'aria-label': `Estimate${q.unit ? ` in ${q.unit}` : ''}, from ${q.min} to ${q.max}`, dataset: { testid: 'estimate-range' } });
  range.value = String((q.min + q.max) / 2);
  const num = h('input', { class: 'input q-input q-est__num', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Your estimate (number)', dataset: { testid: 'estimate-number' } });
  const status = h('span', { class: 'q-hint q-est__status', 'aria-live': 'polite', dataset: { testid: 'estimate-status' } }, 'Move the slider or type a number.');
  const setStatus = (x) => { status.textContent = Number.isFinite(x) ? `Your estimate: ${formatEstimate(q, x)}${q.unit ? ` ${q.unit}` : ''}` : 'Move the slider or type a number.'; };
  range.addEventListener('input', () => {
    const x = Number(range.value);
    num.value = formatEstimate(q, x);
    range.classList.remove('is-untouched');
    setStatus(x);
    api.set(q.id, x, { debounce: true });
  });
  num.addEventListener('input', () => {
    const x = parseNum(num.value);
    if (Number.isFinite(x)) { range.value = String(clamp(x, q.min, q.max)); range.classList.remove('is-untouched'); }
    setStatus(x);
    api.set(q.id, Number.isFinite(x) ? x : undefined, { debounce: true });
  });
  range.classList.add('is-untouched');
  return {
    el: h('div', { class: 'q-est' },
      h('p', { class: 'q-hint' }, 'Drag the slider (or use the arrow keys) to your best estimate, or type a number.'),
      h('div', { class: 'q-est__row' }, range),
      h('div', { class: 'q-est__scale', 'aria-hidden': 'true' }, h('span', {}, `${q.min}`), h('span', {}, `${q.max}`)),
      h('div', { class: 'q-est__read' }, num, unit), status),
    refresh(answer) {
      if (document.activeElement === num || document.activeElement === range) return;
      const x = parseNum(answer);
      if (Number.isFinite(x)) { range.value = String(clamp(x, q.min, q.max)); num.value = typeof answer === 'string' ? answer : formatEstimate(q, x); range.classList.remove('is-untouched'); } else { num.value = ''; range.classList.add('is-untouched'); range.value = String((q.min + q.max) / 2); }
      setStatus(x);
    },
    focus: () => range.focus(),
  };
}

function editor(q, redraw, changed) {
  const numInput = (label, key, testid, { step = 'any', hint = null } = {}) => field(label, h('input', {
    class: 'input', type: 'number', step, value: q[key] ?? '', dataset: { testid },
    on: { input: (e) => { q[key] = e.target.value.trim() === '' ? '' : Number(e.target.value); changed(); } },
  }), hint);
  const tolType = h('select', { class: 'select', dataset: { testid: 'estimate-edit-tolerance-type' }, on: { change: (e) => { q.toleranceType = e.target.value; changed(); } } },
    h('option', { value: 'absolute', selected: q.toleranceType !== 'percent' }, 'Absolute (±)'),
    h('option', { value: 'percent', selected: q.toleranceType === 'percent' }, 'Percent (±%)'));
  const unit = h('input', { class: 'input', value: q.unit || '', autocomplete: 'off', dataset: { testid: 'estimate-edit-unit' }, on: { input: (e) => { q.unit = e.target.value; changed(); } } });
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--3' },
      numInput('Slider minimum', 'min', 'estimate-edit-min'), numInput('Slider maximum', 'max', 'estimate-edit-max'),
      numInput('Step', 'step', 'estimate-edit-step', { hint: 'Smallest change of the slider' })),
    h('div', { class: 'adm-grid adm-grid--3' },
      numInput('Correct value', 'answer', 'estimate-edit-answer'),
      numInput('Tolerance', 'tolerance', 'estimate-edit-tolerance', { hint: 'How far the estimate may be off' }),
      field('Tolerance type', tolType)),
    field('Unit (optional)', unit, 'Shown next to the number, for example mL or pH'));
}

/** Number line with the student's estimate (dot) and the accepted band (key: bar). */
function review(q, answer, { key, size } = {}) {
  const x = key ? Number(q.answer) : parseNum(answer);
  if (!key && !Number.isFinite(x)) return null;
  const tol = Number(q.tolerance) > 0 ? (q.toleranceType === 'percent' ? Math.abs(Number(q.answer)) * Number(q.tolerance) / 100 : Number(q.tolerance)) : 0;
  const lo = Number(q.answer) - tol;
  const hi = Number(q.answer) + tol;
  const band = h('span', { class: 'q-est-review__band', style: { left: pct(q, lo), width: `${(clamp((hi - lo) / (q.max - q.min), 0, 1) * 100).toFixed(2)}%` } });
  const dot = h('span', { class: ['q-est-review__dot', key && 'is-key'], style: { left: pct(q, x) } });
  return h('span', { class: ['q-est-review', size === 'sm' && 'q-est-review--sm'], dataset: { testid: 'estimate-review' } },
    h('span', { class: 'q-est-review__line', 'aria-hidden': 'true' }, band, dot),
    h('span', { class: 'q-est-review__ends', 'aria-hidden': 'true' }, h('span', {}, `${q.min}`), h('span', {}, `${q.max}`)));
}

registerTypeUI({ type: 'estimate', widget, editor, review });
export default null;
