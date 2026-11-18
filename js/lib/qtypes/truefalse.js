// `truefalse`: answer is a boolean.
import { registerType } from './registry.js';
import { DASH } from './shared.js';

export const def = {
  type: 'truefalse',
  label: 'True / False',
  shortLabel: 'True / False',
  group: 'Basics',
  manual: false,

  normalize() {},

  validate(q, where, errors) {
    if (typeof q.correctAnswer !== 'boolean') errors.push(`${where}: correctAnswer must be true or false.`);
  },

  blank: (base) => ({ ...base, correctAnswer: true }),

  isAnswered: (q, answer) => typeof answer === 'boolean',

  grade(q, answer) {
    const ok = typeof answer === 'boolean' && answer === q.correctAnswer;
    return { fraction: ok ? 1 : 0, full: ok };
  },

  format: (q, answer) => (typeof answer === 'boolean' ? (answer ? 'True' : 'False') : DASH),

  keyText: (q) => def.format(q, q.correctAnswer),

  correctAnswer: (q) => q.correctAnswer,
};

registerType(def);
export default def;
