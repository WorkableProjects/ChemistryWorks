// `numeric` editor: correct answer (scientific notation allowed), tolerance, unit and the randomizing variables panel.
import { h } from '../../../ui.js';
import { field } from '../common.js';
import { parseSci, withVariables, formatHelpField } from './shared.js';

function numericEditor(q, changed) {
  const parsedEl = h('span', { class: 'field__hint' });
  const showParsed = () => {
    const n = q.correctAnswer;
    parsedEl.textContent = typeof n === 'number' && Number.isFinite(n) ? `Parsed value: ${n}` : ans.value.trim() ? 'Not a valid number yet' : '';
  };
  const ans = h('input', { class: 'input', value: q.correctAnswer ?? '', placeholder: 'e.g. 18.02 or 6.022e23', inputmode: 'text', autocomplete: 'off', dataset: { testid: 'numeric-answer' },
    on: { input: () => { const n = parseSci(ans.value); q.correctAnswer = Number.isNaN(n) ? '' : n; showParsed(); changed(); } } });
  const tol = h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: q.tolerance ?? 0, dataset: { testid: 'numeric-tolerance' },
    on: { input: () => { q.tolerance = tol.value.trim() === '' ? 0 : Number(tol.value); changed(); } } });
  const type = h('select', { class: 'select', dataset: { testid: 'numeric-tolerance-type' }, on: { change: () => { q.toleranceType = type.value; changed(); } } },
    h('option', { value: 'absolute' }, 'Absolute (±)'), h('option', { value: 'percent' }, 'Percent (±%)'));
  type.value = q.toleranceType || 'absolute';
  const unit = h('input', { class: 'input', value: q.unit || '', placeholder: 'e.g. g/mol', dataset: { testid: 'numeric-unit' }, on: { input: () => { q.unit = unit.value; changed(); } } });
  showParsed();
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--4' },
      field('Correct answer', ans, null), field('Tolerance', tol), field('Tolerance type', type), field('Unit', unit, 'Optional, shown to students'),
      h('div', { class: 'adm-span-all' }, parsedEl)),
    formatHelpField(q, changed));
}

export default { type: 'numeric', edit: ({ q, redraw, changed }) => withVariables(q, numericEditor(q, changed), redraw, changed) };
