// Auto-grading engine. Pure functions, no DOM. Never throws on malformed answers.

import { isManualQuestion } from './schema.js';
export { rubricText } from './qtypes/open.js';
import { typeDef } from './qtypes/registry.js';
import './qtypes/index.js'; // registers every question type definition

const SUP_MAP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const DASH = '—';

const round2 = (x) => Math.round(x * 100) / 100;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Parse a student-entered number. Returns NaN when unparseable. */
export function parseNumber(str, { unit = '' } = {}) {
  if (typeof str === 'number') return Number.isFinite(str) ? str : NaN;
  if (typeof str !== 'string') return NaN;
  let s = str.trim().replace(/[−–]/g, '-');
  if (!s) return NaN;

  if (unit) {
    const pattern = [...String(unit).replace(/\s+/g, '')].map((c) => c.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).join('\\s*');
    if (pattern) s = s.replace(new RegExp(`\\s*${pattern}\\s*$`, 'i'), '');
  }
  s = s.trim();
  if (!s) return NaN;
  // allow spaces around the multiplication sign / caret in scientific notation, but nowhere else
  s = s.replace(/\s*([x×*⋅·])\s*(?=10)/i, '$1').replace(/(10)\s*\^\s*/, '$1^');
  if (/\s/.test(s)) return NaN;
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (run) => '^' + [...run].map((c) => SUP_MAP[c]).join(''));

  let mant = s;
  let exp = null;
  const m = /^([+-]?[\d.,]+)(?:[x×*⋅·]10\^?|e)([+-]?\d+)$/i.exec(s);
  if (m) { mant = m[1]; exp = m[2]; }

  const sign = /^[+-]/.test(mant) ? mant[0] : '';
  let digits = sign ? mant.slice(1) : mant;
  if (digits.includes(',')) {
    if (!/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(digits)) return NaN;
    digits = digits.replace(/,/g, '');
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(digits)) return NaN;
  const value = Number(`${sign}${digits}${exp !== null ? 'e' + exp : ''}`);
  return Number.isFinite(value) ? value : NaN;
}

export function isAnswered(question, answer) {
  if (answer === undefined || answer === null) return false;
  const def = typeDef(question && question.type);
  if (def?.isAnswered) return !!def.isAnswered(question, answer, GRADING_HELPERS);
  if (typeof answer === 'string') return answer.trim() !== '';
  if (Array.isArray(answer)) return answer.length > 0;
  if (isPlainObject(answer)) return Object.keys(answer).length > 0;
  return true;
}

/** Returns { fraction, full } for an answered question. */
function score(q, answer) {
  const def = typeDef(q.type);
  return def?.grade ? def.grade(q, answer, GRADING_HELPERS) : { fraction: 0, full: false };
}

/** Helpers handed to v4 type definitions (js/lib/qtypes/registry.js), so they never import this module. */
const GRADING_HELPERS = {
  gradeQuestion: (q, a) => gradeQuestion(q, a),
  isAnswered: (q, a) => isAnswered(q, a),
  formatAnswer: (q, a) => formatAnswer(q, a),
  correctAnswerText: (q) => correctAnswerText(q),
  parseNumber: (s, o) => parseNumber(s, o),
};

/**
 * Grade one answer. `opts.hintUsed` (V4-03): the student revealed the question's hint, so `hint.cost` points are
 * subtracted from what they earned (never below 0). Two-argument calls behave exactly as before.
 */
export function gradeQuestion(question, answer, opts = {}) {
  const q = question || {};
  const pts = Number(q.points);
  const pointsPossible = round2(Number.isFinite(pts) && pts >= 0 ? pts : 1);
  const answered = isAnswered(q, answer);
  if (!answered) return { answered: false, isCorrect: false, pointsEarned: 0, pointsPossible, partial: false };
  // Open-ended answers score 0 until a teacher grades them in the admin panel.
  if (isManualQuestion(q)) return { answered: true, isCorrect: false, pointsEarned: 0, pointsPossible, partial: false, needsGrading: true };
  let res;
  try {
    res = score(q, answer);
  } catch {
    res = { fraction: 0, full: false };
  }
  let pointsEarned = res.full ? pointsPossible : Math.min(pointsPossible, round2(res.fraction * pointsPossible));
  const partial = !res.full && pointsEarned > 0 && pointsEarned < pointsPossible;
  const cost = opts && opts.hintUsed && q.hint ? Number(q.hint.cost) : 0;
  const hintCost = Number.isFinite(cost) && cost > 0 ? round2(cost) : 0;
  if (hintCost > 0) pointsEarned = Math.max(0, round2(pointsEarned - hintCost));
  return {
    answered: true,
    isCorrect: res.full,
    pointsEarned,
    pointsPossible,
    partial,
    ...(hintCost > 0 ? { hintUsed: true, hintCost } : {}),
  };
}

