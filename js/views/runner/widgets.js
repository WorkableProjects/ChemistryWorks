// Runner question widgets: per-type answer inputs (choice, numeric, formula, matching, ordering, ...)
// and buildWidget(q, api) which dispatches on question type. Moved out of runner.js unchanged.
// Each widget returns { el, refresh() }.

import { h, icon, richText, renderMath, seededShuffle } from '../../ui.js';
import { lewisWidget } from '../lewis-view.js';
import { structureWidget } from '../structure-view.js';
import { orbitalWidget } from '../orbital-view.js';
import { balanceWidget } from '../widgets/balance.js';
import { econfigWidget } from '../widgets/econfig.js';
import { ptableWidget } from '../widgets/ptable.js';
import { sigfigsWidget } from '../widgets/sigfigs.js';
import { categorizeWidget } from '../widgets/categorize.js';
import { hotspotWidget } from '../widgets/hotspot.js';
import { graphWidget } from '../widgets/graph.js';
import { formatHelpFor } from '../../lib/hints.js';
import { splitBlanks, wordBankChoices } from '../../lib/blanks.js';
import { typeUI, hasTypeUI, loadTypeUI } from '../qtypes/registry.js';
import { optionImageEl, helpBox } from '../qtypes/shared.js';
import '../qtypes/index.js'; // registers the older question-type widgets, which still carry their own editors

export { formatInterpreted, optionImageEl } from '../qtypes/shared.js';

export const pointsLabel = (p) => `${p} ${Number(p) === 1 ? 'pt' : 'pts'}`;

/**
 * Pictures of the choices named by `answer` (an option id, a list of ids, or an ordering), for results and exports.
 * Returns a row element, or null when none of the chosen options has an image.
 */
export function choiceImagesEl(q, answer, className = 'opt-imgs') {
  if (!q || !(q.type === 'mcq' || q.type === 'multi' || q.type === 'ordering')) return null;
  const list = q.type === 'ordering' ? q.items : q.options;
  const ids = Array.isArray(answer) ? answer : answer == null ? [] : [answer];
  const imgs = ids.map((id) => (Array.isArray(list) ? list.find((o) => o && String(o.id) === String(id)) : null))
    .map((o) => optionImageEl(o, 'opt-img--sm')).filter(Boolean);
  return imgs.length ? h('span', { class: className }, imgs) : null;
}
/** Plain-text name of a choice, for aria-labels: its text, else its image description. */
const optLabel = (o) => (o && String(o.text || '').trim()) || (o && o.image && o.image.alt) || (o && o.id) || '';

/* ------------------------------------------------------------------ widgets */
// Every widget returns { el, refresh(answer), focus?(), shortcut?(key) }. Widgets never own state: they call
// api.set(questionId, value, { debounce }) and the runner calls refresh() with the stored answer.

function matchingWidget(q, api) {
  const inputs = {}; // `${l}|${r}` -> input
  const head = h('tr', {}, h('td', { class: 'q-match__corner' }),
    q.right.map((r) => h('th', { scope: 'col', class: 'q-match__col' }, optionImageEl(r, 'opt-img--sm'), r.text ? richText(r.text) : null)));
  const rows = q.left.map((l) => h('tr', {},
    h('th', { scope: 'row', class: 'q-match__row' }, optionImageEl(l, 'opt-img--sm'), l.text ? richText(l.text) : null),
    q.right.map((r) => {
      const input = h('input', {
        type: 'radio', class: 'q-dot__input', name: `m-${q.id}-${l.id}`, value: r.id,
        'aria-label': `${optLabel(l)} matches ${optLabel(r)}`,
        dataset: { testid: `match-${l.id}-${r.id}` },
        on: { change: () => api.set(q.id, { ...(api.get(q.id) || {}), [l.id]: r.id }) },
      });
      inputs[`${l.id}|${r.id}`] = input;
      return h('td', { class: 'q-match__cell' }, h('label', { class: 'q-dot' }, input, h('span', { class: 'q-dot__mark', 'aria-hidden': 'true' })));
    }),
  ));
  return {
    el: h('div', { class: 'q-matching' },
      h('p', { class: 'q-hint' }, 'Match each item on the left with one option. Options can be used more than once.'),
      h('div', { class: 'q-match', role: 'group', 'aria-labelledby': `qt-${q.id}` },
        h('table', {}, h('thead', {}, head), h('tbody', {}, rows)))),
    refresh(answer) {
      const a = answer && typeof answer === 'object' ? answer : {};
      for (const l of q.left) for (const r of q.right) inputs[`${l.id}|${r.id}`].checked = a[l.id] === r.id;
    },
  };
}

