// Apps Script Web App client. Every function resolves (never throws).
// POST bodies are text/plain JSON so the browser treats them as simple CORS requests (no preflight).

const TEXT_HEADERS = { 'Content-Type': 'text/plain;charset=utf-8' };

function defaultFetch() {
  return typeof fetch === 'function' ? fetch : null;
}

async function parse(res) {
  if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : 'error'}`);
  return res.json();
}

async function get(gasUrl, params, fetchImpl) {
  if (!gasUrl) throw new Error('no_backend_url');
  const f = fetchImpl || defaultFetch();
  if (!f) throw new Error('fetch_unavailable');
  const url = new URL(gasUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return parse(await f(url.toString(), { method: 'GET' }));
}

async function post(gasUrl, body, fetchImpl) {
  if (!gasUrl) throw new Error('no_backend_url');
  const f = fetchImpl || defaultFetch();
  if (!f) throw new Error('fetch_unavailable');
  return parse(await f(gasUrl, { method: 'POST', headers: TEXT_HEADERS, body: JSON.stringify(body) }));
}

const msg = (e) => (e && e.message) || String(e);
const failure = (data) => (data && data.error) || 'unknown_error';

export async function pingBackend({ gasUrl, fetchImpl } = {}) {
  try {
    const d = await get(gasUrl, { action: 'ping' }, fetchImpl);
    return d && d.result === 'success' ? { ok: true, version: d.version } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function fetchPublishedTest(code, { gasUrl, fetchImpl } = {}) {
  try {
    const d = await get(gasUrl, { action: 'getTest', code }, fetchImpl);
    return d && d.result === 'success' && d.test ? d.test : null;
  } catch {
    return null;
  }
}

export async function publishTest(test, { gasUrl, adminKey, fetchImpl } = {}) {
  try {
    const d = await post(gasUrl, { action: 'publishTest', adminKey, test }, fetchImpl);
    return d && d.result === 'success' ? { ok: true } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function listPublishedTests({ gasUrl, adminKey, fetchImpl } = {}) {
  try {
    const d = await post(gasUrl, { action: 'listTests', adminKey }, fetchImpl);
    return d && d.result === 'success'
      ? { ok: true, tests: Array.isArray(d.tests) ? d.tests : [] }
      : { ok: false, tests: [], error: failure(d) };
  } catch (e) {
    return { ok: false, tests: [], error: msg(e) };
  }
}

export async function deletePublishedTest(code, { gasUrl, adminKey, fetchImpl } = {}) {
  try {
    const d = await post(gasUrl, { action: 'deleteTest', adminKey, code }, fetchImpl);
    return d && d.result === 'success' ? { ok: true } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function fetchResults({ gasUrl, adminKey, testCode, fetchImpl } = {}) {
  try {
    const body = { action: 'getResults', adminKey };
    if (testCode) body.testCode = testCode;
    const d = await post(gasUrl, body, fetchImpl);
    return d && d.result === 'success'
      ? { ok: true, rows: Array.isArray(d.rows) ? d.rows : [] }
      : { ok: false, rows: [], error: failure(d) };
  } catch (e) {
    return { ok: false, rows: [], error: msg(e) };
  }
}

// Saves a teacher's grade for one submission. grades: { [questionId]: points }. The backend recomputes
// the final score from the stored responses and returns { final_score, score_total, final_percentage, graded_at }.
export async function saveGrade({ gasUrl, adminKey, submissionId, grades, note = '', fetchImpl } = {}) {
  try {
    const d = await post(gasUrl, { action: 'saveGrade', adminKey, submissionId, grades, note }, fetchImpl);
    return d && d.result === 'success' ? { ok: true, grade: d.grade || null } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
