// `gaslaw` question type — student widget, builder editor and review.
// Answer: { law, setup: { slot: knownKey | '?' }, value }; see js/lib/qtypes/gaslaw.js.
import { h } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field } from '../admin/common.js';
import { def, LAWS, LAW_IDS, UNKNOWN, lawVars, varLabel, varSymbol, formulaText, solve } from '../../lib/qtypes/gaslaw.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (s) => JSON.parse(JSON.stringify(s));
const knownText = (k) => `${str(k && k.value)} ${str(k && k.unit)}`.trim();

function toState(a) {
  const x = isObj(a) ? a : {};
  return { law: str(x.law), setup: isObj(x.setup) ? { ...x.setup } : {}, value: str(x.value) };
}

function widget(q, api) {
  let state = toState(api.get(q.id));
  const updaters = [];
  const commit = () => {
    const out = {};
    if (state.law) out.law = state.law;
    const setup = Object.fromEntries(Object.entries(state.setup).filter(([, v]) => v !== ''));
    if (Object.keys(setup).length) out.setup = setup;
    if (state.value.trim()) out.value = state.value;
    api.set(q.id, Object.keys(out).length ? clone(out) : undefined, { debounce: true });
  };

  const lawSel = h('select', { class: 'select qg-law', 'aria-label': 'Gas law', dataset: { testid: 'gaslaw-law' },
    on: { change: (e) => { state.law = e.target.value; state.setup = {}; commit(); drawSlots(); } } },
    h('option', { value: '' }, 'Choose a law'),
    LAW_IDS.map((id) => h('option', { value: id }, LAWS[id].label)));

  const formula = h('p', { class: 'qg-formula', dataset: { testid: 'gaslaw-formula' } });
  const slots = h('div', { class: 'qg-slots', dataset: { testid: 'gaslaw-slots' } });

  const bank = h('ul', { class: 'qg-bank', 'aria-label': 'Given values', dataset: { testid: 'gaslaw-given' } },
    Object.entries(q.knowns || {}).map(([k, v]) => h('li', { class: 'qg-chip' }, knownText(v))));

  function drawSlots() {
    formula.textContent = state.law ? formulaText(state.law) : '';
    slots.replaceChildren();
    if (!state.law) {
      slots.append(h('p', { class: 'qg-hint' }, 'Choose a law to see its formula'));
      return;
    }
    for (const v of lawVars(state.law)) {
      const sel = h('select', { class: 'select qg-slot', 'aria-label': `Value for ${varSymbol(v)}`, dataset: { testid: `gaslaw-slot-${v}` },
        on: { change: (e) => { state.setup[v] = e.target.value; commit(); } } },
        h('option', { value: '' }, 'Choose'),
        Object.entries(q.knowns || {}).map(([k, kv]) => h('option', { value: k }, knownText(kv))),
        h('option', { value: UNKNOWN }, 'Unknown (?)'));
      sel.value = str(state.setup[v]);
      slots.append(h('label', { class: 'qg-slot-row' }, h('span', { class: 'qg-slot-label' }, varSymbol(v)), sel));
    }
  }

  const valueIn = h('input', { class: 'input qg-value', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Answer', dataset: { testid: 'gaslaw-value' },
    on: { input: (e) => { state.value = e.target.value; commit(); } } });

  const sync = () => { lawSel.value = state.law; valueIn.value = state.value; drawSlots(); };
  sync();
  updaters.push(sync);

  return {
    el: h('div', { class: 'qg-root', dataset: { testid: 'gaslaw-widget' } },
      h('div', { class: 'qg-step' }, h('span', { class: 'qg-step__label' }, '1  Law'), lawSel, formula),
      h('div', { class: 'qg-step' }, h('span', { class: 'qg-step__label' }, '2  Set up'), bank, slots),
      h('div', { class: 'qg-step' }, h('span', { class: 'qg-step__label' }, '3  Solve'),
        h('div', { class: 'qg-answer' }, valueIn, q.unit ? h('span', { class: 'qg-unit' }, q.unit) : null))),
    refresh(answer) {
      const next = toState(answer);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.qg-root')) return;
      state = next;
      updaters.forEach((fn) => fn());
    },
    focus: () => lawSel.focus(),
  };
}

