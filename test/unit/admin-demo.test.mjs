import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mk = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; };
globalThis.localStorage = mk();
globalThis.sessionStorage = mk();

const { demoAdminAllowed } = await import('../../js/lib/admin-session.js');
const { CONFIG } = await import('../../js/config.js');

test('demo admin is allowed only when no Google client ID is set', () => {
  assert.equal(demoAdminAllowed({ GOOGLE_CLIENT_ID: '' }), true);
  assert.equal(demoAdminAllowed({}), true);
  assert.equal(demoAdminAllowed({ GOOGLE_CLIENT_ID: '123.apps.googleusercontent.com' }), false);
  assert.equal(demoAdminAllowed({ GOOGLE_CLIENT_ID: '123.apps.googleusercontent.com', ALLOW_DEMO_SIGNIN: true }), false);
});

test('the shipped config has a client ID, so the demo admin is off in production', () => {
  assert.equal(demoAdminAllowed(CONFIG), false);
});

test('there is no admin access code in the config or the app', () => {
  assert.equal('ADMIN_ACCESS_CODE' in CONFIG, false);
  const app = fs.readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /accessCodeGate|ADMIN_ACCESS_CODE|adminUnlocked|admin-use-code/);
});
