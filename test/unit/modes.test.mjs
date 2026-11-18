// Game mode registry and scoring for every mode (js/lib/modes/*). Pure logic, no DOM.
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear(),
  };
};
globalThis.localStorage = memory();
globalThis.sessionStorage = memory();
import test from 'node:test';
import assert from 'node:assert/strict';

const { MODES, MODE_IDS, modeById, isModeId, modesForTest } = await import('../../js/lib/modes/index.js');
const common = await import('../../js/lib/modes/common.js');
const { advanceCards } = await import('../../js/lib/modes/flashcards.js');
const { mistakeIds, FIX_POINTS } = await import('../../js/lib/modes/mistakes.js');
const { applySurvival, sortSurvival, START_LIVES } = await import('../../js/lib/modes/survival.js');
const { applyTower, newTower } = await import('../../js/lib/modes/tower.js');
const { applyBoss, bossDamage, bossMaxHealth, VICTORY_BONUS, LIFE_BONUS } = await import('../../js/lib/modes/boss.js');
const { applyRace, saveGhost, loadGhost, ghostAt } = await import('../../js/lib/modes/race.js');
const { buildCard, bingoLines, completedLines, applyBingo, cardSize, CELL_POINTS, LINE_POINTS, FULL_POINTS } = await import('../../js/lib/modes/bingo.js');
const { buildPairs, buildRounds } = await import('../../js/lib/modes/matchup.js');
const { tilePoints, boardGroups } = await import('../../js/lib/modes/quizshow.js');
const { TOTAL_SECONDS, SKIP_PENALTY_SECONDS } = await import('../../js/lib/modes/lightning.js');
const { normalizeTest } = await import('../../js/lib/schema.js');
const { openAttempt } = await import('../../js/lib/attempt.js');

const mcq = (id, points = 1) => ({ id, type: 'mcq', text: `Question ${id}`, points, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctAnswer: 'a' });
const mkTest = (extra = {}, n = 4) => normalizeTest({
  code: 'MODES1', title: 'Modes', gameMode: true, questions: Array.from({ length: n }, (_, i) => mcq(`q${i + 1}`)), ...extra,
});
const fakeAttempt = (map = {}, shows = true) => ({
  isAnswered: (id) => id in map, showsCorrectness: () => shows, resultFor: (id) => ({ correct: map[id] ?? null }),
});

test('registry: twelve modes in order, study first', () => {
  assert.equal(MODES.length, 12);
  assert.deepEqual(MODES.map((m) => m.id), MODE_IDS.slice().sort((a, b) => modeById(a).order - modeById(b).order));
  assert.equal(MODES[0].id, 'study');
  assert.ok(isModeId('bingo') && !isModeId('nope'));
  assert.equal(modeById('nope'), null);
  for (const m of MODES) {
    assert.equal(typeof m.title, 'string', m.id);
    assert.equal(typeof m.scoring, 'function', m.id);
    assert.equal(typeof m.available, 'function', m.id);
  }
});

test('study scores 0 and is always available (current contract)', () => {
  const study = modeById('study');
  assert.deepEqual(study.scoring({}, []), { score: 0, detail: {} });
  assert.deepEqual(study.scoring({}, [{ id: 'q1', outcome: 'correct', points: 500 }]), { score: 0, detail: {} });
  assert.deepEqual(study.available(), { ok: true });
});

test('modesForTest: a test without gameMode offers Study only', () => {
  const rows = modesForTest(mkTest({ gameMode: false }));
  assert.deepEqual(rows.map((r) => r.mode.id), ['study']);
  assert.deepEqual(modesForTest(null).map((r) => r.mode.id), ['study']);
});

test('modesForTest: gameMode on offers every mode, limited by gameOptions.games', () => {
  assert.equal(modesForTest(mkTest()).length, 12);
  const limited = modesForTest(mkTest({ gameOptions: { games: ['classic', 'tower', 'removed-mode'] } })).map((r) => r.mode.id);
  assert.deepEqual(limited, ['study', 'classic', 'tower']);
});

