import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, signIn, startTest, answerCHEM101, submit, adhocTest, A, goNext, tid, waitText, poll, STUDENT } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

async function backToLanding(page) {
  await page.locator(tid('home-btn')).first().click();
  await page.locator(tid('code-card')).waitFor();
}

test('student opens feedback from the landing list: pending, then released with comments', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEM101');
  await answerCHEM101(page);
  await submit(page);
  const sub = s.gas.find((b) => b.submission_id);
  assert.ok(sub, 'submission POST captured');
  const qids = sub.responses.map((r) => r.questionId);
  const [qa, qb] = qids;

  s.onGas = (b) => (b.action === 'getFeedback' ? { result: 'success', released: false } : null);
  await backToLanding(page);
  await page.locator(tid('past-results')).waitFor();
  await page.locator(tid(`view-feedback-${sub.submission_id}`)).click();
  await page.locator(tid('feedback')).waitFor();
  await waitText(page.locator(tid('feedback-pending')), /hasn’t released grades and comments/);
  assert.equal(await page.locator(tid('feedback-released')).count(), 0);
  const req = s.gas.find((b) => b.action === 'getFeedback');
  assert.equal(req.studentEmail, STUDENT.email);
  assert.equal(req.submissionId, sub.submission_id);
  assert.ok(!('adminKey' in req), 'no admin key in the student request');

  // Now released, with grades and comments.
  s.onGas = (b) => (b.action === 'getFeedback' ? {
    result: 'success', released: true, released_at: '2026-03-01T10:00:00Z', status: 'Graded',
    final_score: 1.5, score_total: sub.score_total, final_percentage: 12.5,
    grades: { [qa]: 0.5, [qb]: 1 },
    comments: { [qa]: '**Well done** see [the notes](https://example.org/notes) <b>raw</b>', [qb]: '- first\n- second' },
  } : null);
  await page.locator(tid('feedback-back')).click();
  await page.locator(tid('code-card')).waitFor();
  await page.locator(tid(`view-feedback-${sub.submission_id}`)).click();
  await page.locator(tid('feedback-released')).waitFor();
  // v3: the released review is the PDF export model (export-* testids).
  await waitText(page.locator(tid('export-score')), new RegExp(`^1\\.5 / ${sub.score_total} · 12\\.5%$`));
  await waitText(page.locator(tid(`export-item-${qa}`)).locator('.export-item__pts'), new RegExp(`^0\\.5 / `));
  const c = page.locator(tid(`export-item-${qa}`)).locator('.export-comment');
  await c.waitFor();
  assert.equal(await c.locator('strong').textContent(), 'Well done');
  const a = c.locator('a');
  assert.equal(await a.getAttribute('href'), 'https://example.org/notes');
  assert.match(await a.getAttribute('rel'), /noopener/);
  assert.equal(await c.locator('b').count(), 0, 'raw HTML is not rendered');
  assert.match(await c.textContent(), /<b>raw<\/b>/);
  assert.equal(await page.locator(tid(`export-item-${qb}`)).locator('.export-comment li').count(), 2);
  assert.equal(await page.locator(tid(`export-item-${qids[2]}`)).locator('.export-comment').count(), 0);
}));

test('feedback groups questions under section headings', () => withSession(env, {}, async (s) => {
  const { page } = s;
  const t = adhocTest('SECT1', {
    sections: [{ id: 's1', title: 'Part A', instructions: '' }, { id: 's2', title: 'Part B', instructions: '' }],
  });
  t.questions[0].section = 's1';
  t.questions[1].section = 's2';
  s.serveTest('SECT1', t);
  await startTest(s, 'SECT1');
  await A.mcq(page, 'b'); await goNext(page);
  await A.tf(page, true);
  await submit(page);
  const sub = s.gas.find((b) => b.submission_id);
  s.onGas = (b) => (b.action === 'getFeedback' ? {
    result: 'success', released: true, released_at: '2026-03-01T10:00:00Z', final_score: 2, score_total: 2, final_percentage: 100, grades: {}, comments: { q2: 'Nice' },
  } : null);
  await backToLanding(page);
  await page.locator(tid(`view-feedback-${sub.submission_id}`)).click();
  await page.locator(tid('feedback-released')).waitFor();
  await poll(async () => (await page.locator(tid('export-section')).count()) === 2, { message: 'two section headings' });
  assert.equal(await page.locator(tid('export-item-q2')).locator('.export-comment').count(), 1);
}));

test('feedback errors offer a retry; no backend shows unavailable', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEM101');
  await answerCHEM101(page);
  await submit(page);
  const sub = s.gas.find((b) => b.submission_id);
  s.onGas = (b) => (b.action === 'getFeedback' ? { result: 'error', error: 'not_found' } : null);
  await backToLanding(page);
  await page.locator(tid(`view-feedback-${sub.submission_id}`)).click();
  await waitText(page.locator(tid('feedback-error')), /not_found/);
  s.onGas = (b) => (b.action === 'getFeedback' ? { result: 'success', released: false } : null);
  await page.locator(tid('feedback-retry')).click();
  await page.locator(tid('feedback-pending')).waitFor();
}));

test('past results only list the signed-in student and feedback is unavailable without a backend', () => withSession(env, { config: { GAS_WEB_APP_URL: '' } }, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEM101');
  await answerCHEM101(page);
  await submit(page);
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('cw:localResults') || '[]');
    list.push({ ...list[0], submission_id: 'other-1', student_email: 'someone@else.org' });
    localStorage.setItem('cw:localResults', JSON.stringify(list));
  });
  await backToLanding(page);
  const mine = await page.locator('[data-testid^="view-feedback-"]').count();
  assert.equal(mine, 1);
  assert.equal(await page.locator(tid('view-feedback-other-1')).count(), 0);
  await page.locator('[data-testid^="view-feedback-"]').first().click();
  await waitText(page.locator(tid('feedback-unavailable')), /Feedback isn’t available on this site\./);
}));

test('landing hides the past-results card when there is nothing submitted', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await page.goto(s.url + '/');
  await signIn(page);
  await page.locator(tid('code-card')).waitFor();
  assert.equal(await page.locator(tid('past-results')).count(), 0);
}));
