// Boot smoke test: the app must load, log no browser errors and leave the boot loader within 5 s.
// Catches the "stuck on loading" class of bug (5.0.0) before anything else runs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startEnv, newSession, tid, signIn } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

async function bootCase(path, { afterBoot, config } = {}) {
  const s = await newSession(env, { config });
  try {
    s.serveTest('DEMOV5', JSON.parse(fs.readFileSync('data/tests/DEMOV5.json', 'utf8')));
    await s.page.goto(s.url + path);
    await s.page.locator('.boot').waitFor({ state: 'detached', timeout: 5000 });
    if (afterBoot) await afterBoot(s);
    assert.deepEqual(s.errors, [], `Browser errors:\n${s.errors.join('\n')}`);
  } finally {
    await s.close();
  }
}

test('boot: landing view loads', { timeout: 10000 }, () => bootCase('/', {
  afterBoot: (s) => s.page.locator(tid('demo-signin')).waitFor({ timeout: 5000 }),
}));

test('boot: admin panel opens with the demo admin when Google is not configured', { timeout: 10000 }, () => bootCase('/?admin=true', {
  afterBoot: (s) => s.page.locator(tid('admin')).waitFor({ timeout: 5000 }),
}));

test('boot: admin gate loads when Google is configured', { timeout: 10000 }, () => bootCase('/?admin=true', {
  config: { GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', ALLOW_DEMO_SIGNIN: false },
  afterBoot: (s) => s.page.locator(tid('admin-gate')).waitFor({ timeout: 5000 }),
}));

test('boot: demo test opens after demo sign-in', { timeout: 10000 }, () => bootCase('/?code=DEMOV5', {
  afterBoot: async (s) => {
    await signIn(s.page);
    await s.page.locator(tid('runner')).waitFor({ timeout: 5000 });
    assert.equal(await s.page.locator('.boot').count(), 0, 'boot loader is gone');
  },
}));
