// Results: instant submission confirmation, animated score ring, pass badge and per-question review.
//
// render(root, ctx, { test, grade, payload, submission, preview }) -> cleanup()

import {
  h, mount, icon, richText, renderMath, toast, formatDurationLong, appHeader, userBadge, prefersReducedMotion,
} from '../ui.js';
import { formulaToHTML } from '../lib/formula.js';
import { flushOutbox } from '../lib/submit.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...children) => h(tag, { xmlns: SVG_NS, ...attrs }, ...children);

const RADIUS = 68;
const CIRC = 2 * Math.PI * RADIUS;

function statusChip(label, state) {
  const cls = { sent: 'pill--success', failed: 'pill--danger', skipped: '', none: '' }[state] ?? '';
  return h('span', { class: ['pill', cls] }, state === 'sent' ? icon('check', { size: 13 }) : state === 'failed' ? icon('alert', { size: 13 }) : null, label);
}

function chipsFor(submission) {
  if (!submission) return [statusChip('Not submitted (preview)', 'none')];
  const gas = { sent: 'Saved to Google Sheet ✓', skipped: 'Google Sheet: Not configured', failed: 'Google Sheet: Failed' }[submission.gas] || 'Google Sheet: Not configured';
  const net = { sent: 'Netlify backup ✓', skipped: 'Netlify backup: Not configured', failed: 'Netlify backup: Failed' }[submission.netlify] || 'Netlify backup: Not configured';
  return [statusChip(gas, submission.gas), statusChip(net, submission.netlify)];
}

function scoreRing(pct, grade) {
  const tone = pct >= 80 ? 'success' : pct >= 50 ? 'primary' : 'warning';
  const valueEl = h('span', { class: 'results-ring__pct', dataset: { testid: 'score-percentage' } }, `${grade.percentage}%`);
  const arc = svg('circle', {
    class: 'results-ring__arc', cx: '80', cy: '80', r: String(RADIUS), fill: 'none', 'stroke-width': '11', 'stroke-linecap': 'round',
    'stroke-dasharray': CIRC.toFixed(2), 'stroke-dashoffset': CIRC.toFixed(2),
  });
  const wrap = h('div', { class: `results-ring results-ring--${tone}`, role: 'img', 'aria-label': `Score ${grade.percentage} percent` },
    svg('svg', { viewBox: '0 0 160 160', width: '168', height: '168', 'aria-hidden': 'true' },
      svg('circle', { class: 'results-ring__track', cx: '80', cy: '80', r: String(RADIUS), fill: 'none', 'stroke-width': '11' }),
      arc),
    h('div', { class: 'results-ring__label' }, valueEl, h('span', { class: 'results-ring__sub' }, 'score')),
  );

  const target = Math.max(0, Math.min(100, pct));
  const finalOffset = CIRC * (1 - target / 100);
  let raf = 0;
  if (prefersReducedMotion()) {
    arc.style.strokeDashoffset = finalOffset.toFixed(2);
  } else {
    valueEl.textContent = '0.00%';
    const DURATION = 1100;
    const start = performance.now() + 120;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    requestAnimationFrame(() => arc.classList.add('is-animated'));
    requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = finalOffset.toFixed(2); }));
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / DURATION));
      if (t >= 1) { valueEl.textContent = `${grade.percentage}%`; return; }
      valueEl.textContent = `${(target * ease(t)).toFixed(2)}%`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  return { el: wrap, stop: () => cancelAnimationFrame(raf), finalize: () => { valueEl.textContent = `${grade.percentage}%`; } };
}

function confetti() {
  const colors = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777', '#0EA5E9'];
  const pieces = Array.from({ length: 44 }, () => h('i', {
    // custom properties need a style string (Object.assign on el.style ignores them)
    style: `--x:${(Math.random() * 100).toFixed(1)}%;--dx:${Math.round((Math.random() - 0.5) * 220)}px;`
      + `--r:${Math.floor(Math.random() * 360)}deg;--rr:${360 + Math.floor(Math.random() * 540)}deg;`
      + `--d:${Math.round(2200 + Math.random() * 1600)}ms;--delay:${Math.round(Math.random() * 500)}ms;`
      + `--c:${colors[Math.floor(Math.random() * colors.length)]}`,
  }));
  const el = h('div', { class: 'results-confetti', 'aria-hidden': 'true' }, pieces);
  const t = setTimeout(() => el.remove(), 4600);
  return { el, stop: () => { clearTimeout(t); el.remove(); } };
}

