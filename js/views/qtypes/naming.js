// `naming` question type (V4-03) — student widget and builder editor. Contract: js/views/qtypes/registry.js.
import { h } from '../../ui.js';
import { formulaToHTML } from '../../lib/formula.js';
import { registerTypeUI } from './registry.js';
import { field } from '../admin/common.js';

const formulaHtml = (text) => h('span', { class: 'formula', html: formulaToHTML(String(text ?? '')) });

function widget(q, api) {
  const toFormula = q.direction === 'toFormula';
  const preview = h('div', { class: 'q-formula-preview', 'aria-live': 'polite', dataset: { testid: 'naming-preview' } });
  const update = () => {
    if (!toFormula) return;
    const v = input.value.trim();
    preview.classList.toggle('is-empty', !v);
    if (!v) preview.textContent = 'Formatted preview appears here';
    else preview.replaceChildren(formulaHtml(input.value));
  };
  const input = h('input', {
    class: ['input', 'q-input', toFormula && 'q-input--formula'], type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off',
    placeholder: toFormula ? 'e.g. CuSO4.5H2O' : 'e.g. sodium chloride',
    'aria-label': toFormula ? 'Your answer (chemical formula)' : 'Your answer (compound name)', dataset: { testid: 'naming-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); update(); } },
  });
  update();
  const given = h('p', { class: 'naming-prompt', dataset: { testid: 'naming-prompt' } },
    h('span', { class: 'naming-prompt__label' }, toFormula ? 'Name' : 'Formula'),
    toFormula ? h('strong', { class: 'naming-prompt__value' }, q.prompt) : h('strong', { class: 'naming-prompt__value' }, formulaHtml(q.prompt)));
  return {
    el: h('div', { class: 'q-naming' },
      given,
      input,
      toFormula ? preview : null,
      h('p', { class: 'q-hint' }, toFormula ? 'Write the formula. Subscripts are plain numbers: H2SO4. Hydrates: CuSO4.5H2O.' : 'Spell the full name. Capital letters and spaces do not matter; write charges like iron(III).')),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : '';
      update();
    },
    focus: () => input.focus(),
  };
}

function editor(q, redraw, changed) {
  q.answers = Array.isArray(q.answers) ? q.answers : [];
  const dir = h('select', { class: 'select', dataset: { testid: 'naming-direction' }, 'aria-label': 'Direction',
    on: { change: () => { q.direction = dir.value; redraw(); changed(); } } },
  h('option', { value: 'toName' }, 'Formula → name'), h('option', { value: 'toFormula' }, 'Name → formula'));
  dir.value = q.direction === 'toFormula' ? 'toFormula' : 'toName';
  const toFormula = dir.value === 'toFormula';
  const prompt = h('input', { class: 'input', value: q.prompt || '', autocomplete: 'off', spellcheck: 'false', placeholder: toFormula ? 'copper(II) sulfate' : 'CuSO4.5H2O', dataset: { testid: 'naming-prompt-input' },
    on: { input: () => { q.prompt = prompt.value; changed(); } } });
  const rows = q.answers.map((a, i) => {
    const inp = h('input', { class: 'input', value: a, autocomplete: 'off', spellcheck: 'false', 'aria-label': `Accepted answer ${i + 1}`, dataset: { testid: `naming-answer-${i}` },
      on: { input: () => { q.answers[i] = inp.value; changed(); } } });
    const rm = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-label': `Remove accepted answer ${i + 1}`, on: { click: () => { q.answers.splice(i, 1); redraw(); changed(); } } }, 'Remove');
    return h('div', { class: 'naming-ed__row' }, inp, rm);
  });
  const add = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'naming-add-answer' }, on: { click: () => { q.answers.push(''); redraw(); changed(); } } }, 'Add accepted answer');
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--2' }, field('Direction', dir), field(toFormula ? 'Name shown to students' : 'Formula shown to students', prompt)),
    h('div', { class: 'naming-ed' }, h('span', { class: 'field__label' }, toFormula ? 'Accepted formulas' : 'Accepted names'), rows, add,
      h('span', { class: 'field__hint' }, toFormula
        ? 'Any listed formula is accepted; subscripts, hydrate dots and group order are compared as chemistry, not as text.'
        : 'Capitals, spaces, hyphens and "copper (II)" vs "copper(II)" are ignored. List other correct names (e.g. old-style -ic/-ous names) separately.')));
}

export default registerTypeUI({ type: 'naming', widget, editor });
