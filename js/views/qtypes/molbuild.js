// `molbuild` question type — student widget, builder editor and review.
// Answer: { atoms: ['O','H','H'], bonds: [[0,1,1],[0,2,1]] }; see js/lib/qtypes/molbuild.js.
import { h, icon } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field } from '../admin/common.js';
import { formulaToHTML } from '../../lib/formula.js';
import { elementOf, normSymbol } from '../../lib/qtypes/ionbuilder.js';
import { def, MAX_ATOMS, MAX_ORDER, ORDER_MARK, toBuild, valenceHints, paletteFor, formulaText, parseBondText, bondsToText, keyOf } from '../../lib/qtypes/molbuild.js';

const clone = (s) => JSON.parse(JSON.stringify(s));
const ORDER_NAME = { 1: 'single', 2: 'double', 3: 'triple' };
const DASH = '—';

function widget(q, api) {
  let build = toBuild(api.get(q.id));
  let selected = -1;
  const palette = paletteFor(q);
  const board = h('div', { class: 'qm-atoms', role: 'group', 'aria-label': 'Your atoms', dataset: { testid: 'molbuild-atoms' } });
  const bondList = h('ul', { class: 'qm-bonds', dataset: { testid: 'molbuild-bonds' } });
  const formula = h('p', { class: 'qm-formula', 'aria-live': 'polite', dataset: { testid: 'molbuild-formula' } });
  const hint = h('p', { class: 'qm-hint', 'aria-live': 'polite', dataset: { testid: 'molbuild-hint' } });
  const help = h('p', { class: 'qm-help' }, 'Select one atom, then another, to bond them. Select the same pair again to change the bond.');

  const commit = () => api.set(q.id, build.atoms.length ? clone(build) : undefined, { debounce: true });
  const bondIndex = (i, j) => build.bonds.findIndex((b) => b[0] === Math.min(i, j) && b[1] === Math.max(i, j));

  const pick = (i) => {
    if (selected < 0) selected = i;
    else if (selected === i) selected = -1;
    else {
      const a = Math.min(selected, i), b = Math.max(selected, i);
      const k = bondIndex(a, b);
      if (k < 0) build.bonds.push([a, b, 1]);
      else if (build.bonds[k][2] >= MAX_ORDER) build.bonds.splice(k, 1);
      else build.bonds[k][2] += 1;
      selected = -1;
      commit();
    }
    paint();
  };
  const addAtom = (s) => { if (build.atoms.length >= MAX_ATOMS) return; build.atoms.push(s); commit(); paint(); };
  const removeAtom = (i) => {
    build.atoms.splice(i, 1);
    build.bonds = build.bonds.filter(([a, b]) => a !== i && b !== i).map(([a, b, o]) => [a > i ? a - 1 : a, b > i ? b - 1 : b, o]);
    selected = -1; commit(); paint();
  };
  const removeBond = (k) => { build.bonds.splice(k, 1); commit(); paint(); };

  function paint() {
    const hints = valenceHints(build);
    board.replaceChildren(...(build.atoms.length ? build.atoms.map((s, i) => h('div', { class: 'qm-atom' },
      h('button', { type: 'button', class: `qm-tile${selected === i ? ' is-selected' : ''}${hints[i].ok ? '' : ' is-open'}`, 'aria-pressed': selected === i ? 'true' : 'false',
        'aria-label': `${s} atom ${i + 1}`, dataset: { testid: `molbuild-atom-${i}` }, on: { click: () => pick(i) } },
      h('span', { class: 'qm-tile__num' }, String(i + 1)), h('span', { class: 'qm-tile__sym' }, s)),
      h('button', { type: 'button', class: 'qm-x', 'aria-label': `Remove ${s} atom ${i + 1}`, dataset: { testid: `molbuild-remove-${i}` }, on: { click: () => removeAtom(i) } }, icon('x', { size: 14 }))))
      : [h('p', { class: 'qm-empty' }, 'Add atoms from the bank')]));
    bondList.replaceChildren(...build.bonds.map(([i, j, o], k) => h('li', { class: 'qm-bond' },
      h('span', { class: 'qm-bond__text' }, `${build.atoms[i]}${i + 1} ${ORDER_MARK[o]} ${build.atoms[j]}${j + 1}`),
      h('span', { class: 'qm-bond__kind' }, ORDER_NAME[o]),
      h('button', { type: 'button', class: 'qm-x', 'aria-label': `Remove bond ${build.atoms[i]}${i + 1} to ${build.atoms[j]}${j + 1}`, dataset: { testid: `molbuild-unbond-${k}` }, on: { click: () => removeBond(k) } }, icon('x', { size: 14 })))));
    const t = formulaText(build.atoms);
    formula.replaceChildren('Formula ', t ? h('span', { class: 'formula', html: formulaToHTML(t) }) : DASH);
    const open = hints.filter((x) => !x.ok);
    hint.textContent = !build.atoms.length ? '' : open.length
      ? `Hint: ${open.map((x) => `${x.symbol} has ${x.have} of ${x.want} bonds`).join(', ')}`
      : 'Hint: every atom has its usual number of bonds';
  }

  const bank = h('div', { class: 'qm-bank', role: 'group', 'aria-label': 'Atom bank' }, palette.map((s) => h('button', {
    type: 'button', class: 'qm-pick', 'aria-label': `Add ${s}`, dataset: { testid: `molbuild-add-${s}` }, on: { click: () => addAtom(s) } },
  icon('plus', { size: 14 }), h('span', { class: 'qm-pick__sym' }, s))));
  paint();

  return {
    el: h('div', { class: 'qm-root', dataset: { testid: 'molbuild-widget' } }, bank, board, help, bondList, formula, hint),
    refresh(answer) {
      const next = toBuild(answer);
      if (JSON.stringify(next) === JSON.stringify(build)) return;
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.qm-root')) return;
      build = next; selected = -1; paint();
    },
    focus: () => bank.querySelector('button') && bank.querySelector('button').focus(),
  };
}

