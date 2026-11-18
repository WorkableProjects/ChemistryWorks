// `multi` (multiple select): several correct options. Answer: array of option ids.
import { registerType } from './registry.js';
import { normOptions, validateList, bool, DASH } from './shared.js';

export const def = {
  type: 'multi',
  label: 'Multiple select',
  shortLabel: 'Multi-select',
  group: 'Basics',
  manual: false,

  normalize(q) {
    q.options = normOptions(q.options);
    q.partialCredit = bool(q.partialCredit, false);
  },

  validate(q, where, errors) {
    const ids = validateList(q.options, 'option', where, errors);
    const a = q.correctAnswer;
    if (!Array.isArray(a) || a.length === 0) errors.push(`${where}: correctAnswer must be a non-empty array of option ids.`);
    else if (a.some((id) => typeof id !== 'string' || !ids.has(id))) errors.push(`${where}: correctAnswer contains an unknown option id.`);
  },

  blank: (base) => ({
    ...base,
    options: ['A', 'B', 'C', 'D'].map((L) => ({ id: L.toLowerCase(), text: `Option ${L}` })),
    partialCredit: false,
    correctAnswer: ['a', 'b'],
  }),

  isAnswered: (q, answer) => Array.isArray(answer) && answer.length > 0,

  grade(q, answer) {
    if (!Array.isArray(answer) || !Array.isArray(q.correctAnswer)) return { fraction: 0, full: false };
    const correct = new Set(q.correctAnswer.map(String));
    const picked = new Set(answer.map(String));
    let right = 0;
    let wrong = 0;
    for (const id of picked) (correct.has(id) ? right++ : wrong++);
    if (right === correct.size && wrong === 0) return { fraction: 1, full: true };
    if (q.partialCredit && correct.size > 0) return { fraction: Math.max(0, (right - wrong) / correct.size), full: false };
    return { fraction: 0, full: false };
  },

  format(q, answer) {
    if (!Array.isArray(answer) || !answer.length) return DASH;
    const picked = new Set(answer.map(String));
    const known = (q.options || []).filter((o) => picked.has(String(o.id))).map((o) => String(o.text));
    const knownIds = new Set((q.options || []).map((o) => String(o.id)));
    const unknown = [...picked].filter((id) => !knownIds.has(id));
    return [...known, ...unknown].join('; ');
  },

  keyText: (q) => (Array.isArray(q.correctAnswer) && q.correctAnswer.length ? def.format(q, q.correctAnswer) : DASH),

  correctAnswer: (q) => q.correctAnswer,
};

registerType(def);
export default def;
