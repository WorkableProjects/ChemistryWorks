// `bohr` question type (V5-07, S12a) — student widget, builder editor and review.
// Answer: { shells: [n1, n2, n3, n4] }; see js/lib/qtypes/bohr.js.
import { h, icon } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field, switchEl } from '../admin/common.js';
import { ELEMENTS } from '../../lib/elements.js';
import { def, MODES, MODE_LABELS, MAX_ELECTRONS, SHELL_SLOTS, CAPACITY, elementOf, keyOf } from '../../lib/qtypes/bohr.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const RADII = [30, 52, 74, 94];

function toState(a) {
  const x = isObj(a) && Array.isArray(a.shells) ? a.shells : [];
  return Array.from({ length: SHELL_SLOTS }, (_, i) => {
    const n = Number(x[i]);
    return Number.isFinite(n) ? clamp(Math.round(n), 0, CAPACITY[i]) : 0;
  });
}

/** Shell diagram as SVG markup. Only numbers and element symbols go in, so no user text is injected. */
function diagram(counts, symbol) {
  const rings = RADII.map((r) => `<circle class="bh-ring" cx="100" cy="100" r="${r}"/>`).join('');
  const dots = [];
  counts.forEach((count, i) => {
    for (let k = 0; k < count; k++) {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / count;
      const x = (100 + RADII[i] * Math.cos(a)).toFixed(1);
      const y = (100 + RADII[i] * Math.sin(a)).toFixed(1);
      dots.push(`<circle class="bh-dot" cx="${x}" cy="${y}" r="4.5"/>`);
    }
  });
  const label = symbol ? `<text class="bh-sym" x="100" y="106" text-anchor="middle">${symbol}</text>` : '';
  return `<svg class="bh-svg" viewBox="0 0 200 200" aria-hidden="true" focusable="false">`
    + `<circle class="bh-nucleus" cx="100" cy="100" r="20"/>${label}${rings}${dots.join('')}</svg>`;
}

function widget(q, api) {
  let state = toState(api.get(q.id));
  const updaters = [];
  const el = elementOf(q.element);
  const symbol = q.mode === 'element' && el ? el.symbol : '';

  const commit = () => {
    const total = state.reduce((s, v) => s + v, 0);
    api.set(q.id, total ? { shells: state.slice() } : undefined, { debounce: true });
  };

  const diagramBox = h('div', { class: 'bh-diagram' });
  const totalOut = h('output', { class: 'bh-total', 'aria-live': 'polite', dataset: { testid: 'bohr-total' } });

  const sync = () => {
    diagramBox.innerHTML = diagram(state, symbol);
    totalOut.textContent = `Placed: ${state.reduce((s, v) => s + v, 0)}`;
  };

  const shellRow = (i) => {
    const value = h('output', { class: 'bh-step__value', 'aria-live': 'polite', dataset: { testid: `bohr-shell-${i + 1}` } }, '0');
    const dec = h('button', { type: 'button', class: 'bh-step__btn', 'aria-label': `Remove an electron from shell ${i + 1}`, dataset: { testid: `bohr-shell-${i + 1}-dec` }, on: { click: () => bump(-1) } }, icon('minus', { size: 18 }));
    const inc = h('button', { type: 'button', class: 'bh-step__btn', 'aria-label': `Add an electron to shell ${i + 1}`, dataset: { testid: `bohr-shell-${i + 1}-inc` }, on: { click: () => bump(1) } }, icon('plus', { size: 18 }));
    const bump = (d) => {
      state[i] = clamp(state[i] + d, 0, CAPACITY[i]);
      sync();
      updaters.forEach((fn) => fn());
      commit();
    };
    updaters.push(() => {
      value.textContent = String(state[i]);
      dec.disabled = state[i] <= 0;
      inc.disabled = state[i] >= CAPACITY[i];
    });
    return h('div', { class: 'bh-row' },
      h('span', { class: 'bh-row__label' }, `Shell ${i + 1}`),
      h('span', { class: 'bh-row__max' }, `max ${CAPACITY[i]}`),
      h('div', { class: 'bh-step', role: 'group', 'aria-label': `Shell ${i + 1}` }, dec, value, inc));
  };
  const rows = Array.from({ length: SHELL_SLOTS }, (_, i) => shellRow(i));

  sync();
  updaters.forEach((fn) => fn());

  const given = q.mode === 'element' && el
    ? `${el.name}, atomic number ${el.number}`
    : `${str(q.electrons)} electrons`;

  return {
    el: h('div', { class: 'bh-root', dataset: { testid: 'bohr-widget' } },
      h('div', { class: 'bh-body' },
        h('p', { class: 'bh-given', dataset: { testid: 'bohr-given' } }, given),
        diagramBox,
        h('div', { class: 'bh-rows' }, rows),
        totalOut)),
    refresh(answer) {
      const next = toState(answer);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.bh-root')) return;
      state = next;
      sync();
      updaters.forEach((fn) => fn());
    },
    focus: () => { const b = rows[0] && rows[0].querySelector('.bh-step__btn'); if (b) b.focus(); },
  };
}

