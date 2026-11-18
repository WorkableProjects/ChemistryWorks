// `truefalse` student widget: two buttons.
import { h, icon } from '../../ui.js';

function trueFalseWidget(q, api) {
  const mk = (val, label, ic) => h('button', {
    type: 'button', class: 'q-tf__btn', role: 'radio', 'aria-checked': 'false', tabindex: '0',
    dataset: { testid: val ? 'tf-true' : 'tf-false' },
    on: { click: () => api.set(q.id, val) },
  }, h('span', { class: 'q-tf__icon' }, icon(ic, { size: 22 })), h('span', {}, label));
  const t = mk(true, 'True', 'check');
  const f = mk(false, 'False', 'x');
  return {
    el: h('div', { class: 'q-tf', role: 'radiogroup', 'aria-labelledby': `qt-${q.id}` }, t, f),
    refresh(answer) {
      t.classList.toggle('is-selected', answer === true);
      f.classList.toggle('is-selected', answer === false);
      t.setAttribute('aria-checked', String(answer === true));
      f.setAttribute('aria-checked', String(answer === false));
    },
    shortcut(key) {
      if (key === 't') { api.set(q.id, true); return true; }
      if (key === 'f') { api.set(q.id, false); return true; }
      return false;
    },
  };
}

export default {
  type: 'truefalse',
  render: ({ q, api }) => trueFalseWidget(q, api),
};
