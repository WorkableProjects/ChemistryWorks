// Runner question widgets: per-type answer inputs (choice, numeric, formula, matching, ordering, ...)
// and buildWidget(q, api) which dispatches on question type. Moved out of runner.js unchanged.
// Each widget returns { el, refresh() }.

import { h, renderMath } from '../../ui.js';
import { typeUI, hasTypeUI, loadTypeUI } from '../qtypes/registry.js';
import { optionImageEl } from '../qtypes/shared.js';
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

/* ------------------------------------------------------------------ widgets */
// Every widget returns { el, refresh(answer), focus?(), shortcut?(key) }. Widgets never own state: they call
// api.set(questionId, value, { debounce }) and the runner calls refresh() with the stored answer.

export function buildWidget(q, api) {
  const ui = typeUI(q.type);
  if (ui?.render) return ui.render({ q, api, readOnly: false, uid: q.id });
  if (ui?.widget) return ui.widget(q, api);
  if (hasTypeUI(q.type)) return deferredWidget(q, api);
  return { el: h('p', { class: 'muted' }, `Unsupported question type: ${q.type}`), refresh() {} };
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
