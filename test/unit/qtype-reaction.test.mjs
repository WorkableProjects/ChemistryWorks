import test from 'node:test';
import assert from 'node:assert/strict';
import def, { parseSpecies, parseSide, productSide } from '../../js/lib/qtypes/reaction.js';

const mk = (over = {}) => {
  const q = { id: 'q', type: 'reaction', reactants: 'AgNO3(aq) + NaCl(aq)', products: ['AgCl(s)', 'NaNO3(aq)'], requireStates: true, ...over };
  def.normalize(q); return q;
};
const errs = (q) => { const e = []; def.validate(q, 'Q1', e); return e; };

test('parsing: coefficient, formula, state, arrows, plus signs', () => {
  assert.deepEqual(parseSpecies('2 H2O(l)'), { coefficient: 2, formula: 'H2O', state: 'l', text: '2 H2O(l)' });
  assert.equal(parseSpecies('NaCl(AQ)').state, 'aq');
  assert.equal(parseSpecies('Fe^3+').formula, 'Fe^3+');
  assert.equal(productSide('A + B -> C + D'), ' C + D');
  assert.deepEqual(parseSide('AgCl(s)+NaNO3(aq)').map((s) => s.formula), ['AgCl', 'NaNO3']);
  assert.deepEqual(parseSide('Ag^+ + Cl^-').map((s) => s.formula), ['Ag^+', 'Cl^-']);
  assert.deepEqual(parseSide(''), []);
});

test('normalize and validate', () => {
  const q = mk({ products: 'AgCl(s) + NaNO3(aq)', requireStates: 'yes' });
  assert.deepEqual(q.products, ['AgCl(s)', 'NaNO3(aq)']);
  assert.equal(q.requireStates, false);
  assert.deepEqual(errs(mk()), []);
  assert.match(errs(mk({ reactants: '' })).join(), /reactants are required/);
  assert.match(errs(mk({ products: [] })).join(), /at least one product/);
  assert.match(errs(mk({ products: ['AgCl'] })).join(), /needs a state/);
  assert.deepEqual(errs(mk({ products: ['AgCl'], requireStates: false })), []);
});

test('score: order-free, states and coefficients only when required, partial credit, extras', () => {
  const q = mk();
  assert.deepEqual(def.score(q, 'NaNO3(aq) + AgCl(s)'), { fraction: 1, full: true });
  assert.deepEqual(def.score(q, 'AgNO3 + NaCl -> AgCl(s) + NaNO3(aq)'), { fraction: 1, full: true }, 'text before the arrow is ignored');
  assert.equal(def.score(q, 'AgCl + NaNO3(aq)').fraction, 0.5, 'missing state loses that product');
  assert.equal(def.score(mk({ requireStates: false }), 'AgCl + NaNO3').full, true);
  assert.equal(def.score(q, 'AgCl(s)').fraction, 0.5);
  assert.equal(def.score(q, 'AgCl(s) + NaNO3(aq) + H2O(l)').full, false, 'an extra species is not full');
  assert.equal(def.score(q, 'AgCl(s) + NaNO3(aq) + H2O(l)').fraction, 1 - 0.5, 'each extra cancels one right product');
  assert.equal(def.score(q, 'KCl(s) + NaOH(aq)').fraction, 0);
  const co = mk({ products: ['2H2O(l)', 'NaCl(aq)'], requireCoefficients: true });
  assert.equal(def.score(co, '2 H2O(l) + NaCl(aq)').full, true);
  assert.equal(def.score(co, 'H2O(l) + NaCl(aq)').fraction, 0.5);
  for (const bad of [undefined, null, 5, {}, [], '   ', '+', '->']) assert.doesNotThrow(() => def.score(q, bad));
});

test('isAnswered / texts', () => {
  const q = mk();
  assert.equal(def.isAnswered(q, '  '), false);
  assert.equal(def.isAnswered(q, 'x'), true);
  assert.equal(def.keyText(q), 'AgCl(s) + NaNO3(aq)');
  assert.equal(def.correctAnswer(q), 'AgCl(s) + NaNO3(aq)');
  assert.equal(def.answerText(q, ' AgCl(s) '), 'AgCl(s)');
  assert.equal(def.answerText(q, 7), '');
  const b = def.blank({ id: 'q9', type: 'reaction', text: '', points: 1 }); def.normalize(b);
  assert.deepEqual(errs(b), []);
});
