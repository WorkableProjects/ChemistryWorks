// `categorize`: sort each item into its group. Answer: { itemId: categoryId }. Also the pure helpers for that type.
import { registerType } from './registry.js';
import { str, bool, nonEmptyStr } from './shared.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** True when at least one item has been put in a category. */
export function isCategorizeAnswered(answer) {
  return isObj(answer) && Object.values(answer).some((v) => v !== null && v !== undefined && String(v).trim() !== '');
}

/** { fraction, full } for a categorize answer. partialCredit (default true) gives the fraction of items placed correctly. */
export function scoreCategorize(q, answer) {
  const items = Array.isArray(q.items) ? q.items : [];
  if (!items.length || !isObj(answer)) return { fraction: 0, full: false };
  let right = 0;
  for (const it of items) {
    if (answer[it.id] !== undefined && answer[it.id] !== null && String(answer[it.id]) === String(it.category)) right++;
  }
  if (right === items.length) return { fraction: 1, full: true };
  return { fraction: q.partialCredit === false ? 0 : right / items.length, full: false };
}

const labelOf = (q, id) => {
  const c = (q.categories || []).find((x) => String(x.id) === String(id));
  return c ? String(c.label) : String(id);
};

/** "NaCl → Ionic; H2O → Covalent; Fe → (not sorted)" for a student answer. */
export function categorizeText(q, answer) {
  const a = isObj(answer) ? answer : {};
  return (q.items || []).map((it) => {
    const v = a[it.id];
    const has = v !== undefined && v !== null && String(v).trim() !== '';
    return `${it.text} → ${has ? labelOf(q, v) : '—'}`;
  }).join('; ');
}

/** The answer key as text. */
export function categorizeKeyText(q) {
  return (q.items || []).map((it) => `${it.text} → ${labelOf(q, it.category)}`).join('; ') || '—';
}

export const def = {
  type: 'categorize',
  label: 'Sort into groups',
  shortLabel: 'Sort into groups',
  group: 'Match & sort',
  manual: false,
  layout: 'wide',

  normalize(q) {
    q.categories = (Array.isArray(q.categories) ? q.categories : []).map((c) => {
      const src = isObj(c) ? c : { id: c, label: c };
      return { ...src, id: str(src.id).trim(), label: str(src.label !== undefined ? src.label : src.text) };
    });
    q.items = (Array.isArray(q.items) ? q.items : []).map((it) => {
      const src = isObj(it) ? it : { id: it, text: it };
      return { ...src, id: str(src.id).trim(), text: str(src.text), category: str(src.category).trim() };
    });
    q.partialCredit = bool(q.partialCredit, true);
  },

  validate(q, where, errors) {
    const cats = Array.isArray(q.categories) ? q.categories : [];
    const catIds = new Set();
    if (cats.length < 2) errors.push(`${where}: categorize needs at least 2 categories.`);
    cats.forEach((c, i) => {
      if (!isObj(c) || !nonEmptyStr(c.id)) { errors.push(`${where}: category ${i + 1} needs an id.`); return; }
      if (!nonEmptyStr(c.label)) errors.push(`${where}: category ${i + 1} needs a label.`);
      if (catIds.has(c.id)) errors.push(`${where}: duplicate category id "${c.id}".`);
      catIds.add(c.id);
    });
    const items = Array.isArray(q.items) ? q.items : [];
    if (items.length < 1) errors.push(`${where}: categorize needs at least 1 item.`);
    const itemIds = new Set();
    items.forEach((it, i) => {
      if (!isObj(it) || !nonEmptyStr(it.id)) { errors.push(`${where}: item ${i + 1} needs an id.`); return; }
      if (!nonEmptyStr(it.text)) errors.push(`${where}: item ${i + 1} has empty text.`);
      if (itemIds.has(it.id)) errors.push(`${where}: duplicate item id "${it.id}".`);
      itemIds.add(it.id);
      if (!catIds.has(it.category)) errors.push(`${where}: item ${i + 1} ("${it.id}") category "${it.category}" is not one of the categories.`);
    });
  },

  blank: (base) => ({
    ...base,
    text: 'Sort each compound into the type of bonding it has.',
    partialCredit: true,
    categories: [{ id: 'ionic', label: 'Ionic' }, { id: 'covalent', label: 'Covalent' }],
    items: [{ id: 'i1', text: 'NaCl', category: 'ionic' }, { id: 'i2', text: 'H2O', category: 'covalent' }],
  }),

  isAnswered: (q, answer) => isCategorizeAnswered(answer),

  grade: (q, answer) => scoreCategorize(q, answer),

  format: (q, answer) => categorizeText(q, answer),

  keyText: (q) => categorizeKeyText(q),

  correctAnswer: (q) => Object.fromEntries((q.items || []).map((it) => [it.id, it.category])),
};

registerType(def);
export default def;
