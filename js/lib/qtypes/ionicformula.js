// `ionicformula` question type: build an ionic compound from a bank of ions. Pure definition, no DOM.
//   { type: 'ionicformula', ions: [{ id: 'Ca2+', symbol: 'Ca', charge: 2, name: 'calcium' }, ...],
//     cation: 'Ca2+', anion: 'Cl-'         // the target pair (ion ids); the key is their lowest-ratio formula
//     askName: false, targetName?: 'calcium chloride' (default: "<cation name> <anion name>"),
//     targets?: [{ cation, anion }, ...]   // algorithmic: each student is given one of these (picked per student)
//   }
//   Answer: { cation: id, anion: id, nCation: 2, nAnion: 1, name?: '...' }.
//   Score: formula 1 (or 0.5 when askName) + name 0.5. Formula right = the target ions in the lowest ratio.
import { registerType } from './registry.js';
import { addInstantiateStep } from '../instantiate-steps.js';
import { namingMatches } from './naming.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const DASH = '—';

/** Common ions offered in the editor. */
export const COMMON_IONS = [
  { symbol: 'H', charge: 1, name: 'hydrogen' }, { symbol: 'Li', charge: 1, name: 'lithium' },
  { symbol: 'Na', charge: 1, name: 'sodium' }, { symbol: 'K', charge: 1, name: 'potassium' },
  { symbol: 'Ag', charge: 1, name: 'silver' }, { symbol: 'NH4', charge: 1, name: 'ammonium' },
  { symbol: 'Mg', charge: 2, name: 'magnesium' }, { symbol: 'Ca', charge: 2, name: 'calcium' },
  { symbol: 'Ba', charge: 2, name: 'barium' }, { symbol: 'Zn', charge: 2, name: 'zinc' },
  { symbol: 'Cu', charge: 2, name: 'copper(II)' }, { symbol: 'Fe', charge: 2, name: 'iron(II)' },
  { symbol: 'Pb', charge: 2, name: 'lead(II)' }, { symbol: 'Al', charge: 3, name: 'aluminium' },
  { symbol: 'Fe', charge: 3, name: 'iron(III)' },
  { symbol: 'F', charge: -1, name: 'fluoride' }, { symbol: 'Cl', charge: -1, name: 'chloride' },
  { symbol: 'Br', charge: -1, name: 'bromide' }, { symbol: 'I', charge: -1, name: 'iodide' },
  { symbol: 'OH', charge: -1, name: 'hydroxide' }, { symbol: 'NO3', charge: -1, name: 'nitrate' },
  { symbol: 'C2H3O2', charge: -1, name: 'acetate' }, { symbol: 'HCO3', charge: -1, name: 'hydrogen carbonate' },
  { symbol: 'O', charge: -2, name: 'oxide' }, { symbol: 'S', charge: -2, name: 'sulfide' },
  { symbol: 'SO4', charge: -2, name: 'sulfate' }, { symbol: 'CO3', charge: -2, name: 'carbonate' },
  { symbol: 'N', charge: -3, name: 'nitride' }, { symbol: 'PO4', charge: -3, name: 'phosphate' },
];

/** Id for a bank ion: "Ca2+", "Cl-", "SO42-". */
export function ionId(ion) {
  const c = Number(ion && ion.charge) || 0;
  return `${str(ion && ion.symbol).trim()}${Math.abs(c) > 1 ? Math.abs(c) : ''}${c > 0 ? '+' : '-'}`;
}
/** Ion text with its charge for formulaToHTML, e.g. "SO4^2-". */
export function ionLabel(ion) {
  const c = Number(ion && ion.charge) || 0;
  return `${str(ion && ion.symbol)}^${Math.abs(c) > 1 ? Math.abs(c) : ''}${c > 0 ? '+' : '-'}`;
}
/** More than one atom (NH4, SO4, Hg2): written in parentheses when there is more than one of it. */
export const isPolyatomic = (ion) => /[A-Z][a-z]?\d|[A-Z][a-z]?.*[A-Z]/.test(str(ion && ion.symbol));

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
export const findIon = (q, id) => (Array.isArray(q && q.ions) ? q.ions.find((i) => i.id === id) : undefined);

/** Lowest-ratio counts that balance a cation and an anion. */
export function balancedCounts(cation, anion) {
  const a = Math.abs(Number(cation && cation.charge)) || 0;
  const b = Math.abs(Number(anion && anion.charge)) || 0;
  if (!a || !b) return { nCation: 0, nAnion: 0 };
  const g = gcd(a, b);
  return { nCation: b / g, nAnion: a / g };
}

const part = (ion, n) => {
  if (!ion || !(n > 0)) return '';
  const sym = n > 1 && isPolyatomic(ion) ? `(${ion.symbol})` : str(ion.symbol);
  return n > 1 ? `${sym}${n}` : sym;
};
/** Formula text, cation first: "Ca(OH)2". Empty when nothing is placed. */
export function formulaOf(cation, anion, nCation, nAnion) {
  return part(cation, nCation) + part(anion, nAnion);
}

/** The key formula ("Al2O3") from the target ions in the lowest ratio; '' when the target is not set. */
export function keyFormula(q) {
  const cation = findIon(q, q.cation);
  const anion = findIon(q, q.anion);
  if (!cation || !anion) return '';
  const n = balancedCounts(cation, anion);
  return formulaOf(cation, anion, n.nCation, n.nAnion);
}
/** The key name: the teacher's own, else "<cation name> <anion name>". */
export function keyName(q) {
  if (str(q.targetName).trim()) return q.targetName.trim();
  const cation = findIon(q, q.cation);
  const anion = findIon(q, q.anion);
  return cation && anion ? `${str(cation.name).trim()} ${str(anion.name).trim()}`.trim() : '';
}

