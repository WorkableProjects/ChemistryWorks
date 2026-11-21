// "My dashboard" data, built only from what this device knows: saved progress and local submission results.
// Pure: buildDashboard({ progress, results, now }) -> rows sorted by relevance.
//
// progress: [{ code, title, answers, updatedAt, opens_at?, closes_at? }]   (landing's inProgress())
// results:  [{ test_code, test_title, submitted_at, percentage, score_achieved, score_total, released?, opens_at?, closes_at? }]

const when = (v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };

export function buildDashboard({ progress = [], results = [], now = Date.now() } = {}) {
  const rows = new Map();
  const row = (code, title) => {
    if (!rows.has(code)) rows.set(code, { code, title: title || code, status: 'upcoming', answered: 0, attempts: 0, score: null, result: null, total: 0, submittedAt: null, opensAt: null, closesAt: null, dueSoon: false });
    return rows.get(code);
  };
  for (const r of [...results].sort((a, b) => String(a.submitted_at || '').localeCompare(String(b.submitted_at || '')))) {
    if (!r || !r.test_code) continue;
    const x = row(r.test_code, r.test_title);
    x.title = r.test_title || x.title;
    x.attempts += 1;
    x.status = (r.released || r.feedback_released || r.feedback?.released) ? 'released' : 'submitted';
    x.submittedAt = r.submitted_at || x.submittedAt;
    x.result = r; // sorted oldest first, so the last one wins (most recent record)
    const pct = Number(r.percentage);
    x.score = Number.isFinite(pct) ? { percentage: Math.round(pct), achieved: Number(r.score_achieved) || 0, total: Number(r.score_total) || 0, pending: r.needs_grading === true } : x.score;
    x.opensAt = when(r.opens_at) ?? x.opensAt;
    x.closesAt = when(r.closes_at) ?? x.closesAt;
  }
  for (const p of progress) {
    if (!p || !p.code) continue;
    const x = row(p.code, p.title);
    x.title = p.title || x.title;
    x.status = 'in-progress'; // a new attempt in progress wins over an older submission
    x.answered = Object.keys(p.answers || {}).length;
    x.total = Number(p.total) || 0;
    x.removable = x.answered === 0 && !x.result;
    x.opensAt = when(p.opens_at) ?? x.opensAt;
    x.closesAt = when(p.closes_at) ?? x.closesAt;
  }
  // Never answered and never submitted: nothing to show beyond a Remove action.
  const order = { 'in-progress': 0, upcoming: 1, submitted: 2, released: 3 };
  const out = [...rows.values()];
  for (const x of out) x.dueSoon = x.closesAt != null && x.closesAt > now && x.closesAt - now < 3 * 86400000 && (x.status === 'in-progress' || x.status === 'upcoming');
  return out.sort((a, b) => (order[a.status] - order[b.status]) || String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')) || a.code.localeCompare(b.code));
}

export const STATUS_LABELS = { 'in-progress': 'In progress', upcoming: 'Not started', submitted: 'Submitted', released: 'Released' };
