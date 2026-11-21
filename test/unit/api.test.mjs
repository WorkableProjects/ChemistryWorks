import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pingBackend, fetchPublishedTest, publishTest, listPublishedTests, deletePublishedTest, fetchResults, getResultsSince,
} from '../../js/lib/api.js';

const GAS = 'https://script.google.com/macros/s/ABC/exec';

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(url, init);
  };
  fn.calls = calls;
  return fn;
}
const okJson = (obj) => async () => ({ ok: true, status: 200, json: async () => obj });
const failing = () => { throw new TypeError('Failed to fetch'); };

test('pingBackend: GET ?action=ping, returns version', async () => {
  const f = fakeFetch(okJson({ result: 'success', version: '1.2.3' }));
  assert.deepEqual(await pingBackend({ gasUrl: GAS, fetchImpl: f }), { ok: true, version: '1.2.3' });
  assert.equal(f.calls[0].url, `${GAS}?action=ping`);
  assert.equal(f.calls[0].init.method, 'GET');
});

test('pingBackend: network failure, bad status, bad json, missing url never throw', async () => {
  assert.equal((await pingBackend({ gasUrl: GAS, fetchImpl: fakeFetch(failing) })).ok, false);
  assert.match((await pingBackend({ gasUrl: GAS, fetchImpl: fakeFetch(async () => ({ ok: false, status: 500 })) })).error, /500/);
  const badJson = fakeFetch(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }));
  assert.equal((await pingBackend({ gasUrl: GAS, fetchImpl: badJson })).ok, false);
  assert.equal((await pingBackend({ gasUrl: '', fetchImpl: fakeFetch(okJson({})) })).ok, false);
  const err = await pingBackend({ gasUrl: GAS, fetchImpl: fakeFetch(okJson({ result: 'error', error: 'boom' })) });
  assert.deepEqual(err, { ok: false, error: 'boom' });
});

test('fetchPublishedTest: GET with encoded code; null on not found or failure', async () => {
  const t = { code: 'A B', title: 'T', questions: [] };
  const f = fakeFetch(okJson({ result: 'success', test: t }));
  assert.deepEqual(await fetchPublishedTest('A B', { gasUrl: GAS, fetchImpl: f }), t);
  const u = new URL(f.calls[0].url);
  assert.equal(u.searchParams.get('action'), 'getTest');
  assert.equal(u.searchParams.get('code'), 'A B');
  assert.equal(await fetchPublishedTest('X', { gasUrl: GAS, fetchImpl: fakeFetch(okJson({ result: 'error', error: 'not_found' })) }), null);
  assert.equal(await fetchPublishedTest('X', { gasUrl: GAS, fetchImpl: fakeFetch(failing) }), null);
  assert.equal(await fetchPublishedTest('X', { gasUrl: '', fetchImpl: fakeFetch(okJson({})) }), null);
});

test('GET preserves an existing query string on gasUrl', async () => {
  const f = fakeFetch(okJson({ result: 'success' }));
  await pingBackend({ gasUrl: `${GAS}?authuser=0`, fetchImpl: f });
  const u = new URL(f.calls[0].url);
  assert.equal(u.searchParams.get('authuser'), '0');
  assert.equal(u.searchParams.get('action'), 'ping');
});

test('publishTest: POST text/plain JSON body', async () => {
  const f = fakeFetch(okJson({ result: 'success' }));
  const test_ = { code: 'C1', title: 'T', questions: [{ id: 'q1' }] };
  assert.deepEqual(await publishTest(test_, { gasUrl: GAS, adminKey: 'k', fetchImpl: f }), { ok: true, tags: [] });
  const { url, init } = f.calls[0];
  assert.equal(url, GAS);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(init.body), { action: 'publishTest', adminKey: 'k', test: test_ });
});

test('publishTest: sends tagDefs and returns the reply tags', async () => {
  const tags = [{ id: 'tg_abc123', ownerEmail: 'a@x.org', name: 'Ions', color: 'blue', description: '', applied: 'created' }];
  const f = fakeFetch(okJson({ result: 'success', tags }));
  const defs = [{ id: 'tg_abc123', name: 'Ions', color: 'blue', description: '' }];
  assert.deepEqual(await publishTest({ code: 'C1' }, { gasUrl: GAS, adminKey: 'k', tagDefs: defs, fetchImpl: f }), { ok: true, tags });
  assert.deepEqual(JSON.parse(f.calls[0].init.body).tagDefs, defs);
});

