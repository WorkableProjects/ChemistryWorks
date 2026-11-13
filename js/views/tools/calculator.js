// Scientific calculator panel for the reference pane. Parsing lives in calc-parser.js (no eval).
// calculatorPanel() -> HTMLElement

import { h } from '../../ui.js';
import { evaluate, formatResult } from './calc-parser.js';

const KEYS = [
  ['sin', 'sin(', 'fn'], ['cos', 'cos(', 'fn'], ['tan', 'tan(', 'fn'], ['pi', 'π', 'fn'], ['ans', 'ans', 'fn'],
  ['log', 'log(', 'fn'], ['ln', 'ln(', 'fn'], ['sqrt', '√(', 'fn'], ['pow', '^', 'fn'], ['ee', 'e', 'fn'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['div', '÷', 'op'], ['lp', '(', 'op'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['mul', '×', 'op'], ['rp', ')', 'op'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['sub', '−', 'op'], ['fact', '!', 'op'],
  ['0', '0'], ['dot', '.', ''], ['neg', '-', ''], ['add', '+', 'op'], ['exp', 'exp(', 'fn'],
];

export function calculatorPanel() {
  let angle = 'deg';
  let ans = 0;
  let memory = 0;
  const input = h('input', {
    class: 'input calc__input', type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
    'aria-label': 'Expression', placeholder: 'e.g. 6.022e23 * 2', dataset: { testid: 'calc-input' },
  });
  const result = h('output', { class: 'calc__result', 'aria-live': 'polite', dataset: { testid: 'calc-result' } }, '0');
  const memTag = h('span', { class: 'calc__mem', hidden: true, dataset: { testid: 'calc-mem' } }, 'M');
  const angleBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm calc__angle', 'aria-pressed': 'true', dataset: { testid: 'calc-angle' },
    on: { click: () => { angle = angle === 'deg' ? 'rad' : 'deg'; syncAngle(); } } });
  const syncAngle = () => { angleBtn.textContent = angle === 'deg' ? 'DEG' : 'RAD'; angleBtn.setAttribute('aria-label', `Angle mode: ${angle === 'deg' ? 'degrees' : 'radians'}. Press to switch.`); };
  syncAngle();

  function insert(text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.setRangeText(text, start, end, 'end');
    input.focus();
  }
  function equals() {
    const r = evaluate(input.value, { angle, ans });
    if (r.ok) { ans = r.value; result.textContent = formatResult(r.value); result.classList.remove('is-error'); } else { result.textContent = r.error; result.classList.add('is-error'); }
    return r;
  }
  function currentValue() { const r = evaluate(input.value || String(ans), { angle, ans }); return r.ok ? r.value : null; }
  function memory_(op) {
    if (op === 'mc') memory = 0;
    else if (op === 'mr') { insert(formatResult(memory) || '0'); return; } else {
      const v = currentValue();
      if (v == null) { result.textContent = 'Nothing to store'; result.classList.add('is-error'); return; }
      memory += op === 'm+' ? v : -v;
    }
    memTag.hidden = memory === 0;
  }

  const key = (id, label, text, cls) => h('button', {
    type: 'button', class: ['calc__key', cls && `calc__key--${cls}`], dataset: { testid: `calc-key-${id}` },
    'aria-label': { sqrt: 'square root', pi: 'pi', ee: 'times ten to the power (E)', pow: 'power', div: 'divide', mul: 'multiply', sub: 'minus', add: 'plus', neg: 'negative sign', dot: 'decimal point', lp: 'open bracket', rp: 'close bracket', fact: 'factorial' }[id] || null,
    on: { click: () => insert(text) },
  }, label);
  const mem = ['mc', 'mr', 'm+', 'm-'].map((m) => h('button', { type: 'button', class: 'calc__key calc__key--mem', dataset: { testid: `calc-${m === 'm+' ? 'mplus' : m === 'm-' ? 'mminus' : m}` },
    'aria-label': { mc: 'Memory clear', mr: 'Memory recall', 'm+': 'Add to memory', 'm-': 'Subtract from memory' }[m], on: { click: () => memory_(m) } }, m.toUpperCase()));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); equals(); }
    else if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; }
  });

  return h('div', { class: 'calc', role: 'group', 'aria-label': 'Scientific calculator', dataset: { testid: 'calculator' } },
    h('div', { class: 'calc__display' }, input, h('div', { class: 'calc__row' }, memTag, result)),
    h('div', { class: 'calc__tools' }, mem, angleBtn),
    h('div', { class: 'calc__keys' }, KEYS.map(([id, text, cls]) => key(id, text === '-' ? '(−)' : (text.length > 1 && text.endsWith('(') ? text.slice(0, -1) : text), text, cls))),
    h('div', { class: 'calc__actions' },
      h('button', { type: 'button', class: 'btn btn--ghost calc__action', dataset: { testid: 'calc-clear' }, on: { click: () => { input.value = ''; result.textContent = '0'; result.classList.remove('is-error'); input.focus(); } } }, 'Clear'),
      h('button', { type: 'button', class: 'btn btn--ghost calc__action', dataset: { testid: 'calc-back' }, 'aria-label': 'Delete last character', on: { click: () => { input.value = input.value.slice(0, -1); input.focus(); } } }, '⌫'),
      h('button', { type: 'button', class: 'btn btn--primary calc__action calc__action--eq', dataset: { testid: 'calc-equals' }, on: { click: () => { equals(); input.focus(); } } }, '=')),
    h('p', { class: 'calc__hint muted' }, 'Type or tap. 1.5e-3 is scientific notation; log is base 10, ln is natural.'));
}
