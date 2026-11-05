// Admin "Insights" tab (V4-02): per test, how the class did. Score distribution, average, median, time spent and a
// per-question breakdown with a "Review" flag. All numbers come from the pure helpers in stats.js, computed client-side
// from the same getResults rows the grading tab uses (normalizeRow).
import { h, mount, icon, richText, renderMath, toast, formatDurationLong } from '../../ui.js';
import { CONFIG } from '../../config.js';
import { adminKey, hasAdminAuth } from '../../lib/admin-session.js';
import { fetchResults } from '../../lib/api.js';
import { TYPE_LABELS } from '../../lib/schema.js';
import { skeleton, emptyState, round2 } from './common.js';
import { confidenceStats } from '../../lib/extras.js';
import { normalizeRow, filterRows, testInsights, questionInsights, answersForQuestion, formatPercent, STATUS, REVIEW_THRESHOLD } from './stats.js';

const S = { testCode: '', questionId: '', rawRows: null, error: '' };

const tile = (label, value, testid) => h('div', { class: 'adm-tile', dataset: { testid } }, h('span', { class: 'adm-tile__value' }, value), h('span', { class: 'adm-tile__label' }, label));

/** Histogram as CSS bars (teal fill, token colours) with a text summary for assistive tech and a table fallback. */
export function histogram(buckets) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const label = (b, i) => `${b.from}${i === buckets.length - 1 ? ' to 100' : ` to under ${b.to}`} percent: ${b.count} student${b.count === 1 ? '' : 's'}`;
  const bars = h('div', { class: 'adm-hist', role: 'img', 'aria-label': `Score distribution. ${buckets.map(label).join('; ')}.`, dataset: { testid: 'insights-chart' } },
    buckets.map((b, i) => h('div', { class: 'adm-hist__col', dataset: { testid: `insights-bucket-${b.from}` } },
      h('span', { class: 'adm-hist__n' }, b.count ? String(b.count) : ''),
      h('span', { class: 'adm-hist__bar', style: `height:${(b.count / max) * 100}%`, title: label(b, i) }),
      h('span', { class: 'adm-hist__x' }, `${b.from}`))));
  const table = h('details', { class: 'adm-hist__table' }, h('summary', {}, 'Show as a table'),
    h('table', { class: 'adm-table' }, h('thead', {}, h('tr', {}, ['Score range', 'Students'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, buckets.map((b, i) => h('tr', {}, h('td', {}, i === buckets.length - 1 ? `${b.from}% - 100%` : `${b.from}% - under ${b.to}%`), h('td', {}, String(b.count)))))));
  return h('div', {}, bars, h('p', { class: 'field__hint adm-center' }, 'Score (%)'), table);
}

export function renderInsights(root, ctx, { goSettings } = {}) {
  let alive = true;
  const gasUrl = CONFIG.GAS_WEB_APP_URL;
  if (!gasUrl || !hasAdminAuth()) {
    mount(root, h('div', { class: 'card' },
      emptyState('chart', 'Connect your Google Sheet for insights', 'Insights are computed from the student submissions in your Google Sheet. Set the Apps Script URL and your admin key first.', 'insights-unconfigured'),
      h('p', { class: 'adm-center' }, h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => goSettings?.() } }, icon('key', { size: 16 }), 'Open Settings'))));
    return () => { alive = false; };
  }

  const content = h('div', { class: 'stack' });
  mount(root, h('div', { class: 'stack adm-insights', dataset: { testid: 'insights' } }, content));

  async function load(force = false) {
    if (S.rawRows && !force) return draw();
    mount(content, skeleton(4));
    let res;
    try { res = await fetchResults({ gasUrl, adminKey: adminKey() }); } catch (e) { res = { ok: false, error: e.message }; }
    if (!alive) return;
    if (!res.ok) { S.error = res.error || 'Request failed'; S.rawRows = null; toast(`Could not load submissions: ${S.error}`, { type: 'error', timeout: 5000 }); } else { S.error = ''; S.rawRows = res.rows; }
    draw();
  }

  function draw() {
    if (!alive) return;
    const refresh = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'insights-refresh' }, on: { click: () => load(true) } }, icon('refresh', { size: 16 }), 'Refresh');
    if (S.error) { mount(content, h('div', { class: 'card' }, emptyState('alert', 'Could not load submissions', S.error, 'insights-error'), h('p', { class: 'adm-center' }, refresh))); return; }
    const all = (S.rawRows || []).map(normalizeRow);
    const codes = [...new Set(all.map((r) => r.test_code).filter(Boolean))].sort();
    if (!codes.includes(S.testCode)) { S.testCode = codes[0] || ''; S.questionId = ''; }
    if (!codes.length) { mount(content, h('div', { class: 'card' }, emptyState('chart', 'No submissions yet', 'Insights appear once students have submitted a test.', 'insights-empty'))); return; }

    const rows = filterRows(all, { testCode: S.testCode, status: 'all' });
    const sum = testInsights(rows);
    const qs = questionInsights(rows);
    const conf = confidenceStats(rows);
    const showConf = conf.size > 0;
    const sel = h('select', { class: 'select adm-select-sm', 'aria-label': 'Test', dataset: { testid: 'insights-test' }, on: { change: () => { S.testCode = sel.value; S.questionId = ''; draw(); } } }, codes.map((c) => h('option', { value: c }, c)));
    sel.value = S.testCode;

    const confCell = (c, id) => (c
      ? h('td', { class: 'adm-td-nowrap', dataset: { testid: `insights-confidence-${id}` } }, `${c.avg} / 3`, c.confidentWrong ? h('span', { class: 'pill pill--warning', title: 'Students who were certain but got it wrong', dataset: { testid: `insights-certainwrong-${id}` } }, `${c.confidentWrong} certain but wrong`) : null)
      : h('td', {}, h('span', { class: 'faint' }, '—')));
    const qRow = (q, i) => {
      const open = () => { S.questionId = S.questionId === q.questionId ? '' : q.questionId; draw(); };
      const pct = q.pctCorrect;
      return h('tr', { class: ['adm-row', S.questionId === q.questionId && 'is-selected'], tabindex: '0', 'aria-expanded': String(S.questionId === q.questionId), 'aria-label': `Question ${i + 1}: ${pct}% correct. Show every answer.`,
        dataset: { testid: `insights-question-${q.questionId}` }, on: { click: open, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } } },
      h('td', {}, `Q${i + 1}`),
      h('td', { class: 'adm-insights__q' }, richText(q.text, 'span'), h('span', { class: 'faint' }, ` ${TYPE_LABELS[q.type] || q.type}`)),
      h('td', { class: 'adm-td-nowrap' }, h('span', { class: 'adm-meter', role: 'img', 'aria-label': `${pct} percent correct` }, h('span', { class: 'adm-meter__fill', style: `width:${pct}%` })), ` ${formatPercent(pct)}`),
      h('td', { class: 'adm-td-nowrap' }, `${round2(q.avgPoints)} / ${round2(q.pointsPossible)}`),
      h('td', {}, q.topWrong ? h('span', { dataset: { testid: `insights-wrong-${q.questionId}` } }, richText(q.topWrong.text, 'span'), h('span', { class: 'faint' }, ` (${q.topWrong.count})`)) : h('span', { class: 'faint' }, '—')),
      showConf ? confCell(conf.get(String(q.questionId)), q.questionId) : null,
      h('td', {}, q.review ? h('span', { class: 'pill pill--warning', dataset: { testid: `insights-review-${q.questionId}` } }, icon('alert', { size: 14 }), 'Review') : null));
    };

    const detail = S.questionId && qs.some((q) => q.questionId === S.questionId) ? (() => {
      const q = qs.find((x) => x.questionId === S.questionId);
      const list = answersForQuestion(rows, q.questionId);
      return h('section', { class: 'card adm-card-results', 'aria-label': 'Every answer', dataset: { testid: 'insights-answers' } },
        h('div', { class: 'adm-toolbar adm-toolbar--wrap' }, h('h3', { class: 'adm-h3' }, 'Every answer'),
          h('span', { class: 'spacer' }), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', on: { click: () => { S.questionId = ''; draw(); } } }, 'Close')),
        richText(q.text, 'div', 'adm-resp__q'),
        h('div', { class: 'adm-tablewrap' }, h('table', { class: 'adm-table' },
          h('thead', {}, h('tr', {}, ['Student', 'Answer', 'Points'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, list.map((a) => h('tr', { dataset: { testid: 'insights-answer-row' } },
            h('td', {}, a.name || a.email || '—'),
            h('td', { class: 'adm-pre' }, a.answered ? a.answerText || '—' : h('span', { class: 'faint' }, 'Not answered')),
            h('td', { class: 'adm-td-nowrap' }, a.needsGrading ? h('span', { class: 'faint' }, 'Pending') : `${round2(a.points)} / ${round2(a.possible)}`)))))));
    })() : null;

    mount(content,
      h('div', { class: 'adm-toolbar adm-toolbar--wrap' }, h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Test'), sel), h('span', { class: 'spacer' }), refresh),
      h('div', { class: 'adm-tiles', dataset: { testid: 'insights-summary' } },
        tile('Submissions', String(sum.count), 'insights-count'),
        tile('Average', sum.count ? formatPercent(sum.average) : '—', 'insights-average'),
        tile('Median', sum.count ? formatPercent(sum.median) : '—', 'insights-median'),
        tile('Avg. time', sum.avgDuration ? formatDurationLong(Math.round(sum.avgDuration)) : '—', 'insights-time')),
      sum.pending ? h('p', { class: 'notice notice--info' }, icon('info'), h('span', {}, `${sum.pending} submission${sum.pending === 1 ? ' is' : 's are'} still waiting for grading and ${sum.pending === 1 ? 'is' : 'are'} not included below.`)) : null,
      h('section', { class: 'card stack', 'aria-label': 'Score distribution' }, h('h3', { class: 'adm-h3' }, 'Score distribution'),
        sum.count ? histogram(sum.buckets) : h('p', { class: 'muted' }, 'No graded submissions yet.')),
      h('section', { class: 'card adm-card-results', 'aria-label': 'Questions' },
        h('h3', { class: 'adm-h3' }, 'Questions'),
        h('p', { class: 'field__hint' }, `Questions under ${REVIEW_THRESHOLD}% correct are flagged for review. Select a question to see every student's answer.`),
        qs.length ? h('div', { class: 'adm-tablewrap' }, h('table', { class: 'adm-table adm-table--insights', dataset: { testid: 'insights-questions' } },
          h('thead', {}, h('tr', {}, ['#', 'Question', '% correct', 'Avg. points', 'Most-chosen wrong answer', ...(showConf ? ['Avg. confidence'] : []), ''].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, qs.map(qRow)))) : h('p', { class: 'muted' }, 'No graded answers yet.')),
      detail);
    renderMath(content);
  }

  load();
  return () => { alive = false; };
}
