// V4-07 client: semver compare (version check), admin-session helpers, api.js admin auth merge + token retry.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// sessionStorage polyfill, seeded with a signed-in Google user, before the modules read it.
const store = new Map();
globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const setKey = (k, v) => store.set(`cw:${k}`, JSON.stringify(v));
const future = Math.floor(Date.now() / 1000) + 3600;
setKey('user', { name: 'Ada', email: 'Ada@School.org', picture: null, provider: 'google', idToken: 'tok-1', idTokenExp: future });

const { compareVersions, parseVersion, isBackendOutdated, checkBackendVersion } = await import('../../js/lib/version-check.js');
const session = await import('../../js/lib/admin-session.js');
const api = await import('../../js/lib/api.js');

const GAS = 'https://script.example/exec';
const okJson = (d) => ({ ok: true, json: async () => d });
const recorder = (...replies) => {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, body: init?.body ? JSON.parse(init.body) : null }); return okJson(replies[Math.min(calls.length - 1, replies.length - 1)]); };
  f.calls = calls;
  return f;
};

test('semver compare', () => {
  assert.deepEqual(parseVersion('v4.1.2'), [4, 1, 2]);
  assert.deepEqual(parseVersion('4'), [4, 0, 0]);
  assert.equal(parseVersion('abc'), null);
  assert.equal(compareVersions('3.0.0', '4.0.0'), -1);
  assert.equal(compareVersions('4.0.0', '4.0.0'), 0);
  assert.equal(compareVersions('4.10.0', '4.9.9'), 1);
  assert.equal(compareVersions('4.0.1', '4.0.0'), 1);
  assert.equal(compareVersions('', '4.0.0'), null);
  assert.equal(isBackendOutdated('3.0.0', '4.0.0'), true);
  assert.equal(isBackendOutdated('4.0.0', '4.0.0'), false);
  assert.equal(isBackendOutdated('5.0.0', '4.0.0'), false);
  assert.equal(isBackendOutdated('', '4.0.0'), false, 'unknown version never shows a banner');
});

test('checkBackendVersion: outdated, current, failed ping', async () => {
  const ping = (v) => async () => v;
  assert.equal((await checkBackendVersion({ gasUrl: GAS, siteVersion: '4.0.0', ping: ping({ ok: true, version: '3.0.0' }) })).outdated, true);
  assert.equal((await checkBackendVersion({ gasUrl: GAS, siteVersion: '4.0.0', ping: ping({ ok: true, version: '4.0.0' }) })).outdated, false);
  assert.equal((await checkBackendVersion({ gasUrl: GAS, siteVersion: '4.0.0', ping: ping({ ok: false, error: 'x' }) })).outdated, false);
  assert.equal((await checkBackendVersion({ gasUrl: GAS, siteVersion: '4.0.0', ping: async () => { throw new Error('boom'); } })).outdated, false);
  assert.equal((await checkBackendVersion({ gasUrl: '', siteVersion: '4.0.0' })).outdated, false);
});

test('admin-session: key only', () => {
  store.delete('cw:adminConfirmed');
  setKey('adminKey', 'k1');
  assert.equal(session.hasAdminAuth(), true);
  assert.deepEqual(session.adminRequestAuth(), { adminKey: 'k1' });
  store.delete('cw:adminKey');
  assert.equal(session.hasAdminAuth(), false);
  assert.deepEqual(session.adminRequestAuth(), {});
});

test('admin-session: confirmed Google admin needs a matching signed-in user and a token', () => {
  session.setAdminConfirmed('ada@school.org');
  assert.equal(session.hasAdminAuth(), true);
  assert.deepEqual(session.adminRequestAuth(), { idToken: 'tok-1' });
  setKey('adminKey', 'k1');
  assert.deepEqual(session.adminRequestAuth(), { idToken: 'tok-1', adminKey: 'k1' });
  store.delete('cw:adminKey');
  // a different confirmed email does not match the signed-in user
  session.setAdminConfirmed('someone-else@school.org');
  assert.equal(session.hasAdminAuth(), false);
  assert.deepEqual(session.adminRequestAuth(), {});
  session.clearAdminConfirmed();
  assert.equal(session.hasAdminAuth(), false);
});

