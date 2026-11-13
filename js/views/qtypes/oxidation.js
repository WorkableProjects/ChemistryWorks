// `oxidation` question type — student widget, builder editor and review.
// Answer: array of integers or null, one per atom position; see js/lib/qtypes/oxidation.js.
import { h } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field } from '../admin/common.js';
import { def, atomsOf, keyOf, oxText, parseOx, OX_MIN, OX_MAX } from '../../lib/qtypes/oxidation.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));

/** The formula as text runs and atom positions. Atom i gets an input above its symbol. */
function formulaLine(formula, atoms, inputFor) {
  const nodes = [];
  let pos = 0;
  atoms.forEach((at, i) => {
    if (at.start > pos) nodes.push(h('span', { class: 'ox-text' }, formula.slice(pos, at.start)));
    nodes.push(h('span', { class: 'ox-atom', dataset: { testid: `oxidation-atom-${i}` } },
      inputFor(i),
      h('span', { class: 'ox-atom__sym' }, at.symbol)));
    pos = at.end;
  });
  if (pos < formula.length) nodes.push(h('span', { class: 'ox-text' }, formula.slice(pos)));
  return h('div', { class: 'ox-formula', role: 'group', 'aria-label': `Oxidation numbers in ${formula}` }, nodes);
}

function widget(q, api) {
  const atoms = atomsOf(q.formula);
  const inputs = [];
  const commit = () => {
    const out = inputs.map((inp) => {
      const v = parseOx(inp.value);
      return v === null || Number.isNaN(v) ? null : v;
    });
    const any = out.some((v) => v !== null);
    api.set(q.id, any ? out : undefined, { debounce: true });
  };

  const body = atoms.length
    ? formulaLine(str(q.formula), atoms, (i) => {
      const inp = h('input', { class: 'input ox-in', type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false',
        placeholder: '0', 'aria-label': `Oxidation number of ${atoms[i].symbol}, atom ${i + 1}`, dataset: { testid: `oxidation-input-${i}` },
        on: { input: commit } });
      inputs[i] = inp;
      return inp;
    })
    : h('p', { class: 'ox-empty' }, 'This question has no formula to show.');

  const fill = (answer) => {
    const vals = Array.isArray(answer) ? answer : [];
    inputs.forEach((inp, i) => {
      const v = vals[i];
      const next = v === undefined || v === null ? '' : oxText(v);
      if (document.activeElement !== inp) inp.value = next;
    });
  };
  fill(api.get(q.id));

  return {
    el: h('div', { class: 'ox-root', dataset: { testid: 'oxidation-widget' } }, body),
    refresh(answer) { fill(answer); },
    focus: () => inputs[0] && inputs[0].focus(),
  };
}

function editor(q, redraw, changed) {
  const checker = h('p', { class: 'field__hint ox-ed__checker', 'aria-live': 'polite', dataset: { testid: 'oxidation-checker' } });
  const atoms = () => atomsOf(q.formula);
  const keyFields = [];

  const showChecker = () => {
    const at = atoms();
    const key = keyOf(q);
    if (!q.formula) { checker.textContent = 'Type a formula or an equation. Each element in it gets a key.'; checker.classList.add('is-bad'); return; }
    if (!at.length) { checker.textContent = 'The formula needs at least one element symbol.'; checker.classList.add('is-bad'); return; }
    const missing = key.filter((k) => k === null).length;
    checker.classList.toggle('is-bad', missing > 0);
    checker.textContent = missing
      ? `${missing} ${missing === 1 ? 'number is' : 'numbers are'} still missing from the key.`
      : `Key: ${at.map((a, i) => `${a.symbol} ${oxText(key[i])}`).join(', ')}.`;
  };

  const keyGrid = h('div', { class: 'adm-grid adm-grid--3', dataset: { testid: 'oxidation-ed-key' } });
  const rebuildKey = () => {
    keyGrid.textContent = '';
    keyFields.length = 0;
    const at = atoms();
    if (!at.length) return;
    if (!Array.isArray(q.key)) q.key = [];
    at.forEach((a, i) => {
      const inp = h('input', { class: 'input', type: 'number', step: '1', min: String(OX_MIN), max: String(OX_MAX),
        value: Number.isInteger(q.key[i]) ? String(q.key[i]) : '', 'aria-label': `Oxidation number of ${a.symbol}, atom ${i + 1}`,
        dataset: { testid: `oxidation-ed-key-${i}` },
        on: { input: (e) => {
          const v = e.target.value.trim();
          q.key[i] = v === '' ? null : Number(v);
          showChecker();
          changed();
        } } });
      keyFields.push(inp);
      keyGrid.append(field(`${a.symbol} (atom ${i + 1})`, inp));
    });
  };

  const formulaIn = h('input', { class: 'input', type: 'text', value: str(q.formula), autocomplete: 'off', spellcheck: 'false',
    placeholder: 'H2SO4 or Cu + 2 AgNO3 -> Cu(NO3)2 + 2 Ag', 'aria-label': 'Formula or equation', dataset: { testid: 'oxidation-ed-formula' },
    on: { input: (e) => {
      q.formula = e.target.value;
      const n = atoms().length;
      if (Array.isArray(q.key)) q.key = q.key.slice(0, n);
      rebuildKey();
      showChecker();
      changed();
    } } });

  rebuildKey();
  showChecker();
  return h('div', { class: 'stack' },
    field('Formula or equation', formulaIn, 'Each element symbol gets its own number. Subscripts and coefficients are ignored.'),
    h('p', { class: 'field__hint' }, 'Enter the oxidation number of each atom. Use a sign: +2, -1, 0.'),
    keyGrid,
    checker);
}

function review(q, answer, { key } = {}) {
  const atoms = atomsOf(q.formula);
  if (key) {
    return h('span', { class: 'ox-review', dataset: { testid: 'oxidation-review' } }, h('span', { class: 'ox-review__text' }, def.keyText(q)));
  }
  const given = Array.isArray(answer) ? answer : [];
  const any = given.some((v) => parseOx(v) !== null);
  if (!any || !atoms.length) return null;
  const text = atoms.map((a, i) => {
    const v = parseOx(given[i]);
    return `${a.symbol} ${v === null || Number.isNaN(v) ? '?' : oxText(v)}`;
  }).join(', ');
  return h('span', { class: 'ox-review', dataset: { testid: 'oxidation-review' } }, h('span', { class: 'ox-review__text' }, text));
}

registerTypeUI({ type: 'oxidation', widget, editor, review });
export default null;
