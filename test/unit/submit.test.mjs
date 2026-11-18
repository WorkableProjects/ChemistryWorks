import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fake localStorage must exist before storage.js is used.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};

const { buildPayload, toNetlifyFields, submitResults, flushOutbox, flushOutboxResult, getOutbox, getLocalResults, isFinalError } = await import('../../js/lib/submit.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const GAS = 'https://script.google.com/macros/s/ABC/exec';
const PROD = 'myschool.netlify.app';

beforeEach(() => mem.clear());

const jsonReply = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });
// An ok reply to the Apps Script URL without a body counts as { result: 'success' }.
function recorder(handler = () => ({ ok: true, status: 200 })) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const res = await handler(String(url), init);
    if (String(url) !== '/' && res && res.ok && !res.json) return { ...res, json: async () => ({ result: 'success' }) };
    return res;
  };
  fn.calls = calls;
  return fn;
}
const gasFails = (url) => { if (url.startsWith('https://script.google.com')) throw new TypeError('network'); return { ok: true }; };

const grade = { scoreAchieved: 5, scoreTotal: 7, percentage: '71.43', results: [{ questionId: 'q1', isCorrect: true }] };
const base = () => buildPayload({
  test: { code: 'CHEM101', title: 'Foundations' }, grade, user: { name: 'Ada', email: 'ada@x.org' },
  startedAt: Date.parse('2025-03-01T10:00:00.000Z'), submittedAt: Date.parse('2025-03-01T10:12:30.600Z'),
  flags: { tab_switches: 3, auto_submitted: false, mode: 'scroll' },
});

test('buildPayload fields, ISO dates and duration rounding', () => {
  const p = base();
  assert.match(p.submission_id, /^[0-9a-f-]{20,}$/i);
  assert.equal(p.student_name, 'Ada');
  assert.equal(p.student_email, 'ada@x.org');
  assert.equal(p.test_code, 'CHEM101');
  assert.equal(p.test_title, 'Foundations');
  assert.equal(p.score_achieved, 5);
  assert.equal(p.score_total, 7);
  assert.equal(p.percentage, '71.43');
  assert.deepEqual(p.responses, grade.results);
  assert.equal(p.started_at, '2025-03-01T10:00:00.000Z');
  assert.equal(p.submitted_at, '2025-03-01T10:12:30.600Z');
  assert.equal(p.duration_seconds, 751); // 750.6 rounded
  assert.ok(Number.isInteger(p.duration_seconds));
  assert.deepEqual(p.flags, { tab_switches: 3, auto_submitted: false, mode: 'scroll' });
});

test('buildPayload ids are unique; defaults and Date inputs work; duration never negative', () => {
  assert.notEqual(base().submission_id, base().submission_id);
  const p = buildPayload({
    test: { code: 'A', title: 'T' }, grade, user: { name: 'n', email: 'e' },
    startedAt: new Date('2025-03-01T10:00:10Z'), submittedAt: new Date('2025-03-01T10:00:00Z'),
  });
  assert.equal(p.duration_seconds, 0);
  assert.deepEqual(p.flags, { tab_switches: 0, auto_submitted: false, mode: 'focus' });
});

