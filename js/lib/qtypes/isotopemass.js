// `isotopemass` question type (V5-07, S11c): average atomic mass from isotope data. Pure definition, no DOM.
//   { type: 'isotopemass', element: 'Chlorine', ask: 'average'|'abundance'|'table',
//     isotopes: [{ label: 'Cl-35', mass: 34.969, abundance: 75.78 }, ...],   (abundance in %, sums to 100)
//     average?: 35.45 (shown to the student when ask = 'abundance'; default: computed),
//     missingIndex?: 1 (ask = 'abundance': the isotope whose abundance is hidden),
//     tolerance: 0.01 (amu), abundanceTolerance: 0.1 (%), showWork: true (average mode: one contribution box per isotope),
//     randomize?: { mass: 0.5 (± amu), abundance: 5 (± %) } }  perturbs the numbers per student, abundances still sum to 100.
//   Answers (typed text):
//     average:   { result: '35.45', rows?: [{ part }] }          graded: result
//     abundance: { missing: '24.22' }                            graded: missing
//     table:     { rows: [{ mass, abundance }], result }          graded: each row (mass and abundance) and the result
//   Key: { result } or { missing } (+ tolerance). Partial credit per row in table mode follows `partialCredit`.
import { registerType } from './registry.js';
import { addInstantiateStep } from '../instantiate-steps.js';
import { parseNum, withinTolerance } from './dimensional.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const DASH = '—';
export const ASK_MODES = ['average', 'abundance', 'table'];
export const ASK_LABELS = { average: 'Find the average atomic mass', abundance: 'Find the missing abundance', table: 'Fill the table, then find the average' };
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const round = (x, d) => Number(x.toFixed(d));

/** Number from typed text; "35.45 amu", "24,22 %" and "75.78%" read as numbers. NaN otherwise. */
export function parseIso(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  return parseNum(str(input).trim().replace(/\s*(amu|u|%|percent)\s*$/i, ''));
}

/** Weighted average mass of the isotopes (NaN when a row is unreadable). */
export function averageMass(isotopes) {
  let total = 0;
  for (const i of isotopes || []) {
    const m = num(i && i.mass), a = num(i && i.abundance);
    if (!Number.isFinite(m) || !Number.isFinite(a)) return NaN;
    total += m * a / 100;
  }
  return isotopes && isotopes.length ? total : NaN;
}

/** Index of the hidden abundance (ask = 'abundance'); 0 when unset or out of range. */
export const missingIdx = (q) => (Number.isInteger(q.missingIndex) && q.missingIndex >= 0 && q.missingIndex < (q.isotopes || []).length ? q.missingIndex : 0);

/** The hidden abundance: 100 minus the others. */
export function missingKey(q) {
  const k = missingIdx(q);
  let rest = 0;
  (q.isotopes || []).forEach((i, n) => { if (n !== k) rest += num(i.abundance); });
  return round(100 - rest, 6);
}

/** The key for "result": the question's own `answer`, else computed from the isotopes. */
export function resultKey(q) {
  const own = q && q.answer !== undefined && q.answer !== null && q.answer !== '' ? Number(q.answer) : NaN;
  return Number.isFinite(own) ? own : averageMass(q && q.isotopes);
}

const rowsOf = (a) => (isObj(a) && Array.isArray(a.rows) ? a.rows.map((r) => (isObj(r) ? r : {})) : []);
const rowTyped = (r) => str(r.mass).trim() || str(r.abundance).trim();

/** "mass × abundance %" lines for the student's table (rows with nothing typed are skipped). */
export function rowsText(a) {
  return rowsOf(a).filter(rowTyped).map((r) => `${str(r.mass).trim() || '?'} amu, ${str(r.abundance).trim() || '?'} %`).join('; ');
}
const partText = (a) => rowsOf(a).map((r) => str(r.part).trim()).some(Boolean) ? rowsOf(a).map((r) => str(r.part).trim() || '?').join(' + ') : '';

