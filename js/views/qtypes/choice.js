// Shared widget for `mcq` and `multi`: a list of choice buttons (radio or checkbox semantics).
import { h, icon, richText } from '../../ui.js';
import { optionImageEl } from './shared.js';

const letter = (i) => String.fromCharCode(65 + i);

function choiceBody(o) {
  const img = optionImageEl(o);
  if (!img) return richText(o.text, 'span', 'opt__text');
  return h('span', { class: 'opt__body' }, img, String(o.text).trim() ? richText(o.text, 'span', 'opt__text') : null);
}

export function choiceWidget(q, api, multi) {
  const n = q.options.length;
  const btns = q.options.map((o, idx) => {
    const b = h('button', {
      type: 'button',
      class: 'opt',
      role: multi ? 'checkbox' : 'radio',
      'aria-checked': 'false',
      tabindex: multi || idx === 0 ? '0' : '-1',
      dataset: { testid: `option-${o.id}`, optionId: o.id },
      on: {
        click: () => choose(o.id),
        keydown: (e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          const j = (idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
          btns[j].focus();
          if (!multi) api.set(q.id, q.options[j].id);
        },
      },
    },
      h('span', { class: 'opt__badge', 'aria-hidden': 'true' }, letter(idx)),
      choiceBody(o),
      h('span', { class: 'opt__check' }, icon('check', { size: 15 })),
    );
    return b;
  });

  function choose(id) {
    if (!multi) return api.set(q.id, id);
    const cur = new Set(Array.isArray(api.get(q.id)) ? api.get(q.id) : []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    api.set(q.id, q.options.map((o) => o.id).filter((x) => cur.has(x)));
  }

  return {
    el: h('div', { class: 'q-choices' },
      multi ? h('p', { class: 'q-hint', id: `hint-${q.id}` }, 'Select all that apply') : null,
      h('div', { class: 'q-choices__list', role: multi ? 'group' : 'radiogroup', 'aria-labelledby': `qt-${q.id}` }, btns),
    ),
    refresh(answer) {
      const sel = multi ? new Set(Array.isArray(answer) ? answer : []) : new Set(answer == null ? [] : [answer]);
      const firstSel = q.options.findIndex((o) => sel.has(o.id));
      btns.forEach((b, i) => {
        const on = sel.has(q.options[i].id);
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-checked', String(on));
        if (!multi) b.tabIndex = i === (firstSel >= 0 ? firstSel : 0) ? 0 : -1;
      });
    },
    shortcut(key) {
      let idx = -1;
      if (/^[1-9]$/.test(key)) idx = Number(key) - 1;
      else if (/^[a-z]$/.test(key) && key !== 'g' && key !== 'n') idx = key.charCodeAt(0) - 97;
      if (idx < 0 || idx >= n) return false;
      btns[idx].focus({ preventScroll: true });
      choose(q.options[idx].id);
      return true;
    },
  };
}
