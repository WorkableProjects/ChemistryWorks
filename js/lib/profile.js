// V5-02 student profile: the local profile (XP record + local results + attempts + game bests) merged with the server's
// `getStudentProfile`. The student home and profile pages read ONLY the shape documented below.
// Local first (synchronous, always works), then the server fills in. No backend / demo sign-in -> local only, synced: false.
// Contract: docs/ARCHITECTURE.md -> V5 contracts -> Student home + profile.
//
// Profile (what `loadProfile(...).profile`, `buildLocalProfile` and the subscribe callback give you):
//   {
//     email, name, picture,               // picture: URL string | null
//     level, xp,                          // totals; xp is the larger of local and server (never lowered)
//     xpIntoLevel, xpToNext,              // XP earned inside this level / XP still needed for the next level
//     levelProgress,                      // 0..1 for the level ring
//     streakDays,                         // consecutive days active (larger of local and server)
//     classes:    [{ id, name }],         // name falls back to the id when the hub is not loaded
//     inProgress: [{ code, title, answered, total, percent, updatedAt (ms), lastMode, source: 'local'|'server'|'both',
//                    newerOnServer }],    // newerOnServer: another device has a newer attempt -> offer "Continue"
//     results:    [{ code, title, submittedAt (ISO), status: 'submitted'|'released', released,
//                    percentage (number|null, only when released), scoreAchieved, scoreTotal, source }],  // newest first
//     badges:     [{ id, title, text, earnedAt }],     // earnedAt ms
//     bests:      [{ code, game, score }],             // this device's best game scores
//     assigned:   [{ testCode, title, opensAt, closesAt, status }],   // from the server, [] offline
//     hub,                                // server getClassHub result | null
//     prefs,                              // { theme, accent, avatar, textSize, density, reduceMotion, dyslexia }
//     stats,                              // server stats object | {}
//     synced,                             // true once the server answered in this session
//     syncedAt,                           // ms | 0
//     state,                              // 'synced'|'syncing'|'offline'|'error' (same as the sync chip)
//   }

import { load, save, keys } from './storage.js';
import { getLocalResults } from './submit.js';
import { listAttempts } from './attempt.js';
import { levelInfo, loadXp, badgeInfo } from './xp.js';
import { getStudentProfile, saveStudentProfile } from './api.js';
import { queueXp, getSyncState, onSyncState } from './sync.js';
import { CONFIG } from '../config.js';
import { getUser } from './auth.js';

export const profileKey = (email) => `profile:${String(email || '').toLowerCase()}`;
const lc = (e) => String(e || '').toLowerCase();
const PREF_KEYS = ['theme', 'accent', 'avatar', 'textSize', 'density', 'reduceMotion', 'dyslexia'];
const MATCH_WINDOW = 5 * 60 * 1000;

const subscribers = new Map(); // email -> Set<fn>
const sessionSynced = new Map(); // email -> true after the server answered

/** The stored local record: { prefs, xp, level, streakDays, lastActiveDate, badges, stats, notifReadAt, notifRead, syncedAt, dirty, server, xpMigrated }. */
export function readLocalRecord(email) {
  const r = load(profileKey(email), null);
  return r && typeof r === 'object' ? r : {};
}
const writeLocalRecord = (email, rec) => save(profileKey(email), rec);

const pct = (answered, total) => (total > 0 ? Math.min(100, Math.round((answered / total) * 100)) : 0);
const ms = (v) => { const t = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(t) ? t : 0; };

function localResults(email) {
  return getLocalResults()
    .filter((r) => r && r.submission_id && lc(r.student_email) === lc(email))
    .map((r) => ({
      code: String(r.test_code || ''), title: r.test_title || r.test_code || '', submittedAt: String(r.submitted_at || ''),
      status: 'submitted', released: false, percentage: null, scoreAchieved: null, scoreTotal: null, source: 'local',
    }));
}

