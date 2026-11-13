// UI for `datatable`: a real <table>; given cells are text, the rest are inputs labelled "Row X, Column Y".
// Answer = { rowId: { colId: 'typed text' } }.
import { h } from '../../ui.js';
import { field, switchEl } from '../admin/common.js';
import { blankCells, cellCorrect, rowLabel } from '../../lib/qtypes/datatable.js';
import { formulaToHTML } from '../../lib/formula.js';
import { registerTypeUI } from './registry.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const typed = (a, r, c) => (isObj(a) && isObj(a[r]) && a[r][c] !== undefined ? String(a[r][c]) : '');
const cellText = (col, v) => (col.formula ? h('span', { class: 'formula', html: formulaToHTML(String(v)) }) : String(v));
const uniqueId = (prefix, items) => { const used = new Set(items.map((i) => i.id)); let n = 1; while (used.has(`${prefix}${n}`)) n++; return `${prefix}${n}`; };

function widget(q, api) {
  const inputs = [];
  const current = () => (isObj(api.get(q.id)) ? api.get(q.id) : {});
  const set = (r, c, v) => {
    const next = JSON.parse(JSON.stringify(current()));
    next[r] = next[r] || {};
    if (v === '') delete next[r][c]; else next[r][c] = v;
    if (!Object.keys(next[r]).length) delete next[r];
    api.set(q.id, Object.keys(next).length ? next : undefined, { debounce: true });
  };
  const head = h('tr', null, q.columns.map((c) => h('th', { scope: 'col', class: 'q-dt__th' }, c.label)));
  const body = q.rows.map((row) => h('tr', { dataset: { testid: `datatable-row-${row.id}` } }, q.columns.map((col, ci) => {
    const cell = row.cells[col.id] || { value: '', given: true };
    if (cell.given === true) {
      return ci === 0 ? h('th', { scope: 'row', class: 'q-dt__given q-dt__rowhead' }, cellText(col, cell.value)) : h('td', { class: 'q-dt__given' }, cellText(col, cell.value));
    }
    const input = h('input', {
      class: 'input q-input q-dt__in', type: 'text', inputmode: col.type === 'number' ? 'decimal' : 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
      'aria-label': `${rowLabel(q, row)}, ${col.label}`, dataset: { testid: `datatable-cell-${row.id}-${col.id}`, row: row.id, col: col.id },
      on: { input: () => set(row.id, col.id, input.value) },
    });
    inputs.push(input);
    return h('td', { class: 'q-dt__cell' }, input);
  })));
  return {
    el: h('div', { class: 'q-datatable' },
      h('p', { class: 'q-hint' }, 'Fill in every empty cell.'),
      h('div', { class: 'q-dt__scroll', role: 'region', tabindex: '0', 'aria-label': 'Table to complete' },
        h('table', { class: 'q-dt__table', dataset: { testid: 'datatable' } }, h('thead', null, head), h('tbody', null, body)))),
    refresh(answer) { for (const i of inputs) if (document.activeElement !== i) i.value = typed(answer, i.dataset.row, i.dataset.col); },
    focus: () => inputs[0] && inputs[0].focus(),
  };
}

function review(q, answer, { key } = {}) {
  if (!key && !isObj(answer)) return null;
  const head = h('tr', null, q.columns.map((c) => h('th', { scope: 'col' }, c.label)));
  const body = q.rows.map((row) => h('tr', null, q.columns.map((col) => {
    const cell = row.cells[col.id] || { value: '', given: true };
    if (cell.given === true) return h('td', { class: 'q-dt__given' }, cellText(col, cell.value));
    if (key) return h('td', { class: 'is-key' }, cellText(col, cell.value));
    const v = typed(answer, row.id, col.id);
    const ok = cellCorrect(col, cell.value, v);
    return h('td', { class: ok ? 'is-right' : 'is-wrong' }, v.trim() || '—', h('span', { class: 'sr-only' }, ok ? ' (correct)' : ' (incorrect)'));
  })));
  return h('span', { class: 'q-dt-review', dataset: { testid: 'datatable-review' } },
    h('table', { class: 'q-dt__table q-dt__table--sm' }, h('thead', null, head), h('tbody', null, body)));
}

