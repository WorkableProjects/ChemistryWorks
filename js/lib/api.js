// Apps Script Web App client. Every function resolves (never throws).
// POST bodies are text/plain JSON so the browser treats them as simple CORS requests (no preflight).

import { adminRequestAuth } from './admin-session.js';
import { getFreshIdToken } from './auth.js';

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

// Admin POST (V4-07). The body carries the admin credentials from adminRequestAuth() ({ idToken } for a confirmed
// Google admin, { adminKey } when a key is set); an explicit `adminKey` argument wins. When the Google token has
// expired mid-session ('invalid_token') it is refreshed silently once and the request retried, never a password.
async function adminPost(gasUrl, body, adminKey, fetchImpl, { idToken } = {}) {
  const full = { ...adminRequestAuth(), ...body };
  if (adminKey !== undefined && adminKey !== null && adminKey !== '') full.adminKey = adminKey;
  if (idToken) full.idToken = idToken;
  const d = await post(gasUrl, full, fetchImpl);
  if (d && d.result === 'error' && d.error === 'invalid_token' && full.idToken) {
    const fresh = await getFreshIdToken();
    if (fresh && fresh !== full.idToken) return post(gasUrl, { ...full, idToken: fresh }, fetchImpl);
  }
  return d;
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
  const r = await fetchPublishedTestResult(code, { gasUrl, fetchImpl });
  return r.test || null;
}

// v4 S11/S12: { test } or { error: 'not_open'|'closed'|'not_on_roster'|..., opensAt, closesAt, title }. With an idToken the
// POST form is used, which applies the student's extension and roster check server-side.
export async function fetchPublishedTestResult(code, { gasUrl, fetchImpl, idToken } = {}) {
  try {
    const d = idToken ? await post(gasUrl, { action: 'getTest', code, idToken }, fetchImpl) : await get(gasUrl, { action: 'getTest', code }, fetchImpl);
    if (d && d.result === 'success' && d.test) return { test: d.test };
    return { error: (d && d.error) || 'not_found', opensAt: d?.opensAt, closesAt: d?.closesAt, title: d?.title || '' };
  } catch (e) {
    return { error: 'network' };
  }
}

