// `ordering` student widget: a draggable list with up and down buttons.
import { h, icon, richText, renderMath } from '../../ui.js';
import { optionImageEl, optLabel } from './shared.js';

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

export default {
  type: 'ordering',
  render: ({ q, api }) => orderingWidget(q, api),
};
