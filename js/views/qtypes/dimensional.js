// UI for `dimensional` (V4-03): the given quantity, a row of fraction tiles the student adds, units that cancel are struck
// through, then the final value + unit. Keyboard only: every tile field is a text input, "Add factor" / "Remove" are buttons.
// Answer = { factors: [{ top: {value, unit}, bottom: {value, unit} }], value, unit } (typed text).
import { h } from '../../ui.js';
import { field } from '../admin/common.js';
import { cancellation, chainText, unitTokens } from '../../lib/qtypes/dimensional.js';
import { registerTypeUI } from './registry.js';

const emptyQty = () => ({ value: '', unit: '' });
const emptyFactor = () => ({ top: emptyQty(), bottom: emptyQty() });
const clone = (a) => JSON.parse(JSON.stringify(a));
const toState = (a) => ({
  factors: Array.isArray(a && a.factors) ? a.factors.map((f) => ({
    top: { value: String((f && f.top && f.top.value) ?? ''), unit: String((f && f.top && f.top.unit) ?? '') },
    bottom: { value: String((f && f.bottom && f.bottom.value) ?? ''), unit: String((f && f.bottom && f.bottom.unit) ?? '') },
  })) : [],
  value: String((a && a.value) ?? ''), unit: String((a && a.unit) ?? ''),
});
const numOrRaw = (s) => (s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : s);

/** "g/mol" as a row of unit-name spans; names that cancel get .is-cancelled (struck through). */
function unitSpans(items, filter) {
  return items.filter(filter).map((it) => h('span', { class: ['q-dim__u', it.cancelled && 'is-cancelled'] }, it.name));
}

/** Unit-cancellation line for a given unit + chain: "g × [ mol / g ]"; cancelled units are struck through. */
export function unitsLine(givenUnit, factors) {
  const items = cancellation(givenUnit, factors);
  const row = [h('span', { class: 'q-dim__term' }, unitSpans(items, (i) => i.where === 'given'))];
  const givenBottom = items.filter((i) => i.where === 'bottom' && i.factor === -1);
  if (givenBottom.length) row.push(h('span', { class: 'q-dim__term' }, '/', unitSpans(givenBottom, () => true)));
  factors.forEach((f, idx) => {
    row.push(h('span', { class: 'q-dim__x', 'aria-hidden': 'true' }, '×'));
    row.push(h('span', { class: 'q-dim__frac' },
      h('span', { class: 'q-dim__top' }, unitSpans(items, (i) => i.factor === idx && i.where === 'top')),
      h('span', { class: 'q-dim__bottom' }, unitSpans(items, (i) => i.factor === idx && i.where === 'bottom'))));
  });
  const cancelled = items.filter((i) => i.cancelled).map((i) => i.name);
  const aria = `Units: ${unitTokens(givenUnit).map((t) => t.name).join(' ')}${factors.length ? `, ${factors.length} factor${factors.length === 1 ? '' : 's'}` : ''}${cancelled.length ? `. Cancelled: ${[...new Set(cancelled)].join(', ')}` : ''}`;
  return h('div', { class: 'q-dim__units', role: 'group', 'aria-label': aria }, row);
}

function widget(q, api) {
  let state = toState(api.get(q.id));
  const unitsHost = h('div', { dataset: { testid: 'dimensional-units-line' }, 'aria-live': 'polite' });
  const tiles = h('div', { class: 'q-dim__tiles' });
  const commit = () => { api.set(q.id, clone(state), { debounce: true }); unitsHost.replaceChildren(unitsLine(q.given.unit, state.factors)); };
  const inp = (label, get, set, testid, mode) => h('input', {
    class: 'input q-input q-dim__in', type: 'text', inputmode: mode, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
    'aria-label': label, value: get(), dataset: { testid }, on: { input: (e) => { set(e.target.value); commit(); } },
  });
  const drawTiles = () => {
    tiles.replaceChildren(...state.factors.map((f, i) => {
      const n = i + 1;
      const side = (name, part) => h('span', { class: `q-dim__${name}` },
        inp(`Factor ${n} ${name} value`, () => f[name].value, (v) => { f[name].value = v; }, `dimensional-factor-${i}-${name}-value`, 'decimal'),
        inp(`Factor ${n} ${name} unit`, () => f[name].unit, (v) => { f[name].unit = v; }, `dimensional-factor-${i}-${name}-unit`, 'text'));
      return h('div', { class: 'q-dim__tile', role: 'group', 'aria-label': `Factor ${n}`, dataset: { testid: `dimensional-factor-${i}` } },
        h('span', { class: 'q-dim__fraction' }, side('top'), h('span', { class: 'q-dim__bar', 'aria-hidden': 'true' }), side('bottom')),
        h('button', { type: 'button', class: 'btn btn--ghost q-dim__remove', 'aria-label': `Remove factor ${n}`, dataset: { testid: `dimensional-remove-${i}` },
          on: { click: () => { state.factors.splice(i, 1); drawTiles(); commit(); } } }, 'Remove'));
    }));
  };
  const addBtn = h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'dimensional-add-factor' },
    on: { click: () => { state.factors.push(emptyFactor()); drawTiles(); commit(); tiles.lastElementChild?.querySelector('input')?.focus(); } } }, 'Add factor');
  const value = inp('Final answer value', () => state.value, (v) => { state.value = v; }, 'dimensional-value', 'decimal');
  const unit = inp('Final answer unit', () => state.unit, (v) => { state.unit = v; }, 'dimensional-unit', 'text');
  drawTiles();
  unitsHost.replaceChildren(unitsLine(q.given.unit, state.factors));
  return {
    el: h('div', { class: 'q-dim' },
      h('p', { class: 'q-hint' }, 'Start from the given quantity. Add conversion factors (numerator over denominator) so the units cancel, then enter your answer with its unit.'),
      h('p', { class: 'q-dim__given' }, h('strong', null, 'Given: '), h('span', { class: 'q-dim__givenval', dataset: { testid: 'dimensional-given' } }, `${q.given.value} ${q.given.unit}`)),
      tiles, h('div', { class: 'q-dim__actions' }, addBtn),
      h('p', { class: 'q-hint' }, 'Units that cancel are struck through:'), unitsHost,
      h('div', { class: 'q-dim__final' }, h('span', { class: 'q-dim__eq', 'aria-hidden': 'true' }, '='), value, unit)),
    refresh(answer) {
      const next = toState(answer);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      const editing = document.activeElement && document.activeElement.closest && document.activeElement.closest('.q-dim');
      if (editing) return;
      state = next; drawTiles();
      value.value = state.value; unit.value = state.unit;
      unitsHost.replaceChildren(unitsLine(q.given.unit, state.factors));
    },
    focus: () => (state.factors.length ? tiles.querySelector('input') : addBtn).focus(),
  };
}

