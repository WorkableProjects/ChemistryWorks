// v4 end-to-end smoke test: one pass through every v4 surface (S00–S09) at desktop and phone sizes, in light and
// dark. Each surface has its own detailed tests; this file checks they hold together and log no browser errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  startEnv, withSession, tid, startTest, answerCHEM101, submit, noHorizontalScroll, unlockAdmin, landingReady, signIn, poll,
} from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const V4_TYPES = ['multipart', 'naming', 'dropdown', 'dimensional', 'nuclear', 'reaction', 'vsepr', 'datatable'];

test('landing: v4 brand, version label, settings popover, dark theme, no horizontal scroll on a phone', () => withSession(env, { viewport: { width: 360, height: 780 } }, async (s) => {
  const { page, url } = s;
  await page.goto(url + '/');
  await landingReady(page);
  await page.locator(tid('landing-logo')).waitFor();
  assert.equal(await page.locator(`${tid('landing-logo')} svg.brand-mark`).count(), 1, 'logo is the inline SVG mark');
  assert.equal(await page.title(), 'ChemistryWorks');
  await page.locator(tid('theme-toggle')).click();
  await page.locator(tid('theme-menu')).waitFor();
  await page.locator(tid('theme-dark')).click();
  await poll(async () => (await page.locator('html').getAttribute('data-theme')) === 'dark', { message: 'dark theme' });
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(11, 20, 36)');
  await page.keyboard.press('Escape');
  await signIn(page);
  await page.locator(tid('site-version')).waitFor();
  assert.match(await page.locator(tid('site-version')).innerText(), new RegExp(pkg.version.replace(/\./g, '\\.')));
  assert.ok(await noHorizontalScroll(page), 'no horizontal scroll at 360 px');
}));

test('student flow: navy header, runner bar, navigator rail, submit, results ring + summary', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  const headerBg = await page.locator('.app-header').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(headerBg, 'rgb(0, 34, 79)', 'navy header');
  await page.locator(tid('progress-bar')).waitFor();
  await answerCHEM101(page);
  await submit(page);
  await page.locator(tid('results-summary')).waitFor();
  await page.locator(tid('score-percentage')).waitFor();
  await poll(async () => /100/.test(await page.locator(tid('score-percentage')).innerText()), { message: 'score counts up to 100%' });
  assert.ok(await noHorizontalScroll(page));
}));

test('student flow on a phone: bottom-sheet navigator and results without horizontal scroll', () => withSession(env, { viewport: { width: 390, height: 844 } }, async (s) => {
  const { page } = s;
  await startTest(s);
  assert.ok(await noHorizontalScroll(page), 'runner fits at 390 px');
  await answerCHEM101(page);
  await submit(page);
  await page.locator(tid('results-summary')).waitFor();
  assert.ok(await noHorizontalScroll(page), 'results fit at 390 px');
}));

test('admin: tabs incl. Insights, every v4 question type in the builder picker, version-check never blocks', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  s.onGas = (b) => (b.action === 'getResults' ? { result: 'success', rows: [] } : null);
  await unlockAdmin(page, url);
  for (const t of ['library', 'builder', 'grading', 'insights', 'settings']) assert.equal(await page.locator(tid(`tab-${t}`)).count(), 1, `tab ${t}`);
  await page.locator(tid('tab-insights')).click();
  await page.locator(tid('insights')).waitFor();
  await page.locator(tid('tab-builder')).click();
  await page.locator(tid('add-question')).click();
  for (const t of V4_TYPES) assert.equal(await page.locator(tid(`add-question-${t}`)).count(), 1, `picker offers ${t}`);
}));

test('v4 question-type demo tests validate and open in the runner', () => withSession(env, {}, async (s) => {
  for (const code of ['DEMOV4A', 'DEMOV4B']) {
    const file = `data/tests/${code}.json`;
    if (!fs.existsSync(file)) continue; // added by S08 / S09
    s.serveTest(code, JSON.parse(fs.readFileSync(file, 'utf8')));
    s.onGas = (b) => (b.action === 'getStudentStatus' ? { result: 'success', submitted: false, blocking: false, attempts: 0, latest: null, others: [] } : null);
    await startTest(s, code);
    await s.page.locator(tid('question-card')).first().waitFor();
    assert.equal(await s.page.locator('.q-card :text("Unsupported question type")').count(), 0, `${code}: every type has a widget`);
  }
}));