/** Merge local submissions with the server's rows. Server wins for status and (released-only) scores. Newest first. */
export function mergeResults(local, server) {
  const out = (Array.isArray(server) ? server : []).filter((s) => s && s.testCode).map((s) => {
    const released = !!s.released || s.status === 'released';
    return {
      code: String(s.testCode), title: s.title || s.testCode, submittedAt: String(s.submittedAt || ''),
      status: released ? 'released' : 'submitted', released,
      percentage: released && s.percentage != null ? Number(s.percentage) : null,
      scoreAchieved: released && s.scoreAchieved != null ? Number(s.scoreAchieved) : null,
      scoreTotal: released && s.scoreTotal != null ? Number(s.scoreTotal) : null, source: 'server',
    };
  });
  for (const l of Array.isArray(local) ? local : []) {
    const twin = out.find((o) => o.code === l.code && Math.abs(ms(o.submittedAt) - ms(l.submittedAt)) <= MATCH_WINDOW);
    if (twin) twin.source = 'both'; else out.push(l);
  }
  return out.sort((a, b) => ms(b.submittedAt) - ms(a.submittedAt));
}

/**
 * Merge local attempts ({ code, title, answered, total, updatedAt, lastMode }) with the server's
 * ({ code, mode, answeredCount, total, percentDone, updatedAt }). Attempt merge rule: the newer updatedAt wins;
 * `newerOnServer` is true when the server one is newer AND further along (offer "Continue"). Submitted tests drop out.
 */
export function mergeAttempts(local, server, results = [], titles = {}) {
  const map = new Map();
  for (const a of Array.isArray(local) ? local : []) {
    map.set(a.code, { code: a.code, title: a.title || titles[a.code] || a.code, answered: a.answered, total: a.total, percent: pct(a.answered, a.total), updatedAt: a.updatedAt, lastMode: a.lastMode || 'study', source: 'local', newerOnServer: false });
  }
  for (const s of Array.isArray(server) ? server : []) {
    if (!s || !s.code) continue;
    const sAt = ms(s.updatedAt); const sAnswered = Number(s.answeredCount) || 0; const sTotal = Number(s.total) || 0;
    const cur = map.get(s.code);
    if (!cur) {
      const sPercent = s.percentDone != null && Number.isFinite(Number(s.percentDone)) ? Math.round(Number(s.percentDone)) : pct(sAnswered, sTotal);
      map.set(s.code, { code: s.code, title: titles[s.code] || s.code, answered: sAnswered, total: sTotal, percent: sPercent, updatedAt: sAt, lastMode: s.mode || 'study', source: 'server', newerOnServer: true });
      continue;
    }
    cur.source = 'both';
    if (sAt > cur.updatedAt && sAnswered > cur.answered) Object.assign(cur, { newerOnServer: true, serverAnswered: sAnswered, serverTotal: sTotal, serverUpdatedAt: sAt, serverMode: s.mode || 'study' });
    if (!cur.total && sTotal) { cur.total = sTotal; cur.percent = pct(cur.answered, sTotal); }
  }
  const submittedAt = (code) => Math.max(0, ...results.filter((r) => r.code === code).map((r) => ms(r.submittedAt)));
  return [...map.values()].filter((a) => submittedAt(a.code) < Math.max(a.updatedAt, a.serverUpdatedAt || 0)).sort((a, b) => b.updatedAt - a.updatedAt);
}

function localBests(email) {
  const prefix = `gamebest:${lc(email)}:`;
  const out = [];
  for (const k of keys(prefix)) {
    const [code, game = ''] = k.slice(prefix.length).split(':');
    const score = Number(load(k, 0));
    if (code && score > 0) out.push({ code, game, score });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code) || a.game.localeCompare(b.game));
}