export const def = {
  type: 'isotopemass',
  label: 'Average atomic mass',
  shortLabel: 'Isotope average',
  group: 'Chemistry',
  v5: true,

  normalize(q) {
    q.element = str(q.element).trim();
    q.ask = ASK_MODES.includes(q.ask) ? q.ask : 'average';
    q.isotopes = (Array.isArray(q.isotopes) ? q.isotopes : []).filter(isObj).map((i) => ({
      label: str(i.label).trim(), mass: i.mass === '' || i.mass === undefined || i.mass === null ? '' : Number(i.mass),
      abundance: i.abundance === '' || i.abundance === undefined || i.abundance === null ? '' : Number(i.abundance),
    }));
    if (q.answer === '' || q.answer === null) delete q.answer;
    else if (typeof q.answer === 'string' && Number.isFinite(Number(q.answer))) q.answer = Number(q.answer);
    q.tolerance = q.tolerance === undefined || q.tolerance === null || q.tolerance === '' ? 0.01 : Number(q.tolerance);
    q.abundanceTolerance = q.abundanceTolerance === undefined || q.abundanceTolerance === null || q.abundanceTolerance === '' ? 0.1 : Number(q.abundanceTolerance);
    q.showWork = Boolean(q.showWork);
    if (q.ask === 'abundance') q.missingIndex = missingIdx(q); else delete q.missingIndex;
    if (q.average === '' || q.average === null) delete q.average;
    else if (typeof q.average === 'string' && Number.isFinite(Number(q.average))) q.average = Number(q.average);
    if (q.randomize && !isObj(q.randomize)) q.randomize = { mass: 0.5, abundance: 5 };
  },

  validate(q, where, errors) {
    const iso = q.isotopes || [];
    if (iso.length < 2) errors.push(`${where}: add at least two isotopes.`);
    iso.forEach((i, n) => {
      if (typeof i.mass !== 'number' || !Number.isFinite(i.mass) || i.mass <= 0) errors.push(`${where}: isotope ${n + 1} needs a mass above 0.`);
      const hidden = q.ask === 'abundance' && n === missingIdx(q);
      if (!hidden && (typeof i.abundance !== 'number' || !Number.isFinite(i.abundance) || i.abundance < 0 || i.abundance > 100)) errors.push(`${where}: isotope ${n + 1} needs an abundance from 0 to 100.`);
    });
    if (iso.length >= 2 && iso.every((i, n) => (q.ask === 'abundance' && n === missingIdx(q)) || typeof i.abundance === 'number')) {
      if (q.ask === 'abundance') {
        const m = missingKey(q);
        if (!(m > 0 && m <= 100)) errors.push(`${where}: the other abundances must add up to less than 100 so the missing one is above 0.`);
        else if (Number.isFinite(q.average) && Math.abs(averageMass(iso.map((i, n) => (n === missingIdx(q) ? { ...i, abundance: m } : i))) - q.average) > 0.05) errors.push(`${where}: the average given does not match these isotopes (it should be about ${averageMass(iso.map((i, n) => (n === missingIdx(q) ? { ...i, abundance: m } : i))).toFixed(2)}).`);
      } else {
        const sum = iso.reduce((t, i) => t + i.abundance, 0);
        if (Math.abs(sum - 100) > 0.01) errors.push(`${where}: abundances add up to ${round(sum, 4)}, they must add up to 100.`);
      }
    }
    if (q.answer !== undefined && (typeof q.answer !== 'number' || !Number.isFinite(q.answer) || q.answer <= 0)) errors.push(`${where}: answer must be a positive number (or leave it out to use the computed average).`);
    if (typeof q.tolerance !== 'number' || !Number.isFinite(q.tolerance) || q.tolerance < 0) errors.push(`${where}: tolerance must be a number that is 0 or greater.`);
    if (typeof q.abundanceTolerance !== 'number' || !Number.isFinite(q.abundanceTolerance) || q.abundanceTolerance < 0) errors.push(`${where}: abundance tolerance must be a number that is 0 or greater.`);
  },

  blank(base) {
    return { ...base, text: 'Calculate the average atomic mass of the element from its isotopes.', element: 'Chlorine', ask: 'average',
      isotopes: [{ label: 'Cl-35', mass: 34.969, abundance: 75.78 }, { label: 'Cl-37', mass: 36.966, abundance: 24.22 }],
      tolerance: 0.01, abundanceTolerance: 0.1, showWork: true };
  },

  isAnswered(q, a) {
    if (!isObj(a)) return false;
    if (q.ask === 'abundance') return str(a.missing).trim() !== '';
    return str(a.result).trim() !== '' || (q.ask === 'table' && rowsOf(a).some(rowTyped));
  },

  score(q, a) {
    if (!isObj(a)) return { fraction: 0, full: false };
    if (q.ask === 'abundance') {
      const ok = withinTolerance(parseIso(a.missing), missingKey(q), q.abundanceTolerance, 'absolute');
      return { fraction: ok ? 1 : 0, full: ok };
    }
    const resultOk = withinTolerance(parseIso(a.result), resultKey(q), q.tolerance, 'absolute');
    if (q.ask !== 'table') return { fraction: resultOk ? 1 : 0, full: resultOk };
    const rows = rowsOf(a);
    const iso = q.isotopes || [];
    const right = iso.filter((i, n) => rows[n] && withinTolerance(parseIso(rows[n].mass), i.mass, q.tolerance, 'absolute')
      && withinTolerance(parseIso(rows[n].abundance), i.abundance, q.abundanceTolerance, 'absolute')).length + (resultOk ? 1 : 0);
    const total = iso.length + 1;
    if (right === total) return { fraction: 1, full: true };
    return { fraction: q.partialCredit === false ? 0 : right / total, full: false };
  },

  answerText(q, a) {
    const x = isObj(a) ? a : {};
    if (q.ask === 'abundance') return str(x.missing).trim() ? `${str(x.missing).trim()} %` : DASH;
    const result = str(x.result).trim() ? `${str(x.result).trim()} amu` : DASH;
    const extra = q.ask === 'table' ? rowsText(x) : partText(x);
    return `${result}${extra ? ` (${q.ask === 'table' ? 'table' : 'work'}: ${extra})` : ''}`;
  },

  keyText(q) {
    if (q.ask === 'abundance') { const m = missingKey(q); return Number.isFinite(m) ? `${m.toFixed(2)} %` : DASH; }
    const r = resultKey(q);
    const base = Number.isFinite(r) ? `${r.toFixed(2)} amu` : DASH;
    return q.ask === 'table' ? `${base} (${(q.isotopes || []).map((i) => `${i.mass} amu, ${i.abundance} %`).join('; ')})` : base;
  },

  correctAnswer: (q) => (q.ask === 'abundance' ? { missing: missingKey(q), tolerance: q.abundanceTolerance }
    : { result: resultKey(q), tolerance: q.tolerance }),
};

