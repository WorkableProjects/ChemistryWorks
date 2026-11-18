import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveGrade, fetchSubmissionCounts, fetchFeedback } from '../../js/lib/api.js';

const GAS = 'https://script.google.com/macros/s/ABC/exec';

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url: String(url), init }); return handler(url, init); };
  fn.calls = calls;
  return fn;
}
const okJson = (obj) => async () => ({ ok: true, status: 200, json: async () => obj });
const failing = () => { throw new TypeError('Failed to fetch'); };
const body = (f) => JSON.parse(f.calls[0].init.body);

test('saveGrade: comments/release omitted when not provided', async () => {
  const f = fakeFetch(okJson({ result: 'success', grade: { final_score: 3 } }));
  const r = await saveGrade({ gasUrl: GAS, adminKey: 'k', submissionId: 's1', grades: { q1: 1 }, fetchImpl: f });
  assert.deepEqual(r, { ok: true, grade: { final_score: 3 }, row: null });
  const b = body(f);
  assert.equal(b.action, 'saveGrade');
  assert.equal(b.adminKey, 'k');
  assert.equal(b.submissionId, 's1');
  assert.deepEqual(b.grades, { q1: 1 });
  assert.equal('comments' in b, false);
  assert.equal('release' in b, false);
  assert.equal(f.calls[0].init.method, 'POST');
  assert.match(f.calls[0].init.headers['Content-Type'], /text\/plain/);
});

test('saveGrade: sends comments and release when provided (release false is sent)', async () => {
  const f = fakeFetch(okJson({ result: 'success' }));
  await saveGrade({ gasUrl: GAS, adminKey: 'k', submissionId: 's1', grades: {}, comments: { q1: 'nice' }, release: true, fetchImpl: f });
  assert.deepEqual(body(f).comments, { q1: 'nice' });
  assert.equal(body(f).release, true);
  const g = fakeFetch(okJson({ result: 'success' }));
  await saveGrade({ gasUrl: GAS, adminKey: 'k', submissionId: 's1', grades: {}, comments: {}, release: false, fetchImpl: g });
  assert.deepEqual(body(g).comments, {});
  assert.equal(body(g).release, false);
});

test('saveGrade: errors never throw', async () => {
  assert.deepEqual(await saveGrade({ gasUrl: GAS, fetchImpl: fakeFetch(okJson({ result: 'error', error: 'bad_key' })) }), { ok: false, error: 'bad_key' });
  assert.equal((await saveGrade({ gasUrl: GAS, fetchImpl: fakeFetch(failing) })).ok, false);
  assert.equal((await saveGrade({ gasUrl: '', fetchImpl: fakeFetch(okJson({})) })).ok, false);
});

test('fetchSubmissionCounts: ok shape', async () => {
  const f = fakeFetch(okJson({ result: 'success', counts: { CHEM101: 3, CHEMV2: 0 } }));
  assert.deepEqual(await fetchSubmissionCounts({ gasUrl: GAS, adminKey: 'k', fetchImpl: f }), { ok: true, counts: { CHEM101: 3, CHEMV2: 0 } });
  assert.deepEqual(body(f), { action: 'getSubmissionCounts', adminKey: 'k' });
});

test('fetchSubmissionCounts: error shapes', async () => {
  assert.deepEqual(await fetchSubmissionCounts({ gasUrl: GAS, fetchImpl: fakeFetch(okJson({ result: 'error', error: 'unauthorized' })) }), { ok: false, counts: {}, error: 'unauthorized' });
  const bad = await fetchSubmissionCounts({ gasUrl: GAS, fetchImpl: fakeFetch(okJson({ result: 'success' })) });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.counts, {});
  const out = await fetchSubmissionCounts({ gasUrl: GAS, fetchImpl: fakeFetch(okJson({ result: 'error', error: 'unknown_action' })) });
  assert.match(out.error, /out of date/);
  const net = await fetchSubmissionCounts({ gasUrl: GAS, fetchImpl: fakeFetch(failing) });
  assert.equal(net.ok, false);
  assert.deepEqual(net.counts, {});
  assert.equal((await fetchSubmissionCounts({ gasUrl: '' })).ok, false);
});

test('fetchFeedback: passes submissionId + studentEmail, no adminKey', async () => {
  const f = fakeFetch(okJson({ result: 'success', released: false }));
  const r = await fetchFeedback({ gasUrl: GAS, submissionId: 's1', studentEmail: 'a@b.co', adminKey: 'secret', fetchImpl: f });
  assert.deepEqual(r, { ok: true, released: false });
  assert.deepEqual(body(f), { action: 'getFeedback', submissionId: 's1', studentEmail: 'a@b.co' });
  assert.ok(!JSON.stringify(f.calls[0]).includes('secret'));
  assert.equal('adminKey' in body(f), false);
});

test('fetchFeedback: released true maps fields; result key dropped', async () => {
  const data = {
    result: 'success', released: true, released_at: '2026-01-01T00:00:00Z', status: 'graded', final_score: 5, score_total: 6,
    final_percentage: '83.33', grades: { q1: 2 }, comments: { q1: 'good' },
  };
  const r = await fetchFeedback({ gasUrl: GAS, submissionId: 's', studentEmail: 'e', fetchImpl: fakeFetch(okJson(data)) });
  assert.equal(r.ok, true);
  assert.equal(r.released, true);
  assert.equal(r.released_at, '2026-01-01T00:00:00Z');
  assert.deepEqual(r.grades, { q1: 2 });
  assert.deepEqual(r.comments, { q1: 'good' });
  assert.equal(r.final_score, 5);
  assert.equal('result' in r, false);
});

test('fetchFeedback: released must be exactly true; falsy/absent -> false', async () => {
  for (const released of [false, undefined, 'true', 1, null]) {
    const r = await fetchFeedback({ gasUrl: GAS, fetchImpl: fakeFetch(okJson({ result: 'success', released })) });
    assert.equal(r.ok, true);
    assert.equal(r.released, false, String(released));
  }
});

test('fetchFeedback: errors and network failure never throw', async () => {
  assert.deepEqual(await fetchFeedback({ gasUrl: GAS, fetchImpl: fakeFetch(okJson({ result: 'error', error: 'not_found' })) }), { ok: false, error: 'not_found' });
  const net = await fetchFeedback({ gasUrl: GAS, submissionId: 's', studentEmail: 'e', fetchImpl: fakeFetch(failing) });
  assert.equal(net.ok, false);
  assert.match(net.error, /Failed to fetch/);
  assert.equal((await fetchFeedback({ gasUrl: GAS, fetchImpl: fakeFetch(async () => ({ ok: false, status: 500 })) })).ok, false);
  assert.equal((await fetchFeedback({ gasUrl: '' })).ok, false);
  assert.equal((await fetchFeedback()).ok, false);
});

test('saveGrade: warns when an outdated backend drops comments', async () => {
  const old = fakeFetch(okJson({ result: 'success', grade: { final_score: 3 } }));
  const r = await saveGrade({ gasUrl: GAS, adminKey: 'k', submissionId: 's1', grades: {}, comments: { q1: 'Nice' }, fetchImpl: old });
  assert.equal(r.ok, true);
  assert.match(r.warning, /comments were NOT saved/);
  const cur = fakeFetch(okJson({ result: 'success', grade: { final_score: 3, comments: { q1: 'Nice' } } }));
  const r2 = await saveGrade({ gasUrl: GAS, adminKey: 'k', submissionId: 's1', grades: {}, comments: { q1: 'Nice' }, fetchImpl: cur });
  assert.equal(r2.warning, undefined);
});