export function formatAnswer(question, answer) {
  const q = question || {};
  try {
    if (q.type === 'formula' && Array.isArray(answer)) return answer.length ? answer.map(String).join(' / ') : DASH;
    if (!isAnswered(q, answer)) return DASH;
    const def = typeDef(q.type);
    if (def?.format) return def.format(q, answer, GRADING_HELPERS);
    return typeof answer === 'object' ? JSON.stringify(answer) : String(answer);
  } catch {
    return DASH;
  }
}

/** Lines of text the PDF / print export prints for one response: the type's own `toPdf`, else the formatted answer. */
export function pdfLines(question, answer) {
  const q = question || {};
  const def = typeDef(q.type);
  if (def?.toPdf) {
    try { return def.toPdf(q, answer, GRADING_HELPERS).map(String); } catch { /* fall through to the plain answer */ }
  }
  return [formatAnswer(q, answer)];
}

/** Question text as shown in results / grading (fill-in blanks become numbered lines; a v4 type may supply `displayText`). */
export function displayQuestionText(q) {
  if (q && typeDef(q.type)?.displayText) {
    try { return String(typeDef(q.type).displayText(q)); } catch { /* fall through to the raw text */ }
  }
  return String(q?.text ?? '');
}

/** The answer key as display text (used by the games to show "Correct answer"). */
export function correctAnswerText(q) {
  return formatCorrect(q);
}

function formatCorrect(q) {
  const def = typeDef(q.type);
  if (def?.keyText) return def.keyText(q, GRADING_HELPERS) || DASH;
  return formatAnswer(q, q.correctAnswer);
}

/**
 * Grade a whole test. `opts` (all optional, V4-03): `hintsUsed` (Set or array of question ids whose hint was revealed;
 * the hint cost is deducted) and `confidence` ({ [questionId]: 1|2|3 }, kept on the result row for questions that ask
 * "How sure are you?" and were answered).
 */
export function gradeTest(test, answers, opts = {}) {
  const hintSet = new Set(opts && opts.hintsUsed ? [...opts.hintsUsed].map(String) : []);
  const conf = opts && isPlainObject(opts.confidence) ? opts.confidence : {};
  const questions = Array.isArray(test && test.questions) ? test.questions : [];
  const given = isPlainObject(answers) ? answers : {};
  let scoreAchieved = 0;
  let scoreTotal = 0;
  let correctCount = 0;
  let answeredCount = 0;
  let pendingCount = 0;
  let pendingPoints = 0;

  const results = questions.map((q) => {
    const raw = given[q.id];
    const g = gradeQuestion(q, raw, { hintUsed: hintSet.has(String(q.id)) });
    const c = Number(conf[q.id]);
    scoreAchieved += g.pointsEarned;
    scoreTotal += g.pointsPossible;
    if (g.isCorrect) correctCount++;
    if (g.answered) answeredCount++;
    if (g.needsGrading) { pendingCount++; pendingPoints += g.pointsPossible; }
    return {
      questionId: q.id,
      questionText: displayQuestionText(q),
      type: q.type,
      givenAnswer: g.answered ? raw : null,
      givenAnswerText: formatAnswer(q, g.answered ? raw : null),
      correctAnswer: typeDef(q.type)?.correctAnswer ? typeDef(q.type).correctAnswer(q) : q.correctAnswer,
      correctAnswerText: formatCorrect(q),
      isCorrect: g.isCorrect,
      answered: g.answered,
      pointsEarned: g.pointsEarned,
      pointsPossible: g.pointsPossible,
      needsGrading: !!g.needsGrading,
      manual: isManualQuestion(q),
      ...(q.section ? { sectionId: q.section } : {}),
      ...(g.hintUsed ? { hintUsed: true, hintCost: g.hintCost } : {}),
      ...(q.confidence && g.answered && Number.isInteger(c) && c >= 1 && c <= 3 ? { confidence: c } : {}),
      ...(typeDef(q.type)?.resultExtras ? typeDef(q.type).resultExtras(q) : {}),
    };
  });

  scoreAchieved = round2(scoreAchieved);
  scoreTotal = round2(scoreTotal);
  const percentage = scoreTotal > 0 ? ((scoreAchieved / scoreTotal) * 100).toFixed(2) : '0.00';
  return {
    scoreAchieved, scoreTotal, percentage, correctCount, answeredCount, questionCount: questions.length,
    pendingCount, pendingPoints: round2(pendingPoints), results,
  };
}
