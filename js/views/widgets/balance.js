// Student widget for `balance`: a coefficient box in front of every formula.
// Contract (see runner.js): returns { el, refresh(answer), focus() }. Answer = array of whole numbers, blank = 0.
import { h } from '../../ui.js';
import { formulaToHTML } from '../../lib/formula.js';

export function balanceWidget(q, api) {
  const reactants = Array.isArray(q.reactants) ? q.reactants : [];
  const products = Array.isArray(q.products) ? q.products : [];
  const all = [...reactants, ...products];
  const inputs = [];

  const read = () => inputs.map((el) => {
    const n = Number(el.value.trim());
    return Number.isInteger(n) && n > 0 ? n : 0;
  });
  const push = () => {
    const list = read();
    api.set(q.id, list.some((n) => n > 0) ? list : undefined, { debounce: true });
  };

  const term = (formula, i) => {
    const input = h('input', {
      class: 'input q-bal__box', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '3', autocomplete: 'off', spellcheck: 'false',
      placeholder: '_', 'aria-label': `Coefficient for ${formula}`, dataset: { testid: `balance-${i}` },
      on: { input: () => { input.value = input.value.replace(/\D/g, ''); push(); } },
    });
    inputs[i] = input;
    return h('span', { class: 'q-bal__term' }, input, h('span', { class: 'q-bal__formula formula', html: formulaToHTML(formula) }));
  };
  const side = (list, offset) => list.flatMap((f, k) => (k ? [h('span', { class: 'q-bal__plus', 'aria-hidden': 'true' }, '+'), term(f, offset + k)] : [term(f, offset + k)]));

  return {
    el: h('div', { class: 'q-balance' },
      h('p', { class: 'q-hint' }, 'Type a whole number in front of each formula. Use 1 where no coefficient is needed.'),
      h('div', { class: 'q-bal', role: 'group', 'aria-labelledby': `qt-${q.id}` },
        side(reactants, 0), h('span', { class: 'q-bal__arrow', 'aria-hidden': 'true' }, '→'), side(products, reactants.length))),
    refresh(answer) {
      const a = Array.isArray(answer) ? answer : [];
      all.forEach((_, i) => {
        const el = inputs[i];
        if (document.activeElement === el) return;
        const n = Number(a[i]);
        el.value = Number.isInteger(n) && n > 0 ? String(n) : '';
      });
    },
    focus: () => inputs[0]?.focus(),
  };
}
