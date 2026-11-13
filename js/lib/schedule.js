// Open / close window, late work and accommodations on the client. Pure, no DOM.
// The backend enforces the same rules (apps-script/Code.gs windowState_ / submissionGate_); this mirrors them so the
// student sees "Opens on …" / "This test is closed" before starting, and the runner applies accommodations.
//
//   windowState(test, { extensionUntil }, now) -> { state: 'open'|'before'|'late'|'closed', opensAt, closesAt, lateUntil, penalty }
//   latePenaltyPercent(penalty, closesAt, now) -> 0..100
//   applyAccommodations(test, acc, seed) -> test copy: time limit × extraTime, one wrong mcq option removed (reducedChoices,
//                                         deterministic per seed), tools.readAloud on; records test.instance.timeLimitApplied
//   formatWhen(iso) -> "Mon, Nov 10, 8:00 AM"

const ms = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

export function windowState(test, acc = null, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : now;
  const late = test && test.late && typeof test.late === 'object' ? test.late : null;
  const out = { state: 'open', opensAt: test?.opensAt || '', closesAt: test?.closesAt || '', lateUntil: late?.until || '', extensionUntil: acc?.extensionUntil || '', penalty: late?.penalty || null };
  const opens = ms(test?.opensAt);
  const closes = ms(test?.closesAt);
  if (opens !== null && t < opens) return { ...out, state: 'before' };
  if (closes === null || t <= closes) return out;
  const ext = ms(acc?.extensionUntil);
  if (ext !== null && t <= ext) return out;
  const lateUntil = ms(late?.until);
  if (lateUntil !== null && t <= lateUntil) return { ...out, state: 'late' };
  return { ...out, state: 'closed' };
}

export function latePenaltyPercent(penalty, closesAt, now = Date.now()) {
  if (!penalty || !closesAt) return 0;
  const v = Math.max(0, Number(penalty.value) || 0);
  if (penalty.type === 'flat') return Math.min(100, v);
  const days = Math.ceil(Math.max(0, (now instanceof Date ? now.getTime() : now) - Date.parse(closesAt)) / 86400000);
  return Math.min(100, v * days);
}

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function applyAccommodations(test, acc, seed = '') {
  if (!test || !acc) return test;
  const copy = JSON.parse(JSON.stringify(test));
  const x = Number(acc.extraTime) > 1 ? Math.min(4, Number(acc.extraTime)) : 1;
  if (copy.timeLimitMinutes && x > 1) copy.timeLimitMinutes = Math.round(Number(copy.timeLimitMinutes) * x * 10) / 10;
  copy.instance = { ...(copy.instance || {}), timeLimitApplied: copy.timeLimitMinutes || null, extraTime: x };
  if (acc.reducedChoices) {
    for (const q of copy.questions || []) {
      if (q.type !== 'mcq' || !Array.isArray(q.options) || q.options.length < 3) continue;
      const wrong = q.options.filter((o) => o.id !== q.correctAnswer);
      if (!wrong.length) continue;
      const drop = wrong[hash(`${seed}|${q.id}`) % wrong.length];
      q.options = q.options.filter((o) => o.id !== drop.id);
      q.reducedChoices = true;
    }
  }
  if (acc.readAloud) copy.tools = { ...(copy.tools || {}), readAloud: true };
  return copy;
}

export function formatWhen(iso) {
  const t = ms(iso);
  if (t === null) return '';
  return new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