test('modesForTest: availability reasons for small tests and hidden answers', () => {
  const two = Object.fromEntries(modesForTest(mkTest({}, 2)).map((r) => [r.mode.id, r]));
  assert.equal(two.classic.available, true);
  assert.equal(two.lightning.available, false);
  assert.match(two.lightning.reason, /at least 3/);
  assert.equal(two.bingo.available, false);
  const hidden = Object.fromEntries(modesForTest(mkTest({ showCorrectAnswers: false }, 8)).map((r) => [r.mode.id, r]));
  for (const id of ['survival', 'tower', 'boss', 'race', 'quizshow', 'bingo']) {
    assert.equal(hidden[id].available, false, id);
    assert.match(hidden[id].reason, /correct answers/, id);
  }
  assert.equal(hidden.classic.available, true);
  assert.equal(hidden.flashcards.available, true);
});

test('common: speed factor, streak multiplier and points', () => {
  assert.equal(common.speedFactor(0, 20000), 1);
  assert.equal(common.speedFactor(20000, 20000), 0.5);
  assert.equal(common.speedFactor(10000, 20000), 0.75);
  assert.equal(common.speedFactor(5, 0), 0.5);
  assert.equal(common.streakMultiplier(0), 1);
  assert.equal(common.streakMultiplier(2), 1);
  assert.equal(common.streakMultiplier(3), 1.1);
  assert.equal(common.streakMultiplier(5), 1.3);
  assert.equal(common.streakMultiplier(50), 1.5);
  assert.deepEqual(common.pointsFor({ elapsedMs: 0, limitMs: 20000, streak: 0 }), { points: 1000, streak: 1 });
  assert.equal(common.pointsFor({ elapsedMs: 20000, limitMs: 20000 }).points, 500);
  assert.equal(common.pointsFor({ limitMs: null }).points, 750, 'untimed is flat');
  assert.equal(common.pointsFor({ limitMs: null, streak: 2 }).points, Math.round(750 * 1.1), 'the third in a row gets the bonus');
});

test('common: long and teacher-graded types are slow', () => {
  assert.equal(common.slowFactor({ type: 'mcq' }), 1);
  assert.equal(common.slowFactor({ type: 'balance' }), 3);
  assert.equal(common.slowFactor({ type: 'short' }), 3);
  assert.equal(common.isSlow(null), false);
});

test('common: outcomeOf', () => {
  const q = { id: 'q1', type: 'mcq' };
  assert.equal(common.outcomeOf(fakeAttempt({}), q), 'blank');
  assert.equal(common.outcomeOf(fakeAttempt({ q1: true }), q), 'correct');
  assert.equal(common.outcomeOf(fakeAttempt({ q1: false }), q), 'wrong');
  assert.equal(common.outcomeOf(fakeAttempt({ q1: true }, false), q), 'saved');
  assert.equal(common.outcomeOf(fakeAttempt({ q1: null }), q), 'manual');
  assert.equal(common.outcomeOf(fakeAttempt({ q1: true }), { id: 'q1', type: 'short' }), 'manual');
});

test('common: sumEvents and per-mode best score', () => {
  assert.deepEqual(common.sumEvents([{ outcome: 'correct', points: 100 }, { outcome: 'wrong', points: 0 }, { outcome: 'correct', points: 50 }]), { score: 150, detail: { correct: 2, resolved: 3 } });
  assert.deepEqual(common.sumEvents(undefined), { score: 0, detail: { correct: 0, resolved: 0 } });
  assert.equal(common.loadModeBest('A@x.org', 'T1', 'classic'), 0);
  assert.deepEqual(common.saveModeBest('A@x.org', 'T1', 'classic', 300), { best: 300, isBest: true });
  assert.deepEqual(common.saveModeBest('a@x.org', 'T1', 'classic', 200), { best: 300, isBest: false });
  assert.equal(common.loadModeBest('a@x.org', 'T1', 'classic'), 300);
});

