// Auto-grading engine. Pure functions, no DOM. Never throws on malformed answers.

import { formulasEqual } from './formula.js';

const SUP_MAP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const DASH = '—';

const round2 = (x) => Math.round(x * 100) / 100;
const squash = (s) => String(s).replace(/\s+/g, '').toLowerCase();
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
  const type = question && question.type;
  switch (type) {
    case 'mcq':
      return (typeof answer === 'string' && answer.trim() !== '') || typeof answer === 'number';
    case 'multi':
      return Array.isArray(answer) && answer.length > 0;
    case 'numeric':
      return (typeof answer === 'string' && answer.trim() !== '') || (typeof answer === 'number' && Number.isFinite(answer));
    case 'formula':
    case 'short':
      return typeof answer === 'string' && answer.trim() !== '';
    case 'truefalse':
      return typeof answer === 'boolean';
    case 'matching':
      return isPlainObject(answer) && Object.values(answer).some((v) => v !== null && v !== undefined && String(v).trim() !== '');
    default:
      if (typeof answer === 'string') return answer.trim() !== '';
      if (Array.isArray(answer)) return answer.length > 0;
      if (isPlainObject(answer)) return Object.keys(answer).length > 0;
      return true;
  }
}

/** Returns { fraction, full } for an answered question. */
function score(q, answer) {
  switch (q.type) {
    case 'mcq': {
      const ok = String(answer) === String(q.correctAnswer);
      return { fraction: ok ? 1 : 0, full: ok };
    }
    case 'truefalse': {
      const ok = typeof answer === 'boolean' && answer === q.correctAnswer;
      return { fraction: ok ? 1 : 0, full: ok };
    }
    case 'multi': {
      if (!Array.isArray(answer) || !Array.isArray(q.correctAnswer)) return { fraction: 0, full: false };
      const correct = new Set(q.correctAnswer.map(String));
      const picked = new Set(answer.map(String));
      let right = 0;
      let wrong = 0;
      for (const id of picked) (correct.has(id) ? right++ : wrong++);
      if (right === correct.size && wrong === 0) return { fraction: 1, full: true };
      if (q.partialCredit && correct.size > 0) return { fraction: Math.max(0, (right - wrong) / correct.size), full: false };
      return { fraction: 0, full: false };
    }
    case 'numeric': {
      const x = parseNumber(answer, { unit: q.unit });
      const key = Number(q.correctAnswer);
      if (Number.isNaN(x) || !Number.isFinite(key) || q.correctAnswer === null || q.correctAnswer === '' || typeof q.correctAnswer === 'boolean') {
        return { fraction: 0, full: false };
      }
      const tol = Number(q.tolerance) > 0 ? Number(q.tolerance) : 0;
      const allowed = (q.toleranceType === 'percent' ? Math.abs(key) * tol / 100 : tol) + 1e-9 * Math.abs(key);
      const ok = Math.abs(x - key) <= allowed;
      return { fraction: ok ? 1 : 0, full: ok };
    }
    case 'formula': {
      if (typeof answer !== 'string') return { fraction: 0, full: false };
      const accepted = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
      const opts = { caseSensitive: q.caseSensitive !== false };
      const ok = accepted.some((a) => typeof a === 'string' && a.trim() !== '' && formulasEqual(answer, a, opts));
      return { fraction: ok ? 1 : 0, full: ok };
    }
    case 'matching': {
      if (!isPlainObject(answer) || !isPlainObject(q.correctAnswer)) return { fraction: 0, full: false };
      const leftIds = Array.isArray(q.left) && q.left.length ? q.left.map((l) => l.id) : Object.keys(q.correctAnswer);
      if (!leftIds.length) return { fraction: 0, full: false };
      let right = 0;
      for (const id of leftIds) {
        if (answer[id] !== undefined && answer[id] !== null && String(answer[id]) === String(q.correctAnswer[id])) right++;
      }
      const full = right === leftIds.length;
      if (full) return { fraction: 1, full: true };
      return { fraction: q.partialCredit === false ? 0 : right / leftIds.length, full: false };
    }
    default:
      return { fraction: 0, full: false };
  }
}

