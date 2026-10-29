// Chemical formula helpers. Pure functions, no DOM.

const SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const SUP_MAP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };

// A charge sign is a trailing "+"/"-" that ends a species (end of string, whitespace, ".", ",", ";", "(", ")" , "]" or an arrow).
const BOUNDARY = '(?=$|\\s|[.,;()\\]]|->|=)';

/**
 * Convert unicode sub/superscripts and minus, hydrate dots; canonicalize charge notation to "^<n><sign>".
 * Whitespace is preserved (callers decide whether to strip it).
 */
function canonicalize(input) {
  let s = String(input ?? '');
  s = s.replace(/[₀-₉]/g, (c) => String(SUB_DIGITS.indexOf(c)));
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (run) => '^' + [...run].map((c) => SUP_MAP[c]).join(''));
  s = s.replace(/[−–—]/g, '-');
  s = s.replace(/[·•∙*]/g, '.');

  const charge = (n, sign) => '^' + (n && n !== '1' ? n : '') + sign;
  // ^2-  ^{2-}  ^2−
  s = s.replace(/\^\{?(\d+)([+-])\}?/g, (_, n, sg) => charge(n, sg));
  // ^-2  ^{-2}
  s = s.replace(/\^\{?([+-])(\d+)\}?/g, (_, sg, n) => charge(n, sg));
  // ^+  ^-  ^{+}
  s = s.replace(/\^\{?([+-])\}?/g, (_, sg) => '^' + sg);
  // {2-}  {-2}  {+}
  s = s.replace(/\{(\d+)([+-])\}/g, (_, n, sg) => charge(n, sg));
  s = s.replace(/\{([+-])(\d+)\}/g, (_, sg, n) => charge(n, sg));
  s = s.replace(/\{([+-])\}/g, (_, sg) => '^' + sg);
  // Space-separated charge: "SO4 2-" -> "SO4^2-" (digits required so " + " in equations is untouched)
  s = s.replace(/(\S)\s+(\d+)([+-])(?=$|[\s.,;)\]])/g, (_, head, n, sg) => head + charge(n, sg));
  // Implicit trailing charge with digits. Multi-digit runs: last digit is the charge ("SO42-" -> "SO4^2-",
  // "PO43-" -> "PO4^3-"). A single digit is a charge only on a monatomic species ("Fe3+", "O2-");
  // otherwise it is a subscript with a 1+/1- charge ("NH4+" -> "NH4^+", "H3O+" -> "H3O^+").
  s = s.replace(new RegExp('([A-Za-z0-9()\\[\\]]*[A-Za-z)\\]])(\\d+)([+-])' + BOUNDARY, 'g'), (_, head, n, sg) => {
    if (n.length > 1) return head + n.slice(0, -1) + charge(n.slice(-1), sg);
    if (/^[A-Z][a-z]?$/.test(head.replace(/^\d+/, ''))) return head + charge(n, sg);
    return head + n + '^' + sg;
  });
  // Implicit trailing single charge: "Na+" -> "Na^+", "Cl-" -> "Cl^-"
  s = s.replace(new RegExp('(?<!\\^)([A-Za-z0-9)\\]])([+-])' + BOUNDARY, 'g'), (_, head, sg) => head + '^' + sg);
  return s;
}

export function normalizeFormula(str) {
  return canonicalize(str).replace(/\s+/g, '');
}

function escapeHtml(ch) {
  switch (ch) {
    case '&': return '&amp;';
    case '<': return '&lt;';
    case '>': return '&gt;';
    case '"': return '&quot;';
    case "'": return '&#39;';
    default: return ch;
  }
}

export function formulaToHTML(str) {
  const s = canonicalize(str).trim();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '^') {
      const m = /^\^(\d*)([+-])/.exec(s.slice(i));
      if (m) {
        out += `<sup>${m[1]}${m[2] === '-' ? '−' : '+'}</sup>`;
        i += m[0].length;
        continue;
      }
      out += '^';
      i++;
      continue;
    }
    if (/\d/.test(ch)) {
      const prev = i > 0 ? s[i - 1] : '';
      let j = i;
      while (j < s.length && /\d/.test(s[j])) j++;
      const digits = s.slice(i, j);
      if (/[A-Za-z)\]]/.test(prev)) out += `<sub>${digits}</sub>`;
      else out += digits;
      i = j;
      continue;
    }
    if (ch === '-' && s[i + 1] === '>') { out += ' → '; i += 2; continue; }
    out += ch === '.' ? '·' : escapeHtml(ch);
    i++;
  }
  return out;
}

export function formulaToLatex(str) {
  const body = normalizeFormula(str).replace(/\./g, '*').replace(/[\\{}]/g, (c) => '\\' + c);
  return `\\ce{${body}}`;
}

export function formulasEqual(a, b, { caseSensitive = true } = {}) {
  let x = normalizeFormula(a);
  let y = normalizeFormula(b);
  if (!caseSensitive) { x = x.toLowerCase(); y = y.toLowerCase(); }
  return x === y;
}
