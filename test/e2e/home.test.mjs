// Student home: sections come from the profile, Continue reopens the last attempt, no test is listed twice, and the
// "Not synced" chip shows when the backend cannot be reached.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startEnv, withSession, startTest, signIn, tid, poll, waitText, activeCard, answerCHEM101, submit, A, STUDENT,
  signInStudentAs, createMockBackend,
} from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const DAY = 86400000;
const CLASS = { id: 'c1', name: 'Period 3 Chemistry', period: '3', emails: [STUDENT.email] };
const TESTS = [{ code: 'CHEM101', title: 'Foundations of Chemistry' }, { code: 'CHEM102', title: 'The Mole' }, { code: 'CHEM110', title: 'Bonding' }];

function backendWithProfile() {
  const be = createMockBackend({
    classes: [CLASS], tests: TESTS, students: { [STUDENT.email]: STUDENT.name },
    profile: {
      profile: { xp: 320, level: 2, streakDays: 3 },
      results: [
        { testCode: 'CHEM102', title: 'The Mole', submittedAt: '2026-03-01T10:00:00Z', status: 'released', released: true, percentage: 85, scoreAchieved: 17, scoreTotal: 20 },
        { testCode: 'CHEM110', title: 'Bonding', submittedAt: '2026-03-02T10:00:00Z', status: 'submitted', released: false },
      ],
      attempts: [{ code: 'CHEM201', mode: 'classic', answeredCount: 2, total: 8, percentDone: 25, updatedAt: new Date().toISOString() }],
    },
  });
  be.state.assignments.push({
    id: 'asg-seed', classId: 'c1', testCode: 'CHEM101', title: 'Foundations of Chemistry', instructions: '', opensAt: '', dueAt: new Date(Date.now() + 2 * DAY).toISOString(),
    lateAllowed: true, required: true, modes: [], publishAt: '', createdBy: 'teacher', createdAt: new Date().toISOString(),
  });
  return be;
}

test('home sections render from the profile the backend returns', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  backendWithProfile().attach(s);
  await signInStudentAs(s);
  await page.goto(url + '/');
  await page.locator(tid('home')).waitFor();
  await waitText(page.locator('.home-greeting'), /^Good (morning|afternoon|evening), Ada$/);
  await waitText(page.locator(tid('class-link-c1')), 'Period 3 Chemistry');
  await waitText(page.locator('.home-meta'), /3-day streak/);
  assert.equal(await page.locator(tid('level-ring')).count(), 1);
  // Up next: the seeded assignment, opened without typing a code.
  await page.locator(`${tid('up-next')} ${tid('assignment-asg-seed')}`).waitFor();
  assert.match(await page.locator(tid('assignment-chip-asg-seed')).textContent(), /^Due /);
  // In progress: the attempt another device started.
  await waitText(page.locator(`${tid('in-progress-CHEM201')} .row__meta`), /2 of 8 answered/);
  await page.locator(tid('newer-CHEM201')).waitFor();
  // Results: one released with a score, one waiting for grading.
  await waitText(page.locator(`${tid('results-list')} ${tid('result-score')}`), '85%');
  assert.equal(await page.locator(`${tid('results-list')} ${tid('result-waiting')}`).count(), 1);
  await page.locator(`${tid('results-list')} [data-code="CHEM102"] button`).filter({ hasText: 'View feedback' }).waitFor();
  // Practice shelf with the badge list.
  await page.locator(`${tid('practice-shelf')} ${tid('badges')}`).waitFor();
  assert.ok(await page.locator('[data-testid^="badge-"]').count() > 0);
  await poll(() => s.gas.some((b) => b.action === 'getStudentProfile'), { message: 'profile request' });
}));

