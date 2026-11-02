import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  startEnv, withSession, startTest, tid, poll, waitText, waitAttr, A, answerCHEM101, submit, unlockAdmin, goNext,
  ADMIN_CODE, STUDENT, addQuestion, signIn,
} from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

test('admin gate rejects a wrong code and accepts the right one', () => withSession(env, {}, async ({ page, url }) => {
  await page.goto(`${url}/?admin=true`);
  await page.locator(tid('admin-gate')).waitFor();
  await page.waitForTimeout(150); // let the landing view's delayed focus settle (see unlockAdmin)
  await page.locator(tid('admin-code-input')).fill('wrong-code');
  await page.locator(tid('admin-unlock')).click();
  await page.locator('[data-testid="admin-gate"] .field-error').waitFor();
  await waitText(page.locator('[data-testid="admin-gate"] .field-error'), /Incorrect access code/);
  assert.equal(await page.locator(tid('admin')).count(), 0);
  await page.locator(tid('admin-code-input')).fill(ADMIN_CODE);
  await page.locator(tid('admin-unlock')).click();
  await page.locator(tid('admin')).waitFor();
  // unlock persists for the session
  await page.goto(`${url}/?admin=true`);
  await page.locator(tid('admin')).waitFor();
  // lock returns to landing and re-gates
  await page.locator(tid('lock-admin')).click();
  await page.locator(tid('signin-card')).waitFor();
  await page.goto(`${url}/?admin=true`);
  await page.locator(tid('admin-gate')).waitFor();
}));

test('library lists CHEM101 and the new bank tests', () => withSession(env, {}, async ({ page, url }) => {
  await unlockAdmin(page, url);
  for (const code of ['CHEM101', 'CHEM102', 'CHEM110', 'CHEM201']) {
    await page.locator(tid(`library-item-${code}`)).first().waitFor();
  }
  const item = page.locator(`${tid('library-item-CHEM102')}[data-source="bundled"]`);
  const text = await item.textContent();
  assert.match(text, /Stoichiometry & the Mole/);
  assert.match(text, /10 questions/);
  assert.match(text, /21 pts/);
  assert.match(text, /30 min/);
  // preview a bundled test straight from the library
  await page.locator(tid('preview-CHEM110')).first().click();
  await page.locator(tid('preview-banner')).waitFor();
  await waitText(page.locator(tid('progress-text')), '0 of 10 answered');
  await page.locator(tid('exit-preview')).click();
  await page.locator(tid('admin')).waitFor();
}));

