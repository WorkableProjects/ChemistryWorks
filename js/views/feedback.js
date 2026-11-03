// Student feedback review (V2-07, rebuilt for V3-01 on the PDF export model so it matches the teacher's export).
// Grades, comments and answers are shown ONLY from a released server reply.
//
// render(root, ctx, params) -> cleanup()
//   params.payload  — a past submission from getLocalResults() (landing "Your submitted tests")
//   params.status   — a checkSubmissionState() result (opened from the test link, V3-01)
//   params.test     — the loaded test (optional; loaded by code when missing)
//   params.source   — the test source (passed through to the runner for Take again)
//   params.practiceOnly — offer Game mode practice (single-submission test already submitted)
//   params.canRetake — show "Take again" (false for single-submission tests unless the teacher allowed a retake)

import { h, mount, icon, renderMath, appHeader, userBadge, toast } from '../ui.js';
import { fetchFeedback } from '../lib/api.js';
import { loadTest } from '../lib/tests.js';
import { checkSubmissionState } from '../lib/student-status.js';
import { applyGrades } from './admin/stats.js';
import { buildExportModel } from '../lib/export.js';
import { exportDocument, printSubmission } from './admin/export-view.js';

function fmtWhen(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function skeleton() {
  return h('div', { class: 'feedback-skeleton', 'aria-busy': 'true', 'aria-label': 'Loading feedback', dataset: { testid: 'feedback-loading' } },
    h('div', { class: 'feedback-skeleton__row adm-shimmer' }), h('div', { class: 'feedback-skeleton__row adm-shimmer' }), h('div', { class: 'feedback-skeleton__row adm-shimmer' }));
}

/** Remove correct answers / sample answers when the test hides them (client-side twin of the server strip). */
function hideAnswers(test, responses) {
  const rs = (responses || []).map((r) => {
    const { correctAnswer, correctAnswerText, ...rest } = r || {};
    return rest;
  });
  const t = test ? { ...test, questions: (test.questions || []).map((q) => { const { sampleAnswer, rubric, ...rest } = q || {}; return rest; }) } : test;
  return { test: t, responses: rs };
}

/**
 * Build an export-model row from a released feedback object (server getStudentStatus `feedback`, or a local payload
 * merged with a getFeedback reply). Exported for reuse/testing.
 */
export function feedbackRow(fb, test) {
  const applied = applyGrades(fb.responses || [], fb.grades || {});
  const num = (v, d) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? d : Number(v));
  let responses = applied.responses;
  let t = test;
  if (test && test.showCorrectAnswers === false) ({ test: t, responses } = hideAnswers(test, responses));
  const total = num(fb.score_total, applied.scoreTotal) || applied.scoreTotal;
  return {
    row: {
      submission_id: fb.submission_id,
      student_name: fb.student_name || '',
      student_email: fb.student_email || '',
      test_code: fb.test_code || test?.code || '',
      test_title: fb.test_title || test?.title || '',
      score_achieved: num(fb.final_score, applied.scoreAchieved),
      score_total: total,
      percentage: num(fb.final_percentage, applied.percentage),
      responses,
      comments: fb.comments || {},
      graded_by: fb.graded_by || '',
    },
    test: t,
  };
}

function reviewView(fb, test, { onDownload } = {}) {
  const { row, test: t } = feedbackRow(fb, test);
  const model = buildExportModel({ row, test: t, includeComments: true });
  return h('div', { class: 'stack', dataset: { testid: 'feedback-released' } },
    h('div', { class: 'feedback-toolbar' },
      fb.released_at ? h('span', { class: 'muted' }, `Released ${fmtWhen(fb.released_at)}`) : null,
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'feedback-download-pdf' },
        on: { click: () => onDownload?.(row, t) } }, icon('download', { size: 16 }), 'Download PDF')),
    h('section', { class: 'card feedback-doc', dataset: { testid: 'feedback-score' } }, exportDocument(model)));
}

function otherAttempts(others) {
  if (!others || !others.length) return null;
  return h('details', { class: 'feedback-attempts', dataset: { testid: 'feedback-attempts' } },
    h('summary', {}, `Other attempts (${others.length})`),
    h('ul', {}, others.map((o) => h('li', {}, `${fmtWhen(o.submitted_at) || 'Unknown date'} · ${o.released ? 'released' : 'not released yet'}`))));
}