function editor(q, redraw, changed) {
  const checker = h('p', { class: 'field__hint', 'aria-live': 'polite', dataset: { testid: 'molbuild-checker' } });
  const show = () => {
    const k = keyOf(q);
    checker.textContent = k ? `Target: ${formulaText(k.atoms)}, ${k.bonds.length} bonds. Atoms are numbered from 1 in the order listed.` : 'List the atoms of the molecule.';
  };
  const symbols = (s) => s.split(/[,\s]+/).map(normSymbol).filter((x) => elementOf(x));
  const atomsIn = h('input', { class: 'input', type: 'text', value: q.atoms.join(', '), 'aria-label': 'Atoms', dataset: { testid: 'molbuild-ed-atoms' },
    on: { input: (e) => {
      q.atoms = symbols(e.target.value).slice(0, MAX_ATOMS);
      q.bonds = q.bonds.filter(([a, b]) => a < q.atoms.length && b < q.atoms.length);
      show(); changed();
    } } });
  const bondsIn = h('input', { class: 'input', type: 'text', value: bondsToText(q.bonds), 'aria-label': 'Bonds', dataset: { testid: 'molbuild-ed-bonds' },
    on: { input: (e) => {
      q.bonds = parseBondText(e.target.value).filter(([a, b]) => a !== b && a >= 0 && b >= 0 && a < q.atoms.length && b < q.atoms.length)
        .map(([a, b, o]) => [Math.min(a, b), Math.max(a, b), o]);
      show(); changed();
    } } });
  const extraIn = h('input', { class: 'input', type: 'text', value: (q.extraAtoms || []).join(', '), 'aria-label': 'Extra atoms', dataset: { testid: 'molbuild-ed-extra' },
    on: { input: (e) => { q.extraAtoms = symbols(e.target.value); changed(); } } });
  show();
  return h('div', { class: 'stack' },
    field('Atoms (symbols, comma separated)', atomsIn, 'For water: O, H, H'),
    field('Bonds', bondsIn, 'Atom numbers with - single, = double, # triple. For water: 1-2, 1-3'),
    checker,
    field('Extra atoms in the bank (optional)', extraIn, 'The target atoms are always in the bank'));
}

function review(q, answer, { key } = {}) {
  const text = key ? def.keyText(q) : (toBuild(answer).atoms.length ? def.answerText(q, answer) : null);
  if (!text) return null;
  return h('span', { class: 'qm-review', dataset: { testid: 'molbuild-review' } }, h('span', { class: 'qm-review__text' }, text));
}

registerTypeUI({ type: 'molbuild', widget, editor, review });
export default null;
