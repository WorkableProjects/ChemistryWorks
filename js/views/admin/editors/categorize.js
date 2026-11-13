// Builder editor for `categorize`: the groups, then the items with the group each one belongs to.
import { h, icon } from '../../../ui.js';
import { field, switchEl, iconButton } from '../common.js';

const uniqueId = (prefix, list) => {
  const used = new Set(list.map((x) => x.id));
  let n = list.length + 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

export function categorizeEditor(q, redraw, changed) {
  q.categories = Array.isArray(q.categories) ? q.categories : [];
  q.items = Array.isArray(q.items) ? q.items : [];

  const catRows = q.categories.map((c, i) => {
    const label = h('input', { class: 'input', value: c.label || '', placeholder: `Group ${i + 1}, e.g. Ionic`, 'aria-label': `Group ${i + 1} name`, dataset: { testid: `cat-label-${i}` },
      on: { input: () => { c.label = label.value; changed(); } } });
    const id = h('input', { class: 'input', value: c.id || '', 'aria-label': `Group ${i + 1} id`, style: 'width:9em', dataset: { testid: `cat-id-${i}` },
      on: { change: () => {
        const next = id.value.trim();
        if (!next || q.categories.some((x, j) => j !== i && x.id === next)) { id.value = c.id; return; }
        for (const it of q.items) if (it.category === c.id) it.category = next;
        c.id = next; changed(); redraw();
      } } });
    return h('div', { class: 'adm-opt' }, label, id, iconButton('x', 'Remove group', () => {
      const gone = q.categories.splice(i, 1)[0];
      for (const it of q.items) if (it.category === gone.id) it.category = q.categories[0]?.id || '';
      redraw(); changed();
    }, { testid: `cat-remove-${i}` }));
  });

  const itemRows = q.items.map((it, i) => {
    const text = h('input', { class: 'input', value: it.text || '', placeholder: `Item ${i + 1}, e.g. NaCl`, 'aria-label': `Item ${i + 1} text`, dataset: { testid: `cat-item-text-${i}` },
      on: { input: () => { it.text = text.value; changed(); } } });
    const sel = h('select', { class: 'select', 'aria-label': `Item ${i + 1} belongs to`, dataset: { testid: `cat-item-cat-${i}` }, on: { change: () => { it.category = sel.value; changed(); } } },
      q.categories.map((c) => h('option', { value: c.id }, c.label || c.id)));
    sel.value = q.categories.some((c) => c.id === it.category) ? it.category : '';
    if (!sel.value && q.categories[0]) { it.category = q.categories[0].id; sel.value = it.category; }
    return h('div', { class: 'adm-opt' }, text, sel, iconButton('x', 'Remove item', () => { q.items.splice(i, 1); redraw(); changed(); }, { testid: `cat-item-remove-${i}` }));
  });

  return h('div', { class: 'stack' },
    h('div', { class: 'field__label' }, 'Groups (the bins students sort into)'),
    h('div', { class: 'adm-opts' }, catRows),
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-category' }, on: { click: () => {
      q.categories.push({ id: uniqueId('c', q.categories), label: '' }); redraw(); changed();
    } } }, icon('plus', { size: 16 }), 'Add group'),
    h('div', { class: 'field__label' }, 'Items and the group each belongs to'),
    h('div', { class: 'adm-opts' }, itemRows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-cat-item' }, on: { click: () => {
        q.items.push({ id: uniqueId('i', q.items), text: '', category: q.categories[0]?.id || '' }); redraw(); changed();
      } } }, icon('plus', { size: 16 }), 'Add item'),
      switchEl({ label: 'Partial credit', hint: 'Points for each item put in the right group', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } })));
}