test('api: admin calls merge adminRequestAuth; explicit adminKey wins', async () => {
  session.setAdminConfirmed('ada@school.org');
  setKey('adminKey', 'stored');
  const f = recorder({ result: 'success', tests: [] });
  await api.listPublishedTests({ gasUrl: GAS, fetchImpl: f });
  assert.deepEqual(f.calls[0].body, { action: 'listTests', idToken: 'tok-1', adminKey: 'stored' });
  await api.listPublishedTests({ gasUrl: GAS, adminKey: 'explicit', fetchImpl: f });
  assert.equal(f.calls[1].body.adminKey, 'explicit');
  assert.equal(f.calls[1].body.idToken, 'tok-1');
  await api.fetchResults({ gasUrl: GAS, testCode: 'C1', fetchImpl: f });
  assert.deepEqual(f.calls[2].body, { action: 'getResults', testCode: 'C1', idToken: 'tok-1', adminKey: 'stored' });
  await api.saveGrade({ gasUrl: GAS, submissionId: 's', grades: {}, fetchImpl: f });
  assert.equal(f.calls[3].body.idToken, 'tok-1');
  store.delete('cw:adminKey');
  session.clearAdminConfirmed();
  await api.listPublishedTests({ gasUrl: GAS, fetchImpl: f });
  assert.deepEqual(f.calls[4].body, { action: 'listTests' });
});

test('api: whoAmI / listAdmins / saveAdmin / removeAdmin / getLog shapes', async () => {
  const who = await api.whoAmI({ gasUrl: GAS, idToken: 'tok-x', fetchImpl: recorder({ result: 'success', email: 'a@x.org', role: 'owner', via: 'google' }) });
  assert.deepEqual(who, { ok: true, email: 'a@x.org', role: 'owner', via: 'google' });
  const f = recorder({ result: 'success' });
  await api.whoAmI({ gasUrl: GAS, idToken: 'tok-x', fetchImpl: f });
  assert.deepEqual(f.calls[0].body, { action: 'whoami', idToken: 'tok-x' });
  assert.deepEqual(await api.whoAmI({ gasUrl: GAS, idToken: 't', fetchImpl: recorder({ result: 'error', error: 'not_admin' }) }), { ok: false, error: 'not_admin' });
  assert.deepEqual(await api.listAdmins({ gasUrl: GAS, adminKey: 'k', fetchImpl: recorder({ result: 'success', admins: [{ email: 'a@x.org' }] }) }), { ok: true, admins: [{ email: 'a@x.org' }] });
  const g = recorder({ result: 'success', email: 'n@x.org', role: 'admin', updated: false });
  assert.deepEqual(await api.saveAdmin({ gasUrl: GAS, adminKey: 'k', email: 'n@x.org', fetchImpl: g }), { ok: true, email: 'n@x.org', role: 'admin', updated: false });
  assert.deepEqual(g.calls[0].body, { action: 'saveAdmin', email: 'n@x.org', role: 'admin', adminKey: 'k' });
  assert.deepEqual(await api.removeAdmin({ gasUrl: GAS, adminKey: 'k', email: 'n@x.org', fetchImpl: recorder({ result: 'error', error: 'last_owner' }) }), { ok: false, error: 'last_owner' });
  const l = recorder({ result: 'success', rows: [{ action: 'publishTest' }] });
  assert.deepEqual(await api.getLog({ gasUrl: GAS, adminKey: 'k', fetchImpl: l }), { ok: true, rows: [{ action: 'publishTest' }] });
  assert.equal(l.calls[0].body.limit, 100);
  assert.equal((await api.getLog({ gasUrl: GAS, adminKey: 'k', fetchImpl: async () => { throw new Error('net'); } })).ok, false);
});

test('api: invalid_token with no refreshable token is returned as an error (no password prompt, no loop)', async () => {
  session.setAdminConfirmed('ada@school.org');
  const f = recorder({ result: 'error', error: 'invalid_token' });
  const r = await api.listPublishedTests({ gasUrl: GAS, fetchImpl: f });
  assert.deepEqual(r, { ok: false, tests: [], error: 'invalid_token' });
  assert.ok(f.calls.length <= 2);
  session.clearAdminConfirmed();
});
