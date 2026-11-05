// Mastery report + student profiles (V4-02, S13). Pure helpers over normalized result rows (js/views/admin/stats.js
// normalizeRow) and test definitions (for question tags). No DOM.
//
//   questionTopics(test) -> { questionId: [topic, …] }   from q.tags (array or { topic, unit, … }) or the section title
//   masteryTable(rows, testsByCode) -> { topics: [..], students: [{ email, name, byTopic: { topic: { earned, possible, pct } } }], classByTopic }
//   studentProfile(rows, email) -> { email, name, tests: [{ code, title, pct, released, submittedAt }], trend: [pct…] }
//   idleStudents(live, now) / liveSummary(live)

const pctOf = (e, p) => (p > 0 ? Math.round((e / p) * 1000) / 10 : null);

export function questionTopics(test) {
  const out = {};
  const secTitle = Object.fromEntries((test?.sections || []).map((s) => [s.id, s.title]));
  for (const q of test?.questions || []) {
    let tags = [];
    if (Array.isArray(q.tags)) tags = q.tags;
    else if (q.tags && typeof q.tags === 'object') tags = [q.tags.topic, q.tags.unit].filter(Boolean);
    if (!tags.length && q.section && secTitle[q.section]) tags = [secTitle[q.section]];
    out[q.id] = tags.map((t) => String(t).trim()).filter(Boolean);
  }
  return out;
}

export function masteryTable(rows, testsByCode = {}) {
  const topicsSet = new Set();
  const students = new Map();
  const classAgg = {};
  for (const r of rows || []) {
    if (!r || !r.student_email) continue;
    const test = testsByCode[String(r.test_code || '').toUpperCase()];
    const topics = test ? questionTopics(test) : {};
    const key = String(r.student_email).toLowerCase();
    if (!students.has(key)) students.set(key, { email: key, name: r.student_name || key, byTopic: {} });
    const s = students.get(key);
    const grades = r.grades && typeof r.grades === 'object' ? r.grades : {};
    for (const res of r.responses || []) {
      if (!res || !res.questionId) continue;
      const list = topics[res.questionId] && topics[res.questionId].length ? topics[res.questionId] : [];
      if (!list.length) continue;
      const possible = Number(res.pointsPossible) || 0;
      const earned = grades[res.questionId] !== undefined && grades[res.questionId] !== null && grades[res.questionId] !== '' ? Number(grades[res.questionId]) || 0 : Number(res.pointsEarned) || 0;
      for (const t of list) {
        topicsSet.add(t);
        const cell = s.byTopic[t] || (s.byTopic[t] = { earned: 0, possible: 0, pct: null });
        cell.earned += earned; cell.possible += possible; cell.pct = pctOf(cell.earned, cell.possible);
        const c = classAgg[t] || (classAgg[t] = { earned: 0, possible: 0, pct: null });
        c.earned += earned; c.possible += possible; c.pct = pctOf(c.earned, c.possible);
      }
    }
  }
  return { topics: [...topicsSet].sort(), students: [...students.values()].sort((a, b) => a.name.localeCompare(b.name)), classByTopic: classAgg };
}

/** Students below `threshold` % on a topic, lowest first: "Who needs help with stoichiometry?" */
export function needsHelp(table, topic, threshold = 70) {
  return table.students.filter((s) => s.byTopic[topic] && s.byTopic[topic].pct !== null && s.byTopic[topic].pct < threshold)
    .sort((a, b) => a.byTopic[topic].pct - b.byTopic[topic].pct);
}

export function studentProfile(rows, email) {
  const e = String(email || '').toLowerCase();
  const mine = (rows || []).filter((r) => String(r.student_email || '').toLowerCase() === e)
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
  const tests = mine.map((r) => ({
    code: r.test_code, title: r.test_title || r.test_code, submittedAt: r.timestamp, status: r.status,
    pct: Number.isFinite(Number(r.final_percentage)) && r.final_percentage !== null && r.final_percentage !== '' ? Number(r.final_percentage) : Number(r.percentage) || 0,
    released: !!r.released_at, late: r.late === true,
  }));
  return { email: e, name: mine[0]?.student_name || e, tests, trend: tests.map((t) => t.pct) };
}

export function liveSummary(students = []) {
  return {
    started: students.length,
    submitted: students.filter((s) => s.submitted).length,
    idle: students.filter((s) => !s.submitted && s.idle).length,
    working: students.filter((s) => !s.submitted && !s.idle).length,
  };
}
