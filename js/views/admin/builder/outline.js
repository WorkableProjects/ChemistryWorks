// Builder outline (left pane): every question as a row, with drag and keyboard reordering.

import { h, mount, icon, prefersReducedMotion } from '../../../ui.js';
import { TYPE_LABELS } from '../../../lib/schema.js';
import { groupQuestions } from '../../../lib/sections.js';
import { S, previewText, sectionTitleOf, sectionKey } from './state.js';
import { renderList, focusQuestion, moveQuestion } from './questions.js';
import { TYPE_ICONS } from './menu.js';

// Where each outline row was before a redraw, so rows can slide to their new place.
const prevTops = new WeakMap();

/** The outline element. State it uses lives on the builder context: dragging, outlineFocus. */
export function createOutline(bc) {
  bc.dragging = false;
  bc.outlineFocus = null; // question object to re-focus after a redraw
  bc.outlineEl = h('aside', { class: 'bld2__outline', 'aria-label': 'Test outline', dataset: { testid: 'builder-outline' } });
}

/** Move question i to index j inside its own section; used by drag and drop. */
function reorderTo(bc, i, j) {
  const qs = S.test.questions;
  if (!bc.listEl || i === j || i < 0 || j < 0 || i >= qs.length || j >= qs.length || sectionKey(qs[i]) !== sectionKey(qs[j])) return false;
  const [q] = qs.splice(i, 1);
  qs.splice(j, 0, q);
  bc.outlineFocus = q;
  renderList(bc);
  bc.changed();
  return true;
}

/** Redraws the outline pane. Rows slide from their old place to the new one (FLIP) unless motion is reduced. */
export function drawOutline(bc) {
  const { outlineEl } = bc;
  if (bc.dragging) return;
  const qs = S.test.questions;
  const secs = S.test.sections || [];
  // FLIP: remember where every row was, rebuild, then slide rows from the old spot to the new one.
  outlineEl.querySelectorAll('[data-qi]').forEach((li) => { if (li._q) prevTops.set(li._q, li.getBoundingClientRect().top); });
  const items = [];
  const addItem = (q) => {
    const i = qs.indexOf(q);
    const li = h('li', { class: 'bld2-ol__item', tabindex: '0', dataset: { testid: 'outline-item', qi: String(i), qid: q.id },
      'aria-label': `Question ${i + 1}: ${previewText(q) || TYPE_LABELS[q.type] || q.type}. Enter opens it. Alt plus arrow up or down moves it.`,
      on: {
        click: () => { focusQuestion(bc, qs.indexOf(q)); },
        keydown: (e) => {
          const at = qs.indexOf(q);
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            if (!bc.listEl) return;
            bc.outlineFocus = q;
            moveQuestion(bc, at, e.key === 'ArrowUp' ? -1 : 1);
            drawOutline(bc);
            outlineEl.querySelector(`[data-qi="${qs.indexOf(q)}"]`)?.focus({ preventScroll: true });
          } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusQuestion(bc, at); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const rows = [...outlineEl.querySelectorAll('.bld2-ol__item')];
            rows[rows.indexOf(li) + (e.key === 'ArrowUp' ? -1 : 1)]?.focus();
          }
        },
      } },
    h('span', { class: 'bld2-ol__grip', 'aria-hidden': 'true', title: 'Drag to reorder', style: 'touch-action:none', on: { pointerdown: (e) => startDrag(bc, e, li, q) } }, icon('sort', { size: 16 })),
    h('span', { class: 'bld2-ol__num' }, `Q${i + 1}`),
    icon(TYPE_ICONS[q.type] || 'sparkle', { size: 16 }),
    h('span', { class: 'bld2-ol__text' }, previewText(q) || TYPE_LABELS[q.type] || q.type));
    li._q = q;
    items.push(li);
  };
  if (secs.length) {
    for (const g of groupQuestions(S.test)) {
      const i = g.section ? secs.findIndex((x) => x.id === g.section.id) : -1;
      items.push(h('li', { class: 'bld2-ol__sec', role: 'presentation' }, g.section ? sectionTitleOf(g.section, i) : 'No section'));
      g.questions.forEach(addItem);
    }
  } else qs.forEach(addItem);
  mount(outlineEl,
    h('h3', { class: 'adm-h3' }, icon('list', { size: 16 }), 'Outline'),
    qs.length ? h('ol', { class: 'bld2-ol', dataset: { testid: 'outline-list' } }, items) : h('p', { class: 'faint' }, 'Questions appear here as you add them.'),
    h('p', { class: 'bld2-ol__hint' }, 'Drag the handle, or press Alt + arrow up/down on a row, to reorder.'));
  if (!prefersReducedMotion()) {
    for (const li of items) {
      if (!li._q || !prevTops.has(li._q)) continue;
      const dy = prevTops.get(li._q) - li.getBoundingClientRect().top;
      if (Math.abs(dy) < 2) continue;
      li.style.transition = 'none';
      li.style.transform = `translateY(${dy}px)`;
      void li.offsetWidth;
      li.style.transition = '';
      li.style.transform = '';
    }
  }
  if (bc.outlineFocus) {
    const li = items.find((x) => x._q === bc.outlineFocus);
    bc.outlineFocus = null;
    if (li && outlineEl.contains(document.activeElement) === false && document.activeElement !== document.body && !document.activeElement?.closest?.('.bld2__outline')) { /* focus stays where the user is typing */ }
    else li?.focus({ preventScroll: true });
  }
}

function startDrag(bc, e, li, q) {
  const { outlineEl } = bc;
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  if (!bc.listEl) return;
  const from = S.test.questions.indexOf(q);
  const rows = [...outlineEl.querySelectorAll('.bld2-ol__item')].filter((r) => r._q && sectionKey(r._q) === sectionKey(q));
  // Finish any FLIP move still running (e.g. right after a keyboard reorder) so the measured rows are where they land.
  rows.forEach((r) => r.getAnimations?.().forEach((a) => { try { a.finish(); } catch { /* ignore */ } }));
  const mids = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
  const startY = e.clientY;
  const grip = e.currentTarget;
  bc.dragging = true;
  li.classList.add('is-dragging');
  try { grip.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  const target = (y) => {
    let k = rows.indexOf(li);
    const mine = mids[k] + (y - startY);
    let best = 0;
    mids.forEach((m, idx) => { if (Math.abs(m - mine) < Math.abs(mids[best] - mine)) best = idx; });
    return rows[best] ? S.test.questions.indexOf(rows[best]._q) : S.test.questions.indexOf(q);
  };
  const move = (ev) => { li.style.transform = `translateY(${ev.clientY - startY}px)`; };
  const end = (ev) => {
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', end);
    grip.removeEventListener('pointercancel', end);
    try { grip.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const to = ev.type === 'pointercancel' ? from : target(ev.clientY);
    bc.dragging = false;
    li.classList.remove('is-dragging');
    li.style.transform = '';
    bc.outlineFocus = null;
    if (!reorderTo(bc, from, to)) drawOutline(bc);
  };
  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}
