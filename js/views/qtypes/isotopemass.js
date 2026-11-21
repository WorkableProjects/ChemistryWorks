// `isotopemass` question type — student widget, builder editor and review.
// Answer: { result } | { missing } | { rows: [{ mass, abundance }], result }; see js/lib/qtypes/isotopemass.js.
import { h } from '../../ui.js';
import { registerTypeUI } from './registry.js';
import { field, switchEl } from '../admin/common.js';
import { ASK_MODES, ASK_LABELS, averageMass, missingIdx, missingKey } from '../../lib/qtypes/isotopemass.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const toState = (q, a) => {
  const n = (q.isotopes || []).length;
  const rows = Array.isArray(a && a.rows) ? a.rows : [];
  return {
    result: str(a && a.result), missing: str(a && a.missing),
    rows: Array.from({ length: n }, (_, i) => ({ mass: str(rows[i] && rows[i].mass), abundance: str(rows[i] && rows[i].abundance), part: str(rows[i] && rows[i].part) })),
  };
};
const clone = (s) => JSON.parse(JSON.stringify(s));
const label = (q, i, n) => i.label || `${q.element || 'Isotope'} ${n + 1}`;
const cell = (cls, props) => h('input', { class: `input q-input q-iso__in ${cls}`, type: 'text', autocomplete: 'off', spellcheck: 'false', ...props });

function givenTable(q, hide) {
  return h('table', { class: 'q-iso__table', dataset: { testid: 'isotopemass-given' } },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Isotope'), h('th', { scope: 'col' }, 'Mass (amu)'), h('th', { scope: 'col' }, 'Abundance (%)'))),
    h('tbody', null, (q.isotopes || []).map((i, n) => h('tr', { dataset: { testid: `isotopemass-given-${n}` } },
      h('th', { scope: 'row' }, label(q, i, n)), h('td', null, str(i.mass)),
      h('td', null, hide === n ? '?' : str(i.abundance))))));
}

