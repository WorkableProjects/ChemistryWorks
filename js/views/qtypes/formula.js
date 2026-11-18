// `formula` student widget: a text box with a formatted preview and typing help for charges.
import { h } from '../../ui.js';
import { formulaToHTML } from '../../lib/formula.js';
import { formatHelpFor } from '../../lib/hints.js';
import { helpBox, insertBar, CHARGE_KEYS } from './shared.js';

function formulaWidget(q, api) {
  const preview = h('div', { class: 'q-formula-preview', 'aria-live': 'polite', dataset: { testid: 'formula-preview' } });
  const updatePreview = () => {
    const v = input.value.trim();
    if (!v) {
      preview.classList.add('is-empty');
      preview.textContent = 'Formatted preview appears here';
    } else {
      preview.classList.remove('is-empty');
      // formulaToHTML escapes its input; this is the only HTML string rendered from student input.
      preview.innerHTML = `<span class="formula">${formulaToHTML(input.value)}</span>`;
    }
  };
  const input = h('input', {
    class: 'input q-input q-input--formula', type: 'text', autocomplete: 'off', spellcheck: 'false',
    autocapitalize: 'off', autocorrect: 'off', placeholder: 'e.g. H2SO4', 'aria-label': 'Your answer (chemical formula)',
    dataset: { testid: 'formula-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); updatePreview(); } },
  });
  updatePreview();
  const help = formatHelpFor(q);
  return {
    el: h('div', { class: 'q-formula' },
      help.charges ? helpBox('charges', 'charge-help') : null,
      input,
      help.charges ? insertBar(input, CHARGE_KEYS)
        : h('p', { class: 'q-hint' }, 'Subscripts are plain numbers: H2O, Ca(OH)2, CuSO4.5H2O. Charges: SO4^2-, Na^+'),
      preview),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : '';
      updatePreview();
    },
    focus: () => input.focus(),
  };
}

export default {
  type: 'formula',
  render: ({ q, api }) => formulaWidget(q, api),
};
