import test from 'node:test';
import assert from 'node:assert/strict';
import def, { particleMatches, blankKeys, isConserved } from '../../js/lib/qtypes/nuclear.js';

const eq = (over = {}) => {
  const q = { id: 'q', type: 'nuclear', mode: 'equation', left: [{ A: 238, Z: 92, symbol: 'U' }],
    right: [{ A: 234, Z: 90, symbol: 'Th', missing: true }, { name: 'alpha' }], ...over };
  def.normalize(q); return q;
};
const iso = (over = {}) => { const q = { id: 'q', type: 'nuclear', mode: 'isotope', isotope: { A: 14, Z: 6, symbol: 'c' }, ...over }; def.normalize(q); return q; };
const errs = (q) => { const e = []; def.validate(q, 'Q1', e); return e; };

test('normalize: modes, named particles, symbol case', () => {
  const q = eq();
  assert.equal(q.right[1].A, 4); assert.equal(q.right[1].Z, 2); assert.equal(q.right[1].symbol, 'He');
  assert.equal(iso().isotope.symbol, 'C');
  assert.equal(iso().left, undefined);
  const odd = { mode: 'weird' }; def.normalize(odd); assert.equal(odd.mode, 'isotope');
});

test('validate: conservation, missing blanks, isotope consistency', () => {
  assert.deepEqual(errs(eq()), []);
  assert.deepEqual(errs(iso()), []);
  assert.match(errs(eq({ right: [{ A: 230, Z: 90, symbol: 'Th', missing: true }, { name: 'alpha' }] })).join(), /mass numbers are not conserved/);
  assert.match(errs(eq({ right: [{ A: 234, Z: 91, symbol: 'Pa', missing: true }, { name: 'alpha' }] })).join(), /atomic numbers are not conserved/);
  assert.match(errs(eq({ right: [{ A: 234, Z: 90, symbol: 'Th' }, { name: 'alpha' }] })).join(), /at least one particle as missing/);
  assert.match(errs(eq({ left: [] })).join(), /at least one particle on each side/);
  assert.match(errs(iso({ isotope: { A: 14, Z: 7, symbol: 'C' } })).join(), /has atomic number 6/);
  assert.match(errs(iso({ isotope: { A: 3, Z: 6, symbol: 'C' } })).join(), /cannot be larger/);
  assert.match(errs(iso({ isotope: { A: 14, Z: 6, symbol: 'Zz' } })).join(), /element symbol/);
});

test('particleMatches: symbols case-normalised, named aliases', () => {
  const th = { A: 234, Z: 90, symbol: 'Th' };
  assert.ok(particleMatches(th, { A: '234', Z: '90', symbol: 'th' }));
  assert.ok(!particleMatches(th, { A: '234', Z: '91', symbol: 'Th' }));
  assert.ok(!particleMatches(th, { A: '234', Z: '90', symbol: '' }));
  const beta = eq({ left: [{ A: 14, Z: 6, symbol: 'C' }], right: [{ A: 14, Z: 7, symbol: 'N' }, { name: 'beta', missing: true }] }).right[1];
  assert.ok(particleMatches(beta, { A: '0', Z: '-1', symbol: 'e' }));
  assert.ok(particleMatches(beta, { A: '0', Z: '−1', symbol: 'β' }));
  assert.ok(!particleMatches(beta, { A: '0', Z: '1', symbol: 'e' }));
});

test('score: per blank, partial, isotope thirds, malformed never throws', () => {
  const q = eq();
  assert.deepEqual(blankKeys(q), ['R0']);
  assert.deepEqual(def.score(q, { R0: { A: '234', Z: '90', symbol: 'Th' } }), { fraction: 1, full: true });
  assert.equal(def.score(q, { R0: { A: '234', Z: '91', symbol: 'Th' } }).fraction, 0);
  const two = eq({ left: [{ A: 238, Z: 92, symbol: 'U', missing: true }], right: [{ A: 234, Z: 90, symbol: 'Th', missing: true }, { name: 'alpha' }] });
  assert.equal(def.score(two, { L0: { A: '238', Z: '92', symbol: 'U' }, R0: { A: '1', Z: '1', symbol: 'H' } }).fraction, 0.5);
  const i = iso();
  assert.equal(def.score(i, { A: '14', Z: '6', symbol: 'C' }).full, true);
  assert.ok(Math.abs(def.score(i, { A: '14', Z: '7', symbol: 'C' }).fraction - 2 / 3) < 1e-9);
  for (const bad of [undefined, null, 'x', 7, [], {}, { R0: 'no' }, { R0: null }]) { assert.doesNotThrow(() => def.score(q, bad)); assert.doesNotThrow(() => def.score(i, bad)); }
});

test('isConserved reflects what the student typed', () => {
  const q = eq();
  assert.equal(isConserved(q, {}), null);
  assert.equal(isConserved(q, { R0: { A: '234', Z: '90', symbol: 'Th' } }), true);
  assert.equal(isConserved(q, { R0: { A: '230', Z: '90', symbol: 'Th' } }), false);
});

test('isAnswered / texts / correctAnswer', () => {
  const q = eq();
  assert.equal(def.isAnswered(q, {}), false);
  assert.equal(def.isAnswered(q, { R0: { A: '', Z: '', symbol: '' } }), false);
  assert.equal(def.isAnswered(q, { R0: { A: '2', Z: '', symbol: '' } }), true);
  assert.equal(def.keyText(q), '238/92 U → 234/90 Th + 4/2 He');
  assert.equal(def.answerText(q, { R0: { A: '234', Z: '90', symbol: 'Th' } }), '238/92 U → 234/90 Th + 4/2 He');
  assert.deepEqual(def.correctAnswer(q), { R0: { A: 234, Z: 90, symbol: 'Th' } });
  assert.equal(def.keyText(iso()), '14/6 C');
  assert.deepEqual(def.correctAnswer(iso()), { A: 14, Z: 6, symbol: 'C' });
  const b = def.blank({ id: 'q9', type: 'nuclear', text: '', points: 1 }); def.normalize(b);
  assert.deepEqual(errs(b), []);
});
