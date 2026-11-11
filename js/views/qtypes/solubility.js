// `solubility` question type (V5-07, S12c) — student widget, builder editor and review.
// Answer: { [itemId]: 's'|'aq' } (mode 'state') | { precipitate: itemId } (mode 'precipitate'); see js/lib/qtypes/solubility.js.
import { h, icon } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { MODES, MODE_LABELS, STATES, itemState, def } from '../../lib/qtypes/solubility.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const clone = (s) => JSON.parse(JSON.stringify(s));
const STATE_NAMES = { s: 'solid', aq: 'aqueous' };

function widget(q, api) {
  const items = Array.isArray(q.items) ? q.items : [];
  const name = `sol-${q.id}`;
  let answer = isObj(api.get(q.id)) ? clone(api.get(q.id)) : {};
  const updaters = [];
  let focusEl = null;

  const commit = () => {
    const out = answer;
    api.set(q.id, Object.keys(out).length ? clone(out) : undefined, { debounce: true });
  };

  let body;
  if (q.mode === 'precipitate') {
    const radios = items.map((it) => {
      const input = h('input', { type: 'radio', name, value: it.id, class: 'sol-choice__input', checked: answer.precipitate === it.id,
        dataset: { testid: `solubility-product-${it.id}` },
        on: { change: () => { answer = { precipitate: it.id }; commit(); } } });
      if (!focusEl) focusEl = input;
      return h('label', { class: 'sol-choice' }, input, h('span', { class: 'sol-choice__formula' }, str(it.formula)));
    });
    body = h('div', { class: 'sol-choices', role: 'radiogroup', 'aria-label': 'Which compound is the precipitate' }, radios);
  } else {
    const rows = items.map((it) => {
      const btns = {};
      const sync = () => {
        for (const st of STATES) btns[st].setAttribute('aria-pressed', answer[it.id] === st ? 'true' : 'false');
      };
      const set = (st) => {
        if (answer[it.id] === st) delete answer[it.id];
        else answer[it.id] = st;
        sync();
        commit();
      };
      for (const st of STATES) {
        btns[st] = h('button', { type: 'button', class: 'sol-seg__btn', 'aria-pressed': 'false', 'aria-label': `${str(it.formula)} is ${STATE_NAMES[st]}`,
          dataset: { testid: `solubility-product-${it.id}-${st}` }, on: { click: () => set(st) } }, st);
      }
      updaters.push(sync);
      sync();
      if (!focusEl) focusEl = btns.s;
      return h('div', { class: 'sol-row', dataset: { testid: `solubility-product-${it.id}` } },
        h('span', { class: 'sol-row__formula' }, str(it.formula)),
        h('div', { class: 'sol-seg', role: 'group', 'aria-label': `State of ${str(it.formula)}` }, btns.s, btns.aq));
    });
    body = h('div', { class: 'sol-list' }, rows);
  }

  return {
    el: h('div', { class: 'sol-root', dataset: { testid: 'solubility-widget' } }, body),
    refresh(next) {
      answer = isObj(next) ? clone(next) : {};
      updaters.forEach((fn) => fn());
      if (q.mode === 'precipitate') {
        for (const input of body.querySelectorAll('input[type="radio"]')) input.checked = answer.precipitate === input.value;
      }
    },
    focus: () => focusEl && focusEl.focus(),
  };
}

function editor(q, redraw, changed) {
  if (!Array.isArray(q.items)) q.items = [];
  const items = q.items;
  const nextId = () => {
    let n = items.length + 1;
    while (items.some((i) => i.id === `c${n}`)) n += 1;
    return `c${n}`;
  };
  const keyLabel = (it) => {
    const st = itemState(it);
    if (!st) return 'Key: fill in the cation and anion, or choose a state';
    return it.state ? `Key: ${st}` : `Key: ${st} (from the rules)`;
  };

  const rows = items.map((it, i) => {
    const key = h('span', { class: 'sol-ed__key', 'aria-live': 'polite', dataset: { testid: `solubility-ed-key-${i}` } }, keyLabel(it));
    const refreshKey = () => { key.textContent = keyLabel(it); };
    const text = (prop, aria, placeholder) => h('input', { class: 'input', type: 'text', value: str(it[prop]), placeholder, 'aria-label': aria,
      autocomplete: 'off', spellcheck: 'false', dataset: { testid: `solubility-ed-${prop}-${i}` },
      on: { input: (e) => { it[prop] = e.target.value.trim(); refreshKey(); changed(); } } });
    const stateSel = h('select', { class: 'select', 'aria-label': `State of ${str(it.formula) || 'compound'}`, dataset: { testid: `solubility-ed-state-${i}` },
      on: { change: (e) => { if (e.target.value) it.state = e.target.value; else delete it.state; refreshKey(); changed(); } } },
    [h('option', { value: '', selected: !it.state }, 'From the rules'),
      h('option', { value: 's', selected: it.state === 's' }, 'Solid (s)'),
      h('option', { value: 'aq', selected: it.state === 'aq' }, 'Aqueous (aq)')]);
    const remove = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-label': `Remove ${str(it.formula) || 'compound'}`,
      dataset: { testid: `solubility-ed-remove-${i}` },
      on: { click: () => { items.splice(i, 1); changed(); redraw(); } } }, icon('trash', { size: 16 }));
    return h('div', { class: 'sol-ed__row' },
      text('formula', 'Formula', 'AgCl'), text('cation', 'Cation', 'Ag'), text('anion', 'Anion', 'Cl'), stateSel, key, remove);
  });

  const add = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'solubility-ed-add' },
    on: { click: () => { items.push({ id: nextId(), formula: '', cation: '', anion: '' }); changed(); redraw(); } } },
  icon('plus', { size: 16 }), ' Add compound');

  const modeSel = h('select', { class: 'select', 'aria-label': 'Mode', dataset: { testid: 'solubility-mode' },
    on: { change: (e) => { q.mode = e.target.value; changed(); redraw(); } } },
  MODES.map((m) => h('option', { value: m, selected: q.mode === m }, MODE_LABELS[m])));

  return h('div', { class: 'stack' },
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Task'), modeSel),
    h('p', { class: 'field__hint' }, 'Leave the state on "From the rules" to let the cation and anion decide. Choose a state to override.'),
    h('div', { class: 'sol-ed', role: 'group', 'aria-label': 'Compounds' }, rows),
    h('div', null, add));
}

function review(q, answer, { key } = {}) {
  if (key) return h('span', { class: 'sol-review', dataset: { testid: 'solubility-review' } }, h('span', { class: 'sol-review__text' }, def.keyText(q)));
  if (!def.isAnswered(q, answer)) return null;
  return h('span', { class: 'sol-review', dataset: { testid: 'solubility-review' } }, h('span', { class: 'sol-review__text' }, def.answerText(q, answer)));
}

registerTypeUI({ type: 'solubility', widget, editor, review });
export default null;