test('builder: create, validate, save draft, preview and submit without any network capture', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await unlockAdmin(page, url);
  await page.locator(tid('new-test')).click();
  await page.locator(tid('test-code')).waitFor();
  const errors = page.locator(tid('validation-errors'));
  assert.notEqual(await errors.getAttribute('data-count'), '0', 'empty test is invalid');

  await page.locator(tid('test-code')).fill('e2e-1');
  assert.equal(await page.locator(tid('test-code')).inputValue(), 'E2E-1');
  await page.locator(tid('test-title')).fill('E2E Builder Test');

  // MCQ
  await addQuestion(page, 'mcq');
  const q1 = page.locator(tid('question-editor')).nth(0);
  await q1.locator(tid('q-text')).fill('Which gas makes up most of air? $\\ce{N2}$');
  await q1.locator(tid('option-text-0')).fill('Oxygen');
  await q1.locator(tid('option-text-1')).fill('Nitrogen');
  await q1.locator(tid('option-text-2')).fill('Argon');
  await q1.locator(tid('option-text-3')).fill('Carbon dioxide');
  await q1.locator(tid('option-correct-1')).check();
  await q1.locator(tid('q-points')).fill('2');
  await q1.locator(tid('q-explanation')).fill('Air is about 78% nitrogen.');

  // Numeric
  await addQuestion(page, 'numeric');
  const q2 = page.locator(tid('question-editor')).nth(1);
  await q2.locator(tid('q-text')).fill('Molar mass of water?');
  await q2.locator(tid('numeric-answer')).fill('18.02');
  await q2.locator(tid('numeric-tolerance')).fill('0.1');
  await q2.locator(tid('numeric-unit')).fill('g/mol');

  await waitAttr(errors, 'data-count', '0');
  assert.equal(await page.locator(tid('question-editor')).count(), 2);

  // an invalid edit raises the error count and disables Save/Preview, fixing it clears it again
  await q2.locator(tid('numeric-answer')).fill('not a number');
  await waitAttr(errors, 'data-count', '1');
  assert.ok(await page.locator(tid('save-draft')).isDisabled());
  assert.ok(await page.locator(tid('preview-test')).isDisabled());
  await q2.locator(tid('numeric-answer')).fill('18.02');
  await waitAttr(errors, 'data-count', '0');

  await page.locator(tid('save-draft')).click();
  await waitText(page.locator(tid('toast')).last(), /Draft E2E-1 saved/);
  const drafts = await page.evaluate(() => JSON.parse(localStorage.getItem('cw:drafts')));
  assert.equal(drafts['E2E-1'].title, 'E2E Builder Test');
  assert.equal(drafts['E2E-1'].questions.length, 2);

  await page.locator(tid('preview-test')).click();
  await page.locator(tid('preview-banner')).waitFor();
  await waitText(page.locator(tid('progress-text')), '0 of 2 answered');
  await A.mcq(page, 'b');
  await goNext(page);
  await A.numeric(page, '18.02 g/mol');
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('confirm-submit')).click();
  await page.locator(tid('results')).waitFor();
  await waitText(page.locator(tid('score-percentage')), '100.00%');
  await waitText(page.locator(tid('score-points')), '3 / 3');
  await waitText(page.locator(tid('home-btn')), /Back to builder/);
  assert.equal(await page.locator(tid('submission-status')).getAttribute('data-gas'), 'none');
  await new Promise((r) => setTimeout(r, 300)); // give any stray request time to appear
  assert.equal(s.gas.length, 0, 'preview must not hit GAS');
  assert.equal(s.netlify.length, 0, 'preview must not hit Netlify');
  assert.equal(await page.evaluate(() => localStorage.getItem('cw:localResults')), null);

  // back to builder keeps the work
  await page.locator(tid('home-btn')).click();
  await page.locator(tid('admin')).waitFor();
  await page.locator(tid('tab-library')).click();
  await page.locator(`${tid('library-item-E2E-1')}[data-source="draft"]`).waitFor();
}));

test('builder: all six question types can be added and validated', () => withSession(env, {}, async ({ page, url }) => {
  await unlockAdmin(page, url);
  await page.locator(tid('new-test')).click();
  await page.locator(tid('test-code')).fill('SIXTYPES');
  await page.locator(tid('test-title')).fill('Six types');
  for (const type of ['mcq', 'multi', 'numeric', 'formula', 'truefalse', 'matching']) {
    await addQuestion(page, type);
  }
  assert.equal(await page.locator(tid('question-editor')).count(), 6);
  await waitAttr(page.locator(tid('validation-errors')), 'data-count', '0');
  // duplicate + delete
  await page.locator(tid('question-editor')).nth(0).locator(tid('q-duplicate')).click();
  await poll(async () => (await page.locator(tid('question-editor')).count()) === 7, { message: 'duplicated' });
  await page.locator(tid('question-editor')).nth(1).locator(tid('q-delete')).click();
  await page.locator(tid('confirm-action')).click();
  await poll(async () => (await page.locator(tid('question-editor')).count()) === 6, { message: 'deleted' });
  await waitAttr(page.locator(tid('validation-errors')), 'data-count', '0');
}));