function badgeList(xpState) {
  return Object.entries(xpState.badges || {}).map(([id, t]) => ({ id, info: badgeInfo(id), earnedAt: Number(t) || 0 })).filter((b) => b.info)
    .map((b) => ({ id: b.id, title: b.info.title, text: b.info.text, earnedAt: b.earnedAt })).sort((a, b) => b.earnedAt - a.earnedAt);
}

/** Build the profile from this device plus the cached server snapshot (no network). */
export function buildLocalProfile(user) {
  const email = lc(user && user.email);
  const rec = readLocalRecord(email);
  const srv = rec.server && typeof rec.server === 'object' ? rec.server : {};
  const sp = srv.profile && typeof srv.profile === 'object' ? srv.profile : {};
  const xpState = loadXp(email); // already merged with the cached server xp / badges
  const info = levelInfo(xpState.xp);
  const results = mergeResults(localResults(email), srv.results);
  const assigned = Array.isArray(srv.assigned) ? srv.assigned : [];
  const titles = {};
  for (const r of results) titles[r.code] = r.title;
  for (const a of assigned) if (a && a.testCode) titles[a.testCode] = a.title || a.testCode;
  const hub = srv.hub || null;
  const hubClasses = hub && Array.isArray(hub.classes) ? hub.classes : [];
  const classIds = Array.isArray(sp.classIds) ? sp.classIds : [];
  return {
    email, name: (user && user.name) || sp.name || '', picture: (user && user.picture) || sp.picture || null,
    level: info.level, xp: info.xp, xpIntoLevel: info.into, xpToNext: info.next - info.xp, levelProgress: info.progress,
    streakDays: Math.max(xpState.dailyStreak || 0, Number(rec.streakDays) || 0),
    classes: classIds.map((id) => ({ id, name: (hubClasses.find((c) => c && (c.id === id || c.classId === id)) || {}).name || id })),
    inProgress: mergeAttempts(listAttempts(email), srv.attempts, results, titles),
    results, badges: badgeList(xpState), bests: localBests(email), assigned, hub,
    prefs: rec.prefs && typeof rec.prefs === 'object' ? rec.prefs : {}, stats: rec.stats && typeof rec.stats === 'object' ? rec.stats : {},
    synced: !!sessionSynced.get(email), syncedAt: Number(rec.syncedAt) || 0, state: getSyncState(),
  };
}

const notify = (user) => {
  const set = subscribers.get(lc(user.email));
  if (!set || !set.size) return;
  const p = buildLocalProfile(user);
  set.forEach((fn) => { try { fn(p); } catch (e) { console.error('[profile] subscriber failed', e); } });
};

/** Call fn(profile) whenever the profile changes (server answered, prefs saved, sync state changed). Returns unsubscribe. */
export function subscribeProfile(user, fn) {
  const k = lc(user && user.email);
  if (!subscribers.has(k)) subscribers.set(k, new Set());
  subscribers.get(k).add(fn);
  const off = onSyncState(() => { try { fn(buildLocalProfile(user)); } catch (e) { console.error(e); } });
  return () => { subscribers.get(k)?.delete(fn); off(); };
}

/** True when this sign-in can talk to the backend (Google sign-in and a backend URL). */
const canReachServer = (user, gasUrl) => !!(user && user.email && user.provider !== 'demo' && gasUrl);

/** One-time: send the existing local XP + badges as the first sync (server merge never lowers). */
function migrateXp(user) {
  const email = lc(user.email);
  if (readLocalRecord(email).xpMigrated) return;
  const x = loadXp(email);
  if (x.xp <= 0 && !Object.keys(x.badges).length) return;
  if (queueXp(email, { delta: x.xp, badges: Object.keys(x.badges), streakDays: x.dailyStreak })) writeLocalRecord(email, { ...readLocalRecord(email), xpMigrated: true });
}

/**
 * Local first, then the server.
 *   const { profile, done } = loadProfile(user, { gasUrl?, fetchImpl?, onUpdate? });
 * `profile` is available immediately (local only). `done` resolves to the merged profile (the local one with
 * `synced: false` when offline / demo / old backend). `onUpdate(profile)` (and subscribeProfile) fire when the server
 * answered. Never throws.
 */