test('publishTest: no tagDefs key when none are given; unknown_tag keeps its ids', async () => {
  const f = fakeFetch(okJson({ result: 'success' }));
  await publishTest({ code: 'C1' }, { gasUrl: GAS, adminKey: 'k', fetchImpl: f });
  assert.equal('tagDefs' in JSON.parse(f.calls[0].init.body), false);
  const bad = fakeFetch(okJson({ result: 'error', error: 'unknown_tag', ids: ['tg_zzzzzz'] }));
  assert.deepEqual(await publishTest({}, { gasUrl: GAS, adminKey: 'k', tagDefs: [], fetchImpl: bad }), { ok: false, error: 'unknown_tag', ids: ['tg_zzzzzz'] });
});

test('publishTest: server error and network failure', async () => {
  const unauthorized = fakeFetch(okJson({ result: 'error', error: 'unauthorized' }));
  assert.deepEqual(await publishTest({}, { gasUrl: GAS, adminKey: 'bad', fetchImpl: unauthorized }), { ok: false, error: 'unauthorized' });
  const r = await publishTest({}, { gasUrl: GAS, adminKey: 'k', fetchImpl: fakeFetch(failing) });
  assert.equal(r.ok, false);
  assert.match(r.error, /Failed to fetch/);
});

test('listPublishedTests', async () => {
  const tests = [{ code: 'A', title: 'a', updatedAt: '2025-01-01T00:00:00.000Z' }];
  const f = fakeFetch(okJson({ result: 'success', tests }));
  assert.deepEqual(await listPublishedTests({ gasUrl: GAS, adminKey: 'k', fetchImpl: f }), { ok: true, tests });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { action: 'listTests', adminKey: 'k' });
  const bad = await listPublishedTests({ gasUrl: GAS, adminKey: 'k', fetchImpl: fakeFetch(okJson({ result: 'error', error: 'admin_key_not_configured' })) });
  assert.deepEqual(bad, { ok: false, tests: [], error: 'admin_key_not_configured' });
  assert.deepEqual((await listPublishedTests({ gasUrl: GAS, adminKey: 'k', fetchImpl: fakeFetch(failing) })).tests, []);
});

test('deletePublishedTest', async () => {
  const f = fakeFetch(okJson({ result: 'success' }));
  assert.deepEqual(await deletePublishedTest('C1', { gasUrl: GAS, adminKey: 'k', fetchImpl: f }), { ok: true });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { action: 'deleteTest', adminKey: 'k', code: 'C1' });
  assert.equal((await deletePublishedTest('C1', { gasUrl: GAS, adminKey: 'k', fetchImpl: fakeFetch(okJson({ result: 'error', error: 'not_found' })) })).error, 'not_found');
});

test('getResultsSince asks for the answers, so grading and the data view get them', async () => {
  const f = fakeFetch(okJson({ result: 'success', rows: [], now: 5 }));
  await getResultsSince({ gasUrl: GAS, adminKey: 'k', since: 3, fetchImpl: f });
  assert.equal(JSON.parse(f.calls[0].init.body).includeAnswers, true);
});

test('fetchResults: with and without testCode', async () => {
  const rows = [{ submission_id: 's1', percentage: 50 }];
  const f = fakeFetch(okJson({ result: 'success', rows }));
  assert.deepEqual(await fetchResults({ gasUrl: GAS, adminKey: 'k', testCode: 'C1', fetchImpl: f }), { ok: true, rows });
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { action: 'getResults', adminKey: 'k', testCode: 'C1', includeAnswers: true });
  await fetchResults({ gasUrl: GAS, adminKey: 'k', fetchImpl: f });
  assert.deepEqual(JSON.parse(f.calls[1].init.body), { action: 'getResults', adminKey: 'k', includeAnswers: true });
  const fail = await fetchResults({ gasUrl: GAS, adminKey: 'k', fetchImpl: fakeFetch(failing) });
  assert.equal(fail.ok, false);
  assert.deepEqual(fail.rows, []);
});