test('classic: speed points, streak bonus, untimed and manual questions', () => {
  const classic = modeById('classic');
  const test = mkTest();
  const rules = classic.rules(test, {});
  assert.equal(rules.clock, 'question');
  assert.equal(rules.secondsFor({ type: 'mcq' }), 20);
  assert.equal(rules.secondsFor({ type: 'balance' }), 60);
  assert.equal(rules.secondsFor({ type: 'short' }), null);
  assert.equal(classic.rules(test, { timePerQuestion: 30 }).secondsFor({ type: 'mcq' }), 30);
  assert.equal(classic.rules(test, { untimed: true }).clock, 'none');
  let state = rules.init();
  let r = rules.apply(state, { outcome: 'correct', elapsedMs: 0, limitMs: 20000 });
  assert.equal(r.points, 1000);
  state = r.state;
  r = rules.apply(state, { outcome: 'correct', elapsedMs: 0, limitMs: 20000 });
  state = r.state;
  r = rules.apply(state, { outcome: 'correct', elapsedMs: 0, limitMs: 20000 });
  assert.equal(r.points, 1100, 'third in a row gets +10%');
  assert.equal(r.state.streak, 3);
  assert.equal(rules.apply(r.state, { outcome: 'wrong' }).state.streak, 0);
  assert.equal(rules.apply(r.state, { outcome: 'manual' }).state.streak, 3, 'a teacher-graded answer keeps the streak');
  const hidden = rules.apply({ streak: 4 }, { outcome: 'saved', elapsedMs: 0, limitMs: 20000 });
  assert.equal(hidden.state.streak, 0, 'hidden correctness gives no streak');
  assert.equal(hidden.points, 1000);
  assert.deepEqual(classic.scoring({}, [{ outcome: 'correct', points: 1000 }, { outcome: 'wrong', points: 0 }]), { score: 1000, detail: { correct: 1, resolved: 2 } });
});

test('lightning: total clock, skip cost, drain rate and flat points', () => {
  const lightning = modeById('lightning');
  const rules = lightning.rules(mkTest(), {});
  assert.equal(rules.clock, 'total');
  assert.equal(rules.totalSeconds, TOTAL_SECONDS);
  assert.equal(rules.skipCost, SKIP_PENALTY_SECONDS);
  assert.equal(rules.maxSkips, Infinity);
  assert.equal(rules.drainRate({ type: 'mcq' }), 1);
  assert.equal(rules.drainRate({ type: 'graph' }), 1 / 3);
  assert.equal(rules.drainRate({ type: 'open' }), 0);
  assert.equal(lightning.rules(mkTest(), { untimed: true }).clock, 'none');
  let r = rules.apply(rules.init(), { outcome: 'correct' });
  assert.equal(r.points, 100);
  r = rules.apply(r.state, { outcome: 'correct' });
  r = rules.apply(r.state, { outcome: 'correct' });
  assert.equal(r.points, 110, 'streak bonus applies from the third');
  assert.equal(rules.apply(r.state, { outcome: 'wrong' }).points, 0);
  assert.equal(lightning.scoring({}, [{ outcome: 'correct', points: 100 }]).score, 100);
});

test('survival: lives, regained life, streak bonus, ordering', () => {
  assert.equal(START_LIVES, 3);
  let s = { lives: 3, maxLives: 3, streak: 0 };
  let r = applySurvival(s, { outcome: 'correct', points: 2 });
  assert.equal(r.points, 200);
  s = r.state;
  r = applySurvival(s, { outcome: 'correct', points: 1 });
  assert.equal(r.points, 110, 'streak adds 10 per answer already in the streak');
  r = applySurvival({ lives: 2, maxLives: 3, streak: 4 }, { outcome: 'correct' });
  assert.equal(r.lifeGained, true);
  assert.equal(r.state.lives, 3);
  r = applySurvival({ lives: 3, maxLives: 3, streak: 4 }, { outcome: 'correct' });
  assert.equal(r.lifeGained, false, 'never above the start lives');
  r = applySurvival({ lives: 1, maxLives: 3, streak: 2 }, { outcome: 'wrong' });
  assert.deepEqual([r.lifeLost, r.over, r.state.lives, r.state.streak, r.points], [true, true, 0, 0, 0]);
  assert.equal(applySurvival({ lives: 3, maxLives: 3, streak: 2 }, { outcome: 'blank' }).state.lives, 2);
  assert.equal(applySurvival({ lives: 3, maxLives: 3, streak: 2 }, { outcome: 'manual' }).state.lives, 3);
  assert.equal(applySurvival({ lives: 3, maxLives: 3, streak: 0 }, { outcome: 'saved' }).points, 100);
  const qs = [{ id: 'a', points: 3 }, { id: 'b', points: 1 }, { id: 'c', points: 3 }, { id: 'd', points: 2 }];
  assert.deepEqual(sortSurvival(qs).map((q) => q.id), ['b', 'd', 'a', 'c']);
  const rules = modeById('survival').rules(mkTest(), { lives: 5 });
  assert.equal(rules.init().lives, 5);
  assert.equal(rules.apply(rules.init(), { q: { type: 'short', points: 1 }, outcome: 'wrong' }).state.lives, 5, 'teacher-graded questions never cost a life');
  assert.equal(rules.apply(rules.init(), { q: { type: 'mcq', points: 1 }, outcome: 'wrong' }).state.lives, 4);
});

