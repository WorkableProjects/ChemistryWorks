// `open` student widget: a larger text box with a word count and the rubric. Teacher graded.
import { h, richText } from '../../ui.js';

const pointsLabel = (p) => `${p} ${Number(p) === 1 ? 'pt' : 'pts'}`;

function openWidget(q, api) {
  const countId = `oc-${q.id}`;
  const count = h('p', { class: 'q-hint q-short__count', id: countId, 'aria-live': 'polite' });
  const min = Number(q.minWords) || 0;
  const max = Number(q.maxWords) || 0;
  const target = min && max ? `aim for ${min}–${max} words` : min ? `at least ${min} words` : max ? `up to ${max} words` : '';
  const updateCount = () => {
    const n = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
    count.textContent = `${n} ${n === 1 ? 'word' : 'words'}${target ? ` · ${target}` : ''} · Your teacher will grade this answer`;
    count.classList.toggle('is-warn', (min && n > 0 && n < min) || (max && n > max));
  };
  const input = h('textarea', {
    class: 'textarea q-short q-open', rows: 10, maxlength: '20000', spellcheck: 'true', placeholder: 'Write your response',
    'aria-label': 'Your answer', 'aria-describedby': countId, dataset: { testid: 'open-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); updateCount(); } },
  });
  updateCount();
  const rubric = q.showRubric !== false && Array.isArray(q.rubric) && q.rubric.length
    ? h('div', { class: 'q-rubric', dataset: { testid: 'open-rubric' } },
      h('p', { class: 'q-rubric__title' }, 'How this will be graded'),
      h('ul', {}, q.rubric.map((r) => h('li', {}, richText(r.text, 'span'), h('span', { class: 'pill' }, pointsLabel(r.points))))))
    : null;
  return {
    el: h('div', { class: 'q-short-wrap' }, rubric, input, count),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : '';
      updateCount();
    },
    focus: () => input.focus(),
  };
}

export default {
  type: 'open',
  render: ({ q, api }) => openWidget(q, api),
};
