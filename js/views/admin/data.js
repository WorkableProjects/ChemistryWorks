// Admin data on the store: submissions, published tests and the activity log are cached resources shared by
// Dashboard and Grading, so switching sections and back makes no request. Results refresh with `since`.
import { resource } from '../../lib/store.js';
import { getResultsSince, listPublishedTests, getLog } from '../../lib/api.js';
import { CONFIG } from '../../config.js';
import { adminKey } from '../../lib/admin-session.js';

const creds = () => ({ gasUrl: CONFIG.GAS_WEB_APP_URL, adminKey: adminKey() });

/** Replace rows with the same submission_id, append new ones. */
export function mergeRows(prev = [], incoming = []) {
  if (!incoming.length) return prev;
  const next = prev.slice();
  const at = new Map(next.map((r, i) => [r.submission_id, i]));
  for (const r of incoming) {
    if (at.has(r.submission_id)) next[at.get(r.submission_id)] = { ...next[at.get(r.submission_id)], ...r };
    else { at.set(r.submission_id, next.length); next.push(r); }
  }
  return next;
}

/** All submissions: { rows, now }. The first load is full; later loads ask only for rows changed since `now`. */
export function resultsResource() {
  const res = resource('results', { key: 'all', fetch: async () => {
    const prev = res.peek();
    const r = await getResultsSince({ ...creds(), since: prev && prev.now ? prev.now : undefined });
    if (!r.ok) throw new Error(r.error || 'Request failed');
    const rows = Array.isArray(r.data.rows) ? r.data.rows : [];
    return { rows: prev && prev.now ? mergeRows(prev.rows, rows) : rows, now: r.data.now || (prev && prev.now) || 0 };
  } });
  return res;
}

/** Change one cached submission: `change` is a row patch or a function row -> row. */
export function patchResultRow(id, change) {
  resultsResource().patch((d) => (d ? { ...d, rows: d.rows.map((r) => (r.submission_id === id ? (typeof change === 'function' ? change(r) : { ...r, ...change }) : r)) } : d));
}

export const publishedTestsResource = () => resource('pubtests', { fetch: async () => {
  const r = await listPublishedTests(creds());
  if (!r.ok) throw new Error(r.error || 'Request failed');
  return r.tests || [];
} });

export const logResource = () => resource('adminlog', { fetch: async () => {
  const r = await getLog({ ...creds(), limit: 20 });
  if (!r.ok) throw new Error(r.error || 'Request failed');
  return r.rows || [];
} });
