// A coloured tag chip (students and teachers). `onRemove` adds a remove button.
import { h } from '../ui.js';

export function tagChip(tag, { onRemove, testid } = {}) {
  const name = tag?.name || 'Unknown tag';
  return h('span', { class: ['tag-chip', `tag-chip--${tag?.color || 'slate'}`], dataset: { testid: testid || 'tag-chip' } },
    h('span', { class: 'tag-chip__name' }, name),
    onRemove ? h('button', { class: 'tag-chip__x', type: 'button', 'aria-label': `Remove tag ${name}`, on: { click: onRemove } }, '×') : null);
}
