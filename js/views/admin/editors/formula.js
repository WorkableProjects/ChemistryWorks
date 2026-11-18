// `formula` editor: accepted formulas, case sensitivity and the typing-help setting.
import { h, mount } from '../../../ui.js';
import { formulaToHTML } from '../../../lib/formula.js';
import { field, switchEl } from '../common.js';
import { formatHelpField } from './shared.js';

function formulaEditor(q, changed) {
  const accepted = Array.isArray(q.correctAnswer) ? q.correctAnswer : q.correctAnswer ? [q.correctAnswer] : [];
  const chips = h('div', { class: 'adm-chips', 'aria-label': 'Accepted answers preview' });
  const drawChips = () => {
    const list = Array.isArray(q.correctAnswer) ? q.correctAnswer : q.correctAnswer ? [q.correctAnswer] : [];
    mount(chips, list.length ? list.map((f) => h('span', { class: 'adm-chip formula', html: formulaToHTML(f) })) : h('span', { class: 'faint' }, 'Accepted formulas preview here'));
  };
  const inp = h('input', { class: 'input', value: accepted.join(', '), placeholder: 'e.g. H2SO4, H₂SO₄', autocomplete: 'off', spellcheck: 'false', dataset: { testid: 'formula-answers' },
    on: { input: () => {
      const parts = inp.value.split(',').map((s) => s.trim()).filter(Boolean);
      q.correctAnswer = parts.length > 1 ? parts : parts[0] || '';
      drawChips();
      changed();
    } } });
  drawChips();
  return h('div', { class: 'stack' },
    field('Accepted answers (comma-separated)', inp, 'Subscripts and charges are normalized when grading: SO4^2- = SO₄²⁻'),
    chips,
    switchEl({ label: 'Case sensitive', hint: 'Off lets "nacl" match "NaCl"', checked: q.caseSensitive !== false, testid: 'case-sensitive', onChange: (v) => { q.caseSensitive = v; changed(); } }),
    formatHelpField(q, changed));
}

export default { type: 'formula', edit: ({ q, changed }) => formulaEditor(q, changed) };
