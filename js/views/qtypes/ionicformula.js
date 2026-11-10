// `ionicformula` UI (V5-07, S11a): ion tiles (drag or tap) into a cation slot and an anion slot, counts with steppers,
// live formula and charge balance, optional name field. Answer = { cation, anion, nCation, nAnion, name? }.
import { h } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field, switchEl } from '../admin/common.js';
import { formulaToHTML } from '../../lib/formula.js';
import {
  COMMON_IONS, ionId, ionLabel, findIon, formulaOf, answerFormula, keyFormula, keyName, balancedCounts,
} from '../../lib/qtypes/ionicformula.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));
const MAX_COUNT = 9;
const ionEl = (ion) => h('span', { class: 'q-ionf__ion', html: formulaToHTML(ionLabel(ion)) });
const formulaEl = (f) => h('span', { class: 'q-ionf__formula', html: formulaToHTML(f) });

function toState(a) {
  const o = a && typeof a === 'object' ? a : {};
  return { cation: str(o.cation), anion: str(o.anion), nCation: Number(o.nCation) || 0, nAnion: Number(o.nAnion) || 0, name: str(o.name) };
}

function widget(q, api) {
  let state = toState(api.get(q.id));
  const cations = q.ions.filter((i) => i.charge > 0);
  const anions = q.ions.filter((i) => i.charge < 0);
  const commit = () => {
    const empty = !state.cation && !state.anion && !state.name.trim();
    const out = { cation: state.cation, anion: state.anion, nCation: state.nCation, nAnion: state.nAnion };
    if (q.askName) out.name = state.name;
    api.set(q.id, empty ? undefined : out, { debounce: true });
    draw();
  };
  const place = (ion) => {
    const side = ion.charge > 0 ? 'cation' : 'anion';
    state[side] = ion.id;
    if (!state[side === 'cation' ? 'nCation' : 'nAnion']) state[side === 'cation' ? 'nCation' : 'nAnion'] = 1;
    commit();
  };
  const clearSide = (side) => { state[side] = ''; state[side === 'cation' ? 'nCation' : 'nAnion'] = 0; commit(); };
  const step = (side, d) => {
    const k = side === 'cation' ? 'nCation' : 'nAnion';
    state[k] = Math.max(1, Math.min(MAX_COUNT, (state[k] || 1) + d));
    commit();
  };

  const tile = (ion, side) => h('button', {
    type: 'button', class: ['q-ionf__tile', state[side] === ion.id && 'is-placed'], draggable: 'true',
    'aria-pressed': state[side] === ion.id ? 'true' : 'false', 'aria-label': `${ion.name ? `${ion.name}, ` : ''}${ion.symbol} charge ${ion.charge > 0 ? '+' : '−'}${Math.abs(ion.charge)}`,
    dataset: { testid: `ionicformula-${side}-${ion.id}` },
    on: {
      click: () => place(ion),
      dragstart: (e) => { try { e.dataTransfer.setData('text/plain', ion.id); e.dataTransfer.effectAllowed = 'copy'; } catch { /* ignore */ } },
    },
  }, ionEl(ion), ion.name ? h('span', { class: 'q-ionf__tile-name' }, ion.name) : null);

  const slot = (side) => {
    const body = h('div', { class: 'q-ionf__slot-body' });
    const el = h('div', {
      class: 'q-ionf__slot', role: 'group', 'aria-label': side === 'cation' ? 'Cation slot' : 'Anion slot', dataset: { testid: `ionicformula-slot-${side}` },
      on: {
        dragover: (e) => { e.preventDefault(); el.classList.add('is-over'); },
        dragleave: () => el.classList.remove('is-over'),
        drop: (e) => {
          e.preventDefault(); el.classList.remove('is-over');
          let id = '';
          try { id = e.dataTransfer.getData('text/plain'); } catch { /* ignore */ }
          const ion = findIon(q, id);
          if (ion && (ion.charge > 0) === (side === 'cation')) place(ion);
        },
      },
    }, h('span', { class: 'q-ionf__slot-label' }, side === 'cation' ? 'Cation' : 'Anion'), body);
    return { el, body };
  };
  const slots = { cation: slot('cation'), anion: slot('anion') };

  const formulaOut = h('div', { class: 'q-ionf__formula-out', 'aria-live': 'polite', dataset: { testid: 'ionicformula-formula' } });
  const chargeOut = h('p', { class: 'q-hint q-ionf__charge', 'aria-live': 'polite', dataset: { testid: 'ionicformula-charge' } });
  const name = q.askName ? h('input', {
    class: 'input q-input q-ionf__name', type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Name of the compound', placeholder: 'Name of the compound', value: state.name, dataset: { testid: 'ionicformula-name' },
    on: { input: (e) => { state.name = e.target.value; const empty = !state.cation && !state.anion && !state.name.trim(); api.set(q.id, empty ? undefined : { cation: state.cation, anion: state.anion, nCation: state.nCation, nAnion: state.nAnion, name: state.name }, { debounce: true }); } },
  }) : null;

  const counter = (side) => {
    const n = side === 'cation' ? state.nCation : state.nAnion;
    return h('div', { class: 'q-ionf__count', role: 'group', 'aria-label': `Number of ${side}s` },
      h('button', { type: 'button', class: 'btn btn--ghost q-ionf__step', 'aria-label': `Fewer ${side}s`, disabled: n <= 1, dataset: { testid: `ionicformula-dec-${side}` }, on: { click: () => step(side, -1) } }, '−'),
      h('span', { class: 'q-ionf__n', dataset: { testid: `ionicformula-n-${side}` } }, String(n)),
      h('button', { type: 'button', class: 'btn btn--ghost q-ionf__step', 'aria-label': `More ${side}s`, disabled: n >= MAX_COUNT, dataset: { testid: `ionicformula-inc-${side}` }, on: { click: () => step(side, 1) } }, '+'));
  };

  function draw() {
    for (const side of ['cation', 'anion']) {
      const ion = findIon(q, state[side]);
      slots[side].body.replaceChildren(...(ion
        ? [ionEl(ion), counter(side), h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: `ionicformula-remove-${side}` }, on: { click: () => clearSide(side) } }, 'Remove')]
        : [h('span', { class: 'q-ionf__empty' }, 'Drop or tap an ion')]));
    }
    for (const b of bankEl.querySelectorAll('.q-ionf__tile')) {
      const id = b.dataset.testid.replace(/^ionicformula-(cation|anion)-/, '');
      b.classList.toggle('is-placed', id === state.cation || id === state.anion);
      b.setAttribute('aria-pressed', id === state.cation || id === state.anion ? 'true' : 'false');
    }
    const c = findIon(q, state.cation);
    const a = findIon(q, state.anion);
    const f = formulaOf(c, a, state.nCation, state.nAnion);
    formulaOut.replaceChildren(f ? formulaEl(f) : h('span', { class: 'q-ionf__empty' }, 'Formula appears here'));
    if (c && a) {
      const total = c.charge * state.nCation + a.charge * state.nAnion;
      chargeOut.textContent = total === 0 ? 'Total charge 0: balanced' : `Total charge ${total > 0 ? '+' : '−'}${Math.abs(total)}: not balanced`;
      chargeOut.classList.toggle('is-bad', total !== 0);
    } else { chargeOut.textContent = 'Choose a cation and an anion'; chargeOut.classList.remove('is-bad'); }
  }

  const bankEl = h('div', { class: 'q-ionf__bank', dataset: { testid: 'ionicformula-bank' } },
    h('div', { class: 'q-ionf__group', role: 'group', 'aria-label': 'Cations' }, cations.map((i) => tile(i, 'cation'))),
    h('div', { class: 'q-ionf__group', role: 'group', 'aria-label': 'Anions' }, anions.map((i) => tile(i, 'anion'))));

  const root = h('div', { class: 'q-ionf', dataset: { testid: 'ionicformula-widget' } },
    h('p', { class: 'q-hint' }, 'Tap or drag one cation and one anion, then set how many of each so the charges balance.'),
    bankEl,
    h('div', { class: 'q-ionf__slots' }, slots.cation.el, slots.anion.el),
    formulaOut, chargeOut, name);
  draw();
  return {
    el: root,
    refresh(answer) {
      const next = toState(answer);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      if (document.activeElement && root.contains(document.activeElement) && document.activeElement === name) return;
      state = next; if (name) name.value = state.name; draw();
    },
    focus: () => root.querySelector('.q-ionf__tile')?.focus(),
  };
}

