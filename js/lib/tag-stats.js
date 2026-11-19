// Per-tag results: how many points students earned out of how many were possible on the questions that carry a tag.
//
//   tagIds(test)                         Map questionId -> [tagId]
//   submissionTagTotals(sub, test)       Map tagId -> { earned, possible, questions }   for one submission
//   tagStats(subs, test, { releasedOnly })  [{ id, earned, possible, percent, questions, students }], weakest first
//
// A submission is { responses, grades?, released? | released_at? }. `responses` are the graded rows (questionId,
// pointsEarned, pointsPossible, needsGrading). `grades` are the teacher's points by question id. A question with several
// tags counts toward each of them. A teacher-graded item counts once it has a grade; before that it is left out.
// Student-facing views count released results only (the default); teacher views pass `releasedOnly: false`.
//
// Names: students read `tagIndex` ({ id: { name, color } }, sent with the test and with feedback); teachers read the
// `tags` resource through tags.js. A missing name is "Unknown tag", never the id.

import { resolve, UNKNOWN_TAG_NAME } from './tags.js';

const num = (v) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const round2 = (n) => Math.round(n * 100) / 100;

/** Map of question id (string) -> tag ids, for the questions that have tags. */
export function tagIds(test) {
  const out = new Map();
  for (const q of Array.isArray(test?.questions) ? test.questions : []) {
    const ids = Array.isArray(q?.tags) ? q.tags.filter((x) => typeof x === 'string' && x) : [];
    if (ids.length && q.id != null) out.set(String(q.id), ids);
  }
  return out;
}

/** Every distinct tag id a test's questions use, in first-use order. */
export function usedIds(test) {
  return [...new Set([...tagIds(test).values()].flat())];
}

/** Has the teacher released this result to the student? Accepts a submission row, a profile result or a feedback reply. */
export function isReleased(sub) {
  if (!sub) return false;
  if (sub.released === true || sub.status === 'released') return true;
  return !!(sub.released_at || sub.releasedAt);
}

/** Points per tag for one submission: Map tagId -> { earned, possible, questions }. */
export function submissionTagTotals(sub, test) {
  const byQuestion = tagIds(test);
  const out = new Map();
  if (!byQuestion.size) return out;
  const grades = sub && sub.grades && typeof sub.grades === 'object' ? sub.grades : {};
  for (const r of Array.isArray(sub?.responses) ? sub.responses : []) {
    if (!r || r.questionId == null) continue;
    const ids = byQuestion.get(String(r.questionId));
    if (!ids) continue;
    const graded = num(grades[r.questionId]);
    if (r.needsGrading && graded === null) continue; // still waiting for the teacher
    const possible = num(r.pointsPossible);
    if (!possible || possible <= 0) continue;
    const earned = Math.min(possible, Math.max(0, graded !== null ? graded : num(r.pointsEarned) || 0));
    for (const id of ids) {
      const t = out.get(id) || { earned: 0, possible: 0, questions: 0 };
      t.earned += earned; t.possible += possible; t.questions += 1;
      out.set(id, t);
    }
  }
  return out;
}

/**
 * Totals per tag across submissions. `test` is a test object, or a function (submission) -> test for rows of several tests.
 * Returns [{ id, earned, possible, percent, questions, students }] with the weakest tag first (ties by id).
 */
export function tagStats(subs, test, { releasedOnly = true } = {}) {
  const acc = new Map();
  for (const sub of Array.isArray(subs) ? subs : []) {
    if (!sub || (releasedOnly && !isReleased(sub))) continue;
    const t = typeof test === 'function' ? test(sub) : test;
    for (const [id, v] of submissionTagTotals(sub, t)) {
      const a = acc.get(id) || { id, earned: 0, possible: 0, questions: 0, students: 0 };
      a.earned += v.earned; a.possible += v.possible; a.questions += v.questions; a.students += 1;
      acc.set(id, a);
    }
  }
  return [...acc.values()].map((a) => ({ ...a, earned: round2(a.earned), possible: round2(a.possible), percent: a.possible > 0 ? Math.round((a.earned / a.possible) * 1000) / 10 : 0 }))
    .sort((a, b) => a.percent - b.percent || a.id.localeCompare(b.id));
}

/** Does this submission have at least one question with this tag? */
export function hasTag(sub, test, id) {
  return submissionTagTotals(sub, test).has(id);
}

/* ---------------------------------------------------------------- names */

const indexes = new Map(); // test code -> { id: { name, color } }

/** Remember the `tagIndex` a reply carried (getTest, getFeedback) so other views can name the tags. Later replies add to earlier ones. */
export function rememberTagIndex(code, index) {
  if (!code || !index || typeof index !== 'object' || Array.isArray(index)) return;
  const key = String(code).trim().toUpperCase();
  indexes.set(key, { ...(indexes.get(key) || {}), ...index });
}

/** The remembered `tagIndex` for a test code ({} when none). */
export function recalledTagIndex(code) {
  return indexes.get(String(code || '').trim().toUpperCase()) || {};
}

/** Student side: name from a `tagIndex`, else "Unknown tag". */
export function studentTag(id, tagIndex) {
  const e = tagIndex && typeof tagIndex === 'object' ? tagIndex[id] : null;
  const name = e && typeof e.name === 'string' ? e.name.trim() : '';
  return name ? { id, name, color: typeof e.color === 'string' ? e.color : 'gray', unknown: false } : { id, name: UNKNOWN_TAG_NAME, color: 'gray', unknown: true };
}

/** Teacher side: name from the local store and the `tags` resource, else "Unknown tag". */
export function adminTag(id) {
  const r = resolve([id])[0];
  return { id, name: r.name, color: r.color, unknown: !!r.unknown };
}

/** Add `name` and `color` to stats rows. `lookup` is (id) => { name, color, unknown }. */
export function withNames(rows, lookup) {
  return rows.map((r) => ({ ...r, ...lookup(r.id) }));
}

/** The tags a student's question list uses, for a topic filter: [{ id, name, color, count }] by name; [] when no question has a tag. */
export function topicOptions(questions, tagIndex) {
  const counts = new Map();
  for (const q of Array.isArray(questions) ? questions : []) for (const id of Array.isArray(q?.tags) ? q.tags : []) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts].map(([id, count]) => ({ ...studentTag(id, tagIndex), count })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Keep the ids whose question carries the tag (`tag` empty keeps all). */
export function filterByTag(ids, questions, tag) {
  if (!tag) return ids.slice();
  const has = new Set((Array.isArray(questions) ? questions : []).filter((q) => Array.isArray(q?.tags) && q.tags.includes(tag)).map((q) => q.id));
  return ids.filter((id) => has.has(id));
}

/* ---------------------------------------------------------------- teacher views */

/** Tags used by these tests, named from the teacher's tags: [{ id, name, color, unknown }] by name. */
export function adminTagOptions(tests) {
  const ids = new Set();
  for (const t of tests) for (const id of usedIds(t)) ids.add(id);
  return [...ids].map(adminTag).sort((a, b) => a.name.localeCompare(b.name));
}

/** Per-tag stats for submission rows (all graded work, released or not), named from the teacher's tags. `testFor(row)` gives the test. */
export function adminTagStats(rows, testFor) {
  const subs = (rows || []).map((r) => ({ row: r, responses: r.auto_responses || r.responses, grades: r.grades }));
  return withNames(tagStats(subs, (s) => testFor(s.row), { releasedOnly: false }), adminTag);
}
