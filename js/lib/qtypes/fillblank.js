// `fillblank`: text with {{id}} markers, one blank per marker. Answer: { blankId: text }.
import { registerType } from './registry.js';
import { isObj, str, bool, isNum, nonEmptyStr, ID_RE, DASH } from './shared.js';
import { BLANK_KINDS, markerIds, blankCorrect, blankedText } from '../blanks.js';

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== '';

export const def = {
  type: 'fillblank',
  label: 'Fill in the blanks',
  shortLabel: 'Fill in blanks',
  group: 'Match & sort',
  manual: false,

  normalize(q) {
    q.blanks = Array.isArray(q.blanks) ? q.blanks.map((b) => {
      const src = isObj(b) ? b : {};
      const answers = Array.isArray(src.answers) ? src.answers : src.answers === undefined || src.answers === null ? [] : [src.answers];
      const out = { ...src, id: str(src.id).trim(), answers: answers.map((a) => (typeof a === 'number' ? a : str(a))), kind: src.kind ? str(src.kind).trim() : 'text' };
      if (out.kind === 'number') {
        out.tolerance = src.tolerance === undefined || src.tolerance === null || src.tolerance === '' ? 0 : Number(src.tolerance);
        out.toleranceType = src.toleranceType || 'absolute';
        out.unit = str(src.unit);
      }
      return out;
    }) : [];
    q.partialCredit = bool(q.partialCredit, true);
    q.caseSensitive = bool(q.caseSensitive, false);
    q.wordBank = bool(q.wordBank, false);
    q.distractors = Array.isArray(q.distractors) ? q.distractors.map((d) => str(d)) : [];
  },

  validate(q, where, errors) {
    const blanks = Array.isArray(q.blanks) ? q.blanks : [];
    if (!blanks.length) { errors.push(`${where}: blanks needs at least 1 blank.`); return; }
    const ids = new Set();
    blanks.forEach((b, i) => {
      const n = i + 1;
      if (!isObj(b)) { errors.push(`${where}: blank ${n} must be an object with id and answers.`); return; }
      if (!nonEmptyStr(b.id) || !ID_RE.test(b.id)) errors.push(`${where}: blank ${n} has an invalid id (use letters, digits, "_" or "-").`);
      else if (ids.has(b.id)) errors.push(`${where}: duplicate blank id "${b.id}".`);
      else ids.add(b.id);
      const kind = b.kind === undefined ? 'text' : b.kind;
      if (!BLANK_KINDS.includes(kind)) errors.push(`${where}: blank ${n} kind must be "text", "number" or "formula".`);
      if (!Array.isArray(b.answers) || !b.answers.length || b.answers.some((x) => !(nonEmptyStr(x) || isNum(x)))) {
        errors.push(`${where}: blank ${n} needs answers: a list of accepted answers, e.g. ["H2O"].`);
      } else if (kind === 'number' && b.answers.some((x) => !isNum(x) && !Number.isFinite(Number(String(x).replace(/\s*[x×*]\s*10\s*\^\s*/i, 'e'))))) {
        errors.push(`${where}: blank ${n} is a number blank, so every answer must be a number.`);
      }
      if (kind === 'number' && b.tolerance !== undefined && (!isNum(b.tolerance) || b.tolerance < 0)) errors.push(`${where}: blank ${n} tolerance must be 0 or greater.`);
    });
    const marks = markerIds(q.text);
    for (const id of ids) {
      const c = marks.filter((m) => m === id).length;
      if (c === 0) errors.push(`${where}: text is missing the marker {{${id}}} for blank "${id}".`);
      else if (c > 1) errors.push(`${where}: marker {{${id}}} appears more than once in the text.`);
    }
    for (const m of new Set(marks)) if (!ids.has(m)) errors.push(`${where}: text has {{${m}}} but there is no blank with id "${m}".`);
    if (q.distractors !== undefined && (!Array.isArray(q.distractors) || q.distractors.some((d) => typeof d !== 'string'))) errors.push(`${where}: distractors must be a list of text.`);
  },

  blank: (base) => ({
    ...base,
    points: 2,
    text: 'Water has the formula {{b1}} and contains {{b2}} hydrogen atoms per molecule.',
    blanks: [{ id: 'b1', answers: ['H2O'], kind: 'formula' }, { id: 'b2', answers: ['2', 'two'], kind: 'text' }],
    partialCredit: true,
    caseSensitive: false,
    wordBank: false,
    distractors: [],
    formatHelp: 'auto',
  }),

  isAnswered: (q, answer) => isObj(answer) && Object.values(answer).some(hasValue),

  grade(q, answer, H) {
    const blanks = Array.isArray(q.blanks) ? q.blanks : [];
    if (!isObj(answer) || !blanks.length) return { fraction: 0, full: false };
    const right = blanks.filter((b) => blankCorrect(b, answer[b.id], { caseSensitive: !!q.caseSensitive, parseNumber: H.parseNumber })).length;
    if (right === blanks.length) return { fraction: 1, full: true };
    return { fraction: q.partialCredit === false ? 0 : right / blanks.length, full: false };
  },

  format: (q, answer) => (q.blanks || []).map((b, i) => `(${i + 1}) ${hasValue(answer[b.id]) ? String(answer[b.id]).trim() : DASH}`).join('; '),

  keyText: (q) => (q.blanks || []).map((b, i) => `(${i + 1}) ${(b.answers || []).map(String).join(' / ') || DASH}`).join('; ') || DASH,

  correctAnswer: (q) => Object.fromEntries((q.blanks || []).map((b) => [b.id, b.answers])),

  /** Question text for results and grading: each {{id}} marker becomes a numbered line. */
  displayText: (q) => blankedText(q.text),
};

registerType(def);
export default def;
