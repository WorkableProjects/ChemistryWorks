// Builder editor for `balance`: formulas on each side, the coefficient key, and the grading switches.
import { h, mount } from '../../../ui.js';
import { formulaToHTML } from '../../../lib/formula.js';
import { field, switchEl } from '../common.js';

const split = (text, sep) => text.split(sep).map((s) => s.trim()).filter(Boolean);

export function balanceEditor(q, redraw, changed) {
  q.reactants = Array.isArray(q.reactants) ? q.reactants : [];
  q.products = Array.isArray(q.products) ? q.products : [];
  q.coefficients = Array.isArray(q.coefficients) ? q.coefficients : [];
  const preview = h('div', { class: 'q-bal', dataset: { testid: 'balance-preview' }, 'aria-label': 'Equation preview' });
  const coefBox = h('div', { class: 'row row--wrap adm-bal-coefs' });

  const total = () => q.reactants.length + q.products.length;
  const syncLength = () => {
    const n = total();
    const cur = q.coefficients.slice(0, n);
    while (cur.length < n) cur.push(1);
    q.coefficients = cur;
  };
  const drawPreview = () => {
    const term = (f, i) => h('span', { class: 'q-bal__term' }, h('span', { class: 'q-bal__box adm-bal-key' }, String(q.coefficients[i] ?? '')), h('span', { class: 'q-bal__formula formula', html: formulaToHTML(f) }));
    const side = (list, off) => list.flatMap((f, k) => (k ? [h('span', { class: 'q-bal__plus' }, '+'), term(f, off + k)] : [term(f, off + k)]));
    mount(preview, side(q.reactants, 0), h('span', { class: 'q-bal__arrow' }, '→'), side(q.products, q.reactants.length));
  };
  const drawCoefs = () => {
    const all = [...q.reactants, ...q.products];
    mount(coefBox, all.length ? all.map((f, i) => {
      const inp = h('input', { class: 'input', type: 'number', min: '1', step: '1', value: q.coefficients[i] ?? 1, style: 'width:5em', 'aria-label': `Coefficient for ${f}`, dataset: { testid: `balance-coef-${i}` },
        on: { input: () => { const n = Number(inp.value); q.coefficients[i] = Number.isFinite(n) && inp.value.trim() !== '' ? n : NaN; drawPreview(); changed(); } } });
      return h('label', { class: 'field' }, h('span', { class: 'field__label formula', html: formulaToHTML(f) }), inp);
    }) : h('span', { class: 'faint' }, 'Add reactants and products first'));
  };
  const onFormulas = () => { syncLength(); drawCoefs(); drawPreview(); changed(); };

  const reactants = h('input', { class: 'input', value: q.reactants.join(' + '), placeholder: 'e.g. H2 + O2', autocomplete: 'off', spellcheck: 'false', dataset: { testid: 'balance-reactants' },
    on: { input: () => { q.reactants = split(reactants.value, '+'); onFormulas(); } } });
  const products = h('input', { class: 'input', value: q.products.join(' + '), placeholder: 'e.g. H2O', autocomplete: 'off', spellcheck: 'false', dataset: { testid: 'balance-products' },
    on: { input: () => { q.products = split(products.value, '+'); onFormulas(); } } });
  drawCoefs();
  drawPreview();
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--2' },
      field('Reactants (separate with +)', reactants, 'Formulas as students see them: subscripts are plain numbers, charges use ^ (Fe^3+)'),
      field('Products (separate with +)', products)),
    h('div', { class: 'field__label' }, 'Correct coefficients (in order: reactants, then products)'),
    coefBox,
    preview,
    switchEl({ label: 'Accept any whole-number multiple', hint: 'Off: only the coefficients above are correct', checked: !!q.allowMultiples, testid: 'balance-multiples', onChange: (v) => { q.allowMultiples = v; changed(); } }),
    switchEl({ label: 'Partial credit', hint: 'Credit for each coefficient in the right place', checked: !!q.partialCredit, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }));
}
