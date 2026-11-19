// Offline and install: the first load caches the app; with the network off the landing and an opened test still work,
// answers save, and a submission waits in the outbox until the network is back. A new version shows the update toast.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { startEnv, newSession, tid, signIn, poll, waitAttr, waitText, activeCard, goNext, submit } from './helpers.mjs';
import { createServer } from '../../scripts/serve.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

/** Wait until the service worker controls the page (it claims clients once it has precached the shell). */
async function controlled(page) {
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
}

async function openDemoTest(page) {
  await signIn(page);
  await page.locator(tid('home-code-input')).fill('DEMOV4A');
  await page.locator(tid('home-code-submit')).click();
  await page.locator(tid('runner')).waitFor();
}

test('offline: landing and an opened test load, an answer saves, the submission sends when back online', { timeout: 90000 }, async () => {
  const s = await newSession(env, { serviceWorkers: 'allow' });
  const { page, context } = s;
  try {
    await page.goto(`${s.url}/`);
    await controlled(page);
    await openDemoTest(page);
    assert.ok(await page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('cw-shell-'))), 'shell cache exists');

    await context.setOffline(true);
    await page.goto(`${s.url}/?code=DEMOV4A`);
    await page.locator(tid('runner')).waitFor();
    await waitText(page.locator(tid('net-banner')), 'Offline — your answers are saved on this device');

    await activeCard(page).locator('[data-testid="multipart-part-a"] [data-testid="option-b"]').click();
    await page.reload();
    await page.locator(tid('runner')).waitFor();
    await poll(async () => (await page.locator(tid('toast')).allTextContents()).some((t) => /Your answers were restored/.test(t)), { message: 'answers restored offline' });

    for (let i = 0; i < 4; i++) await goNext(page);
    await submit(page);
    const status = page.locator(tid('submission-status'));
    await waitAttr(status, 'data-queued', 'true');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cw:outbox')).length), 1);
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('cw:outbox'))[0].submission_id);

    await context.setOffline(false);
    await page.locator(tid('retry-submit')).click();
    await poll(() => s.gas.some((b) => b && b.submission_id === id), { message: 'queued submission sent' });
    await waitAttr(status, 'data-queued', 'false');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cw:outbox')).length), 0);
  } finally {
    await s.close();
  }
});

test('a new version shows the update toast and reloads only when the student presses Reload', { timeout: 60000 }, async () => {
  // A wrapper server that can report a newer SITE_VERSION in sw-list.js, as a deploy would.
  const base = createServer();
  const state = { newer: false };
  const list = readFileSync(new URL('../../sw-list.js', import.meta.url), 'utf8');
  const server = http.createServer((req, res) => {
    if (state.newer && new URL(req.url, 'http://x').pathname === '/sw-list.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' });
      return res.end(list.replace(/"version": "[^"]*"/, '"version": "99.0.0"'));
    }
    return base.emit('request', req, res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const s = await newSession({ browser: env.browser, url: `http://127.0.0.1:${server.address().port}` }, { serviceWorkers: 'allow' });
  const { page } = s;
  try {
    await page.goto(`${s.url}/`);
    await controlled(page);
    assert.equal(await page.locator(tid('toast')).filter({ hasText: 'Update available' }).count(), 0, 'no toast on first install');
    await page.evaluate(() => { window.__stillHere = true; });

    state.newer = true;
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    const toast = page.locator(tid('toast')).filter({ hasText: 'Update available' });
    await toast.waitFor({ timeout: 15000 });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await page.evaluate(() => window.__stillHere), true, 'page was not reloaded by itself');
    assert.ok(await page.evaluate(async () => (await caches.keys()).includes('cw-shell-99.0.0')), 'new shell cache is ready');

    await toast.locator(tid('toast-action')).click();
    await page.waitForFunction(() => window.__stillHere === undefined, null, { timeout: 15000 });
    await page.locator(tid('demo-signin')).waitFor();
  } finally {
    await s.close();
    await new Promise((r) => server.close(r));
    server.closeAllConnections?.();
  }
});
