// `lewis` editor: element symbol, valence electrons and dot-placement check, with a preview of the correct diagram.
import { h, mount } from '../../../ui.js';
import { normalizeSymbol, valenceOf, canonicalDots } from '../../../lib/lewis.js';
import { lewisDiagram } from '../../lewis-view.js';
import { field, switchEl } from '../common.js';

function lewisEditor(q, changed) {
  const previewEl = h('div', { class: 'adm-lewis-preview', dataset: { testid: 'lewis-preview' } });
  const hintEl = h('span', { class: 'field__hint' });
  const drawPreview = () => {
    const sym = normalizeSymbol(q.element);
    const n = Number(q.correctAnswer);
    const known = valenceOf(sym);
    hintEl.textContent = !sym ? 'Enter an element symbol, e.g. O, Cl, Mg'
      : known === null ? 'Not a main-group element: enter its valence electrons yourself'
        : known === n ? `${sym} has ${known} valence electrons` : `Note: ${sym} normally has ${known} valence electrons`;
    mount(previewEl, sym && Number.isInteger(n) && n >= 1 && n <= 8
      ? [lewisDiagram(sym, canonicalDots(n, sym), { size: 'lg' }), h('span', { class: 'faint' }, 'Correct diagram')]
      : h('span', { class: 'faint' }, 'Diagram preview appears here'));
  };
  const el = h('input', { class: 'input', value: q.element || '', placeholder: 'e.g. O', maxlength: '3', autocomplete: 'off', spellcheck: 'false', dataset: { testid: 'lewis-element' },
    on: { input: () => {
      const sym = normalizeSymbol(el.value);
      q.element = sym || el.value.trim();
      const v = valenceOf(sym);
      if (v !== null) { q.correctAnswer = v; ve.value = String(v); }
      drawPreview();
      changed();
    } } });
  const ve = h('input', { class: 'input', type: 'number', min: '1', max: '8', step: '1', value: q.correctAnswer ?? '', dataset: { testid: 'lewis-valence' },
    on: { input: () => { q.correctAnswer = ve.value.trim() === '' ? '' : Number(ve.value); drawPreview(); changed(); } } });
  drawPreview();
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--4' },
      field('Element symbol', el, null), field('Valence electrons (dots)', ve, 'Filled in automatically for main-group elements')),
    hintEl,
    previewEl,
    switchEl({ label: 'Check dot placement', hint: 'On: one dot per side before pairing (He may be a pair). Off: only the number of dots is graded.',
      checked: q.checkPlacement !== false, testid: 'lewis-placement', onChange: (v) => { q.checkPlacement = v; changed(); } }));
}

export default { type: 'lewis', edit: ({ q, redraw, changed }) => lewisEditor(q, changed) };
