// `numeric`: a number with a tolerance and an optional unit. Answer: the text the student typed.
import { registerType } from './registry.js';
import { str, isNum, squash, DASH } from './shared.js';

const answered = (answer) => (typeof answer === 'string' && answer.trim() !== '') || (typeof answer === 'number' && Number.isFinite(answer));

export const def = {
  type: 'numeric',
  label: 'Numeric',
  shortLabel: 'Numeric',
  group: 'Basics',
  manual: false,

  normalize(q) {
    q.tolerance = q.tolerance === undefined || q.tolerance === null || q.tolerance === '' ? 0 : Number(q.tolerance);
    q.toleranceType = q.toleranceType === undefined || q.toleranceType === null ? 'absolute' : q.toleranceType;
    q.unit = str(q.unit);
    if (typeof q.correctAnswer === 'string' && q.correctAnswer.trim() !== '' && Number.isFinite(Number(q.correctAnswer))) {
      q.correctAnswer = Number(q.correctAnswer);
    }
  },

  validate(q, where, errors) {
    if (!isNum(q.correctAnswer)) errors.push(`${where}: correctAnswer must be a number.`);
    if (q.tolerance !== undefined && (!isNum(q.tolerance) || q.tolerance < 0)) errors.push(`${where}: tolerance must be a number that is 0 or greater.`);
    if (q.toleranceType !== undefined && q.toleranceType !== 'absolute' && q.toleranceType !== 'percent') {
      errors.push(`${where}: toleranceType must be "absolute" or "percent".`);
    }
  },

  blank: (base) => ({ ...base, correctAnswer: 0, tolerance: 0, toleranceType: 'absolute', unit: '', formatHelp: 'auto' }),

  isAnswered: (q, answer) => answered(answer),

  grade(q, answer, H) {
    const x = H.parseNumber(answer, { unit: q.unit });
    const key = Number(q.correctAnswer);
    if (Number.isNaN(x) || !Number.isFinite(key) || q.correctAnswer === null || q.correctAnswer === '' || typeof q.correctAnswer === 'boolean') {
      return { fraction: 0, full: false };
    }
    const tol = Number(q.tolerance) > 0 ? Number(q.tolerance) : 0;
    const allowed = (q.toleranceType === 'percent' ? Math.abs(key) * tol / 100 : tol) + 1e-9 * Math.abs(key);
    const ok = Math.abs(x - key) <= allowed;
    return { fraction: ok ? 1 : 0, full: ok };
  },

  format(q, answer) {
    if (!answered(answer)) return DASH;
    const raw = String(answer).trim();
    const unit = q.unit ? String(q.unit) : '';
    if (unit && !squash(raw).endsWith(squash(unit))) return `${raw} ${unit}`;
    return raw;
  },

  keyText: (q) => def.format(q, q.correctAnswer),

  correctAnswer: (q) => q.correctAnswer,
};

registerType(def);
export default def;
