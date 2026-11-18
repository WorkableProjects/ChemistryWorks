// Admin speed targets with a slow backend: every mock Apps Script reply takes 1500 ms, so anything that is fast here is
// fast because it does not wait for the network. Times are performance.now() deltas measured inside the page.
// Motion is reduced so the 180 ms row-leave animation does not count against the data path.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, unlockAdmin, withAdminKey, adhocTest, tid, poll, nextFrames } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const SLOW = { gasDelayMs: 1500 };
const NOW = Date.now();

const submission = (id, name) => ({
  submission_id: id, timestamp: new Date(NOW - 3600e3).toISOString(), student_name: name, student_email: `${id}@example.org`, test_code: 'OPEN1', test_title: 'Open ended',
  score_achieved: 1, score_total: 5, percentage: 20, duration_seconds: 120, status: 'Needs grading', needs_grading: true,
  responses: [
    { questionId: 'q1', type: 'mcq', questionText: 'Pick B', givenAnswerText: 'B', correctAnswerText: 'B', answered: true, isCorrect: true, pointsEarned: 1, pointsPossible: 1 },
    { questionId: 'q2', type: 'short', questionText: 'Explain', givenAnswerText: 'because', correctAnswerText: '—', answered: true, isCorrect: false, needsGrading: true, manual: true, pointsEarned: 0, pointsPossible: 4 },
  ],
});

function backend(s) {
  s.onGas = (b) => {
    switch (b.action) {
      case 'listTests': return { result: 'success', tests: [{ code: 'PUB1', title: 'Published one', updatedAt: '2026-01-01T00:00:00Z', submissionCount: 0 }, { code: 'PUB2', title: 'Published two', updatedAt: '2026-01-01T00:00:00Z', submissionCount: 0 }] };
      case 'getResults': return { result: 'success', rows: [submission('s1', 'Ada Lovelace'), submission('s2', 'Grace Hopper')], now: NOW };
      case 'getLog': return { result: 'success', rows: [] };
      case 'getSubmissionCounts': return { result: 'success', counts: { OPEN1: 2 } };
      case 'saveGrade': return { result: 'success', grade: { status: 'Graded', final_score: 5, score_total: 5, final_percentage: 100, grades: b.grades, graded_at: new Date().toISOString() } };
      default: return null;
    }
  };
}

async function slowAdmin(s, { drafts = false } = {}) {
  backend(s);
  await withAdminKey(s);
  await s.page.emulateMedia({ reducedMotion: 'reduce' });
  if (drafts) {
    await s.context.addInitScript((t) => { try { if (!localStorage.getItem('cw:drafts')) localStorage.setItem('cw:drafts', JSON.stringify({ DRAFT1: t })); } catch { /* ignore */ } },
      { ...adhocTest('DRAFT1'), updatedAt: new Date().toISOString() });
  }
  await unlockAdmin(s.page, s.url);
}

/** Click `clickSel`, then report the ms until `until(arg)` is true in the page. */
function timeAfterClick(page, clickSel, until, arg) {
  return page.evaluate(({ clickSel: sel, untilSource: src, arg: a }) => new Promise((resolve, reject) => {
    const check1 = new Function('arg', `return (${src})(arg)`);
    const until = () => check1(a);
    const t0 = performance.now();
    document.querySelector(sel).click();
    const check = () => {
      if (until()) { resolve(performance.now() - t0); return; }
      if (performance.now() - t0 > 5000) { reject(new Error('timed out waiting for the page to change')); return; }
      requestAnimationFrame(check);
    };
    check();
  }), { clickSel, untilSource: until.toString(), arg });
}

test('deleting a draft removes the row in under 100 ms and sends no request', () => withSession(env, SLOW, async (s) => {
  const { page } = s;
  await slowAdmin(s, { drafts: true });
  await page.locator(`${tid('library-item-DRAFT1')}[data-source="draft"]`).waitFor();
  await page.locator(tid('delete-DRAFT1')).click();
  await page.locator(tid('confirm-action')).waitFor();
  const sent = s.gas.length;
  const ms = await timeAfterClick(page, '[data-testid="confirm-action"]', () => !document.querySelector('[data-testid="library-item-DRAFT1"]'));
  assert.ok(ms < 100, `draft row removed in ${ms.toFixed(0)} ms`);
  assert.equal(s.gas.length, sent, 'a draft delete makes no request');
}));

