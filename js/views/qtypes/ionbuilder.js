// `ionbuilder` question type (V5-07, S11b) — student widget, builder editor and review.
// Answer: { p, n, e } (mode 'particles') | { symbol, massNumber, charge } (mode 'symbol'); see js/lib/qtypes/ionbuilder.js.
import { h, icon } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field, switchEl } from '../admin/common.js';
import { ELEMENTS } from '../../lib/elements.js';
import { def, MODES, MODE_LABELS, CHARGE_MIN, CHARGE_MAX, elementOf, normSymbol, chargeText, keyOf } from '../../lib/qtypes/ionbuilder.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (v === '' || v === undefined || v === null ? undefined : (Number.isFinite(Number(v)) ? Number(v) : undefined)));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clone = (s) => JSON.parse(JSON.stringify(s));
const MAX_COUNT = 300;

function toState(q, a) {
  const x = isObj(a) ? a : {};
  if (q.mode === 'symbol') return { symbol: str(x.symbol), massNumber: num(x.massNumber), charge: num(x.charge) };
  return { p: num(x.p), n: num(x.n), e: num(x.e) };
}

function widget(q, api) {
  let state = toState(q, api.get(q.id));
  const updaters = [];
  const isSymbol = q.mode === 'symbol';
  const el = elementOf(q.element);

  const commit = () => {
    const out = {};
    if (isSymbol) {
      if (state.symbol.trim()) out.symbol = state.symbol;
      if (state.massNumber !== undefined) out.massNumber = state.massNumber;
      if (state.charge !== undefined) out.charge = state.charge;
    } else {
      for (const k of ['p', 'n', 'e']) if (state[k] !== undefined) out[k] = state[k];
    }
    api.set(q.id, Object.keys(out).length ? clone(out) : undefined, { debounce: true });
  };

  /** A stepper: minus, value, plus. Starts from 0 when nothing is set yet. */
  const stepper = (key, label, lo, hi, fmt) => {
    const value = h('output', { class: 'qb-step__value', 'aria-live': 'polite', dataset: { testid: `ionbuilder-${key}` } }, '—');
    const dec = h('button', { type: 'button', class: 'qb-step__btn', 'aria-label': `Less ${label.toLowerCase()}`, dataset: { testid: `ionbuilder-${key}-dec` }, on: { click: () => bump(-1) } }, icon('minus', { size: 18 }));
    const inc = h('button', { type: 'button', class: 'qb-step__btn', 'aria-label': `More ${label.toLowerCase()}`, dataset: { testid: `ionbuilder-${key}-inc` }, on: { click: () => bump(1) } }, icon('plus', { size: 18 }));
    const bump = (d) => {
      const base = state[key] === undefined ? 0 : state[key];
      state[key] = clamp(base + d, lo, hi);
      sync();
      commit();
    };
    const sync = () => {
      const v = state[key];
      value.textContent = v === undefined ? '—' : fmt(v);
      dec.disabled = v !== undefined && v <= lo;
      inc.disabled = v !== undefined && v >= hi;
    };
    updaters.push(sync);
    sync();
    return h('div', { class: 'qb-step', role: 'group', 'aria-label': label }, dec, value, inc);
  };

  const tile = () => h('span', { class: 'qb-tile', 'aria-hidden': 'true' },
    h('span', { class: 'qb-tile__num' }, el ? String(el.number) : '?'),
    h('span', { class: 'qb-tile__sym' }, el ? el.symbol : '?'));

  let focusEl = null;
  let body;
  if (isSymbol) {
    const facts = h('dl', { class: 'qb-facts', dataset: { testid: 'ionbuilder-given' } },
      h('div', { class: 'qb-facts__row' }, h('dt', null, 'Protons'), h('dd', { dataset: { testid: 'ionbuilder-given-p' } }, str(q.p))),
      h('div', { class: 'qb-facts__row' }, h('dt', null, 'Neutrons'), h('dd', { dataset: { testid: 'ionbuilder-given-n' } }, str(q.n))),
      h('div', { class: 'qb-facts__row' }, h('dt', null, 'Electrons'), h('dd', { dataset: { testid: 'ionbuilder-given-e' } }, str(q.e))));
    const symIn = h('input', { class: 'input qb-in qb-in--symbol', type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Element symbol', dataset: { testid: 'ionbuilder-symbol' },
      on: { input: (e) => { state.symbol = e.target.value; commit(); } } });
    const massIn = h('input', { class: 'input qb-in', type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Mass number', dataset: { testid: 'ionbuilder-mass' },
      on: { input: (e) => { const v = e.target.value.trim(); state.massNumber = v === '' ? undefined : Number(v); commit(); } } });
    symIn.value = state.symbol;
    massIn.value = state.massNumber === undefined ? '' : String(state.massNumber);
    updaters.push(() => { symIn.value = state.symbol; massIn.value = state.massNumber === undefined ? '' : String(state.massNumber); });
    focusEl = symIn;
    body = h('div', { class: 'qb-body' }, facts,
      h('div', { class: 'qb-answer' },
        h('label', { class: 'qb-field' }, h('span', { class: 'qb-field__label' }, 'Symbol'), symIn),
        h('label', { class: 'qb-field' }, h('span', { class: 'qb-field__label' }, 'Mass number'), massIn),
        h('div', { class: 'qb-field' }, h('span', { class: 'qb-field__label' }, 'Charge'), stepper('charge', 'Charge', CHARGE_MIN, CHARGE_MAX, chargeText))));
  } else {
    const A = Number.isFinite(Number(q.massNumber)) ? Number(q.massNumber) : null;
    const c = Number.isFinite(Number(q.charge)) ? Number(q.charge) : 0;
    const rows = [['p', 'Protons'], ['n', 'Neutrons'], ['e', 'Electrons']];
    const steps = rows.map(([k, label]) => h('div', { class: 'qb-row' },
      h('span', { class: 'qb-row__label' }, label), stepper(k, label, 0, MAX_COUNT, String)));
    focusEl = null;
    body = h('div', { class: 'qb-body' },
      h('div', { class: 'qb-given' }, tile(),
        h('p', { class: 'qb-given__text' },
          h('span', null, el ? el.name : 'Element'), ' · mass number ', h('strong', { class: 'qb-num', dataset: { testid: 'ionbuilder-given-mass' } }, A === null ? '?' : String(A)),
          ', charge ', h('strong', { class: 'qb-num', dataset: { testid: 'ionbuilder-given-charge' } }, chargeText(c)))),
      h('div', { class: 'qb-steps' }, steps));
    focusEl = body.querySelector('.qb-step__btn');
  }

  return {
    el: h('div', { class: 'qb-root', dataset: { testid: 'ionbuilder-widget' } }, body),
    refresh(answer) {
      const next = toState(q, answer);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.qb-root')) return;
      state = next;
      updaters.forEach((fn) => fn());
    },
    focus: () => focusEl && focusEl.focus(),
  };
}

