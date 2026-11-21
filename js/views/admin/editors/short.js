// `short` editor: the sample answer shown while grading.
import { h, icon } from '../../../ui.js';
import { field } from '../common.js';

function shortEditor(q, changed) {
  const ta = h('textarea', { class: 'textarea', rows: 3, placeholder: 'Model answer or rubric (optional)', dataset: { testid: 'short-sample' },
    on: { input: () => { q.sampleAnswer = ta.value; changed(); } } });
  ta.value = q.sampleAnswer || '';
  return h('div', { class: 'stack' },
    h('p', { class: 'notice notice--info' }, icon('info'), h('span', {}, 'Not auto-graded. Students’ answers appear in the Grading tab, where you assign points.')),
    field('Sample answer', ta, 'Shown to you while grading. Students see it in the review only if “Show correct answers” is on.'));
}

export default { type: 'short', edit: ({ q, redraw, changed }) => shortEditor(q, changed) };