test('deleting a published test removes the row in under 300 ms while the request is still out', () => withSession(env, SLOW, async (s) => {
  const { page } = s;
  await slowAdmin(s);
  await page.locator(`${tid('library-item-PUB1')}[data-source="published"]`).waitFor({ timeout: 8000 });
  await page.locator(tid('delete-PUB1')).click();
  await page.locator(tid('confirm-action')).waitFor();
  const ms = await timeAfterClick(page, '[data-testid="confirm-action"]', () => !document.querySelector('[data-testid="library-item-PUB1"]'));
  assert.ok(ms < 300, `published row removed in ${ms.toFixed(0)} ms`);
  await poll(() => s.gas.some((b) => b.action === 'deleteTest' && b.code === 'PUB1'), { message: 'deleteTest request' });
  assert.equal(await page.locator(tid('library-item-PUB2')).count(), 1, 'the other published test stays');
  await page.locator(tid('toast')).filter({ hasText: 'Deleted PUB1' }).waitFor({ timeout: 8000 }); // the slow reply arrives and confirms it
  assert.equal(await page.locator(tid('library-item-PUB1')).count(), 0);
}));

test('the Library opens warm in under 300 ms', () => withSession(env, SLOW, async (s) => {
  const { page } = s;
  await slowAdmin(s);
  await page.locator(tid('library-item-PUB1')).waitFor({ timeout: 8000 });
  await page.locator(tid('tab-dashboard')).click();
  await page.locator(tid('dashboard')).waitFor();
  const ms = await timeAfterClick(page, '[data-testid="tab-library"]', () => !!document.querySelector('[data-testid="library-item-PUB1"]') && !!document.querySelector('[data-testid="library-item-CHEM101"]'));
  assert.ok(ms < 300, `warm Library showed its rows in ${ms.toFixed(0)} ms`);
}));

test('Save & next shows the next student in under 300 ms and sends one request', () => withSession(env, SLOW, async (s) => {
  const { page } = s;
  await slowAdmin(s);
  await page.locator(tid('tab-grading')).click();
  await page.locator(tid('grading-status-filter')).selectOption('all');
  await page.locator(tid('grading-row')).first().waitFor({ timeout: 8000 });
  await page.locator(tid('grading-row')).first().click();
  await page.locator(tid('grade-item')).first().waitFor();
  const first = (await page.locator('h3.adm-h3').first().textContent()).trim();
  await page.locator(tid('points-q2')).fill('3');
  await page.locator(tid('graded-by')).fill('Ms. Rivera');
  await nextFrames(page);
  const sent = s.gas.length;
  const ms = await timeAfterClick(page, '[data-testid="save-grade-next"]', (was) => {
    const h = document.querySelector('h3.adm-h3');
    return !!h && !!document.querySelector('[data-testid="grade-item"]') && h.textContent.trim() !== was;
  }, first);
  assert.ok(ms < 300, `next student shown in ${ms.toFixed(0)} ms`);
  assert.notEqual((await page.locator('h3.adm-h3').first().textContent()).trim(), first);
  await poll(() => s.gas.length > sent, { message: 'saveGrade request' });
  await page.waitForLoadState('networkidle'); // the slow reply has arrived; nothing else was sent in the meantime
  const after = s.gas.slice(sent);
  assert.deepEqual(after.map((b) => b.action), ['saveGrade'], 'exactly one request');
}));

test('switching sidebar sections and back makes no request', () => withSession(env, SLOW, async (s) => {
  const { page } = s;
  await slowAdmin(s);
  const wait = {
    library: () => page.locator(tid('library-item-PUB1')).waitFor({ timeout: 8000 }),
    dashboard: () => page.locator(tid('dashboard')).waitFor(),
    grading: () => page.locator(tid('grading-row')).first().waitFor({ timeout: 8000 }),
  };
  await wait.library();
  for (const id of ['dashboard', 'grading']) {
    await page.locator(tid(`tab-${id}`)).click();
    await wait[id]();
  }
  await page.waitForLoadState('networkidle'); // every first-visit request has been answered
  const sent = () => s.gas.length + s.statusCalls.length;
  const before = sent();
  for (const id of ['library', 'dashboard', 'grading', 'library', 'grading', 'dashboard']) {
    await page.locator(tid(`tab-${id}`)).click();
    await wait[id]();
    await nextFrames(page);
  }
  assert.equal(sent(), before, 'no request while switching between warm sections');
}));
