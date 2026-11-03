import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeChargeMarks, normalizeStructureAnswer, isStructureAnswered, describeStructure, chargeLabel,
  validateStructure, MAX_CHARGE,
} from '../../js/lib/structure.js';

const no3 = (extra = {}) => ({
  id: 'no3', type: 'structure', studentCharges: true,
  atoms: [{ id: 'n', symbol: 'N', x: 1, y: 1 }, { id: 'o1', symbol: 'O', x: 1, y: 0 }, { id: 'o2', symbol: 'O', x: 0, y: 2 }, { id: 'o3', symbol: 'O', x: 2, y: 2 }],
  bonds: [['n', 'o1'], ['n', 'o2'], ['n', 'o3']], charge: -1,
  correctAnswer: { bonds: [2, 1, 1], lonePairs: { n: 0, o1: 2, o2: 3, o3: 3 }, bracket: true, charge: -1, formalCharges: { n: 1, o2: -1, o3: -1 } },
  ...extra,
});
const errs = (q) => { const e = []; validateStructure(q, 'Q', e); return e; };

test('MAX_CHARGE is 4', () => assert.equal(MAX_CHARGE, 4));

test('normalizeChargeMarks clamps to ±4 and fills every atom', () => {
  const m = normalizeChargeMarks(no3(), { bracket: true, charge: 9, formalCharges: { n: 7, o1: -9, o2: '2', zz: 3 } });
  assert.deepEqual(m, { bracket: true, charge: 4, formalCharges: { n: 4, o1: -4, o2: 2, o3: 0 } });
  assert.equal(normalizeChargeMarks(no3(), { charge: -10 }).charge, -4);
});

test('normalizeChargeMarks: junk input gives zeros', () => {
  const zero = { bracket: false, charge: 0, formalCharges: { n: 0, o1: 0, o2: 0, o3: 0 } };
  for (const bad of [null, undefined, 'x', 5, []]) assert.deepEqual(normalizeChargeMarks(no3(), bad), zero);
  assert.equal(normalizeChargeMarks(no3(), { bracket: 'true' }).bracket, false);
  assert.equal(normalizeChargeMarks(no3(), { charge: 1.5, formalCharges: { n: 'abc' } }).charge, 0);
  assert.equal(normalizeChargeMarks(no3(), { formalCharges: { n: 'abc' } }).formalCharges.n, 0);
});

test('normalizeStructureAnswer adds charge fields only with studentCharges', () => {
  const ans = { bonds: [2, 1, 1], lonePairs: { n: 0, o1: 2, o2: 3, o3: 3 }, bracket: true, charge: -1, formalCharges: { n: 1 } };
  const on = normalizeStructureAnswer(no3(), ans);
  assert.deepEqual(Object.keys(on).sort(), ['bonds', 'bracket', 'charge', 'formalCharges', 'lonePairs']);
  assert.equal(on.bracket, true);
  assert.equal(on.charge, -1);
  assert.deepEqual(on.formalCharges, { n: 1, o1: 0, o2: 0, o3: 0 });
  const off = normalizeStructureAnswer(no3({ studentCharges: false }), ans);
  assert.deepEqual(Object.keys(off).sort(), ['bonds', 'lonePairs']);
  const none = normalizeStructureAnswer(no3({ studentCharges: undefined }), ans);
  assert.deepEqual(Object.keys(none).sort(), ['bonds', 'lonePairs']);
  // still normalizes the v1 part
  assert.deepEqual(on.bonds, [2, 1, 1]);
  assert.equal(on.lonePairs.o2, 3);
});

test('isStructureAnswered: bracket-only and charge-only count', () => {
  assert.equal(isStructureAnswered({ bonds: [0, 0], lonePairs: {} }), false);
  assert.equal(isStructureAnswered({}), false);
  assert.equal(isStructureAnswered(null), false);
  assert.equal(isStructureAnswered({ bonds: [0], lonePairs: {}, bracket: true }), true);
  assert.equal(isStructureAnswered({ bonds: [0], lonePairs: {}, charge: -1 }), true);
  assert.equal(isStructureAnswered({ bonds: [0], lonePairs: {}, formalCharges: { n: 0, o1: 1 } }), true);
  assert.equal(isStructureAnswered({ bonds: [0], lonePairs: {}, formalCharges: { n: 0 }, bracket: false, charge: 0 }), false);
  assert.equal(isStructureAnswered({ bonds: [1], lonePairs: {} }), true);
  assert.equal(isStructureAnswered({ bonds: [0], lonePairs: { n: 1 } }), true);
});

test('chargeLabel', () => {
  assert.equal(chargeLabel(1), '+');
  assert.equal(chargeLabel(-1), '−');
  assert.equal(chargeLabel(-2), '2−');
  assert.equal(chargeLabel(3), '3+');
  assert.equal(chargeLabel(-1, { explicit: true }), '1−');
  assert.equal(chargeLabel(1, { explicit: true }), '1+');
  assert.equal(chargeLabel(0), '');
  assert.equal(chargeLabel(0, { explicit: true }), '');
  assert.equal(chargeLabel(undefined), '');
  assert.equal(chargeLabel('x'), '');
});

test('describeStructure mentions brackets and formal charges', () => {
  const q = no3();
  const t = describeStructure(q, q.correctAnswer);
  assert.match(t, /Brackets: yes, charge 1−/);
  assert.match(t, /Formal charges: .*N 1\+/);
  assert.match(t, /O\(o2\) 1−/);
  assert.match(describeStructure(q, { bonds: [1, 1, 1], lonePairs: {} }), /Brackets: no/);
  assert.match(describeStructure(q, { bonds: [1, 1, 1], lonePairs: {} }), /Formal charges: none/);
  assert.match(describeStructure(q, { bonds: [1, 1, 1], lonePairs: {}, bracket: true }), /Brackets: yes, no charge/);
  assert.match(describeStructure(q, { bonds: [1, 1, 1], lonePairs: {}, charge: 2 }), /Brackets: no \(charge 2\+\)/);
});

test('describeStructure without studentCharges has no bracket text', () => {
  const q = no3({ studentCharges: false });
  const t = describeStructure(q, q.correctAnswer);
  assert.doesNotMatch(t, /Brackets|Formal charges/);
  assert.match(t, /^Bonds:/);
});

test('validateStructure: valid studentCharges question', () => {
  assert.deepEqual(errs(no3()), []);
});

test('validateStructure: bad bracket / charge / formalCharges types', () => {
  const key = (patch) => no3({ correctAnswer: { ...no3().correctAnswer, ...patch } });
  assert.match(errs(key({ bracket: 'yes' })).join('|'), /bracket must be true or false/);
  assert.match(errs(key({ charge: 5 })).join('|'), /charge must be a whole number from −4 to 4/);
  assert.match(errs(key({ charge: 1.5 })).join('|'), /charge must be a whole number/);
  assert.match(errs(key({ formalCharges: [1] })).join('|'), /formalCharges must be an object/);
  assert.match(errs(key({ formalCharges: { zz: 1 } })).join('|'), /unknown atom "zz"/);
  assert.match(errs(key({ formalCharges: { n: 9 } })).join('|'), /formal charge on "n"/);
  assert.match(errs(key({ formalCharges: { n: 0.5 } })).join('|'), /formal charge on "n"/);
});

test('validateStructure: charge keys not checked without studentCharges', () => {
  const q = no3({ studentCharges: false, correctAnswer: { ...no3().correctAnswer, bracket: 'yes', charge: 99 } });
  assert.deepEqual(errs(q), []);
});
