// "By topic" list: one row per tag with its points and a bar. Used by student results, feedback and profile, and by the
// teacher views (grading, tracker). Rows come from tag-stats.js (`withNames` adds name and color).
import { h } from '../ui.js';
import { ensureCss } from '../lib/css-loader.js';

const fmt = (n) => String(Math.round(Number(n) * 100) / 100);

/** A small tag chip (the builder chip without the remove button). */
export function tagLabel(row) {
  ensureCss('tags');
  return h('span', { class: ['tag-chip', row.unknown && 'is-unknown'], dataset: { color: row.color || 'gray', tagId: row.id } },
    h('span', { class: 'tag-chip__name' }, row.name));
}

/**
 * rows: [{ id, name, color, unknown, earned, possible, percent }]. Returns null when there are no rows.
 * options: { title, testid, tag: 'h2'|'h3', hint, unit }
 */
export function tagSummary(rows, { title = 'By topic', testid = 'tag-summary', tag = 'h3', hint = '', unit = 'pts' } = {}) {
  if (!rows || !rows.length) return null;
  ensureCss('tags');
  return h('section', { class: 'tag-sum', 'aria-label': title, dataset: { testid } },
    h(tag, { class: 'tag-sum__title' }, title),
    hint ? h('p', { class: 'tag-sum__hint faint' }, hint) : null,
    h('ul', { class: 'tag-sum__list' }, rows.map((r) => h('li', { class: 'tag-sum__row', dataset: { testid: `${testid}-row`, tagId: r.id } },
      h('span', { class: 'tag-sum__name' }, tagLabel(r)),
      h('span', { class: 'tag-sum__bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(r.percent), 'aria-label': `${r.name} score` },
        h('span', { class: 'tag-sum__fill', style: { width: `${Math.max(0, Math.min(100, r.percent))}%` } })),
      h('span', { class: 'tag-sum__pct mono', dataset: { testid: `${testid}-pct` } }, `${Math.round(r.percent)}%`),
      h('span', { class: 'tag-sum__pts faint' }, `${fmt(r.earned)} / ${fmt(r.possible)} ${unit}`)))));
}

/**
 * A "Topic" select for the study modes. options: [{ id, name, count }] from topicOptions. `onChange(tagId)` gets '' for all topics.
 * Returns null when there are no tags to filter by.
 */
export function topicFilter(options, { value = '', onChange, testid = 'topic-filter' } = {}) {
  if (!options || !options.length) return null;
  const sel = h('select', { class: 'select', 'aria-label': 'Topic', dataset: { testid }, on: { change: () => onChange?.(sel.value) } },
    h('option', { value: '' }, 'All topics'), options.map((o) => h('option', { value: o.id }, `${o.name} (${o.count})`)));
  sel.value = value;
  return h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Topic'), sel);
}