function widget(q, api) {
  let state = toState(q, api.get(q.id));
  const ask = q.ask || 'average';
  const commit = () => {
    const out = {};
    if (ask === 'abundance') { if (state.missing.trim()) out.missing = state.missing; }
    else {
      if (state.result.trim()) out.result = state.result;
      if (ask === 'table') out.rows = state.rows.map(({ mass, abundance }) => ({ mass, abundance }));
      else if (q.showWork && state.rows.some((r) => r.part.trim())) out.rows = state.rows.map(({ part }) => ({ part }));
    }
    const empty = ask === 'table' ? !out.result && !state.rows.some((r) => r.mass.trim() || r.abundance.trim()) : !Object.keys(out).length;
    api.set(q.id, empty ? undefined : clone(out), { debounce: true });
  };
  const single = (key, testid, aria, unit) => {
    const el = cell('q-iso__value', { inputmode: 'decimal', 'aria-label': aria, dataset: { testid }, on: { input: (e) => { state[key] = e.target.value; commit(); } } });
    el.value = state[key];
    return { el, wrap: h('div', { class: 'q-iso__final' }, h('span', { class: 'q-iso__eq', 'aria-hidden': 'true' }, key === 'missing' ? 'x =' : 'M ='), el, h('span', { class: 'q-iso__unit' }, unit)) };
  };
  let body;
  let focusEl;
  if (ask === 'abundance') {
    const k = missingIdx(q);
    const avg = Number.isFinite(q.average) ? q.average : averageMass((q.isotopes || []).map((i, n) => (n === k ? { ...i, abundance: missingKey(q) } : i)));
    const f = single('missing', 'isotopemass-missing', `Abundance of ${label(q, q.isotopes[k] || {}, k)} in percent`, '%');
    focusEl = f.el;
    body = h('div', { class: 'q-iso' }, givenTable(q, k),
      h('p', { class: 'q-iso__note' }, 'Average atomic mass: ', h('strong', { class: 'q-iso__num' }, `${Number.isFinite(avg) ? avg.toFixed(2) : DASHLESS} amu`)), f.wrap);
  } else {
    const f = single('result', 'isotopemass-result', 'Average atomic mass in amu', 'amu');
    focusEl = f.el;
    let rowsEl = null;
    if (ask === 'table') {
      rowsEl = h('div', { class: 'q-iso__fill' },
        h('p', { class: 'q-hint' }, 'Copy each isotope into the table, then find the average.'),
        h('ul', { class: 'q-iso__data' }, (q.isotopes || []).map((i, n) => h('li', { dataset: { testid: `isotopemass-data-${n}` } }, `${label(q, i, n)}: mass ${str(i.mass)} amu, ${str(i.abundance)} % abundant`))),
        h('table', { class: 'q-iso__table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Isotope'), h('th', { scope: 'col' }, 'Mass (amu)'), h('th', { scope: 'col' }, 'Abundance (%)'))),
          h('tbody', null, (q.isotopes || []).map((i, n) => {
            const m = cell('', { inputmode: 'decimal', 'aria-label': `${label(q, i, n)} mass in amu`, dataset: { testid: `isotopemass-row-${n}-mass` }, on: { input: (e) => { state.rows[n].mass = e.target.value; commit(); } } });
            const a = cell('', { inputmode: 'decimal', 'aria-label': `${label(q, i, n)} abundance in percent`, dataset: { testid: `isotopemass-row-${n}-abundance` }, on: { input: (e) => { state.rows[n].abundance = e.target.value; commit(); } } });
            m.value = state.rows[n].mass; a.value = state.rows[n].abundance;
            return h('tr', { dataset: { testid: `isotopemass-row-${n}` } }, h('th', { scope: 'row' }, label(q, i, n)), h('td', null, m), h('td', null, a));
          }))));
      focusEl = rowsEl.querySelector('input') || f.el;
    } else {
      const work = q.showWork ? h('div', { class: 'q-iso__work' },
        h('p', { class: 'q-hint' }, 'Optional: show your work, mass × abundance as a fraction, for each isotope.'),
        h('table', { class: 'q-iso__table' }, h('tbody', null, (q.isotopes || []).map((i, n) => {
          const p = cell('', { inputmode: 'decimal', 'aria-label': `${label(q, i, n)} contribution in amu`, dataset: { testid: `isotopemass-row-${n}` }, on: { input: (e) => { state.rows[n].part = e.target.value; commit(); } } });
          p.value = state.rows[n].part;
          return h('tr', null, h('th', { scope: 'row' }, label(q, i, n)), h('td', null, `${str(i.mass)} × ${str(i.abundance)} %`), h('td', null, p));
        })))) : null;
      rowsEl = h('div', null, givenTable(q), work);
    }
    body = h('div', { class: 'q-iso' }, rowsEl, f.wrap);
  }
  return {
    el: h('div', { class: 'q-iso-root', dataset: { testid: 'isotopemass-widget' } },
      q.element ? h('p', { class: 'q-iso__element' }, h('strong', null, 'Element: '), q.element) : null, body),
    refresh(answer) {
      const next = toState(q, answer);
      if (JSON.stringify(next) === JSON.stringify(state)) return;
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.q-iso-root')) return;
      state = next;
      body.querySelectorAll('input').forEach((el) => {
        const id = el.dataset.testid || '';
        const m = /^isotopemass-row-(\d+)-(mass|abundance)$/.exec(id);
        if (m) el.value = state.rows[Number(m[1])][m[2]];
        else if (id === 'isotopemass-row-' + id.slice(16)) el.value = (state.rows[Number(id.slice(16))] || {}).part || '';
        else if (id === 'isotopemass-result') el.value = state.result;
        else if (id === 'isotopemass-missing') el.value = state.missing;
      });
    },
    focus: () => focusEl && focusEl.focus(),
  };
}
const DASHLESS = '?';

