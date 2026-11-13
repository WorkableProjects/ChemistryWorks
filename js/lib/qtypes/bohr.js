// `bohr` question type: Bohr / shell model. Pure definition, no DOM.
//   { type: 'bohr', mode: 'element'|'count', element: 'Mg', electrons: 12, partialCredit: true }
//   mode 'element': the element sets the number of electrons; mode 'count': the electron count is given.
//   Covers the first 20 electrons only. Shells fill 2, 8, 8, then 2 in shell 4 (school Bohr model).
//   Answer: { shells: [n1, n2, n3, n4] }   Key: { shells: [2, 8, 2] } (occupied shells only)
//   Score: each shell slot is right or wrong. Slots compared are those with a key or an answer value.
//   fraction = slots right / slots compared (partialCredit: false gives 0 unless all right).
import { registerType } from './registry.js';
import { elementOf, normSymbol } from './ionbuilder.js';
export { elementOf };

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const toInt = (v) => {
  if (v === '' || v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
};
export const MODES = ['element', 'count'];
export const MODE_LABELS = { element: 'Given element: draw its electron shells', count: 'Given number of electrons: draw the shells' };
export const MAX_ELECTRONS = 20;
export const SHELL_SLOTS = 4;
/** Electrons a shell can hold in this model (shell 4 takes only the last 2 of the first 20 electrons). */
export const CAPACITY = [2, 8, 8, 2];
const DASH = '—';

/** Occupied shells for n electrons, e.g. 12 → [2, 8, 2]. Empty for n < 1. */
export function shellsFor(n) {
  const out = [];
  let rem = n;
  for (const cap of CAPACITY) {
    if (rem <= 0) break;
    const take = Math.min(cap, rem);
    out.push(take);
    rem -= take;
  }
  return out;
}

/** The electron count for the current mode, or null when the question is incomplete. */
export function electronsOf(q) {
  if (q.mode === 'count') {
    const n = Number(q.electrons);
    return isInt(n) && n >= 1 && n <= MAX_ELECTRONS ? n : null;
  }
  const el = elementOf(q.element);
  return el && el.number <= MAX_ELECTRONS ? el.number : null;
}

/** The key { shells } for the question, or null when the question is incomplete. */
export function keyOf(q) {
  const n = electronsOf(q);
  return n === null ? null : { shells: shellsFor(n) };
}

/** Per-slot comparison. Returns { right, total } over the slots that have a key or an answer value. */
function slotScore(key, a) {
  const x = isObj(a) && Array.isArray(a.shells) ? a.shells : [];
  let right = 0;
  let total = 0;
  for (let i = 0; i < SHELL_SLOTS; i++) {
    const want = key.shells[i] || 0;
    const got = toInt(x[i]);
    if (want === 0 && (got === 0 || Number.isNaN(got))) continue;
    total++;
    if (got === want) right++;
  }
  return { right, total };
}

export const def = {
  type: 'bohr',
  label: 'Bohr model (electron shells)',
  shortLabel: 'Electron shells',
  group: 'Chemistry',
  v5: true,

  normalize(q) {
    q.mode = MODES.includes(q.mode) ? q.mode : 'element';
    q.element = normSymbol(q.element);
    q.electrons = q.electrons === '' || q.electrons === null || q.electrons === undefined ? undefined : Number(q.electrons);
    q.partialCredit = q.partialCredit === undefined ? true : Boolean(q.partialCredit);
  },

  validate(q, where, errors) {
    if (!MODES.includes(q.mode)) errors.push(`${where}: choose a mode.`);
    if (q.mode === 'count') {
      if (!isInt(q.electrons) || q.electrons < 1 || q.electrons > MAX_ELECTRONS) errors.push(`${where}: the number of electrons must be a whole number from 1 to ${MAX_ELECTRONS}.`);
    } else {
      const el = elementOf(q.element);
      if (!el) errors.push(`${where}: choose an element from the periodic table.`);
      else if (el.number > MAX_ELECTRONS) errors.push(`${where}: shells are set for the first ${MAX_ELECTRONS} elements only.`);
    }
  },

  blank(base) {
    return { ...base, text: 'Draw the electron shells of a magnesium atom.',
      mode: 'element', element: 'Mg', partialCredit: true };
  },

  isAnswered(q, a) {
    return isObj(a) && Array.isArray(a.shells) && a.shells.some((v) => v !== undefined && v !== '' && v !== 0);
  },

  score(q, a) {
    const key = keyOf(q);
    if (!key) return { fraction: 0, full: false };
    const { right, total } = slotScore(key, a);
    if (total === 0 || right === total) return { fraction: 1, full: true };
    return { fraction: q.partialCredit === false ? 0 : right / total, full: false };
  },

  answerText(q, a) {
    if (!isObj(a) || !Array.isArray(a.shells)) return DASH;
    const occupied = a.shells.slice(0, SHELL_SLOTS).map(toInt).filter((v) => v > 0);
    return occupied.length ? occupied.join(', ') : DASH;
  },

  keyText(q) {
    const key = keyOf(q);
    return key ? key.shells.join(', ') : DASH;
  },

  correctAnswer: (q) => keyOf(q) || { shells: [] },
};

registerType(def);
export default def;
