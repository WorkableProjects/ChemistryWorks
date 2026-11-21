// The question layout wrapper shared by the runner and the game modes: the prompt (text, image, resources) and the answer
// area. At 1200px and wider a "split" type shows them side by side; a "wide" type stacks them with the answer full width.
import { h } from '../ui.js';
import { typeLayout } from '../lib/qtypes/registry.js';

/** `.q-split` holding the prompt element and the answer elements (nulls are skipped). */
export function qSplit(q, promptEl, ...answerEls) {
  return h('div', { class: 'q-split', dataset: { layout: typeLayout(q.type), testid: 'q-split' } },
    h('div', { class: 'q-split__prompt' }, promptEl),
    h('div', { class: 'q-split__answer' }, ...answerEls.filter(Boolean)));
}
