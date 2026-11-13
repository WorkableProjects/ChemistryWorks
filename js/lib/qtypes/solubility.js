// `solubility` question type: solubility rules. Pure definition, no DOM.
//   mode 'state':       each compound is marked solid (s) or aqueous (aq).
//   mode 'precipitate': the student picks the one compound that forms a precipitate (s).
//   { type: 'solubility', mode: 'state'|'precipitate',
//     items: [{ id, formula, state?: 's'|'aq', cation?: 'Ag', anion?: 'Cl' }] }
//   When `state` is blank the key comes from the simplified rules table below (needs cation and anion).
//   Answer: { [itemId]: 's'|'aq' } (mode 'state')  or  { precipitate: itemId } (mode 'precipitate')
//   Score: per item (state) or all-or-nothing (precipitate). partialCredit: false gives 0 unless all right.
import { registerType } from './registry.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
export const MODES = ['state', 'precipitate'];
export const MODE_LABELS = { state: 'Mark each compound solid (s) or aqueous (aq)', precipitate: 'Pick the precipitate' };
export const STATES = ['s', 'aq'];
const DASH = '—';

// Simplified school rules (first match wins). Teachers can override any item with an explicit state.
const GROUP1 = ['Li', 'Na', 'K', 'Rb', 'Cs'];
const SOLUBLE_CATIONS = [...GROUP1, 'NH4'];
const SOLUBLE_ANIONS = ['NO3', 'C2H3O2', 'CH3COO', 'ClO3', 'ClO4'];
const HALIDE_EXCEPTIONS = ['Ag', 'Pb', 'Hg2'];
const SULFATE_EXCEPTIONS = ['Ba', 'Sr', 'Pb', 'Hg2'];
const INSOLUBLE_ANIONS = ['CO3', 'PO4', 'S', 'OH'];
const SOLUBLE_WITH_ALKALINE_EARTH = { S: ['Ca', 'Sr', 'Ba'], OH: ['Ba', 'Sr'] };

/** 's' or 'aq' from the rules table, or null when the rules do not decide (or ions are missing). */
export function ruleState(cation, anion) {
  const c = str(cation), a = str(anion);
  if (!c || !a) return null;
  if (SOLUBLE_CATIONS.includes(c) || SOLUBLE_ANIONS.includes(a)) return 'aq';
  if (['Cl', 'Br', 'I'].includes(a)) return HALIDE_EXCEPTIONS.includes(c) ? 's' : 'aq';
  if (a === 'SO4') return SULFATE_EXCEPTIONS.includes(c) ? 's' : 'aq';
  if (INSOLUBLE_ANIONS.includes(a)) return (SOLUBLE_WITH_ALKALINE_EARTH[a] || []).includes(c) ? 'aq' : 's';
  return null;
}

/** The key state for one item: its explicit state, else the rules table. Null when neither decides. */
export function itemState(item) {
  if (!isObj(item)) return null;
  if (STATES.includes(item.state)) return item.state;
  return ruleState(item.cation, item.anion);
}

/** Items with ids and a resolved key, or null when any item cannot be resolved. */
export function keyOf(q) {
  const items = Array.isArray(q.items) ? q.items : [];
  const out = [];
  for (const it of items) {
    const st = itemState(it);
    if (!st) return null;
    out.push({ id: str(it.id), formula: str(it.formula), state: st });
  }
  return out;
}

const stateText = (s) => (STATES.includes(s) ? s : DASH);

export const def = {
  type: 'solubility',
  label: 'Solubility rules',
  shortLabel: 'Solubility',
  group: 'Chemistry',
  v5: true,

  normalize(q) {
    q.mode = MODES.includes(q.mode) ? q.mode : 'state';
    q.items = (Array.isArray(q.items) ? q.items : []).filter(isObj).map((it) => {
      const out = { id: str(it.id), formula: str(it.formula) };
      if (STATES.includes(it.state)) out.state = it.state;
      if (str(it.cation)) out.cation = str(it.cation);
      if (str(it.anion)) out.anion = str(it.anion);
      return out;
    });
    q.partialCredit = q.partialCredit === undefined ? true : Boolean(q.partialCredit);
  },

  validate(q, where, errors) {
    if (!MODES.includes(q.mode)) errors.push(`${where}: choose a mode.`);
    const items = Array.isArray(q.items) ? q.items : [];
    if (items.length < 1) errors.push(`${where}: add at least one compound.`);
    const ids = new Set();
    items.forEach((it, i) => {
      const at = `${where}, compound ${i + 1}`;
      if (!it.formula) errors.push(`${at}: enter a formula.`);
      if (!it.id) errors.push(`${at}: each compound needs an id.`);
      else if (ids.has(it.id)) errors.push(`${at}: the id "${it.id}" is used twice.`);
      ids.add(it.id);
      if (!itemState(it)) errors.push(`${at}: choose solid or aqueous, or give the cation and anion so the rules can decide.`);
    });
    if (q.mode === 'precipitate' && items.length) {
      const solids = items.filter((it) => itemState(it) === 's').length;
      if (solids !== 1) errors.push(`${where}: exactly one compound must be a precipitate (found ${solids}).`);
    }
  },

  blank(base) {
    return { ...base, text: 'Mark each compound as solid (s) or aqueous (aq) when the salts are mixed in water.',
      mode: 'state', partialCredit: true,
      items: [
        { id: 'agcl', formula: 'AgCl', cation: 'Ag', anion: 'Cl' },
        { id: 'nacl', formula: 'NaCl', cation: 'Na', anion: 'Cl' },
        { id: 'baso4', formula: 'BaSO4', cation: 'Ba', anion: 'SO4' },
      ] };
  },

  isAnswered(q, a) {
    if (!isObj(a)) return false;
    if (q.mode === 'precipitate') return str(a.precipitate) !== '';
    return Object.values(a).some((v) => STATES.includes(v));
  },

  score(q, a) {
    const key = keyOf(q);
    if (!key || !key.length) return { fraction: 0, full: false };
    const x = isObj(a) ? a : {};
    if (q.mode === 'precipitate') {
      const solid = key.find((k) => k.state === 's');
      const ok = !!solid && str(x.precipitate) === solid.id;
      return { fraction: ok ? 1 : 0, full: ok };
    }
    const right = key.filter((k) => x[k.id] === k.state).length;
    if (right === key.length) return { fraction: 1, full: true };
    return { fraction: q.partialCredit === false ? 0 : right / key.length, full: false };
  },

  answerText(q, a) {
    const x = isObj(a) ? a : {};
    const items = Array.isArray(q.items) ? q.items : [];
    if (q.mode === 'precipitate') {
      const it = items.find((i) => i.id === str(x.precipitate));
      return it ? `${it.formula} (precipitate)` : DASH;
    }
    const parts = items.map((it) => `${it.formula}: ${stateText(x[it.id])}`);
    return parts.length ? parts.join(', ') : DASH;
  },

  keyText(q) {
    const key = keyOf(q);
    if (!key) return DASH;
    if (q.mode === 'precipitate') {
      const s = key.find((k) => k.state === 's');
      return s ? `${s.formula} (precipitate)` : DASH;
    }
    return key.map((k) => `${k.formula}: ${k.state}`).join(', ');
  },

  correctAnswer(q) {
    const key = keyOf(q) || [];
    if (q.mode === 'precipitate') {
      const s = key.find((k) => k.state === 's');
      return s ? { precipitate: s.id } : {};
    }
    return Object.fromEntries(key.map((k) => [k.id, k.state]));
  },
};

registerType(def);
export default def;
