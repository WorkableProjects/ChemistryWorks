import { test } from 'node:test';
import assert from 'node:assert/strict';

// auth.js reads the signed-in user from sessionStorage when it loads, so the fake must exist first.
const mk = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
globalThis.localStorage = mk();
globalThis.sessionStorage = mk();
const exp = Math.floor(Date.now() / 1000) + 3600;
globalThis.sessionStorage.setItem('cw:user', JSON.stringify({ name: 'Ada', email: 'ada@x.org', provider: 'google', idToken: 'tok-1', idTokenExp: exp }));

const { submitResults, getOutbox, buildPayload } = await import('../../js/lib/submit.js');
const GAS = 'https://script.google.com/macros/s/ABC/exec';
const payload = () => buildPayload({ test: { code: 'CHEM101', title: 'T' }, grade: { results: [] }, user: { name: 'Ada', email: 'ada@x.org' } });
const reply = (body) => async () => ({ ok: true, json: async () => body });

test('the ID token is sent at send time and never stored in the outbox', async () => {
  const bodies = [];
  const f = async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ result: 'error', error: 'busy' }) }; };
  await submitResults(payload(), { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: f, hostname: 'localhost' });
  assert.equal(bodies[0].idToken, 'tok-1');
  assert.equal(getOutbox().length, 1);
  assert.ok(getOutbox().every((p) => !('idToken' in p)));
});

test('invalid_token stays queued when no fresh token arrives', async () => {
  let n = 0;
  const f = async () => { n++; return { ok: true, json: async () => ({ result: 'error', error: 'invalid_token' }) }; };
  const r = await submitResults(payload(), { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: f, hostname: 'localhost' });
  assert.equal(r.queued, true);
  assert.ok(n >= 1 && n <= 2);
});

test('a success reply is read', async () => {
  const r = await submitResults(payload(), { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: reply({ result: 'success' }), hostname: 'localhost' });
  assert.equal(r.gas, 'sent');
});
