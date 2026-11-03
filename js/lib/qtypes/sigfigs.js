// Significant-figure counting for the `sigfigs` question type (V3-05). Pure functions, no DOM.
//   countSigFigs("0.00450") -> 3     countSigFigs("4.50e-3") -> 3     countSigFigs("1500") -> 2 (ambiguous zeros)

const SUP_MAP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺' };

/** Split "4.50e-3" / "4.50 × 10^-3" into { mantissa: "4.50", exponent: -3 }; plain numbers have exponent 0. null if not a number. */
export function splitNumber(input) {
  if (typeof input === 'number') input = String(input);
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/[−–]/g, '-');
  if (!s) return null;
  s = s.replace(/\s*([x×*⋅·])\s*(?=10)/i, '$1').replace(/(10)\s*\^\s*/, '$1^');
  if (/\s/.test(s)) return null;
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (run) => '^' + [...run].map((c) => SUP_MAP[c]).join(''));
  let mant = s;
  let exp = 0;
  const m = /^([+-]?[\d.,]+)(?:[x×*⋅·]10\^?|e)([+-]?\d+)$/i.exec(s);
  if (m) { mant = m[1]; exp = Number(m[2]); }
  mant = mant.replace(/^[+-]/, '');
  if (mant.includes(',')) {
    if (!/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(mant)) return null;
    mant = mant.replace(/,/g, '');
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(mant)) return null;
  return { mantissa: mant, exponent: exp };
}

/**
 * Number of significant figures in what the student typed, or null when it is not a number.
 * Leading zeros never count; zeros after a decimal point count; trailing zeros of an integer written without a
 * decimal point are ambiguous and are treated as not significant. An all-zero number counts as 1.
 */
export function countSigFigs(input) {
  const parts = splitNumber(input);
  if (!parts) return null;
  const { mantissa } = parts;
  const hasPoint = mantissa.includes('.');
  let digits = mantissa.replace('.', '').replace(/^0+/, '');
  if (!digits) return 1;
  if (!hasPoint) digits = digits.replace(/0+$/, '');
  return digits.length || 1;
}

/** Value rounded to `n` significant figures as text: 0.0045 -> "0.00450", 4500 (n=2) -> "4.5 × 10³". */
export function formatWithSigFigs(value, n) {
  const x = Number(value);
  const sf = Math.min(100, Math.max(1, Math.round(Number(n)) || 1));
  if (!Number.isFinite(x)) return String(value);
  const p = x.toPrecision(sf);
  if (!/e/i.test(p)) return p;
  const [mant, exp] = p.split(/e/i);
  const e = String(Number(exp));
  return `${mant} × 10${[...e].map((c) => SUPERSCRIPT[c] ?? c).join('')}`;
}
