// V3-01 / V3-02: "has this student already submitted this test?" — one place for the status check used by
// app.js openTest() (routing) and the runner (pre-submit re-check). Never throws.
//
// checkSubmissionState(ctx, test) -> {
//   source: 'server' | 'local' | 'none',   // where the answer came from ('none' = no backend / no identity)
//   submitted: boolean,                     // at least one counted submission exists
//   blocking: boolean,                      // a submission exists that is NOT marked "retake allowed"
//   retakeAllowed: boolean,                 // server confirms the teacher allowed this student one more attempt
//   attempts: number,
//   latest: { submission_id, submitted_at, status, released } | null,
//   feedback: object | null,                // latest released review (server only), see Code.gs getStudentStatus_
//   others: [{ submission_id, submitted_at, released }],
// }

import { fetchStudentStatus } from './api.js';
import { getFreshIdToken } from './auth.js';
import { hasLocalSubmission, getOutbox } from './submit.js';

const EMPTY = { source: 'none', submitted: false, blocking: false, retakeAllowed: false, attempts: 0, latest: null, feedback: null, others: [] };

function queuedOnDevice(email, code) {
  const e = String(email || '').toLowerCase();
  const c = String(code || '').toUpperCase();
  return getOutbox().some((p) => p && String(p.student_email || '').toLowerCase() === e && String(p.test_code || '').toUpperCase() === c);
}

export async function checkSubmissionState(ctx, test) {
  const user = ctx.user;
  const code = test?.code;
  if (!user || !code) return { ...EMPTY };
  const local = () => {
    const had = hasLocalSubmission(user.email, code);
    return { ...EMPTY, source: 'local', submitted: had, blocking: had };
  };
  const gasUrl = ctx.config?.GAS_WEB_APP_URL;
  if (!gasUrl) return local();
  try {
    const idToken = user.provider === 'google' ? await getFreshIdToken() : null;
    const res = await fetchStudentStatus({ gasUrl, testCode: code, idToken, studentEmail: idToken ? undefined : user.email });
    if (!res.ok) return local(); // offline, old backend, identity not configured -> fail open to the local check
    const queued = queuedOnDevice(user.email, code);
    // A submission recorded on this device also blocks, unless the server confirms the teacher allowed a retake.
    const onDevice = hasLocalSubmission(user.email, code);
    const retakeAllowed = res.submitted === true && res.blocking === false && res.latest?.retake_allowed === true;
    return {
      source: 'server',
      submitted: res.submitted || queued || onDevice,
      blocking: res.blocking === true || queued || (onDevice && !retakeAllowed),
      retakeAllowed: retakeAllowed && !queued,
      attempts: res.attempts,
      latest: res.latest || null,
      feedback: res.feedback || null,
      others: Array.isArray(res.others) ? res.others : [],
      // v4 S11/S12: accommodations, window (with this student's extension) and roster from the backend.
      accommodations: res.accommodations || null,
      window: res.window || null,
      roster: res.roster || null,
      extraAttemptsLeft: res.extraAttemptsLeft || 0,
    };
  } catch {
    return local();
  }
}

/** Runner pre-submit re-check: true only when the server (or this device) says a blocking submission exists. */
export async function preSubmitBlocked(ctx, test) {
  if (!test?.singleSubmission) return false;
  const s = await checkSubmissionState(ctx, test);
  return s.blocking === true;
}
