// Read-aloud text preparation (V4-05). Pure: speakableText(text) turns question text into something a speech
// engine says sensibly ("H2O" -> "H two O"); questionSpeech(q) builds the full utterance for a question.

import { ELEMENTS } from '../../lib/elements.js';

const SYMBOLS = new Set(ELEMENTS.map((e) => e.symbol));
const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const SUB = { '₀': 0, '₁': 1, '₂': 2, '₃': 3, '₄': 4, '₅': 5, '₆': 6, '₇': 7, '₈': 8, '₉': 9 };
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };

/** Split "NaCl2" into [['Na'],['Cl'],'2'] pieces, or null when it is not made only of element symbols and digits. */
function parseFormula(word) {
  const parts = [];
  let i = 0;
  while (i < word.length) {
    const ch = word[i];
    if (/\d/.test(ch)) {
      const m = /^\d+/.exec(word.slice(i));
      parts.push({ n: m[0] });
      i += m[0].length;
    } else if (/[A-Z]/.test(ch)) {
      const two = word.slice(i, i + 2);
      if (two.length === 2 && /[a-z]/.test(two[1]) && SYMBOLS.has(two)) { parts.push({ sym: two }); i += 2; } else if (SYMBOLS.has(ch)) { parts.push({ sym: ch }); i++; } else return null;
    } else return null;
  }
  return parts;
}

function sayNumber(n) {
  return n.length === 1 ? DIGIT_WORDS[Number(n)] : n.split('').map((d) => DIGIT_WORDS[Number(d)]).join(' ');
}

function sayFormula(word) {
  const parts = parseFormula(word);
  if (!parts || !parts.some((p) => p.sym)) return null;
  if (parts[0].n) { // leading coefficient: "2H2" -> "two H two"
    const rest = sayFormula(word.slice(parts[0].n.length));
    return rest ? `${sayNumber(parts[0].n)} ${rest}` : null;
  }
  // Plain words with a single capital and no digit ("He", "No", "In") are not formulas.
  const caps = (word.match(/[A-Z]/g) || []).length;
  if (caps < 2 && !/\d/.test(word)) return null;
  return parts.map((p) => (p.sym ? p.sym.split('').join(' ').toUpperCase() : sayNumber(p.n))).join(' ');
}

function sayCharge(s) {
  const m = /^(\d*)([+-])$/.exec(s.trim());
  if (!m) return s;
  const word = m[2] === '+' ? 'plus' : 'minus';
  return m[1] && m[1] !== '1' ? `${sayNumber(m[1])} ${word}` : word;
}

function formulasIn(text) {
  return text.replace(/[A-Za-z0-9]+/g, (w) => sayFormula(w) || w);
}

function carets(t) {
  return t.replace(/\^\{?\s*(-?[\d.]*[+-]?)\s*\}?/g, (m, p) => {
    if (/^\d*[+-]$/.test(p)) return ` ${sayCharge(p)} `;
    return ` to the ${p.replace(/^-/, 'minus ')} `;
  });
}

function mathToSpeech(src) {
  let t = String(src);
  t = t.replace(/\\ce\{([^}]*)\}/g, (_, inner) => ` ${inner} `);
  t = t.replace(/\\(?:rightarrow|longrightarrow|to)\b|->|→/g, ' yields ');
  t = t.replace(/\\(?:rightleftharpoons|leftrightarrow)\b|<=>|⇌/g, ' is in equilibrium with ');
  t = t.replace(/\\times|\\cdot/g, ' times ').replace(/\\div/g, ' divided by ').replace(/\\pm/g, ' plus or minus ');
  t = t.replace(/\\Delta\b|Δ/g, ' delta ').replace(/\\degree|°/g, ' degrees ');
  t = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, ' $1 over $2 ');
  t = t.replace(/\\sqrt\{([^}]*)\}/g, ' square root of $1 ');
  t = carets(t);
  t = t.replace(/_\{?([A-Za-z0-9]+)\}?/g, ' $1');
  t = t.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, '');
  return t;
}

export function speakableText(input) {
  let t = String(input ?? '');
  // $...$ and $$...$$ math: drop delimiters, speak the content.
  t = t.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_, a, b) => ` ${mathToSpeech(a ?? b)} `);
  t = t.replace(/<[^>]+>/g, ' ').replace(/\*\*|__|`/g, '');
  t = t.replace(/[₀-₉]/g, (c) => ` ${DIGIT_WORDS[SUB[c]]} `);
  t = t.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)/g, (m) => {
    const s = m.split('').map((c) => SUP[c]).join('');
    return /^\d*[+-]$/.test(s) ? ` ${sayCharge(s)} ` : ` to the ${sayNumber(s.replace('-', ''))} `;
  });
  t = carets(t);
  t = t.replace(/(\w)\/(\w)/g, '$1 per $2').replace(/\s→\s/g, ' yields ');
  t = formulasIn(t);
  return t.replace(/\s+([,.;:?!])/g, '$1').replace(/\s+/g, ' ').trim();
}

/** Everything a student needs to hear for one question: the prompt, then lettered choices where there are any. */
export function questionSpeech(q) {
  if (!q) return '';
  const parts = [speakableText(q.text || '')];
  const letter = (i) => String.fromCharCode(65 + i);
  const list = Array.isArray(q.options) ? q.options : (q.type === 'ordering' && Array.isArray(q.items) ? q.items : null);
  if (list && list.length) {
    list.forEach((o, i) => { if (o && String(o.text || '').trim()) parts.push(`Option ${letter(i)}. ${speakableText(o.text)}.`); });
  } else if (q.type === 'truefalse') parts.push('True or false.');
  return parts.filter(Boolean).join(' ');
}
