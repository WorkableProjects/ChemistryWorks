// `mcq` (multiple choice): one correct option. Answer: the option id.
import { registerType } from './registry.js';
import { normOptions, validateList, optionText, DASH } from './shared.js';

const answered = (answer) => (typeof answer === 'string' && answer.trim() !== '') || typeof answer === 'number';

export const def = {
  type: 'mcq',
  label: 'Multiple choice',
  shortLabel: 'MCQ',
  group: 'Basics',
  manual: false,

  normalize(q) {
    q.options = normOptions(q.options);
  },

  validate(q, where, errors) {
    const ids = validateList(q.options, 'option', where, errors);
    if (typeof q.correctAnswer !== 'string' || !ids.has(q.correctAnswer)) errors.push(`${where}: correctAnswer must be the id of one of the options.`);
  },

  blank: (base) => ({
    ...base,
    options: ['A', 'B', 'C', 'D'].map((L) => ({ id: L.toLowerCase(), text: `Option ${L}` })),
    correctAnswer: 'a',
  }),

  isAnswered: (q, answer) => answered(answer),

  grade(q, answer) {
    const ok = String(answer) === String(q.correctAnswer);
    return { fraction: ok ? 1 : 0, full: ok };
  },

  format: (q, answer) => (answered(answer) ? optionText(q.options, answer) : DASH),

  keyText: (q) => (answered(q.correctAnswer) ? optionText(q.options, q.correctAnswer) : DASH),

  correctAnswer: (q) => q.correctAnswer,
};

registerType(def);
export default def;
