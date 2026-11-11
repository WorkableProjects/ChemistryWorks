// Admin command palette (V5-06): Ctrl/Cmd K opens a search to jump to a section, a test or a student.
// Keyboard: type to filter, Up/Down to move, Enter to go, Escape to close.

import { h, icon } from '../../ui.js';

/** Pure: filter items by label (all words must appear), keeping order. */
export function filterItems(items, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return words.length ? items.filter((i) => words.every((w) => `${i.label} ${i.kind}`.toLowerCase().includes(w))) : items;
}

/**
 * Mount the palette on document.body. `getItems()` returns (or resolves to) [{ id, label, kind, run }].
 * Returns { open, close, destroy }.
 */
export function mountPalette({ getItems }) {
  let items = [];
  let shown = [];
  let sel = 0;
  const input = h('input', { class: 'cmdk__input', type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'cmdk-list', 'aria-label': 'Search tests, students and sections', placeholder: 'Jump to a test, student or section', autocomplete: 'off', dataset: { testid: 'command-palette-input' } });
  const list = h('ul', { class: 'cmdk__list', id: 'cmdk-list', role: 'listbox' });
  const box = h('div', { class: 'cmdk__box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' }, input, list);
  const el = h('div', { class: 'cmdk', hidden: true, dataset: { testid: 'command-palette' } }, box);
  let prevFocus = null;

  function draw() {
    shown = filterItems(items, input.value).slice(0, 50);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.replaceChildren(...(shown.length
      ? shown.map((it, i) => h('li', { class: 'cmdk__item', role: 'option', id: `cmdk-${i}`, 'aria-selected': String(i === sel), dataset: { testid: 'command-palette-item' },
        on: { click: () => choose(i), mousemove: () => { if (sel !== i) { sel = i; draw(); } } } },
      icon(it.icon || 'right', { size: 16 }), h('span', {}, it.label), h('span', { class: 'cmdk__kind' }, it.kind)))
      : [h('li', { class: 'cmdk__empty' }, 'Nothing matches')]));
    input.setAttribute('aria-activedescendant', shown.length ? `cmdk-${sel}` : '');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }

  function choose(i) { const it = shown[i]; if (!it) return; close(); try { it.run(); } catch (e) { console.error(e); } }

  async function open() {
    if (!el.hidden) return;
    prevFocus = document.activeElement;
    input.value = ''; sel = 0;
    el.hidden = false;
    try { items = (await getItems()) || []; } catch { items = []; }
    draw();
    input.focus();
  }

  function close() {
    if (el.hidden) return;
    el.hidden = true;
    try { prevFocus?.focus?.(); } catch { /* ignore */ }
  }

  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = shown.length ? (sel + 1) % shown.length : 0; draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = shown.length ? (sel - 1 + shown.length) % shown.length : 0; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') e.preventDefault(); // focus stays in the dialog
  });
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); if (el.hidden) open(); else close(); }
  };
  document.addEventListener('keydown', onKey);
  document.body.append(el);
  return { open, close, destroy: () => { document.removeEventListener('keydown', onKey); el.remove(); } };
}
