import { test } from 'node:test';
import assert from 'node:assert/strict';

const mk = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
globalThis.localStorage = mk();
globalThis.sessionStorage = mk();

const { clientId, reportIdentity } = await import('../../js/lib/errors.js');

test('clientId is created once and reused', () => {
  const a = clientId();
  assert.match(a, /^[0-9a-z-]{8,64}$/i);
  assert.equal(clientId(), a);
  assert.equal(JSON.parse(localStorage.getItem('cw:clientId')), a);
});

test('reportIdentity always has a clientId and no token when signed out', () => {
  const id = reportIdentity();
  assert.equal(id.clientId, clientId());
  assert.equal('idToken' in id, false);
});