test('builder JSON mode: edit + apply updates the title; invalid JSON shows an error', () => withSession(env, {}, async ({ page, url }) => {
  await unlockAdmin(page, url);
  await page.locator(`${tid('edit-CHEM101')}`).first().click();
  await page.locator(tid('test-code')).waitFor();
  assert.equal(await page.locator(tid('test-code')).inputValue(), 'CHEM101');

  await page.locator(tid('builder-mode-json')).click();
  const ta = page.locator(tid('json-textarea'));
  await ta.waitFor();
  const obj = JSON.parse(await ta.inputValue());
  assert.equal(obj.code, 'CHEM101');
  assert.equal(obj.questions.length, 7);
  obj.title = 'Edited via JSON';
  await ta.fill(JSON.stringify(obj, null, 2));
  await page.locator(tid('apply-json')).click();
  await waitText(page.locator(tid('toast')).last(), /JSON applied/);

  // invalid JSON
  await ta.fill('{ "code": "X", ');
  await page.locator(tid('apply-json')).click();
  const err = page.locator('.adm-json-card .field-error');
  await poll(async () => ((await err.textContent()) || '').trim().length > 0, { message: 'JSON error message' });
  // switching mode is refused while JSON is invalid
  await page.locator(tid('builder-mode-visual')).click();
  assert.equal(await page.locator(tid('json-textarea')).count(), 1);

  // fix and go back to visual mode
  await ta.fill(JSON.stringify(obj));
  await page.locator(tid('builder-mode-visual')).click();
  await page.locator(tid('test-title')).waitFor();
  assert.equal(await page.locator(tid('test-title')).inputValue(), 'Edited via JSON');
  await waitAttr(page.locator(tid('validation-errors')), 'data-count', '0');
}));

test('builder: importing a JSON file loads the test', () => withSession(env, {}, async ({ page, url }) => {
  await unlockAdmin(page, url);
  await page.locator(tid('tab-builder')).click();
  const test = { code: 'IMPORTED', title: 'Imported test', questions: [{ id: 'q1', type: 'truefalse', text: 'Imported?', correctAnswer: true }] };
  await page.locator(tid('import-json')).setInputFiles({ name: 'IMPORTED.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(test)) });
  await poll(async () => (await page.locator(tid('test-code')).inputValue()) === 'IMPORTED', { message: 'imported code' });
  assert.equal(await page.locator(tid('test-title')).inputValue(), 'Imported test');
  await waitAttr(page.locator(tid('validation-errors')), 'data-count', '0');
  // bad file
  await page.locator(tid('import-json')).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await waitText(page.locator(tid('toast')).last(), /Import failed/);
}));

test('library: duplicate a bundled test and delete the draft', () => withSession(env, {}, async ({ page, url }) => {
  await unlockAdmin(page, url);
  await page.locator(tid('duplicate-CHEM201')).first().click();
  await page.locator(tid('test-code')).waitFor();
  assert.equal(await page.locator(tid('test-code')).inputValue(), 'CHEM201_COPY');
  await page.locator(tid('save-draft')).click();
  await waitText(page.locator(tid('toast')).last(), /Draft CHEM201_COPY saved/);
  await page.locator(tid('tab-library')).click();
  await page.locator(`${tid('library-item-CHEM201_COPY')}[data-source="draft"]`).waitFor();
  await page.locator(tid('delete-CHEM201_COPY')).click();
  await page.locator(tid('confirm-action')).click();
  await page.locator(tid('library-item-CHEM201_COPY')).waitFor({ state: 'detached' });
}));

test('analytics: a real submission appears under "This device"; CSV export downloads', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await startTest(s);
  await answerCHEM101(page);
  await submit(page);
  await waitText(page.locator(tid('score-percentage')), '100.00%');

  await unlockAdmin(page, url);
  await page.locator(tid('tab-analytics')).click();
  assert.equal(await page.locator(tid('analytics-source')).inputValue(), 'device');
  await waitText(page.locator(tid('kpi-submissions')), '1');
  await waitText(page.locator(tid('kpi-average')), '100.0%');
  await waitText(page.locator(tid('kpi-median')), '100.0%');
  await waitText(page.locator(tid('kpi-high')), '100.0%');
  await waitText(page.locator(tid('kpi-low')), '100.0%');
  await page.locator(tid('histogram')).waitFor();
  await page.locator(tid('question-stats')).waitFor();
  const rows = page.locator(tid('result-row'));
  assert.equal(await rows.count(), 1);
  const rowText = await rows.first().textContent();
  assert.ok(rowText.includes(STUDENT.name) && rowText.includes(STUDENT.email) && rowText.includes('CHEM101'), rowText);
  assert.ok(rowText.includes('12 / 12'), rowText);
  assert.equal(await page.locator(tid('analytics-test-filter')).inputValue(), 'all');

  // search filters rows
  await page.locator(tid('results-search')).fill('nobody');
  await poll(async () => (await page.locator(tid('result-row')).count()) === 0, { message: 'search filters out' });
  await page.locator(tid('results-search')).fill('ada');
  await poll(async () => (await page.locator(tid('result-row')).count()) === 1, { message: 'search matches' });

  // row opens the submission modal
  await page.locator(tid('result-row')).first().click();
  await page.locator(tid('submission-modal')).waitFor();
  assert.match(await page.locator(tid('submission-modal')).textContent(), /Foundations|12 \/ 12/);
  await page.keyboard.press('Escape');
  await page.locator(tid('submission-modal')).waitFor({ state: 'detached' });

  // CSV export
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(tid('export-csv')).click()]);
  assert.match(download.suggestedFilename(), /^chemistryworks-results.*\.csv$/);
  const csv = await readFile(await download.path(), 'utf8');
  const lines = csv.split('\r\n');
  assert.match(lines[0], /^Timestamp,Submission ID,Student Name,Student Email,Test Code,Test Title/);
  assert.equal(lines.filter(Boolean).length, 2);
  assert.ok(lines[1].includes(STUDENT.email) && lines[1].includes('CHEM101'), lines[1]);
}));

