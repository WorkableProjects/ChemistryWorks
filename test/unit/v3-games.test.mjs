import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, playableGames, getGame, loadBest, saveBest, gameBestKey, legacyBestKey } from '../../js/lib/games/index.js';
import { applySurvivalAnswer, sortSurvival, START_LIVES } from '../../js/lib/games/survival.js';
import { lightningPoints, secondsLeft } from '../../js/lib/games/lightning.js';
import { buildPrompts } from '../../js/lib/games/elementhunt.js';
import { choosePairs, buildDeck, isMatch, matchScore, pairsFromMatching } from '../../js/lib/games/matchup.js';
import { advanceQueue, buildCards } from '../../js/lib/games/flashcards.js';
import { makeRng } from '../../js/lib/games/common.js';

const mcq = (id, points = 1) => ({ id, type: 'mcq', text: id, points, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctAnswer: 'a' });
const matching = { id: 'm1', type: 'matching', text: 'm', left: [{ id: 'l1', text: 'Na' }, { id: 'l2', text: 'K' }], right: [{ id: 'r1', text: 'Sodium' }, { id: 'r2', text: 'Potassium' }], correctAnswer: { l1: 'r1', l2: 'r2' } };

test('registry lists every game with the documented shape', () => {
  assert.deepEqual(GAMES.map((g) => g.id), ['classic', 'survival', 'lightning', 'elementhunt', 'matchup', 'flashcards']);
  for (const g of GAMES) for (const k of ['id', 'title', 'blurb', 'icon', 'playableTypes', 'minQuestions']) assert.ok(k in g, `${g.id}.${k}`);
  assert.equal(getGame('nope'), null);
});

test('playableGames honours test.games and reports reasons', () => {
  const t = { questions: [mcq('q1'), mcq('q2'), mcq('q3')] };
  const all = playableGames(t);
  assert.equal(all.length, 6);
  assert.ok(all.every((x) => x.playable));
  const none = playableGames({ questions: [] });
  assert.equal(none.find((x) => x.game.id === 'classic').playable, false);
  assert.match(none.find((x) => x.game.id === 'survival').reason, /at least 3/);
  assert.equal(none.find((x) => x.game.id === 'elementhunt').playable, true);
  assert.deepEqual(playableGames({ ...t, games: ['flashcards', 'classic'] }).map((x) => x.game.id), ['classic', 'flashcards']);
  assert.equal(playableGames({ ...t, games: ['bogus'] }).length, 6);
  assert.equal(playableGames({ questions: [mcq('q1'), { id: 'n', type: 'numeric', text: 'n', correctAnswer: 1 }, mcq('q3')] }).find((x) => x.game.id === 'lightning').playable, true);
});

test('best score keys: per game, classic falls back to the pre-v3 key', () => {
  assert.equal(gameBestKey('A@x.org', 'C1', 'survival'), 'gamebest:a@x.org:C1:survival');
  assert.equal(legacyBestKey('A@x.org', 'C1'), 'gamebest:a@x.org:C1');
  assert.equal(loadBest('a@x.org', 'C1', 'classic'), 0); // no localStorage in node: degrades to 0
  assert.deepEqual(saveBest('a@x.org', 'C1', 'classic', 50), { best: 50, isBest: true });
});

test('survival: lives, regain every 5 in a row (capped), harder order', () => {
  let s = { lives: START_LIVES, streak: 0 };
  s = { ...s, ...applySurvivalAnswer(s, { correct: false }) };
  assert.equal(s.lives, 2);
  let gained = 0;
  for (let i = 0; i < 5; i++) { const r = applySurvivalAnswer(s, { correct: true, points: 1 }); s = { lives: r.lives, streak: r.streak }; gained += r.lifeGained ? 1 : 0; }
  assert.equal(gained, 1); assert.equal(s.lives, 3);
  for (let i = 0; i < 5; i++) { const r = applySurvivalAnswer(s, { correct: true }); s = { lives: r.lives, streak: r.streak }; }
  assert.equal(s.lives, 3); // never above the starting lives
  assert.equal(applySurvivalAnswer({ lives: 1, streak: 4 }, { correct: false }).over, true);
  assert.deepEqual(sortSurvival([mcq('c', 3), mcq('a', 1), mcq('b', 2)], makeRng('x')).map((q) => q.id), ['a', 'b', 'c']);
});

test('lightning: 60 s total, skips cost 2 s, streak bonus', () => {
  assert.equal(secondsLeft(0, 0), 60);
  assert.equal(secondsLeft(10000, 3), 44);
  assert.equal(secondsLeft(100000, 0), 0);
  assert.equal(lightningPoints(0), 100);
  assert.ok(lightningPoints(5) > 100);
});

test('element hunt prompts are valid and accept their target', () => {
  const ps = buildPrompts(14, makeRng('seed'));
  assert.equal(ps.length, 14);
  for (const p of ps) { assert.ok(p.text.length > 5); assert.equal(p.accepts(p.target), true, p.text); }
});

test('match-up pairs and scoring', () => {
  assert.equal(pairsFromMatching({ questions: [matching] }).length, 2);
  const { pairs, fromTest } = choosePairs({ questions: [matching] }, 6, makeRng('p'));
  assert.equal(pairs.length, 6); assert.equal(fromTest, 2);
  const deck = buildDeck(pairs, makeRng('d'));
  assert.equal(deck.length, 12);
  const a = deck.find((c) => c.side === 'a'); const b = deck.find((c) => c.pairId === a.pairId && c.side === 'b');
  assert.equal(isMatch(a, b), true); assert.equal(isMatch(a, a), false);
  assert.equal(matchScore({ pairs: 6, misses: 0 }), 600);
  assert.equal(matchScore({ pairs: 6, misses: 100 }), 120);
});

test('flashcards: review cards come back later, known cards leave', () => {
  const q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
  assert.deepEqual(advanceQueue(q, true).map((c) => c.id), ['b', 'c', 'd', 'e']);
  assert.deepEqual(advanceQueue(q, false).map((c) => c.id), ['b', 'c', 'd', 'a', 'e']);
  assert.deepEqual(advanceQueue([{ id: 'a' }], false).map((c) => c.id), ['a']);
  assert.equal(buildCards([mcq('q1')])[0].back, 'A');
});
