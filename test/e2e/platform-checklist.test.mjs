import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, tid, unlockAdmin } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const PATH = '/?admin=true';
const withKey = (s) => s.context.addInitScript(() => { try { sessionStorage.setItem('cw:adminKey', JSON.stringify('secret')); } catch { /* ignore */ } });

test('settings: Check setup shows ticks and hints from diag', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  s.onGas = (body) => {
    if (body.action === 'diag') {
      return { result: 'success', version: '5.0.0', sheets: [], timings: {}, lastPrune: null, checklist: [
        { id: 'clientId', label: 'GOOGLE_CLIENT_ID script property is set', ok: true, hint: '' },
        { id: 'owner', label: 'Admins sheet has an owner', ok: false, hint: 'Add a row to the Admins sheet.' },
      ] };
    }
    if (body.action === 'getSettings') return { result: 'success', settings: { errorReports: false, releaseEmails: false } };
    if (body.action === 'listTests') return { result: 'success', tests: [] };
    return null;
  };
  await withKey(s);
  await unlockAdmin(page, url, { path: PATH, dashboard: true });
  await page.locator(tid('tab-settings')).click();
  await page.locator(tid('checklist-show')).click();
  const ok = page.locator(tid('check-clientId'));
  const todo = page.locator(tid('check-owner'));
  await ok.waitFor();
  assert.equal(await ok.getAttribute('data-ok'), 'true');
  assert.equal(await todo.getAttribute('data-ok'), 'false');
  assert.match(await ok.textContent(), /Done: GOOGLE_CLIENT_ID/);
  assert.match(await todo.textContent(), /To do: Admins sheet has an owner/);
  assert.match(await todo.textContent(), /Add a row to the Admins sheet/);
  assert.deepEqual(s.errors, []);
}));
