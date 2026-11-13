// Per-test game options. Pure, no DOM, no network. Stored as `gameOptions` in the test JSON.
// normalizeGameOptions(test) -> a fully populated options object (defaults filled, values clamped).
// validateGameOptions(test)  -> string[] of human-readable problems (empty = fine).
// cleanGameOptions(raw)      -> the normalized object to store back on the test (schema.js hook).

export const KNOWN_GAME_IDS = ['classic', 'survival', 'lightning', 'elementhunt', 'matchup', 'quizshow', 'race', 'bingo', 'flashcards', 'tower', 'mistakes', 'boss', 'unitdash', 'reactionlab', 'molbuilder', 'periodicpuzzle', 'dailyelement'];
export const POWERUP_IDS = ['fifty', 'freeze', 'skip', 'hint'];
export const LIMITS = {
  questions: [1, 200], timePerQuestion: [5, 300], totalSeconds: [10, 900], lives: [1, 9],
};
export const DEFAULT_LIVES = 3;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const intIn = (v, [lo, hi]) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};
const strList = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))] : null);

/** Fully populated options for a test (tolerates a missing / malformed `gameOptions`). */
export function normalizeGameOptions(test) {
  const raw = isObj(test && test.gameOptions) ? test.gameOptions : {};
  const games = strList(raw.games) || strList(test && test.games);
  const types = strList(raw.types);
  const pu = isObj(raw.powerUps) ? raw.powerUps : {};
  const powerUps = {};
  for (const id of POWERUP_IDS) powerUps[id] = pu[id] === undefined ? true : pu[id] !== false;
  if (raw.powerUps === false) for (const id of POWERUP_IDS) powerUps[id] = false;
  return {
    games: games && games.length ? games : null,
    questions: intIn(raw.questions, LIMITS.questions),
    timePerQuestion: intIn(raw.timePerQuestion, LIMITS.timePerQuestion),
    totalSeconds: intIn(raw.totalSeconds, LIMITS.totalSeconds),
    lives: intIn(raw.lives, LIMITS.lives) ?? DEFAULT_LIVES,
    powerUps,
    untimed: raw.untimed === true,
    allowUntimed: raw.allowUntimed !== false,
    types: types && types.length ? types : null,
    sound: raw.sound !== false,
    leaderboard: raw.leaderboard === true,
    leaderboardNames: raw.leaderboardNames === 'nicknames' ? 'nicknames' : 'real',
  };
}

/** Object to store on the test: the normalized form (so the JSON is explicit and stable). */
export const cleanGameOptions = (raw) => normalizeGameOptions({ gameOptions: raw });

/** Problems with `test.gameOptions`; [] when absent or fine. */
export function validateGameOptions(test) {
  const raw = test && test.gameOptions;
  if (raw === undefined || raw === null) return [];
  if (!isObj(raw)) return ['Test: gameOptions must be an object.'];
  const errs = [];
  if (raw.games != null && !Array.isArray(raw.games)) errs.push('Test: gameOptions.games must be a list of game ids.');
  else for (const g of raw.games || []) if (!KNOWN_GAME_IDS.includes(String(g))) errs.push(`Test: gameOptions.games has an unknown game "${g}".`);
  if (raw.types != null && !Array.isArray(raw.types)) errs.push('Test: gameOptions.types must be a list of question types.');
  for (const [key, range] of Object.entries(LIMITS)) {
    const v = raw[key];
    if (v === undefined || v === null || v === '') continue;
    if (!Number.isFinite(Number(v)) || Number(v) < range[0] || Number(v) > range[1]) errs.push(`Test: gameOptions.${key} must be a number from ${range[0]} to ${range[1]}.`);
  }
  if (raw.powerUps !== undefined && typeof raw.powerUps !== 'boolean' && !isObj(raw.powerUps)) errs.push('Test: gameOptions.powerUps must be true, false or an object.');
  for (const key of ['untimed', 'allowUntimed', 'sound', 'leaderboard']) {
    if (raw[key] !== undefined && typeof raw[key] !== 'boolean') errs.push(`Test: gameOptions.${key} must be true or false.`);
  }
  if (raw.leaderboardNames !== undefined && !['real', 'nicknames'].includes(raw.leaderboardNames)) errs.push('Test: gameOptions.leaderboardNames must be "real" or "nicknames".');
  return errs;
}

/** The test with only the allowed question types (games play this copy). No `types` option = unchanged. */
export function gameTest(test, opts = normalizeGameOptions(test)) {
  if (!test || !opts.types) return test;
  const list = Array.isArray(test.questions) ? test.questions : [];
  return { ...test, questions: list.filter((q) => q && opts.types.includes(q.type)) };
}

/** First `n` of a list (n = null/0 means all). Callers shuffle first. */
export const limitCount = (list, n) => (Array.isArray(list) ? (n ? list.slice(0, n) : list.slice()) : []);

/** True when the clock is off: the teacher forces it, or the student switched it on and the teacher allows that. */
export const isUntimed = (opts, studentChoice = false) => !!opts && (opts.untimed === true || (opts.allowUntimed !== false && studentChoice === true));

/** A one-line hint for a question, or null when none can be given without giving the answer away. */
export function hintFor(q) {
  if (!q) return null;
  if (typeof q.hint === 'string' && q.hint.trim()) return q.hint.trim();
  if (q.type === 'numeric') {
    const n = Number(q.correctAnswer);
    if (Number.isFinite(n) && n !== 0) return `The answer is close to ${Number(n.toPrecision(1))}${q.unit ? ` ${q.unit}` : ''}.`;
    return q.unit ? `Give the answer in ${q.unit}.` : null;
  }
  if (q.type === 'formula') {
    const f = Array.isArray(q.correctAnswer) ? q.correctAnswer[0] : q.correctAnswer;
    const n = new Set(String(f || '').match(/[A-Z][a-z]?/g) || []).size;
    return n ? `The formula contains ${n} different element${n === 1 ? '' : 's'}.` : null;
  }
  if (q.type === 'multi' && Array.isArray(q.correctAnswer)) return `${q.correctAnswer.length} of the ${(q.options || []).length} options are correct.`;
  return null;
}
