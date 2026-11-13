// Pure helpers for the `categorize` question type. Answer shape: { itemId: categoryId }.

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
