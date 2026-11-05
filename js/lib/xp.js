// XP, levels, badges, cosmetics, personal history and assigned-practice progress (V4-04). Local only: one localStorage
// entry per student (`cw:xp:<email>`). The functions that change state are pure (state in, state out); loadXp / saveXp /
// awardRound are the only ones that touch storage.

import { load, save } from './storage.js';

export const HISTORY_LIMIT = 10;
export const ROUND_XP_CAP = 150;

export const xpKey = (email) => `xp:${String(email || '').toLowerCase()}`;

// ---------- levels ----------
/** XP needed to reach a level: 0, 50, 150, 300, 500, ... */
export const xpForLevel = (level) => 25 * Math.max(0, Math.floor(level) - 1) * Math.max(1, Math.floor(level));

/** { level, xp, floor, next, into, span, progress } for a total XP. */
export function levelInfo(totalXp) {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, floor, next, into: xp - floor, span: next - floor, progress: (xp - floor) / (next - floor) };
}

// ---------- badges ----------
export const NOBLE_GASES = ['He', 'Ne', 'Ar', 'Kr', 'Xe'];

/** Each badge: { id, title, text, test(state, round) }. `state` is already updated with the round. */
export const BADGES = [
  { id: 'first_round', title: 'First round', text: 'Finish any scored game.', test: (s) => s.rounds >= 1 },
  { id: 'ten_in_row', title: '10 in a row', text: 'Answer 10 in a row correctly in one round.', test: (s, r) => r.bestStreak >= 10 },
  { id: 'noble_gas_master', title: 'Noble gas master', text: 'Get He, Ne, Ar, Kr and Xe right in Periodic Puzzle or Daily Element.', test: (s) => NOBLE_GASES.every((g) => s.noble.includes(g)) },
  { id: 'perfect_round', title: 'Perfect round', text: 'Answer every question right in a round of 5 or more.', test: (s, r) => r.total >= 5 && r.correct === r.total },
  { id: 'high_scorer', title: 'High scorer', text: 'Score 3,000 or more in one round.', test: (s, r) => r.score >= 3000 },
  { id: 'all_rounder', title: 'All-rounder', text: 'Play 5 different games.', test: (s) => Object.keys(s.games).length >= 5 },
  { id: 'balance_pro', title: 'Equation balancer', text: 'Balance 10 equations in Reaction Lab.', test: (s) => s.balanced >= 10 },
  { id: 'boss_slayer', title: 'Boss slayer', text: 'Defeat Captain Corrode.', test: (s) => s.bossWins >= 1 },
  { id: 'puzzle_solver', title: 'Table complete', text: 'Finish a Periodic Puzzle.', test: (s, r) => r.game === 'periodicpuzzle' && r.won === true },
  { id: 'daily_3', title: 'Three-day streak', text: 'Solve the Daily Element three days in a row.', test: (s) => s.dailyStreak >= 3 },
  { id: 'daily_7', title: 'Week streak', text: 'Solve the Daily Element seven days in a row.', test: (s) => s.dailyStreak >= 7 },
  { id: 'level_5', title: 'Level 5', text: 'Reach level 5.', test: (s) => levelInfo(s.xp).level >= 5 },
];

export const badgeInfo = (id) => BADGES.find((b) => b.id === id) || null;

// ---------- cosmetics (the art is CSS / SVG in css/game.css; these are only the ids and unlock rules) ----------
export const FLASKS = [
  { id: 'navy', label: 'Navy flask', level: 1 },
  { id: 'teal', label: 'Teal flask', level: 2 },
  { id: 'green', label: 'Green flask', level: 3 },
  { id: 'amber', label: 'Amber flask', level: 4 },
  { id: 'red', label: 'Red flask', level: 6 },
  { id: 'violet', label: 'Violet flask', level: 8 },
];
export const FRAMES = [
  { id: 'plain', label: 'Plain frame', level: 1 },
  { id: 'double', label: 'Double frame', level: 2 },
  { id: 'dashed', label: 'Dashed frame', level: 3 },
  { id: 'glow', label: 'Glow frame', level: 5 },
  { id: 'gold', label: 'Streak frame', badge: 'ten_in_row' },
];