function editor(q, redraw, changed) {
  const text = (label, get, set, testid, { type = 'text', hint = null, step } = {}) => field(label, h('input', {
    class: 'input', type, step, value: get() ?? '', autocomplete: 'off', dataset: { testid }, on: { input: (e) => { set(e.target.value); changed(); } },
  }), hint);
  const qtyEditor = (obj, key, label, tid) => h('div', { class: 'adm-grid adm-grid--2' },
    text(`${label} value`, () => obj[key].value, (v) => { obj[key].value = numOrRaw(v); }, `${tid}-value`),
    text(`${label} unit`, () => obj[key].unit, (v) => { obj[key].unit = v; }, `${tid}-unit`));
  const factorRows = (q.factors || []).map((f, i) => h('div', { class: 'adm-opt q-dim-ed__factor', dataset: { testid: `dimensional-edit-factor-${i}` } },
    h('div', { class: 'adm-grid adm-grid--2' },
      text(`Factor ${i + 1} top value`, () => f.top.value, (v) => { f.top.value = numOrRaw(v); }, `dimensional-edit-factor-${i}-top-value`),
      text(`Factor ${i + 1} top unit`, () => f.top.unit, (v) => { f.top.unit = v; }, `dimensional-edit-factor-${i}-top-unit`),
      text(`Factor ${i + 1} bottom value`, () => f.bottom.value, (v) => { f.bottom.value = numOrRaw(v); }, `dimensional-edit-factor-${i}-bottom-value`),
      text(`Factor ${i + 1} bottom unit`, () => f.bottom.unit, (v) => { f.bottom.unit = v; }, `dimensional-edit-factor-${i}-bottom-unit`)),
    h('button', { type: 'button', class: 'btn btn--ghost', 'aria-label': `Remove factor ${i + 1}`, dataset: { testid: `dimensional-edit-remove-${i}` },
      on: { click: () => { q.factors.splice(i, 1); redraw(); changed(); } } }, 'Remove factor')));
  const tolType = h('select', { class: 'select', dataset: { testid: 'dimensional-edit-tolerance-type' }, on: { change: () => { q.toleranceType = tolType.value; changed(); } } },
    h('option', { value: 'percent', selected: q.toleranceType === 'percent' }, 'Percent (±%)'),
    h('option', { value: 'absolute', selected: q.toleranceType === 'absolute' }, 'Absolute (±)'));
  return h('div', { class: 'stack' },
    h('p', { class: 'field__hint' }, 'Units are written like g, mol, g/mol or L^-1 (case matters: mL is not ml). Cancellation is by unit name.'),
    qtyEditor(q, 'given', 'Given', 'dimensional-edit-given'),
    qtyEditor(q, 'answer', 'Answer', 'dimensional-edit-answer'),
    h('div', { class: 'adm-grid adm-grid--3' },
      text('Tolerance', () => q.tolerance, (v) => { q.tolerance = v.trim() === '' ? 0 : Number(v); }, 'dimensional-edit-tolerance', { type: 'number', step: 'any' }),
      field('Tolerance type', tolType),
      text('Chain credit (0–1)', () => q.chainCredit, (v) => { q.chainCredit = v.trim() === '' ? 0 : Number(v); }, 'dimensional-edit-chain-credit', { type: 'number', step: 'any', hint: 'Share of the points for a correct chain with a wrong final entry' })),
    h('h4', { class: 'field__label' }, 'Reference chain (optional)'),
    factorRows,
    h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'dimensional-edit-add-factor' },
      on: { click: () => { q.factors.push({ top: { value: '', unit: '' }, bottom: { value: '', unit: '' } }); redraw(); changed(); } } }, 'Add factor'));
}

function review(q, answer, { key } = {}) {
  const src = key ? { factors: q.factors || [], value: q.answer.value, unit: q.answer.unit } : toState(answer);
  if (!key && !(answer && typeof answer === 'object')) return null;
  return h('span', { class: 'q-dim-review', dataset: { testid: 'dimensional-review' } },
    unitsLine(q.given.unit, src.factors), h('span', { class: 'q-dim-review__text' }, chainText(q.given, src.factors, src.value, src.unit)));
}

registerTypeUI({ type: 'dimensional', widget, editor, review });
export default null;
