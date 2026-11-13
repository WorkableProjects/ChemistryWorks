// `datatable` question type: complete the table. Pure definition, no DOM.
//   Question: { columns: [{ id, label, type: 'number'|'text', tolerance?, formula? }],
//               rows: [{ id, label?, cells: { colId: { value, given } } }] }
//   Answer:   { rowId: { colId: 'typed text' } } for the cells that are not given. One point share per blank cell.
// Numbers must be within the column's absolute `tolerance` (default 0); text is trimmed and compared case-insensitively
// with runs of spaces collapsed; a text column with `formula: true` is compared with formulasEqual (case-sensitive).
import { formulasEqual } from '../formula.js';
import { parseNum, withinTolerance } from './dimensional.js';
import { registerType } from './registry.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v === undefined || v === null ? '' : String(v));

/** The blank (not given) cells as [{ row, col, expected }] in reading order. */
export function blankCells(q) {
  const out = [];
  for (const row of q.rows || []) {
    for (const col of q.columns || []) {
      const cell = row.cells && row.cells[col.id];
      if (cell && cell.given !== true) out.push({ row, col, expected: cell.value });
    }
  }
  return out;
}

export function cellCorrect(col, expected, typed) {
  const t = str(typed).trim();
  if (!t) return false;
  if (col.type === 'number') return withinTolerance(parseNum(t), parseNum(expected), col.tolerance, 'absolute');
  if (col.formula) return formulasEqual(t, str(expected));
  return t.replace(/\s+/g, ' ').toLowerCase() === str(expected).trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Short label for a row in aria-labels and text: its label, else its first given cell, else its number. */
export function rowLabel(q, row) {
  if (row.label) return row.label;
  for (const col of q.columns || []) {
    const c = row.cells && row.cells[col.id];
    if (c && c.given === true && str(c.value).trim()) return str(c.value).trim();
  }
  return `Row ${(q.rows || []).indexOf(row) + 1}`;
}

const typedOf = (answer, rowId, colId) => (isObj(answer) && isObj(answer[rowId]) ? str(answer[rowId][colId]) : '');

function score(q, answer) {
  const cells = blankCells(q);
  if (!cells.length || !isObj(answer)) return { fraction: 0, full: false };
  const right = cells.filter((c) => cellCorrect(c.col, c.expected, typedOf(answer, c.row.id, c.col.id))).length;
  return { fraction: right / cells.length, full: right === cells.length };
}

const listText = (q, valueOf) => blankCells(q)
  .map((c) => `${rowLabel(q, c.row)} / ${c.col.label}: ${str(valueOf(c)).trim() || '—'}`).join('; ');

const def = {
  type: 'datatable',
  label: 'Complete the table',
  shortLabel: 'Table',
  group: 'Basics',
  manual: false,
  normalize(q) {
    q.columns = (Array.isArray(q.columns) ? q.columns : []).filter(isObj).map((c) => {
      const col = { id: str(c.id).trim(), label: str(c.label).trim(), type: c.type === 'number' ? 'number' : 'text' };
      if (col.type === 'number' && c.tolerance !== undefined && c.tolerance !== null && c.tolerance !== '') col.tolerance = Number(c.tolerance);
      if (col.type === 'text' && c.formula === true) col.formula = true;
      return col;
    });
    q.rows = (Array.isArray(q.rows) ? q.rows : []).filter(isObj).map((r) => {
      const row = { id: str(r.id).trim(), cells: {} };
      if (str(r.label).trim()) row.label = str(r.label).trim();
      if (isObj(r.cells)) {
        for (const [k, v] of Object.entries(r.cells)) {
          const cell = isObj(v) ? v : { value: v };
          row.cells[k] = { value: cell.value === undefined || cell.value === null ? '' : cell.value, given: cell.given === true };
        }
      }
      return row;
    });
  },
  validate(q, where, errors) {
    if (!q.columns.length) errors.push(`${where}: add at least one column.`);
    if (!q.rows.length) errors.push(`${where}: add at least one row.`);
    const colIds = new Set();
    q.columns.forEach((c, i) => {
      if (!c.id) errors.push(`${where}: column ${i + 1} needs an id.`);
      else if (colIds.has(c.id)) errors.push(`${where}: duplicate column id "${c.id}".`);
      colIds.add(c.id);
      if (!c.label) errors.push(`${where}: column ${i + 1} needs a label.`);
      if (c.tolerance !== undefined && (!Number.isFinite(c.tolerance) || c.tolerance < 0)) errors.push(`${where}: column "${c.id}" tolerance must be 0 or greater.`);
    });
    const rowIds = new Set();
    q.rows.forEach((r, i) => {
      if (!r.id) errors.push(`${where}: row ${i + 1} needs an id.`);
      else if (rowIds.has(r.id)) errors.push(`${where}: duplicate row id "${r.id}".`);
      rowIds.add(r.id);
      for (const k of Object.keys(r.cells)) if (!colIds.has(k)) errors.push(`${where}: row "${r.id}" has a cell for unknown column "${k}".`);
      for (const c of q.columns) {
        const cell = r.cells[c.id];
        if (!cell) { errors.push(`${where}: row "${r.id}" is missing the cell for column "${c.id}".`); continue; }
        if (str(cell.value).trim() === '' && cell.given !== true) errors.push(`${where}: row "${r.id}", column "${c.id}" is blank, so it needs a correct value.`);
        if (c.type === 'number' && str(cell.value).trim() !== '' && Number.isNaN(parseNum(cell.value))) errors.push(`${where}: row "${r.id}", column "${c.id}" must be a number.`);
      }
    });
    if (q.columns.length && q.rows.length && !blankCells(q).length) errors.push(`${where}: at least one cell must be left for the student to fill (not given).`);
  },
  blank(base) {
    const cell = (value, given) => ({ value, given });
    return {
      ...base, text: 'Complete the table.',
      columns: [{ id: 'species', label: 'Species', type: 'text' }, { id: 'p', label: 'Protons', type: 'number' }, { id: 'n', label: 'Neutrons', type: 'number' }, { id: 'e', label: 'Electrons', type: 'number' }],
      rows: [
        { id: 'r1', cells: { species: cell('Na', true), p: cell(11, true), n: cell(12, false), e: cell(11, false) } },
        { id: 'r2', cells: { species: cell('Cl-', true), p: cell(17, true), n: cell(18, false), e: cell(18, false) } },
      ],
    };
  },
  isAnswered(q, answer) {
    return isObj(answer) && Object.values(answer).some((r) => isObj(r) && Object.values(r).some((v) => str(v).trim() !== ''));
  },
  score,
  answerText: (q, answer) => (isObj(answer) ? listText(q, (c) => typedOf(answer, c.row.id, c.col.id)) : ''),
  keyText: (q) => listText(q, (c) => c.expected),
  correctAnswer(q) {
    const out = {};
    for (const c of blankCells(q)) (out[c.row.id] ||= {})[c.col.id] = c.expected;
    return out;
  },
};

registerType(def);
export default def;
