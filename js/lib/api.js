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
const OUTDATED_BACKEND = 'unknown_action: the deployed Apps Script is out of date. Paste the latest apps-script/Code.gs, then Deploy > Manage deployments > Edit > New version > Deploy.';
const failure = (data) => {
  const e = (data && data.error) || 'unknown_error';
  return e === 'unknown_action' ? OUTDATED_BACKEND : e;
};

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
// v2: comments ({ [questionId]: text }, omitted = keep existing) and release (true = release grade + comments
// to the student, false = un-release, omitted = unchanged). grade also carries { comments, released_at }.
export async function saveGrade({ gasUrl, adminKey, submissionId, grades, note = '', comments, release, gradedBy, fetchImpl } = {}) {
  try {
    const body = { action: 'saveGrade', adminKey, submissionId, grades, note };
    if (comments !== undefined) body.comments = comments;
    if (release !== undefined) body.release = !!release;
    if (gradedBy !== undefined) body.gradedBy = String(gradedBy);
    const d = await post(gasUrl, body, fetchImpl);
    if (!d || d.result !== 'success') return { ok: false, error: failure(d) };
    // A pre-2.0 backend saves grades but silently drops comments/release/gradedBy: its reply has no `comments`.
    if (comments !== undefined && !(d.grade && d.grade.comments && typeof d.grade.comments === 'object')) {
      return { ok: true, grade: d.grade || null, warning: 'Grade saved, but comments were NOT saved: the deployed Apps Script is out of date. Paste the latest apps-script/Code.gs, then Deploy > Manage deployments > Edit > New version > Deploy.' };
    }
    return { ok: true, grade: d.grade || null };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// Completed submissions per test code (admin). { ok, counts: { CODE: n }, error? }
export async function fetchSubmissionCounts({ gasUrl, adminKey, fetchImpl } = {}) {
  try {
    const d = await post(gasUrl, { action: 'getSubmissionCounts', adminKey }, fetchImpl);
    return d && d.result === 'success' && d.counts && typeof d.counts === 'object'
      ? { ok: true, counts: d.counts }
      : { ok: false, counts: {}, error: failure(d) };
  } catch (e) {
    return { ok: false, counts: {}, error: msg(e) };
  }
}

// Student feedback for one of their own submissions (no admin key; needs the submission id + email).
// -> { ok: true, released: false } | { ok: true, released: true, released_at, status, final_score, score_total,
//      final_percentage, grades: { qid: points }, comments: { qid: text } } | { ok: false, error }
export async function fetchFeedback({ gasUrl, submissionId, studentEmail, fetchImpl } = {}) {
  try {
    const d = await post(gasUrl, { action: 'getFeedback', submissionId, studentEmail }, fetchImpl);
    if (!d || d.result !== 'success') return { ok: false, error: failure(d) };
    const { result, ...rest } = d;
    return { ok: true, ...rest, released: d.released === true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// V3-01: the signed-in student's submissions for one test (no admin key; identity verified on the server
// from the Google ID token). -> { ok: true, submitted, attempts, latest, feedback?, others? } |
// { ok: false, error } (error 'identity_not_configured' / OUTDATED_BACKEND / network -> caller fails open).
export async function fetchStudentStatus({ gasUrl, testCode, idToken, studentEmail, fetchImpl } = {}) {
  try {
    const body = { action: 'getStudentStatus', testCode };
    if (idToken) body.idToken = idToken;
    if (studentEmail) body.studentEmail = studentEmail;
    const d = await post(gasUrl, body, fetchImpl);
    if (!d || d.result !== 'success') return { ok: false, error: failure(d) };
    const { result, ...rest } = d;
    return { ok: true, ...rest, submitted: d.submitted === true, attempts: Number(d.attempts) || 0 };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// V3-03 (admin): release every Graded / Auto-graded submission of a test. -> { ok, released: n, error? }
export async function releaseAll({ gasUrl, adminKey, testCode, fetchImpl } = {}) {
  try {
    const d = await post(gasUrl, { action: 'releaseAll', adminKey, testCode }, fetchImpl);
    return d && d.result === 'success' ? { ok: true, released: Number(d.released) || 0 } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// V3-03 (admin): allow (or revoke) one more submission for the student of this submission.
// -> { ok, retake_allowed_at, error? }
export async function allowRetake({ gasUrl, adminKey, submissionId, allow = true, fetchImpl } = {}) {
  try {
    const d = await post(gasUrl, { action: 'allowRetake', adminKey, submissionId, allow: !!allow }, fetchImpl);
    return d && d.result === 'success' ? { ok: true, retake_allowed_at: d.retake_allowed_at || '' } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
