// `typeEditor` picks the editor for a question's type and is what the Builder view mounts. Editors load lazily from
// js/views/admin/editors/<type>.js (see loadTypeEditor in js/lib/qtypes/registry.js).
// Each editor mutates the question in place, calls `changed()` for light refreshes and `redraw()` when its shape changes.
import { h } from '../../../ui.js';
import { typeEditorModule, hasTypeUI, loadTypeEditor } from '../../qtypes/registry.js';
import '../../qtypes/index.js'; // registers the older question-type editors

// ---------- per-type editors ----------
export function typeEditor(q, redraw, changed, uid) {
  const mod = typeEditorModule(q.type);
  if (mod) return mod.edit({ q, redraw, changed, uid });
  if (hasTypeUI(q.type)) return deferredEditor(q, redraw, changed, uid);
  return h('p', { class: 'muted' }, `Unknown question type “${q.type}”.`);
}

/** Placeholder for an editor whose module is still loading; it fills itself in when the module arrives. */
function deferredEditor(q, redraw, changed, uid) {
  const el = h('div', { class: 'stack', 'aria-busy': 'true' });
  loadTypeEditor(q.type).then((mod) => {
    el.removeAttribute('aria-busy');
    el.replaceChildren(mod.edit({ q, redraw, changed, uid }));
  }).catch(() => el.replaceChildren(h('p', { class: 'muted' }, 'Could not load this editor.')));
  return el;
}
