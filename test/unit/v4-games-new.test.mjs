import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTower, applyTowerAnswer, towerScore, tower, MAX_WOBBLES } from '../../js/lib/games/tower.js';
import { bossDamage, bossMaxHealth, applyBossAnswer, boss, VICTORY_BONUS } from '../../js/lib/games/boss.js';
import { startReview, answerReview, mistakeQuestions, mistakesFromResults, recordRound, mistakes, RIGHT_TWICE } from '../../js/lib/games/mistakes.js';
import { roundSig, parseDashNumber, generateDash, checkDash, dashSequence, dashLevel, unitdash, dashPoints } from '../../js/lib/games/unitdash.js';
import { makeRng } from '../../js/lib/games/common.js';
import { playableGames } from '../../js/lib/games/index.js';

const mcq = (id, points = 1) => ({ id, type: 'mcq', text: id, points, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctAnswer: 'a' });

test('tower: block per right answer, wobble per wrong, falls on the third', () => {
  let t = newTower();
  t = applyTowerAnswer(t, { correct: true });
  t = applyTowerAnswer(t, { correct: true });
  assert.equal(t.blocks, 2);
  assert.equal(towerScore(t), 200);
  t = applyTowerAnswer(t, { correct: false });
  assert.deepEqual([t.wobbles, t.fell, t.wobbled, t.over], [1, false, true, false]);
  t = applyTowerAnswer(t, { correct: false });
  t = applyTowerAnswer(t, { correct: false });
  assert.equal(t.wobbles, MAX_WOBBLES);
  assert.ok(t.fell && t.over);
  const after = applyTowerAnswer(t, { correct: true });
  assert.equal(after.blocks, 2); // a fallen tower stays fallen
  assert.equal(towerScore(after), 200);
  assert.equal(tower.availability({ questions: [mcq('1'), mcq('2')] }).playable, false);
  assert.equal(tower.availability({ questions: [mcq('1'), mcq('2'), mcq('3')] }).playable, true);
});

test('boss: harder questions hit harder, wrong answers cost lives, defeat gives a bonus', () => {
  assert.ok(bossDamage(mcq('h', 3)) > bossDamage(mcq('e', 1)));
  assert.ok(bossDamage(mcq('e'), 4) > bossDamage(mcq('e'), 0));
  const qs = [mcq('a', 1), mcq('b', 2), mcq('c', 3)];
  const max = bossMaxHealth(qs);
  assert.equal(max, Math.round((10 + 20 + 30) * 0.7));
  let s = { health: max, maxHealth: max, lives: 2, maxLives: 2, streak: 0, score: 0 };
  const miss = applyBossAnswer(s, qs[0], false);
  assert.deepEqual([miss.lives, miss.health, miss.bossHit, miss.over], [1, max, true, false]);
  assert.equal(applyBossAnswer(miss, qs[0], false).over, true);
  s = applyBossAnswer(s, qs[2], true);
  assert.equal(s.health, max - 30);
  s = applyBossAnswer(s, qs[1], true);
  assert.ok(s.defeated && s.over && s.health === 0);
  assert.ok(s.score >= VICTORY_BONUS);
  assert.equal(boss.availability({ questions: [] }).playable, false);
});

test('mistake review: right twice clears, wrong comes back, state is pure', () => {
  const qs = [mcq('q1'), mcq('q2')];
  let st = startReview(qs);
  assert.deepEqual(st.queue, ['q1', 'q2']);
  st = answerReview(st, true); // q1 right once -> requeued after q2
  assert.deepEqual(st.queue, ['q2', 'q1']);
  st = answerReview(st, false); // q2 wrong
  assert.equal(st.wrong, 1);
  st = answerReview(st, true); // q1 right twice -> cleared
  assert.ok(st.solved);
  assert.deepEqual(st.queue, ['q2']);
  st = answerReview(st, true); st = answerReview(st, true);
  assert.ok(st.done);
  assert.equal(st.right.q2, RIGHT_TWICE);
  assert.equal(st.answered, 5);
});

test('mistake sources: released results only when answers are shown; unknown / manual questions ignored', () => {
  const test_ = { code: 'T1', questions: [mcq('q1'), mcq('q2'), { id: 'o', type: 'open', text: 'x' }] };
  const payloads = [{ test_code: 'T1', responses: [{ questionId: 'q1', answered: true, isCorrect: false }, { questionId: 'q2', answered: true, isCorrect: true }, { questionId: 'o', answered: true, isCorrect: false, needsGrading: true }] },
    { test_code: 'OTHER', responses: [{ questionId: 'q2', answered: true, isCorrect: false }] }];
  assert.deepEqual(mistakesFromResults(payloads, test_), ['q1']);
  assert.deepEqual(mistakesFromResults(payloads, { ...test_, showCorrectAnswers: false }), []);
  assert.deepEqual(mistakeQuestions(test_, ['q1', 'o', 'zz']).map((q) => q.id), ['q1']);
  const a = mistakes.availability(test_, { email: 'a@x.org', localResults: payloads });
  assert.equal(a.playable, true);
  assert.equal(mistakes.availability(test_, { email: 'a@x.org' }).playable, false);
  assert.ok(Array.isArray(recordRound('a@x.org', 'T1', [{ q: mcq('q1'), correct: false }]))); // storage-less node: degrades, no throw
  assert.equal(playableGames(test_, { email: 'a@x.org' }).find((x) => x.game.id === 'mistakes').playable, false);
});

test('unit dash: rounding, parsing, generation and checking', () => {
  assert.equal(roundSig(0.004567, 2), 0.0046);
  assert.equal(roundSig(12345, 2), 12000);
  assert.equal(roundSig(0, 3), 0);
  assert.equal(parseDashNumber('1,200'), 1200);
  assert.equal(parseDashNumber('1.2e3'), 1200);
  assert.equal(parseDashNumber('1.2x10^3'), 1200);
  assert.equal(parseDashNumber('1.2 × 10^-3'), 0.0012);
  assert.ok(Number.isNaN(parseDashNumber('abc')));
  assert.ok(Number.isNaN(parseDashNumber('')));
  assert.deepEqual(dashSequence(8, 's'), dashSequence(8, 's')); // deterministic
  for (let level = 0; level <= 3; level++) {
    const rand = makeRng(`l${level}`);
    for (let i = 0; i < 60; i++) {
      const q = generateDash(level, rand);
      assert.ok(Number.isFinite(q.answer), q.prompt);
      assert.ok(checkDash(q, String(q.answer)), q.prompt);
      assert.equal(checkDash(q, String(q.answer * 10 + 1)), false, q.prompt);
    }
  }
  assert.equal(checkDash({ kind: 'convert', answer: 0.25 }, '0.25'), true);
  assert.equal(checkDash({ kind: 'temperature', answer: 298.15 }, '298.15'), true);
  assert.equal(dashLevel(0), 0); assert.equal(dashLevel(3), 1); assert.equal(dashLevel(99), 3);
  assert.ok(dashPoints(5) > dashPoints(0));
  assert.equal(unitdash.availability({ questions: [] }).playable, true); // no test questions needed
});
