// Full Lewis structures for molecules and polyatomic ions ("structure" question type). Pure functions, no DOM.
//
// The teacher gives the skeleton: atoms (with optional grid positions) and which atoms are bonded.
// The student sets the bond order of every skeleton bond (0-3) and the lone pairs on every atom (0-4).
//
//   question.atoms   [{ id, symbol, x?, y? }]          x/y are grid units (column, row); auto layout when missing
//   question.bonds   [[atomIdA, atomIdB], ...]          the skeleton connections
//   question.charge  integer, default 0                 overall charge of an ion (e.g. -1 for NO3^-)
//   answer           { bonds: [order per skeleton bond], lonePairs: { atomId: count } }
//   correctAnswer    one answer object, or an array of them (resonance structures: any one is accepted)
//
// Question.studentCharges = true lets the student also draw brackets, an overall bracket charge and
// per-atom formal charges. Such questions are teacher graded (see isManualQuestion in schema.js). The answer
// (and the reference key) then also carries:
//   bracket        boolean                    brackets drawn around the whole structure
//   charge         integer −4..4              overall charge written on the bracket (0 = none)
//   formalCharges  { atomId: integer −4..4 }  formal charge written next to an atom (0 = none)

import { normalizeSymbol, valenceOf } from './lewis.js';

export const MAX_BOND_ORDER = 3;
export const MAX_LONE_PAIRS = 4;
export const MAX_CHARGE = 4; // |overall bracket charge| and |formal charge| limit for student-drawn charges

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v) => (Number.isInteger(Number(v)) ? Number(v) : NaN);

/** Accepts ["a","b"] or { a, b } for a skeleton bond; returns [a, b] strings or null. */
export function bondEnds(b) {
  if (Array.isArray(b) && b.length === 2) return [String(b[0]), String(b[1])];
  if (isObj(b) && b.a != null && b.b != null) return [String(b.a), String(b.b)];
  return null;
}

/** List of accepted answers (resonance forms). */
export function acceptedStructures(q) {
  const a = q && q.correctAnswer;
  if (Array.isArray(a)) return a.filter(isObj);
  return isObj(a) ? [a] : [];
}

const clampCharge = (v) => {
  const n = int(v);
  return Number.isFinite(n) ? Math.max(-MAX_CHARGE, Math.min(MAX_CHARGE, n)) : 0;
};

/** Student-drawn bracket / charges: { bracket, charge, formalCharges: { atomId: n } } (all atoms present). */
export function normalizeChargeMarks(q, ans) {
  const src = isObj(ans) ? ans : {};
  const formalCharges = {};
  for (const a of Array.isArray(q?.atoms) ? q.atoms : []) {
    formalCharges[a.id] = isObj(src.formalCharges) ? clampCharge(src.formalCharges[a.id]) : 0;
  }
  return { bracket: src.bracket === true, charge: clampCharge(src.charge), formalCharges };
}

/** Superscript-style label: "2−", "−", "+", "3+" (unicode minus, 1 omitted); "" for 0. { explicit: true } keeps the 1: "1−". */
export function chargeLabel(n, { explicit = false } = {}) {
  const c = Number(n) || 0;
  if (!c) return '';
  return `${Math.abs(c) === 1 && !explicit ? '' : Math.abs(c)}${c > 0 ? '+' : '−'}`;
}

/**
 * Bring any answer-ish value into { bonds: number[], lonePairs: { id: number } } for this question.
 * When q.studentCharges is true the result also has { bracket, charge, formalCharges } (see normalizeChargeMarks).
 */
export function normalizeStructureAnswer(q, ans) {
  const atoms = Array.isArray(q?.atoms) ? q.atoms : [];
  const nb = Array.isArray(q?.bonds) ? q.bonds.length : 0;
  const src = isObj(ans) ? ans : {};
  const bonds = Array.from({ length: nb }, (_, i) => {
    const v = Array.isArray(src.bonds) ? int(src.bonds[i]) : NaN;
    return Number.isFinite(v) ? Math.max(0, Math.min(MAX_BOND_ORDER, v)) : 0;
  });
  const lonePairs = {};
  for (const a of atoms) {
    const v = isObj(src.lonePairs) ? int(src.lonePairs[a.id]) : NaN;
    lonePairs[a.id] = Number.isFinite(v) ? Math.max(0, Math.min(MAX_LONE_PAIRS, v)) : 0;
  }
  return q?.studentCharges ? { bonds, lonePairs, ...normalizeChargeMarks(q, src) } : { bonds, lonePairs };
}

