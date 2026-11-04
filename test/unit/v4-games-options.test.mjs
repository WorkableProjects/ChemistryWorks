import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGameOptions, validateGameOptions, cleanGameOptions, gameTest, limitCount, isUntimed, hintFor } from '../../js/lib/games/options.js';
import { playableGames } from '../../js/lib/games/index.js';
import { scoreAnswer, UNTIMED_POINTS, isGameQuestion } from '../../js/lib/game.js';
import { applySurvivalAnswer } from '../../js/lib/games/survival.js';
import { secondsLeft } from '../../js/lib/games/lightning.js';
import { scoreHunt } from '../../js/lib/games/elementhunt.js';
import { choosePairs } from '../../js/lib/games/matchup.js';

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

test('playableGames respects gameOptions.games and gameOptions.types', () => {
  const qs = [mcq('q1'), mcq('q2'), mcq('q3'), num('q4')];
  assert.deepEqual(playableGames({ questions: qs, gameOptions: { games: ['tower', 'classic'] } }).map((x) => x.game.id), ['classic', 'tower']);
  const onlyNum = playableGames({ questions: qs, gameOptions: { types: ['numeric'] } });
  assert.equal(onlyNum.find((x) => x.game.id === 'classic').questions.length, 1);
  assert.equal(onlyNum.find((x) => x.game.id === 'survival').playable, false);
});

test('untimed removes speed points (classic + element hunt) and the timer pieces', () => {
  const fast = scoreAnswer({ correct: true, elapsedMs: 0, limitMs: 20000, streak: 0 });
  const slow = scoreAnswer({ correct: true, elapsedMs: 19000, limitMs: 20000, streak: 0 });
  assert.ok(fast.points > slow.points);
  const a = scoreAnswer({ correct: true, elapsedMs: 0, limitMs: 20000, streak: 0, untimed: true });
  const b = scoreAnswer({ correct: true, elapsedMs: 19999, limitMs: 20000, streak: 0, untimed: true });
  assert.equal(a.points, UNTIMED_POINTS);
  assert.equal(b.points, UNTIMED_POINTS);
  assert.equal(scoreHunt({ correct: true, elapsedMs: 0, streak: 0, untimed: true }).points, scoreHunt({ correct: true, elapsedMs: 19000, streak: 0, untimed: true }).points);
  assert.equal(scoreAnswer({ correct: false, untimed: true }).points, 0);
});

test('lives option: survival starting lives and regain cap; total seconds for lightning', () => {
  assert.equal(applySurvivalAnswer({ lives: 5, streak: 4, maxLives: 5 }, { correct: true }).lives, 5);
  assert.equal(applySurvivalAnswer({ lives: 4, streak: 4, maxLives: 5 }, { correct: true }).lives, 5);
  assert.equal(applySurvivalAnswer({ lives: 1, streak: 0, maxLives: 1 }, { correct: false }).over, true);
  assert.equal(applySurvivalAnswer({ lives: 3, streak: 4 }, { correct: true }).lives, 3); // default cap still 3
  assert.equal(secondsLeft(10000, 0, 30), 20);
  assert.equal(secondsLeft(10000, 0), 50);
});

test('match-up pair count follows the option', () => {
  assert.equal(choosePairs({ questions: [] }, 3).pairs.length, 3);
  assert.equal(choosePairs({ questions: [] }, 10).pairs.length, 10);
});

test('v4 auto-graded types play in Classic; hints do not give the answer away', () => {
  assert.equal(isGameQuestion({ id: 'n', type: 'naming', text: 'n', correctAnswer: 'x' }), true);
  assert.equal(isGameQuestion({ id: 'm', type: 'multipart', text: 'm' }), false);
  assert.match(hintFor(num('q')), /close to 5/);
  assert.match(hintFor({ type: 'formula', correctAnswer: 'H2SO4' }), /3 different/);
  assert.equal(hintFor(mcq('q')), null);
  assert.equal(hintFor({ type: 'mcq', hint: ' Think ' }), 'Think');
});