test('Continue reopens the last attempt with its answers', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEM101');
  await A.mcq(page, 'b');
  await poll(async () => page.evaluate(([e]) => !!localStorage.getItem(`cw:progress:${e}:CHEM101`), [STUDENT.email]), { message: 'progress saved' });
  await page.locator(tid('brand')).click();
  await page.locator(tid('home')).waitFor();
  await waitText(page.locator(`${tid('in-progress-CHEM101')} .row__meta`), /1 of \d+ answered/);
  await page.locator(`${tid('up-next')} ${tid('continue-btn')}`).click();
  await page.locator(tid('runner')).waitFor();
  await waitText(page.locator(tid('progress-text')), /^1 of \d+ answered$/);
  assert.equal(await activeCard(page).locator(tid('option-b')).getAttribute('aria-checked'), 'true');
}));

test('a test that is in progress here and on the server is listed once', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  const be = backendWithProfile();
  be.state.attempts[`${STUDENT.email}|CHEM101`] = { code: 'CHEM101', mode: 'study', answeredCount: 4, total: 6, updatedAt: new Date(Date.now() + 60000).toISOString() };
  be.attach(s);
  await signInStudentAs(s);
  await page.goto(url + '/');
  await page.locator(tid('home-code-input')).fill('CHEM101');
  await page.locator(tid('home-code-submit')).click();
  await page.locator(tid('runner')).waitFor();
  await A.mcq(page, 'b');
  await poll(async () => page.evaluate(([e]) => !!localStorage.getItem(`cw:progress:${e}:CHEM101`), [STUDENT.email]), { message: 'progress saved' });
  await page.locator(tid('brand')).click();
  await page.locator(tid('home')).waitFor();
  await page.locator(tid('in-progress-CHEM101')).waitFor();
  await page.locator(tid('in-progress-CHEM201')).waitFor();
  assert.equal(await page.locator(tid('in-progress-CHEM101')).count(), 1);
  const codes = await page.locator('[data-testid^="in-progress-"]').evaluateAll((els) => els.map((e) => e.dataset.code));
  assert.equal(new Set(codes).size, codes.length, `every in-progress row is unique: ${codes}`);
}));

test('a submitted test shows once in Results, not twice', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  createMockBackend({ classes: [CLASS], tests: TESTS }).attach(s); // the backend stores the submission and sends it back in the profile
  await signInStudentAs(s);
  await page.goto(url + '/');
  await page.locator(tid('home-code-input')).fill('CHEM101');
  await page.locator(tid('home-code-submit')).click();
  await page.locator(tid('runner')).waitFor();
  await answerCHEM101(page);
  await submit(page);
  await poll(() => s.gas.some((b) => b && b.submission_id), { message: 'submission sent' });
  await page.locator(tid('home-btn')).click();
  await page.locator(tid('home')).waitFor();
  await page.locator(`${tid('results-list')} [data-code="CHEM101"]`).first().waitFor();
  await poll(() => s.gas.filter((b) => b.action === 'getStudentProfile').length >= 2, { message: 'profile reloaded from the server' });
  assert.equal(await page.locator(`${tid('results-list')} [data-code="CHEM101"]`).count(), 1);
  assert.equal(await page.locator(`${tid('in-progress-CHEM101')}`).count(), 0, 'a submitted test is no longer in progress');
}));

test('demo sign-in is never synced: the chip says Not synced and the home still works', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await page.goto(url + '/');
  await signIn(page);
  await page.locator(tid('home')).waitFor();
  const chip = page.locator(tid('sync-chip'));
  await waitText(chip, 'Not synced');
  assert.equal(await chip.getAttribute('data-state'), 'offline');
  assert.equal(s.gas.filter((b) => b.action === 'getStudentProfile').length, 0, 'no profile request without a Google sign-in');
  await page.locator(tid('home-code-input')).fill('CHEM101');
  await page.locator(tid('home-code-submit')).click();
  await page.locator(tid('runner')).waitFor();
}));

test('backend unreachable: the home paints from this device and the chip says Not synced', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  s.modes.gas = 'fail';
  await signInStudentAs(s);
  await page.goto(url + '/');
  await page.locator(tid('home')).waitFor();
  await poll(() => s.gas.some((b) => b.action === 'getStudentProfile'), { message: 'profile request attempted' });
  await waitText(page.locator(tid('sync-chip')), 'Not synced');
  await page.locator(tid('results')).waitFor();
  await page.locator(tid('practice-shelf')).waitFor();
}));
