// `matching`: pair each left item with one right item. Answer: { leftId: rightId }.
import { registerType } from './registry.js';
import { isObj, bool, normOptions, validateList, optionText, DASH } from './shared.js';

const hasValue = (v) => v !== undefined && v !== null && String(v).trim() !== '';

export const def = {
  type: 'matching',
  label: 'Matching',
  shortLabel: 'Matching',
  group: 'Match & sort',
  manual: false,
  layout: 'wide',

  normalize(q) {
    q.left = normOptions(q.left);
    q.right = normOptions(q.right);
    q.partialCredit = bool(q.partialCredit, true);
  },

  validate(q, where, errors) {
    const a = q.correctAnswer;
    const leftIds = validateList(q.left, 'left item', where, errors);
    const rightIds = validateList(q.right, 'right item', where, errors);
    if (!isObj(a)) {
      errors.push(`${where}: correctAnswer must be an object mapping each left id to a right id.`);
      return;
    }
    for (const id of leftIds) {
      if (!(id in a)) errors.push(`${where}: correctAnswer is missing a match for left item "${id}".`);
    }
    for (const [l, r] of Object.entries(a)) {
      if (!leftIds.has(l)) errors.push(`${where}: correctAnswer refers to unknown left item "${l}".`);
      else if (typeof r !== 'string' || !rightIds.has(r)) errors.push(`${where}: correctAnswer for "${l}" points to unknown right item "${r}".`);
    }
  },

  blank: (base) => ({
    ...base,
    partialCredit: true,
    left: [{ id: 'l1', text: 'Item 1' }, { id: 'l2', text: 'Item 2' }],
    right: [{ id: 'r1', text: 'Match 1' }, { id: 'r2', text: 'Match 2' }],
    correctAnswer: { l1: 'r1', l2: 'r2' },
  }),

  isAnswered: (q, answer) => isObj(answer) && Object.values(answer).some(hasValue),

  grade(q, answer) {
    if (!isObj(answer) || !isObj(q.correctAnswer)) return { fraction: 0, full: false };
    const leftIds = Array.isArray(q.left) && q.left.length ? q.left.map((l) => l.id) : Object.keys(q.correctAnswer);
    if (!leftIds.length) return { fraction: 0, full: false };
    let right = 0;
    for (const id of leftIds) {
      if (answer[id] !== undefined && answer[id] !== null && String(answer[id]) === String(q.correctAnswer[id])) right++;
    }
    if (right === leftIds.length) return { fraction: 1, full: true };
    return { fraction: q.partialCredit === false ? 0 : right / leftIds.length, full: false };
  },

  format(q, answer) {
    const a = isObj(answer) ? answer : {};
    return (q.left || [])
      .map((l) => `${optionText(q.left, l.id)} → ${hasValue(a[l.id]) ? optionText(q.right, a[l.id]) : DASH}`)
      .join('; ');
  },

  keyText: (q) => def.format(q, q.correctAnswer),

  correctAnswer: (q) => q.correctAnswer,
};

registerType(def);
export default def;
