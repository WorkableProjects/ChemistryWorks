import test from 'node:test';
import assert from 'node:assert/strict';
import def, { blankCells, cellCorrect, rowLabel } from '../../js/lib/qtypes/datatable.js';

const cell = (value, given = false) => ({ value, given });
const mk = (over = {}) => {
  const q = { id: 'q', type: 'datatable',
    columns: [{ id: 's', label: 'Species', type: 'text' }, { id: 'p', label: 'Protons', type: 'number' }, { id: 'n', label: 'Neutrons', type: 'number', tolerance: 0.5 }, { id: 'f', label: 'Formula', type: 'text', formula: true }],
    rows: [{ id: 'r1', cells: { s: cell('Na', true), p: cell(11, true), n: cell(12), f: cell('NaCl') } },
      { id: 'r2', cells: { s: cell('Cl-', true), p: cell(17, true), n: cell(18), f: cell('HCl') } }], ...over };
  def.normalize(q); return q;
};
const errs = (q) => { const e = []; def.validate(q, 'Q1', e); return e; };
const full = { r1: { n: '12', f: 'NaCl' }, r2: { n: '18', f: 'HCl' } };

test('normalize: cells, column types, flags', () => {
  const q = mk({ rows: [{ id: 'r1', cells: { s: 'Na', p: { value: 11, given: true }, n: { value: 12 } } }] });
  assert.equal(q.rows[0].cells.s.value, 'Na'); assert.equal(q.rows[0].cells.s.given, false);
  assert.equal(q.columns[2].tolerance, 0.5); assert.equal(q.columns[3].formula, true); assert.equal(q.columns[0].formula, undefined);
});

test('validate: shape problems', () => {
  assert.deepEqual(errs(mk()), []);
  assert.match(errs(mk({ columns: [] })).join(), /at least one column/);
  assert.match(errs(mk({ rows: [] })).join(), /at least one row/);
  assert.match(errs(mk({ columns: [{ id: 's', label: 'A' }, { id: 's', label: 'B' }], rows: [{ id: 'r', cells: { s: cell('x') } }] })).join(), /duplicate column id/);
  assert.match(errs(mk({ rows: [{ id: 'r1', cells: { s: cell('Na', true), p: cell(11, true), n: cell(''), f: cell('NaCl') } }] })).join(), /is blank, so it needs a correct value/);
  assert.match(errs(mk({ rows: [{ id: 'r1', cells: { s: cell('Na', true), p: cell(11, true), n: cell('abc'), f: cell('NaCl') } }] })).join(), /must be a number/);
  assert.match(errs(mk({ rows: [{ id: 'r1', cells: { s: cell('Na', true), p: cell(11, true), n: cell(1, true), f: cell('X', true) } }] })).join(), /at least one cell must be left/);
  assert.match(errs(mk({ rows: [{ id: 'r1', cells: { s: cell('Na', true), zz: cell(1) } }] })).join(), /unknown column "zz"/);
  assert.match(errs(mk({ rows: [{ id: 'r1', cells: { s: cell('Na', true) } }] })).join(), /missing the cell/);
});

test('cell comparison: numbers with tolerance, text case-insensitive, formulas', () => {
  const [, , n, f] = mk().columns;
  assert.ok(cellCorrect(n, 12, '12.4')); assert.ok(!cellCorrect(n, 12, '13'));
  assert.ok(cellCorrect({ id: 'p', type: 'number' }, 11, '11')); assert.ok(!cellCorrect({ id: 'p', type: 'number' }, 11, '11.1'));
  assert.ok(!cellCorrect(n, 12, '')); assert.ok(!cellCorrect(n, 12, 'abc'));
  assert.ok(cellCorrect({ type: 'text' }, 'Sodium  Ion', '  sodium ion '));
  assert.ok(cellCorrect(f, 'NaCl', 'NaCl')); assert.ok(!cellCorrect(f, 'NaCl', 'NACL'));
});

test('score: per-cell credit and malformed answers', () => {
  const q = mk();
  assert.equal(blankCells(q).length, 4);
  assert.deepEqual(def.score(q, full), { fraction: 1, full: true });
  assert.equal(def.score(q, { r1: { n: '12', f: 'NaCl' }, r2: { n: '99', f: 'HCl' } }).fraction, 0.75);
  assert.equal(def.score(q, { r1: { n: '12' } }).fraction, 0.25);
  assert.equal(def.score(q, {}).fraction, 0);
  for (const bad of [undefined, null, 'x', 3, [], { r1: 'no' }, { r1: null }, { r1: { n: null } }]) assert.doesNotThrow(() => def.score(q, bad));
});

test('isAnswered / texts / labels / correctAnswer', () => {
  const q = mk();
  assert.equal(def.isAnswered(q, {}), false);
  assert.equal(def.isAnswered(q, { r1: { n: ' ' } }), false);
  assert.equal(def.isAnswered(q, { r1: { n: '1' } }), true);
  assert.equal(rowLabel(q, q.rows[0]), 'Na');
  assert.equal(rowLabel(q, { id: 'x', cells: {} }), 'Row 0', 'a row outside the table falls back to its (absent) index');
  assert.equal(rowLabel(q, { id: 'y', label: 'Mine', cells: {} }), 'Mine');
  assert.match(def.keyText(q), /Na \/ Neutrons: 12/);
  assert.match(def.answerText(q, { r1: { n: '9' } }), /Na \/ Neutrons: 9; Na \/ Formula: —/);
  assert.deepEqual(def.correctAnswer(q), { r1: { n: 12, f: 'NaCl' }, r2: { n: 18, f: 'HCl' } });
  const b = def.blank({ id: 'q9', type: 'datatable', text: '', points: 1 }); def.normalize(b);
  assert.deepEqual(errs(b), []);
});
