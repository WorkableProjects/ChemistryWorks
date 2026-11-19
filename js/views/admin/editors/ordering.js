// `ordering` editor: the items in their correct order.
import { h, icon } from '../../../ui.js';
import { field, switchEl, iconButton } from '../common.js';
import { uniqueId, optionImageControl } from './shared.js';

function orderingEditor(q, redraw, changed) {
  q.items = Array.isArray(q.items) ? q.items : [];
  const sync = () => { q.correctAnswer = q.items.map((it) => it.id); };
  sync();
  const rows = q.items.map((it, i) => {
    const txt = h('input', { class: 'input', value: it.text || '', placeholder: `Item ${i + 1}`, 'aria-label': `Item ${i + 1} (correct position ${i + 1})`, dataset: { testid: `order-item-${i}` },
      on: { input: () => { it.text = txt.value; changed(); } } });
    const mv = (d) => { const j = i + d; if (j < 0 || j >= q.items.length) return; [q.items[i], q.items[j]] = [q.items[j], q.items[i]]; sync(); redraw(); changed(); };
    return h('div', { class: 'adm-optwrap' }, h('div', { class: 'adm-opt adm-opt--order' },
      h('span', { class: 'adm-blank__num' }, String(i + 1)), txt,
      iconButton('up', 'Move up', () => mv(-1), { testid: `order-up-${i}` }),
      iconButton('down', 'Move down', () => mv(1), { testid: `order-down-${i}` }),
      iconButton('x', 'Remove item', () => { q.items.splice(i, 1); sync(); redraw(); changed(); }, { testid: `order-remove-${i}` })),
    optionImageControl(it, changed, `order-item-${i}`));
  });
  const top = h('input', { class: 'input', value: q.topLabel || '', placeholder: 'e.g. Lowest', dataset: { testid: 'order-top-label' }, on: { input: () => { q.topLabel = top.value; changed(); } } });
  const bottom = h('input', { class: 'input', value: q.bottomLabel || '', placeholder: 'e.g. Highest', dataset: { testid: 'order-bottom-label' }, on: { input: () => { q.bottomLabel = bottom.value; changed(); } } });
  return h('div', { class: 'stack' },
    h('div', { class: 'field__label' }, 'Items in the CORRECT order (students see them scrambled)'),
    h('div', { class: 'adm-opts' }, rows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-order-item' }, on: { click: () => {
        q.items.push({ id: uniqueId('i', q.items), text: '' }); sync(); redraw(); changed();
      } } }, icon('plus', { size: 16 }), 'Add item'),
      switchEl({ label: 'Partial credit', hint: 'Points for each item in the right position', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } })),
    h('div', { class: 'adm-grid adm-grid--4' }, field('Label above the list', top, 'Optional'), field('Label below the list', bottom, 'Optional')));
}

export default { type: 'ordering', edit: ({ q, redraw, changed }) => orderingEditor(q, redraw, changed) };
