// XP, levels, badges, cosmetics, round awards and assigned practice (js/lib/xp.js).
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear(),
  };
};
globalThis.localStorage = memory();
globalThis.sessionStorage = memory();
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const xp = await import('../../js/lib/xp.js');
const { readQueue, configureSync } = await import('../../js/lib/sync.js');

beforeEach(() => {
  globalThis.localStorage.clear();
  configureSync({ call: async () => ({ ok: true, data: {} }), setTimer: () => 0, clearTimer: () => {}, gasUrl: () => '', canSync: () => true });
});

const round = (extra = {}) => ({ game: 'classic', code: 'T1', score: 800, correct: 4, total: 5, bestStreak: 3, ...extra });

test('levels: thresholds 0, 50, 150, 300, 500', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(xp.xpForLevel), [0, 50, 150, 300, 500]);
  assert.equal(xp.levelInfo(0).level, 1);
  assert.equal(xp.levelInfo(49).level, 1);
  assert.equal(xp.levelInfo(50).level, 2);
  assert.equal(xp.levelInfo(499).level, 4);
  assert.equal(xp.levelInfo(500).level, 5);
  const info = xp.levelInfo(100);
  assert.deepEqual([info.floor, info.next, info.into, info.span, info.progress], [50, 150, 50, 100, 0.5]);
  assert.equal(xp.levelInfo(-5).xp, 0);
  assert.equal(xp.levelInfo('junk').level, 1);
});

test('badge ids match the backend list and every badge has copy', () => {
  assert.equal(xp.BADGE_IDS.length, 12);
  assert.equal(new Set(xp.BADGE_IDS).size, 12);
  for (const b of xp.BADGES) assert.ok(b.title && b.text && typeof b.test === 'function', b.id);
  assert.equal(xp.badgeInfo('first_round').title, 'First round');
  assert.equal(xp.badgeInfo('nope'), null);
});

test('normalizeXp is tolerant of junk and drops unknown things', () => {
  assert.deepEqual(xp.normalizeXp(null), xp.emptyXp());
  assert.deepEqual(xp.normalizeXp('x'), xp.emptyXp());
  const n = xp.normalizeXp({
    xp: '120.7', rounds: -3, games: { classic: 2, bad: 0, odd: 'x' }, badges: { first_round: 5, fake: 9 }, noble: ['He', 'Xx', 'He'], balanced: 4, bossWins: 1, dailyStreak: 2,
    history: [...Array.from({ length: 12 }, (_, i) => ({ t: i, game: 'g', code: 'c', score: i, xp: 1 })), null],
    equipped: { flask: 'unknown', frame: 'glow' },
  });
  assert.equal(n.xp, 120);
  assert.equal(n.rounds, 0);
  assert.deepEqual(n.games, { classic: 2 });
  assert.deepEqual(n.badges, { first_round: 5 });
  assert.deepEqual(n.noble, ['He']);
  assert.equal(n.history.length, xp.HISTORY_LIMIT);
  assert.equal(n.history.at(-1).t, 11);
  assert.deepEqual(n.equipped, { flask: 'navy', frame: 'glow' });
});

test('bestRun finds the longest streak of right answers', () => {
  assert.equal(xp.bestRun([{ correct: true }, { correct: true }, { correct: false }, { correct: true }]), 2);
  assert.equal(xp.bestRun([]), 0);
  assert.equal(xp.bestRun(null), 0);
});

test('factsFromEnd reads results, or the end-screen stats, or neither', () => {
  const fromResults = xp.factsFromEnd({ gameId: 'tower', code: 'T1', score: 300, results: [{ correct: true }, { correct: true }, { correct: false }], extra: { won: true } });
  assert.deepEqual([fromResults.game, fromResults.total, fromResults.correct, fromResults.bestStreak, fromResults.won], ['tower', 3, 2, 2, true]);
  const fromStats = xp.factsFromEnd({ gameId: 'classic', score: 10, stats: [{ testid: 'game-correct', value: '7 / 9' }, { testid: 'game-best-streak', value: '4' }] });
  assert.deepEqual([fromStats.correct, fromStats.total, fromStats.bestStreak], [7, 9, 4]);
  const none = xp.factsFromEnd({});
  assert.deepEqual([none.score, none.total, none.game], [null, 0, '']);
});

test('xpForRound: base, perfect and win bonuses, cap, unscored and noXp', () => {
  assert.equal(xp.xpForRound(round({ score: 0, correct: 0 })), 10);
  assert.equal(xp.xpForRound(round({ score: 800 })), 30);
  assert.equal(xp.xpForRound(round({ score: 800, correct: 5 })), 45, 'perfect round of 5 or more');
  assert.equal(xp.xpForRound(round({ score: 800, correct: 4, total: 4 })), 30, 'a perfect round of fewer than 5 gets no bonus');
  assert.equal(xp.xpForRound(round({ score: 800, won: true })), 50);
  assert.equal(xp.xpForRound(round({ score: 99999, correct: 5, won: true })), 150 + 15 + 20, 'the base is capped at 150');
  assert.equal(xp.xpForRound(round({ score: null, total: 4 })), 5, 'an unscored round is a flat 5');
  assert.equal(xp.xpForRound(round({ score: null, total: 0 })), 0);
  assert.equal(xp.xpForRound(round({ noXp: true })), 0);
  assert.equal(xp.xpForRound(undefined), 0);
});