/** Electrons drawn in an answer: 2 per bond order + 2 per lone pair. */
export function electronsDrawn(q, ans) {
  const n = normalizeStructureAnswer(q, ans);
  return 2 * n.bonds.reduce((s, x) => s + x, 0) + 2 * Object.values(n.lonePairs).reduce((s, x) => s + x, 0);
}

/** Total valence electrons available (sum of atom valences minus the ion charge), or null for non-main-group atoms. */
export function valenceTotal(q) {
  const atoms = Array.isArray(q?.atoms) ? q.atoms : [];
  let sum = 0;
  for (const a of atoms) {
    const v = valenceOf(a.symbol);
    if (v === null) return null;
    sum += v;
  }
  return sum - (Number(q?.charge) || 0);
}

export function isStructureAnswered(ans) {
  if (!isObj(ans)) return false;
  const b = Array.isArray(ans.bonds) && ans.bonds.some((x) => Number(x) > 0);
  const l = isObj(ans.lonePairs) && Object.values(ans.lonePairs).some((x) => Number(x) > 0);
  const c = ans.bracket === true || (Number(ans.charge) || 0) !== 0
    || (isObj(ans.formalCharges) && Object.values(ans.formalCharges).some((x) => (Number(x) || 0) !== 0));
  return b || l || c;
}

/** { fraction, full } against the best-matching accepted structure. */
export function scoreStructure(q, ans) {
  const accepted = acceptedStructures(q);
  if (!accepted.length || !isObj(ans)) return { fraction: 0, full: false };
  const given = normalizeStructureAnswer(q, ans);
  const atoms = q.atoms || [];
  const parts = given.bonds.length + atoms.length;
  let best = 0;
  for (const key of accepted) {
    const k = normalizeStructureAnswer(q, key);
    let right = 0;
    k.bonds.forEach((o, i) => { if (given.bonds[i] === o) right++; });
    for (const a of atoms) if (given.lonePairs[a.id] === k.lonePairs[a.id]) right++;
    if (right === parts) return { fraction: 1, full: true };
    best = Math.max(best, parts ? right / parts : 0);
  }
  return { fraction: q.partialCredit ? best : 0, full: false };
}

/** Formal charge of every atom: valence − lone-pair electrons − bonds. null for unknown elements. */
export function formalCharges(q, ans) {
  const n = normalizeStructureAnswer(q, ans);
  const out = {};
  for (const a of q.atoms || []) {
    const v = valenceOf(a.symbol);
    if (v === null) { out[a.id] = null; continue; }
    let bondCount = 0;
    (q.bonds || []).forEach((b, i) => {
      const e = bondEnds(b);
      if (e && (e[0] === a.id || e[1] === a.id)) bondCount += n.bonds[i];
    });
    out[a.id] = v - 2 * n.lonePairs[a.id] - bondCount;
  }
  return out;
}

const BOND_WORD = ['no bond', 'single', 'double', 'triple'];

/** "C=O double, C–O single · lone pairs: O1 2, C 0" style summary used in results / grading / CSV. */
export function describeStructure(q, ans) {
  if (!isObj(ans)) return '—';
  const n = normalizeStructureAnswer(q, ans);
  const label = new Map((q.atoms || []).map((a) => [a.id, a.symbol + (countSymbol(q, a.symbol) > 1 ? `(${a.id})` : '')]));
  const bonds = (q.bonds || []).map((b, i) => {
    const e = bondEnds(b) || ['?', '?'];
    return `${label.get(e[0]) ?? e[0]}–${label.get(e[1]) ?? e[1]} ${BOND_WORD[n.bonds[i]] ?? n.bonds[i]}`;
  });
  const lp = (q.atoms || []).map((a) => `${label.get(a.id)} ${n.lonePairs[a.id]}`);
  let out = `Bonds: ${bonds.join(', ')} · Lone pairs: ${lp.join(', ')} · ${electronsDrawn(q, ans)} electrons`;
  if (q.studentCharges) {
    const fc = (q.atoms || []).filter((a) => n.formalCharges[a.id]).map((a) => `${label.get(a.id)} ${chargeLabel(n.formalCharges[a.id], { explicit: true })}`);
    out += ` · Brackets: ${n.bracket ? `yes${n.charge ? `, charge ${chargeLabel(n.charge, { explicit: true })}` : ', no charge'}` : n.charge ? `no (charge ${chargeLabel(n.charge, { explicit: true })})` : 'no'}`;
    out += ` · Formal charges: ${fc.length ? fc.join(', ') : 'none'}`;
  }
  return out;
}

