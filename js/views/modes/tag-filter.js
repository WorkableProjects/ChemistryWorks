// "Practise only <tag>": a select over the tags a test's questions use. Null when the test has no tags.
import { h } from '../../ui.js';
import { tagLookup } from '../../lib/tags.js';

export function tagFilter(questions, test, onChange, { testid = 'mode-tag-filter' } = {}) {
  const ids = [...new Set((questions || []).flatMap((q) => q.tags || []))];
  if (!ids.length) return null;
  const look = tagLookup({ local: [], index: test?.tagIndex || {} });
  const named = ids.filter((id) => look.has(id));
  if (!named.length) return null;
  const sel = h('select', { class: 'select', 'aria-label': 'Practise only', dataset: { testid }, on: { change: () => onChange(sel.value) } },
    h('option', { value: '' }, 'All topics'), named.map((id) => h('option', { value: id }, look.get(id).name)));
  return h('label', { class: 'field mode-tag-filter' }, h('span', { class: 'field__label' }, 'Practise only'), sel);
}

/** Question IDs (from `ids`) whose question carries `tag`; all of them when tag is ''. */
export function idsWithTag(ids, byId, tag) {
  return tag ? ids.filter((id) => (byId.get(id)?.tags || []).includes(tag)) : ids;
}