export function unlocked(state) {
  const lv = levelInfo(state.xp).level;
  const ok = (c) => (c.badge ? !!state.badges[c.badge] : lv >= c.level);
  return { flasks: FLASKS.filter(ok).map((c) => c.id), frames: FRAMES.filter(ok).map((c) => c.id) };
}

/** Equip a flask and/or frame the student has unlocked. Returns the new state (unchanged for locked ids). */
export function equip(state, { flask, frame } = {}) {
  const u = unlocked(state);
  const equipped = { ...state.equipped };
  if (flask && u.flasks.includes(flask)) equipped.flask = flask;
  if (frame && u.frames.includes(frame)) equipped.frame = frame;
  return { ...state, equipped };
}

// ---------- state ----------
export const emptyXp = () => ({
  v: 1, xp: 0, rounds: 0, games: {}, badges: {}, noble: [], balanced: 0, bossWins: 0, dailyStreak: 0,
  history: [], equipped: { flask: 'navy', frame: 'plain' },
});

const num = (v) => Math.max(0, Math.floor(Number(v) || 0));

/** Tolerant normalisation of whatever is stored. */
export function normalizeXp(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const base = emptyXp();
  const games = {};
  for (const [k, v] of Object.entries(r.games && typeof r.games === 'object' ? r.games : {})) if (num(v) > 0) games[String(k)] = num(v);
  const badges = {};
  for (const [k, v] of Object.entries(r.badges && typeof r.badges === 'object' ? r.badges : {})) if (badgeInfo(k)) badges[k] = Number(v) || 0;
  const history = (Array.isArray(r.history) ? r.history : []).filter((x) => x && typeof x === 'object').slice(-HISTORY_LIMIT)
    .map((x) => ({ t: Number(x.t) || 0, game: String(x.game || ''), code: String(x.code || ''), score: num(x.score), xp: num(x.xp) }));
  const eq = r.equipped && typeof r.equipped === 'object' ? r.equipped : {};
  const state = {
    ...base, xp: num(r.xp), rounds: num(r.rounds), games, badges, history, balanced: num(r.balanced), bossWins: num(r.bossWins), dailyStreak: num(r.dailyStreak),
    noble: [...new Set((Array.isArray(r.noble) ? r.noble : []).filter((s) => NOBLE_GASES.includes(s)))],
    equipped: { flask: FLASKS.some((f) => f.id === eq.flask) ? eq.flask : base.equipped.flask, frame: FRAMES.some((f) => f.id === eq.frame) ? eq.frame : base.equipped.frame },
  };
  return state;
}

