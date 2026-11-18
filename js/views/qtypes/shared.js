// Pieces shared by the question-type widgets: option pictures, the "how to type it" help box and the insert-symbol bar.
import { h, icon } from '../../ui.js';
import { safeImageUrl } from '../../lib/sections.js';
import { CHARGE_EXAMPLES, EXPONENT_EXAMPLES } from '../../lib/hints.js';

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺' };

/** 1.204e24 -> "1.204 × 10²⁴"; plain numbers are shown without float noise. */
export function formatInterpreted(x) {
  if (!Number.isFinite(x)) return String(x);
  const abs = Math.abs(x);
  if (abs !== 0 && (abs >= 1e5 || abs < 1e-3)) {
    const [mant, exp] = x.toExponential().split('e');
    const e = String(parseInt(exp, 10));
    return `${mant} × 10${[...e].map((c) => SUP[c] ?? c).join('')}`;
  }
  return String(Number(x.toPrecision(12)));
}


/** Optional picture on a choice / item (option.image = { url, alt }); null when there is none or the url is unsafe. */
export function optionImageEl(o, className = '') {
  const url = o && o.image && safeImageUrl(o.image.url);
  if (!url) return null;
  return h('img', { class: ['opt-img', className].filter(Boolean).join(' '), src: url, alt: String(o.image.alt || ''), loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', dataset: { testid: 'opt-img' } });
}

/** Insert text at the caret of an input and fire its input handler. */
export function insertAtCaret(input, text, caretBack = 0) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length - caretBack;
  input.focus();
  input.setSelectionRange(pos, pos);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function helpBox(kind, testid) {
  const charges = kind === 'charges';
  const rows = (charges ? CHARGE_EXAMPLES : EXPONENT_EXAMPLES).map(([typed, means]) => h('li', {},
    h('kbd', { class: 'q-help__kbd' }, typed), h('span', { class: 'q-help__arrow', 'aria-hidden': 'true' }, '→'), h('span', {}, means)));
  return h('div', { class: ['q-help', charges ? 'q-help--charges' : 'q-help--exp'], role: 'note', dataset: { testid } },
    h('p', { class: 'q-help__title' }, icon('info', { size: 16 }), charges ? 'How to type charges' : 'How to type powers of ten'),
    h('p', { class: 'q-help__lead' }, charges
      ? 'Type the formula with normal numbers for subscripts (H2O). For a charge, type ^ then the number, then the sign. Leave out the number for a charge of 1.'
      : 'Type e (or x10^) before the exponent. The preview under the box shows how your number was read, so check it before moving on.'),
    h('ul', { class: 'q-help__list' }, rows));
}

/** Small buttons that type ^, +, −, etc. into an input (helpful on phones and tablets). */
export function insertBar(input, keys) {
  return h('div', { class: 'q-insert', role: 'group', 'aria-label': 'Insert symbol' },
    keys.map(([label, text, back = 0, title]) => h('button', {
      type: 'button', class: 'q-insert__btn', title: title || `Insert ${text}`, 'aria-label': title || `Insert ${text}`,
      dataset: { testid: `insert-${label}` },
      on: { mousedown: (e) => e.preventDefault(), click: () => insertAtCaret(input, text, back) },
    }, label)));
}

export const CHARGE_KEYS = [['^', '^', 0, 'Insert ^ (start a charge)'], ['+', '+', 0, 'Insert + sign'], ['−', '-', 0, 'Insert − sign'], ['( )', '()', 1, 'Insert parentheses'], ['·', '.', 0, 'Insert hydrate dot']];
export const EXP_KEYS = [['×10^', 'x10^', 0, 'Insert ×10^'], ['e', 'e', 0, 'Insert e (exponent)'], ['−', '-', 0, 'Insert minus sign']];
