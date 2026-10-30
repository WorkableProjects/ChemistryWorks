import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, signIn, landingReady, tid, waitText, STUDENT } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

test('unauthenticated visitor sees the sign-in card only', () => withSession(env, {}, async ({ page, url }) => {
  await page.goto(url + '/');
  await page.locator(tid('signin-card')).waitFor();
  assert.equal(await page.locator(tid('code-card')).count(), 0);
  assert.match(await page.locator(tid('signin-card')).textContent(), /Sign in with Google to Begin/);
}));

test('demo sign-in rejects a bad email and a missing name', () => withSession(env, {}, async ({ page, url }) => {
  await page.goto(url + '/');
  await landingReady(page);
  await page.locator(tid('demo-name')).fill('Ada');
  await page.locator(tid('demo-email')).fill('ada@localhost');
  await page.locator(tid('demo-signin')).click();
  await waitText(page.locator(tid('signin-error')), /valid email/i);
  assert.equal(await page.locator(tid('code-card')).count(), 0);

  await page.locator(tid('demo-name')).fill('');
  await page.locator(tid('demo-email')).fill('ada@example.org');
  await page.locator(tid('demo-signin')).click();
  await waitText(page.locator(tid('signin-error')), /name/i);
}));

test('sign in shows the code card and the user badge', () => withSession(env, {}, async ({ page, url }) => {
  await page.goto(url + '/');
  await signIn(page);
  await page.locator(tid('code-card')).waitFor();
  const badge = page.locator(tid('user-badge')).first();
  await badge.waitFor();
  const text = await badge.textContent();
  assert.ok(text.includes(STUDENT.name), text);
  assert.ok(text.includes(STUDENT.email), text);
  assert.equal(await page.locator(tid('signin-card')).count(), 0);
}));

test('unknown code shows code-error', () => withSession(env, {}, async ({ page, url }) => {
  await page.goto(url + '/');
  await signIn(page);
  await page.locator(tid('code-input')).fill('NOPE99');
  await page.locator(tid('code-submit')).click();
  await waitText(page.locator(tid('code-error')), /No test found with code .*NOPE99/);
  assert.equal(await page.locator(tid('runner')).count(), 0);
}));

test('empty code asks for a code', () => withSession(env, {}, async ({ page, url }) => {
  await page.goto(url + '/');
  await signIn(page);
  await page.locator(tid('code-input')).fill('   ');
  await page.locator(tid('code-submit')).click();
  await waitText(page.locator(tid('code-error')), /Enter the test code/);
}));

test('valid (lower-case) code opens the runner', () => withSession(env, {}, async ({ page, url }) => {
  await page.goto(url + '/');
  await signIn(page);
  await page.locator(tid('code-input')).fill('chem101');
  await page.locator(tid('code-submit')).click();
  await page.locator(tid('runner')).waitFor();
  await page.locator('[data-testid="question-card"].is-active').first().waitFor();
  await waitText(page.locator(tid('progress-text')), '0 of 7 answered');
}));

test('every bundled test opens from its code', () => withSession(env, {}, async ({ page, url }) => {
  await page.goto(url + '/');
  await signIn(page);
  for (const [code, n] of [['CHEM102', 10], ['CHEM110', 10], ['CHEM201', 10]]) {
    await page.locator(tid('code-input')).fill(code);
    await page.locator(tid('code-submit')).click();
    await page.locator(tid('runner')).waitFor();
    await waitText(page.locator(tid('progress-text')), `0 of ${n} answered`);
    await page.locator(tid('brand')).click();
    await page.locator(tid('code-card')).waitFor();
  }
}));

test('?code= link: sign in first, then the runner opens directly', () => withSession(env, {}, async ({ page, url }) => {
  await page.goto(`${url}/?code=CHEM101`);
  await page.locator(tid('signin-card')).waitFor();
  const title = await page.locator(`${tid('signin-card')} .card__title`).textContent();
  assert.match(title, /CHEM101/);
  await signIn(page);
  await page.locator(tid('runner')).waitFor();
  assert.equal(await page.locator(tid('code-card')).count(), 0);
}));

test('sign out returns to the sign-in card', () => withSession(env, {}, async ({ page, url }) => {
  await page.goto(url + '/');
  await signIn(page);
  await page.locator(tid('code-card')).waitFor();
  await page.locator(tid('sign-out')).click();
  await page.locator(tid('signin-card')).waitFor();
  assert.equal(await page.locator(tid('code-card')).count(), 0);
  await page.reload();
  await page.locator(tid('signin-card')).waitFor(); // session really cleared
}));
