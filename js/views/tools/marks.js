// Highlighter and strike-out for a question card (V4-05). Keyboard reachable: toolbar buttons are normal buttons,
// strike mode turns option clicks (Enter / Space on a focused option too) into "rule out", and X toggles a focused option.
// marksBar({ card, qid, getStruck, setStruck }) -> { el, refresh() }

import { h, toast } from '../../ui.js';

/** Wrap the current text selection (inside `container`) in <mark>. Returns false when it cannot. */
export function highlightSelection(container) {
  const sel = typeof getSelection === 'function' ? getSelection() : null;
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return false;
  const mark = document.createElement('mark');
  mark.className = 'tool-mark';
  try { range.surroundContents(mark); } catch { return false; }
  sel.removeAllRanges();
  return true;
}

export function clearHighlights(container) {
  container.querySelectorAll('mark.tool-mark').forEach((m) => { m.replaceWith(...m.childNodes); });
  container.normalize();
}

export function marksBar({ card, qid, getStruck, setStruck }) {
  let strikeMode = false;
  const textArea = () => card.querySelector('.q-text');
  const options = () => [...card.querySelectorAll('.opt[data-option-id]')];
  const hasOptions = () => options().length > 0;

  const hl = h('button', { type: 'button', class: 'btn btn--ghost btn--sm tool-btn', dataset: { testid: 'mark-highlight' },
    title: 'Select text in the question, then press to highlight it',
    on: { click: () => {
      const t = textArea();
      if (!t || !highlightSelection(t)) toast('Select some plain text in the question first.', { type: 'info' });
    } } }, 'Highlight');
  const unhl = h('button', { type: 'button', class: 'btn btn--ghost btn--sm tool-btn', dataset: { testid: 'mark-clear-highlights' },
    on: { click: () => { const t = textArea(); if (t) clearHighlights(t); } } }, 'Clear highlights');
  const strike = h('button', { type: 'button', class: 'btn btn--ghost btn--sm tool-btn', 'aria-pressed': 'false', hidden: true, dataset: { testid: 'mark-strike-mode' },
    title: 'Strike-out mode: choosing an option rules it out instead. You can also press X on a focused option.',
    on: { click: () => { strikeMode = !strikeMode; sync(); } } }, 'Strike out');

  function toggleStruck(optEl) {
    const id = optEl.dataset.optionId;
    const cur = new Set(getStruck());
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    setStruck([...cur]);
    refresh();
  }
  function sync() {
    strike.setAttribute('aria-pressed', String(strikeMode));
    strike.classList.toggle('is-on', strikeMode);
    card.classList.toggle('is-strike-mode', strikeMode);
  }
  function refresh() {
    const struck = new Set(getStruck());
    strike.hidden = !hasOptions();
    for (const o of options()) {
      const on = struck.has(o.dataset.optionId);
      o.classList.toggle('is-struck', on);
      let sr = o.querySelector('.tool-struck-sr');
      if (on && !sr) { sr = h('span', { class: 'sr-only tool-struck-sr' }, ' (ruled out)'); o.appendChild(sr); }
      if (!on && sr) sr.remove();
    }
  }
  // Capture phase: in strike mode the click never reaches the option's own handler, so the answer does not change.
  card.addEventListener('click', (e) => {
    const o = strikeMode ? e.target.closest?.('.opt[data-option-id]') : null;
    if (!o || !card.contains(o)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    toggleStruck(o);
  }, true);
  card.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'x' || e.ctrlKey || e.metaKey || e.altKey) return;
    const o = e.target.closest?.('.opt[data-option-id]');
    if (!o) return;
    e.preventDefault(); e.stopPropagation();
    toggleStruck(o);
  });
  const el = h('div', { class: 'tool-marks', role: 'group', 'aria-label': 'Marking tools', dataset: { testid: 'marks-bar' } }, hl, unhl, strike);
  return { el, refresh };
}
