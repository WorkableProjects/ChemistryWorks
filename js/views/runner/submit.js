// Submit flow: the confirmation modal (unanswered and required warnings) and the final send.

import { h, icon, toast, openModal, formatDurationLong } from '../../ui.js';
import { isAnswered } from '../../lib/grading.js';
import { isRequired } from '../../lib/schema.js';
import { submitResults } from '../../lib/submit.js';
import { preSubmitBlocked } from '../../lib/student-status.js';

/** A row of numbered buttons that jump to a question and close the modal. */
function jumpList(rt, items, labelPrefix) {
  return h('div', { class: 'runner-jumps' }, items.map(({ i }) => h('button', {
    type: 'button', class: 'runner-jump', 'aria-label': `${labelPrefix} ${i + 1}`,
    on: { click: () => { rt.submitModal?.close(); rt.goTo(i, { focus: true }); } },
  }, String(i + 1))));
}

function submitBody(rt, unanswered, missingRequired) {
  const { state, total } = rt;
  const done = total - unanswered.length;
  const stat = (value, label) => h('div', { class: 'runner-stat' }, h('span', { class: 'runner-stat__v' }, value), h('span', { class: 'runner-stat__l' }, label));
  return h('div', { class: 'stack runner-submit' },
    h('div', { class: 'runner-stats' },
      stat(`${done} of ${total}`, 'answered'),
      stat(String(state.flagged.size), 'flagged'),
      stat(formatDurationLong((Date.now() - state.startedAt) / 1000), 'time used')),
    unanswered.length
      ? h('div', { class: 'notice notice--warning runner-unanswered', role: 'alert', dataset: { testid: 'unanswered-warning' } },
        icon('alert'),
        h('div', { class: 'stack' },
          h('span', {}, `You have ${unanswered.length} unanswered ${unanswered.length === 1 ? 'question' : 'questions'}. Jump to:`),
          jumpList(rt, unanswered, 'Go to question')))
      : null,
    missingRequired.length
      ? h('div', { class: 'notice notice--error runner-required', role: 'alert', dataset: { testid: 'required-warning' } },
        icon('alert'),
        h('div', { class: 'stack' },
          h('span', {}, `Answer ${missingRequired.length === 1 ? 'this required question' : `these ${missingRequired.length} required questions`} before you submit:`),
          jumpList(rt, missingRequired, 'Go to required question')))
      : h('p', { class: 'muted' }, 'Once you submit, you cannot change your answers.'),
  );
}

export function openSubmit(rt) {
  const { state, test, ordered } = rt;
  if (state.submitting || state.done || rt.submitModal) return;
  rt.closeDrawer();
  const unanswered = ordered.map((q, i) => ({ q, i })).filter(({ q }) => !isAnswered(q, state.answers[q.id]));
  // Required questions (per question, or all via test.requireAllQuestions) block a manual submit. A timed-out test
  // still auto-submits (finish({ auto: true }) skips this modal).
  const missingRequired = unanswered.filter(({ q }) => isRequired(test, q));
  rt.submitModal = openModal({
    title: 'Submit your test?',
    testid: 'submit-modal',
    body: submitBody(rt, unanswered, missingRequired),
    onClose: () => { rt.submitModal = null; },
    actions: [
      { label: 'Keep working', variant: 'ghost', testid: 'cancel-submit', autofocus: true, onClick: (close) => close() },
      missingRequired.length ? null : { label: 'Submit test', variant: 'primary', testid: 'confirm-submit', onClick: () => rt.finish({ auto: false }) },
    ].filter(Boolean),
  });
}

/** Re-checks a single-submission test just before sending (second tab or device). Returns true when it was blocked. */
async function blockedAsDuplicate(rt) {
  const { ctx, test, attempt } = rt;
  if (!(test.singleSubmission && await preSubmitBlocked(ctx, test))) return false;
  attempt.finish();
  rt.submitModal?.close();
  openModal({
    title: 'Already submitted',
    testid: 'already-submitted-modal',
    body: 'You’ve already submitted this test, so this attempt was not sent. Ask your teacher if you need a retake.',
    actions: [{ label: 'OK', variant: 'primary', onClick: (close) => { close(); ctx.openTest(test.code); } }],
  });
  return true;
}

function sendOrPreview(rt, { grade, payload }) {
  const { ctx, test, preview, state } = rt;
  if (preview) {
    state.done = true;
    rt.submitModal?.close();
    ctx.navigate('results', { test, grade, payload: null, submission: null, preview: true });
    return null;
  }
  return blockedAsDuplicate(rt).then(async (blocked) => {
    if (blocked) return 'blocked';
    const submission = await submitResults(payload, { config: ctx.config });
    rt.attempt.finish();
    rt.submitModal?.close();
    ctx.navigate('results', { test, grade, payload, submission, preview: false });
    return null;
  });
}

export async function finish(rt, { auto = false } = {}) {
  const { state, attempt } = rt;
  if (state.submitting || state.done) return; // timer + click race guard
  state.submitting = true;
  rt.stopTimer();
  if (auto) { rt.submitModal?.close(); rt.shortcutsModal?.close(); rt.closeDrawer(); }
  const confirmBtn = rt.submitModal?.el.querySelector('[data-testid="confirm-submit"]');
  const cancelBtn = rt.submitModal?.el.querySelector('[data-testid="cancel-submit"]');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.classList.add('is-loading'); }
  if (cancelBtn) cancelBtn.disabled = true;
  rt.submitBtn.disabled = true;
  rt.runnerEl.classList.add('is-submitting');
  try {
    const result = attempt.toSubmission({ auto, layout: state.mode });
    if (await sendOrPreview(rt, result) === 'blocked') return;
    if (auto) {
      openModal({
        title: "Time's up — your test was submitted",
        testid: 'timeup-modal',
        body: 'Your time limit ended, so your answers were submitted automatically.',
        actions: [{ label: 'See my results', variant: 'primary', onClick: (close) => close() }],
      });
    }
  } catch (err) {
    console.error('[ChemistryWorks] submit failed', err);
    state.submitting = false;
    state.done = false;
    rt.submitBtn.disabled = false;
    rt.runnerEl.classList.remove('is-submitting');
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.classList.remove('is-loading'); }
    if (cancelBtn) cancelBtn.disabled = false;
    toast('Something went wrong while submitting. Your answers are saved — please try again.', { type: 'error' });
    rt.startTimer();
  }
}