// ---------- rounds ----------
/** Best run of right answers in [{ correct }]. */
export function bestRun(results) {
  let best = 0; let run = 0;
  for (const r of Array.isArray(results) ? results : []) { run = r && r.correct ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

const pair = (v) => { const m = /^\s*(\d+)\s*\/\s*(\d+)/.exec(String(v ?? '')); return m ? [Number(m[1]), Number(m[2])] : null; };

/**
 * Round facts from what the shell's end screen already knows: { gameId, code, score, stats[{testid,value}], results[], extra }.
 * `extra` may carry won, noble, balanced, dailyStreak and overrides.
 */
export function factsFromEnd({ gameId, code = '', score = null, stats = [], results = null, extra = {} } = {}) {
  const byId = (id) => (stats || []).find((s) => s && s.testid === id);
  let correct = 0; let total = 0; let bestStreak = 0;
  if (Array.isArray(results) && results.length) {
    total = results.length; correct = results.filter((r) => r && r.correct).length; bestStreak = bestRun(results);
  } else {
    const p = pair(byId('game-correct') && byId('game-correct').value);
    if (p) { [correct, total] = p; }
    bestStreak = num(byId('game-best-streak') && byId('game-best-streak').value);
  }
  return {
    game: String(gameId || ''), code: String(code || ''), score: score === null ? null : num(score), correct, total, bestStreak,
    won: false, noble: [], balanced: 0, dailyStreak: 0, ...extra,
  };
}

/** XP a round is worth (0 for none). Unscored rounds (score null) give a flat 5 for studying. */
export function xpForRound(round) {
  const r = round || {};
  if (r.score === null || r.score === undefined) return r.total > 0 ? 5 : 0;
  if (r.noXp) return 0;
  const base = 10 + Math.floor(Math.min(Math.max(0, Number(r.score) || 0), 6000) / 40);
  const perfect = r.total >= 5 && r.correct === r.total ? 15 : 0;
  const won = r.won === true ? 20 : 0;
  return Math.min(ROUND_XP_CAP, base) + perfect + won;
}

/**
 * Apply one finished round. Returns { state, gained, levelBefore, levelAfter, levelUp, newBadges: [id], newUnlocks: [{kind,id,label}] }.
 */
export function recordRoundXp(state0, round, now = Date.now()) {
  const before = normalizeXp(state0);
  const r = { game: '', code: '', score: 0, correct: 0, total: 0, bestStreak: 0, won: false, noble: [], balanced: 0, dailyStreak: 0, ...(round || {}) };
  const gained = xpForRound(r);
  const state = {
    ...before,
    xp: before.xp + gained,
    rounds: before.rounds + 1,
    games: r.game ? { ...before.games, [r.game]: (before.games[r.game] || 0) + 1 } : before.games,
    noble: [...new Set([...before.noble, ...(r.noble || []).filter((s) => NOBLE_GASES.includes(s))])],
    balanced: before.balanced + num(r.balanced),
    bossWins: before.bossWins + (r.game === 'boss' && r.won ? 1 : 0),
    dailyStreak: r.game === 'dailyelement' ? num(r.dailyStreak) : before.dailyStreak,
    history: r.score === null || r.score === undefined ? before.history
      : [...before.history, { t: now, game: r.game, code: r.code, score: num(r.score), xp: gained }].slice(-HISTORY_LIMIT),
    badges: { ...before.badges },
  };
  const newBadges = [];
  for (const b of BADGES) if (!state.badges[b.id] && b.test(state, r)) { state.badges[b.id] = now; newBadges.push(b.id); }
  const levelBefore = levelInfo(before.xp).level;
  const levelAfter = levelInfo(state.xp).level;
  const ub = unlocked(before); const ua = unlocked(state);
  const newUnlocks = [
    ...FLASKS.filter((c) => ua.flasks.includes(c.id) && !ub.flasks.includes(c.id)).map((c) => ({ kind: 'flask', id: c.id, label: c.label })),
    ...FRAMES.filter((c) => ua.frames.includes(c.id) && !ub.frames.includes(c.id)).map((c) => ({ kind: 'frame', id: c.id, label: c.label })),
  ];
  return { state, gained, levelBefore, levelAfter, levelUp: levelAfter > levelBefore, newBadges, newUnlocks };
}

// ---------- storage ----------
export const loadXp = (email) => normalizeXp(load(xpKey(email), null));
export const saveXp = (email, state) => save(xpKey(email), normalizeXp(state));

/** Record a finished round for a student and save. Returns the recordRoundXp result. */
export function awardRound(email, round, now = Date.now()) {
  const res = recordRoundXp(loadXp(email), round, now);
  saveXp(email, res.state);
  return res;
}

// ---------- assigned practice ----------
/**
 * Practice items from tests ({ practice: [{ game, target, due? }] }) for a student.
 * `bestFn(code, gameId)` -> the student's best score on this device. Returns
 * [{ test, code, title, game, target, due, best, done, overdue }], open ones first, then by due date.
 */
export function practiceItems(tests, bestFn, now = Date.now()) {
  const out = [];
  for (const t of Array.isArray(tests) ? tests : []) {
    if (!t || !t.code || !Array.isArray(t.practice)) continue;
    for (const p of t.practice) {
      if (!p || !p.game) continue;
      const target = num(p.target);
      const best = num(bestFn ? bestFn(t.code, String(p.game)) : 0);
      const dueMs = p.due ? Date.parse(p.due) : NaN;
      out.push({
        test: t, code: t.code, title: t.title || t.code, game: String(p.game), target, due: Number.isFinite(dueMs) ? p.due : '',
        best, done: target > 0 ? best >= target : best > 0, overdue: Number.isFinite(dueMs) && dueMs + 86400000 < now && !(target > 0 ? best >= target : best > 0),
      });
    }
  }
  return out.sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999'));
}