test('analytics: empty state without submissions; sheet source disabled when no admin key', () => withSession(env, {}, async ({ page, url }) => {
  await unlockAdmin(page, url);
  await page.locator(tid('tab-analytics')).click();
  await page.locator(tid('analytics-empty')).waitFor();
  assert.equal(await page.locator('[data-testid="analytics-source"] option[value="sheet"]').evaluate((o) => o.disabled), true);
}));

test('settings: admin key can be saved; checklist renders; backend status shown', () => withSession(env, {}, async ({ page, url }) => {
  await unlockAdmin(page, url);
  await page.locator(tid('tab-settings')).click();
  await page.locator(tid('setup-checklist')).waitFor();
  assert.ok((await page.locator(`${tid('setup-checklist')} li`).count()) >= 4);
  await page.locator(tid('admin-key-input')).fill('secret-key');
  await page.locator(tid('save-admin-key')).click();
  await waitText(page.locator(tid('toast')).last(), /Admin key saved/);
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('cw:adminKey'))), 'secret-key');
  await page.locator(tid('ping-backend')).click();
  await page.locator(tid('backend-status')).waitFor();
  await poll(async () => !/Checking|Not checked/.test((await page.locator(tid('backend-status')).textContent()) || ''), { message: 'ping result' });
}));

test('library: "Copy student link" gives a one-click link that signs in and opens the test', () => withSession(env, {}, async ({ page, url }) => {
  await unlockAdmin(page, url);
  await page.locator(tid('tab-library')).click();
  await page.locator(tid('copy-link-CHEM101')).click();
  const toastText = await waitText(page.locator('.toast').last(), /Student link copied/);
  const link = toastText.match(/https?:\/\/\S+/)[0];
  assert.equal(link, `${url}/test?code=CHEM101`);

  await page.evaluate(() => sessionStorage.clear());
  await page.goto(link);
  await waitText(page.locator(`${tid('signin-card')} h2`), 'Sign in to begin CHEM101');
  await signIn(page);
  await page.locator(tid('runner')).waitFor();
}));