export function render(root, ctx, params = {}) {
  const payload = params.payload || null;
  const user = ctx.user;
  let alive = true;
  let test = params.test || null;
  const code = test?.code || payload?.test_code || params.status?.feedback?.test_code || '';
  const content = h('div', { class: 'stack' });
  const goBack = () => ctx.navigate('landing');
  const title = h('h1', { class: 'feedback__title', tabindex: '-1' }, test?.title || payload?.test_title || params.status?.feedback?.test_title || code || 'Your submission');
  const meta = h('p', { class: 'muted' });
  const actions = h('div', { class: 'feedback-actions' });

  mount(root,
    h('div', { class: 'feedback-shell', dataset: { testid: 'feedback' } },
      appHeader({ title: 'ChemistryWorks', subtitle: 'Feedback', onHome: goBack, right: userBadge(user) }),
      h('main', { class: 'feedback' },
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: goBack }, dataset: { testid: 'feedback-back' } }, icon('left', { size: 14 }), 'Back'),
        title, meta, content, actions)));

  const setMeta = (submittedAt) => { meta.textContent = [code, submittedAt ? `Submitted ${fmtWhen(submittedAt)}` : ''].filter(Boolean).join(' · '); };
  setMeta(payload?.submitted_at || params.status?.latest?.submitted_at);

  if (params.canRetake && test) {
    actions.appendChild(h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'take-again' },
      on: { click: () => ctx.navigate(test.gameMode === true ? 'mode-select' : 'runner', { test, source: params.source }) } }, icon('right', { size: 16 }), 'Take again'));
  }

  if (params.practiceOnly && test?.gameMode === true) {
    actions.appendChild(h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'practice-game' },
      on: { click: () => ctx.navigate('mode-select', { test, source: params.source, studyBlocked: true }) } }, icon('flag', { size: 16 }), 'Practice in Game mode'));
  }

  async function download(row, t) {
    try { await printSubmission({ row, test: t, includeComments: true }); } catch (e) { toast('Could not create the PDF: ' + (e?.message || 'unavailable'), { type: 'error' }); }
  }

  async function ensureTest() {
    if (test || !code) return test;
    try { test = (await loadTest(code, { config: ctx.config })).test; } catch { test = null; }
    return test;
  }

  function show(fb, others) {
    setMeta(fb.submitted_at || payload?.submitted_at);
    mount(content, reviewView(fb, test, { onDownload: download }), otherAttempts(others));
    renderMath(root);
  }

  function pending(text) {
    mount(content, h('div', { class: 'notice notice--info', dataset: { testid: 'feedback-pending' } }, icon('info'), h('span', {}, text)));
  }

  async function load() {
    if (!ctx.config.GAS_WEB_APP_URL) {
      mount(content, h('div', { class: 'notice notice--info', dataset: { testid: 'feedback-unavailable' } }, icon('info'), h('span', {}, 'Feedback isn’t available on this site.')));
      return;
    }
    mount(content, skeleton());
    await ensureTest();
    if (!alive) return;

    // 1) Server copy (V3-01): any device, verified identity.
    let status = params.status || null;
    if (!status && code) status = await checkSubmissionState(ctx, test || { code });
    if (!alive) return;
    if (status?.source === 'server') {
      const fb = status.feedback;
      if (fb) { show(fb, status.others); return; } // the most recent released attempt (may differ from this device's)
      if (status.submitted && !payload) { pending('Your teacher hasn’t released grades and comments for this test yet.'); return; }
    }

    // 2) Fallback (v2.5): local payload + getFeedback (needs the submission id from this device).
    if (!payload) { pending('Your teacher hasn’t released grades and comments for this test yet.'); return; }
    const res = await fetchFeedback({ gasUrl: ctx.config.GAS_WEB_APP_URL, submissionId: payload.submission_id, studentEmail: user?.email });
    if (!alive) return;
    if (!res.ok) {
      mount(content, h('div', { class: 'notice notice--error', role: 'alert', dataset: { testid: 'feedback-error' } }, icon('alert'),
        h('span', {}, `Could not load feedback: ${res.error || 'unknown error'}`),
        h('button', { class: 'btn btn--sm', type: 'button', on: { click: load }, dataset: { testid: 'feedback-retry' } }, 'Retry')));
      return;
    }
    if (!res.released) { pending('Your teacher hasn’t released grades and comments for this test yet.'); return; }
    show({ ...payload, ...res, responses: payload.responses, submission_id: payload.submission_id }, []);
  }
  load();
  const t = setTimeout(() => title.focus({ preventScroll: true }), 50);
  return () => { alive = false; clearTimeout(t); };
}
