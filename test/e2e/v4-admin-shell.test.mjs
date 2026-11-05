import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, tid, poll, waitText, unlockAdmin, noHorizontalScroll, addQuestion } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const PATH = '/?admin=true&features=adminShell';
const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

const row = (id, name, pct, status, msAgo) => ({
  submission_id: id, timestamp: iso(msAgo), student_name: name, student_email: `${id}@example.org`, test_code: 'OPEN1', test_title: 'Open ended',
  score_achieved: 1, score_total: 5, percentage: pct, duration_seconds: 120, status, needs_grading: status === 'Needs grading',
  responses: [
    { questionId: 'q1', type: 'mcq', questionText: 'Pick B', givenAnswerText: 'B', correctAnswerText: 'B', answered: true, isCorrect: true, pointsEarned: 1, pointsPossible: 1 },
    { questionId: 'q2', type: 'short', questionText: 'Explain', givenAnswerText: 'because', correctAnswerText: '—', answered: true, isCorrect: false, needsGrading: true, manual: true, pointsEarned: 0, pointsPossible: 4 },
  ],
});

function backend(s) {
  s.onGas = (body) => {
    if (body.action === 'getResults') return { result: 'success', rows: [row('s1', 'Ada Lovelace', 20, 'Needs grading', 3600e3), row('s2', 'Grace Hopper', 20, 'Needs grading', 1800e3)] };
    if (body.action === 'listTests') return { result: 'success', tests: [] };
    if (body.action === 'getLog') return { result: 'success', rows: [{ time: iso(1000), admin: 'owner', action: 'saveGrade', target: 's1', details: '' }] };
    if (body.action === 'getSubmissionCounts') return { result: 'success', counts: { OPEN1: 2 } };
    return null;
  };
}
const withKey = (s) => s.context.addInitScript(() => { try { sessionStorage.setItem('cw:adminKey', JSON.stringify('secret')); } catch { /* ignore */ } });

test('lands on the dashboard with a greeting, sidebar navigation and aria-current', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  backend(s); await withKey(s);
  await unlockAdmin(page, url, { path: PATH });
  await page.locator(tid('dashboard')).waitFor();
  const greeting = (await page.locator(tid('dashboard-greeting')).textContent()).trim();
  assert.ok(greeting.length > 3 && !greeting.includes('{'), greeting);
  assert.equal(await page.locator(`${tid('admin-sidebar')}[aria-label]`).count(), 1);
  assert.equal(await page.locator('nav[aria-label="Admin sections"]').count(), 1);
  assert.equal(await page.locator(`${tid('tab-dashboard')}[aria-current="page"]`).count(), 1);
  // entries for views that do not exist yet stay hidden; every old testid is present
  for (const id of ['dashboard', 'library', 'builder', 'grading', 'insights', 'settings']) assert.equal(await page.locator(tid(`tab-${id}`)).count(), 1, id);
  for (const id of ['tab-bank', 'tab-classes']) assert.equal(await page.locator(tid(id)).count(), 0);
  for (const id of ['lock-admin', 'sheet-link', 'new-test', 'brand']) assert.equal(await page.locator(tid(id)).count(), 1, id);
  // needs attention + quick stats come from the mocked backend
  await page.locator(tid('dash-grade-OPEN1')).waitFor();
  await waitText(page.locator(tid('dash-grade-OPEN1')), /2\s*to grade in OPEN1/);
  await page.locator(tid('dash-stats')).waitFor();
  await page.locator(tid('dash-log')).waitFor();
  // navigate
  await page.locator(tid('tab-library')).click();
  await page.locator(tid('library-item-CHEM101')).first().waitFor();
  assert.equal(await page.locator(`${tid('tab-library')}[aria-current="page"]`).count(), 1);
  assert.equal(await page.locator('[aria-current="page"][data-testid^="tab-"]').count(), 1);
  assert.match(await page.locator(tid('admin-breadcrumb')).textContent(), /ChemWorks\s*Library/);
  // lock still works
  await page.locator(tid('lock-admin')).click();
  await page.locator(tid('signin-card')).waitFor();
}));

test('profile menu shows the account and the theme toggle', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await unlockAdmin(page, url, { path: PATH });
  assert.equal(await page.locator(tid('admin-profile-menu')).isVisible(), false);
  await page.locator(tid('admin-profile')).click();
  await page.locator(tid('admin-profile-menu')).waitFor();
  await page.locator(tid('admin-theme-dark')).click();
  await poll(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', { message: 'dark theme' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator(tid('admin-profile-menu')).isVisible(), false);
}));

