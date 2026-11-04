// Results: instant submission confirmation, animated score ring, pass badge and per-question review.
//
// render(root, ctx, { test, grade, payload, submission, preview }) -> cleanup()

import { questionImageEl } from './question-image.js';
import {
  h, mount, icon, richText, renderMath, toast, formatDurationLong, appHeader, userBadge, prefersReducedMotion,
} from '../ui.js';
import { formulaToHTML } from '../lib/formula.js';
import { flushOutbox } from '../lib/submit.js';
import { canonicalDots } from '../lib/lewis.js';
import { lewisDiagram } from './lewis-view.js';
import { structureDiagram } from './structure-view.js';
import { acceptedStructures } from '../lib/structure.js';
import { groupQuestions } from '../lib/sections.js';
import { orbitalDiagram } from './orbital-view.js';
import { hotspotDiagram } from './widgets/hotspot-stage.js';
import { choiceImagesEl } from './runner.js';

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
  const tone = pct >= 80 ? 'teal' : pct >= 50 ? 'teal' : 'warning';
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
    const DURATION = 400;
    const start = performance.now() + 60;
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

/** Correct / partial / incorrect / pending counts as icon pills (never colour-only). */
function summaryChips(grade) {
  const c = { correct: 0, partial: 0, incorrect: 0, pending: 0 };
  for (const r of grade.results || []) {
    if (r.needsGrading) c.pending += 1;
    else if (r.isCorrect) c.correct += 1;
    else if (r.answered && r.pointsEarned > 0) c.partial += 1;
    else c.incorrect += 1;
  }
  const defs = [['correct', 'Correct', 'check', 'pill--success'], ['partial', 'Partial', 'minus', 'pill--warning'],
    ['incorrect', 'Incorrect', 'x', 'pill--danger'], ['pending', 'Pending', 'hourglass', 'pill--primary']];
  return h('div', { class: 'results-summary', role: 'list', 'aria-label': 'Question summary', dataset: { testid: 'results-summary' } },
    defs.filter(([k]) => k !== 'pending' || c.pending > 0).map(([k, label, ic, cls]) => h('span', { class: ['pill', 'results-summary__chip', cls], role: 'listitem', dataset: { testid: `summary-${k}` } },
      icon(ic, { size: 14 }), h('span', { class: 'results-summary__n' }, String(c[k])), ` ${label}`)));
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

/** Answer text followed by the pictures of any image choices it names. */
function withChoiceImages(textEl, imgs) {
  return imgs ? h('span', { class: 'results-choice' }, textEl, imgs) : textEl;
}

function reviewItem(r, i, test, stagger) {
  const q = test.questions.find((x) => x.id === r.questionId);
  const status = r.needsGrading ? 'pending' : r.isCorrect ? 'correct' : !r.answered ? 'unanswered' : r.pointsEarned > 0 ? 'partial' : 'incorrect';
  const statusLabel = { correct: 'Correct', partial: 'Partially correct', incorrect: 'Incorrect', unanswered: 'Not answered', pending: 'Awaiting teacher grading' }[status];
  const statusIcon = status === 'correct' ? 'check' : status === 'partial' ? 'minus' : status === 'pending' ? 'hourglass' : status === 'unanswered' ? 'alert' : 'x';
  const open = status !== 'correct';

  const formulaHtml = (text) => h('span', { class: 'results-formula', html: `<span class="formula">${formulaToHTML(String(text))}</span>` });
  const given = !r.answered
    ? h('span', { class: 'muted' }, 'Not answered')
    : r.type === 'formula' || r.type === 'balance' ? formulaHtml(r.givenAnswerText)
      : r.type === 'lewis' ? h('span', { class: 'results-lewis' }, lewisDiagram(q?.element, r.givenAnswer), h('span', { class: 'muted' }, r.givenAnswerText))
      : r.type === 'structure' && q ? h('span', { class: 'results-structure' }, structureDiagram(q, r.givenAnswer, { label: 'Your Lewis structure' }), h('span', { class: 'muted' }, r.givenAnswerText))
      : r.type === 'orbital' && q ? h('span', { class: 'results-orbital' }, orbitalDiagram(q, r.givenAnswer, { label: 'Your orbital diagram' }), h('span', { class: 'muted' }, r.givenAnswerText))
      : r.type === 'hotspot' && q ? h('span', { class: 'results-hotspot' }, hotspotDiagram(q, r.givenAnswer, { size: 'md', marks: true }), h('span', { class: 'muted' }, r.givenAnswerText))
      : r.type === 'short' || r.type === 'open' ? h('span', { class: 'results-pre' }, r.givenAnswerText)
      : withChoiceImages(richText(r.givenAnswerText, 'span'), choiceImagesEl(q, r.givenAnswer));
  let correct;
  if (r.type === 'orbital' && q) {
    correct = q.sampleAnswer && typeof q.sampleAnswer === 'object'
      ? h('span', { class: 'results-orbital' }, orbitalDiagram(q, q.sampleAnswer, { label: 'Sample orbital diagram' }), h('span', { class: 'muted' }, r.correctAnswerText))
      : null;
  } else if (r.type === 'structure' && q) {
    correct = h('span', { class: 'results-structure' },
      acceptedStructures(q).map((k, n, all) => h('span', { class: 'results-structure__form' },
        all.length > 1 ? h('span', { class: 'faint' }, `Resonance form ${n + 1}`) : null,
        structureDiagram(q, k, { label: 'Correct Lewis structure' }))),
      h('span', { class: 'muted' }, r.correctAnswerText));
  } else if (r.type === 'hotspot' && q) {
    correct = h('span', { class: 'results-hotspot' }, hotspotDiagram(q, null, { size: 'md', showTargets: true }), h('span', { class: 'muted' }, r.correctAnswerText));
  } else if (r.type === 'open') {
    correct = h('span', { class: 'results-pre' }, r.correctAnswerText);
  } else if (r.type === 'balance') {
    correct = formulaHtml(r.correctAnswerText);
  } else if (r.type === 'formula') {
    const list = Array.isArray(r.correctAnswer) ? r.correctAnswer : [r.correctAnswer];
    correct = h('span', {}, list.flatMap((a, k) => (k ? [' / ', formulaHtml(a)] : [formulaHtml(a)])));
  } else if (r.type === 'lewis') {
    correct = h('span', { class: 'results-lewis' }, lewisDiagram(q?.element, canonicalDots(r.correctAnswer, q?.element)), h('span', { class: 'muted' }, r.correctAnswerText));
  } else correct = withChoiceImages(richText(r.correctAnswerText, 'span'), choiceImagesEl(q, r.correctAnswer));
  const isShort = r.type === 'short' || r.type === 'open';
  const showCorrect = r.type === 'orbital' ? correct !== null
    : !isShort || (q?.sampleAnswer ?? '') !== '' || (r.type === 'open' && (q?.rubric || []).length > 0);
  const correctLabel = r.type === 'open' ? 'Sample answer & rubric' : r.manual && r.type === 'structure' ? 'Reference answer' : r.manual ? 'Sample answer' : 'Correct answer';

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
    h('span', { class: 'results-item__main' },
      richText(r.questionText, 'span', 'results-item__text'),
      h('span', { class: 'results-item__label', 'aria-hidden': 'true' }, statusLabel)),
    h('span', { class: 'results-item__pts' }, r.needsGrading ? `— / ${r.pointsPossible} pts` : `${r.pointsEarned} / ${r.pointsPossible} pts`),
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
        questionImageEl(q),
        h('div', { class: 'results-answer' }, h('span', { class: 'results-answer__label' }, 'Your answer'), given),
        showCorrect ? h('div', { class: 'results-answer results-answer--correct' }, h('span', { class: 'results-answer__label' }, correctLabel), correct) : null,
        r.needsGrading ? h('p', { class: 'muted' }, 'Your teacher will grade this answer.') : null,
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
  const pending = Number(grade.pendingCount) || 0;
  let scoreCard;
  const heading = preview ? 'Preview complete' : !showScore ? 'Submission received'
    : pending ? 'Test submitted' : pct >= 90 ? 'Excellent work!' : pct >= 70 ? 'Nice work!' : 'Test submitted';
  const titleEl = h('h1', { class: 'results-title', tabindex: '-1' }, heading);
  if (showScore) {
    const ring = scoreRing(pct, grade);
    cleanups.push(ring.stop);
    let passBadge = null;
    if (typeof test.passingPercent === 'number' && !pending) {
      const passed = pct >= test.passingPercent;
      passBadge = h('span', { class: ['pill', 'results-pass', passed ? 'pill--success' : 'pill--warning'], dataset: { testid: 'pass-badge' } },
        icon(passed ? 'check' : 'info', { size: 14 }), passed ? 'Passed' : 'Not yet');
    }
    scoreCard = h('section', { class: 'results-score card' },
      ring.el,
      h('div', { class: 'results-score__text' },
        titleEl,
        h('span', { class: 'sr-only', role: 'status', 'aria-live': 'polite', dataset: { testid: 'score-live' } },
          `Your score is ${grade.percentage} percent, ${grade.correctCount} of ${grade.questionCount} correct.`),
        h('p', { class: 'muted' }, test.title),
        h('div', { class: 'results-score__stats' },
          h('div', {}, h('strong', { dataset: { testid: 'score-points' } }, `${grade.scoreAchieved} / ${grade.scoreTotal}`), h('span', { class: 'muted' }, pending ? ' points so far' : ' points')),
          h('div', {}, h('strong', { dataset: { testid: 'score-correct' } }, `${grade.correctCount} of ${grade.questionCount} correct`))),
        passBadge,
        summaryChips(grade),
        pending ? h('p', { class: 'notice notice--info', dataset: { testid: 'pending-note' } }, icon('info'),
          h('span', {}, `${pending} ${pending === 1 ? 'answer' : 'answers'} (${grade.pendingPoints} pts) will be graded by your teacher. This score is not final.`)) : null,
        !pending && test.passingPercent != null && typeof test.passingPercent === 'number'
          ? h('p', { class: 'faint results-score__pass-note' }, `Passing score: ${test.passingPercent}%`) : null),
    );
    const confettiAt = typeof test.passingPercent === 'number' ? test.passingPercent : 90;
    if (pct >= confettiAt && !pending && !prefersReducedMotion()) {
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
    // Section headings (V2-04): unsectioned questions first without a heading, then each section in order.
    const rowIndex = new Map(grade.results.map((r, i) => [r.questionId, i]));
    const listNodes = [];
    const sectionBlocks = []; // { heading, idx: number[] }
    const placed = new Set();
    for (const g of groupQuestions(test)) {
      const idx = g.questions.map((q) => rowIndex.get(q.id)).filter((i) => i !== undefined);
      idx.forEach((i) => placed.add(i));
      if (!g.section) { listNodes.push(...idx.map((i) => items[i])); continue; }
      if (!idx.length) continue;
      const rows = idx.map((i) => grade.results[i]);
      const anyPending = rows.some((r) => r.needsGrading);
      const earned = Math.round(rows.reduce((s, r) => s + (Number(r.pointsEarned) || 0), 0) * 100) / 100;
      const heading = h('h3', { class: 'results-section', dataset: { testid: 'results-section' } },
        h('span', { class: 'results-section__title' }, g.section.title || 'Untitled section'),
        h('span', { class: 'results-section__pts' }, anyPending ? `${g.points} pts` : `${earned} / ${g.points} pts`));
      listNodes.push(heading, ...idx.map((i) => items[i]));
      sectionBlocks.push({ heading, idx });
    }
    items.forEach((el, i) => { if (!placed.has(i)) listNodes.push(el); });
    let filter = 'all';
    const chips = {};
    const apply = () => {
      grade.results.forEach((r, i) => { items[i].hidden = !(filter === 'all' || (filter === 'correct' ? r.isCorrect : !r.isCorrect)); });
      for (const b of sectionBlocks) b.heading.hidden = b.idx.every((i) => items[i].hidden);
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
      h('div', { class: 'results-list', dataset: { testid: 'review-list' } }, listNodes));
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
