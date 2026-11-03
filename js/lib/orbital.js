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