function reviewItem(r, i, test, stagger) {
  const q = test.questions.find((x) => x.id === r.questionId);
  const status = r.isCorrect ? 'correct' : !r.answered ? 'unanswered' : r.pointsEarned > 0 ? 'partial' : 'incorrect';
  const statusLabel = { correct: 'Correct', partial: 'Partially correct', incorrect: 'Incorrect', unanswered: 'Not answered' }[status];
  const statusIcon = status === 'correct' ? 'check' : status === 'partial' ? 'info' : status === 'unanswered' ? 'alert' : 'x';
  const open = status !== 'correct';

  const formulaHtml = (text) => h('span', { class: 'results-formula', html: `<span class="formula">${formulaToHTML(String(text))}</span>` });
  const given = !r.answered
    ? h('span', { class: 'muted' }, 'Not answered')
    : r.type === 'formula' ? formulaHtml(r.givenAnswerText) : richText(r.givenAnswerText, 'span');
  let correct;
  if (r.type === 'formula') {
    const list = Array.isArray(r.correctAnswer) ? r.correctAnswer : [r.correctAnswer];
    correct = h('span', {}, list.flatMap((a, k) => (k ? [' / ', formulaHtml(a)] : [formulaHtml(a)])));
  } else correct = richText(r.correctAnswerText, 'span');

  const bodyId = `review-body-${r.questionId}`;
  const toggle = h('button', {
    type: 'button', class: 'results-item__head', 'aria-expanded': String(open), 'aria-controls': bodyId,
    on: { click: () => {
      const isOpen = item.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    } },
  },
    h('span', { class: `results-item__status results-item__status--${status}`, title: statusLabel }, icon(statusIcon, { size: 16 }), h('span', { class: 'sr-only' }, statusLabel)),
    h('span', { class: 'results-item__num' }, `Q${i + 1}`),
    richText(r.questionText, 'span', 'results-item__text'),
    h('span', { class: 'results-item__pts' }, `${r.pointsEarned} / ${r.pointsPossible} pts`),
    h('span', { class: 'results-item__chev' }, icon('down', { size: 16 })),
  );
  const explanation = q?.explanation ? h('div', { class: 'results-answer results-answer--expl' },
    h('span', { class: 'results-answer__label' }, 'Explanation'), richText(q.explanation, 'div', 'results-explanation')) : null;
  const item = h('article', {
    class: ['results-item', `results-item--${status}`, open && 'is-open'],
    style: `--i:${stagger}`,
    dataset: { testid: `review-item-${r.questionId}`, correct: String(!!r.isCorrect), status },
  },
    toggle,
    h('div', { class: 'results-item__body', id: bodyId },
      h('div', { class: 'results-item__inner' },
        h('div', { class: 'results-answer' }, h('span', { class: 'results-answer__label' }, 'Your answer'), given),
        h('div', { class: 'results-answer results-answer--correct' }, h('span', { class: 'results-answer__label' }, 'Correct answer'), correct),
        explanation)),
  );
  return item;
}

