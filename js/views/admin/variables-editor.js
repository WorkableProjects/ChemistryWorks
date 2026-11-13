// Builder panel for algorithmic questions: variables (random range / pick list / derived formula), the answer
// formula, and a live sample (re-roll) so the teacher sees real numbers and the computed answer while editing.
// Mounted under the numeric and sigfigs editors in js/views/admin/editors/core.js.
//   variablesEditor(q, redraw, changed) -> Node
import { h } from '../../ui.js';
import { field } from './common.js';
import { sampleDraw, validateVariables, ALGORITHMIC_TYPES } from '../../lib/algorithmic.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const KINDS = [['range', 'Random number'], ['pick', 'Pick from a list'], ['formula', 'Calculated']];
const kindOf = (def) => (isObj(def) && Array.isArray(def.pick) ? 'pick' : isObj(def) && typeof def.formula === 'string' ? 'formula' : 'range');

/** "NaCl, KCl" -> ['NaCl','KCl']; a list of only numbers becomes numbers. */
export function parsePickList(text) {
  const parts = String(text ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return parts.every((x) => Number.isFinite(Number(x))) && parts.length ? parts.map(Number) : parts;
}

export function variablesEditor(q, redraw, changed) {
  if (!ALGORITHMIC_TYPES.includes(q.type)) return null;
  let roll = 1;
  const sample = h('div', { class: 'adm-vars__sample', 'aria-live': 'polite', dataset: { testid: 'variables-sample' } });
  const refresh = () => {
    if (!isObj(q.variables) || !Object.keys(q.variables).length) { sample.replaceChildren(h('p', { class: 'field__hint' }, 'Add a variable to randomize this question.')); return; }
    const errors = [];
    validateVariables(q, 'This question', errors);
    if (errors.length) { sample.replaceChildren(h('ul', { class: 'adm-vars__errors', dataset: { testid: 'variables-error' } }, errors.map((e) => h('li', {}, e)))); return; }
    const res = sampleDraw(q, `sample-${roll}`);
    if (!res.ok) { sample.replaceChildren(h('p', { class: 'adm-vars__errors', dataset: { testid: 'variables-error' } }, res.error)); return; }
    sample.replaceChildren(
      h('p', { class: 'adm-vars__line' }, h('strong', {}, 'Sample values: '), res.values.map(([k, v]) => `${k} = ${v}`).join(', ')),
      res.text ? h('p', { class: 'adm-vars__line' }, h('strong', {}, 'Question: '), res.text) : null,
      ...res.answers.map((a) => h('p', { class: 'adm-vars__line', dataset: { testid: 'variables-answer' } }, h('strong', {}, `${a.label}: `), String(a.value))));
  };
  const reroll = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'variables-reroll' }, on: { click: () => { roll++; refresh(); } } }, 'Re-roll sample');

  const names = Object.keys(isObj(q.variables) ? q.variables : {});
  const renameKey = (old, next) => {
    const out = {};
    for (const [k, v] of Object.entries(q.variables)) out[k === old ? next : k] = v;
    q.variables = out;
  };
  const num = (label, def, key, testid, { step = 'any', min, hint = null } = {}) => field(label, h('input', { class: 'input', type: 'number', step, min, value: def[key] ?? '', dataset: { testid },
    on: { input: (e) => { if (e.target.value.trim() === '') delete def[key]; else def[key] = Number(e.target.value); changed(); refresh(); } } }), hint);
  const rows = names.map((name, i) => {
    const def = q.variables[name];
    const kind = kindOf(def);
    const nameIn = h('input', { class: 'input q-input--formula', value: name, autocomplete: 'off', spellcheck: 'false', 'aria-label': `Variable ${i + 1} name`, dataset: { testid: `variables-name-${i}` },
      on: { change: (e) => { const next = e.target.value.trim(); if (next && next !== name && !(next in q.variables)) { renameKey(name, next); changed(); redraw(); } else e.target.value = name; } } });
    const kindSel = h('select', { class: 'select', 'aria-label': `Variable ${i + 1} kind`, dataset: { testid: `variables-kind-${i}` },
      on: { change: (e) => {
        const k = e.target.value;
        q.variables[name] = k === 'pick' ? { pick: ['NaCl', 'KCl'] } : k === 'formula' ? { formula: '', sigFigs: 3 } : { min: 1, max: 10, step: 1 };
        changed(); redraw();
      } } }, KINDS.map(([v, t]) => h('option', { value: v, selected: v === kind }, t)));
    let body;
    if (kind === 'pick') {
      body = field('Values (comma-separated)', h('input', { class: 'input', value: def.pick.join(', '), autocomplete: 'off', dataset: { testid: `variables-pick-${i}` },
        on: { input: (e) => { def.pick = parsePickList(e.target.value); changed(); refresh(); } } }), 'For example NaCl, KCl, CaCl2');
    } else if (kind === 'formula') {
      body = h('div', { class: 'adm-grid adm-grid--2' },
        field('Formula', h('input', { class: 'input q-input--formula', value: def.formula, autocomplete: 'off', spellcheck: 'false', dataset: { testid: `variables-derived-${i}` },
          on: { input: (e) => { def.formula = e.target.value; changed(); refresh(); } } }), 'Uses the other variables'),
        num('Significant figures', def, 'sigFigs', `variables-sigfigs-${i}`, { step: '1', min: '1' }));
    } else {
      body = h('div', { class: 'adm-grid adm-grid--4' },
        num('Minimum', def, 'min', `variables-min-${i}`), num('Maximum', def, 'max', `variables-max-${i}`),
        num('Step', def, 'step', `variables-step-${i}`, { min: '0', hint: 'Empty = any value' }), num('Significant figures', def, 'sigFigs', `variables-sigfigs-${i}`, { step: '1', min: '1' }));
    }
    return h('fieldset', { class: 'adm-vars__row' },
      h('legend', {}, `Variable {${name}}`),
      h('div', { class: 'adm-grid adm-grid--2' }, field('Name', nameIn, 'Use {name} in the question text'), field('Kind', kindSel)),
      body,
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-label': `Remove variable ${name}`, dataset: { testid: `variables-remove-${i}` },
        on: { click: () => { delete q.variables[name]; if (!Object.keys(q.variables).length) { delete q.variables; delete q.answerFormula; } changed(); redraw(); } } }, 'Remove variable'));
  });
  const addVar = h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'variables-add' },
    on: { click: () => {
      q.variables = isObj(q.variables) ? q.variables : {};
      let n = 1;
      const base = Object.keys(q.variables).length ? 'v' : 'm';
      let name = base;
      while (name in q.variables) name = `${base}${++n}`;
      q.variables[name] = { min: 1, max: 10, step: 1 };
      changed(); redraw();
    } } }, 'Add variable');
  const formula = h('input', { class: 'input q-input--formula', value: q.answerFormula || '', placeholder: '= m / molarMass(compound)', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Answer formula', dataset: { testid: 'variables-formula' },
    on: { input: (e) => { if (e.target.value.trim()) q.answerFormula = e.target.value; else delete q.answerFormula; changed(); refresh(); } } });
  refresh();
  return h('details', { class: 'adm-vars', open: names.length > 0, dataset: { testid: 'variables-panel' } },
    h('summary', {}, 'Randomize with variables (optional)'),
    h('div', { class: 'stack' },
      h('p', { class: 'field__hint' }, 'Each student gets their own numbers, the same on every device. Write {name} in the question text; the answer formula gives the correct answer. Functions: molarMass, moles, convert, idealGasP, dilutionC2, pH, sqrt, log, …'),
      rows, addVar,
      names.length ? field('Answer formula', formula, 'Numbers, + − × ÷ ^, parentheses, variables and the functions above') : null,
      names.length ? h('div', { class: 'adm-vars__preview' }, sample, reroll) : null));
}
