// Builder editor for `sigfigs`: the value, how many significant figures are required, tolerance.
import { h } from '../../../ui.js';
import { parseNumber } from '../../../lib/grading.js';
import { formatWithSigFigs } from '../../../lib/qtypes/sigfigs.js';
import { field, switchEl } from '../common.js';

export function sigfigsEditor(q, changed) {
  const hint = h('span', { class: 'field__hint', dataset: { testid: 'sigfigs-hint' } });
  const showHint = () => {
    const ok = typeof q.answer === 'number' && Number.isFinite(q.answer) && Number.isInteger(q.sigFigs) && q.sigFigs >= 1;
    hint.textContent = ok ? `Students should write ${formatWithSigFigs(q.answer, q.sigFigs)}` : ans.value.trim() ? 'Enter a number and a whole number of significant figures' : '';
  };
  const ans = h('input', { class: 'input', value: q.answer ?? '', placeholder: 'e.g. 0.00450 or 4.50e-3', autocomplete: 'off', dataset: { testid: 'sigfigs-answer' },
    on: { input: () => { const n = parseNumber(ans.value); q.answer = Number.isNaN(n) ? '' : n; showHint(); changed(); } } });
  const sf = h('input', { class: 'input', type: 'number', min: '1', max: '15', step: '1', value: q.sigFigs ?? '', dataset: { testid: 'sigfigs-count' },
    on: { input: () => { q.sigFigs = sf.value.trim() === '' ? '' : Number(sf.value); showHint(); changed(); } } });
  const tol = h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: q.tolerance ?? 0, dataset: { testid: 'sigfigs-tolerance' },
    on: { input: () => { q.tolerance = tol.value.trim() === '' ? 0 : Number(tol.value); changed(); } } });
  showHint();
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--3' },
      field('Correct value', ans, null), field('Significant figures required', sf), field('Tolerance (absolute ±)', tol, 'How far the value may be off')),
    hint,
    switchEl({ label: 'Partial credit', hint: 'Half the points for the right value, half for the right number of significant figures', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }));
}