/** Perturb masses and abundances (abundances still add up to 100). Pure: returns new isotopes, or null when not possible. */
export function perturbIsotopes(q, rand) {
  const iso = q.isotopes || [];
  const r = isObj(q.randomize) ? q.randomize : {};
  const dm = Number(r.mass) > 0 ? Number(r.mass) : 0;
  const da = Number(r.abundance) > 0 ? Number(r.abundance) : 0;
  if (iso.length < 2 || iso.some((i) => !Number.isFinite(num(i.mass)) || !Number.isFinite(num(i.abundance)))) return null;
  const masses = iso.map((i) => round(num(i.mass) + (rand() * 2 - 1) * dm, 3));
  let ab = iso.map((i) => Math.max(0.5, num(i.abundance) + (rand() * 2 - 1) * da));
  const total = ab.reduce((t, x) => t + x, 0);
  ab = ab.map((x) => round(x * 100 / total, 2));
  const last = ab.length - 1;
  ab[last] = round(100 - ab.slice(0, last).reduce((t, x) => t + x, 0), 2);
  if (ab[last] <= 0) return null;
  return iso.map((i, n) => ({ label: i.label, mass: masses[n], abundance: ab[n] }));
}

addInstantiateStep('isotopemass', (test, { rand }) => {
  for (const q of (test && test.questions) || []) {
    if (!q || q.type !== 'isotopemass' || !q.randomize || q.drawn) continue;
    try {
      const next = perturbIsotopes(q, rand);
      if (!next) continue;
      q.isotopes = next;
      q.drawn = { isotopes: next };
      delete q.answer;
      if (q.ask === 'abundance') q.average = round(averageMass(next), 3);
    } catch (e) { console.error(`[isotopemass:${q.id}]`, e); }
  }
});

registerType(def);
export default def;