export function gradeQuestion(question, answer) {
  const q = question || {};
  const pts = Number(q.points);
  const pointsPossible = round2(Number.isFinite(pts) && pts >= 0 ? pts : 1);
  const answered = isAnswered(q, answer);
  if (!answered) return { answered: false, isCorrect: false, pointsEarned: 0, pointsPossible, partial: false };
  // Open-ended answers score 0 until a teacher grades them in the admin panel.
  if (q.type === 'short') return { answered: true, isCorrect: false, pointsEarned: 0, pointsPossible, partial: false, needsGrading: true };
  let res;
  try {
    res = score(q, answer);
  } catch {
    res = { fraction: 0, full: false };
  }
  const pointsEarned = res.full ? pointsPossible : Math.min(pointsPossible, round2(res.fraction * pointsPossible));
  return {
    answered: true,
    isCorrect: res.full,
    pointsEarned,
    pointsPossible,
    partial: !res.full && pointsEarned > 0 && pointsEarned < pointsPossible,
  };
}

function optionText(list, id) {
  const o = Array.isArray(list) ? list.find((x) => x && String(x.id) === String(id)) : null;
  return o ? String(o.text) : String(id);
}

export function formatAnswer(question, answer) {
  const q = question || {};
  try {
    if (q.type === 'formula' && Array.isArray(answer)) return answer.length ? answer.map(String).join(' / ') : DASH;
    if (!isAnswered(q, answer)) return DASH;
    switch (q.type) {
      case 'mcq':
        return optionText(q.options, answer);
      case 'multi': {
        const picked = new Set(answer.map(String));
        const known = (q.options || []).filter((o) => picked.has(String(o.id))).map((o) => String(o.text));
        const knownIds = new Set((q.options || []).map((o) => String(o.id)));
        const unknown = [...picked].filter((id) => !knownIds.has(id));
        return [...known, ...unknown].join('; ');
      }
      case 'truefalse':
        return answer ? 'True' : 'False';
      case 'numeric': {
        const raw = String(answer).trim();
        const unit = q.unit ? String(q.unit) : '';
        if (unit && !squash(raw).endsWith(squash(unit))) return `${raw} ${unit}`;
        return raw;
      }
      case 'formula':
        return Array.isArray(answer) ? answer.map(String).join(' / ') : String(answer);
      case 'short':
        return String(answer).trim();
      case 'matching':
        return (q.left || [])
          .map((l) => {
            const r = answer[l.id];
            const has = r !== undefined && r !== null && String(r).trim() !== '';
            return `${l.text} → ${has ? optionText(q.right, r) : DASH}`;
          })
          .join('; ');
      default:
        return typeof answer === 'object' ? JSON.stringify(answer) : String(answer);
    }
  } catch {
    return DASH;
  }
}

function formatCorrect(q) {
  if (q.type === 'short') return q.sampleAnswer ? String(q.sampleAnswer) : DASH;
  const a = q.correctAnswer;
  if (q.type === 'formula' && Array.isArray(a)) return a.join(' / ');
  if (q.type === 'formula') return typeof a === 'string' ? a : DASH;
  return formatAnswer(q, a);
}

export function gradeTest(test, answers) {
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
    const g = gradeQuestion(q, raw);
    scoreAchieved += g.pointsEarned;
    scoreTotal += g.pointsPossible;
    if (g.isCorrect) correctCount++;
    if (g.answered) answeredCount++;
    if (g.needsGrading) { pendingCount++; pendingPoints += g.pointsPossible; }
    return {
      questionId: q.id,
      questionText: q.text,
      type: q.type,
      givenAnswer: g.answered ? raw : null,
      givenAnswerText: formatAnswer(q, g.answered ? raw : null),
      correctAnswer: q.type === 'short' ? (q.sampleAnswer || null) : q.correctAnswer,
      correctAnswerText: formatCorrect(q),
      isCorrect: g.isCorrect,
      answered: g.answered,
      pointsEarned: g.pointsEarned,
      pointsPossible: g.pointsPossible,
      needsGrading: !!g.needsGrading,
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