/** Student's formula text from their answer (cation first). */
export function answerFormula(q, answer) {
  if (!isObj(answer)) return '';
  return formulaOf(findIon(q, answer.cation), findIon(q, answer.anion), Number(answer.nCation) || 0, Number(answer.nAnion) || 0);
}

/** True when the answer is the target pair in a ratio that reduces to the lowest ratio. */
export function formulaRight(q, answer) {
  if (!isObj(answer) || answer.cation !== q.cation || answer.anion !== q.anion) return false;
  const k = balancedCounts(findIon(q, q.cation), findIon(q, q.anion));
  const nc = Number(answer.nCation) || 0;
  const na = Number(answer.nAnion) || 0;
  return nc > 0 && na > 0 && k.nCation > 0 && nc * k.nAnion === na * k.nCation;
}

const nameRight = (q, answer) => namingMatches({ direction: 'toName', answers: [keyName(q)] }, isObj(answer) ? str(answer.name) : '');

export const def = {
  type: 'ionicformula',
  label: 'Ionic compound builder',
  shortLabel: 'Ionic compound',
  group: 'Chemistry',
  v5: true,

  normalize(q) {
    q.ions = (Array.isArray(q.ions) ? q.ions : []).filter(isObj).map((i) => {
      const o = { symbol: str(i.symbol).trim(), charge: Math.trunc(Number(i.charge)) || 0, name: str(i.name).trim() };
      o.id = o.symbol && o.charge ? ionId(o) : str(i.id);
      return o;
    });
    q.cation = str(q.cation);
    q.anion = str(q.anion);
    q.askName = Boolean(q.askName);
    q.targetName = str(q.targetName).trim();
    if (!q.targetName) delete q.targetName;
    if (Array.isArray(q.targets)) {
      q.targets = q.targets.filter(isObj).map((t) => ({ cation: str(t.cation), anion: str(t.anion) }));
      if (!q.targets.length) delete q.targets;
    } else delete q.targets;
  },

  validate(q, where, errors) {
    const ids = new Set();
    q.ions.forEach((i, n) => {
      if (!i.symbol) errors.push(`${where}: ion ${n + 1} needs a formula (for example "SO4").`);
      if (!i.charge) errors.push(`${where}: ion ${n + 1} needs a charge that is not 0.`);
      if (ids.has(i.id)) errors.push(`${where}: the ion ${i.id} is in the bank twice.`);
      ids.add(i.id);
    });
    if (!q.ions.some((i) => i.charge > 0) || !q.ions.some((i) => i.charge < 0)) errors.push(`${where}: the ion bank needs at least one cation (positive) and one anion (negative).`);
    const checkPair = (c, a, label) => {
      const ci = findIon(q, c);
      const ai = findIon(q, a);
      if (!ci || ci.charge < 0) errors.push(`${where}: ${label} needs a cation from the ion bank.`);
      if (!ai || ai.charge > 0) errors.push(`${where}: ${label} needs an anion from the ion bank.`);
    };
    checkPair(q.cation, q.anion, 'the target compound');
    (q.targets || []).forEach((t, n) => checkPair(t.cation, t.anion, `random target ${n + 1}`));
    if (q.askName && !keyName(q)) errors.push(`${where}: type the compound name, or give every ion a name.`);
  },

  blank(base) {
    const ions = [{ symbol: 'Na', charge: 1, name: 'sodium' }, { symbol: 'Ca', charge: 2, name: 'calcium' }, { symbol: 'Cl', charge: -1, name: 'chloride' }, { symbol: 'OH', charge: -1, name: 'hydroxide' }]
      .map((i) => ({ ...i, id: ionId(i) }));
    return { ...base, text: 'Build the ionic compound that forms from these ions.', ions, cation: 'Ca2+', anion: 'OH-', askName: false };
  },

  isAnswered: (q, answer) => isObj(answer) && (Boolean(answer.cation || answer.anion) || str(answer.name).trim() !== ''),

  score(q, answer) {
    if (!isObj(answer)) return { fraction: 0, full: false };
    const f = formulaRight(q, answer);
    if (!q.askName) return { fraction: f ? 1 : 0, full: f };
    const fraction = (f ? 0.5 : 0) + (nameRight(q, answer) ? 0.5 : 0);
    return { fraction, full: fraction === 1 };
  },

  answerText(q, answer) {
    if (!isObj(answer)) return DASH;
    return [answerFormula(q, answer), str(answer.name).trim()].filter(Boolean).join(' — ') || DASH;
  },

  keyText(q) {
    const f = keyFormula(q);
    if (!f) return DASH;
    return q.askName && keyName(q) ? `${f} — ${keyName(q)}` : f;
  },

  correctAnswer(q) {
    const out = { formula: keyFormula(q) };
    if (q.askName) out.name = keyName(q);
    return out;
  },
};

// Algorithmic: when `targets` is set, each student is given one of them (seeded, same on every device).
addInstantiateStep('ionicformula-targets', (test, { rand }) => {
  for (const q of (test && test.questions) || []) {
    if (q && q.type === 'ionicformula' && Array.isArray(q.targets) && q.targets.length) {
      const t = q.targets[Math.min(q.targets.length - 1, Math.floor(rand() * q.targets.length))];
      q.cation = t.cation;
      q.anion = t.anion;
      delete q.targetName;
    }
  }
});

registerType(def);
export default def;