function editor(q, redraw, changed) {
  const checker = h('p', { class: 'field__hint qb-ed__checker', 'aria-live': 'polite', dataset: { testid: 'ionbuilder-checker' } });
  const showChecker = () => {
    const k = keyOf(q);
    if (!k) { checker.textContent = 'Choose an element and fill in the numbers. The answer is worked out from them.'; checker.classList.add('is-bad'); return; }
    checker.classList.remove('is-bad');
    checker.textContent = q.mode === 'symbol'
      ? `Answer: ${k.symbol}, mass number ${k.massNumber}, charge ${chargeText(k.charge)}.`
      : `Answer: ${k.p} protons, ${k.n} neutrons, ${k.e} electrons.`;
  };
  const numIn = (key, testid, aria, opts = {}) => h('input', { class: 'input', type: 'number', step: '1', value: q[key] ?? '', 'aria-label': aria, dataset: { testid },
    ...opts, on: { input: (e) => { const v = e.target.value.trim(); q[key] = v === '' ? undefined : Number(v); showChecker(); changed(); } } });

  const modeSel = h('select', { class: 'select', 'aria-label': 'Mode', dataset: { testid: 'ionbuilder-mode' },
    on: { change: (e) => { q.mode = e.target.value; changed(); redraw(); } } },
    MODES.map((m) => h('option', { value: m, selected: q.mode === m }, MODE_LABELS[m])));

  const sym = normSymbol(q.element);
  const elSel = h('select', { class: 'select', 'aria-label': 'Element', dataset: { testid: 'ionbuilder-ed-element' },
    on: { change: (e) => { q.element = e.target.value; showChecker(); changed(); } } },
    [h('option', { value: '', selected: !elementOf(sym) }, 'Choose an element'),
      ...ELEMENTS.map((x) => h('option', { value: x.symbol, selected: sym === x.symbol }, `${x.number} ${x.symbol} · ${x.name}`))]);

  const given = q.mode === 'symbol'
    ? h('div', { class: 'adm-grid adm-grid--3' },
      field('Protons', numIn('p', 'ionbuilder-ed-p', 'Protons', { min: '1', max: String(ELEMENTS.length) })),
      field('Neutrons', numIn('n', 'ionbuilder-ed-n', 'Neutrons', { min: '0' })),
      field('Electrons', numIn('e', 'ionbuilder-ed-e', 'Electrons', { min: '0' })))
    : h('div', { class: 'adm-grid adm-grid--3' },
      field('Element', elSel),
      field('Mass number', numIn('massNumber', 'ionbuilder-ed-mass', 'Mass number', { min: '1' })),
      field('Charge', numIn('charge', 'ionbuilder-ed-charge', 'Charge', { min: String(CHARGE_MIN), max: String(CHARGE_MAX) })));

  const rnd = isObj(q.randomize) ? q.randomize : null;
  const listIn = (testid, aria, value, parse) => h('input', { class: 'input', type: 'text', value, 'aria-label': aria, dataset: { testid },
    on: { input: (e) => { rnd[testid.endsWith('charges') ? 'charges' : 'elements'] = parse(e.target.value); changed(); } } });
  const randomBlock = rnd ? h('div', { class: 'adm-grid adm-grid--2' },
    field('Elements (symbols, comma separated)', listIn('ionbuilder-rand-elements', 'Elements to draw from', (rnd.elements || []).join(', '),
      (s) => s.split(',').map((x) => normSymbol(x)).filter((x) => elementOf(x))), 'Each student gets one of these.'),
    field('Charges (comma separated)', listIn('ionbuilder-rand-charges', 'Charges to draw from', (rnd.charges || []).join(', '),
      (s) => s.split(',').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x))), 'Charges that do not fit the element are skipped.')) : null;

  showChecker();
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--2' }, field('Task', modeSel)),
    given,
    checker,
    switchEl({ label: 'Change the element for each student', hint: 'Pick one element and one charge from the lists below', checked: !!rnd, testid: 'ionbuilder-randomize',
      onChange: (v) => { if (v) q.randomize = { elements: ['Na', 'Mg', 'Al', 'O', 'S', 'Cl'], charges: [-2, -1, 1, 2, 3] }; else delete q.randomize; changed(); redraw(); } }),
    randomBlock,
    switchEl({ label: 'Partial credit', hint: 'Each correct field earns part of the points', checked: q.partialCredit !== false, testid: 'ionbuilder-partial',
      onChange: (v) => { q.partialCredit = v; changed(); } }));
}

function review(q, answer, { key } = {}) {
  if (key) return h('span', { class: 'qb-review', dataset: { testid: 'ionbuilder-review' } }, h('span', { class: 'qb-review__text' }, def.keyText(q)));
  const a = isObj(answer) ? answer : {};
  const answered = q.mode === 'symbol'
    ? str(a.symbol).trim() !== '' || a.massNumber !== undefined || a.charge !== undefined
    : ['p', 'n', 'e'].some((k) => a[k] !== undefined && a[k] !== '');
  if (!answered) return null;
  const f = (v) => (v === undefined || v === '' ? '?' : String(v));
  const text = q.mode === 'symbol'
    ? `${normSymbol(a.symbol) || '?'}, mass ${f(a.massNumber)}, charge ${a.charge === undefined || a.charge === '' ? '?' : chargeText(Number(a.charge))}`
    : `${f(a.p)} protons, ${f(a.n)} neutrons, ${f(a.e)} electrons`;
  return h('span', { class: 'qb-review', dataset: { testid: 'ionbuilder-review' } }, h('span', { class: 'qb-review__text' }, text));
}

registerTypeUI({ type: 'ionbuilder', widget, editor, review });
export default null;