test('tower: blocks, wobbles and the fall', () => {
  let s = newTower();
  let r = applyTower(s, { outcome: 'correct' });
  assert.deepEqual([r.state.blocks, r.points], [1, 100]);
  s = r.state;
  r = applyTower(s, { outcome: 'wrong' });
  assert.deepEqual([r.state.wobbles, r.wobbled, r.over, r.points], [1, true, false, 0]);
  r = applyTower(r.state, { outcome: 'blank' });
  r = applyTower(r.state, { outcome: 'wrong' });
  assert.equal(r.state.fell, true);
  assert.equal(r.over, true);
  const after = applyTower(r.state, { outcome: 'correct' });
  assert.deepEqual([after.points, after.over, after.state.blocks], [0, true, 1], 'nothing counts once it has fallen');
  assert.deepEqual(applyTower(newTower(), { outcome: 'saved' }).state, newTower());
  assert.deepEqual(applyTower(newTower(), { outcome: 'manual' }).state, newTower());
  assert.equal(modeById('tower').scoring({}, [{ outcome: 'correct', points: 100 }, { outcome: 'correct', points: 100 }]).score, 200);
});

test('boss: damage, health, victory bonus and defeat', () => {
  const easy = { points: 1 };
  const hard = { points: 3 };
  assert.equal(bossDamage(easy), 10);
  assert.equal(bossDamage(hard), 30);
  assert.equal(bossDamage(easy, 3), 13, 'streak adds 10% each');
  assert.equal(bossDamage(easy, 99), 15, 'capped at +50%');
  assert.equal(bossMaxHealth([easy, easy, hard]), Math.round(50 * 0.7));
  assert.equal(bossMaxHealth([]), 10);
  const start = { health: 20, maxHealth: 20, lives: 3, maxLives: 3, streak: 0 };
  let r = applyBoss(start, { q: easy, outcome: 'correct' });
  assert.deepEqual([r.damage, r.state.health, r.defeated, r.over], [10, 10, false, false]);
  assert.equal(r.points, 100);
  r = applyBoss(r.state, { q: hard, outcome: 'correct' });
  assert.equal(r.defeated, true);
  assert.equal(r.state.health, 0);
  assert.equal(r.points, 100 * 3 + 10 + VICTORY_BONUS + LIFE_BONUS * 3, 'answer points, streak bonus, victory and life bonus');
  assert.equal(r.over, true);
  r = applyBoss({ ...start, lives: 1 }, { q: easy, outcome: 'wrong' });
  assert.deepEqual([r.lifeLost, r.over, r.damage, r.state.health], [true, true, 0, 20]);
  const same = applyBoss(start, { q: easy, outcome: 'manual' });
  assert.equal(same.state, start);
  assert.equal(same.points, 0);
  const rules = modeById('boss').rules(mkTest(), {});
  const init = rules.init([easy, easy, hard]);
  assert.deepEqual([init.health, init.lives], [35, 3]);
});