test('recordRoundXp updates totals, games, history and never mutates the input', () => {
  const before = xp.emptyXp();
  const snapshot = JSON.stringify(before);
  const out = xp.recordRoundXp(before, round(), 5000);
  assert.equal(JSON.stringify(before), snapshot);
  assert.equal(out.gained, 30);
  assert.equal(out.state.xp, 30);
  assert.equal(out.state.rounds, 1);
  assert.deepEqual(out.state.games, { classic: 1 });
  assert.deepEqual(out.state.history, [{ t: 5000, game: 'classic', code: 'T1', score: 800, xp: 30 }]);
  assert.deepEqual(out.newBadges, ['first_round']);
  assert.equal(out.state.badges.first_round, 5000);
  const again = xp.recordRoundXp(out.state, round(), 6000);
  assert.deepEqual(again.newBadges, [], 'a badge is only earned once');
  const unscored = xp.recordRoundXp(out.state, round({ score: null, total: 3 }));
  assert.equal(unscored.state.history.length, 1, 'unscored rounds are not added to history');
});

test('badges: each unlock rule', () => {
  const earned = (r, state) => xp.recordRoundXp(state || xp.emptyXp(), round(r)).newBadges;
  assert.ok(earned({ bestStreak: 10 }).includes('ten_in_row'));
  assert.ok(!earned({ bestStreak: 9 }).includes('ten_in_row'));
  assert.ok(earned({ correct: 5, total: 5 }).includes('perfect_round'));
  assert.ok(!earned({ correct: 4, total: 4 }).includes('perfect_round'));
  assert.ok(earned({ score: 3000 }).includes('high_scorer'));
  assert.ok(earned({ noble: ['He', 'Ne', 'Ar', 'Kr', 'Xe'] }).includes('noble_gas_master'));
  assert.ok(!earned({ noble: ['He', 'Ne'] }).includes('noble_gas_master'));
  assert.ok(earned({ balanced: 10 }).includes('balance_pro'));
  assert.ok(earned({ game: 'boss', won: true }).includes('boss_slayer'));
  assert.ok(!earned({ game: 'boss', won: false }).includes('boss_slayer'));
  assert.ok(earned({ game: 'periodicpuzzle', won: true }).includes('puzzle_solver'));
  assert.ok(earned({ game: 'dailyelement', dailyStreak: 3 }).includes('daily_3'));
  const week = earned({ game: 'dailyelement', dailyStreak: 7 });
  assert.ok(week.includes('daily_3') && week.includes('daily_7'));
  assert.ok(earned({ score: 6000, won: true }, { ...xp.emptyXp(), xp: 480 }).includes('level_5'));
  const games = { ...xp.emptyXp(), games: { a: 1, b: 1, c: 1, d: 1 } };
  assert.ok(earned({ game: 'e' }, games).includes('all_rounder'));
  assert.ok(!earned({ game: 'a' }, games).includes('all_rounder'));
});

test('noble gases collect across rounds; daily streak follows the daily game only', () => {
  let s = xp.recordRoundXp(xp.emptyXp(), round({ game: 'periodicpuzzle', noble: ['He', 'Ne'] })).state;
  s = xp.recordRoundXp(s, round({ game: 'dailyelement', noble: ['Ar', 'Kr', 'Xe', 'He'], dailyStreak: 4 })).state;
  assert.deepEqual(s.noble.slice().sort(), ['Ar', 'He', 'Kr', 'Ne', 'Xe']);
  assert.ok(s.badges.noble_gas_master);
  assert.equal(s.dailyStreak, 4);
  s = xp.recordRoundXp(s, round({ game: 'classic', dailyStreak: 99 })).state;
  assert.equal(s.dailyStreak, 4);
});

test('levelling up reports new levels and unlocks', () => {
  const out = xp.recordRoundXp({ ...xp.emptyXp(), xp: 40 }, round());
  assert.equal(out.levelBefore, 1);
  assert.equal(out.levelAfter, 2);
  assert.equal(out.levelUp, true);
  assert.deepEqual(out.newUnlocks, [{ kind: 'flask', id: 'teal', label: 'Teal flask' }, { kind: 'frame', id: 'double', label: 'Double frame' }]);
  const same = xp.recordRoundXp(xp.emptyXp(), round({ score: 0, correct: 0 }));
  assert.equal(same.levelUp, false);
  assert.deepEqual(same.newUnlocks, []);
});

