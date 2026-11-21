// Builder "Add question" picker: types grouped into four categories in a two-column grid, short labels, a filter box,
// and a "Teacher" tag instead of "(teacher graded)" in the name. Full names stay in the tooltip.

import { h, icon } from '../../../ui.js';
import { QUESTION_TYPES, TYPE_LABELS, MANUAL_TYPES } from '../../../lib/schema.js';
import { typeDef, registeredTypes } from '../../../lib/qtypes/registry.js';
import { addQuestion } from './questions.js';

// Icon and one-line description per question type (type picker, outline).
export const TYPE_ICONS = {
  mcq: 'list', multi: 'check', truefalse: 'flag', numeric: 'type', short: 'pencil', open: 'pen',
  matching: 'layers', ordering: 'sort', fillblank: 'minus', categorize: 'grid',
  formula: 'flask', balance: 'refresh', econfig: 'sparkle', sigfigs: 'type', ptable: 'grid', orbital: 'panel',
  lewis: 'user', structure: 'layers', hotspot: 'eye', graph: 'chart',
};
export const TYPE_DESCRIPTIONS = {
  mcq: 'One correct answer from a list.', multi: 'Select every correct answer.', truefalse: 'A statement that is true or false.',
  numeric: 'A number, with optional tolerance and units.', short: 'A short typed answer matched to accepted answers.', open: 'Free-text answer that you grade by hand.',
  matching: 'Pair items from two columns.', ordering: 'Put steps or items in the right order.', fillblank: 'Type the missing words in a sentence.',
  categorize: 'Drag items into the right groups.', formula: 'A chemical formula such as H2SO4.', balance: 'Balance a chemical equation.',
  econfig: 'An electron configuration.', sigfigs: 'Count or round to significant figures.', ptable: 'Click elements on the periodic table.',
  orbital: 'Fill in an orbital diagram.', lewis: 'Draw a Lewis dot symbol.', structure: 'Draw a Lewis structure; teacher graded.',
  hotspot: 'Label places on a picture.', graph: 'Plot or read a graph.',
};

const TYPE_GROUPS = [
  { title: 'Basics', types: ['mcq', 'multi', 'truefalse', 'numeric', 'short', 'open'] },
  { title: 'Match & sort', types: ['matching', 'ordering', 'fillblank', 'categorize'] },
  { title: 'Chemistry', types: ['formula', 'balance', 'econfig', 'sigfigs', 'ptable', 'orbital'] },
  { title: 'Diagrams & graphs', types: ['lewis', 'structure', 'hotspot', 'graph'] },
];
const SHORT_LABELS = {
  truefalse: 'True / False', fillblank: 'Fill in blanks', categorize: 'Sort into groups', formula: 'Formula',
  balance: 'Balance equation', econfig: 'Electron config', sigfigs: 'Sig figs', ptable: 'Periodic table pick',
  orbital: 'Orbital diagram', short: 'Short answer', open: 'Open response', lewis: 'Lewis dots',
  structure: 'Lewis structure', hotspot: 'Label diagram', graph: 'Graph',
};
// Registered types join their group and bring their own short label.
for (const t of registeredTypes().filter((x) => QUESTION_TYPES.includes(x))) {
  const d = typeDef(t);
  const g = TYPE_GROUPS.find((x) => x.title === d.group);
  if (g && !g.types.includes(t)) {
    for (const other of TYPE_GROUPS) other.types = other.types.filter((x) => x !== t); // the definition's group wins; a type is listed once
    g.types.push(t);
  }
  if (d.shortLabel) SHORT_LABELS[t] = d.shortLabel;
}
/** The "Add question" button and its filterable type picker. */
export function addMenu(bc) {
  let open = false;
  const grouped = new Set(TYPE_GROUPS.flatMap((g) => g.types));
  const groups = [...TYPE_GROUPS, { title: 'More', types: QUESTION_TYPES.filter((t) => !grouped.has(t)) }]
    .map((g) => ({ ...g, types: g.types.filter((t) => QUESTION_TYPES.includes(t)) })).filter((g) => g.types.length);
  const items = [];
  const groupEls = groups.map((g) => {
    const btns = g.types.map((t) => {
      const b = h('button', { class: 'adm-menu__item', type: 'button', role: 'menuitem', 'aria-label': `${TYPE_LABELS[t]}. ${TYPE_DESCRIPTIONS[t] || ''}`.trim(), dataset: { testid: `add-question-${t}` },
        on: { click: () => { setOpen(false); addQuestion(bc, t); } } },
      h('span', { class: 'adm-menu__icon' }, icon(TYPE_ICONS[t] || 'sparkle', { size: 16 })),
      h('span', { class: 'adm-menu__name' }, SHORT_LABELS[t] || TYPE_LABELS[t]),
      MANUAL_TYPES.includes(t) ? h('span', { class: 'adm-menu__tag' }, 'Teacher') : null,
      h('span', { class: 'adm-menu__desc', role: 'tooltip' }, TYPE_DESCRIPTIONS[t] || typeDef(t)?.description || TYPE_LABELS[t]));
      b._search = `${TYPE_LABELS[t]} ${SHORT_LABELS[t] || ''} ${t} ${g.title}`.toLowerCase();
      items.push(b);
      return b;
    });
    const el = h('div', { class: 'adm-menu__group', role: 'group', 'aria-label': g.title },
      h('div', { class: 'adm-menu__heading', 'aria-hidden': 'true' }, g.title), btns);
    el._btns = btns;
    return el;
  });
  const empty = h('p', { class: 'adm-menu__empty faint', hidden: true }, 'No matching question type.');
  const search = h('input', { class: 'input adm-menu__search', type: 'search', placeholder: 'Filter types…', 'aria-label': 'Filter question types', autocomplete: 'off', dataset: { testid: 'add-question-filter' },
    on: { input: () => filter() } });
  const visibleItems = () => items.filter((b) => !b.hidden);
  function filter() {
    const q = search.value.trim().toLowerCase();
    for (const b of items) b.hidden = !!q && !b._search.includes(q);
    for (const g of groupEls) g.hidden = g._btns.every((b) => b.hidden);
    empty.hidden = visibleItems().length > 0;
  }
  const menu = h('div', { class: 'adm-menu adm-menu--types', role: 'menu', 'aria-label': 'Question types', hidden: true, on: { keydown: (e) => {
    if (e.key === 'Enter' && e.target === search) { e.preventDefault(); visibleItems()[0]?.click(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = visibleItems();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const nextI = e.key === 'ArrowDown' ? (i + 1) % list.length : i <= 0 ? list.length - 1 : i - 1;
    list[nextI].focus();
  } } }, search, h('div', { class: 'adm-menu__grid' }, groupEls), empty);
  const trigger = h('button', { class: 'btn btn--ghost', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', dataset: { testid: 'add-question' },
    on: { click: (e) => { e.stopPropagation(); setOpen(!open); } } }, icon('plus', { size: 16 }), 'Add question');
  function setOpen(v) {
    open = v;
    menu.hidden = !v;
    trigger.setAttribute('aria-expanded', String(v));
    if (v) { search.value = ''; filter(); search.focus({ preventScroll: true }); }
  }
  const onDoc = (e) => { if (open && !wrap.contains(e.target)) setOpen(false); };
  const onKey = (e) => { if (open && e.key === 'Escape') { setOpen(false); trigger.focus(); } };
  document.addEventListener('click', onDoc);
  document.addEventListener('keydown', onKey);
  bc.cleanups.push(() => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); });
  const wrap = h('div', { class: 'adm-addwrap' }, trigger, menu);
  return wrap;
}
