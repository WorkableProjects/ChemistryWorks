// Keyboard shortcuts, the shortcuts help modal, and the page listeners (visibility, pagehide, beforeunload).

import { h, openModal } from '../../ui.js';

/** Opens the shortcuts help. Keeps the modal on rt.shortcutsModal so it can be closed on submit and cleanup. */
export function openShortcuts(rt) {
  if (rt.shortcutsModal) return;
  const row = (keys, desc) => h('div', { class: 'runner-kbd-row' },
    h('span', { class: 'runner-kbd-keys' }, keys.map((k) => h('kbd', {}, k))), h('span', {}, desc));
  rt.shortcutsModal = openModal({
    title: 'Keyboard shortcuts',
    testid: 'shortcuts-modal',
    onClose: () => { rt.shortcutsModal = null; },
    body: h('div', { class: 'runner-kbd' },
      row(['←', '→'], 'Previous / next question (focus view)'),
      row(['1', '–', '9'], 'Select option by number (multiple choice / select)'),
      row(['A', '–', 'Z'], 'Select option by letter'),
      row(['T', 'F'], 'True / False'),
      row(['G'], 'Flag or unflag the current question'),
      row(['N'], 'Open the question navigator'),
      rt.refPane ? row(['R'], 'Show or hide the reference pane') : null,
      row(['Enter'], 'In an answer box: go to the next question'),
      row(['?'], 'Show this help')),
    actions: [{ label: 'Got it', variant: 'primary', onClick: (close) => close() }],
  });
}

function makeKeyHandler(rt) {
  const { state, total, ordered } = rt;
  return function onKeyDown(e) {
    if (e.defaultPrevented || state.submitting || state.done) return;
    if (e.key === 'Escape' && rt.drawerIsOpen()) { rt.closeDrawer({ remember: true }); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('#modal-root .modal-overlay.is-open')) return;
    const t = e.target;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) {
      if (e.key === 'Enter' && tag === 'INPUT' && t.type === 'text' && state.mode === 'focus' && state.index < total - 1) {
        e.preventDefault();
        rt.goTo(state.index + 1, { focus: true, focusInput: true });
      }
      return;
    }
    const key = e.key;
    if (key === 'ArrowRight' && state.mode === 'focus') { e.preventDefault(); rt.goTo(state.index + 1); return; }
    if (key === 'ArrowLeft' && state.mode === 'focus') { e.preventDefault(); rt.goTo(state.index - 1); return; }
    if (key === '?') { e.preventDefault(); openShortcuts(rt); return; }
    const lower = key.length === 1 ? key.toLowerCase() : '';
    if (lower === 'g') { e.preventDefault(); rt.toggleFlag(ordered[state.index].id); return; }
    if (lower === 'n') { e.preventDefault(); if (rt.drawerIsOpen()) rt.closeDrawer({ remember: true }); else rt.openDrawer({ remember: true }); return; }
    if (lower === 'r' && rt.refPane) { e.preventDefault(); rt.refPane.toggle(); return; }
    if (lower && rt.cards[state.index].widget.shortcut?.(lower)) e.preventDefault();
  };
}

/** Adds the document and window listeners. Returns a function that removes them. */
export function installListeners(rt) {
  const { state, preview, attempt } = rt;
  const onKeyDown = makeKeyHandler(rt);
  // A reload/navigation also fires visibilitychange; beforeunload runs first, so skip those.
  let unloading = false;
  const onBeforeUnload = () => { unloading = true; };
  function onVisibility() {
    if (document.visibilityState !== 'hidden' || unloading || preview || state.done || state.submitting) return;
    state.tabSwitches += 1;
    rt.persist();
  }
  const onPageHide = () => { if (attempt.pending()) rt.saveNow(); };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}
