// `short` student widget: a text box with a word count. Teacher graded.
import { h } from '../../ui.js';

function shortWidget(q, api) {
  const countId = `sc-${q.id}`;
  const count = h('p', { class: 'q-hint q-short__count', id: countId, 'aria-live': 'polite' });
  const updateCount = () => {
    const n = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
    count.textContent = `${n} ${n === 1 ? 'word' : 'words'} · Your teacher will grade this answer`;
  };
  const input = h('textarea', {
    class: 'textarea q-short', rows: 6, maxlength: '5000', spellcheck: 'true', placeholder: 'Type your answer',
    'aria-label': 'Your answer', 'aria-describedby': countId, dataset: { testid: 'short-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); updateCount(); } },
  });
  updateCount();
  return {
    el: h('div', { class: 'q-short-wrap' }, input, count),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : '';
      updateCount();
    },
    focus: () => input.focus(),
  };
}

export default {
  type: 'short',
  render: ({ q, api }) => shortWidget(q, api),
};
