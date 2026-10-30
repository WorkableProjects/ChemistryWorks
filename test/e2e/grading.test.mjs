import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, startTest, tid, poll, waitText, A, goNext, submit, unlockAdmin } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const OPEN_TEST = (over = {}) => ({
  code: 'OPEN1', title: 'Open ended',
  questions: [
    { id: 'q1', type: 'mcq', text: 'Pick B', points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctAnswer: 'b' },
    { id: 'q2', type: 'short', text: 'Explain why ice floats.', points: 4, sampleAnswer: 'Ice is less dense than water.' },
  ],
  ...over,
});

async function takeOpenTest(s, over) {
  const { page } = s;
  s.serveTest('OPEN1', OPEN_TEST(over));
  await startTest(s, 'OPEN1');
  await A.mcq(page, 'b');
  await goNext(page);
  await page.locator(`[data-testid="question-card"].is-active ${tid('short-input')}`).fill('Hydrogen bonds hold the molecules\nfarther apart.');
  await submit(page);
}

test('short answer: score is provisional and the answer is flagged for grading', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await takeOpenTest(s);
  await page.locator(tid('pending-note')).waitFor();
  await waitText(page.locator(tid('score-points')), '1 / 5');
  assert.equal(await page.locator(tid('pass-badge')).count(), 0);
  const item = page.locator(tid('review-item-q2'));
  assert.equal(await item.getAttribute('data-status'), 'pending');
  await poll(() => s.gas.length === 1, { message: 'GAS submission' });
  const p = s.gas[0];
  assert.equal(p.needs_grading, true);
  assert.equal(p.responses[1].needsGrading, true);
  assert.equal(p.responses[1].givenAnswerText, 'Hydrogen bonds hold the molecules\nfarther apart.');
}));

test('hidden score: student only sees "Submission received"', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await takeOpenTest(s, { showResults: false });
  await page.locator(tid('results-hidden')).waitFor();
  assert.equal(await page.locator(tid('score-points')).count(), 0);
  assert.equal(await page.locator(tid('review-list')).count(), 0);
}));

test('grading tab: grade an open-ended answer, save, and export grades', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await takeOpenTest(s);
  await poll(() => s.gas.length === 1, { message: 'GAS submission' });
  const sub = s.gas[0];
  const row = { ...sub, timestamp: sub.submitted_at, status: 'Needs grading', final_score: null, final_percentage: null, grades: null };
  s.onGas = (body) => {
    if (body.action === 'getResults') return { result: 'success', rows: [row] };
    if (body.action === 'saveGrade') {
      return { result: 'success', grade: { status: 'Graded', final_score: 4, score_total: 5, final_percentage: 80, grades: body.grades, graded_at: new Date().toISOString(), teacher_note: body.note } };
    }
    return null;
  };

  await unlockAdmin(page, url);
  await page.evaluate(() => sessionStorage.setItem('cw:adminKey', JSON.stringify('secret')));
  await page.locator(tid('tab-grading')).click();
  await page.locator(tid('grading-row')).first().waitFor();
  assert.equal(await page.locator(tid('grading-row')).count(), 1);
  await page.locator(tid('grading-row')).first().click();

  // Saving is blocked until the open-ended answer has points.
  await page.locator(tid('save-grade')).click();
  assert.equal(s.gas.filter((b) => b.action === 'saveGrade').length, 0);

  await page.locator(tid('points-q2')).fill('3');
  await waitText(page.locator(tid('grade-total')), '4 / 5 (80.0%)');
  await page.locator(tid('grade-note')).fill('Good reasoning.');
  await page.locator(tid('save-grade')).click();
  await poll(() => s.gas.some((b) => b.action === 'saveGrade'), { message: 'saveGrade POST' });
  const save = s.gas.find((b) => b.action === 'saveGrade');
  assert.equal(save.adminKey, 'secret');
  assert.equal(save.submissionId, sub.submission_id);
  assert.deepEqual(save.grades, { q2: 3 });
  assert.equal(save.note, 'Good reasoning.');
  await waitText(page.locator(tid('grade-status')).first(), 'Graded');

  // Back in the list (filtered to "Needs grading") the graded submission is gone; "All" shows its final score.
  await page.locator(tid('grading-back')).click();
  await page.locator(tid('grading-table')).waitFor();
  assert.equal(await page.locator(tid('grading-row')).count(), 0);
  await page.locator(tid('grading-status-filter')).selectOption('all');
  await waitText(page.locator(tid('grading-row')).first().locator('td').nth(4), /^4 \/ 5/);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(tid('export-grades')).click()]);
  const csv = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'));
  assert.match(csv, /^Student Name,Student Email,Test Code,Test Title,Score,Points Possible,Percent,Status,Submitted\r\n/);
  assert.match(csv, /Ada Lovelace,ada@example.org,OPEN1,Open ended,4,5,80,Graded,/);
}));

test('grading tab asks for the Sheet connection when no admin key is set', () => withSession(env, {}, async ({ page, url }) => {
  await unlockAdmin(page, url);
  await page.locator(tid('tab-grading')).click();
  await page.locator(tid('grading-unconfigured')).waitFor();
}));
