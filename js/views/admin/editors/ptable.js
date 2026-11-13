// Builder editor for `ptable`: click the correct element(s) on the same table students use.
import { h } from '../../../ui.js';
import { ptableWidget } from '../../widgets/ptable.js';
import { switchEl } from '../common.js';

export function ptableEditor(q, changed, redraw = () => {}) {
  q.answers = Array.isArray(q.answers) ? q.answers : [];
  const store = { answers: q.answers };
  const api = {
    get: () => q.answers,
    set: (_id, value) => {
      q.answers = Array.isArray(value) ? value : [];
      store.answers = q.answers;
      widget.refresh(q.answers);
      changed();
    },
  };
  const widget = ptableWidget({ id: `${q.id || 'q'}-key`, multiple: q.multiple !== false }, api);
  widget.refresh(q.answers);
  return h('div', { class: 'stack' },
    h('div', { class: 'field__label' }, 'Correct element(s): click to select'),
    widget.el,
    switchEl({ label: 'Allow several elements', hint: 'Off: students pick exactly one element', checked: q.multiple !== false, testid: 'ptable-multiple', onChange: (v) => {
      q.multiple = v;
      if (!v && q.answers.length > 1) q.answers = q.answers.slice(0, 1);
      changed();
      redraw();
    } }),
    switchEl({ label: 'Partial credit', hint: 'Same rule as multiple select', checked: !!q.partialCredit, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }));
}
