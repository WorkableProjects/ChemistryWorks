// `titration` question type (V4-03, S10): a simulated strong-acid / weak-acid / strong-base / weak-base titration with a
// strong titrant. The student adds titrant ("Add 1.00 mL", "Add 0.10 mL" or a slider), watches the pH, and records the
// equivalence-point volume and / or the pH. Pure definition and simulation, no DOM.
//   { type: 'titration',
//     analyte: { type: 'acid'|'base', kind: 'strong'|'weak', conc: 0.100 (mol/L), volumeMl: 25.0, K: 1.8e-5 (Ka / Kb, weak only) },
//     titrant: { conc: 0.100 } (a strong base for an acid analyte, a strong acid for a base analyte),
//     ask: 'volume'|'ph'|'both', atVolume?: mL (the pH is asked at this volume; default the equivalence point),
//     volumeTolerance: 0.5 (mL), phTolerance: 0.2, maxVolume?: mL (slider limit; default about 2 x equivalence), partialCredit: true }
//   Answer: { volume: '25.0', ph: '8.72' } (typed text; only the asked fields are graded)
import { registerType } from './registry.js';
import { parseNum, withinTolerance } from './dimensional.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (v === undefined || v === null || v === '' ? v : Number.isFinite(Number(v)) ? Number(v) : v);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const DASH = '—';
/** Number from typed text; a trailing "mL" / "ml" / "L" is ignored ("25.3 mL" -> 25.3). NaN otherwise. */
export const parseVolume = (v) => parseNum(typeof v === 'string' ? v.replace(/\s*m?L\s*$/i, '') : v);
const KW = 1e-14;

export const ASKS = ['volume', 'ph', 'both'];

/** pH of the mixture after `vMl` of titrant (exact charge balance, monoprotic analyte, strong titrant). */
export function titrationPH(q, vMl) {
  const a = isObj(q && q.analyte) ? q.analyte : {};
  const ca = Number(a.conc);
  const va = Number(a.volumeMl);
  const cb = Number(q && q.titrant && q.titrant.conc);
  const v = Math.max(0, Number(vMl) || 0);
  const total = va + v;
  const added = cb * v / total;      // concentration of the titrant's counter-ion
  const cTot = ca * va / total;      // analyte, all forms
  const weak = a.kind === 'weak';
  const K = Number(a.K);
  // Work in "acid" terms; a base analyte is the mirror image (pOH plays the role of pH).
  const f = (h) => added + h - KW / h - cTot * (weak ? K / (K + h) : 1);
  let lo = -15;
  let hi = 1.5;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (f(10 ** mid) > 0) hi = mid; else lo = mid;
  }
  const pAcid = -(lo + hi) / 2;
  return a.type === 'base' ? 14 - pAcid : pAcid;
}

/** Equivalence-point volume in mL (analyte moles / titrant concentration). */
export function equivalenceVolume(q) {
  const a = isObj(q && q.analyte) ? q.analyte : {};
  return Number(a.conc) * Number(a.volumeMl) / Number(q && q.titrant && q.titrant.conc);
}

/** Slider limit in mL: the question's maxVolume, else twice the equivalence volume rounded up to a multiple of 5. */
export function maxTitrantVolume(q) {
  const m = Number(q && q.maxVolume);
  if (Number.isFinite(m) && m > 0) return m;
  const eq = equivalenceVolume(q);
  return Number.isFinite(eq) && eq > 0 ? Math.ceil(eq * 2 / 5) * 5 : 50;
}

/** [{ v, ph }] sampled along the whole curve (used by the builder preview and the answer-key review). */
export function curvePoints(q, n = 60) {
  const max = maxTitrantVolume(q);
  const out = [];
  for (let i = 0; i <= n; i++) { const v = max * i / n; out.push({ v, ph: titrationPH(q, v) }); }
  return out;
}

/** The pH the question asks for: at `atVolume` when set, else at the equivalence point. */
export const askedPhVolume = (q) => (isNum(q && q.atVolume) ? q.atVolume : equivalenceVolume(q));

export const keyValues = (q) => ({ volume: equivalenceVolume(q), ph: titrationPH(q, askedPhVolume(q)) });

const asks = (q) => ({ volume: q.ask !== 'ph', ph: q.ask !== 'volume' });

const fmt = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : DASH);