function shortWidget(q, api) {
  const countId = `sc-${q.id}`;
  const count = h('p', { class: 'q-hint q-short__count', id: countId, 'aria-live': 'polite' });
  const updateCount = () => {
    const n = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
    count.textContent = `${n} ${n === 1 ? 'word' : 'words'} · Your teacher will grade this answer`;
  };
  const input = h('textarea', {
    class: 'textarea q-short', rows: 6, maxlength: '5000', spellcheck: 'true', placeholder: 'Type your answer',
    'aria-label': 'Your answer', 'aria-describedby': countId, dataset: { testid: 'short-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); updateCount(); } },
  });
  updateCount();
  return {
    el: h('div', { class: 'q-short-wrap' }, input, count),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : '';
      updateCount();
    },
    focus: () => input.focus(),
  };
}

function orderingWidget(q, api) {
  // q.items is already in this student's shuffled display order (see render()).
  const startOrder = q.items.map((it) => it.id);
  const itemOf = new Map(q.items.map((it) => [it.id, it]));
  const textOf = { get: (id) => optLabel(itemOf.get(id)) };
  const list = h('ol', { class: 'q-order__list', 'aria-labelledby': `qt-${q.id}` });
  const status = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const current = () => {
    const a = api.get(q.id);
    return Array.isArray(a) && a.length === startOrder.length && startOrder.every((id) => a.includes(id)) ? a.slice() : startOrder.slice();
  };
  const move = (from, to) => {
    const order = current();
    if (to < 0 || to >= order.length) return;
    const [id] = order.splice(from, 1);
    order.splice(to, 0, id);
    api.set(q.id, order);
    status.textContent = `${textOf.get(id)} moved to position ${to + 1} of ${order.length}`;
    requestAnimationFrame(() => list.querySelector(`[data-item="${CSS.escape(id)}"] .q-order__btn--${to < from ? 'up' : 'down'}`)?.focus()
      || list.querySelector(`[data-item="${CSS.escape(id)}"] .q-order__handle`)?.focus());
  };
  let dragFrom = -1;
  let firstPaint = true; // only the first render animates; later re-renders (after a move) must not flash
  // Touch / pen: HTML5 drag and drop never fires on touch screens, so the handle also supports pointer dragging.
  function touchDrag(e, from, li) {
    if (e.pointerType === 'mouse' || e.button > 0) return; // mouse uses native drag and drop on the row
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture?.(e.pointerId);
    let over = from;
    li.classList.add('is-dragging');
    const rowAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('.q-order__item');
    const mark = (row) => {
      list.querySelectorAll('.is-over').forEach((n) => n.classList.remove('is-over'));
      if (row && list.contains(row) && row !== li) row.classList.add('is-over');
    };
    const onMove = (ev) => {
      const row = rowAt(ev.clientX, ev.clientY);
      if (row && list.contains(row)) over = [...list.children].indexOf(row);
      mark(row);
    };
    const end = (ev) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      li.classList.remove('is-dragging');
      mark(null);
      if (ev.type === 'pointerup' && over !== from) move(from, over);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
  const keepBtn = h('button', { type: 'button', class: 'btn btn--subtle btn--sm q-order__keep', dataset: { testid: 'ordering-keep' },
    on: { click: () => api.set(q.id, current()) } }, icon('check', { size: 14 }), 'Use this order');

  function refresh(answer) {
    const order = Array.isArray(answer) && answer.length ? current() : startOrder;
    list.replaceChildren(...order.map((id, i) => {
      const it = itemOf.get(id);
      const li = h('li', { class: ['q-order__item', firstPaint && 'is-new'], draggable: 'true', dataset: { item: id, testid: `ordering-item-${id}` },
        on: {
          dragstart: (e) => { dragFrom = i; li.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); },
          dragend: () => li.classList.remove('is-dragging'),
          dragover: (e) => { e.preventDefault(); li.classList.add('is-over'); },
          dragleave: () => li.classList.remove('is-over'),
          drop: (e) => { e.preventDefault(); li.classList.remove('is-over'); if (dragFrom >= 0 && dragFrom !== i) move(dragFrom, i); dragFrom = -1; },
        } },
      h('span', { class: 'q-order__pos', 'aria-hidden': 'true' }, String(i + 1)),
      h('span', { class: 'q-order__handle', tabindex: '-1', 'aria-hidden': 'true', on: { pointerdown: (e) => touchDrag(e, i, li) } }, icon('grid', { size: 16 })),
      h('span', { class: 'q-order__content' }, optionImageEl(it, 'opt-img--sm'), String(it.text).trim() || !it.image ? richText(it.text, 'span', 'q-order__text') : null),
      h('span', { class: 'q-order__btns' },
        h('button', { type: 'button', class: 'icon-btn q-order__btn q-order__btn--up', disabled: i === 0, 'aria-label': `Move ${textOf.get(id)} up`, dataset: { testid: `ordering-up-${id}` }, on: { click: () => move(i, i - 1) } }, icon('up', { size: 16 })),
        h('button', { type: 'button', class: 'icon-btn q-order__btn q-order__btn--down', disabled: i === order.length - 1, 'aria-label': `Move ${textOf.get(id)} down`, dataset: { testid: `ordering-down-${id}` }, on: { click: () => move(i, i + 1) } }, icon('down', { size: 16 }))));
      return li;
    }));
    renderMath(list);
    firstPaint = false;
    keepBtn.hidden = Array.isArray(answer) && answer.length > 0;
  }
  refresh(api.get(q.id));
  return {
    el: h('div', { class: 'q-order' },
      h('p', { class: 'q-hint' }, 'Drag items, or use the arrow buttons, to put them in order.'),
      q.topLabel ? h('p', { class: 'q-order__label' }, icon('up', { size: 14 }), q.topLabel) : null,
      list,
      q.bottomLabel ? h('p', { class: 'q-order__label' }, icon('down', { size: 14 }), q.bottomLabel) : null,
      keepBtn, status),
    refresh,
  };
}

