// V5-02 student home: the view model. Built from what this device knows (attempts, local results, XP) and
// overlaid with the synced profile (js/lib/profile.js) when the server has answered. Pure: no DOM, no storage.
//
// homeModel({ user, attempts, results, xp, profile, now }) ->
//   { firstName, name, picture, level, xp, xpInto, xpSpan, progress, streakDays, classes[], sync,
//     inProgress[{ code, title, answered, total, lastMode, updatedAt, removable }],
//     results[{ id, code, title, submittedAt, status: 'released'|'waiting', achieved, total, percent, payload }],
//     trend[percent…oldest first], bests[{ code, modeId, score }], badges[{ id, title, text, earned }], mistakes }

import { levelInfo, BADGES } from '../../lib/xp.js';

const lower = (s) => String(s || '').trim().toLowerCase();

/** One row per test code, most recent record wins (fixes the triple listing of 4.x). */
export function dedupeByCode(rows, timeOf = (r) => r.updatedAt || 0) {
  const best = new Map();
  for (const r of rows) {
    if (!r || !r.code) continue;
    const key = String(r.code).toUpperCase();
    const had = best.get(key);
    if (!had || timeOf(r) > timeOf(had)) best.set(key, r);
  }
  return [...best.values()];
}

export function homeModel({ user = {}, attempts = [], results = [], xp = null, profile = null, now = Date.now() } = {}) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const totalXp = Math.max(Number(p.xp) || 0, Number(xp?.xp) || 0);
  const lv = levelInfo(totalXp);

  const mine = results.filter((r) => r && r.test_code && (!r.student_email || lower(r.student_email) === lower(user.email)));
  // Server submissions (profile) and local ones describe the same thing: keep one per submission id / code + time.
  const serverSubs = Array.isArray(p.submissions) ? p.submissions : [];
  const seen = new Set();
  const resultRows = [];
  const pushResult = (r, fromServer) => {
    const id = r.submission_id || r.id || `${r.test_code || r.testCode}:${r.submitted_at || r.submittedAt}`;
    if (seen.has(id)) return;
    seen.add(id);
    const released = fromServer ? r.released === true : !!(r.released || r.feedback_released || r.feedback?.released);
    const total = Number(r.score_total ?? r.scoreTotal) || 0;
    const achieved = Number(r.score_achieved ?? r.scoreAchieved) || 0;
    const pct = Number(r.percentage);
    resultRows.push({
      id, code: r.test_code || r.testCode, title: r.test_title || r.testTitle || r.test_code || r.testCode,
      submittedAt: r.submitted_at || r.submittedAt || '', status: released || (!fromServer && r.needs_grading !== true) ? 'released' : 'waiting',
      achieved, total, percent: Number.isFinite(pct) ? Math.round(pct) : total ? Math.round((achieved / total) * 100) : null,
      payload: fromServer ? null : r,
    });
  };
  serverSubs.forEach((r) => pushResult(r, true));
  mine.forEach((r) => pushResult(r, false));
  resultRows.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));

  const serverAttempts = (Array.isArray(p.attempts) ? p.attempts : []).map((a) => ({
    code: a.code, title: a.title || a.code, answered: Number(a.answeredCount) || 0, total: Number(a.total) || 0,
    lastMode: a.mode || 'study', updatedAt: Date.parse(a.updatedAt) || Number(a.updatedAt) || 0, remote: true,
  }));
  const inProgress = dedupeByCode([...attempts, ...serverAttempts])
    .map((a) => ({ ...a, title: a.title || a.code, removable: a.answered === 0 }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const earned = new Set([...Object.keys(xp?.badges || {}), ...(Array.isArray(p.badges) ? p.badges : [])]);
  const games = xp?.games && typeof xp.games === 'object' ? xp.games : {};
  const bests = Object.entries(games)
    .map(([modeId, g]) => ({ modeId, score: Number(g?.best ?? g?.bestScore ?? g) || 0, code: g?.code || '' }))
    .filter((b) => b.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);

  const released = resultRows.filter((r) => r.status === 'released' && r.percent != null);
  return {
    name: p.name || user.name || '', firstName: String(p.name || user.name || '').trim().split(/\s+/)[0] || '',
    picture: p.picture || user.picture || null,
    level: lv.level, xp: lv.xp, xpInto: lv.into, xpSpan: lv.span, progress: lv.progress,
    streakDays: Math.max(Number(p.streakDays) || 0, Number(xp?.dailyStreak) || 0),
    classes: Array.isArray(p.classes) ? p.classes : [],
    sync: p.syncState || (profile ? 'synced' : 'offline'),
    inProgress, results: resultRows.slice(0, 12),
    trend: released.slice(0, 10).map((r) => r.percent).reverse(),
    average: released.length ? Math.round(released.reduce((n, r) => n + r.percent, 0) / released.length) : null,
    testsDone: new Set(resultRows.map((r) => r.code)).size,
    bests,
    badges: BADGES.map((b) => ({ id: b.id, title: b.title, text: b.text, earned: earned.has(b.id) })),
    mistakes: inProgress.reduce((n, a) => n + (Number(a.wrong) || 0), 0),
    now,
  };
}

/** "De" + small number, like a periodic-table cell: the tile shown for a test code. */
export function tileFor(code) {
  const c = String(code || '').replace(/[^A-Za-z0-9]/g, '');
  const letters = c.replace(/[0-9]/g, '');
  const digits = c.replace(/[^0-9]/g, '');
  const sym = (letters || c).slice(0, 2);
  return { symbol: sym.charAt(0).toUpperCase() + sym.slice(1).toLowerCase(), number: digits.slice(0, 3) };
}

export const MODE_NAMES = {
  study: 'Study', classic: 'Classic', lightning: 'Lightning round', survival: 'Survival', flashcards: 'Flashcards', mistakes: 'Mistake review',
  tower: 'Tower', boss: 'Boss battle', matchup: 'Match-up', quizshow: 'Quiz show', race: 'Race', bingo: 'Bingo',
};
