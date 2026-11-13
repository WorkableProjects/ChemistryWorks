// Builder editor for `econfig`: one accepted configuration per line, with a superscript preview.
import { h, mount } from '../../../ui.js';
import { configToHTML, parseConfig } from '../../../lib/qtypes/econfig.js';
import { field } from '../common.js';

export function econfigEditor(q, changed) {
  q.answers = Array.isArray(q.answers) ? q.answers : [];
  const chips = h('div', { class: 'adm-chips', 'aria-label': 'Accepted answers preview', dataset: { testid: 'econfig-chips' } });
  const draw = () => mount(chips, q.answers.length
    ? q.answers.map((a) => h('span', { class: ['adm-chip formula', parseConfig(a) ? '' : 'is-invalid'], title: parseConfig(a) ? '' : 'Not a readable configuration', html: configToHTML(a) }))
    : h('span', { class: 'faint' }, 'Accepted configurations preview here'));
  const ta = h('textarea', { class: 'textarea', rows: 3, value: q.answers.join('\n'), spellcheck: 'false', placeholder: '1s2 2s2 2p6 3s1\n[Ne] 3s1', dataset: { testid: 'econfig-answers' },
    on: { input: () => { q.answers = ta.value.split('\n').map((s) => s.trim()).filter(Boolean); draw(); changed(); } } });
  draw();
  return h('div', { class: 'stack' },
    field('Accepted configurations (one per line)', ta, 'Order, spacing, ^ or superscripts and noble-gas cores ([He] … [Rn]) are normalized. List exceptions such as Cr and Cu here.'),
    chips);
}
