// Client data store: cache TTL, de-duplication, optimistic rollback, subscribers, sessionStorage warm start.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear(),
    keys: () => [...m.keys()],
  };
};
const { resource, configureStore, cancelAll, clearStore } = await import('../../js/lib/store.js');

let storage;
let clock;
let toasts;
beforeEach(() => {
  clearStore();
  storage = memory();
  clock = 1000;
  toasts = [];
  configureStore({ storage, now: () => clock, toast: (message, opts) => toasts.push({ message, opts }) });
});

const counter = (value = 'v') => {
  const f = async () => { f.calls++; return typeof value === 'function' ? value(f.calls) : value; };
  f.calls = 0;
  return f;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

test('the first get fetches, a fresh get serves the cache', async () => {
  const fetcher = counter((n) => `data${n}`);
  const r = resource('t-fresh', { fetch: fetcher, ttl: 5000 });
  assert.equal(r.peek(), undefined);
  assert.equal(await r.get(), 'data1');
  clock += 4999;
  assert.equal(await r.get(), 'data1');
  assert.equal(fetcher.calls, 1);
});

test('a stale get returns the cache at once and refreshes in the background', async () => {
  const fetcher = counter((n) => `data${n}`);
  const r = resource('t-stale', { fetch: fetcher, ttl: 5000 });
  await r.get();
  clock += 5001;
  assert.equal(await r.get(), 'data1', 'stale data comes back immediately');
  await tick();
  assert.equal(fetcher.calls, 2);
  assert.equal(r.peek(), 'data2');
});

test('get({ force }) always fetches', async () => {
  const fetcher = counter((n) => n);
  const r = resource('t-force', { fetch: fetcher });
  await r.get();
  assert.equal(await r.get({ force: true }), 2);
  assert.equal(fetcher.calls, 2);
});

test('simultaneous requests share one fetch', async () => {
  const fetcher = counter('x');
  const r = resource('t-dedupe', { fetch: fetcher });
  const all = await Promise.all([r.get(), r.get(), r.refresh(), r.get({ force: true })]);
  assert.deepEqual(all, ['x', 'x', 'x', 'x']);
  assert.equal(fetcher.calls, 1);
});

test('the same name and key give the same resource; a key makes a different one', () => {
  const a = resource('t-same', { fetch: counter() });
  assert.equal(resource('t-same'), a);
  const b = resource('t-same', { key: 'k2', fetch: counter() });
  assert.notEqual(a, b);
  assert.equal(b.id, 't-same:k2');
  assert.equal(resource('t-same', { key: 'k2' }), b);
});

test('a failed fetch rejects get, keeps the old data on refresh and reports the error', async () => {
  let fail = false;
  const r = resource('t-fail', { fetch: async () => { if (fail) throw new Error('boom'); return 'ok'; } });
  assert.equal(await r.get(), 'ok');
  fail = true;
  await assert.rejects(r.get({ force: true }), /boom/);
  assert.equal(r.error().message, 'boom');
  assert.equal(await r.refresh(), 'ok', 'refresh resolves with the cached data');
  fail = false;
  await r.refresh();
  assert.equal(r.error(), null);
});

test('get with nothing cached and no fetch rejects', async () => {
  const r = resource('t-nofetch');
  await assert.rejects(r.get(), /no fetch/);
});

test('subscribers hear about new data and errors; unsubscribe stops them; a throwing subscriber is ignored', async () => {
  let fail = false;
  const r = resource('t-subs', { fetch: async () => { if (fail) throw new Error('down'); return [1]; } });
  const seen = [];
  const off = r.subscribe((data, meta) => seen.push([data, meta.error && meta.error.message]));
  r.subscribe(() => { throw new Error('bad subscriber'); });
  await r.get();
  assert.deepEqual(seen, [[[1], null]]);
  fail = true;
  await r.refresh();
  assert.deepEqual(seen[1], [[1], 'down']);
  off();
  r.patch(() => [2]);
  assert.equal(seen.length, 2);
});

test('patch updates the data and returns the old one when nothing changes', async () => {
  const r = resource('t-patch', { fetch: counter([1, 2]) });
  await r.get();
  r.patch((d) => [...d, 3]);
  assert.deepEqual(r.peek(), [1, 2, 3]);
  r.patch(() => undefined);
  assert.deepEqual(r.peek(), [1, 2, 3]);
});

test('optimistic: the change shows at once and stays when the request works', async () => {
  const r = resource('t-opt-ok', { fetch: counter({ n: 1 }) });
  await r.get();
  const seen = [];
  r.subscribe((d) => seen.push(d.n));
  const out = await r.optimistic((d) => ({ n: d.n + 1 }), async () => ({ ok: true, id: 7 }), { onSuccess: (d, res) => ({ n: d.n + res.id }) });
  assert.equal(out.ok, true);
  assert.deepEqual(seen, [2, 9]);
  assert.equal(r.peek().n, 9);
  assert.equal(toasts.length, 0);
});

test('optimistic: a failed request rolls back and offers Retry', async () => {
  const r = resource('t-opt-fail', { fetch: counter({ n: 1 }) });
  await r.get();
  let attempts = 0;
  const request = async () => { attempts++; if (attempts === 1) throw new Error('offline'); return { ok: true }; };
  const out = await r.optimistic((d) => ({ n: d.n + 1 }), request, { message: 'Could not save' });
  assert.equal(out.ok, false);
  assert.equal(r.peek().n, 1, 'rolled back');
  await tick();
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].message, 'Could not save: offline');
  assert.equal(toasts[0].opts.type, 'error');
  assert.equal(toasts[0].opts.action.label, 'Retry');
  await toasts[0].opts.action.onClick();
  assert.equal(r.peek().n, 2, 'Retry applies the change again');
  assert.equal(attempts, 2);
});