export const def = {
  type: 'titration',
  label: 'Titration',
  shortLabel: 'Titration',
  group: 'Chemistry',

  normalize(q) {
    const a = isObj(q.analyte) ? q.analyte : {};
    q.analyte = { ...a, type: a.type === 'base' ? 'base' : 'acid', kind: a.kind === 'weak' ? 'weak' : 'strong', conc: num(a.conc), volumeMl: num(a.volumeMl) };
    if (a.K !== undefined && a.K !== '') q.analyte.K = num(a.K); else delete q.analyte.K;
    const t = isObj(q.titrant) ? q.titrant : {};
    q.titrant = { ...t, conc: num(t.conc) };
    q.ask = ASKS.includes(q.ask) ? q.ask : 'both';
    for (const k of ['atVolume', 'maxVolume']) { if (q[k] === undefined || q[k] === null || q[k] === '') delete q[k]; else q[k] = num(q[k]); }
    q.volumeTolerance = q.volumeTolerance === undefined || q.volumeTolerance === null || q.volumeTolerance === '' ? 0.5 : Number(q.volumeTolerance);
    q.phTolerance = q.phTolerance === undefined || q.phTolerance === null || q.phTolerance === '' ? 0.2 : Number(q.phTolerance);
    q.partialCredit = q.partialCredit === undefined || q.partialCredit === null ? true : Boolean(q.partialCredit);
  },

  validate(q, where, errors) {
    const a = q.analyte;
    if (!isObj(a)) { errors.push(`${where}: analyte is required.`); return; }
    if (a.type !== 'acid' && a.type !== 'base') errors.push(`${where}: analyte.type must be "acid" or "base".`);
    if (a.kind !== 'strong' && a.kind !== 'weak') errors.push(`${where}: analyte.kind must be "strong" or "weak".`);
    if (!isNum(a.conc) || a.conc <= 0) errors.push(`${where}: analyte.conc must be a number above 0 (mol/L).`);
    if (!isNum(a.volumeMl) || a.volumeMl <= 0) errors.push(`${where}: analyte.volumeMl must be a number above 0 (mL).`);
    if (a.kind === 'weak' && (!isNum(a.K) || a.K <= 0 || a.K >= 1)) errors.push(`${where}: a weak analyte needs analyte.K (Ka or Kb), a number above 0 and below 1.`);
    if (!isObj(q.titrant) || !isNum(q.titrant.conc) || q.titrant.conc <= 0) errors.push(`${where}: titrant.conc must be a number above 0 (mol/L).`);
    if (!ASKS.includes(q.ask)) errors.push(`${where}: ask must be "volume", "ph" or "both".`);
    for (const k of ['volumeTolerance', 'phTolerance']) if (!isNum(q[k]) || q[k] < 0) errors.push(`${where}: ${k} must be a number that is 0 or greater.`);
    if (q.atVolume !== undefined && (!isNum(q.atVolume) || q.atVolume < 0)) errors.push(`${where}: atVolume must be a number that is 0 or greater.`);
    if (q.maxVolume !== undefined && (!isNum(q.maxVolume) || q.maxVolume <= 0)) errors.push(`${where}: maxVolume must be a number above 0.`);
    const eq = equivalenceVolume(q);
    if (Number.isFinite(eq) && isNum(q.maxVolume) && q.maxVolume <= eq) errors.push(`${where}: maxVolume must be larger than the equivalence volume (${fmt(eq, 2)} mL).`);
    if (Number.isFinite(eq) && isNum(q.atVolume) && q.atVolume > maxTitrantVolume(q)) errors.push(`${where}: atVolume is beyond the largest volume students can add.`);
  },

  blank(base) {
    return {
      ...base, text: 'Titrate 25.0 mL of HCl with NaOH. Record the equivalence-point volume and the pH there.',
      analyte: { type: 'acid', kind: 'strong', conc: 0.1, volumeMl: 25 }, titrant: { conc: 0.1 },
      ask: 'both', volumeTolerance: 0.5, phTolerance: 0.3, partialCredit: true,
    };
  },

  isAnswered: (q, answer) => isObj(answer) && ((asks(q).volume && str(answer.volume).trim() !== '') || (asks(q).ph && str(answer.ph).trim() !== '')),

  score(q, answer) {
    if (!isObj(answer)) return { fraction: 0, full: false };
    const want = asks(q);
    const key = keyValues(q);
    const checks = [];
    if (want.volume) checks.push(withinTolerance(parseVolume(answer.volume), key.volume, q.volumeTolerance, 'absolute'));
    if (want.ph) checks.push(withinTolerance(parseNum(answer.ph), key.ph, q.phTolerance, 'absolute'));
    if (!checks.length) return { fraction: 0, full: false };
    const right = checks.filter(Boolean).length;
    if (right === checks.length) return { fraction: 1, full: true };
    return { fraction: q.partialCredit === false ? 0 : right / checks.length, full: false };
  },

  answerText(q, answer) {
    const a = isObj(answer) ? answer : {};
    const want = asks(q);
    const parts = [];
    if (want.volume) parts.push(`volume ${str(a.volume).trim() ? `${str(a.volume).trim()} mL` : DASH}`);
    if (want.ph) parts.push(`pH ${str(a.ph).trim() || DASH}`);
    return parts.join('; ');
  },

  keyText(q) {
    const want = asks(q);
    const key = keyValues(q);
    const parts = [];
    if (want.volume) parts.push(`volume ${fmt(key.volume, 2)} mL (± ${q.volumeTolerance})`);
    if (want.ph) parts.push(`pH ${fmt(key.ph, 2)} (± ${q.phTolerance})`);
    return parts.join('; ');
  },

  correctAnswer(q) {
    const key = keyValues(q);
    const want = asks(q);
    const out = {};
    if (want.volume) out.volume = Number(key.volume.toFixed(2));
    if (want.ph) out.ph = Number(key.ph.toFixed(2));
    return out;
  },
};

registerType(def);
export default def;
