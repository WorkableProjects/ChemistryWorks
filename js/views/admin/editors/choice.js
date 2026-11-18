// Shared editor for `mcq` and `multi`: option rows with a radio or checkbox for the correct ones.
import { h, icon } from '../../../ui.js';
import { switchEl, iconButton } from '../common.js';
import { letterId, optionImageControl } from './shared.js';

export function choiceEditor(q, redraw, changed, uid) {
  const multi = q.type === 'multi';
  q.options = Array.isArray(q.options) ? q.options : [];
  if (multi && !Array.isArray(q.correctAnswer)) q.correctAnswer = q.correctAnswer ? [q.correctAnswer] : [];
  const rows = q.options.map((o, i) => {
    const checked = multi ? q.correctAnswer.includes(o.id) : q.correctAnswer === o.id;
    const mark = h('input', { type: multi ? 'checkbox' : 'radio', name: `correct-${uid}`, checked, 'aria-label': `Option ${i + 1} is correct`, dataset: { testid: `option-correct-${i}` },
      on: { change: () => {
        if (multi) {
          const set = new Set(q.correctAnswer);
          if (mark.checked) set.add(o.id); else set.delete(o.id);
          q.correctAnswer = q.options.map((x) => x.id).filter((id) => set.has(id));
        } else {
          q.correctAnswer = o.id;
        }
        changed();
      } } });
    const txt = h('input', { class: 'input', value: o.text || '', placeholder: `Option ${i + 1}`, 'aria-label': `Option ${i + 1} text`, dataset: { testid: `option-text-${i}` },
      on: { input: () => { o.text = txt.value; changed(); } } });
    const rm = iconButton('x', 'Remove option', () => {
      q.options.splice(i, 1);
      if (multi) q.correctAnswer = q.correctAnswer.filter((id) => id !== o.id);
      else if (q.correctAnswer === o.id) q.correctAnswer = q.options[0]?.id ?? '';
      redraw();
      changed();
    }, { testid: `option-remove-${i}` });
    return h('div', { class: 'adm-optwrap' }, h('div', { class: 'adm-opt' }, mark, txt, rm), optionImageControl(o, changed, `option-${i}`));
  });
  return h('div', { class: 'stack' },
    h('div', { class: 'field__label' }, multi ? 'Options (tick every correct one)' : 'Options (select the correct one)'),
    h('div', { class: 'adm-opts' }, rows),
    h('div', { class: 'row row--wrap' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'add-option' }, on: { click: (e) => {
        const sec = e.currentTarget.closest('.adm-typesec');
        q.options.push({ id: letterId(q.options), text: '' });
        redraw();
        changed();
        sec?.querySelector(`[data-testid="option-text-${q.options.length - 1}"]`)?.focus();
      } } }, icon('plus', { size: 16 }), 'Add option'),
      multi ? switchEl({ label: 'Partial credit', checked: !!q.partialCredit, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }) : null));
}
