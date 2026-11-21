// `truefalse` editor: pick the correct answer.
import { h } from '../../../ui.js';
import { field } from '../common.js';

function tfEditor(q, changed) {
  const sel = h('select', { class: 'select', dataset: { testid: 'tf-answer' }, on: { change: () => { q.correctAnswer = sel.value === 'true'; changed(); } } },
    h('option', { value: 'true' }, 'True'), h('option', { value: 'false' }, 'False'));
  sel.value = q.correctAnswer === false ? 'false' : 'true';
  if (typeof q.correctAnswer !== 'boolean') q.correctAnswer = true;
  return field('Correct answer', sel, null, { className: 'adm-narrow' });
}

export default { type: 'truefalse', edit: ({ q, changed }) => tfEditor(q, changed) };