function editor(q, redraw, changed) {
  const iso = () => (q.isotopes = Array.isArray(q.isotopes) ? q.isotopes : []);
  const checker = h('p', { class: 'field__hint q-iso-ed__checker', 'aria-live': 'polite', dataset: { testid: 'isotopemass-checker' } });
  const showChecker = () => {
    const list = iso();
    const hidden = q.ask === 'abundance' ? missingIdx(q) : -1;
    const sum = list.reduce((t, i, n) => (n === hidden ? t : t + (Number(i.abundance) || 0)), 0);
    const avg = averageMass(list.map((i, n) => (n === hidden ? { ...i, abundance: 100 - sum } : i)));
    checker.textContent = hidden >= 0
      ? `Hidden abundance: ${(100 - sum).toFixed(2)} %. Average atomic mass: ${Number.isFinite(avg) ? avg.toFixed(2) : '?'} amu.`
      : `Abundances add up to ${Math.round(sum * 10000) / 10000} % (must be 100). Average atomic mass: ${Number.isFinite(avg) ? avg.toFixed(2) : '?'} amu.`;
    checker.classList.toggle('is-bad', hidden >= 0 ? !(100 - sum > 0) : Math.abs(sum - 100) > 0.01);
  };
  const el = h('input', { class: 'input', value: q.element || '', placeholder: 'e.g. Chlorine', 'aria-label': 'Element', dataset: { testid: 'isotopemass-element' }, on: { input: (e) => { q.element = e.target.value; changed(); } } });
  const askSel = h('select', { class: 'select', dataset: { testid: 'isotopemass-ask' }, on: { change: (e) => { q.ask = e.target.value; if (q.ask === 'abundance') q.missingIndex = missingIdx(q); changed(); redraw(); } } },
    ASK_MODES.map((m) => h('option', { value: m, selected: (q.ask || 'average') === m }, ASK_LABELS[m])));
  const numIn = (obj, key, testid, aria, w) => h('input', { class: 'input', type: 'number', step: 'any', value: obj[key] ?? '', 'aria-label': aria, style: w, dataset: { testid },
    on: { input: (e) => { obj[key] = e.target.value.trim() === '' ? '' : Number(e.target.value); showChecker(); changed(); } } });
  const rows = iso().map((i, n) => h('div', { class: 'q-iso-ed__row', dataset: { testid: `isotopemass-ed-row-${n}` } },
    h('input', { class: 'input', value: i.label || '', placeholder: 'Label, e.g. Cl-35', 'aria-label': `Isotope ${n + 1} label`, on: { input: (e) => { i.label = e.target.value; changed(); } } }),
    numIn(i, 'mass', `isotopemass-ed-mass-${n}`, `Isotope ${n + 1} mass in amu`),
    q.ask === 'abundance' && n === missingIdx(q)
      ? h('span', { class: 'q-iso-ed__hidden' }, 'hidden from students')
      : numIn(i, 'abundance', `isotopemass-ed-abundance-${n}`, `Isotope ${n + 1} abundance in percent`),
    q.ask === 'abundance' ? h('label', { class: 'q-iso-ed__pick' }, h('input', { type: 'radio', name: `iso-hidden-${q.id}`, checked: n === missingIdx(q), 'aria-label': `Hide abundance of isotope ${n + 1}`, on: { change: () => { q.missingIndex = n; changed(); redraw(); } } }), 'Hide') : null,
    h('button', { type: 'button', class: 'btn btn--ghost', 'aria-label': `Remove isotope ${n + 1}`, on: { click: () => { iso().splice(n, 1); changed(); redraw(); } } }, 'Remove')));
  showChecker();
  const add = h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'isotopemass-add' }, on: { click: () => { iso().push({ label: '', mass: '', abundance: '' }); changed(); redraw(); } } }, 'Add isotope');
  const tol = (key, def, testid) => h('input', { class: 'input', type: 'number', step: 'any', min: '0', value: q[key] ?? def, dataset: { testid }, on: { input: (e) => { q[key] = e.target.value.trim() === '' ? 0 : Number(e.target.value); changed(); } } });
  const ans = h('input', { class: 'input', type: 'number', step: 'any', value: q.answer ?? '', placeholder: 'leave empty to use the computed value', dataset: { testid: 'isotopemass-answer' },
    on: { input: (e) => { if (e.target.value.trim() === '') delete q.answer; else q.answer = Number(e.target.value); changed(); } } });
  const rnd = isObj(q.randomize) ? q.randomize : null;
  const rndIn = (key, aria, def) => h('input', { class: 'input', type: 'number', step: 'any', min: '0', value: rnd[key] ?? def, 'aria-label': aria, dataset: { testid: `isotopemass-rand-${key}` }, on: { input: (e) => { q.randomize[key] = Number(e.target.value) || 0; changed(); } } });
  return h('div', { class: 'stack' },
    h('div', { class: 'adm-grid adm-grid--2' }, field('Element', el), field('Task', askSel)),
    h('div', { class: 'q-iso-ed__rows' }, rows), add, checker,
    h('div', { class: 'adm-grid adm-grid--3' },
      field('Tolerance (± amu)', tol('tolerance', 0.01, 'isotopemass-tolerance')),
      field('Abundance tolerance (± %)', tol('abundanceTolerance', 0.1, 'isotopemass-abundance-tolerance')),
      q.ask === 'abundance' ? field('Average shown (optional)', h('input', { class: 'input', type: 'number', step: 'any', value: q.average ?? '', placeholder: 'computed', dataset: { testid: 'isotopemass-average' }, on: { input: (e) => { if (e.target.value.trim() === '') delete q.average; else q.average = Number(e.target.value); changed(); } } }))
        : field('Correct answer (optional)', ans)),
    q.ask === 'average' ? switchEl({ label: 'Offer work rows', hint: 'Students may enter mass × abundance for each isotope; shown in results, not graded', checked: !!q.showWork, testid: 'isotopemass-show-work', onChange: (v) => { q.showWork = v; changed(); } }) : null,
    switchEl({ label: 'Change the numbers for each student', hint: 'Masses and abundances shift a little; abundances still add up to 100', checked: !!rnd, testid: 'isotopemass-randomize', onChange: (v) => { if (v) q.randomize = { mass: 0.5, abundance: 5 }; else delete q.randomize; changed(); redraw(); } }),
    rnd ? h('div', { class: 'adm-grid adm-grid--2' }, field('Mass shift (± amu)', rndIn('mass', 'Mass shift', 0.5)), field('Abundance shift (± %)', rndIn('abundance', 'Abundance shift', 5))) : null);
}

