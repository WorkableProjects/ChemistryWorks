// Electron-configuration parsing and comparison. Pure functions, no DOM.
//   parseConfig("[Ne] 3s1")      -> Map { "1s" => 2, "2s" => 2, "2p" => 6, "3s" => 1 }   (null when it cannot be read)
//   configsEqual(a, b)           -> true when both parse and have the same orbital -> count map (order does not matter)

const SUP_DIGITS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

// Noble-gas cores, written as the orbitals added on top of the previous core.
const CORE_STEPS = {
  He: [null, '1s2'],
  Ne: ['He', '2s2 2p6'],
  Ar: ['Ne', '3s2 3p6'],
  Kr: ['Ar', '4s2 3d10 4p6'],
  Xe: ['Kr', '5s2 4d10 5p6'],
  Rn: ['Xe', '6s2 4f14 5d10 6p6'],
};

function addTokens(map, text) {
  for (const t of text.split(/\s+/).filter(Boolean)) {
    const m = /^([1-9])([spdf])(\d+)$/.exec(t);
    map.set(m[1] + m[2], (map.get(m[1] + m[2]) || 0) + Number(m[3]));
  }
}

/** Orbital -> count map of a noble-gas core ("Ne" -> 1s2 2s2 2p6). */
export function coreConfig(symbol) {
  const step = CORE_STEPS[symbol];
  if (!step) return null;
  const map = step[0] ? coreConfig(step[0]) : new Map();
  addTokens(map, step[1]);
  return map;
}

/** Superscript digits -> ^digits, so "2p⁶" and "2p^6" read the same. */
function plainDigits(text) {
  return String(text ?? '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => '^' + [...run].map((c) => SUP_DIGITS[c]).join(''))
    .replace(/[−–—]/g, '-');
}

/** Trim and collapse spaces; accept superscript digits and ^; returns the tokens (cores kept as "[Ne]"). */
function tokenize(input) {
  let s = plainDigits(input).trim();
  s = s.replace(/\^\{(\d+)\}/g, '^$1');
  // "1s^22s^2" -> a new orbital starts at a digit that follows a complete "^<digits>" only when digits are ambiguous;
  // students separate orbitals with spaces, so only split where a superscript run was followed directly by a digit.
  s = s.replace(/(\^\d{1,2})(?=[1-9][spdf])/gi, '$1 ');
  s = s.replace(/\]\s*(?=\S)/g, '] ').replace(/\s*\[/g, ' [');
  return s.split(/\s+/).filter(Boolean);
}

/** Parse a configuration into an orbital -> electron-count Map, or null when it is not a configuration. */
export function parseConfig(input) {
  const tokens = tokenize(input);
  if (!tokens.length) return null;
  const map = new Map();
  for (const tok of tokens) {
    const core = /^\[([A-Za-z]{1,2})\]$/.exec(tok);
    if (core) {
      const sym = core[1][0].toUpperCase() + core[1].slice(1).toLowerCase();
      const c = coreConfig(sym);
      if (!c) return null;
      for (const [k, v] of c) map.set(k, (map.get(k) || 0) + v);
      continue;
    }
    const m = /^([1-9])([spdfSPDF])(?:\^?(\d{1,2}))?$/.exec(tok);
    if (!m) return null;
    const key = m[1] + m[2].toLowerCase();
    map.set(key, (map.get(key) || 0) + (m[3] === undefined ? 1 : Number(m[3])));
  }
  for (const [k, v] of [...map]) if (v === 0) map.delete(k);
  return map.size ? map : null;
}

export function configsEqual(a, b) {
  const x = parseConfig(a);
  const y = parseConfig(b);
  if (!x || !y || x.size !== y.size) return false;
  for (const [k, v] of x) if (y.get(k) !== v) return false;
  return true;
}

/** True when `input` equals any of the accepted answers. */
export function matchesAny(input, answers) {
  const x = parseConfig(input);
  if (!x) return false;
  return (Array.isArray(answers) ? answers : [answers]).some((a) => configsEqual(input, a));
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML with the electron counts as superscripts: "2p6" -> 2p<sup>6</sup>. Input is escaped. */
export function configToHTML(input) {
  return tokenize(input).map((tok) => {
    const m = /^([1-9][spdfSPDF])\^?(\d{1,2})$/.exec(tok);
    return m ? `${esc(m[1])}<sup>${m[2]}</sup>` : esc(tok);
  }).join(' ');
}

/** Plain text with unicode superscripts: "2p6" -> "2p⁶" (for text-only displays). */
export function configToText(input) {
  return tokenize(input).map((tok) => {
    const m = /^([1-9][spdfSPDF])\^?(\d{1,2})$/.exec(tok);
    return m ? m[1] + [...m[2]].map((d) => SUPERSCRIPT[Number(d)]).join('') : tok;
  }).join(' ');
}
