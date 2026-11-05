// `multipart` question type (V4-03): one stem, several labelled parts (a) (b) (c), each part a full question of any
// auto-graded type. Pure module, no DOM. Answer shape: { partId: partAnswer }.
//   { type: 'multipart', stem?: text, parts: [ { id: 'a', type: 'mcq', text, points, ... }, ... ] }
import { registerType, typeDef } from './registry.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const round2 = (x) => Math.round(x * 100) / 100;
const PART_ID_RE = /^[A-Za-z0-9_-]+$/;

/** Part types that are never allowed (teacher graded, or nested multipart). */
const BLOCKED = ['short', 'open', 'orbital', 'multipart'];

/** True when `part` may be used as a part: an auto-graded question of any type except multipart. */
export function isAutoPartType(part) {
  const t = part && part.type;
  if (typeof t !== 'string' || !t || BLOCKED.includes(t)) return false;
  if (typeDef(t)?.manual === true) return false;
  if (t === 'structure' && part.studentCharges === true) return false;
  return true;
}

/** "a", "b", ... "z", "aa" ... label for part index i. */
export const partLetter = (i) => (i < 26 ? String.fromCharCode(97 + i) : `${String.fromCharCode(97 + Math.floor(i / 26) - 1)}${String.fromCharCode(97 + (i % 26))}`);

/** The part labels shown as "(a)": the part id when it is a single letter, otherwise its position. */
export const partLabel = (part, i) => (part && /^[a-z]$/i.test(String(part.id)) ? String(part.id).toLowerCase() : partLetter(i));

const partsOf = (q) => (Array.isArray(q && q.parts) ? q.parts.filter(isObj) : []);

export function partsPoints(q) {
  return round2(partsOf(q).reduce((s, p) => s + (Number.isFinite(Number(p.points)) ? Number(p.points) : 0), 0));
}

export const def = {
  type: 'multipart',
  label: 'Multi-part question',
  shortLabel: 'Multi-part',
  group: 'Basics',

  normalize(q, H) {
    q.stem = q.stem === undefined || q.stem === null ? '' : String(q.stem);
    const raw = Array.isArray(q.parts) ? q.parts : [];
    const used = new Set();
    q.parts = raw.map((p, i) => {
      const part = H.normalizeQuestion(isObj(p) ? p : {});
      if (!part.id) {
        let k = i;
        while (used.has(partLetter(k))) k++;
        part.id = partLetter(k);
      }
      used.add(part.id);
      // extras apply to the whole multipart question, never to a single part
      delete part.confidence;
      delete part.hint;
      delete part.required;
      delete part.section;
      return part;
    });
    if (q.parts.length) q.points = partsPoints(q);
  },

  validate(q, where, errors, H) {
    if (typeof q.stem !== 'string') errors.push(`${where}: stem must be text.`);
    if (!Array.isArray(q.parts) || !q.parts.length) { errors.push(`${where}: add at least one part.`); return; }
    const seen = new Set();
    q.parts.forEach((p, i) => {
      const label = `(${partLabel(p, i)})`;
      const pw = `${where} part ${label}`;
      if (!isObj(p)) { errors.push(`${pw}: must be an object.`); return; }
      if (typeof p.id !== 'string' || !p.id.trim()) errors.push(`${pw}: id is required.`);
      else if (!PART_ID_RE.test(p.id)) errors.push(`${pw}: id may only contain letters, digits, "_" and "-".`);
      else if (seen.has(p.id)) errors.push(`${pw}: duplicate part id "${p.id}".`);
      else seen.add(p.id);
      if (!isAutoPartType(p)) {
        errors.push(`${pw}: a ${p.type === 'multipart' ? 'multi-part question cannot contain another multi-part question' : `"${p.type}" part cannot be used here (only auto-graded types)`}.`);
        return;
      }
      H.validateQuestion(p, pw, errors);
    });
    const sum = partsPoints(q);
    if (Number.isFinite(Number(q.points)) && Math.abs(Number(q.points) - sum) > 1e-9) {
      errors.push(`${where}: points (${q.points}) should equal the sum of the parts' points (${sum}).`);
    }
  },

  blank(base) {
    return {
      ...base, text: 'Answer each part.', stem: '', points: 2,
      parts: [
        { id: 'a', type: 'mcq', text: 'Part (a) question', points: 1, explanation: '', options: [{ id: 'a', text: 'Option A' }, { id: 'b', text: 'Option B' }], correctAnswer: 'a' },
        { id: 'b', type: 'numeric', text: 'Part (b) question', points: 1, explanation: '', correctAnswer: 0, tolerance: 0, toleranceType: 'absolute', unit: '' },
      ],
    };
  },

  isAnswered(q, answer, H) {
    if (!isObj(answer)) return false;
    return partsOf(q).some((p) => (H ? H.isAnswered(p, answer[p.id]) : answer[p.id] !== undefined && answer[p.id] !== null));
  },

  score(q, answer, H) {
    const parts = partsOf(q);
    if (!parts.length || !isObj(answer)) return { fraction: 0, full: false };
    let earned = 0;
    let possible = 0;
    let all = true;
    for (const p of parts) {
      const g = H.gradeQuestion(p, answer[p.id]);
      earned += g.pointsEarned;
      possible += g.pointsPossible;
      if (!g.isCorrect) all = false;
    }
    if (all) return { fraction: 1, full: true };
    return { fraction: possible > 0 ? Math.min(1, earned / possible) : 0, full: false };
  },

  answerText(q, answer, H) {
    const a = isObj(answer) ? answer : {};
    return partsOf(q).map((p, i) => `(${partLabel(p, i)}) ${H.formatAnswer(p, a[p.id])}`).join('; ');
  },

  keyText(q, H) {
    return partsOf(q).map((p, i) => `(${partLabel(p, i)}) ${H.correctAnswerText(p)}`).join('; ');
  },

  correctAnswer(q) {
    const out = {};
    for (const p of partsOf(q)) out[p.id] = p.correctAnswer ?? p.answers ?? p.answer ?? null;
    return out;
  },
};

registerType(def);
export default def;
