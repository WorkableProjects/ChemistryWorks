// `ordering`: put the items in the right order. Answer: an array of item ids, top to bottom.
import { registerType } from './registry.js';
import { str, bool, normOptions, validateList, optionText, DASH } from './shared.js';

export const def = {
  type: 'ordering',
  label: 'Ordering',
  shortLabel: 'Ordering',
  group: 'Match & sort',
  manual: false,

  normalize(q) {
    q.items = normOptions(q.items);
    q.partialCredit = bool(q.partialCredit, true);
    q.topLabel = str(q.topLabel);
    q.bottomLabel = str(q.bottomLabel);
  },

  validate(q, where, errors) {
    const a = q.correctAnswer;
    const ids = validateList(q.items, 'item', where, errors);
    if (!Array.isArray(a) || a.length !== ids.size || new Set(a).size !== a.length || a.some((id) => !ids.has(id))) {
      errors.push(`${where}: correctAnswer must list every item id exactly once, in the correct order.`);
    }
  },

  blank: (base) => ({
    ...base,
    text: 'Arrange these elements from lowest to highest electronegativity.',
    partialCredit: true,
    topLabel: 'Lowest',
    bottomLabel: 'Highest',
    items: [{ id: 'na', text: 'Na' }, { id: 'c', text: 'C' }, { id: 'o', text: 'O' }, { id: 'f', text: 'F' }],
    correctAnswer: ['na', 'c', 'o', 'f'],
  }),

  isAnswered: (q, answer) => Array.isArray(answer) && answer.length > 0,

  grade(q, answer) {
    const key = Array.isArray(q.correctAnswer) ? q.correctAnswer.map(String) : [];
    if (!Array.isArray(answer) || !key.length) return { fraction: 0, full: false };
    let right = 0;
    key.forEach((id, i) => { if (String(answer[i]) === id) right++; });
    if (right === key.length && answer.length === key.length) return { fraction: 1, full: true };
    return { fraction: q.partialCredit === false ? 0 : right / key.length, full: false };
  },

  format: (q, answer) => answer.map((id) => optionText(q.items, id)).join(' → '),

  keyText: (q) => (Array.isArray(q.correctAnswer) ? q.correctAnswer.map((id) => optionText(q.items, id)).join(' → ') : DASH),

  correctAnswer: (q) => q.correctAnswer,
};

registerType(def);
export default def;
