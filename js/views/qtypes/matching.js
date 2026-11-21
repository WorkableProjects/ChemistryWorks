// `matching` student widget: a grid of radio dots, one row per left item.
import { h, richText } from '../../ui.js';
import { optionImageEl, optLabel } from './shared.js';

function matchingWidget(q, api) {
  const inputs = {}; // `${l}|${r}` -> input
  const head = h('tr', {}, h('td', { class: 'q-match__corner' }),
    q.right.map((r) => h('th', { scope: 'col', class: 'q-match__col' }, optionImageEl(r, 'opt-img--sm'), r.text ? richText(r.text) : null)));
  const rows = q.left.map((l) => h('tr', {},
    h('th', { scope: 'row', class: 'q-match__row' }, optionImageEl(l, 'opt-img--sm'), l.text ? richText(l.text) : null),
    q.right.map((r) => {
      const input = h('input', {
        type: 'radio', class: 'q-dot__input', name: `m-${q.id}-${l.id}`, value: r.id,
        'aria-label': `${optLabel(l)} matches ${optLabel(r)}`,
        dataset: { testid: `match-${l.id}-${r.id}` },
        on: { change: () => api.set(q.id, { ...(api.get(q.id) || {}), [l.id]: r.id }) },
      });
      inputs[`${l.id}|${r.id}`] = input;
      return h('td', { class: 'q-match__cell' }, h('label', { class: 'q-dot' }, input, h('span', { class: 'q-dot__mark', 'aria-hidden': 'true' })));
    }),
  ));
  return {
    el: h('div', { class: 'q-matching' },
      h('p', { class: 'q-hint' }, 'Match each item on the left with one option. Options can be used more than once.'),
      h('div', { class: 'q-match', role: 'group', 'aria-labelledby': `qt-${q.id}` },
        h('table', {}, h('thead', {}, head), h('tbody', {}, rows)))),
    refresh(answer) {
      const a = answer && typeof answer === 'object' ? answer : {};
      for (const l of q.left) for (const r of q.right) inputs[`${l.id}|${r.id}`].checked = a[l.id] === r.id;
    },
  };
}

export default {
  type: 'matching',
  render: ({ q, api }) => matchingWidget(q, api),
};