function review(q, answer, { key } = {}) {
  if (key) {
    return h('span', { class: 'q-iso-review', dataset: { testid: 'isotopemass-review' } },
      h('span', { class: 'q-iso-review__work' }, (q.isotopes || []).map((i, n) => `${label(q, i, n)}: ${str(i.mass)} amu, ${q.ask === 'abundance' && n === missingIdx(q) ? `${missingKey(q).toFixed(2)} (hidden)` : str(i.abundance)} %`).join('; ')));
  }
  const a = isObj(answer) ? answer : {};
  const rows = Array.isArray(a.rows) ? a.rows : [];
  const lines = (q.isotopes || []).map((i, n) => {
    const r = rows[n] || {};
    return q.ask === 'table' ? (str(r.mass).trim() || str(r.abundance).trim() ? `${label(q, i, n)}: ${str(r.mass).trim() || '?'} amu, ${str(r.abundance).trim() || '?'} %` : '')
      : (str(r.part).trim() ? `${label(q, i, n)}: ${str(r.part).trim()}` : '');
  }).filter(Boolean);
  if (!lines.length) return null;
  return h('span', { class: 'q-iso-review', dataset: { testid: 'isotopemass-review' } }, h('span', { class: 'q-iso-review__work' }, lines.join('; ')));
}

registerTypeUI({ type: 'isotopemass', widget, editor, review });
export default null;