test('optimistic: { ok: false } from the request is a failure, and retry can be turned off', async () => {
  const r = resource('t-opt-soft', { fetch: counter({ n: 1 }) });
  await r.get();
  const out = await r.optimistic((d) => ({ n: 5 }), async () => ({ ok: false, error: 'not_allowed' }), { retry: false });
  assert.equal(out.ok, false);
  assert.equal(r.peek().n, 1);
  await tick();
  assert.equal(toasts[0].message, 'Could not save the change: not_allowed');
  assert.equal(toasts[0].opts.action, null);
});

test('sessionStorage warm start: a new resource begins with the stored data', async () => {
  const first = resource('t-warm', { fetch: counter('server'), ttl: 5000 });
  await first.get();
  assert.ok(storage.keys().includes('cw:store:t-warm'));
  // Simulate a page reload: the in-memory registry is gone, the storage stays.
  const saved = [...storage.keys()].map((k) => [k, storage.getItem(k)]);
  clearStore();
  for (const [k, v] of saved) storage.setItem(k, v);
  const fetcher = counter('fresh');
  const second = resource('t-warm', { fetch: fetcher, ttl: 5000 });
  assert.equal(second.peek(), 'server', 'data is there before any fetch');
  assert.equal(await second.get(), 'server');
  assert.equal(fetcher.calls, 0, 'still inside the TTL');
  clock += 6000;
  assert.equal(await second.get(), 'server');
  await tick();
  assert.equal(fetcher.calls, 1, 'stale warm data refreshes in the background');
  assert.equal(second.peek(), 'fresh');
});

test('a broken or unavailable storage never breaks the store', async () => {
  storage.setItem('cw:store:t-broken', '{not json');
  const r = resource('t-broken', { fetch: counter('ok') });
  assert.equal(await r.get(), 'ok');
  configureStore({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } } });
  const r2 = resource('t-blocked', { fetch: counter('fine') });
  assert.equal(await r2.get(), 'fine');
  configureStore({ storage: null });
  const r3 = resource('t-null', { fetch: counter('fine') });
  assert.equal(await r3.get(), 'fine');
});

test('cancel drops an in-flight result; cancelAll cancels every resource', async () => {
  let release;
  const slow = () => new Promise((res) => { release = () => res('late'); });
  const r = resource('t-cancel', { fetch: slow });
  const p = r.get();
  await tick();
  r.cancel();
  release();
  await p;
  assert.equal(r.peek(), undefined, 'the cancelled result is not stored');
  const r2 = resource('t-cancel2', { fetch: slow });
  const p2 = r2.get();
  await tick();
  cancelAll();
  release();
  await p2;
  assert.equal(r2.peek(), undefined);
});

test('clear forgets one resource; clearStore forgets all of them, memory and storage', async () => {
  const a = resource('t-clear-a', { fetch: counter('a') });
  const b = resource('t-clear-b', { fetch: counter('b') });
  await a.get(); await b.get();
  a.clear();
  assert.equal(a.peek(), undefined);
  assert.ok(!storage.keys().includes('cw:store:t-clear-a'));
  assert.equal(b.peek(), 'b');
  storage.setItem('other', 'keep');
  clearStore();
  assert.equal(b.peek(), undefined);
  assert.deepEqual(storage.keys(), ['other'], 'only the store keys go');
  assert.notEqual(resource('t-clear-b', { fetch: counter('b') }), b, 'the registry starts over');
});
