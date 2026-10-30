import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, startTest, tid, poll, waitText, waitAttr, A, answerCHEM101, submit, goNext, activeId, noHorizontalScroll } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

test('failed submission is queued; Retry resends the same submission_id', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.modes.gas = 'fail';
  s.modes.netlify = 500;
  await startTest(s);
  await answerCHEM101(page);
  await submit(page);

  const status = page.locator(tid('submission-status'));
  await waitAttr(status, 'data-queued', 'true');
  await waitAttr(status, 'data-gas', 'failed');
  await waitAttr(status, 'data-netlify', 'failed');
  await page.locator(tid('retry-submit')).waitFor();
  await waitText(page.locator(tid('score-percentage')), '100.00%'); // score still shown
  assert.equal(s.gas.length, 1);
  const firstId = s.gas[0].submission_id;
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cw:outbox')).length), 1);

  // Retry while still offline: stays queued
  await page.locator(tid('retry-submit')).click();
  await poll(() => s.gas.length >= 2, { message: 'second attempt while offline' });
  await waitText(page.locator(tid('toast')).last(), /Still couldn't reach the server/);
  await waitAttr(status, 'data-queued', 'true');

  // Backend recovers
  s.modes.gas = 'ok';
  s.modes.netlify = 200;
  const before = s.gas.length;
  await page.locator(tid('retry-submit')).click();
  await poll(() => s.gas.length > before, { message: 'successful retry' });
  await poll(async () => (await page.locator(tid('toast')).allTextContents()).some((t) => /Sent 1 queued submission/.test(t)), { message: 'success toast' });
  assert.equal(s.gas.at(-1).submission_id, firstId, 'same submission re-sent');
  assert.equal(s.netlify.at(-1).submission_id, firstId);
  await waitAttr(status, 'data-queued', 'false');
  assert.equal(await page.locator(tid('retry-submit')).count(), 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cw:outbox')).length), 0);
}));

test('one channel failing is not queued (Netlify down, GAS up)', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.modes.netlify = 500;
  await startTest(s, 'CHEM101');
  await A.mcq(page, 'b');
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('confirm-submit')).click();
  await page.locator(tid('results')).waitFor();
  const status = page.locator(tid('submission-status'));
  await waitAttr(status, 'data-gas', 'sent');
  await waitAttr(status, 'data-netlify', 'failed');
  await waitAttr(status, 'data-queued', 'false');
  assert.equal(await page.locator(tid('retry-submit')).count(), 0);
}));

test('no backends configured: submission is skipped, not queued', () => withSession(env, { config: { GAS_WEB_APP_URL: '', NETLIFY_FORMS: false } }, async (s) => {
  const { page } = s;
  await startTest(s);
  await A.mcq(page, 'b');
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('confirm-submit')).click();
  await page.locator(tid('results')).waitFor();
  const status = page.locator(tid('submission-status'));
  await waitAttr(status, 'data-gas', 'skipped');
  await waitAttr(status, 'data-netlify', 'skipped');
  await waitAttr(status, 'data-queued', 'false');
  assert.equal(s.gas.length + s.netlify.length, 0);
}));

test('Netlify payload mirrors the GAS payload', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  await A.mcq(page, 'a');
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('confirm-submit')).click();
  await page.locator(tid('results')).waitFor();
  const g = s.gas[0], n = s.netlify[0];
  assert.equal(n.percentage, g.percentage);
  assert.equal(n.student_email, g.student_email);
  assert.equal(n.score_achieved, String(g.score_achieved));
  assert.deepEqual(JSON.parse(n.flags_json), g.flags);
}));

test('mobile 375x740: runner and results have no horizontal page scroll', () => withSession(env, { viewport: { width: 375, height: 740 } }, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEM101');
  const ans = [
    () => A.mcq(page, 'b'), () => A.multi(page, ['a', 'c']), () => A.numeric(page, '18.016'), () => A.formula(page, 'CuSO4.5H2O'),
    () => A.tf(page, true), () => A.match(page, { na: 'p1', mg: 'p2', al: 'p3' }), () => A.numeric(page, '1.2044e24'),
  ];
  for (let i = 0; i < ans.length; i++) {
    await ans[i]();
    assert.ok(await noHorizontalScroll(page), `runner overflows on question ${i + 1}`);
    if (i < ans.length - 1) await goNext(page);
  }
  await page.locator(tid('navigator-toggle')).click();
  await page.locator(`${tid('navigator')}.is-open`).waitFor();
  assert.ok(await noHorizontalScroll(page), 'navigator open overflows');
  await page.keyboard.press('Escape');
  await submit(page);
  await waitText(page.locator(tid('score-percentage')), /%$/);
  assert.ok(await noHorizontalScroll(page), 'results overflow');
  await page.locator(tid('review-list')).waitFor();
  for (const id of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']) await page.locator(tid(`review-item-${id}`)).locator('.results-item__head').click();
  assert.ok(await noHorizontalScroll(page), 'expanded review overflows');
}));

test('mobile 375x740: CHEM102 (wide matching table) has no horizontal page scroll', () => withSession(env, { viewport: { width: 375, height: 740 } }, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEM102');
  for (let i = 0; i < 10; i++) {
    const id = await activeId(page);
    assert.ok(await noHorizontalScroll(page), `CHEM102 ${id} overflows`);
    if (i < 9) await goNext(page);
  }
}));