test('unlocked and equip: level and badge locks', () => {
  const lv1 = xp.emptyXp();
  assert.deepEqual(xp.unlocked(lv1), { flasks: ['navy'], frames: ['plain'] });
  assert.equal(xp.equip(lv1, { flask: 'red' }).equipped.flask, 'navy', 'a locked flask is ignored');
  const lv6 = { ...lv1, xp: xp.xpForLevel(6) };
  assert.equal(xp.equip(lv6, { flask: 'red', frame: 'glow' }).equipped.flask, 'red');
  assert.equal(xp.equip(lv6, { frame: 'gold' }).equipped.frame, 'plain', 'the streak frame needs its badge');
  const gold = { ...lv1, badges: { ten_in_row: 1 } };
  assert.equal(xp.equip(gold, { frame: 'gold' }).equipped.frame, 'gold');
  assert.equal(lv1.equipped.flask, 'navy', 'equip does not change the input');
});

test('loadXp, saveXp: stored per student, case-insensitive, merged with the profile cache', () => {
  assert.equal(xp.xpKey('A@B.org'), 'xp:a@b.org');
  assert.deepEqual(xp.loadXp('a@b.org'), xp.emptyXp());
  xp.saveXp('A@B.org', { ...xp.emptyXp(), xp: 100, badges: { first_round: 1 } });
  assert.equal(xp.loadXp('a@b.org').xp, 100);
  globalThis.localStorage.setItem('cw:profile:a@b.org', JSON.stringify({ xp: 250, badges: ['perfect_round', { id: 'high_scorer', at: 77 }, 'fake'] }));
  const merged = xp.loadXp('a@b.org');
  assert.equal(merged.xp, 250, 'the larger of local and server');
  assert.deepEqual(Object.keys(merged.badges).sort(), ['first_round', 'high_scorer', 'perfect_round']);
  assert.equal(merged.badges.high_scorer, 77);
  globalThis.localStorage.setItem('cw:profile:a@b.org', JSON.stringify({ xp: 5 }));
  assert.equal(xp.loadXp('a@b.org').xp, 100, 'a lower server value never lowers local');
  globalThis.localStorage.setItem('cw:xp:a@b.org', '{bad json');
  assert.deepEqual(xp.loadXp('a@b.org').badges, {}, 'broken storage falls back to an empty record');
});

test('awardRound saves the new state and queues the delta for sync', () => {
  const res = xp.awardRound('kid@school.org', round({ game: 'dailyelement', dailyStreak: 2 }), 9000);
  assert.equal(res.gained, 30);
  assert.equal(xp.loadXp('kid@school.org').xp, 30);
  const q = readQueue('kid@school.org');
  assert.equal(q.xp.delta, 30);
  assert.deepEqual(q.xp.badges, ['first_round']);
  assert.equal(q.xp.streakDays, 2);
  xp.awardRound('kid@school.org', round({ score: null, total: 0 }));
  assert.equal(readQueue('kid@school.org').xp.delta, 30, 'a round worth nothing queues nothing');
  xp.awardRound('kid@school.org', round());
  assert.equal(xp.loadXp('kid@school.org').rounds, 3);
  assert.equal(readQueue('kid@school.org').xp.delta, 60);
});

test('practiceItems: progress against targets, overdue, ordering', () => {
  const now = Date.parse('2026-03-10T12:00:00Z');
  const tests = [
    { code: 'A', title: 'Acids', practice: [{ game: 'classic', target: 500, due: '2026-03-01' }, { game: 'tower', target: 0 }, { game: '' }, null] },
    { code: 'B', practice: [{ game: 'race', target: 100, due: '2026-03-20' }] },
    { code: 'C' },
    null,
  ];
  const best = { 'A:classic': 600, 'A:tower': 0, 'B:race': 40 };
  const items = xp.practiceItems(tests, (code, game) => best[`${code}:${game}`] || 0, now);
  assert.deepEqual(items.map((i) => `${i.code}:${i.game}`), ['B:race', 'A:tower', 'A:classic']);
  const byKey = Object.fromEntries(items.map((i) => [`${i.code}:${i.game}`, i]));
  assert.equal(byKey['A:classic'].done, true);
  assert.equal(byKey['A:classic'].overdue, false, 'done work is never overdue');
  assert.equal(byKey['B:race'].done, false);
  assert.equal(byKey['B:race'].overdue, false);
  assert.equal(byKey['B:race'].title, 'B', 'the code stands in for a missing title');
  assert.equal(byKey['A:tower'].done, false, 'no target: any best above zero finishes it');
  const late = xp.practiceItems([{ code: 'D', practice: [{ game: 'classic', target: 100, due: '2026-03-01' }] }], () => 10, now);
  assert.equal(late[0].overdue, true);
  assert.deepEqual(xp.practiceItems(null, null, now), []);
  assert.equal(xp.practiceItems([{ code: 'E', practice: [{ game: 'x', due: 'not a date' }] }], null, now)[0].due, '');
});
