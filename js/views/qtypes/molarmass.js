// `molarmass` question type (V4-03, S10) — student answer + optional work table, builder editor with the built-in
// molar-mass checker, and review (the key's element table, the student's work).
// Answer = { value: '74.10', work: [{ symbol, count, mass }] } (typed text).
import { h } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field, switchEl } from '../admin/common.js';
import { formulaToHTML } from '../../lib/formula.js';
import { molarMassBreakdown, molarMass } from '../../lib/chemfuncs.js';
import { parseNum } from '../../lib/qtypes/dimensional.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));
const toState = (a) => ({
  value: str(a && a.value),
  work: Array.isArray(a && a.work) ? a.work.map((r) => ({ symbol: str(r && r.symbol), count: str(r && r.count), mass: str(r && r.mass) })) : [],
});
const clone = (s) => JSON.parse(JSON.stringify(s));
const formulaEl = (f) => h('span', { class: 'q-mm__formula', html: formulaToHTML(f) });

/** Σ count × mass of the typed work rows (null when no row is complete). */
export function workSum(work) {
  let total = 0;
  let any = false;
  for (const r of work) {
    const n = parseNum(r.count);
    const m = parseNum(r.mass);
    if (Number.isFinite(n) && Number.isFinite(m)) { total += n * m; any = true; }
  }
  return any ? Math.round(total * 10000) / 10000 : null;
}

function widget(q, api) {
  let state = toState(api.get(q.id));
  const showSum = () => {
    const total = workSum(state.work);
    sum.textContent = total === null ? '' : `Your work adds up to ${total.toFixed(2)} g/mol.`;
  };
  const commit = () => {
    const empty = !state.value.trim() && !state.work.some((r) => r.symbol.trim() || r.count.trim() || r.mass.trim());
    api.set(q.id, empty ? undefined : clone(state), { debounce: true });
    showSum();
  };
  const value = h('input', { class: 'input q-input q-mm__value', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Molar mass in grams per mole', dataset: { testid: 'molarmass-value' },
    on: { input: (e) => { state.value = e.target.value; commit(); } } });
  value.value = state.value;
  const sum = h('p', { class: 'q-hint q-mm__sum', 'aria-live': 'polite', dataset: { testid: 'molarmass-sum' } });
  const rows = h('div', { class: 'q-mm__rows' });
  const cell = (r, i, key, label, mode, testid) => h('input', { class: 'input q-input q-mm__in', type: 'text', inputmode: mode, autocomplete: 'off', spellcheck: 'false', 'aria-label': `Row ${i + 1} ${label}`, value: r[key], dataset: { testid },
    on: { input: (e) => { r[key] = e.target.value; commit(); } } });
  const draw = () => rows.replaceChildren(...state.work.map((r, i) => h('div', { class: 'q-mm__row', role: 'group', 'aria-label': `Work row ${i + 1}` },
    cell(r, i, 'symbol', 'element symbol', 'text', `molarmass-work-${i}-symbol`),
    h('span', { class: 'q-mm__x', 'aria-hidden': 'true' }, '×'),
    cell(r, i, 'count', 'number of atoms', 'numeric', `molarmass-work-${i}-count`),
    h('span', { class: 'q-mm__x', 'aria-hidden': 'true' }, '×'),
    cell(r, i, 'mass', 'atomic mass', 'decimal', `molarmass-work-${i}-mass`),
    h('button', { type: 'button', class: 'btn btn--ghost q-mm__remove', 'aria-label': `Remove row ${i + 1}`, dataset: { testid: `molarmass-work-remove-${i}` },
      on: { click: () => { state.work.splice(i, 1); draw(); commit(); } } }, 'Remove'))));
  draw();
  showSum();
  const addBtn = h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'molarmass-add-row' },
    on: { click: () => { state.work.push({ symbol: '', count: '', mass: '' }); draw(); commit(); rows.lastElementChild?.querySelector('input')?.focus(); } } }, 'Add element row');
  const work = q.showWork === false ? null : h('div', { class: 'q-mm__work' },
    h('p', { class: 'q-hint' }, 'Optional: show your work, one row per element (symbol × atoms × atomic mass).'), rows, addBtn, sum);
  return {
    el: h('div', { class: 'q-mm' },
      h('p', { class: 'q-mm__prompt' }, h('strong', null, 'Formula: '), formulaEl(q.formula)),
      work, h('div', { class: 'q-mm__final' }, h('span', { class: 'q-mm__eq', 'aria-hidden': 'true' }, 'M ='), value, h('span', { class: 'q-mm__unit' }, 'g/mol'))),
    refresh(answer) {
      const next = toState(answer);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.q-mm')) return;
      state = next; value.value = state.value; draw(); showSum();
    },
    focus: () => (value).focus(),
  };
}