test('toNetlifyFields keys exactly match the hidden form in index.html', () => {
  const html = fs.readFileSync(path.join(here, '../../index.html'), 'utf8');
  const form = html.match(/<form[^>]*data-netlify[^>]*>([\s\S]*?)<\/form>/)[1];
  const names = new Set([...form.matchAll(/<input[^>]*\sname="([^"]+)"/g)].map((m) => m[1]));
  names.delete('bot-field');
  const fields = toNetlifyFields(base());
  assert.deepEqual(new Set(Object.keys(fields)), names);
  assert.equal(fields['form-name'], 'chemistryworks-submissions');
  assert.ok(Object.values(fields).every((v) => typeof v === 'string'));
  assert.deepEqual(JSON.parse(fields.responses_json), grade.results);
  assert.equal(JSON.parse(fields.flags_json).mode, 'scroll');
  assert.equal(fields.score_achieved, '5');
  assert.equal(fields.duration_seconds, '751');
});

test('both channels succeed: correct requests, logged locally, not queued', async () => {
  const f = recorder();
  const p = base();
  const r = await submitResults(p, { config: { GAS_WEB_APP_URL: GAS, NETLIFY_FORMS: 'auto' }, fetchImpl: f, hostname: PROD });
  assert.deepEqual(r, { gas: 'sent', netlify: 'sent', queued: false });
  assert.equal(f.calls.length, 2);
  const gas = f.calls.find((c) => c.url === GAS);
  assert.equal(gas.init.method, 'POST');
  assert.equal(gas.init.mode, undefined, 'normal CORS so the reply can be read');
  assert.equal(gas.init.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(gas.init.body), p);
  const nl = f.calls.find((c) => c.url === '/');
  assert.equal(nl.init.method, 'POST');
  assert.equal(nl.init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const params = new URLSearchParams(nl.init.body);
  assert.equal(params.get('form-name'), 'chemistryworks-submissions');
  assert.equal(params.get('submission_id'), p.submission_id);
  assert.deepEqual(JSON.parse(params.get('responses_json')), grade.results);
  assert.equal(getLocalResults().length, 1);
  assert.equal(getOutbox().length, 0);
});

test('channels run concurrently', async () => {
  let inflight = 0; let max = 0;
  const f = recorder(async () => { inflight++; max = Math.max(max, inflight); await new Promise((r) => setTimeout(r, 10)); inflight--; return { ok: true }; });
  await submitResults(base(), { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: f, hostname: PROD });
  assert.equal(max, 2);
});

test('GAS skipped without URL; Netlify skipped on localhost', async () => {
  let f = recorder();
  let r = await submitResults(base(), { config: { GAS_WEB_APP_URL: '' }, fetchImpl: f, hostname: 'localhost' });
  assert.deepEqual(r, { gas: 'skipped', netlify: 'skipped', queued: false });
  assert.equal(f.calls.length, 0);
  assert.equal(getLocalResults().length, 1);
  assert.equal(getOutbox().length, 0);

  f = recorder();
  r = await submitResults(base(), { config: { GAS_WEB_APP_URL: GAS, NETLIFY_FORMS: 'auto' }, fetchImpl: f, hostname: '127.0.0.1' });
  assert.deepEqual(r, { gas: 'sent', netlify: 'skipped', queued: false });
  assert.equal(f.calls.length, 1);

  f = recorder();
  r = await submitResults(base(), { config: { GAS_WEB_APP_URL: GAS, NETLIFY_FORMS: true }, fetchImpl: f, hostname: 'localhost' });
  assert.equal(r.netlify, 'sent');
});

test('Netlify non-ok response counts as failed; other channel keeps it from queueing', async () => {
  const f = recorder((url) => (url === '/' ? { ok: false, status: 500 } : { ok: true }));
  const r = await submitResults(base(), { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: f, hostname: PROD });
  assert.deepEqual(r, { gas: 'sent', netlify: 'failed', queued: false });
  assert.equal(getOutbox().length, 0);
});

test('all non-skipped channels failing queues the payload in the outbox', async () => {
  const f = recorder((url) => { throw new TypeError('offline'); });
  const p = base();
  const r = await submitResults(p, { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: f, hostname: PROD });
  assert.deepEqual(r, { gas: 'failed', netlify: 'failed', queued: true });
  assert.deepEqual(getOutbox().map((x) => x.submission_id), [p.submission_id]);
  assert.equal(getLocalResults().length, 1);
});

test('single remaining channel failing also queues', async () => {
  const r = await submitResults(base(), { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: recorder(gasFails), hostname: 'localhost' });
  assert.deepEqual(r, { gas: 'failed', netlify: 'skipped', queued: true });
});

test('submitResults never throws, even with broken fetch and storage', async () => {
  const r = await submitResults(base(), { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: recorder(() => { throw new Error('off'); }), hostname: PROD });
  assert.equal(r.queued, true);
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  try {
    const r2 = await submitResults(base(), { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: recorder(), hostname: PROD });
    assert.equal(r2.gas, 'sent');
  } finally {
    globalThis.localStorage = saved;
  }
});

test('resubmitting the same payload does not duplicate log or outbox entries', async () => {
  const p = base();
  const cfg = { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: recorder(() => { throw new Error('off'); }), hostname: 'localhost' };
  await submitResults(p, cfg);
  await submitResults(p, cfg);
  assert.equal(getOutbox().length, 1);
  assert.equal(getLocalResults().length, 1);
});

test('localResults is capped at 500, newest last', async () => {
  const cfg = { config: { GAS_WEB_APP_URL: '' }, fetchImpl: recorder(), hostname: 'localhost' };
  for (let i = 0; i < 503; i++) await submitResults({ ...base(), submission_id: `id-${i}` }, cfg);
  const list = getLocalResults();
  assert.equal(list.length, 500);
  assert.equal(list[0].submission_id, 'id-3');
  assert.equal(list.at(-1).submission_id, 'id-502');
});

test('flushOutbox resends with the same submission_id and removes successes', async () => {
  const a = { ...base(), submission_id: 'A' };
  const b = { ...base(), submission_id: 'B' };
  const off = { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: recorder(() => { throw new Error('off'); }), hostname: 'localhost' };
  await submitResults(a, off);
  await submitResults(b, off);
  assert.equal(getOutbox().length, 2);

  // Only B can be delivered now.
  const f = recorder((url, init) => { if (JSON.parse(init.body).submission_id === 'A') throw new Error('still off'); return { ok: true }; });
  const n = await flushOutbox({ config: { GAS_WEB_APP_URL: GAS }, fetchImpl: f, hostname: 'localhost' });
  assert.equal(n, 1);
  assert.deepEqual(getOutbox().map((x) => x.submission_id), ['A']);
  assert.deepEqual(f.calls.map((c) => JSON.parse(c.init.body).submission_id).sort(), ['A', 'B']);

  const n2 = await flushOutbox({ config: { GAS_WEB_APP_URL: GAS }, fetchImpl: recorder(), hostname: 'localhost' });
  assert.equal(n2, 1);
  assert.equal(getOutbox().length, 0);
});

test('flushOutbox succeeds when at least one channel works; empty outbox is a no-op', async () => {
  assert.equal(await flushOutbox({ config: { GAS_WEB_APP_URL: GAS }, fetchImpl: recorder(), hostname: PROD }), 0);
  const off = { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: recorder(() => { throw new Error('off'); }), hostname: PROD };
  await submitResults(base(), off);
  const f = recorder((url) => (url === '/' ? { ok: false } : { ok: true }));
  assert.equal(await flushOutbox({ config: { GAS_WEB_APP_URL: GAS }, fetchImpl: f, hostname: PROD }), 1);
  assert.equal(getOutbox().length, 0);
});

test('flushOutbox never throws and keeps entries when everything fails', async () => {
  await submitResults(base(), { config: { GAS_WEB_APP_URL: GAS }, fetchImpl: recorder(() => { throw new Error('off'); }), hostname: 'localhost' });
  const n = await flushOutbox({ config: { GAS_WEB_APP_URL: GAS }, fetchImpl: recorder(() => { throw new Error('off'); }), hostname: 'localhost' });
  assert.equal(n, 0);
  assert.equal(getOutbox().length, 1);
});

test('payload and Netlify fields flag submissions that need teacher grading', async () => {
  const { buildPayload: bp, toNetlifyFields: tn } = await import('../../js/lib/submit.js');
  const p = bp({ test: { code: 'T' }, grade: { pendingCount: 1, results: [] } });
  assert.equal(p.needs_grading, true);
  assert.equal(tn(p).needs_grading, 'true');
  assert.equal(bp({ test: { code: 'T' }, grade: { results: [] } }).needs_grading, false);
});

// ---- reply handling (Apps Script)
const cfg = { GAS_WEB_APP_URL: GAS };
const local = { hostname: 'localhost' };
const replying = (body) => recorder(() => jsonReply(body));

test('success reply: sent, not queued', async () => {
  const r = await submitResults(base(), { config: cfg, fetchImpl: replying({ result: 'success' }), ...local });
  assert.deepEqual(r, { gas: 'sent', netlify: 'skipped', queued: false });
});

test('duplicate success reply counts as sent', async () => {
  const r = await submitResults(base(), { config: cfg, fetchImpl: replying({ result: 'success', duplicate: true }), ...local });
  assert.equal(r.gas, 'sent');
  assert.equal(getOutbox().length, 0);
});

for (const code of ['closed', 'not_on_roster', 'single_submission', 'submission_too_large']) {
  test(`final error ${code}: reported, not queued, not logged as submitted`, async () => {
    const r = await submitResults(base(), { config: cfg, fetchImpl: replying({ result: 'error', error: code }), ...local });
    assert.equal(r.gas, 'final');
    assert.equal(r.finalError, code);
    assert.equal(r.queued, false);
    assert.equal(getOutbox().length, 0);
    assert.equal(getLocalResults().length, 0);
  });
}

for (const code of ['server_error', 'busy']) {
  test(`${code}: kept in the outbox with the same submission_id`, async () => {
    const p = base();
    const r = await submitResults(p, { config: cfg, fetchImpl: replying({ result: 'error', error: code }), ...local });
    assert.equal(r.gas, 'failed');
    assert.equal(r.queued, true);
    assert.deepEqual(getOutbox().map((x) => x.submission_id), [p.submission_id]);
  });
}

test('network error and non-JSON reply are queued', async () => {
  let r = await submitResults(base(), { config: cfg, fetchImpl: recorder(() => { throw new TypeError('offline'); }), ...local });
  assert.equal(r.queued, true);
  r = await submitResults(base(), { config: cfg, fetchImpl: recorder(() => ({ ok: true, json: async () => { throw new SyntaxError('html'); } })), ...local });
  assert.equal(r.queued, true);
  r = await submitResults(base(), { config: cfg, fetchImpl: recorder(() => ({ ok: false, status: 502 })), ...local });
  assert.equal(r.queued, true);
});

test('a reply that never arrives times out and is queued', async () => {
  const f = recorder(() => new Promise(() => {}));
  const t0 = Date.now();
  const r = await submitResults(base(), { config: cfg, fetchImpl: f, timeoutMs: 40, ...local });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(r.gas, 'failed');
  assert.equal(r.queued, true);
});

test('retry after a failure sends the same submission_id and clears the outbox', async () => {
  const p = base();
  await submitResults(p, { config: cfg, fetchImpl: replying({ result: 'error', error: 'busy' }), ...local });
  const f = replying({ result: 'success' });
  const out = await flushOutboxResult({ config: cfg, fetchImpl: f, ...local });
  assert.equal(out.sent, 1);
  assert.equal(JSON.parse(f.calls[0].init.body).submission_id, p.submission_id);
  assert.equal(getOutbox().length, 0);
  assert.equal(getLocalResults().length, 1);
});

test('flush: a final error removes the item and is reported; a retryable one stays', async () => {
  await submitResults({ ...base(), submission_id: 'A' }, { config: cfg, fetchImpl: replying({ result: 'error', error: 'busy' }), ...local });
  await submitResults({ ...base(), submission_id: 'B' }, { config: cfg, fetchImpl: replying({ result: 'error', error: 'busy' }), ...local });
  const f = recorder((url, init) => jsonReply(JSON.parse(init.body).submission_id === 'A' ? { result: 'error', error: 'closed' } : { result: 'error', error: 'server_error' }));
  const out = await flushOutboxResult({ config: cfg, fetchImpl: f, ...local });
  assert.deepEqual(out, { sent: 0, final: [{ submission_id: 'A', error: 'closed' }] });
  assert.deepEqual(getOutbox().map((x) => x.submission_id), ['B']);
});

test('invalid_token: one resend after a refresh is not possible without a Google user, so it waits in the outbox', async () => {
  const r = await submitResults(base(), { config: cfg, fetchImpl: replying({ result: 'error', error: 'invalid_token' }), ...local });
  assert.equal(r.gas, 'failed');
  assert.equal(r.queued, true);
});

test('isFinalError covers the contract list and missing_*', () => {
  for (const c of ['closed', 'not_open', 'not_on_roster', 'single_submission', 'submission_too_large', 'invalid_request', 'invalid_email', 'missing_code', 'unauthorized']) assert.equal(isFinalError(c), true, c);
  for (const c of ['server_error', 'busy', 'rate_limited', 'invalid_token', 'network']) assert.equal(isFinalError(c), false, c);
});
