// Runner question widgets: per-type answer inputs (choice, numeric, formula, matching, ordering, ...)
// and buildWidget(q, api) which dispatches on question type. Moved out of runner.js unchanged.
// Each widget returns { el, refresh() }.

import { h, richText, renderMath } from '../../ui.js';
import { lewisWidget } from '../lewis-view.js';
import { structureWidget } from '../structure-view.js';
import { orbitalWidget } from '../orbital-view.js';
import { graphWidget } from '../widgets/graph.js';
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
    case 'lewis': return lewisWidget(q, api);
    case 'short': return shortWidget(q, api);
    case 'open': return openWidget(q, api);
    case 'structure': return structureWidget(q, api);
    case 'orbital': return orbitalWidget(q, api);
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