function fillBlankWidget(q, api) {
  const byId = new Map((q.blanks || []).map((b, i) => [b.id, { ...b, n: i + 1 }]));
  const bank = q.wordBank ? seededShuffle(wordBankChoices(q), `bank${q.id}`) : null;
  const inputs = new Map();
  const update = (id, value, debounce) => {
    const next = { ...(api.get(q.id) || {}) };
    if (value === '' || value == null) delete next[id]; else next[id] = value;
    api.set(q.id, Object.keys(next).length ? next : undefined, { debounce });
  };
  const textEl = h('div', { class: 'q-text q-fill' }, splitBlanks(q.text).map((part) => {
    if (part.text !== undefined) return richText(part.text, 'span');
    const b = byId.get(part.blank);
    if (!b) return h('span', {}, '____');
    const label = `Blank ${b.n}`;
    let el;
    if (bank) {
      el = h('select', { class: 'select q-fill__select', 'aria-label': label, dataset: { testid: `blank-${b.id}` },
        on: { change: () => update(b.id, el.value, false) } },
      h('option', { value: '' }, `(${b.n}) choose…`), bank.map((w) => h('option', { value: w }, w)));
    } else {
      const longest = Math.max(4, ...(b.answers || []).map((a) => String(a).length));
      el = h('input', {
        class: ['input', 'q-fill__input', b.kind === 'formula' && 'q-input--formula'], type: 'text', autocomplete: 'off', spellcheck: b.kind === 'text' ? 'true' : 'false',
        autocapitalize: 'off', 'aria-label': label, placeholder: `(${b.n})`, inputmode: b.kind === 'number' ? 'decimal' : 'text',
        style: `--chars:${Math.min(24, longest + 3)}`, dataset: { testid: `blank-${b.id}` },
        on: { input: () => update(b.id, el.value, true) },
      });
    }
    inputs.set(b.id, el);
    return h('span', { class: 'q-fill__slot' }, el, b.kind === 'number' && b.unit ? h('span', { class: 'q-fill__unit' }, b.unit) : null);
  }));
  const help = formatHelpFor(q);
  return {
    textEl,
    el: h('div', { class: 'q-fillwrap' },
      bank ? h('div', { class: 'q-bank', 'aria-label': 'Word bank' }, h('span', { class: 'q-bank__label' }, 'Word bank'), bank.map((w) => h('span', { class: 'q-bank__chip' }, w))) : null,
      help.charges ? helpBox('charges', 'charge-help') : null,
      help.exponents ? helpBox('exponents', 'exponent-help') : null,
      h('p', { class: 'q-hint' }, bank ? 'Choose a word for each blank. Words may be used more than once.' : 'Type your answer in each blank.')),
    refresh(answer) {
      const a = answer && typeof answer === 'object' ? answer : {};
      for (const [id, el] of inputs) if (document.activeElement !== el) el.value = a[id] == null ? '' : String(a[id]);
    },
    focus: () => inputs.values().next().value?.focus(),
  };
}

