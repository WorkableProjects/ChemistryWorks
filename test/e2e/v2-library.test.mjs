import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, unlockAdmin, tid, waitText, noHorizontalScroll } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const withKey = (s) => s.context.addInitScript(() => sessionStorage.setItem('cw:adminKey', JSON.stringify('secret')));

test('library shows a completed-submission count on every test', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await withKey(s);
  s.onGas = (b) => {
    if (b.action === 'listTests') return { result: 'success', tests: [{ code: 'PUB1', title: 'Published one', updatedAt: '2026-01-01T00:00:00Z' }] };
    if (b.action === 'getSubmissionCounts') return { result: 'success', counts: { CHEM101: 2, CHEM102: 1 } };
    return null;
  };
  await unlockAdmin(page, url);
  await waitText(page.locator(tid('submission-count-CHEM101')), '2 submissions');
  await waitText(page.locator(tid('submission-count-CHEM102')), '1 submission');
  await waitText(page.locator(tid('submission-count-CHEM201')), '0 submissions');
  await waitText(page.locator(tid('submission-count-PUB1')), '0 submissions');
  const call = s.gas.find((b) => b.action === 'getSubmissionCounts');
  assert.equal(call.adminKey, 'secret');
}));

test('no counts are shown when the counts call fails', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await withKey(s);
  s.onGas = (b) => {
    if (b.action === 'listTests') return { result: 'success', tests: [] };
    if (b.action === 'getSubmissionCounts') return { result: 'error', error: 'unauthorized' };
    return null;
  };
  await unlockAdmin(page, url);
  await page.locator(tid('library-item-CHEM101')).waitFor();
  await page.locator(tid('library-published')).waitFor();
  assert.ok(s.gas.some((b) => b.action === 'getSubmissionCounts'));
  assert.equal(await page.locator('[data-testid^="submission-count-"]').count(), 0);
}));

test('no counts and no counts request without an admin key', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await unlockAdmin(page, url);
  await page.locator(tid('library-item-CHEM101')).waitFor();
  assert.equal(await page.locator('[data-testid^="submission-count-"]').count(), 0);
  assert.equal(s.gas.filter((b) => b.action === 'getSubmissionCounts').length, 0);
}));

test('at 390px the count wraps and the action buttons stay usable', () => withSession(env, { viewport: { width: 390, height: 800 } }, async (s) => {
  const { page, url } = s;
  await withKey(s);
  s.onGas = (b) => {
    if (b.action === 'listTests') return { result: 'success', tests: [] };
    if (b.action === 'getSubmissionCounts') return { result: 'success', counts: { CHEM101: 12 } };
    return null;
  };
  await unlockAdmin(page, url);
  await waitText(page.locator(tid('submission-count-CHEM101')), '12 submissions');
  const edit = page.locator(tid('edit-CHEM101'));
  await edit.scrollIntoViewIfNeeded();
  assert.ok(await edit.isVisible());
  const eb = await edit.boundingBox();
  const sb = await page.locator(tid('submission-count-CHEM101')).boundingBox();
  assert.ok(sb.y + sb.height <= eb.y + 1 || sb.x + sb.width <= eb.x + 1, `count overlaps edit button: ${JSON.stringify({ sb, eb })}`);
  assert.ok(await noHorizontalScroll(page));
  await edit.click();
  await page.locator(tid('builder')).waitFor();
}));