function countSymbol(q, sym) {
  return (q.atoms || []).filter((a) => a.symbol === sym).length;
}

/**
 * Positions in grid units for every atom. Uses x/y when every atom has them; otherwise a radial layout
 * around the atom with the most bonds (fine for typical central-atom molecules).
 */
export function layoutAtoms(q) {
  const atoms = Array.isArray(q?.atoms) ? q.atoms : [];
  const pos = {};
  if (atoms.length && atoms.every((a) => Number.isFinite(Number(a.x)) && Number.isFinite(Number(a.y)) && a.x !== '' && a.y !== '' && a.x != null && a.y != null)) {
    for (const a of atoms) pos[a.id] = { x: Number(a.x), y: Number(a.y) };
    return pos;
  }
  const adj = new Map(atoms.map((a) => [a.id, []]));
  for (const b of q.bonds || []) {
    const e = bondEnds(b);
    if (!e || !adj.has(e[0]) || !adj.has(e[1])) continue;
    adj.get(e[0]).push(e[1]);
    adj.get(e[1]).push(e[0]);
  }
  if (!atoms.length) return pos;
  const center = [...atoms].sort((a, b) => adj.get(b.id).length - adj.get(a.id).length)[0].id;
  pos[center] = { x: 0, y: 0 };
  const angle = { [center]: 0 };
  const queue = [center];
  while (queue.length) {
    const id = queue.shift();
    const kids = adj.get(id).filter((k) => !pos[k]);
    if (!kids.length) continue;
    const isCenter = id === center;
    const spread = isCenter ? 2 * Math.PI : Math.PI / 1.5;
    kids.forEach((k, i) => {
      const a = isCenter
        ? (kids.length === 2 ? i * Math.PI : -Math.PI / 2 + (i * spread) / kids.length)
        : angle[id] + (kids.length === 1 ? 0 : -spread / 2 + (i * spread) / (kids.length - 1));
      angle[k] = a;
      pos[k] = { x: pos[id].x + Math.cos(a), y: pos[id].y + Math.sin(a) };
      queue.push(k);
    });
  }
  // Disconnected atoms go in a row underneath.
  let extra = 0;
  for (const a of atoms) if (!pos[a.id]) pos[a.id] = { x: extra++, y: 2 };
  return pos;
}