function openWidget(q, api) {
  const countId = `oc-${q.id}`;
  const count = h('p', { class: 'q-hint q-short__count', id: countId, 'aria-live': 'polite' });
  const min = Number(q.minWords) || 0;
  const max = Number(q.maxWords) || 0;
  const target = min && max ? `aim for ${min}–${max} words` : min ? `at least ${min} words` : max ? `up to ${max} words` : '';
  const updateCount = () => {
    const n = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
    count.textContent = `${n} ${n === 1 ? 'word' : 'words'}${target ? ` · ${target}` : ''} · Your teacher will grade this answer`;
    count.classList.toggle('is-warn', (min && n > 0 && n < min) || (max && n > max));
  };
  const input = h('textarea', {
    class: 'textarea q-short q-open', rows: 10, maxlength: '20000', spellcheck: 'true', placeholder: 'Write your response',
    'aria-label': 'Your answer', 'aria-describedby': countId, dataset: { testid: 'open-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); updateCount(); } },
  });
  updateCount();
  const rubric = q.showRubric !== false && Array.isArray(q.rubric) && q.rubric.length
    ? h('div', { class: 'q-rubric', dataset: { testid: 'open-rubric' } },
      h('p', { class: 'q-rubric__title' }, 'How this will be graded'),
      h('ul', {}, q.rubric.map((r) => h('li', {}, richText(r.text, 'span'), h('span', { class: 'pill' }, pointsLabel(r.points))))))
    : null;
  return {
    el: h('div', { class: 'q-short-wrap' }, rubric, input, count),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : '';
      updateCount();
    },
    focus: () => input.focus(),
  };
}

export function buildWidget(q, api) {
  switch (q.type) {
    case 'matching': return matchingWidget(q, api);
    case 'lewis': return lewisWidget(q, api);
    case 'short': return shortWidget(q, api);
    case 'ordering': return orderingWidget(q, api);
    case 'fillblank': return fillBlankWidget(q, api);
    case 'open': return openWidget(q, api);
    case 'structure': return structureWidget(q, api);
    case 'orbital': return orbitalWidget(q, api);
    case 'balance': return balanceWidget(q, api);
    case 'econfig': return econfigWidget(q, api);
    case 'ptable': return ptableWidget(q, api);
    case 'sigfigs': return sigfigsWidget(q, api);
    case 'categorize': return categorizeWidget(q, api);
    case 'hotspot': return hotspotWidget(q, api);
    case 'graph': return graphWidget(q, api);
    default: {
      const ui = typeUI(q.type);
      if (ui?.render) return ui.render({ q, api, readOnly: false, uid: q.id });
      if (ui?.widget) return ui.widget(q, api);
      if (hasTypeUI(q.type)) return deferredWidget(q, api);
      return { el: h('p', { class: 'muted' }, `Unsupported question type: ${q.type}`), refresh() {} };
    }
  }
}

/**
 * Stand-in for a widget whose module is still loading (the runner normally preloads them, see preloadQuestionTypes).
 * It forwards refresh, focus and shortcut to the real widget once that arrives.
 */
function deferredWidget(q, api) {
  const el = h('div', { class: 'q-loading', 'aria-busy': 'true' });
  let real = null;
  let latest;
  loadTypeUI(q.type).then(() => {
    const ui = typeUI(q.type);
    real = ui?.render ? ui.render({ q, api, readOnly: false, uid: q.id }) : ui?.widget ? ui.widget(q, api) : null;
    if (!real) { el.replaceChildren(h('p', { class: 'muted' }, `Unsupported question type: ${q.type}`)); return; }
    el.removeAttribute('aria-busy');
    el.replaceChildren(real.el);
    real.refresh(latest);
    renderMath(el);
  }).catch(() => el.replaceChildren(h('p', { class: 'muted' }, 'Could not load this question.')));
  return {
    el,
    refresh(answer) { latest = answer; real?.refresh(answer); },
    focus() { real?.focus?.(); },
    shortcut(key) { return real?.shortcut ? real.shortcut(key) : false; },
  };
}

/* ------------------------------------------------------------------ view */