export function render(root, ctx, params = {}) {
  const { test, grade, payload = null, submission = null, preview = false } = params;
  const pct = parseFloat(grade.percentage) || 0;
  const cleanups = [];

  /* ---- submission confirmation */
  const statusEl = h('div', {
    class: 'results-status', dataset: {
      testid: 'submission-status', gas: submission?.gas ?? 'none', netlify: submission?.netlify ?? 'none', queued: String(!!submission?.queued),
    },
  }, chipsFor(submission));

  const confirmCard = h('section', { class: 'results-confirm card', 'aria-label': 'Submission confirmation' },
    h('div', { class: 'results-confirm__item' },
      h('span', { class: 'results-confirm__label' }, 'Completion time'),
      h('strong', { dataset: { testid: 'completion-time' } }, payload ? formatDurationLong(payload.duration_seconds) : '—')),
    h('div', { class: 'results-confirm__item' },
      h('span', { class: 'results-confirm__label' }, 'Questions answered'),
      h('strong', { dataset: { testid: 'answered-count' } }, `${grade.answeredCount} of ${grade.questionCount} answered`)),
    h('div', { class: 'results-confirm__item results-confirm__item--wide' },
      h('span', { class: 'results-confirm__label' }, 'Submission'),
      statusEl),
  );

  const notices = h('div', { class: 'stack results-notices' });
  if (preview) {
    notices.appendChild(h('div', { class: 'notice notice--info' }, icon('eye'), h('span', {}, 'Preview — nothing was submitted')));
  }
  if (submission?.queued) {
    const retryBtn = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', dataset: { testid: 'retry-submit' } }, icon('refresh', { size: 14 }), 'Retry now');
    const queuedNotice = h('div', { class: 'notice notice--warning results-queued' },
      icon('alert'),
      h('span', { class: 'results-queued__text' }, "We couldn't reach the server. Your submission is saved on this device and will retry automatically."),
      retryBtn);
    retryBtn.addEventListener('click', async () => {
      retryBtn.disabled = true;
      retryBtn.classList.add('is-loading');
      try {
        const sent = await flushOutbox({ config: ctx.config });
        if (sent > 0) {
          toast(`Sent ${sent} queued ${sent === 1 ? 'submission' : 'submissions'}`, { type: 'success' });
          statusEl.dataset.queued = 'false';
          queuedNotice.replaceWith(h('div', { class: 'notice notice--success' }, icon('check'), h('span', {}, 'Your submission was sent.')));
        } else {
          toast("Still couldn't reach the server. We'll keep trying.", { type: 'error' });
        }
      } catch {
        toast("Still couldn't reach the server. We'll keep trying.", { type: 'error' });
      }
      retryBtn.disabled = false;
      retryBtn.classList.remove('is-loading');
    });
    notices.appendChild(queuedNotice);
  }

  /* ---- score */
  const showScore = !!test.showResults || preview;
  let scoreCard;
  const heading = preview ? 'Preview complete' : showScore ? (pct >= 90 ? 'Excellent work!' : pct >= 70 ? 'Nice work!' : 'Test submitted') : 'Submission received';
  const titleEl = h('h1', { class: 'results-title', tabindex: '-1' }, heading);
  if (showScore) {
    const ring = scoreRing(pct, grade);
    cleanups.push(ring.stop);
    let passBadge = null;
    if (typeof test.passingPercent === 'number') {
      const passed = pct >= test.passingPercent;
      passBadge = h('span', { class: ['pill', 'results-pass', passed ? 'pill--success' : 'pill--warning'], dataset: { testid: 'pass-badge' } },
        icon(passed ? 'check' : 'info', { size: 14 }), passed ? 'Passed' : 'Not yet');
    }
    scoreCard = h('section', { class: 'results-score card' },
      ring.el,
      h('div', { class: 'results-score__text' },
        titleEl,
        h('p', { class: 'muted' }, test.title),
        h('div', { class: 'results-score__stats' },
          h('div', {}, h('strong', { dataset: { testid: 'score-points' } }, `${grade.scoreAchieved} / ${grade.scoreTotal}`), h('span', { class: 'muted' }, ' points')),
          h('div', {}, h('strong', { dataset: { testid: 'score-correct' } }, `${grade.correctCount} of ${grade.questionCount} correct`))),
        passBadge,
        test.passingPercent != null && typeof test.passingPercent === 'number'
          ? h('p', { class: 'faint results-score__pass-note' }, `Passing score: ${test.passingPercent}%`) : null),
    );
    if (pct >= 90 && !prefersReducedMotion()) {
      const c = confetti();
      cleanups.push(c.stop);
      scoreCard.appendChild(c.el);
    }
  } else {
    scoreCard = h('section', { class: 'results-score results-score--hidden card' },
      h('div', { class: 'results-hidden-icon' }, icon('check', { size: 28 })),
      h('div', { class: 'results-score__text' },
        titleEl,
        h('p', { class: 'muted', dataset: { testid: 'results-hidden' } }, 'Your responses have been recorded. Your teacher will share results.')));
  }

  /* ---- review */
  let review = null;
  if (test.showCorrectAnswers && showScore) {
    const items = grade.results.map((r, i) => reviewItem(r, i, test, Math.min(i, 12)));
    const counts = { all: items.length, incorrect: grade.results.filter((r) => !r.isCorrect).length, correct: grade.results.filter((r) => r.isCorrect).length };
    let filter = 'all';
    const chips = {};
    const apply = () => {
      grade.results.forEach((r, i) => { items[i].hidden = !(filter === 'all' || (filter === 'correct' ? r.isCorrect : !r.isCorrect)); });
      for (const [k, b] of Object.entries(chips)) { b.setAttribute('aria-pressed', String(k === filter)); b.classList.toggle('is-on', k === filter); }
    };
    const mkChip = (key, label) => {
      chips[key] = h('button', { type: 'button', class: 'results-chip', dataset: { testid: `filter-${key}` }, on: { click: () => { filter = key; apply(); } } },
        label, h('span', { class: 'results-chip__n' }, String(counts[key])));
      return chips[key];
    };
    review = h('section', { class: 'results-review', 'aria-label': 'Answer review' },
      h('div', { class: 'results-review__head' },
        h('h2', {}, 'Review your answers'),
        h('div', { class: 'results-chips', role: 'group', 'aria-label': 'Filter questions' }, mkChip('all', 'All'), mkChip('incorrect', 'Incorrect'), mkChip('correct', 'Correct'))),
      h('div', { class: 'results-list', dataset: { testid: 'review-list' } }, items));
    apply();
  }

  /* ---- actions */
  const homeBtn = preview
    ? h('button', { type: 'button', class: 'btn btn--primary btn--lg', dataset: { testid: 'home-btn' }, on: { click: () => ctx.navigate('admin') } }, icon('left'), 'Back to builder')
    : h('button', { type: 'button', class: 'btn btn--primary btn--lg', dataset: { testid: 'home-btn' }, on: { click: () => ctx.navigate('landing') } }, icon('left'), 'Back to home');

  mount(root,
    appHeader({
      subtitle: test.title,
      onHome: () => ctx.navigate('landing'),
      right: userBadge(ctx.user || (preview ? { name: 'Preview', email: 'preview@local', picture: null } : null)),
    }),
    h('main', { class: 'results', dataset: { testid: 'results' } },
      scoreCard, confirmCard, notices, review,
      h('div', { class: 'results-actions' }, homeBtn)),
  );
  renderMath(root);
  setTimeout(() => titleEl.focus({ preventScroll: true }), 50);

  return () => cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}
