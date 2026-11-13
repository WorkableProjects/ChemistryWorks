// Grading helpers for the `balance` question type. Pure functions, no DOM.

const isPosInt = (n) => Number.isInteger(n) && n > 0;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

/** Normalize a stored answer to an array of whole numbers (blank / junk = 0), padded or cut to `length`. */
export function coefficientsFrom(answer, length) {
  const src = Array.isArray(answer) ? answer : [];
  return Array.from({ length }, (_, i) => {
    const v = src[i];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim()) : 0;
    return Number.isFinite(n) ? n : 0;
  });
}

/** Lowest whole-number ratio of a coefficient list: [4, 2, 4] -> [2, 1, 2]. */
export function lowestRatio(list) {
  const g = list.reduce((a, b) => gcd(a, b), 0);
  return g > 1 ? list.map((n) => n / g) : list.slice();
}

export function isBalanceAnswered(answer) {
  return Array.isArray(answer) && answer.some((v) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : 0;
    return Number.isFinite(n) && n > 0;
  });
}

/** { fraction, full } for a balance question. */
export function scoreBalance(q, answer) {
  const key = Array.isArray(q.coefficients) ? q.coefficients.map(Number) : [];
  if (!key.length || !key.every(isPosInt)) return { fraction: 0, full: false };
  const ans = coefficientsFrom(answer, key.length);
  const lowest = lowestRatio(key);
  const allPos = ans.every(isPosInt);
  let full = allPos && ans.every((n, i) => n === key[i]);
  if (!full && q.allowMultiples && allPos) {
    const k = ans[0] / lowest[0];
    full = isPosInt(k) && ans.every((n, i) => n === k * lowest[i]);
  }
  if (full) return { fraction: 1, full: true };
  if (!q.partialCredit) return { fraction: 0, full: false };
  let best = 0;
  const ks = q.allowMultiples ? Array.from({ length: Math.max(1, ...ans) }, (_, i) => i + 1) : [null];
  for (const k of ks) {
    const ref = k === null ? key : lowest.map((n) => n * k);
    best = Math.max(best, ans.filter((n, i) => n === ref[i]).length);
  }
  return { fraction: best / key.length, full: false };
}

/** Equation as text: "2 H2 + O2 → 2 H2O" (a coefficient of 1 is left out; blanks show as "_"). */
export function equationText(q, coefficients, { showOnes = false } = {}) {
  const r = Array.isArray(q.reactants) ? q.reactants : [];
  const p = Array.isArray(q.products) ? q.products : [];
  const c = coefficientsFrom(coefficients, r.length + p.length);
  const term = (f, i) => {
    const n = c[i];
    const pre = n === 0 ? '_ ' : n === 1 && !showOnes ? '' : `${n} `;
    return `${pre}${f}`;
  };
  return `${r.map((f, i) => term(f, i)).join(' + ')} → ${p.map((f, i) => term(f, r.length + i)).join(' + ')}`;
}