export function loadProfile(user = getUser(), { gasUrl = CONFIG.GAS_WEB_APP_URL, fetchImpl, onUpdate } = {}) {
  if (!user || !user.email) return { profile: null, done: Promise.resolve(null) };
  const email = lc(user.email);
  const profile = buildLocalProfile(user);
  const done = (async () => {
    if (!canReachServer(user, gasUrl)) return buildLocalProfile(user);
    try {
      migrateXp(user);
      const res = await getStudentProfile({ gasUrl, fetchImpl });
      if (!res || !res.ok || !res.data) return buildLocalProfile(user);
      const d = res.data; const sp = d.profile || {};
      const rec = readLocalRecord(email);
      writeLocalRecord(email, {
        ...rec, xp: Math.max(Number(rec.xp) || 0, Number(sp.xp) || 0), level: sp.level != null ? sp.level : rec.level,
        streakDays: Math.max(Number(rec.streakDays) || 0, Number(sp.streakDays) || 0), lastActiveDate: sp.lastActiveDate || rec.lastActiveDate || '',
        badges: Array.isArray(sp.badges) ? sp.badges : rec.badges || [], stats: sp.stats || rec.stats || {},
        // Server prefs win unless a local change is still waiting to be saved.
        prefs: rec.dirty ? { ...(sp.prefs || {}), ...(rec.prefs || {}) } : (sp.prefs && Object.keys(sp.prefs).length ? sp.prefs : rec.prefs || {}),
        syncedAt: Date.now(),
        server: { profile: sp, results: d.results || [], attempts: d.attempts || [], assigned: d.assigned || [], hub: d.hub || null },
      });
      sessionSynced.set(email, true);
      if (readLocalRecord(email).dirty) savePrefs(user, {}, { gasUrl, fetchImpl }); // retry a pending prefs save
      const merged = buildLocalProfile(user);
      try { if (onUpdate) onUpdate(merged); } catch (e) { console.error(e); }
      notify(user);
      return merged;
    } catch (e) {
      console.error('[profile] load failed', e);
      return buildLocalProfile(user);
    }
  })();
  return { profile, done };
}

/**
 * Save appearance prefs (any of theme, accent, avatar, textSize, density, reduceMotion, dyslexia). Always saved locally
 * at once; sent to the server when reachable (the server allows one write per 5 s: on `rate_limited` or a network
 * failure the change stays `dirty` and goes out with the next load). Resolves { ok, synced, prefs }. Never throws.
 */
export async function savePrefs(user = getUser(), prefs = {}, { gasUrl = CONFIG.GAS_WEB_APP_URL, fetchImpl } = {}) {
  if (!user || !user.email) return { ok: false, synced: false, prefs: {} };
  const email = lc(user.email);
  const clean = {};
  for (const k of PREF_KEYS) if (prefs[k] !== undefined) clean[k] = prefs[k];
  const rec = readLocalRecord(email);
  const merged = { ...(rec.prefs || {}), ...clean };
  writeLocalRecord(email, { ...rec, prefs: merged, dirty: Object.keys(clean).length > 0 ? true : !!rec.dirty });
  notify(user);
  if (!canReachServer(user, gasUrl)) return { ok: true, synced: false, prefs: merged };
  if (!readLocalRecord(email).dirty) return { ok: true, synced: true, prefs: merged };
  try {
    const res = await saveStudentProfile({ gasUrl, prefs: merged, fetchImpl });
    if (res && res.ok) {
      writeLocalRecord(email, { ...readLocalRecord(email), dirty: false, syncedAt: Date.now() });
      notify(user);
      return { ok: true, synced: true, prefs: merged };
    }
  } catch { /* stays dirty */ }
  return { ok: true, synced: false, prefs: merged };
}