function breakdownText(rows) {
  return rows.map((r) => `${r.symbol} ${r.count} × ${r.mass.toFixed(2)} = ${r.total.toFixed(2)}`).join('; ');
}

function editor(q, redraw, changed) {
  const formula = h('input', { class: 'input q-input--formula', value: q.formula || '', placeholder: 'e.g. Ca(OH)2 or CuSO4.5H2O', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Formula', dataset: { testid: 'molarmass-formula' } });
  const checker = h('p', { class: 'field__hint q-mm-ed__checker', 'aria-live': 'polite', dataset: { testid: 'molarmass-checker' } });
  const showChecker = () => {
    const rows = molarMassBreakdown(q.formula);
    checker.textContent = rows && rows.length ? `Molar mass: ${molarMass(q.formula).toFixed(2)} g/mol  (${breakdownText(rows)})` : q.formula ? 'This formula could not be read — check the element symbols.' : 'Type a formula to see its molar mass.';
    checker.classList.toggle('is-bad', !!q.formula && !(rows && rows.length));
  };
  formula.addEventListener('input', () => { q.formula = formula.value.trim(); showChecker(); changed(); });
  showChecker();
  const answer = h('input', { class: 'input', type: 'number', step: 'any', value: q.answer ?? '', placeholder: 'leave empty to use the computed value', dataset: { testid: 'molarmass-answer' },
    on: { input: (e) => { if (e.target.value.trim() === '') delete q.answer; else q.answer = Number(e.target.value); changed(); } } });
  const tol = h('input', { class: 'input', type: 'number', step: 'any', min: '0', value: q.tolerance ?? 0.05, dataset: { testid: 'molarmass-tolerance' },
    on: { input: (e) => { q.tolerance = e.target.value.trim() === '' ? 0 : Number(e.target.value); changed(); } } });
  const tolType = h('select', { class: 'select', dataset: { testid: 'molarmass-tolerance-type' }, on: { change: (e) => { q.toleranceType = e.target.value; changed(); } } },
    h('option', { value: 'absolute', selected: q.toleranceType !== 'percent' }, 'Absolute (± g/mol)'),
    h('option', { value: 'percent', selected: q.toleranceType === 'percent' }, 'Percent (±%)'));
  return h('div', { class: 'stack' },
    field('Formula', formula, 'Parentheses and hydrates work: Fe2(SO4)3, CuSO4.5H2O'), checker,
    h('div', { class: 'adm-grid adm-grid--3' }, field('Correct answer (optional)', answer), field('Tolerance', tol), field('Tolerance type', tolType)),
    switchEl({ label: 'Show the work table', hint: 'Students may list element × atoms × mass; it is shown in results but not graded', checked: q.showWork !== false, testid: 'molarmass-show-work', onChange: (v) => { q.showWork = v; changed(); } }));
}

function review(q, answer, { key } = {}) {
  if (key) {
    const rows = molarMassBreakdown(q.formula);
    return h('span', { class: 'q-mm-review', dataset: { testid: 'molarmass-review' } }, formulaEl(q.formula), rows ? h('span', { class: 'q-mm-review__work' }, breakdownText(rows)) : null);
  }
  const s = toState(answer);
  const lines = s.work.filter((r) => r.symbol.trim() || r.count.trim() || r.mass.trim());
  if (!lines.length) return null;
  return h('span', { class: 'q-mm-review', dataset: { testid: 'molarmass-review' } }, formulaEl(q.formula),
    h('span', { class: 'q-mm-review__work' }, lines.map((r) => `${r.symbol.trim() || '?'} ${r.count.trim() || '?'} × ${r.mass.trim() || '?'}`).join('; ')));
}

registerTypeUI({ type: 'molarmass', widget, editor, review });
export default null;