function editor(q, redraw, changed) {
  const checker = h('p', { class: 'field__hint', 'aria-live': 'polite', dataset: { testid: 'gaslaw-checker' } });
  const showChecker = () => {
    const k = solve(q);
    checker.textContent = isObj(q.vary) && Object.keys(q.vary).length ? 'The answer is worked out for each student from the values they get.'
      : k === null ? 'Fill in every value. The answer is worked out from them.' : `Answer: ${def.keyText(q)}`;
  };
  const lawSel = h('select', { class: 'select', 'aria-label': 'Gas law', dataset: { testid: 'gaslaw-ed-law' },
    on: { change: (e) => { q.law = e.target.value; def.normalize(q); changed(); redraw(); } } },
    LAW_IDS.map((id) => h('option', { value: id, selected: q.law === id }, LAWS[id].label)));
  const unkSel = h('select', { class: 'select', 'aria-label': 'Solve for', dataset: { testid: 'gaslaw-ed-unknown' },
    on: { change: (e) => { q.unknown = e.target.value; def.normalize(q); changed(); redraw(); } } },
    h('option', { value: '', selected: !q.unknown }, 'Choose a quantity'),
    lawVars(q.law).map((v) => h('option', { value: v, selected: q.unknown === v }, `${varSymbol(v)} · ${varLabel(v).toLowerCase()}`)));

  const rows = lawVars(q.law).filter((v) => v !== q.unknown).map((v) => {
    const k = (q.knowns[v] = q.knowns[v] || { value: '', unit: '' });
    return h('div', { class: 'adm-grid adm-grid--3' },
      field(`${varSymbol(v)} · ${varLabel(v).toLowerCase()}`, h('input', { class: 'input', type: 'text', value: k.value, 'aria-label': `Value of ${varSymbol(v)}`, dataset: { testid: `gaslaw-ed-${v}` },
        on: { input: (e) => { k.value = e.target.value.trim(); showChecker(); changed(); } } })),
      field('Unit', h('input', { class: 'input', type: 'text', value: k.unit, 'aria-label': `Unit of ${varSymbol(v)}`,
        on: { input: (e) => { k.unit = e.target.value.trim(); changed(); } } })));
  });

  const varyIn = h('textarea', { class: 'input', rows: 3, 'aria-label': 'Variables for each student', spellcheck: 'false', dataset: { testid: 'gaslaw-ed-vary' },
    on: { change: (e) => {
      const t = e.target.value.trim();
      if (!t) delete q.vary;
      else { try { q.vary = JSON.parse(t); } catch { q.vary = 'invalid'; } }
      def.normalize(q); showChecker(); changed();
    } } });
  varyIn.value = isObj(q.vary) ? JSON.stringify(q.vary) : '';

  showChecker();
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--2' }, field('Law', lawSel, formulaText(q.law)), field('Solve for', unkSel)),
    ...rows,
    h('div', { class: 'adm-grid adm-grid--3' },
      field('Answer unit', h('input', { class: 'input', type: 'text', value: q.unit || '', 'aria-label': 'Answer unit', dataset: { testid: 'gaslaw-ed-unit' }, on: { input: (e) => { q.unit = e.target.value.trim(); changed(); } } })),
      field('Tolerance (%)', h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: q.tolerance ?? 1, 'aria-label': 'Tolerance in percent', dataset: { testid: 'gaslaw-ed-tolerance' },
        on: { input: (e) => { q.tolerance = e.target.value === '' ? 1 : Number(e.target.value); showChecker(); changed(); } } })),
      field('Significant figures', h('input', { class: 'input', type: 'number', min: '1', max: '15', step: '1', value: q.sigFigs ?? '', 'aria-label': 'Significant figures required', dataset: { testid: 'gaslaw-ed-sigfigs' },
        on: { input: (e) => { if (e.target.value === '') delete q.sigFigs; else q.sigFigs = Number(e.target.value); showChecker(); changed(); } } }), 'Leave empty to accept any')),
    checker,
    field('Change the values for each student (optional)', varyIn, 'Variables as JSON, such as {"P1": {"min": 1, "max": 3, "step": 0.5}}. Use {P1} in the text and in the values.'));
}

function review(q, answer, { key } = {}) {
  if (key) return h('span', { class: 'qg-review', dataset: { testid: 'gaslaw-review' } }, h('span', { class: 'qg-review__text' }, def.keyText(q)));
  const a = isObj(answer) ? answer : {};
  if (!def.isAnswered(q, a)) return null;
  const slots = isObj(a.setup) ? lawVars(a.law).filter((v) => a.setup[v]).map((v) => `${varSymbol(v)} = ${a.setup[v] === UNKNOWN ? '?' : knownText(q.knowns && q.knowns[a.setup[v]]) || '?'}`).join(', ') : '';
  const lines = [def.answerText(q, a), slots].filter(Boolean);
  return h('span', { class: 'qg-review', dataset: { testid: 'gaslaw-review' } }, lines.map((t) => h('span', { class: 'qg-review__text' }, t)));
}

registerTypeUI({ type: 'gaslaw', widget, editor, review });
export default null;