test('race: steps, streak bonus, ghost', () => {
  let s = { steps: 0, streak: 0 };
  let r = applyRace(s, { outcome: 'correct' });
  assert.deepEqual([r.state.steps, r.points], [1, 100]);
  r = applyRace(r.state, { outcome: 'correct' });
  assert.equal(r.points, 110);
  r = applyRace(r.state, { outcome: 'wrong' });
  assert.deepEqual([r.state.steps, r.state.streak, r.points], [2, 0, 0]);
  s = { steps: 9, streak: 99 };
  assert.equal(applyRace(s, { outcome: 'correct' }).points, 150, 'bonus is capped');
  assert.equal(applyRace(s, { outcome: 'manual' }).state, s);
  assert.equal(loadGhost('RACE1', 4), null);
  saveGhost('RACE1', [1, 0, 1, 1]);
  assert.deepEqual(loadGhost('RACE1', 4), [1, 0, 1, 1]);
  assert.equal(loadGhost('RACE1', 5), null, 'a run with a different length is not a ghost');
  assert.equal(ghostAt([1, 0, 1, 1], 3), 2);
  assert.equal(ghostAt(null, 3), 0);
  assert.equal(modeById('race').scoring({}, [{ outcome: 'correct', points: 100 }]).score, 100);
});

test('bingo: card, lines, marks and bonuses', () => {
  assert.equal(cardSize(6), 3);
  assert.equal(cardSize(12), 3);
  assert.equal(cardSize(13), 4);
  assert.equal(bingoLines(3).length, 8);
  assert.equal(bingoLines(4).length, 10);
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const card = buildCard(ids);
  assert.equal(card.length, 9);
  assert.equal(card.filter((c) => c.free).length, 3);
  assert.deepEqual(card.filter((c) => !c.free).map((c) => c.qid), ids);
  assert.equal(buildCard([...ids, 'g', 'h', 'i', 'j']).filter((c) => !c.free).length, 9, 'extra questions are cut');
  const free = card.filter((c) => c.free).map((c) => c.index);
  assert.deepEqual(completedLines(3, free), [], 'spare squares never form a line alone');
  assert.deepEqual(completedLines(3, [0, 1, 2]), [0]);
  assert.deepEqual(completedLines(3, [0, 4, 8]), [6]);
  let r = applyBingo({ size: 3, marked: new Set([0, 1]), outcome: 'correct', index: 2 });
  assert.deepEqual([r.newLines, r.points, r.full], [1, CELL_POINTS + LINE_POINTS, false]);
  r = applyBingo({ size: 3, marked: new Set([0, 1]), outcome: 'wrong', index: 2 });
  assert.deepEqual([r.marked.has(2), r.points], [false, 0]);
  r = applyBingo({ size: 3, marked: new Set([0, 1, 2, 3, 4, 5, 6, 7]), outcome: 'correct', index: 8 });
  assert.equal(r.full, true);
  assert.equal(r.points, CELL_POINTS + 3 * LINE_POINTS + FULL_POINTS);
});

test('matchup: pairs from questions and rounds', () => {
  const questions = [
    mcq('m1'),
    { id: 'n1', type: 'numeric', text: 'Atomic number of carbon?', points: 1, correctAnswer: 6, tolerance: 0, toleranceType: 'absolute', unit: '' },
    { id: 'f1', type: 'formula', text: 'Formula of water', points: 1, correctAnswer: 'H2O' },
    { id: 'o1', type: 'open', text: 'Explain', points: 2 },
    { id: 'mt', type: 'matching', text: 'Match', points: 2, left: [{ id: 'l1', text: 'Na' }, { id: 'l2', text: 'Cl' }], right: [{ id: 'r1', text: '+1' }, { id: 'r2', text: '-1' }], correctAnswer: { l1: 'r1', l2: 'r2' } },
  ];
  const pairs = buildPairs(questions);
  assert.deepEqual(pairs.map((p) => p.id), ['m1', 'n1', 'f1', 'mt:l1', 'mt:l2']);
  assert.equal(pairs.find((p) => p.id === 'm1').value, 'a');
  assert.equal(pairs.find((p) => p.id === 'n1').value, '6');
  assert.deepEqual([pairs[3].prompt, pairs[3].answer, pairs[3].value, pairs[3].leftId], ['Na', '+1', 'r1', 'l1']);
  assert.deepEqual(buildPairs(null), []);
  const many = Array.from({ length: 13 }, (_, i) => ({ id: `p${i}` }));
  assert.deepEqual(buildRounds(many).map((r) => r.length), [6, 7], 'a last round of fewer than 3 is folded in');
  assert.deepEqual(buildRounds(many.slice(0, 12)).map((r) => r.length), [6, 6]);
  assert.deepEqual(buildRounds(many.slice(0, 4)).map((r) => r.length), [4]);
  const m = modeById('matchup');
  assert.equal(m.available(mkTest({}, 2)).ok, false);
});

