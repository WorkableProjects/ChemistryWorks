// Test bank loading. Resolution order for a code:
//   1. Bundled file   data/tests/<CODE>.json  (committed to the repo, deployed with the site)
//   2. Published test stored in the Google Sheet via Apps Script (admin "Publish")
//   3. Local admin drafts (only when { includeDrafts: true }, i.e. admin preview)
// Every test is passed through normalizeTest() and validateTest() before use.

import { normalizeTest, validateTest } from './schema.js';
import { fetchPublishedTest } from './api.js';
import { load, save } from './storage.js';

export function normalizeCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

async function fetchBundled(code, fetchImpl) {
  try {
    const res = await fetchImpl(`data/tests/${encodeURIComponent(code)}.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function getDrafts() {
  return load('drafts', {});
}

export function saveDraft(test) {
  const drafts = getDrafts();
  drafts[normalizeCode(test.code)] = { ...test, updatedAt: new Date().toISOString() };
  save('drafts', drafts);
}

export function deleteDraft(code) {
  const drafts = getDrafts();
  delete drafts[normalizeCode(code)];
  save('drafts', drafts);
}

/** Bundled catalog: data/tests/index.json -> [{ code, title, description }] */
export async function loadCatalog(fetchImpl = fetch) {
  try {
    const res = await fetchImpl('data/tests/index.json', { cache: 'no-cache' });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

/**
 * Resolve a test by code.
 * Returns { test, source: 'bundled'|'published'|'draft' } or throws Error with a student-friendly message.
 */
export async function loadTest(code, { config, includeDrafts = false, fetchImpl = fetch } = {}) {
  const c = normalizeCode(code);
  if (!c) throw new Error('Enter a test code.');

  let raw = null, source = null;
  if (includeDrafts && getDrafts()[c]) { raw = getDrafts()[c]; source = 'draft'; }
  if (!raw) { raw = await fetchBundled(c, fetchImpl); source = raw ? 'bundled' : null; }
  if (!raw && config?.GAS_WEB_APP_URL) {
    try {
      raw = await fetchPublishedTest(c, { gasUrl: config.GAS_WEB_APP_URL, fetchImpl });
      source = raw ? 'published' : null;
    } catch {
      raw = null;
    }
  }
  if (!raw) throw new Error(`No test found with code “${c}”. Check the code with your teacher.`);

  const test = normalizeTest(raw);
  const { valid, errors } = validateTest(test);
  if (!valid) throw new Error(`Test “${c}” is misconfigured: ${errors[0]}`);
  return { test, source };
}
