// Energy orbital diagrams ("orbital" question type, teacher graded). Pure functions, no DOM.
//
// The teacher picks the range of the diagram:
//   question.maxSublevel   highest sublevel shown, in Aufbau (filling) order, e.g. "3p"   (default "2p")
//   question.orbitalTypes  which sublevel types are included: subset of ['s','p','d','f'] (default ['s','p'])
// The diagram lists every Aufbau sublevel up to and including maxSublevel whose type is in orbitalTypes,
// lowest energy first. Each sublevel has 1 (s), 3 (p), 5 (d) or 7 (f) orbital boxes.
//
//   answer        { [sublevel]: Box[] }   one entry per orbital box, Box = '' | 'u' | 'd' | 'ud'
//                 ('u' = one spin-up electron, 'd' = one spin-down, 'ud' = a paired up+down)
//   sampleAnswer  same shape, optional reference for the teacher (never auto-graded)

export const ORBITAL_TYPES = ['s', 'p', 'd', 'f'];
export const BOXES_PER_TYPE = { s: 1, p: 3, d: 5, f: 7 };
// Aufbau / Madelung filling order.
export const AUFBAU = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p'];
export const BOX_STATES = ['', 'u', 'ud', 'd']; // cycle order used by the student widget
export const DEFAULT_MAX_SUBLEVEL = '2p';
export const DEFAULT_ORBITAL_TYPES = ['s', 'p'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const sublevelType = (sub) => String(sub).slice(-1);
export const boxCount = (sub) => BOXES_PER_TYPE[sublevelType(sub)] || 0;

/** Sublevels shown for a question, lowest energy first. */
export function sublevelsFor(q) {
  const max = AUFBAU.includes(q?.maxSublevel) ? q.maxSublevel : DEFAULT_MAX_SUBLEVEL;
  const types = Array.isArray(q?.orbitalTypes) && q.orbitalTypes.length
    ? q.orbitalTypes.filter((t) => ORBITAL_TYPES.includes(t)) : DEFAULT_ORBITAL_TYPES;
  return AUFBAU.slice(0, AUFBAU.indexOf(max) + 1).filter((s) => types.includes(sublevelType(s)));
}

const normBox = (v) => {
  const s = String(v ?? '').toLowerCase();
  return s === 'u' || s === 'd' || s === 'ud' ? s : s === 'du' ? 'ud' : '';
};

/** { [sublevel]: Box[] } with exactly the boxes of this question (missing = ''). Unknown sublevels dropped. */
export function normalizeOrbitalAnswer(q, ans) {
  const src = isObj(ans) ? ans : {};
  const out = {};
  for (const sub of sublevelsFor(q)) {
    const given = Array.isArray(src[sub]) ? src[sub] : [];
    out[sub] = Array.from({ length: boxCount(sub) }, (_, i) => normBox(given[i]));
  }
  return out;
}

export const boxElectrons = (b) => (b === 'ud' ? 2 : b === 'u' || b === 'd' ? 1 : 0);

export function orbitalElectronCount(q, ans) {
  const n = normalizeOrbitalAnswer(q, ans);
  return Object.values(n).reduce((s, boxes) => s + boxes.reduce((t, b) => t + boxElectrons(b), 0), 0);
}

export function isOrbitalAnswered(q, ans) {
  return orbitalElectronCount(q, ans) > 0;
}

const ARROW = { '': '_', u: '↑', d: '↓', ud: '↑↓' };

/** "1s [↑↓] · 2s [↑↓] · 2p [↑↓][↑ ][↑ ] · 8 electrons" — used in results, grading and CSV. */
export function describeOrbital(q, ans) {
  if (!isObj(ans)) return '—';
  const n = normalizeOrbitalAnswer(q, ans);
  const parts = Object.entries(n).map(([sub, boxes]) => `${sub} ${boxes.map((b) => `[${ARROW[b]}]`).join('')}`);
  const e = orbitalElectronCount(q, ans);
  return `${parts.join(' · ')} · ${e} electron${e === 1 ? '' : 's'}`;
}

/** Spoken description of one box, used for aria-labels (spin never conveyed by colour alone). */
export function boxLabel(sub, index, box) {
  const what = box === 'ud' ? 'two electrons, paired spin up and spin down'
    : box === 'u' ? 'one electron, spin up' : box === 'd' ? 'one electron, spin down' : 'empty';
  return `${sub} orbital ${index + 1}: ${what}`;
}

/** Validation errors for an orbital question (appended to `errors`, prefixed with `where`). */
export function validateOrbital(q, where, errors) {
  if (!AUFBAU.includes(q.maxSublevel)) errors.push(`${where}: maxSublevel must be one of ${AUFBAU.join(', ')}.`);
  if (!Array.isArray(q.orbitalTypes) || !q.orbitalTypes.length || q.orbitalTypes.some((t) => !ORBITAL_TYPES.includes(t))) {
    errors.push(`${where}: orbitalTypes must list at least one of "s", "p", "d", "f".`);
  } else if (!sublevelsFor(q).length) {
    errors.push(`${where}: no sublevels are shown — include a type that appears at or below ${q.maxSublevel}.`);
  }
  const s = q.sampleAnswer;
  if (s !== undefined && s !== null && s !== '' && !isObj(s)) errors.push(`${where}: sampleAnswer must be { "2p": ["ud", "u", "u"], ... } or empty.`);
  if (isObj(s)) {
    const shown = new Set(sublevelsFor(q));
    for (const [sub, boxes] of Object.entries(s)) {
      if (!shown.has(sub)) errors.push(`${where}: sampleAnswer uses sublevel "${sub}", which is not in this diagram.`);
      else if (!Array.isArray(boxes) || boxes.length > boxCount(sub) || boxes.some((b) => !['', 'u', 'd', 'ud'].includes(b))) {
        errors.push(`${where}: sampleAnswer "${sub}" must list up to ${boxCount(sub)} boxes, each "", "u", "d" or "ud".`);
      }
    }
  }
}

/* ------------------------------------------------------------------ auto-fill from a symbol or configuration */
// Like Lewis questions, the teacher can type an element symbol ("N") or an electron configuration
// ("1s2 2s2 2p3", "[Ne] 3s1", "1s² 2s² 2p⁶") and the reference diagram is drawn from it (Hund's rule:
// one ↑ in each box of a sublevel before any pairing).

const CAPACITY = { s: 2, p: 6, d: 10, f: 14 };
const NOBLE_CORE = { He: 2, Ne: 10, Ar: 18, Kr: 36, Xe: 54, Rn: 86 };
const SUPERSCRIPT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/** Ground-state electron counts by Aufbau order for `z` electrons: { '1s': 2, '2s': 2, '2p': 3 }. */
export function aufbauCounts(z) {
  const out = {};
  let left = Math.max(0, Math.floor(Number(z) || 0));
  for (const sub of AUFBAU) {
    if (left <= 0) break;
    const n = Math.min(left, CAPACITY[sublevelType(sub)]);
    out[sub] = n;
    left -= n;
  }
  return out;
}

/** Parse "1s2 2s2 2p3", "1s^2 2s^2", "[Ar] 4s2 3d6", superscripts allowed. Returns { counts } or { error }. */
export function parseConfiguration(text) {
  let s = String(text ?? '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUPERSCRIPT[c]).replace(/\^/g, '').trim();
  if (!s) return { error: 'empty' };
  const counts = {};
  const core = /^\[\s*([A-Za-z]{2})\s*\]/.exec(s);
  if (core) {
    const sym = core[1][0].toUpperCase() + core[1][1].toLowerCase();
    if (!(sym in NOBLE_CORE)) return { error: `[${core[1]}] is not a noble-gas core` };
    Object.assign(counts, aufbauCounts(NOBLE_CORE[sym]));
    s = s.slice(core[0].length);
  }
  const parts = s.split(/[\s,·.]+/).filter(Boolean);
  for (const p of parts) {
    const m = /^([1-7])([spdf])(\d{1,2})$/i.exec(p);
    if (!m) return { error: `"${p}" is not a sublevel like 2p3` };
    const sub = `${m[1]}${m[2].toLowerCase()}`;
    if (!AUFBAU.includes(sub)) return { error: `${sub} is not a real sublevel` };
    const n = Number(m[3]);
    if (n < 1 || n > CAPACITY[sublevelType(sub)]) return { error: `${sub} holds at most ${CAPACITY[sublevelType(sub)]} electrons` };
    counts[sub] = n;
  }
  if (!Object.keys(counts).length) return { error: 'no sublevels found' };
  return { counts };
}

/**
 * Element symbol or configuration -> { counts, label } or { error }.
 * `elements` is the periodic table list ({ symbol, number }), passed in so this module stays data-free.
 */
export function resolveOrbitalSource(text, elements = []) {
  const t = String(text ?? '').trim();
  if (!t) return { error: 'empty' };
  if (/^[A-Za-z]{1,2}$/.test(t)) {
    const sym = t[0].toUpperCase() + t.slice(1).toLowerCase();
    const el = elements.find((e) => e.symbol === sym);
    if (!el) return { error: `${t} is not an element symbol` };
    return { counts: aufbauCounts(el.number), label: sym };
  }
  return parseConfiguration(t);
}

/** Hund's-rule diagram for counts: { '2p': ['u','u','u'], ... } (spin-up across the boxes, then pair). */
export function diagramFromCounts(counts) {
  const out = {};
  for (const [sub, n] of Object.entries(counts || {})) {
    const boxes = Array(boxCount(sub)).fill('');
    for (let e = 0; e < n; e++) {
      const i = e % boxes.length;
      boxes[i] = e < boxes.length ? 'u' : 'ud';
    }
    out[sub] = boxes;
  }
  return out;
}

/** Configuration text for counts in Aufbau order: "1s2 2s2 2p3". */
export function configurationText(counts) {
  return AUFBAU.filter((s) => counts?.[s]).map((s) => `${s}${counts[s]}`).join(' ');
}

/** The diagram range needed to show every occupied sublevel: { maxSublevel, orbitalTypes }. */
export function rangeForCounts(counts) {
  const subs = AUFBAU.filter((s) => counts?.[s]);
  const last = subs[subs.length - 1] || DEFAULT_MAX_SUBLEVEL;
  return { maxSublevel: last, orbitalTypes: ORBITAL_TYPES.filter((t) => subs.some((s) => sublevelType(s) === t)) };
}