function editor(q, redraw, changed) {
  const checker = h('p', { class: 'field__hint bh-ed__checker', 'aria-live': 'polite', dataset: { testid: 'bohr-checker' } });
  const showChecker = () => {
    const k = keyOf(q);
    if (!k) { checker.textContent = `Choose an element or enter 1 to ${MAX_ELECTRONS} electrons.`; checker.classList.add('is-bad'); return; }
    checker.classList.remove('is-bad');
    checker.textContent = `Answer: ${k.shells.join(', ')}.`;
  };

  const modeSel = h('select', { class: 'select', 'aria-label': 'Mode', dataset: { testid: 'bohr-mode' },
    on: { change: (e) => { q.mode = e.target.value; changed(); redraw(); } } },
    MODES.map((m) => h('option', { value: m, selected: q.mode === m }, MODE_LABELS[m])));

  const sym = normalizeSymbol(q.element);
  const elSel = h('select', { class: 'select', 'aria-label': 'Element', dataset: { testid: 'bohr-ed-element' },
    on: { change: (e) => { q.element = e.target.value; showChecker(); changed(); } } },
    [h('option', { value: '', selected: !sym }, 'Choose an element'),
      ...ELEMENTS.slice(0, MAX_ELECTRONS).map((x) => h('option', { value: x.symbol, selected: sym === x.symbol }, `${x.number} ${x.symbol} · ${x.name}`))]);

  const countIn = h('input', { class: 'input', type: 'number', step: '1', min: '1', max: String(MAX_ELECTRONS), value: q.electrons ?? '', 'aria-label': 'Electrons', dataset: { testid: 'bohr-ed-electrons' },
    on: { input: (e) => { const v = e.target.value.trim(); q.electrons = v === '' ? undefined : Number(v); showChecker(); changed(); } } });

  const given = q.mode === 'count'
    ? field('Electrons', countIn, `Whole number from 1 to ${MAX_ELECTRONS}.`)
    : field('Element', elSel, `First ${MAX_ELECTRONS} elements only.`);

  showChecker();
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--2' }, field('Task', modeSel)),
    given,
    checker,
    switchEl({ label: 'Partial credit', hint: 'Each correct shell earns part of the points', checked: q.partialCredit !== false, testid: 'bohr-partial',
      onChange: (v) => { q.partialCredit = v; changed(); } }));
}

/** Symbol in standard case, or '' when it is not an element. */
function normalizeSymbol(s) {
  const el = elementOf(str(s));
  return el ? el.symbol : '';
}

function review(q, answer, { key } = {}) {
  if (key) {
    const k = keyOf(q);
    if (!k) return null;
    const box = h('span', { class: 'bh-review', dataset: { testid: 'bohr-review' } },
      h('span', { class: 'bh-review__diagram' }),
      h('span', { class: 'bh-review__text' }, def.keyText(q)));
    box.querySelector('.bh-review__diagram').innerHTML = diagram(Array.from({ length: SHELL_SLOTS }, (_, i) => k.shells[i] || 0), q.mode === 'element' ? normalizeSymbol(q.element) : '');
    return box;
  }
  const a = isObj(answer) && Array.isArray(answer.shells) ? answer.shells : null;
  if (!a || !a.some((v) => v !== undefined && v !== '' && v !== 0)) return null;
  const text = a.slice(0, SHELL_SLOTS).map((v) => Number(v) || 0).filter((v) => v > 0).join(', ');
  return h('span', { class: 'bh-review', dataset: { testid: 'bohr-review' } }, h('span', { class: 'bh-review__text' }, text));
}

registerTypeUI({ type: 'bohr', widget, editor, review });
export default null;
