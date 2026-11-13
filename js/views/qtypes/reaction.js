// UI for `reaction` (V4-03): predict the products. The student types the product side; a live preview shows how it was read.
// Answer = the typed text, e.g. "AgCl(s) + NaNO3(aq)".
import { h } from '../../ui.js';
import { field, switchEl } from '../admin/common.js';
import { formulaToHTML } from '../../lib/formula.js';
import { parseSide, parseSpecies } from '../../lib/qtypes/reaction.js';
import { registerTypeUI } from './registry.js';

/** Species as formatted HTML (formulaToHTML escapes its input). */
const speciesHTML = (sp) => `${sp.coefficient && sp.coefficient !== 1 ? `<span class="q-rxn__coef">${Number(sp.coefficient) || ''}</span> ` : ''}<span class="formula">${formulaToHTML(sp.formula)}</span>${sp.state ? `<span class="q-rxn__state">(${String(sp.state).replace(/[^a-z]/g, '')})</span>` : ''}`;
const joinHTML = (list) => list.map(speciesHTML).join('<span class="q-rxn__plus"> + </span>');

function widget(q, api) {
  const preview = h('div', { class: 'q-rxn__preview q-formula-preview', 'aria-live': 'polite', dataset: { testid: 'reaction-preview' } });
  const update = () => {
    const sp = parseSide(input.value);
    preview.classList.toggle('is-empty', !sp.length);
    if (!sp.length) { preview.textContent = 'Formatted preview appears here'; return; }
    preview.innerHTML = joinHTML(sp);
  };
  const input = h('input', {
    class: 'input q-input q-input--formula', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
    placeholder: q.requireStates ? 'e.g. AgCl(s) + NaNO3(aq)' : 'e.g. AgCl + NaNO3', 'aria-label': 'Products of the reaction',
    dataset: { testid: 'reaction-input' }, on: { input: () => { api.set(q.id, input.value, { debounce: true }); update(); } },
  });
  const notes = ['Separate products with " + ".'];
  if (q.requireStates) notes.push('Include states: (s), (l), (g) or (aq).');
  if (q.requireCoefficients) notes.push('Include coefficients, like 2H2O.');
  if (q.netIonic) notes.push('Write the net ionic equation: show ions with charges, like Ag^+ and Cl^-.');
  const reactants = parseSide(q.reactants);
  update();
  return {
    el: h('div', { class: 'q-reaction' },
      h('div', { class: 'q-rxn__eq' },
        h('span', { class: 'q-rxn__reactants', dataset: { testid: 'reaction-reactants' }, html: joinHTML(reactants) }),
        h('span', { class: 'q-rxn__arrow', 'aria-label': 'yields' }, '→'), h('span', { class: 'q-rxn__q', 'aria-hidden': 'true' }, '?')),
      input, h('p', { class: 'q-hint' }, notes.join(' ')), preview),
    refresh(answer) { if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : ''; update(); },
    focus: () => input.focus(),
  };
}

function editor(q, redraw, changed) {
  const reactants = h('input', { class: 'input', value: q.reactants, autocomplete: 'off', placeholder: 'AgNO3(aq) + NaCl(aq)', dataset: { testid: 'reaction-edit-reactants' },
    on: { input: () => { q.reactants = reactants.value; changed(); } } });
  const products = h('input', { class: 'input', value: (q.products || []).join(' + '), autocomplete: 'off', placeholder: 'AgCl(s) + NaNO3(aq)', dataset: { testid: 'reaction-edit-products' },
    on: { input: () => { q.products = parseSide(products.value).map((s) => s.text); read.innerHTML = (q.products || []).map((p) => joinHTML([parseSpecies(p)])).join('<br>'); changed(); } } });
  const read = h('div', { class: 'q-formula-preview', 'aria-live': 'polite', dataset: { testid: 'reaction-edit-read' }, html: (q.products || []).map((p) => joinHTML([parseSpecies(p)])).join('<br>') });
  const sw = (label, hint, key, testid) => switchEl({ label, hint, checked: q[key], testid, onChange: (v) => { q[key] = v; changed(); } });
  return h('div', { class: 'stack' },
    field('Reactants', reactants, 'Shown to the student, e.g. AgNO3(aq) + NaCl(aq)'),
    field('Products (the answer)', products, 'Separate with " + ". Include states and coefficients if you require them.'),
    read,
    sw('Require states', 'Students must write (s), (l), (g) or (aq)', 'requireStates', 'reaction-edit-states'),
    sw('Require coefficients', 'Students must balance the product side', 'requireCoefficients', 'reaction-edit-coefficients'),
    sw('Net ionic equation', 'Only changes the wording students see', 'netIonic', 'reaction-edit-netionic'));
}

registerTypeUI({ type: 'reaction', widget, editor });
export default null;
