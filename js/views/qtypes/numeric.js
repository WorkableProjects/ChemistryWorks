// `numeric` student widget: a text box with a live read-back of the number it understood.
import { h } from '../../ui.js';
import { parseNumber } from '../../lib/grading.js';
import { formatHelpFor } from '../../lib/hints.js';
import { formatInterpreted, helpBox, insertBar, EXP_KEYS } from './shared.js';

function numericWidget(q, api) {
  const previewId = `np-${q.id}`;
  const preview = h('p', { class: 'q-preview', id: previewId, 'aria-live': 'polite', dataset: { testid: 'numeric-preview' } });
  const updatePreview = () => {
    const v = input.value.trim();
    preview.classList.remove('is-error');
    if (!v) { preview.textContent = 'Scientific notation works: 6.02e23 or 6.02 × 10^23'; return; }
    const x = parseNumber(v, { unit: q.unit || '' });
    if (Number.isNaN(x)) { preview.textContent = 'Not a number yet'; preview.classList.add('is-error'); return; }
    preview.textContent = `Interpreted as ${formatInterpreted(x)}`;
  };
  const input = h('input', {
    class: 'input q-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false',
    autocapitalize: 'off', placeholder: 'Enter a number', 'aria-label': 'Your answer', 'aria-describedby': previewId,
    dataset: { testid: 'numeric-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); updatePreview(); } },
  });
  updatePreview();
  const help = formatHelpFor(q);
  return {
    el: h('div', { class: 'q-numeric' },
      help.exponents ? helpBox('exponents', 'exponent-help') : null,
      h('div', { class: 'q-field' }, input, q.unit ? h('span', { class: 'q-unit' }, q.unit) : null),
      help.exponents ? insertBar(input, EXP_KEYS) : null,
      preview),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : answer == null ? '' : String(answer);
      updatePreview();
    },
    focus: () => input.focus(),
  };
}

export default {
  type: 'numeric',
  render: ({ q, api }) => numericWidget(q, api),
};
