// V5-01 mode switcher: Study · Classic · Survival · … shown in the runner bar and in every game mode's header.
// The list comes from js/lib/modes/index.js (modesForTest); until that module exists only Study is known, and
// the switcher stays hidden when there is nothing to switch to.
// modeSwitcher({ test, attempt, current, onPick(id) }) -> HTMLElement (empty until the registry has loaded)

import { h, icon } from '../../ui.js';

export function modeSwitcher({ test, attempt, current = 'study', onPick }) {
  const host = h('div', { class: 'mode-switcher', role: 'radiogroup', 'aria-label': 'How to do this practice', hidden: true, dataset: { testid: 'mode-switcher' } });
  const select = h('select', { class: 'mode-switcher__select', 'aria-label': 'How to do this practice', hidden: true, dataset: { testid: 'mode-switcher-select' } });
  const wrap = h('div', { class: 'mode-switcher-wrap' }, host, select);
  import('../../lib/modes/index.js').then(({ modesForTest }) => {
    const list = modesForTest(test, attempt).filter((m) => m.available !== false || m.mode.id === current);
    if (list.length < 2) return;
    const pick = (id) => { if (id !== current) onPick?.(id); };
    for (const { mode, available, reason } of list) {
      const on = mode.id === current;
      host.appendChild(h('button', {
        type: 'button', class: ['mode-switcher__btn', on && 'is-active'], role: 'radio', 'aria-checked': String(on),
        disabled: available === false, title: available === false ? reason || '' : mode.blurb || '',
        dataset: { testid: `mode-option-${mode.id}` }, on: { click: () => pick(mode.id) },
      }, mode.icon ? icon(mode.icon, { size: 16 }) : null, h('span', {}, mode.title)));
      select.appendChild(h('option', { value: mode.id, selected: on, disabled: available === false }, mode.title));
    }
    select.addEventListener('change', () => pick(select.value));
    host.hidden = false;
    select.hidden = false;
  }).catch(() => { /* no mode registry yet: Study only */ });
  return wrap;
}
