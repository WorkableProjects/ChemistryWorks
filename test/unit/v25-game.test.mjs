import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGameQuestion, splitGameQuestions, allowsGameMode, speedFactor, streakMultiplier, scoreAnswer,
  summarizeGame, fiftyFiftyRemovals, bestKey, MIN_CORRECT_POINTS, BASE_POINTS,
} from '../../js/lib/game.js';
import { normalizeTest } from '../../js/lib/schema.js';

test('only explicit gameMode === true allows game mode', () => {
  assert.equal(allowsGameMode({ gameMode: true }), true);
  for (const v of [undefined, false, 'true', 1, null]) assert.equal(allowsGameMode({ gameMode: v }), false);
  assert.equal(allowsGameMode(null), false);
});

test('normalizeTest keeps the gameMode field', () => {
  assert.equal(normalizeTest({ code: 'x', gameMode: true, questions: [] }).gameMode, true);
});

test('question filtering: auto types play, manual and drawn types are skipped', () => {
  const qs = ['mcq', 'multi', 'truefalse', 'numeric', 'formula', 'short', 'open', 'lewis', 'structure', 'orbital', 'matching', 'ordering', 'fillblank']
    .map((type, i) => ({ id: `q${i}`, type }));
  const { playable, skipped } = splitGameQuestions({ questions: qs });
  assert.deepEqual(playable.map((q) => q.type), ['mcq', 'multi', 'truefalse', 'numeric', 'formula']);
  assert.equal(skipped.length, 8);
  assert.equal(isGameQuestion(null), false);
  assert.deepEqual(splitGameQuestions({}), { playable: [], skipped: [] });
});

test('speed factor runs from 1 down to 0.5 and clamps', () => {
  assert.equal(speedFactor(0, 20000), 1);
  assert.equal(speedFactor(10000, 20000), 0.75);
  assert.equal(speedFactor(20000, 20000), 0.5);
  assert.equal(speedFactor(99999, 20000), 0.5);
  assert.equal(speedFactor(-5, 20000), 1);
  assert.equal(speedFactor(5, 0), 0.5);
});

test('streak multiplier: none below 3, +10% per extra, capped', () => {
  assert.deepEqual([0, 1, 2].map(streakMultiplier), [1, 1, 1]);
  assert.equal(streakMultiplier(3), 1.1);
  assert.equal(streakMultiplier(4), 1.2);
  assert.equal(streakMultiplier(7), 1.5);
  assert.equal(streakMultiplier(50), 1.5);
});

test('scoreAnswer: correct > 0 (min 500), wrong = 0 and resets the streak', () => {
  const fast = scoreAnswer({ correct: true, elapsedMs: 0, limitMs: 20000, streak: 0 });
  assert.equal(fast.points, BASE_POINTS);
  assert.equal(fast.streak, 1);
  const slow = scoreAnswer({ correct: true, elapsedMs: 20000, limitMs: 20000, streak: 0 });
  assert.equal(slow.points, MIN_CORRECT_POINTS);
  const hot = scoreAnswer({ correct: true, elapsedMs: 0, limitMs: 20000, streak: 2 });
  assert.equal(hot.streak, 3);
  assert.equal(hot.points, 1100);
  const wrong = scoreAnswer({ correct: false, elapsedMs: 0, limitMs: 20000, streak: 5 });
  assert.deepEqual([wrong.points, wrong.streak], [0, 0]);
});

test('summarizeGame totals, accuracy and best streak', () => {
  const s = summarizeGame([
    { correct: true, points: 900 }, { correct: true, points: 800 }, { correct: false, points: 0 },
    { correct: true, points: 700 }, { correct: true, points: 600 }, { correct: true, points: 500 },
  ]);
  assert.deepEqual(s, { score: 3500, correct: 5, total: 6, accuracy: 83, bestStreak: 3 });
  assert.deepEqual(summarizeGame([]), { score: 0, correct: 0, total: 0, accuracy: 0, bestStreak: 0 });
});

test('50/50 removes up to two wrong options and never the answer', () => {
  const q = { type: 'mcq', correctAnswer: 'b', options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id })) };
  const r = fiftyFiftyRemovals(q);
  assert.equal(r.length, 2);
  assert.ok(!r.includes('b'));
  assert.deepEqual(fiftyFiftyRemovals({ ...q, options: q.options.slice(0, 3) }).length, 1);
  assert.deepEqual(fiftyFiftyRemovals({ ...q, options: q.options.slice(0, 2) }), []);
  assert.deepEqual(fiftyFiftyRemovals({ type: 'multi', options: [] }), []);
});

test('personal best key is per student and test', () => {
  assert.equal(bestKey('A@b.org', 'CHEM1'), 'gamebest:a@b.org:CHEM1');
});
