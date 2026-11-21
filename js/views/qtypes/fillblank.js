// `fillblank` student widget: the sentence with an input (or word-bank select) in each blank.
import { h, richText, seededShuffle } from '../../ui.js';
import { formatHelpFor } from '../../lib/hints.js';
import { splitBlanks, wordBankChoices } from '../../lib/blanks.js';
import { helpBox } from './shared.js';

function fillBlankWidget(q, api) {
  const byId = new Map((q.blanks || []).map((b, i) => [b.id, { ...b, n: i + 1 }]));
  const bank = q.wordBank ? seededShuffle(wordBankChoices(q), `bank${q.id}`) : null;
  const inputs = new Map();
  const update = (id, value, debounce) => {
    const next = { ...(api.get(q.id) || {}) };
    if (value === '' || value == null) delete next[id]; else next[id] = value;
    api.set(q.id, Object.keys(next).length ? next : undefined, { debounce });
  };
  const textEl = h('div', { class: 'q-text q-fill' }, splitBlanks(q.text).map((part) => {
    if (part.text !== undefined) return richText(part.text, 'span');
    const b = byId.get(part.blank);
    if (!b) return h('span', {}, '____');
    const label = `Blank ${b.n}`;
    let el;
    if (bank) {
      el = h('select', { class: 'select q-fill__select', 'aria-label': label, dataset: { testid: `blank-${b.id}` },
        on: { change: () => update(b.id, el.value, false) } },
      h('option', { value: '' }, `(${b.n}) choose…`), bank.map((w) => h('option', { value: w }, w)));
    } else {
      const longest = Math.max(4, ...(b.answers || []).map((a) => String(a).length));
      el = h('input', {
        class: ['input', 'q-fill__input', b.kind === 'formula' && 'q-input--formula'], type: 'text', autocomplete: 'off', spellcheck: b.kind === 'text' ? 'true' : 'false',
        autocapitalize: 'off', 'aria-label': label, placeholder: `(${b.n})`, inputmode: b.kind === 'number' ? 'decimal' : 'text',
        style: `--chars:${Math.min(24, longest + 3)}`, dataset: { testid: `blank-${b.id}` },
        on: { input: () => update(b.id, el.value, true) },
      });
    }
    inputs.set(b.id, el);
    return h('span', { class: 'q-fill__slot' }, el, b.kind === 'number' && b.unit ? h('span', { class: 'q-fill__unit' }, b.unit) : null);
  }));
  const help = formatHelpFor(q);
  return {
    textEl,
    el: h('div', { class: 'q-fillwrap' },
      bank ? h('div', { class: 'q-bank', 'aria-label': 'Word bank' }, h('span', { class: 'q-bank__label' }, 'Word bank'), bank.map((w) => h('span', { class: 'q-bank__chip' }, w))) : null,
      help.charges ? helpBox('charges', 'charge-help') : null,
      help.exponents ? helpBox('exponents', 'exponent-help') : null,
      h('p', { class: 'q-hint' }, bank ? 'Choose a word for each blank. Words may be used more than once.' : 'Type your answer in each blank.')),
    refresh(answer) {
      const a = answer && typeof answer === 'object' ? answer : {};
      for (const [id, el] of inputs) if (document.activeElement !== el) el.value = a[id] == null ? '' : String(a[id]);
    },
    focus: () => inputs.values().next().value?.focus(),
  };
}

export default {
  type: 'fillblank',
  render: ({ q, api }) => fillBlankWidget(q, api),
};