function editor(q, redraw, changed) {
  const touch = () => changed();
  const colEds = q.columns.map((col, i) => h('div', { class: 'adm-opt', dataset: { testid: `datatable-edit-col-${i}` } },
    h('div', { class: 'adm-grid adm-grid--4' },
      field('Label', h('input', { class: 'input', value: col.label, autocomplete: 'off', dataset: { testid: `datatable-edit-col-${i}-label` }, on: { input: (e) => { col.label = e.target.value; touch(); } } })),
      field('Type', h('select', { class: 'select', dataset: { testid: `datatable-edit-col-${i}-type` }, on: { change: (e) => { col.type = e.target.value; if (col.type !== 'number') delete col.tolerance; else delete col.formula; redraw(); touch(); } } },
        h('option', { value: 'text', selected: col.type !== 'number' }, 'Text'), h('option', { value: 'number', selected: col.type === 'number' }, 'Number'))),
      col.type === 'number' ? field('Tolerance (±)', h('input', { class: 'input', type: 'number', min: '0', step: 'any', value: col.tolerance ?? 0, dataset: { testid: `datatable-edit-col-${i}-tolerance` },
        on: { input: (e) => { col.tolerance = e.target.value.trim() === '' ? 0 : Number(e.target.value); touch(); } } }))
        : switchEl({ label: 'Chemical formulas', hint: 'Compare with formula rules', checked: col.formula === true, testid: `datatable-edit-col-${i}-formula`, onChange: (v) => { if (v) col.formula = true; else delete col.formula; touch(); } }),
      h('button', { type: 'button', class: 'btn btn--ghost', 'aria-label': `Remove column ${i + 1}`, on: { click: () => { q.columns.splice(i, 1); q.rows.forEach((r) => delete r.cells[col.id]); redraw(); touch(); } } }, 'Remove'))));
  const rowEds = q.rows.map((row, ri) => h('div', { class: 'adm-opt q-dt-ed__row', dataset: { testid: `datatable-edit-row-${ri}` } },
    h('div', { class: 'q-dt-ed__cells' }, q.columns.map((col, ci) => {
      const cell = (row.cells[col.id] ||= { value: '', given: false });
      return h('div', { class: 'q-dt-ed__cell' },
        h('input', { class: 'input', value: cell.value ?? '', autocomplete: 'off', 'aria-label': `Row ${ri + 1}, ${col.label || `column ${ci + 1}`}: value`, dataset: { testid: `datatable-edit-cell-${ri}-${ci}` }, on: { input: (e) => { cell.value = e.target.value; touch(); } } }),
        h('label', { class: 'q-dt-ed__given' }, h('input', { type: 'checkbox', checked: cell.given === true, dataset: { testid: `datatable-edit-given-${ri}-${ci}` }, on: { change: (e) => { cell.given = e.target.checked; touch(); } } }), ' Given'));
    })),
    h('button', { type: 'button', class: 'btn btn--ghost', 'aria-label': `Remove row ${ri + 1}`, on: { click: () => { q.rows.splice(ri, 1); redraw(); touch(); } } }, 'Remove row')));
  return h('div', { class: 'stack' },
    h('p', { class: 'field__hint' }, 'Tick "Given" for cells students see; every other cell is a blank they fill in, worth an equal share of the points.'),
    h('h4', { class: 'field__label' }, 'Columns'), colEds,
    h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'datatable-edit-add-col' }, on: { click: () => {
      const id = uniqueId('c', q.columns); q.columns.push({ id, label: `Column ${q.columns.length + 1}`, type: 'text' });
      q.rows.forEach((r) => { r.cells[id] = { value: '', given: false }; }); redraw(); touch(); } } }, 'Add column'),
    h('h4', { class: 'field__label' }, 'Rows'), rowEds,
    h('button', { type: 'button', class: 'btn btn--ghost', dataset: { testid: 'datatable-edit-add-row' }, on: { click: () => {
      const id = uniqueId('r', q.rows); q.rows.push({ id, cells: Object.fromEntries(q.columns.map((c) => [c.id, { value: '', given: false }])) }); redraw(); touch(); } } }, 'Add row'));
}

registerTypeUI({ type: 'datatable', widget, editor, review });
export default null;
