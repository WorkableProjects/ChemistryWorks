// `open`: an extended written response with an optional rubric. Teacher graded. Answer: text.
import { registerType } from './registry.js';
import { str, bool, isObj, isNum, nonEmptyStr, DASH } from './shared.js';

const nullableNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

/** Rubric as text: "• Uses ions (2 pts)\n• ..." */
export function rubricText(rubric) {
  return (Array.isArray(rubric) ? rubric : []).map((r) => `• ${r.text} (${r.points} pt${Number(r.points) === 1 ? '' : 's'})`).join('\n');
}

export const def = {
  type: 'open',
  label: 'Open response (teacher graded)',
  shortLabel: 'Open response',
  group: 'Basics',
  manual: true,

  normalize(q) {
    q.sampleAnswer = str(q.sampleAnswer);
    q.rubric = Array.isArray(q.rubric) ? q.rubric.map((r) => (isObj(r) ? { ...r, text: str(r.text), points: Number(r.points) } : { text: str(r), points: NaN })) : [];
    q.minWords = nullableNum(q.minWords);
    q.maxWords = nullableNum(q.maxWords);
    q.showRubric = bool(q.showRubric, true);
  },

  validate(q, where, errors) {
    const rubric = q.rubric === undefined ? [] : q.rubric;
    if (!Array.isArray(rubric)) { errors.push(`${where}: rubric must be a list of { text, points }.`); return; }
    rubric.forEach((r, i) => {
      if (!isObj(r) || !nonEmptyStr(r.text)) errors.push(`${where}: rubric item ${i + 1} needs text.`);
      else if (!isNum(r.points) || r.points <= 0) errors.push(`${where}: rubric item ${i + 1} points must be a number greater than 0.`);
    });
    if (rubric.length && rubric.every((r) => isObj(r) && isNum(r.points)) && isNum(q.points)) {
      const sum = Math.round(rubric.reduce((s, r) => s + r.points, 0) * 100) / 100;
      if (sum !== q.points) errors.push(`${where}: rubric points add up to ${sum} but the question is worth ${q.points}.`);
    }
    for (const k of ['minWords', 'maxWords']) {
      const v = q[k];
      if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 0)) errors.push(`${where}: ${k} must be a whole number or empty.`);
    }
    if (Number.isInteger(q.minWords) && Number.isInteger(q.maxWords) && q.maxWords > 0 && q.maxWords < q.minWords) errors.push(`${where}: maxWords must be at least minWords.`);
    if (q.sampleAnswer !== undefined && typeof q.sampleAnswer !== 'string') errors.push(`${where}: sampleAnswer must be text.`);
  },

  blank: (base) => ({
    ...base, points: 4, text: 'Explain why ionic compounds have high melting points.', sampleAnswer: '', minWords: null, maxWords: null, showRubric: true,
    rubric: [{ text: 'Identifies strong electrostatic attraction between oppositely charged ions', points: 2 }, { text: 'Links it to the energy needed to break the lattice', points: 2 }],
  }),

  isAnswered: (q, answer) => typeof answer === 'string' && answer.trim() !== '',

  grade: () => ({ fraction: 0, full: false }),

  format: (q, answer) => String(answer).trim(),

  keyText(q) {
    const parts = [q.sampleAnswer ? String(q.sampleAnswer) : '', q.rubric && q.rubric.length ? `Rubric:\n${rubricText(q.rubric)}` : ''].filter(Boolean);
    return parts.length ? parts.join('\n\n') : DASH;
  },

  correctAnswer: (q) => q.sampleAnswer || null,

  // Extra fields copied onto each graded result row.
  resultExtras: (q) => (Array.isArray(q.rubric) && q.rubric.length ? { rubric: q.rubric.map((r) => ({ text: r.text, points: r.points })) } : {}),
};

registerType(def);
export default def;
