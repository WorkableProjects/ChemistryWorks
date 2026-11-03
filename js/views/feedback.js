// Student feedback: final per-question points and teacher comments for one past submission (V2-07).
// Comments are shown ONLY from a released getFeedback response.
//
// render(root, ctx, { payload }) -> cleanup()

import { h, mount, icon, richText, renderMath, appHeader, userBadge } from '../ui.js';
import { fetchFeedback } from '../lib/api.js';
import { loadTest } from '../lib/tests.js';
import { groupQuestions } from '../lib/sections.js';
import { applyGrades } from './admin/stats.js';
import { commentBody } from './comment-view.js';

const fmtNum = (n) => String(Math.round((Number(n) || 0) * 100) / 100);

function fmtWhen(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function skeleton() {
  return h('div', { class: 'feedback-skeleton', 'aria-busy': 'true', 'aria-label': 'Loading feedback', dataset: { testid: 'feedback-loading' } },
    h('div', { class: 'feedback-skeleton__row' }), h('div', { class: 'feedback-skeleton__row' }), h('div', { class: 'feedback-skeleton__row' }));
}

function questionItem(r, i, fb) {
  const comment = fb.comments && Object.prototype.hasOwnProperty.call(fb.comments, r.questionId) ? fb.comments[r.questionId] : '';
  const answered = r.answered !== false && String(r.givenAnswerText ?? '') !== '';
  return h('article', { class: 'feedback-item', dataset: { testid: `feedback-item-${r.questionId}` } },
    h('div', { class: 'feedback-item__head' },
      h('span', { class: 'feedback-item__num' }, `Q${i + 1}`),
      richText(r.questionText, 'span', 'feedback-item__text'),
      h('span', { class: 'feedback-item__pts', dataset: { testid: `feedback-points-${r.questionId}` } }, `${fmtNum(r.pointsEarned)} / ${fmtNum(r.pointsPossible)}`)),
    h('div', { class: 'feedback-item__answer' },
      h('span', { class: 'feedback-label' }, 'Your answer'),
      answered ? h('span', { class: 'feedback-pre' }, String(r.givenAnswerText)) : h('span', { class: 'muted' }, 'Not answered')),
    comment ? h('div', { class: 'feedback-comment', dataset: { testid: `feedback-comment-${r.questionId}` } },
      h('span', { class: 'feedback-label' }, icon('pen', { size: 13 }), 'Teacher comment'),
      commentBody(comment)) : null);
}

function releasedView(payload, fb, test) {
  const applied = applyGrades(payload.responses, fb.grades);
  const finalScore = Number.isFinite(Number(fb.final_score)) && fb.final_score !== null && fb.final_score !== '' ? Number(fb.final_score) : applied.scoreAchieved;
  const total = Number.isFinite(Number(fb.score_total)) && Number(fb.score_total) > 0 ? Number(fb.score_total) : applied.scoreTotal;
  const pctRaw = fb.final_percentage !== null && fb.final_percentage !== '' && Number.isFinite(Number(fb.final_percentage)) ? Number(fb.final_percentage) : applied.percentage;
  const byId = new Map(applied.responses.map((r) => [r.questionId, r]));
  let n = 0;
  const list = [];
  const groups = test ? groupQuestions(test, { skipEmpty: true }) : [];
  const placed = new Set();
  if (groups.some((g) => g.section)) {
    for (const g of groups) {
      const rows = g.questions.map((q) => byId.get(q.id)).filter(Boolean);
      rows.forEach((r) => placed.add(r.questionId));
      if (!rows.length) continue;
      if (g.section) list.push(h('h3', { class: 'feedback-section', dataset: { testid: 'feedback-section' } }, g.section.title || 'Section'));
      rows.forEach((r) => list.push(questionItem(r, n++, fb)));
    }
  }
  // Anything not grouped (no test, or responses outside the test) keeps the flat order.
  applied.responses.filter((r) => !placed.has(r.questionId)).forEach((r) => list.push(questionItem(r, n++, fb)));

  return h('div', { class: 'stack', dataset: { testid: 'feedback-released' } },
    h('section', { class: 'card feedback-score-card' },
      h('div', {},
        h('span', { class: 'feedback-label' }, 'Final score'),
        h('div', { class: 'feedback-score', dataset: { testid: 'feedback-score' } }, `${fmtNum(finalScore)} / ${fmtNum(total)} (${pctRaw.toFixed(1)}%)`)),
      fb.released_at ? h('span', { class: 'muted' }, `Released ${fmtWhen(fb.released_at)}`) : null),
    h('div', { class: 'feedback-list' }, list));
}

export function render(root, ctx, params = {}) {
  const payload = params.payload || {};
  const user = ctx.user;
  let alive = true;
  const content = h('div', { class: 'stack' });
  const goBack = () => ctx.navigate('landing');

  mount(root,
    h('div', { class: 'feedback-shell', dataset: { testid: 'feedback' } },
      appHeader({ title: 'ChemistryWorks', subtitle: 'Feedback', onHome: goBack, right: userBadge(user) }),
      h('main', { class: 'feedback' },
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: goBack }, dataset: { testid: 'feedback-back' } }, icon('left', { size: 14 }), 'Back'),
        h('h1', { class: 'feedback__title' }, payload.test_title || payload.test_code || 'Your submission'),
        h('p', { class: 'muted' }, [payload.test_code, payload.submitted_at ? `Submitted ${fmtWhen(payload.submitted_at)}` : ''].filter(Boolean).join(' · ')),
        content)));

  async function load() {
    if (!ctx.config.GAS_WEB_APP_URL) {
      mount(content, h('div', { class: 'notice notice--info', dataset: { testid: 'feedback-unavailable' } }, icon('info'), h('span', {}, 'Feedback isn’t available on this site.')));
      return;
    }
    mount(content, skeleton());
    const fb = await fetchFeedback({ gasUrl: ctx.config.GAS_WEB_APP_URL, submissionId: payload.submission_id, studentEmail: user?.email });
    if (!alive) return;
    if (!fb.ok) {
      mount(content, h('div', { class: 'notice notice--error', role: 'alert', dataset: { testid: 'feedback-error' } }, icon('alert'),
        h('span', {}, `Could not load feedback: ${fb.error || 'unknown error'}`),
        h('button', { class: 'btn btn--sm', type: 'button', on: { click: load }, dataset: { testid: 'feedback-retry' } }, 'Retry')));
      return;
    }
    if (!fb.released) {
      mount(content, h('div', { class: 'notice notice--info', dataset: { testid: 'feedback-pending' } }, icon('info'),
        h('span', {}, 'Your teacher hasn’t released grades and comments for this test yet.')));
      return;
    }
    let test = null;
    try { test = (await loadTest(payload.test_code, { config: ctx.config })).test; } catch { /* flat list */ }
    if (!alive) return;
    mount(content, releasedView(payload, fb, test));
    renderMath(root);
  }
  load();
  return () => { alive = false; };
}
