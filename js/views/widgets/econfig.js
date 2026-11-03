// Student widget for `econfig`: a text box with a live superscript preview (V3-05).
import { h, icon } from '../../ui.js';
import { configToHTML, parseConfig } from '../../lib/qtypes/econfig.js';

export function econfigWidget(q, api) {
  const preview = h('div', { class: 'q-econfig-preview', 'aria-live': 'polite', dataset: { testid: 'econfig-preview' } });
  const update = () => {
    const v = input.value.trim();
    preview.classList.toggle('is-empty', !v);
    preview.classList.toggle('is-error', !!v && !parseConfig(v));
    // configToHTML escapes its input; this is the only HTML string rendered from student input here.
    if (!v) preview.textContent = 'Formatted preview appears here';
    else preview.innerHTML = `<span class="formula">${configToHTML(v)}</span>`;
  };
  const input = h('input', {
    class: 'input q-input q-input--formula', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
    placeholder: 'e.g. 1s2 2s2 2p6 3s1 or [Ne] 3s1', 'aria-label': 'Your answer (electron configuration)', dataset: { testid: 'econfig-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); update(); } },
  });
  update();
  return {
    el: h('div', { class: 'q-econfig' },
      h('p', { class: 'q-hint' }, icon('info', { size: 14 }), ' Type each subshell followed by its electron count, separated by spaces: 1s2 2s2 2p6. A noble-gas core such as [Ne] 3s1 is fine.'),
      input, preview),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : '';
      update();
    },
    focus: () => input.focus(),
  };
}
