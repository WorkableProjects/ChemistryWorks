import test from 'node:test';
import assert from 'node:assert/strict';
import def, { fieldsOf, angleLabel, BOND_ANGLES } from '../../js/lib/qtypes/vsepr.js';

const mk = (over = {}) => {
  const q = { id: 'q', type: 'vsepr', formula: 'NH3', electronGeometry: 'Tetrahedral', molecularGeometry: 'trigonal pyramidal', bondAngle: '107°', ...over };
  def.normalize(q); return q;
};
const errs = (q) => { const e = []; def.validate(q, 'Q1', e); return e; };
const ALL = { electron: 'tetrahedral', molecular: 'trigonal pyramidal', angle: '107' };

test('normalize: canonical vocabulary, fields default to all', () => {
  const q = mk();
  assert.equal(q.electronGeometry, 'tetrahedral'); assert.equal(q.bondAngle, '107');
  assert.deepEqual(q.fields, ['electron', 'molecular', 'angle']);
  assert.equal(mk({ molecularGeometry: 'see saw' }).molecularGeometry, 'see-saw');
  assert.equal(mk({ molecularGeometry: 't shaped' }).molecularGeometry, 'T-shaped');
  assert.equal(mk({ bondAngle: '< 109.5' }).bondAngle, '<109.5');
  assert.deepEqual(mk({ fields: ['angle', 'bogus'] }).fields, ['angle']);
});

test('validate: vocabulary and fields', () => {
  assert.deepEqual(errs(mk()), []);
  assert.match(errs(mk({ formula: '' })).join(), /formula is required/);
  assert.match(errs(mk({ electronGeometry: 'blob' })).join(), /electronGeometry must be one of/);
  assert.match(errs(mk({ bondAngle: '42' })).join(), /bondAngle must be one of/);
  assert.match(errs(mk({ fields: [] })).join(), /fields must include/);
  assert.deepEqual(errs(mk({ fields: ['molecular'], bondAngle: '' , electronGeometry: '' })), [], 'disabled fields are not validated');
});

test('score: equal share per enabled field', () => {
  const q = mk();
  assert.deepEqual(def.score(q, ALL), { fraction: 1, full: true });
  assert.ok(Math.abs(def.score(q, { ...ALL, angle: '109.5' }).fraction - 2 / 3) < 1e-9);
  assert.ok(Math.abs(def.score(q, { electron: 'tetrahedral' }).fraction - 1 / 3) < 1e-9);
  assert.equal(def.score(q, { electron: 'Tetrahedral ', molecular: 'Trigonal  Pyramidal', angle: '107°' }).full, true, 'spelling normalised');
  assert.equal(def.score(mk({ fields: ['molecular'] }), { molecular: 'trigonal pyramidal' }).full, true);
  assert.equal(def.score(mk({ fields: ['molecular', 'angle'] }), { molecular: 'bent', angle: '107' }).fraction, 0.5);
  for (const bad of [undefined, null, 'x', 4, [], {}, { electron: 5, angle: null }]) assert.doesNotThrow(() => def.score(q, bad));
  assert.equal(def.score(q, {}).fraction, 0);
});

test('isAnswered / texts / helpers', () => {
  const q = mk();
  assert.equal(def.isAnswered(q, {}), false);
  assert.equal(def.isAnswered(q, { angle: '90' }), true);
  assert.equal(def.keyText(q), 'Electron geometry: tetrahedral; Molecular geometry: trigonal pyramidal; Bond angle: 107°');
  assert.equal(def.answerText(q, { molecular: 'bent' }), 'Electron geometry: —; Molecular geometry: bent; Bond angle: —');
  assert.deepEqual(def.correctAnswer(mk({ fields: ['angle'] })), { angle: '107' });
  assert.deepEqual(fieldsOf(mk({ fields: ['angle', 'electron'] })), ['electron', 'angle']);
  assert.equal(angleLabel('90 & 120'), '90° & 120°');
  assert.ok(BOND_ANGLES.includes('104.5'));
  const b = def.blank({ id: 'q9', type: 'vsepr', text: '', points: 1 }); def.normalize(b);
  assert.deepEqual(errs(b), []);
});
