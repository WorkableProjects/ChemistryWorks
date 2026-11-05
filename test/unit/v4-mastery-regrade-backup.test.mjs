import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masteryTable, needsHelp, studentProfile, liveSummary, questionTopics } from '../../js/lib/mastery.js';
import { regradeRow } from '../../js/lib/regrade.js';
import { makeBundle, readBundle } from '../../js/lib/backup.js';
import { scrub, makeLimiter } from '../../js/lib/errors.js';

const T = { code: 'M1', title: 'M', sections: [{ id: 's', title: 'Gases' }], questions: [
  { id: 'q1', type: 'truefalse', text: 'a', points: 2, correctAnswer: true, tags: ['stoichiometry'] },
  { id: 'q2', type: 'truefalse', text: 'b', points: 2, correctAnswer: false, section: 's' }] };
const row = (email, e1, e2, extra = {}) => ({ student_email: email, student_name: email[0].toUpperCase(), test_code: 'M1', timestamp: extra.ts || '2026-01-01', percentage: (e1 + e2) * 25,
  responses: [{ questionId: 'q1', pointsEarned: e1, pointsPossible: 2, answered: true, givenAnswer: e1 === 2 }, { questionId: 'q2', pointsEarned: e2, pointsPossible: 2, answered: true, givenAnswer: e2 !== 2 }], ...extra });

test('mastery: topics from tags or section titles; per student and class; needs help', () => {
  assert.deepEqual(questionTopics(T), { q1: ['stoichiometry'], q2: ['Gases'] });
  const tbl = masteryTable([row('ada@x', 2, 0), row('bo@x', 0, 2)], { M1: T });
  assert.deepEqual(tbl.topics, ['Gases', 'stoichiometry']);
  assert.equal(tbl.classByTopic.stoichiometry.pct, 50);
  assert.equal(tbl.students.find((s) => s.email === 'ada@x').byTopic.stoichiometry.pct, 100);
  assert.deepEqual(needsHelp(tbl, 'stoichiometry').map((s) => s.email), ['bo@x']);
});

test('profile trend and live summary', () => {
  const p = studentProfile([row('ada@x', 2, 2, { ts: '2026-02-01' }), row('ada@x', 0, 0, { ts: '2026-01-01' })], 'ADA@x');
  assert.deepEqual(p.trend, [0, 100]);
  assert.deepEqual(liveSummary([{ submitted: true }, { idle: true }, {}]), { started: 3, submitted: 1, idle: 1, working: 1 });
});

test('regrade: a fixed key changes the score; untouched rows report no change', () => {
  const r = row('ada@x', 0, 2);
  const fixed = { ...T, questions: [{ ...T.questions[0], correctAnswer: false }, T.questions[1]] };
  const res = regradeRow(fixed, r);
  assert.equal(res.changed, true);
  assert.equal(res.scoreAchieved, 4);
  assert.equal(regradeRow(T, r).changed, false);
});

test('backup round-trip keeps valid tests and reports broken ones', () => {
  const b = makeBundle({ tests: [{ ...T }, { code: 'BAD', title: '', questions: [] }, { ...T }], bank: [{ question: { type: 'mcq' } }] });
  assert.equal(b.tests.length, 2);
  const r = readBundle(JSON.stringify(b));
  assert.equal(r.tests.length, 1);
  assert.equal(r.errors.length, 1);
  assert.equal(r.bank.length, 1);
  assert.equal(readBundle('{"x":1}').ok, false);
});

test('error scrubbing removes quoted text, JSON and emails; limiter caps reports', () => {
  assert.equal(scrub('Bad answer "H2O" from ada@x.org {"a":1}'), 'Bad answer "…" from <email> {…}');
  const allow = makeLimiter({ perPage: 2, gapMs: 1000 });
  assert.deepEqual([allow(0), allow(500), allow(1500), allow(3000)], [true, false, true, false]);
});
