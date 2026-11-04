import test from 'node:test';
import assert from 'node:assert/strict';
import def, { unitsMatch, unitMap, cancellation, chainProduct, parseNum } from '../../js/lib/qtypes/dimensional.js';

const mk = (over = {}) => {
  const q = { id: 'q', type: 'dimensional', given: { value: '117', unit: 'g' }, answer: { value: 2, unit: 'mol' }, tolerance: 1, toleranceType: 'percent', chainCredit: 0.5,
    factors: [{ top: { value: 1, unit: 'mol' }, bottom: { value: 58.5, unit: 'g' } }], ...over };
  def.normalize(q);
  return q;
};
const errs = (q) => { const e = []; def.validate(q, 'Q1', e); return e; };
const chain = [{ top: { value: '1', unit: 'mol' }, bottom: { value: '58.5', unit: 'g' } }];

test('normalize: defaults and numeric coercion', () => {
  const q = mk();
  assert.equal(q.given.value, 117);
  const bare = { given: {}, answer: {} }; def.normalize(bare);
  assert.equal(bare.tolerance, 0); assert.equal(bare.toleranceType, 'percent'); assert.equal(bare.chainCredit, 0); assert.deepEqual(bare.factors, []);
});

test('validate: good question passes, bad ones explain themselves', () => {
  assert.deepEqual(errs(mk()), []);
  assert.match(errs(mk({ given: { value: 'x', unit: 'g' } })).join(), /given.value must be a number/);
  assert.match(errs(mk({ answer: { value: 2, unit: '' } })).join(), /answer.unit is required/);
  assert.match(errs(mk({ chainCredit: 2 })).join(), /chainCredit must be between 0 and 1/);
  assert.match(errs(mk({ factors: [] })).join(), /chainCredit needs a reference chain/);
  assert.match(errs(mk({ factors: [{ top: { value: 1, unit: 'L' }, bottom: { value: 58.5, unit: 'g' } }] })).join(), /do not convert/);
  assert.match(errs(mk({ factors: [{ top: { value: 1, unit: 'mol' }, bottom: { value: 0, unit: 'g' } }] })).join(), /cannot be 0/);
  assert.match(errs(mk({ factors: [{ top: { value: 1, unit: 'mol' }, bottom: { value: 20, unit: 'g' } }] })).join(), /give 5.85|give 5.85/);
});

test('units: spellings, case sensitivity, cancellation', () => {
  assert.ok(unitsMatch('g/mol', 'g mol^-1'));
  assert.ok(unitsMatch(' mol ', 'mol'));
  assert.ok(!unitsMatch('mL', 'ml'));
  assert.ok(!unitsMatch('', 'mol'));
  assert.deepEqual(unitMap('m^2'), { m: 2 });
  assert.deepEqual(unitMap('L^-1'), { L: -1 });
  const items = cancellation('g', chain);
  assert.deepEqual(items.map((i) => [i.name, i.cancelled]), [['g', true], ['mol', false], ['g', true]]);
  assert.equal(chainProduct('117', chain), 2);
  assert.ok(Number.isNaN(chainProduct('117', [{ top: { value: 'x', unit: 'a' }, bottom: { value: 1, unit: 'b' } }])));
  assert.ok(Math.abs(parseNum('6.02e23') / 6.02e23 - 1) < 1e-12);
});

test('score: full, tolerance, wrong unit, chain credit, malformed', () => {
  const q = mk();
  assert.deepEqual(def.score(q, { factors: chain, value: '2', unit: 'mol' }), { fraction: 1, full: true });
  assert.equal(def.score(q, { factors: [], value: '2.01', unit: 'mol' }).full, true, 'within 1 %');
  assert.equal(def.score(q, { factors: [], value: '2.5', unit: 'mol' }).fraction, 0);
  assert.equal(def.score(q, { factors: [], value: '2', unit: 'Mol' }).fraction, 0, 'unit symbols are case-sensitive');
  assert.deepEqual(def.score(q, { factors: chain, value: '9', unit: 'mol' }), { fraction: 0.5, full: false }, 'good chain, wrong entry');
  assert.equal(def.score(mk({ chainCredit: 0, factors: [] }), { factors: chain, value: '9', unit: 'mol' }).fraction, 0);
  const wrongChain = [{ top: { value: '58.5', unit: 'g' }, bottom: { value: '1', unit: 'mol' } }];
  assert.equal(def.score(q, { factors: wrongChain, value: '9', unit: 'mol' }).fraction, 0, 'units do not cancel');
  for (const bad of [undefined, null, 'x', 5, [], {}, { factors: 'no' }, { factors: [null, 3] }]) assert.doesNotThrow(() => def.score(q, bad));
  assert.equal(def.score(q, 'x').fraction, 0);
});

test('isAnswered / texts / correctAnswer / blank', () => {
  const q = mk();
  assert.equal(def.isAnswered(q, undefined), false);
  assert.equal(def.isAnswered(q, { factors: [], value: '', unit: '' }), false);
  assert.equal(def.isAnswered(q, { factors: [], value: '3', unit: '' }), true);
  assert.equal(def.isAnswered(q, { factors: [{ top: { value: '1', unit: '' }, bottom: { value: '', unit: '' } }], value: '', unit: '' }), true);
  assert.equal(def.answerText(q, { factors: chain, value: '2', unit: 'mol' }), '117 g × (1 mol / 58.5 g) = 2 mol');
  assert.equal(def.keyText(q), '117 g × (1 mol / 58.5 g) = 2 mol');
  assert.equal(def.keyText(mk({ factors: [], chainCredit: 0 })), '2 mol');
  assert.deepEqual(def.correctAnswer(q).value, 2);
  const b = def.blank({ id: 'q9', type: 'dimensional', text: '', points: 1 }); def.normalize(b);
  assert.deepEqual(errs(b), []);
});
