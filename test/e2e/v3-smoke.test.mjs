import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startEnv, newSession, startTest, tid, signIn } from './helpers.mjs';
let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });
const NOT = { result: 'success', submitted: false, blocking: false, attempts: 0, latest: null, others: [] };

test('DEMOV3 runs and submits', async () => {
  const s = await newSession(env, {});
  s.onGas = (b) => (b.action === 'getStudentStatus' ? NOT : null);
  s.serveTest('DEMOV3', JSON.parse(fs.readFileSync('data/tests/DEMOV3.json', 'utf8')));
  try {
    await startTest(s, 'DEMOV3');
    await s.page.locator(tid('submit-btn')).first().click();
    await s.page.locator(tid('confirm-submit')).click();
    await s.page.locator(tid('results')).waitFor();
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('single submission blocks', async () => {
  const s = await newSession(env, {});
  s.onGas = (b) => (b.action === 'getStudentStatus' ? { ...NOT, submitted: true, blocking: true, attempts: 1, latest: { submission_id: 'x', submitted_at: '2026-11-01T10:00:00Z', released: false } } : null);
  s.serveTest('SINGLE1', { ...JSON.parse(fs.readFileSync('data/tests/DEMOV3.json', 'utf8')), code: 'SINGLE1', singleSubmission: true });
  try {
    await s.page.goto(s.url + '/');
    await signIn(s.page);
    await s.page.locator(tid('code-input')).fill('SINGLE1');
    await s.page.locator(tid('code-submit')).click();
    await s.page.locator(tid('already-submitted')).waitFor();
    assert.equal(await s.page.locator(tid('take-again')).count(), 0);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('released feedback on a fresh device', async () => {
  const s = await newSession(env, {});
  s.onGas = (b) => (b.action === 'getStudentStatus' ? { ...NOT, submitted: true, blocking: true, attempts: 1, latest: { submission_id: 'x', released: true },
    feedback: { submission_id: 'x', test_code: 'CHEM101', test_title: 'T', student_name: 'Stu', submitted_at: '2026-11-01T10:00:00Z', released_at: '2026-11-02T10:00:00Z', final_score: 1, score_total: 2, final_percentage: 50, grades: {}, comments: { q1: 'Nice work' }, graded_by: 'Ms. K',
      responses: [{ questionId: 'q1', type: 'mcq', questionText: 'What?', givenAnswerText: 'A', correctAnswerText: 'B', pointsEarned: 1, pointsPossible: 2, answered: true }] } } : null);
  try {
    await s.page.goto(s.url + '/');
    await signIn(s.page);
    await s.page.locator(tid('code-input')).fill('CHEM101');
    await s.page.locator(tid('code-submit')).click();
    await s.page.locator(tid('feedback-released')).waitFor();
    assert.equal(await s.page.locator(tid('feedback-download-pdf')).count(), 1);
    assert.equal(await s.page.locator(tid('take-again')).count(), 1); // CHEM101 is not single-submission
    assert.match(await s.page.locator(tid('feedback')).innerText(), /Nice work/);

    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('required questions block submit until answered', async () => {
  const s = await newSession(env, {});
  s.onGas = (b) => (b.action === 'getStudentStatus' ? NOT : null);
  const t = JSON.parse(fs.readFileSync('test/fixtures/tests/CHEM101.json', 'utf8'));
  t.code = 'REQ1';
  t.questions[0].required = true;
  s.serveTest('REQ1', t);
  try {
    await startTest(s, 'REQ1');
    assert.equal(await s.page.locator(tid('required-pill')).count(), 1);
    await s.page.locator(tid('submit-btn')).first().click();
    await s.page.locator(tid('required-warning')).waitFor();
    assert.equal(await s.page.locator(tid('confirm-submit')).count(), 0, 'no submit button while a required question is unanswered');
    assert.equal(s.gas.length, 0);
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});
