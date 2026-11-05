// Per-question scratchpad (V4-05): typed notes + a simple pen canvas. Lives inside the question card as a <details>.
// scratchpad({ qid, get, set }) -> { el, refresh() }; get() returns the stored scratch, set(scratch) saves it (debounced by the caller).
// Never submitted: the runner keeps it in saved progress only.

import { h } from '../../ui.js';
import { SCRATCH_W, SCRATCH_H, MAX_TEXT, normalizeScratch, addStroke, undoStroke } from './scratch-model.js';

export function scratchpad({ qid, get, set }) {
  const textarea = h('textarea', {
    class: 'textarea scratch__text', rows: '3', maxlength: String(MAX_TEXT), 'aria-label': 'Scratchpad notes (not submitted)',
    placeholder: 'Notes for yourself. They are not submitted.', dataset: { testid: 'scratch-text' },
  });
  const canvas = h('canvas', { class: 'scratch__canvas', width: String(SCRATCH_W), height: String(SCRATCH_H), role: 'img',
    'aria-label': 'Scratchpad drawing area. Draw with a mouse, finger or pen.', dataset: { testid: 'scratch-canvas' } });
  let drawing = null;

  const ctx2d = () => canvas.getContext?.('2d') || null;
  function redraw(strokes) {
    const g = ctx2d();
    if (!g) return;
    g.clearRect(0, 0, SCRATCH_W, SCRATCH_H);
    g.strokeStyle = getComputedStyle(canvas).color || '#000';
    g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of strokes) {
      g.beginPath();
      s.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (s.length === 1) g.lineTo(s[0][0] + 0.01, s[0][1]);
      g.stroke();
    }
  }
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / (r.width || 1)) * SCRATCH_W), Math.round(((e.clientY - r.top) / (r.height || 1)) * SCRATCH_H)];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    drawing = [point(e)];
    redraw([...normalizeScratch(get()).strokes, drawing]);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    drawing.push(point(e));
    redraw([...normalizeScratch(get()).strokes, drawing]);
  });
  const end = () => {
    if (!drawing) return;
    const next = addStroke(get(), drawing);
    drawing = null;
    set(next);
    redraw(next.strokes);
    syncButtons();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  textarea.addEventListener('input', () => set({ ...normalizeScratch(get()), text: textarea.value }));
  textarea.addEventListener('keydown', (e) => e.stopPropagation()); // typing G / N / R here must not trigger runner shortcuts

  const undo = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'scratch-undo' }, on: { click: () => { const n = undoStroke(get()); set(n); redraw(n.strokes); syncButtons(); } } }, 'Undo stroke');
  const clear = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'scratch-clear' }, on: { click: () => { set({ text: '', strokes: [] }); textarea.value = ''; redraw([]); syncButtons(); } } }, 'Clear pad');
  const dot = h('span', { class: 'scratch__dot', hidden: true, 'aria-hidden': 'true' });
  const summary = h('summary', { class: 'scratch__summary', dataset: { testid: 'scratch-toggle' } }, 'Scratchpad', dot);
  const el = h('details', { class: 'scratch', dataset: { testid: 'scratchpad', questionId: qid } },
    summary,
    h('div', { class: 'scratch__body' }, textarea, canvas, h('div', { class: 'scratch__actions' }, undo, clear)));
  function syncButtons() {
    const s = normalizeScratch(get());
    undo.disabled = !s.strokes.length;
    dot.hidden = !(s.text.trim() || s.strokes.length);
  }
  el.addEventListener('toggle', () => { if (el.open) redraw(normalizeScratch(get()).strokes); });
  return {
    el,
    refresh() {
      const s = normalizeScratch(get());
      if (textarea.value !== s.text) textarea.value = s.text;
      if (el.open) redraw(s.strokes);
      syncButtons();
    },
  };
}