test('the menu button collapses the sidebar and the choice is remembered', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await page.setViewportSize({ width: 1366, height: 800 });
  await unlockAdmin(page, url, { path: PATH });
  assert.equal(await page.locator(tid('admin')).getAttribute('data-nav'), 'full');
  await page.locator(tid('admin-nav-toggle')).click();
  assert.equal(await page.locator(tid('admin')).getAttribute('data-nav'), 'rail');
  await page.reload();
  await page.locator(tid('admin')).waitFor();
  assert.equal(await page.locator(tid('admin')).getAttribute('data-nav'), 'rail');
  await page.locator(tid('admin-nav-toggle')).click();
  assert.equal(await page.locator(tid('admin')).getAttribute('data-nav'), 'full');
  // medium screens start icons-only
  await page.evaluate(() => localStorage.removeItem('cw:adminNav'));
  await page.setViewportSize({ width: 900, height: 800 });
  await page.reload();
  await page.locator(tid('admin')).waitFor();
  assert.equal(await page.locator(tid('admin')).getAttribute('data-nav'), 'rail');
}));

test('phones: the sidebar is a drawer opened by the menu button', () => withSession(env, { viewport: { width: 390, height: 800 } }, async (s) => {
  const { page, url } = s;
  await unlockAdmin(page, url, { path: PATH });
  const side = page.locator(tid('admin-sidebar'));
  assert.equal(await page.locator(tid('admin')).getAttribute('data-nav'), 'drawer');
  assert.equal(await side.evaluate((el) => el.inert), true);
  await page.locator(tid('admin-nav-toggle')).click();
  await poll(async () => (await side.evaluate((el) => el.inert)) === false, { message: 'drawer open' });
  assert.equal(await page.locator(tid('admin-nav-toggle')).getAttribute('aria-expanded'), 'true');
  await page.locator(tid('tab-settings')).click();
  await poll(async () => (await side.evaluate((el) => el.inert)) === true, { message: 'drawer closed after choosing' });
  assert.equal(await page.locator(`${tid('tab-settings')}[aria-current="page"]`).count(), 1);
  assert.ok(await noHorizontalScroll(page));
}));

test('library: search, filters and the card / table toggle', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await unlockAdmin(page, url, { path: PATH });
  await page.locator(tid('tab-library')).click();
  await page.locator(tid('library-grid')).first().waitFor();
  assert.ok(await page.locator(tid('library-item-CHEM101')).count() >= 1);
  await page.locator(tid('lib-search')).fill('CHEM102');
  await poll(async () => (await page.locator(tid('library-item-CHEM101')).count()) === 0, { message: 'search narrows list' });
  assert.ok(await page.locator(tid('library-item-CHEM102')).count() >= 1);
  await page.locator(tid('lib-search')).fill('');
  await page.locator(tid('lib-filter-published')).click();
  await page.locator(tid('library-no-match')).first().waitFor();
  await page.locator(tid('lib-filter-published')).click();
  await page.locator(tid('lib-view-table')).click();
  await page.locator(tid('library-table')).first().waitFor();
  await page.reload();
  await page.locator(tid('tab-library')).click();
  await page.locator(tid('library-table')).first().waitFor(); // remembered
  await page.locator(tid('lib-view-grid')).click();
  await page.locator(tid('library-grid')).first().waitFor();
}));

