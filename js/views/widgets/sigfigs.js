// Student widget for `sigfigs`: a number box that also shows how many significant figures it was read as.
import { h } from '../../ui.js';
import { parseNumber } from '../../lib/grading.js';
import { countSigFigs } from '../../lib/qtypes/sigfigs.js';

export function sigfigsWidget(q, api) {
  const previewId = `sf-${q.id}`;
  const preview = h('p', { class: 'q-preview', id: previewId, 'aria-live': 'polite', dataset: { testid: 'sigfigs-preview' } });
  const update = () => {
    const v = input.value.trim();
    preview.classList.remove('is-error');
    if (!v) { preview.textContent = 'Scientific notation works: 4.50e-3 or 4.50 × 10^-3'; return; }
    if (Number.isNaN(parseNumber(v))) { preview.textContent = 'Not a number yet'; preview.classList.add('is-error'); return; }
    const n = countSigFigs(v);
    preview.textContent = `Read as ${n} significant ${n === 1 ? 'figure' : 'figures'}`;
  };
  const input = h('input', {
    class: 'input q-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
    placeholder: 'Enter a number', 'aria-label': 'Your answer', 'aria-describedby': previewId, dataset: { testid: 'sigfigs-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); update(); } },
  });
  update();
  return {
    el: h('div', { class: 'q-numeric q-sigfigs' },
      h('p', { class: 'q-hint' }, 'Your answer is checked for its value and for the number of significant figures you write.'),
      input, preview),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : answer == null ? '' : String(answer);
      update();
    },
    focus: () => input.focus(),
  };
}