export async function publishTest(test, { gasUrl, adminKey, fetchImpl } = {}) {
  try {
    const d = await adminPost(gasUrl, { action: 'publishTest', test }, adminKey, fetchImpl);
    return d && d.result === 'success' ? { ok: true } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function listPublishedTests({ gasUrl, adminKey, fetchImpl } = {}) {
  try {
    const d = await adminPost(gasUrl, { action: 'listTests' }, adminKey, fetchImpl);
    return d && d.result === 'success'
      ? { ok: true, tests: Array.isArray(d.tests) ? d.tests : [] }
      : { ok: false, tests: [], error: failure(d) };
  } catch (e) {
    return { ok: false, tests: [], error: msg(e) };
  }
}

export async function deletePublishedTest(code, { gasUrl, adminKey, fetchImpl } = {}) {
  try {
    const d = await adminPost(gasUrl, { action: 'deleteTest', code }, adminKey, fetchImpl);
    return d && d.result === 'success' ? { ok: true } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function fetchResults({ gasUrl, adminKey, testCode, fetchImpl } = {}) {
  try {
    const body = { action: 'getResults' };
    if (testCode) body.testCode = testCode;
    const d = await adminPost(gasUrl, body, adminKey, fetchImpl);
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
    const body = { action: 'saveGrade', submissionId, grades, note };
    if (comments !== undefined) body.comments = comments;
    if (release !== undefined) body.release = !!release;
    if (gradedBy !== undefined) body.gradedBy = String(gradedBy);
    const d = await adminPost(gasUrl, body, adminKey, fetchImpl);
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
    const d = await adminPost(gasUrl, { action: 'getSubmissionCounts' }, adminKey, fetchImpl);
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
    const d = await adminPost(gasUrl, { action: 'releaseAll', testCode }, adminKey, fetchImpl);
    return d && d.result === 'success' ? { ok: true, released: Number(d.released) || 0 } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// V3-03 (admin): allow (or revoke) one more submission for the student of this submission.
// -> { ok, retake_allowed_at, error? }
export async function allowRetake({ gasUrl, adminKey, submissionId, allow = true, fetchImpl } = {}) {
  try {
    const d = await adminPost(gasUrl, { action: 'allowRetake', submissionId, allow: !!allow }, adminKey, fetchImpl);
    return d && d.result === 'success' ? { ok: true, retake_allowed_at: d.retake_allowed_at || '' } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// ---- V4-07 admin accounts ----

// Who am I? Confirms the signed-in Google user is on the Admins sheet.
// -> { ok: true, email, role, via } | { ok: false, error: 'not_admin' | 'invalid_token' | ... }
export async function whoAmI({ gasUrl, idToken, adminKey, fetchImpl } = {}) {
  try {
    const d = await adminPost(gasUrl, { action: 'whoami' }, adminKey, fetchImpl, { idToken });
    return d && d.result === 'success' ? { ok: true, email: d.email || '', role: d.role || 'admin', via: d.via || '' } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// -> { ok, admins: [{ email, role, added_by, added_at }] }
export async function listAdmins({ gasUrl, adminKey, fetchImpl } = {}) {
  try {
    const d = await adminPost(gasUrl, { action: 'listAdmins' }, adminKey, fetchImpl);
    return d && d.result === 'success' ? { ok: true, admins: Array.isArray(d.admins) ? d.admins : [] } : { ok: false, admins: [], error: failure(d) };
  } catch (e) {
    return { ok: false, admins: [], error: msg(e) };
  }
}

// Owner only: add an admin or change a role. role: 'owner' | 'admin'. -> { ok, email, role, updated }
export async function saveAdmin({ gasUrl, adminKey, email, role = 'admin', fetchImpl } = {}) {
  try {
    const d = await adminPost(gasUrl, { action: 'saveAdmin', email, role }, adminKey, fetchImpl);
    return d && d.result === 'success' ? { ok: true, email: d.email, role: d.role, updated: d.updated === true } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// Owner only. Errors: 'cannot_remove_self', 'last_owner', 'not_found', 'owner_only'.
export async function removeAdmin({ gasUrl, adminKey, email, fetchImpl } = {}) {
  try {
    const d = await adminPost(gasUrl, { action: 'removeAdmin', email }, adminKey, fetchImpl);
    return d && d.result === 'success' ? { ok: true } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

// Activity log, newest first. -> { ok, rows: [{ time, admin, action, target, details }] }
export async function getLog({ gasUrl, adminKey, limit = 100, fetchImpl } = {}) {
  try {
    const d = await adminPost(gasUrl, { action: 'getLog', limit }, adminKey, fetchImpl);
    return d && d.result === 'success' ? { ok: true, rows: Array.isArray(d.rows) ? d.rows : [] } : { ok: false, rows: [], error: failure(d) };
  } catch (e) {
    return { ok: false, rows: [], error: msg(e) };
  }
}

// ---------- v4 S11–S17 actions (generic helpers; every function resolves, never throws) ----------
// adminCall('listClasses', {}, { gasUrl }) -> { ok: true, data } | { ok: false, error }   (admin credentials merged as above)
export async function adminCall(action, payload = {}, { gasUrl, adminKey, fetchImpl } = {}) {
  try {
    const d = await adminPost(gasUrl, { action, ...payload }, adminKey, fetchImpl);
    return d && d.result === 'success' ? { ok: true, data: d } : { ok: false, error: failure(d) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
// Public (student) actions: progressPing, getTest (POST, with idToken), submitGameScore, getLeaderboard, reportError.
// `unavailable` is true when the deployed backend does not know the action yet (older Code.gs) or is unreachable.
export async function publicCall(action, payload = {}, { gasUrl, fetchImpl } = {}) {
  try {
    const d = await post(gasUrl, { action, ...payload }, fetchImpl);
    if (d && d.result === 'success') return { ok: true, data: d };
    return { ok: false, error: (d && d.error) || 'unknown_error', data: d, unavailable: !!d && d.error === 'unknown_action' };
  } catch (e) {
    return { ok: false, error: msg(e), unavailable: true };
  }
}

// ---------- v5 (B1): student profile + sync, batch ----------
// Every wrapper resolves { ok: true, data } | { ok: false, error, unavailable? } and never throws.
// No gasUrl or an old backend -> { ok: false, unavailable: true }: callers keep working from localStorage.
async function studentCall(action, payload, { gasUrl, idToken, fetchImpl } = {}) {
  if (!gasUrl) return { ok: false, error: 'no_backend_url', unavailable: true };
  let token = idToken;
  if (!token) {
    try { token = await getFreshIdToken(); } catch (e) { token = ''; }
  }
  return publicCall(action, { ...payload, idToken: token || undefined }, { gasUrl, fetchImpl });
}

export const getStudentProfile = ({ gasUrl, idToken, fetchImpl } = {}) => studentCall('getStudentProfile', {}, { gasUrl, idToken, fetchImpl });
export const saveStudentProfile = ({ gasUrl, idToken, prefs, fetchImpl } = {}) => studentCall('saveStudentProfile', { prefs }, { gasUrl, idToken, fetchImpl });
export const syncProgress = ({ gasUrl, idToken, attempt, xp, fetchImpl } = {}) => studentCall('syncProgress', { attempt, xp }, { gasUrl, idToken, fetchImpl });
export const getStudentProfileAdmin = ({ gasUrl, adminKey, email, fetchImpl } = {}) => adminCall('getStudentProfileAdmin', { email }, { gasUrl, adminKey, fetchImpl });
// requests: [{ action, ...fields }] (max 50). -> { ok, data: { results: [...] } }
export const batchCall = ({ gasUrl, adminKey, requests, fetchImpl } = {}) => adminCall('batch', { requests }, { gasUrl, adminKey, fetchImpl });

// ---------- v5 (B2): fast reads ----------
// -> { ok, data: { tests: [{ code, title, updatedAt, status, questionCount, points, needsGrading, submissionCount }] } }
export const listTestsSummary = ({ gasUrl, adminKey, fetchImpl } = {}) => adminCall('listTests', { summary: true }, { gasUrl, adminKey, fetchImpl });
// since = ms epoch from a previous `now`. -> { ok, data: { rows, now } }
export const getResultsSince = ({ gasUrl, adminKey, testCode, status, since, fetchImpl } = {}) => adminCall('getResults', { testCode, status, since }, { gasUrl, adminKey, fetchImpl });
