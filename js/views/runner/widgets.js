// Runner question widgets: per-type answer inputs (choice, numeric, formula, matching, ordering, ...)
// and buildWidget(q, api) which dispatches on question type. Moved out of runner.js unchanged.
// Each widget returns { el, refresh() }.

import { h, icon, richText, renderMath, seededShuffle } from '../../ui.js';
import { parseNumber } from '../../lib/grading.js';
import { formulaToHTML } from '../../lib/formula.js';
import { safeImageUrl } from '../../lib/sections.js';
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
import { formatHelpFor, CHARGE_EXAMPLES, EXPONENT_EXAMPLES } from '../../lib/hints.js';
import { splitBlanks, wordBankChoices } from '../../lib/blanks.js';

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

export const pointsLabel = (p) => `${p} ${Number(p) === 1 ? 'pt' : 'pts'}`;
const letter = (i) => String.fromCharCode(65 + i);

/** Optional picture on a choice / item (option.image = { url, alt }); null when there is none or the url is unsafe. */
export function optionImageEl(o, className = '') {
  const url = o && o.image && safeImageUrl(o.image.url);
  if (!url) return null;
  return h('img', { class: ['opt-img', className].filter(Boolean).join(' '), src: url, alt: String(o.image.alt || ''), loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', dataset: { testid: 'opt-img' } });
}
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

function choiceBody(o) {
  const img = optionImageEl(o);
  if (!img) return richText(o.text, 'span', 'opt__text');
  return h('span', { class: 'opt__body' }, img, String(o.text).trim() ? richText(o.text, 'span', 'opt__text') : null);
}

function choiceWidget(q, api, multi) {
  const n = q.options.length;
  const btns = q.options.map((o, idx) => {
    const b = h('button', {
      type: 'button',
      class: 'opt',
      role: multi ? 'checkbox' : 'radio',
      'aria-checked': 'false',
      tabindex: multi || idx === 0 ? '0' : '-1',
      dataset: { testid: `option-${o.id}`, optionId: o.id },
      on: {
        click: () => choose(o.id),
        keydown: (e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          const j = (idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
          btns[j].focus();
          if (!multi) api.set(q.id, q.options[j].id);
        },
      },
    },
      h('span', { class: 'opt__badge', 'aria-hidden': 'true' }, letter(idx)),
      choiceBody(o),
      h('span', { class: 'opt__check' }, icon('check', { size: 15 })),
    );
    return b;
  });

  function choose(id) {
    if (!multi) return api.set(q.id, id);
    const cur = new Set(Array.isArray(api.get(q.id)) ? api.get(q.id) : []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    api.set(q.id, q.options.map((o) => o.id).filter((x) => cur.has(x)));
  }

  return {
    el: h('div', { class: 'q-choices' },
      multi ? h('p', { class: 'q-hint', id: `hint-${q.id}` }, 'Select all that apply') : null,
      h('div', { class: 'q-choices__list', role: multi ? 'group' : 'radiogroup', 'aria-labelledby': `qt-${q.id}` }, btns),
    ),
    refresh(answer) {
      const sel = multi ? new Set(Array.isArray(answer) ? answer : []) : new Set(answer == null ? [] : [answer]);
      const firstSel = q.options.findIndex((o) => sel.has(o.id));
      btns.forEach((b, i) => {
        const on = sel.has(q.options[i].id);
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-checked', String(on));
        if (!multi) b.tabIndex = i === (firstSel >= 0 ? firstSel : 0) ? 0 : -1;
      });
    },
    shortcut(key) {
      let idx = -1;
      if (/^[1-9]$/.test(key)) idx = Number(key) - 1;
      else if (/^[a-z]$/.test(key) && key !== 'g' && key !== 'n') idx = key.charCodeAt(0) - 97;
      if (idx < 0 || idx >= n) return false;
      btns[idx].focus({ preventScroll: true });
      choose(q.options[idx].id);
      return true;
    },
  };
}

/* ---- "how to type it" help for charges and exponents */

/** Insert text at the caret of an input and fire its input handler. */
function insertAtCaret(input, text, caretBack = 0) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length - caretBack;
  input.focus();
  input.setSelectionRange(pos, pos);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function helpBox(kind, testid) {
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
function insertBar(input, keys) {
  return h('div', { class: 'q-insert', role: 'group', 'aria-label': 'Insert symbol' },
    keys.map(([label, text, back = 0, title]) => h('button', {
      type: 'button', class: 'q-insert__btn', title: title || `Insert ${text}`, 'aria-label': title || `Insert ${text}`,
      dataset: { testid: `insert-${label}` },
      on: { mousedown: (e) => e.preventDefault(), click: () => insertAtCaret(input, text, back) },
    }, label)));
}

const CHARGE_KEYS = [['^', '^', 0, 'Insert ^ (start a charge)'], ['+', '+', 0, 'Insert + sign'], ['−', '-', 0, 'Insert − sign'], ['( )', '()', 1, 'Insert parentheses'], ['·', '.', 0, 'Insert hydrate dot']];
const EXP_KEYS = [['×10^', 'x10^', 0, 'Insert ×10^'], ['e', 'e', 0, 'Insert e (exponent)'], ['−', '-', 0, 'Insert minus sign']];

function numericWidget(q, api) {
  const previewId = `np-${q.id}`;
  const preview = h('p', { class: 'q-preview', id: previewId, 'aria-live': 'polite', dataset: { testid: 'numeric-preview' } });
  const updatePreview = () => {
    const v = input.value.trim();
    preview.classList.remove('is-error');
    if (!v) { preview.textContent = 'Scientific notation works: 6.02e23 or 6.02 × 10^23'; return; }
    const x = parseNumber(v, { unit: q.unit || '' });
    if (Number.isNaN(x)) { preview.textContent = 'Not a number yet'; preview.classList.add('is-error'); return; }
    preview.textContent = `Interpreted as ${formatInterpreted(x)}`;
  };
  const input = h('input', {
    class: 'input q-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false',
    autocapitalize: 'off', placeholder: 'Enter a number', 'aria-label': 'Your answer', 'aria-describedby': previewId,
    dataset: { testid: 'numeric-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); updatePreview(); } },
  });
  updatePreview();
  const help = formatHelpFor(q);
  return {
    el: h('div', { class: 'q-numeric' },
      help.exponents ? helpBox('exponents', 'exponent-help') : null,
      h('div', { class: 'q-field' }, input, q.unit ? h('span', { class: 'q-unit' }, q.unit) : null),
      help.exponents ? insertBar(input, EXP_KEYS) : null,
      preview),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : answer == null ? '' : String(answer);
      updatePreview();
    },
    focus: () => input.focus(),
  };
}

function formulaWidget(q, api) {
  const preview = h('div', { class: 'q-formula-preview', 'aria-live': 'polite', dataset: { testid: 'formula-preview' } });
  const updatePreview = () => {
    const v = input.value.trim();
    if (!v) {
      preview.classList.add('is-empty');
      preview.textContent = 'Formatted preview appears here';
    } else {
      preview.classList.remove('is-empty');
      // formulaToHTML escapes its input; this is the only HTML string rendered from student input.
      preview.innerHTML = `<span class="formula">${formulaToHTML(input.value)}</span>`;
    }
  };
  const input = h('input', {
    class: 'input q-input q-input--formula', type: 'text', autocomplete: 'off', spellcheck: 'false',
    autocapitalize: 'off', autocorrect: 'off', placeholder: 'e.g. H2SO4', 'aria-label': 'Your answer (chemical formula)',
    dataset: { testid: 'formula-input' },
    on: { input: () => { api.set(q.id, input.value, { debounce: true }); updatePreview(); } },
  });
  updatePreview();
  const help = formatHelpFor(q);
  return {
    el: h('div', { class: 'q-formula' },
      help.charges ? helpBox('charges', 'charge-help') : null,
      input,
      help.charges ? insertBar(input, CHARGE_KEYS)
        : h('p', { class: 'q-hint' }, 'Subscripts are plain numbers: H2O, Ca(OH)2, CuSO4.5H2O. Charges: SO4^2-, Na^+'),
      preview),
    refresh(answer) {
      if (document.activeElement !== input) input.value = typeof answer === 'string' ? answer : '';
      updatePreview();
    },
    focus: () => input.focus(),
  };
}

function trueFalseWidget(q, api) {
  const mk = (val, label, ic) => h('button', {
    type: 'button', class: 'q-tf__btn', role: 'radio', 'aria-checked': 'false', tabindex: '0',
    dataset: { testid: val ? 'tf-true' : 'tf-false' },
    on: { click: () => api.set(q.id, val) },
  }, h('span', { class: 'q-tf__icon' }, icon(ic, { size: 22 })), h('span', {}, label));
  const t = mk(true, 'True', 'check');
  const f = mk(false, 'False', 'x');
  return {
    el: h('div', { class: 'q-tf', role: 'radiogroup', 'aria-labelledby': `qt-${q.id}` }, t, f),
    refresh(answer) {
      t.classList.toggle('is-selected', answer === true);
      f.classList.toggle('is-selected', answer === false);
      t.setAttribute('aria-checked', String(answer === true));
      f.setAttribute('aria-checked', String(answer === false));
    },
    shortcut(key) {
      if (key === 't') { api.set(q.id, true); return true; }
      if (key === 'f') { api.set(q.id, false); return true; }
      return false;
    },
  };
}

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
    case 'mcq': return choiceWidget(q, api, false);
    case 'multi': return choiceWidget(q, api, true);
    case 'numeric': return numericWidget(q, api);
    case 'formula': return formulaWidget(q, api);
    case 'truefalse': return trueFalseWidget(q, api);
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
    default: return { el: h('p', { class: 'muted' }, `Unsupported question type: ${q.type}`), refresh() {} };
  }
}

/* ------------------------------------------------------------------ view */
