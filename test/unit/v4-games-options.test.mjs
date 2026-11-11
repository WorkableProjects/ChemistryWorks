import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGameOptions, validateGameOptions, cleanGameOptions, gameTest, limitCount, isUntimed, hintFor } from '../../js/lib/games/options.js';

const mcq = (id) => ({ id, type: 'mcq', text: id, points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctAnswer: 'a' });
const num = (id) => ({ id, type: 'numeric', text: id, points: 1, correctAnswer: 5.2, unit: 'g' });

test('defaults when gameOptions is missing or malformed', () => {
  for (const t of [{}, { gameOptions: null }, { gameOptions: 'x' }, { gameOptions: [] }, null]) {
    const o = normalizeGameOptions(t);
    assert.deepEqual(o.games, null);
    assert.equal(o.questions, null);
    assert.equal(o.lives, 3);
    assert.deepEqual(o.powerUps, { fifty: true, freeze: true, skip: true, hint: true });
    assert.equal(o.untimed, false);
    assert.equal(o.allowUntimed, true);
    assert.equal(o.sound, true);
    assert.equal(o.leaderboard, false);
    assert.equal(o.types, null);
  }
});

test('values are coerced and clamped; legacy test.games is the fallback', () => {
  const o = normalizeGameOptions({ games: ['classic'], gameOptions: { questions: '500', timePerQuestion: 1, totalSeconds: 30.4, lives: 0, powerUps: { skip: false }, types: ['mcq'], untimed: true, allowUntimed: false, sound: false, leaderboard: true } });
  assert.deepEqual(o.games, ['classic']);
  assert.equal(o.questions, 200);
  assert.equal(o.timePerQuestion, 5);
  assert.equal(o.totalSeconds, 30);
  assert.equal(o.lives, 1);
  assert.deepEqual(o.powerUps, { fifty: true, freeze: true, skip: false, hint: true });
  assert.deepEqual(o.types, ['mcq']);
  assert.ok(o.untimed && !o.allowUntimed && !o.sound && o.leaderboard);
  assert.deepEqual(normalizeGameOptions({ gameOptions: { games: ['tower'] }, games: ['classic'] }).games, ['tower']);
  assert.deepEqual(normalizeGameOptions({ gameOptions: { powerUps: false } }).powerUps, { fifty: false, freeze: false, skip: false, hint: false });
  assert.deepEqual(cleanGameOptions({ lives: 5 }), normalizeGameOptions({ gameOptions: { lives: 5 } }));
});

test('validateGameOptions', () => {
  assert.deepEqual(validateGameOptions({}), []);
  assert.deepEqual(validateGameOptions({ gameOptions: { games: ['tower', 'boss'], lives: 4 } }), []);
  assert.equal(validateGameOptions({ gameOptions: 5 }).length, 1);
  const errs = validateGameOptions({ gameOptions: { games: ['nope'], lives: 50, questions: 'x', untimed: 'yes', types: 'mcq' } });
  assert.equal(errs.length, 5);
  assert.match(errs.join('\n'), /unknown game "nope"/);
});

test('types filter, count limit, untimed resolution', () => {
  const t = { questions: [mcq('q1'), num('q2'), mcq('q3')], gameOptions: { types: ['mcq'] } };
  assert.deepEqual(gameTest(t).questions.map((q) => q.id), ['q1', 'q3']);
  assert.equal(gameTest({ questions: [mcq('q1')] }).questions.length, 1);
  assert.deepEqual(limitCount([1, 2, 3], 2), [1, 2]);
  assert.deepEqual(limitCount([1, 2, 3], null), [1, 2, 3]);
  const o = normalizeGameOptions({});
  assert.equal(isUntimed(o, false), false);
  assert.equal(isUntimed(o, true), true);
  assert.equal(isUntimed(normalizeGameOptions({ gameOptions: { allowUntimed: false } }), true), false);
  assert.equal(isUntimed(normalizeGameOptions({ gameOptions: { untimed: true } }), false), true);
});

test('hints do not give the answer away', () => {
  assert.match(hintFor(num('q')), /close to 5/);
  assert.match(hintFor({ type: 'formula', correctAnswer: 'H2SO4' }), /3 different/);
  assert.equal(hintFor(mcq('q')), null);
  assert.equal(hintFor({ type: 'mcq', hint: ' Think ' }), 'Think');
});
