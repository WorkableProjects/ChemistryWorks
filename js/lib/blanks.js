// Fill-in-the-blank helpers ("fillblank" question type). Pure functions, no DOM.
//
// The question text marks each blank with {{id}}, e.g. "Water is {{b1}}." Each blank is described in
// question.blanks: { id, answers: [accepted...], kind: 'text' | 'number' | 'formula', tolerance?, toleranceType?, unit? }.
// A student answer is { [blankId]: "typed or chosen text" }.

import { formulasEqual } from './formula.js';

export const BLANK_KINDS = ['text', 'number', 'formula'];
const MARKER_RE = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

/** Split question text into [{ text }, { blank: id }, ...] in order. */
export function splitBlanks(text) {
  const s = String(text ?? '');
  const out = [];
  let last = 0;
  for (const m of s.matchAll(MARKER_RE)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ blank: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** Blank ids in the order they appear in the text (duplicates kept so validation can report them). */
export function markerIds(text) {
  return splitBlanks(text).filter((p) => p.blank).map((p) => p.blank);
}

/** Question text with each blank shown as a numbered line: "Water is ____(1)." */
export function blankedText(text) {
  let n = 0;
  return String(text ?? '').replace(MARKER_RE, () => `____(${++n})`);
}

const squashText = (s, caseSensitive) => {
  let t = String(s ?? '').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  if (!caseSensitive) t = t.toLowerCase();
  return t;
};

/**
 * True when `given` matches one of the blank's accepted answers.
 * `parseNumber` is injected (from grading.js) to avoid a circular import.
 */
export function blankCorrect(blank, given, { caseSensitive = false, parseNumber } = {}) {
  if (given === undefined || given === null || String(given).trim() === '') return false;
  const accepted = Array.isArray(blank?.answers) ? blank.answers : [];
  const kind = blank?.kind || 'text';
  if (kind === 'number' && parseNumber) {
    const x = parseNumber(String(given), { unit: blank.unit || '' });
    if (Number.isNaN(x)) return false;
    const tol = Number(blank.tolerance) > 0 ? Number(blank.tolerance) : 0;
    return accepted.some((a) => {
      const key = typeof a === 'number' ? a : parseNumber(String(a), { unit: blank.unit || '' });
      if (!Number.isFinite(key)) return false;
      const allowed = (blank.toleranceType === 'percent' ? Math.abs(key) * tol / 100 : tol) + 1e-9 * Math.abs(key);
      return Math.abs(x - key) <= allowed;
    });
  }
  if (kind === 'formula') {
    return accepted.some((a) => String(a).trim() !== '' && formulasEqual(String(given), String(a), { caseSensitive: blank.caseSensitive !== false }));
  }
  const g = squashText(given, caseSensitive);
  return accepted.some((a) => squashText(a, caseSensitive) === g);
}

/** Word-bank choices: the first accepted answer of every blank plus distractors, de-duplicated. */
export function wordBankChoices(q) {
  const seen = new Set();
  const out = [];
  for (const w of [...(q.blanks || []).map((b) => (Array.isArray(b.answers) ? b.answers[0] : undefined)), ...(q.distractors || [])]) {
    if (w === undefined || w === null) continue;
    const s = String(w);
    if (!s.trim() || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