/** Validation errors for a structure question (appended to `errors`, prefixed with `where`). */
export function validateStructure(q, where, errors) {
  const ID_RE = /^[A-Za-z0-9_-]+$/;
  const atoms = Array.isArray(q.atoms) ? q.atoms : null;
  if (!atoms || atoms.length < 2) { errors.push(`${where}: atoms needs at least 2 atoms.`); return; }
  const ids = new Set();
  atoms.forEach((a, i) => {
    if (!isObj(a)) { errors.push(`${where}: atom ${i + 1} must be an object with id and symbol.`); return; }
    if (typeof a.id !== 'string' || !ID_RE.test(a.id)) errors.push(`${where}: atom ${i + 1} has an invalid id (use letters, digits, "_" or "-").`);
    else if (ids.has(a.id)) errors.push(`${where}: duplicate atom id "${a.id}".`);
    else ids.add(a.id);
    if (!normalizeSymbol(a.symbol)) errors.push(`${where}: atom ${i + 1} needs an element symbol such as "C" or "O".`);
    const hasX = a.x !== undefined && a.x !== null && a.x !== '';
    const hasY = a.y !== undefined && a.y !== null && a.y !== '';
    if ((hasX && !Number.isFinite(Number(a.x))) || (hasY && !Number.isFinite(Number(a.y)))) errors.push(`${where}: atom ${i + 1} x and y must be numbers.`);
  });
  const bonds = Array.isArray(q.bonds) ? q.bonds : null;
  if (!bonds || bonds.length < 1) { errors.push(`${where}: bonds needs at least 1 bond, e.g. [["c", "o1"]].`); return; }
  const seen = new Set();
  bonds.forEach((b, i) => {
    const e = bondEnds(b);
    if (!e) { errors.push(`${where}: bond ${i + 1} must be a pair of atom ids, e.g. ["c", "o1"].`); return; }
    if (!ids.has(e[0]) || !ids.has(e[1])) errors.push(`${where}: bond ${i + 1} refers to an unknown atom id.`);
    if (e[0] === e[1]) errors.push(`${where}: bond ${i + 1} connects an atom to itself.`);
    const key = [...e].sort().join('|');
    if (seen.has(key)) errors.push(`${where}: bond ${i + 1} is listed twice.`);
    seen.add(key);
  });
  if (q.charge !== undefined && !Number.isInteger(q.charge)) errors.push(`${where}: charge must be a whole number (e.g. -1 for a 1− ion).`);

  const accepted = acceptedStructures(q);
  if (!accepted.length || (Array.isArray(q.correctAnswer) && accepted.length !== q.correctAnswer.length)) {
    errors.push(`${where}: correctAnswer must be { "bonds": [...], "lonePairs": { ... } } (or an array of them for resonance).`);
    return;
  }
  const total = valenceTotal(q);
  accepted.forEach((k, n) => {
    const label = accepted.length > 1 ? `${where}: correctAnswer ${n + 1}` : `${where}: correctAnswer`;
    if (!Array.isArray(k.bonds) || k.bonds.length !== bonds.length) {
      errors.push(`${label} bonds must list one bond order for each of the ${bonds.length} bonds, in the same order.`);
      return;
    }
    if (k.bonds.some((o) => !Number.isInteger(o) || o < 1 || o > MAX_BOND_ORDER)) errors.push(`${label} bond orders must be 1, 2 or 3.`);
    if (k.lonePairs !== undefined && !isObj(k.lonePairs)) { errors.push(`${label} lonePairs must be an object { atomId: count }.`); return; }
    for (const [id, v] of Object.entries(k.lonePairs || {})) {
      if (!ids.has(id)) errors.push(`${label} lonePairs refers to unknown atom "${id}".`);
      else if (!Number.isInteger(v) || v < 0 || v > MAX_LONE_PAIRS) errors.push(`${label} lone pairs on "${id}" must be a whole number 0-4.`);
    }
    if (q.studentCharges) {
      if (k.bracket !== undefined && typeof k.bracket !== 'boolean') errors.push(`${label} bracket must be true or false.`);
      if (k.charge !== undefined && (!Number.isInteger(k.charge) || Math.abs(k.charge) > MAX_CHARGE)) errors.push(`${label} charge must be a whole number from −${MAX_CHARGE} to ${MAX_CHARGE}.`);
      if (k.formalCharges !== undefined && !isObj(k.formalCharges)) errors.push(`${label} formalCharges must be an object { atomId: charge }.`);
      for (const [id, v] of Object.entries(isObj(k.formalCharges) ? k.formalCharges : {})) {
        if (!ids.has(id)) errors.push(`${label} formalCharges refers to unknown atom "${id}".`);
        else if (!Number.isInteger(v) || Math.abs(v) > MAX_CHARGE) errors.push(`${label} formal charge on "${id}" must be a whole number from −${MAX_CHARGE} to ${MAX_CHARGE}.`);
      }
    }
    if (total !== null) {
      const drawn = electronsDrawn(q, k);
      if (drawn !== total) {
        errors.push(`${label} uses ${drawn} electrons but the atoms have ${total} valence electrons${q.charge ? ` (after the ${q.charge > 0 ? '+' : ''}${q.charge} charge)` : ''}. Check bond orders and lone pairs.`);
      }
    }
  });
}
