// `dropdown` question type — student widget (native <select>s inline) and builder editor.
import { h, richText } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { splitMarkers, markerIdsOf } from '../../lib/qtypes/dropdown.js';
import { field, switchEl } from '../admin/common.js';

function widget(q, api) {
  const blanks = new Map((q.blanks || []).map((b, i) => [b.id, { ...b, n: i + 1 }]));
  const total = (q.blanks || []).length;
  const selects = new Map();
  const update = (id, value) => {
    const next = { ...(api.get(q.id) || {}) };
    if (value === '') delete next[id]; else next[id] = value;
    api.set(q.id, Object.keys(next).length ? next : undefined);
  };
  const textEl = h('div', { class: 'q-text q-fill q-dropdown' }, splitMarkers(q.text).map((part) => {
    if (part.text !== undefined) return richText(part.text, 'span');
    const b = blanks.get(part.blank);
    if (!b) return h('span', {}, '____');
    const sel = h('select', { class: 'select q-fill__select q-dropdown__select', 'aria-label': `Blank ${b.n} of ${total}`, dataset: { testid: `dropdown-${b.id}` },
      on: { change: () => update(b.id, sel.value) } },
    h('option', { value: '' }, `(${b.n}) choose…`), b.options.map((o) => h('option', { value: o }, o)));
    selects.set(b.id, sel);
    return h('span', { class: 'q-fill__slot' }, sel);
  }));
  return {
    textEl,
    el: h('div', { class: 'q-fillwrap' }, h('p', { class: 'q-hint' }, 'Choose an answer from each menu.')),
    refresh(answer) {
      const a = answer && typeof answer === 'object' ? answer : {};
      for (const [id, sel] of selects) sel.value = a[id] == null ? '' : String(a[id]);
    },
    focus: () => selects.values().next().value?.focus(),
  };
}

function editor(q, redraw, changed) {
  q.blanks = Array.isArray(q.blanks) ? q.blanks : [];
  const text = h('textarea', { class: 'textarea', rows: 3, 'aria-label': 'Passage with blanks', dataset: { testid: 'dropdown-text' } });
  text.value = q.text || '';
  const hint = h('span', { class: 'field__hint', dataset: { testid: 'dropdown-hint' } });
  const sync = () => {
    const ids = markerIdsOf(q.text);
    hint.textContent = ids.length ? `Blanks found: ${ids.join(', ')}` : 'Write blanks in the question text like [[b1]].';
  };
  sync();
  const outOfSync = () => {
    const ids = [...new Set(markerIdsOf(q.text))];
    const have = new Set(q.blanks.map((b) => b.id));
    return ids.some((id) => !have.has(id)) || q.blanks.some((b) => !ids.includes(b.id));
  };
  const addMissing = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'dropdown-sync' }, on: { click: () => {
    const ids = [...new Set(markerIdsOf(q.text))];
    const byId = new Map(q.blanks.map((b) => [b.id, b]));
    q.blanks = ids.map((id) => byId.get(id) || { id, options: ['', ''], answer: '' });
    redraw(); changed();
  } } }, 'Match blank list to the text');
  text.addEventListener('input', () => { q.text = text.value; sync(); addMissing.hidden = !outOfSync(); changed(); });
  addMissing.hidden = !outOfSync();
  const rows = q.blanks.map((b, bi) => {
    b.options = Array.isArray(b.options) ? b.options : [];
    const opts = b.options.map((o, oi) => {
      const radio = h('input', { type: 'radio', name: `dd-${q.id}-${bi}`, checked: o !== '' && b.answer === o, 'aria-label': `Option ${oi + 1} of blank ${bi + 1} is correct`, dataset: { testid: `dropdown-correct-${bi}-${oi}` },
        on: { change: () => { b.answer = b.options[oi]; changed(); } } });
      const inp = h('input', { class: 'input', value: o, autocomplete: 'off', 'aria-label': `Blank ${bi + 1} option ${oi + 1}`, dataset: { testid: `dropdown-option-${bi}-${oi}` },
        on: { input: () => { if (b.answer === b.options[oi]) b.answer = inp.value; b.options[oi] = inp.value; radio.checked = b.answer === inp.value && inp.value !== ''; changed(); } } });
      const rm = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-label': `Remove option ${oi + 1} of blank ${bi + 1}`, on: { click: () => { const [gone] = b.options.splice(oi, 1); if (b.answer === gone) b.answer = ''; redraw(); changed(); } } }, 'Remove');
      return h('div', { class: 'dropdown-ed__opt' }, radio, inp, rm);
    });
    const add = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: `dropdown-add-option-${bi}` }, on: { click: () => { b.options.push(''); redraw(); changed(); } } }, 'Add option');
    return h('fieldset', { class: 'dropdown-ed__blank' }, h('legend', {}, `Blank ${bi + 1} — [[${b.id}]]`), h('p', { class: 'field__hint' }, 'Select the radio next to the correct option.'), opts, add);
  });
  return h('div', { class: 'stack' },
    field('Passage with blanks', text, 'Write each blank as [[b1]], [[b2]] …'), hint, addMissing,
    rows,
    switchEl({ label: 'Partial credit', hint: 'Points for each blank answered correctly', checked: q.partialCredit !== false, testid: 'partial-credit', onChange: (v) => { q.partialCredit = v; changed(); } }));
}

export default registerTypeUI({ type: 'dropdown', widget, editor });