test('quizshow: tile points and board groups', () => {
  assert.equal(tilePoints({ difficulty: 'hard' }), 300);
  assert.equal(tilePoints({ difficulty: 'Easy' }), 100);
  assert.equal(tilePoints({ difficulty: 4 }), 400);
  assert.equal(tilePoints({ difficulty: 9 }), 500);
  assert.equal(tilePoints({ points: 2 }), 200);
  assert.equal(tilePoints({ points: 12 }), 500);
  assert.equal(tilePoints({}), 100);
  const qs = [
    { id: 'a', type: 'mcq', section: 's1', points: 3 }, { id: 'b', type: 'mcq', section: 's1', points: 1 },
    { id: 'c', type: 'numeric', topic: 'Moles', points: 1 }, { id: 'd', type: 'formula', points: 1 },
  ];
  const groups = boardGroups(qs, [{ id: 's1', title: 'Section one' }]);
  assert.deepEqual(groups.map((g) => g.title), ['Section one', 'Moles', 'Chemical formula']);
  assert.deepEqual(groups[0].tiles, [{ id: 'b', points: 100 }, { id: 'a', points: 300 }], 'easiest first');
  assert.equal(modeById('quizshow').scoring({}, [{ outcome: 'correct', points: 300 }]).score, 300);
});

test('flashcards: unscored; known cards leave and review cards come back', () => {
  assert.deepEqual(modeById('flashcards').scoring({}, [{ outcome: 'correct', points: 9 }]), { score: 0, detail: {} });
  assert.deepEqual(advanceCards(['a', 'b', 'c', 'd', 'e'], true), ['b', 'c', 'd', 'e']);
  assert.deepEqual(advanceCards(['a', 'b', 'c', 'd', 'e'], false), ['b', 'c', 'd', 'a', 'e']);
  assert.deepEqual(advanceCards(['a', 'b'], false), ['b', 'a'], 'a short queue puts it at the end');
  assert.deepEqual(advanceCards([], false), []);
  const rules = modeById('flashcards').rules();
  assert.equal(rules.apply({}, { outcome: 'correct' }).points, 0);
});

test('mistakes: wrong answers plus released feedback, in question order', () => {
  const t = mkTest({}, 4);
  const attempt = openAttempt(t, { email: 'kid@school.org', preview: true });
  attempt.set('q3', 'b'); // wrong
  attempt.set('q1', 'a'); // right
  attempt.set('q2', 'b'); // wrong
  assert.deepEqual(mistakeIds(attempt), ['q2', 'q3']);
  const feedback = {
    grades: { q4: 0 },
    responses: [
      { questionId: 'q1', pointsPossible: 1, pointsEarned: 1 },
      { questionId: 'q4', pointsPossible: 1, pointsEarned: 1 },
      { questionId: 'q1', pointsPossible: 0, pointsEarned: 0 },
      { questionId: 'zz', pointsPossible: 1, pointsEarned: 0 },
      { questionId: 'q2', pointsPossible: 1, needsGrading: true },
      null,
    ],
  };
  assert.deepEqual(mistakeIds(attempt, feedback), ['q2', 'q3', 'q4'], 'a teacher grade below the points possible counts; unknown ids are dropped');
  assert.deepEqual(mistakeIds(attempt, 'nope'), ['q2', 'q3']);
  attempt.destroy();
  const rules = modeById('mistakes').rules();
  assert.equal(rules.apply({}, { outcome: 'correct' }).points, FIX_POINTS);
  assert.equal(rules.apply({}, { outcome: 'wrong' }).points, 0);
});