test('builder: outline reorders by keyboard and by drag, and the student preview runs', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await unlockAdmin(page, url, { path: PATH });
  await page.locator(tid('tab-builder')).click();
  await page.locator(tid('builder-outline')).waitFor();
  await page.locator(tid('test-code')).fill('SHELL1');
  await page.locator(tid('test-title')).fill('Shell test');
  for (const t of ['mcq', 'truefalse', 'numeric']) {
    await addQuestion(page, t);
    await page.locator(tid('q-text')).last().fill(`Question of type ${t}`);
  }
  const rows = page.locator(tid('outline-item'));
  assert.equal(await rows.count(), 3);
  // in-test tabs + breadcrumb now that a test is in focus
  await page.locator(tid('admin-test-tabs')).waitFor();
  assert.equal(await page.locator(`${tid('testtab-questions')}[aria-selected="true"]`).count(), 1);
  assert.match(await page.locator(tid('admin-breadcrumb')).textContent(), /SHELL1/);
  const order = async () => page.locator(`${tid('question-editor')} ${tid('q-text')}`).evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(await order(), ['Question of type mcq', 'Question of type truefalse', 'Question of type numeric']);
  // keyboard: Alt+ArrowDown on the first row
  await rows.nth(0).focus();
  await page.keyboard.press('Alt+ArrowDown');
  await poll(async () => (await order())[0] === 'Question of type truefalse', { message: 'keyboard move' });
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.testid), 'outline-item');
  assert.deepEqual(await order(), ['Question of type truefalse', 'Question of type mcq', 'Question of type numeric']);
  // drag the last row's handle above the first
  const grip = page.locator(`${tid('outline-item')}:nth-child(3) .bld2-ol__grip`).first();
  const g = await grip.boundingBox();
  const first = await page.locator(tid('outline-item')).nth(0).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, (g.y + first.y) / 2, { steps: 4 });
  await page.mouse.move(g.x + g.width / 2, first.y + 4, { steps: 4 });
  await page.mouse.up();
  await poll(async () => (await order())[0] === 'Question of type numeric', { message: 'drag move' });
  assert.deepEqual(await order(), ['Question of type numeric', 'Question of type truefalse', 'Question of type mcq']);
  // preview as a student with a fake email
  await page.locator(tid('builder-preview-toggle')).click();
  await page.locator(tid('builder-preview')).waitFor();
  assert.equal(await page.locator(tid('preview-card')).count(), 3);
  await page.locator(tid('preview-email')).fill('grace@example.org');
  await poll(async () => /grace@example\.org\|SHELL1/.test(await page.locator(tid('preview-seed')).textContent()), { message: 'seed follows the email' });
  await page.locator(tid('builder-preview-toggle')).click();
  await page.locator(tid('question-editor')).first().waitFor();
  assert.ok(await noHorizontalScroll(page));
}));

test('grading split view: J/K move between students, digits set points, saved pop', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  backend(s); await withKey(s);
  await unlockAdmin(page, url, { path: PATH });
  await page.locator(tid('tab-grading')).click();
  await page.locator(tid('grading-row')).first().waitFor();
  await page.locator(tid('grading-row')).first().click();
  await page.locator(tid('grading-split')).waitFor();
  const current = () => page.locator(`${tid('grading-split-row')}[aria-current="true"]`).getAttribute('data-id');
  assert.equal(await current(), 's1');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('j');
  await poll(async () => (await current()) === 's2', { message: 'J goes to next student' });
  await page.keyboard.press('k');
  await poll(async () => (await current()) === 's1', { message: 'K goes back' });
  // a digit sets the points of the question just touched; typing in a box is left alone
  await page.locator(tid('points-q2')).focus();
  await page.locator('h3.adm-h3').first().click();
  await page.keyboard.press('3');
  await poll(async () => (await page.locator(tid('points-q2')).inputValue()) === '3', { message: 'digit sets points' });
  await waitText(page.locator(tid('grade-total')), /^4 \/ 5/);
  s.onGas = (body) => (body.action === 'saveGrade'
    ? { result: 'success', grade: { status: 'Graded', final_score: 4, score_total: 5, final_percentage: 80, grades: body.grades, graded_at: new Date().toISOString() } }
    : null);
  await page.locator(tid('save-grade')).click();
  await page.locator(tid('grade-saved')).waitFor();
  assert.equal(s.gas.filter((b) => b.action === 'saveGrade').length, 1);
}));

test('no horizontal scroll at 360, 768 and 1366 px', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  backend(s); await withKey(s);
  await unlockAdmin(page, url, { path: PATH });
  for (const width of [360, 768, 1366]) {
    await page.setViewportSize({ width, height: 800 });
    for (const tab of ['dashboard', 'library', 'builder', 'grading', 'insights', 'settings']) {
      await page.locator(`${tid('admin')}`).waitFor();
      if (width < 768) { await page.locator(tid('admin-nav-toggle')).click(); }
      await page.locator(tid(`tab-${tab}`)).click();
      await page.waitForTimeout(120);
      assert.ok(await noHorizontalScroll(page), `${tab} at ${width}px`);
    }
  }
}));
