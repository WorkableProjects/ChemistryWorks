// `dropdown` question type: a cloze passage where each blank is a <select>. Pure module, no DOM.
// Answer shape: { blankId: chosenOption }.
//   { type: 'dropdown', text: 'Na is a [[b1]] and Cl is a [[b2]].', blanks: [{ id: 'b1', options: ['metal', 'nonmetal'], answer: 'metal' }, ...],
//     partialCredit: true }
import { registerType } from './registry.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const MARKER_RE = /\[\[\s*([A-Za-z0-9_-]+)\s*\]\]/g;
const ID_RE = /^[A-Za-z0-9_-]+$/;
const DASH = '—';

/** Split text into [{ text }, { blank: id }, ...] in order (markers look like [[b1]]). */
export function splitMarkers(text) {
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

/** Marker ids in order of appearance (duplicates kept so validation can report them). */
export const markerIdsOf = (text) => splitMarkers(text).filter((p) => p.blank).map((p) => p.blank);

/** Text with each marker shown as a numbered line: "Na is a ____(1)". */
export function numberedText(text) {
  let n = 0;
  return String(text ?? '').replace(MARKER_RE, () => `____(${++n})`);
}

const blanksOf = (q) => (Array.isArray(q && q.blanks) ? q.blanks.filter(isObj) : []);
const given = (v) => v !== undefined && v !== null && String(v) !== '';

export const def = {
  type: 'dropdown',
  label: 'Dropdown cloze',
  shortLabel: 'Dropdown cloze',
  group: 'Match & sort',

  normalize(q) {
    q.partialCredit = q.partialCredit === undefined || q.partialCredit === null ? true : Boolean(q.partialCredit);
    q.blanks = (Array.isArray(q.blanks) ? q.blanks : []).map((b) => {
      const src = isObj(b) ? b : {};
      return {
        ...src,
        id: String(src.id ?? '').trim(),
        options: (Array.isArray(src.options) ? src.options : []).map((o) => String(o ?? '').trim()).filter((o) => o !== ''),
        answer: String(src.answer ?? '').trim(),
      };
    });
  },

  validate(q, where, errors) {
    const markers = markerIdsOf(q.text);
    if (!markers.length) errors.push(`${where}: the text needs at least one blank written like [[b1]].`);
    const seenMarker = new Set();
    for (const id of markers) {
      if (seenMarker.has(id)) errors.push(`${where}: blank [[${id}]] appears more than once in the text.`);
      seenMarker.add(id);
    }
    if (!Array.isArray(q.blanks) || !q.blanks.length) { errors.push(`${where}: describe each blank under blanks.`); return; }
    const ids = new Set();
    q.blanks.forEach((b, i) => {
      const n = i + 1;
      if (!isObj(b)) { errors.push(`${where}: blank ${n} must be an object.`); return; }
      if (typeof b.id !== 'string' || !b.id.trim()) errors.push(`${where}: blank ${n} needs an id.`);
      else if (!ID_RE.test(b.id)) errors.push(`${where}: blank ${n} id may only contain letters, digits, "_" and "-".`);
      else if (ids.has(b.id)) errors.push(`${where}: duplicate blank id "${b.id}".`);
      else {
        ids.add(b.id);
        if (!seenMarker.has(b.id)) errors.push(`${where}: blank "${b.id}" is not used in the text (add [[${b.id}]]).`);
      }
      const opts = Array.isArray(b.options) ? b.options : [];
      if (opts.length < 2) errors.push(`${where}: blank ${n} needs at least two options.`);
      if (opts.some((o) => typeof o !== 'string' || !o.trim())) errors.push(`${where}: blank ${n} has an empty option.`);
      if (new Set(opts.map((o) => String(o).trim())).size !== opts.length) errors.push(`${where}: blank ${n} has duplicate options.`);
      if (!opts.includes(b.answer)) errors.push(`${where}: blank ${n} answer must be one of its options.`);
    });
    for (const id of seenMarker) if (!ids.has(id)) errors.push(`${where}: [[${id}]] in the text has no entry under blanks.`);
  },

  blank(base) {
    return {
      ...base, text: 'Sodium is a [[b1]] and chlorine is a [[b2]].', partialCredit: true,
      blanks: [
        { id: 'b1', options: ['metal', 'nonmetal'], answer: 'metal' },
        { id: 'b2', options: ['metal', 'nonmetal'], answer: 'nonmetal' },
      ],
    };
  },

  displayText: (q) => numberedText(q.text),

  isAnswered: (q, answer) => isObj(answer) && Object.values(answer).some(given),

  score(q, answer) {
    const blanks = blanksOf(q);
    if (!blanks.length || !isObj(answer)) return { fraction: 0, full: false };
    const right = blanks.filter((b) => given(answer[b.id]) && String(answer[b.id]) === String(b.answer)).length;
    if (right === blanks.length) return { fraction: 1, full: true };
    return { fraction: q.partialCredit === false ? 0 : right / blanks.length, full: false };
  },

  answerText(q, answer) {
    const a = isObj(answer) ? answer : {};
    return blanksOf(q).map((b, i) => `(${i + 1}) ${given(a[b.id]) ? String(a[b.id]).trim() : DASH}`).join('; ');
  },

  keyText: (q) => blanksOf(q).map((b, i) => `(${i + 1}) ${b.answer || DASH}`).join('; ') || DASH,

  correctAnswer: (q) => Object.fromEntries(blanksOf(q).map((b) => [b.id, b.answer])),
};

registerType(def);
export default def;
