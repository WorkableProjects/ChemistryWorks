// Client data store: cached resources with background refresh, optimistic updates and rollback.
//   const tests = resource('tests', { fetch: (signal) => Promise<data>, key?, ttl? });
//   tests.get()  tests.refresh()  tests.patch(fn)  tests.optimistic(change, request)  tests.subscribe(fn)  tests.peek()
// fetch must return the data or throw. Same name+key always gives the same resource object.

const PREFIX = 'cw:store:';
const DEFAULT_TTL = 60000;
const registry = new Map();
let env = { storage: undefined, toast: null, now: () => Date.now() };

/** Test/app hook: { storage, toast(message, opts), now }. */
export function configureStore(opts = {}) { env = { ...env, ...opts }; }

function storage() {
  if (env.storage !== undefined) return env.storage;
  try { return globalThis.sessionStorage || null; } catch { return null; }
}
function readWarm(id) {
  try { const raw = storage()?.getItem(PREFIX + id); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeWarm(id, entry) {
  try { storage()?.setItem(PREFIX + id, JSON.stringify(entry)); } catch { /* quota or blocked: no warm start */ }
}
async function notifyError(message, retry) {
  try {
    const t = env.toast || (await import('../ui.js')).toast;
    t(message, { type: 'error', timeout: 8000, action: retry ? { label: 'Retry', onClick: retry } : null });
  } catch { /* no DOM */ }
}

export function resource(name, { fetch: fetcher, key = '', ttl = DEFAULT_TTL } = {}) {
  const id = key ? `${name}:${key}` : name;
  const existing = registry.get(id);
  if (existing) { if (fetcher) existing._setFetch(fetcher); return existing; }

  let data;
  let at = 0;
  let inflight = null;
  let controller = null;
  let doFetch = fetcher;
  let error = null;
  const subs = new Set();
  const warm = readWarm(id);
  if (warm && 'data' in warm) { data = warm.data; at = Number(warm.at) || 0; }
  const fresh = () => data !== undefined && env.now() - at < ttl;
  const emit = () => subs.forEach((fn) => { try { fn(data, { error }); } catch { /* a subscriber bug must not break the store */ } });
  const set = (next, stamp) => { data = next; if (stamp) at = env.now(); writeWarm(id, { data, at }); emit(); };

  function load() {
    if (inflight) return inflight; // one request per resource key
    if (!doFetch) return Promise.reject(new Error(`resource ${id} has no fetch`));
    controller = typeof AbortController === 'function' ? new AbortController() : null;
    const mine = controller;
    const p = Promise.resolve().then(() => doFetch(mine ? mine.signal : undefined)).then((d) => {
      if (mine && mine.signal.aborted) return data; // cancelled on view leave: drop the result
      error = null;
      set(d, true);
      return d;
    }, (e) => {
      if (mine && mine.signal.aborted) return data;
      error = e;
      emit();
      throw e;
    }).finally(() => { if (inflight === p) { inflight = null; controller = null; } });
    inflight = p;
    return p;
  }

  const res = {
    id,
    _setFetch(fn) { doFetch = fn; },
    peek: () => data,
    error: () => error,
    /** Cached data at once when present (stale data refreshes in the background); else awaits the first fetch. */
    async get({ force = false } = {}) {
      if (force) return load();
      if (data !== undefined) {
        if (!fresh()) load().catch(() => {});
        return data;
      }
      return load();
    },
    /** Fetch now. Resolves with the new data, or the cached data if the fetch fails. */
    refresh() { return load().catch(() => data); },
    patch(fn) { const next = fn(data); if (next !== undefined) set(next, false); return data; },
    /** Apply `change` locally, run `request()`. On failure roll back and toast "Retry". Returns { ok, result?, error? }. */
    async optimistic(change, request, { onSuccess, message = 'Could not save the change', retry = true } = {}) {
      const before = data;
      res.patch(change);
      try {
        const result = await request();
        if (result && result.ok === false) throw new Error(result.error || 'request_failed');
        if (onSuccess) res.patch((d) => onSuccess(d, result));
        return { ok: true, result };
      } catch (e) {
        set(before, false);
        const again = retry ? () => res.optimistic(change, request, { onSuccess, message, retry }) : null;
        notifyError(`${message}${e && e.message ? `: ${e.message}` : ''}`, again);
        return { ok: false, error: e };
      }
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    /** Abort a request in flight (view left). */
    cancel() { if (controller) controller.abort(); inflight = null; controller = null; },
    clear() { res.cancel(); data = undefined; at = 0; error = null; try { storage()?.removeItem(PREFIX + id); } catch { /* ignore */ } emit(); },
  };
  registry.set(id, res);
  return res;
}

/** Abort every request in flight (view leave). */
export function cancelAll() { registry.forEach((r) => r.cancel()); }

/** Sign-out: drop every cache, in memory and in sessionStorage. */
export function clearStore() {
  registry.forEach((r) => r.clear());
  registry.clear();
  try {
    const s = storage();
    if (s) Object.keys(s).filter((k) => k.startsWith(PREFIX)).forEach((k) => s.removeItem(k));
  } catch { /* ignore */ }
}
