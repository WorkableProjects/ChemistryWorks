// `short`: a short written answer. Teacher graded. Answer: text.
import { registerType } from './registry.js';
import { str, DASH } from './shared.js';

export const def = {
  type: 'short',
  label: 'Short answer (teacher graded)',
  shortLabel: 'Short answer',
  group: 'Basics',
  manual: true,

  normalize(q) {
    q.sampleAnswer = str(q.sampleAnswer);
  },

  validate(q, where, errors) {
    if (q.sampleAnswer !== undefined && typeof q.sampleAnswer !== 'string') errors.push(`${where}: sampleAnswer must be text.`);
  },

  blank: (base) => ({ ...base, points: 2, sampleAnswer: '' }),

  isAnswered: (q, answer) => typeof answer === 'string' && answer.trim() !== '',

  grade: () => ({ fraction: 0, full: false }),

  format: (q, answer) => String(answer).trim(),

  keyText: (q) => (q.sampleAnswer ? String(q.sampleAnswer) : DASH),

  correctAnswer: (q) => q.sampleAnswer || null,
};

registerType(def);
export default def;