function editor(q, redraw, changed) {
  const refresh = () => { changed(); redraw(); };
  const addIon = (o) => {
    const ion = { symbol: o.symbol.trim(), charge: Math.trunc(Number(o.charge)) || 0, name: str(o.name).trim() };
    if (!ion.symbol || !ion.charge) return;
    ion.id = ionId(ion);
    if (!q.ions.some((i) => i.id === ion.id)) q.ions.push(ion);
  };
  const common = h('div', { class: 'q-ionf-ed__common', role: 'group', 'aria-label': 'Common ions' }, COMMON_IONS.map((c) => {
    const id = ionId(c);
    const box = h('input', { type: 'checkbox', checked: q.ions.some((i) => i.id === id), dataset: { testid: `ionicformula-common-${id}` },
      on: { change: () => { if (box.checked) addIon(c); else q.ions = q.ions.filter((i) => i.id !== id); refresh(); } } });
    return h('label', { class: 'q-ionf-ed__pick' }, box, h('span', { html: formulaToHTML(ionLabel(c)) }));
  }));

  const cs = h('input', { class: 'input', placeholder: 'Formula, e.g. ClO3', 'aria-label': 'Custom ion formula', dataset: { testid: 'ionicformula-custom-symbol' } });
  const cc = h('input', { class: 'input', type: 'number', step: '1', placeholder: 'Charge, e.g. -1', 'aria-label': 'Custom ion charge', dataset: { testid: 'ionicformula-custom-charge' } });
  const cn = h('input', { class: 'input', placeholder: 'Name, e.g. chlorate', 'aria-label': 'Custom ion name', dataset: { testid: 'ionicformula-custom-name' } });
  const custom = h('div', { class: 'adm-grid adm-grid--3' }, cs, cc, cn);
  const addBtn = h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'ionicformula-custom-add' },
    on: { click: () => { addIon({ symbol: cs.value, charge: cc.value, name: cn.value }); refresh(); } } }, 'Add ion');

  const bankList = h('div', { class: 'q-ionf-ed__bank' }, q.ions.length ? q.ions.map((i) => h('span', { class: 'q-ionf-ed__chip' },
    ionEl(i), i.name ? h('span', { class: 'q-ionf-ed__chip-name' }, i.name) : null,
    h('button', { type: 'button', class: 'btn btn--ghost', 'aria-label': `Remove ${i.id}`, on: { click: () => { q.ions = q.ions.filter((x) => x !== i); refresh(); } } }, 'Remove')))
    : h('span', { class: 'field__hint' }, 'No ions yet. Tick some above or add your own.'));

  const select = (list, value, onChange, testid) => h('select', { class: 'select', dataset: { testid }, on: { change: (e) => onChange(e.target.value) } },
    h('option', { value: '' }, 'Choose…'), list.map((i) => h('option', { value: i.id, selected: i.id === value }, `${i.symbol} ${i.charge > 0 ? '+' : '−'}${Math.abs(i.charge)}${i.name ? ` (${i.name})` : ''}`)));
  const cats = q.ions.filter((i) => i.charge > 0);
  const ans = q.ions.filter((i) => i.charge < 0);

  const checker = h('p', { class: 'field__hint', 'aria-live': 'polite', dataset: { testid: 'ionicformula-key' } },
    keyFormula(q) ? `Answer: ${keyFormula(q)}${q.askName ? ` (${keyName(q)})` : ''}` : 'Choose the cation and anion students must build.');

  const targets = h('div', { class: 'q-ionf-ed__targets' }, (q.targets || []).map((t, n) => h('div', { class: 'q-ionf-ed__target' },
    select(cats, t.cation, (v) => { t.cation = v; refresh(); }, `ionicformula-target-${n}-cation`),
    select(ans, t.anion, (v) => { t.anion = v; refresh(); }, `ionicformula-target-${n}-anion`),
    h('button', { type: 'button', class: 'btn btn--ghost', on: { click: () => { q.targets.splice(n, 1); if (!q.targets.length) delete q.targets; refresh(); } } }, 'Remove'))),
  h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'ionicformula-target-add' },
    on: { click: () => { (q.targets = q.targets || []).push({ cation: q.cation, anion: q.anion }); refresh(); } } }, 'Add a random target'));

  const nameIn = h('input', { class: 'input', value: q.targetName || '', placeholder: 'Leave empty to use the ion names', dataset: { testid: 'ionicformula-target-name' },
    on: { input: (e) => { q.targetName = e.target.value.trim(); if (!q.targetName) delete q.targetName; changed(); } } });

  return h('div', { class: 'stack' },
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Common ions'), common),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Add your own ion'), custom, addBtn),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Ion bank'), bankList),
    h('div', { class: 'adm-grid adm-grid--2' }, field('Target cation', select(cats, q.cation, (v) => { q.cation = v; refresh(); }, 'ionicformula-cation-select')),
      field('Target anion', select(ans, q.anion, (v) => { q.anion = v; refresh(); }, 'ionicformula-anion-select'))),
    checker,
    switchEl({ label: 'Students also name the compound', hint: 'Worth half the points', checked: q.askName, testid: 'ionicformula-ask-name', onChange: (v) => { q.askName = v; refresh(); } }),
    q.askName ? field('Accepted name', nameIn) : null,
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Random targets'), h('span', { class: 'field__hint' }, 'Each student gets one of these pairs instead of the target above'), targets));
}

function review(q, answer, { key } = {}) {
  if (key) {
    const f = keyFormula(q);
    return f ? h('span', { class: 'q-ionf-review', dataset: { testid: 'ionicformula-review' } }, formulaEl(f), q.askName && keyName(q) ? h('span', { class: 'q-ionf-review__name' }, keyName(q)) : null) : null;
  }
  const f = answerFormula(q, answer);
  if (!f && !str(answer && answer.name).trim()) return null;
  return h('span', { class: 'q-ionf-review', dataset: { testid: 'ionicformula-review' } }, f ? formulaEl(f) : null, str(answer && answer.name).trim() ? h('span', { class: 'q-ionf-review__name' }, str(answer.name).trim()) : null);
}

registerTypeUI({ type: 'ionicformula', widget, editor, review });
export { balancedCounts };
export default null;
