// Admin "Analytics" tab: KPIs, score histogram, per-question stats, sortable results table, CSV export.
import { h, mount, icon, richText, renderMath, toast, openModal, formatDurationLong, prefersReducedMotion } from '../../ui.js';
import { CONFIG } from '../../config.js';
import { load } from '../../lib/storage.js';
import { fetchResults } from '../../lib/api.js';
import { getLocalResults } from '../../lib/submit.js';
import { skeleton, emptyState, downloadFile, fmtDate, round2, debounce } from './common.js';
import { normalizeRow, filterRows, sortRows, summarize, histogramBuckets, questionStats, toCsv, formatPercent } from './stats.js';

// Module state: remembered while switching tabs in the session.
const A = { source: 'device', testCode: 'all', query: '', sortKey: 'timestamp', sortDir: 'desc', sheetRows: null, sheetError: '' };

/** Drop cached Sheet rows so the next visit reloads them (called after a teacher saves a grade). */
export function invalidateSheetCache() {
  A.sheetRows = null;
}

export function renderAnalytics(root, ctx, { goSettings }) {
  let alive = true;
  const cleanups = [];
  const gasUrl = CONFIG.GAS_WEB_APP_URL;
  const sheetReady = () => !!gasUrl && !!load('adminKey', '', 'session');
  if (A.source === 'sheet' && !sheetReady()) A.source = 'device';

  const sourceSel = h('select', { class: 'select adm-select-sm', 'aria-label': 'Data source', dataset: { testid: 'analytics-source' }, on: { change: () => { A.source = sourceSel.value; A.testCode = 'all'; loadSource(); } } },
    h('option', { value: 'device' }, 'This device'),
    h('option', { value: 'sheet', disabled: !sheetReady() }, sheetReady() ? 'Google Sheet' : 'Google Sheet (not configured)'));
  sourceSel.value = A.source;
  const filterSel = h('select', { class: 'select adm-select-sm', 'aria-label': 'Filter by test', dataset: { testid: 'analytics-test-filter' }, on: { change: () => { A.testCode = filterSel.value; draw(); } } });
  const refreshBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'refresh-results' }, on: { click: () => loadSource(true) } }, icon('refresh', { size: 16 }), 'Refresh');
  const hint = h('p', { class: 'field__hint adm-source-hint' });
  const content = h('div', { class: 'stack adm-analytics__content' });

  const toolbar = h('div', { class: 'adm-toolbar adm-toolbar--wrap' },
    h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Source'), sourceSel),
    h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Test'), filterSel),
    h('span', { class: 'spacer' }), refreshBtn);

  mount(root, h('div', { class: 'stack adm-analytics' }, toolbar, hint, content));

  let allRows = [];

  async function loadSource(force = false) {
    sourceSel.value = A.source;
    refreshBtn.hidden = A.source !== 'sheet';
    hint.textContent = A.source === 'sheet' ? 'Live results from your Google Sheet.' : 'Only submissions made in this browser. Use the Google Sheet source to see every student.';
    if (A.source === 'device') {
      allRows = getLocalResults().map(normalizeRow);
      return draw();
    }
    if (A.sheetRows && !force) { allRows = A.sheetRows; return draw(); }
    mount(content, skeleton(5));
    refreshBtn.classList.add('is-loading');
    let res;
    try {
      res = await fetchResults({ gasUrl, adminKey: load('adminKey', '', 'session') });
    } catch (e) {
      res = { ok: false, error: e.message };
    }
    refreshBtn.classList.remove('is-loading');
    if (!alive) return;
    if (!res.ok) {
      A.sheetError = res.error || 'Request failed';
      allRows = [];
      toast(`Could not load results: ${A.sheetError}`, { type: 'error', timeout: 5000 });
    } else {
      A.sheetError = '';
      A.sheetRows = res.rows.map(normalizeRow);
      allRows = A.sheetRows;
    }
    draw();
  }

  function refreshFilterOptions() {
    const codes = [...new Set(allRows.map((r) => r.test_code).filter(Boolean))].sort();
    if (A.testCode !== 'all' && !codes.includes(A.testCode)) A.testCode = 'all';
    mount(filterSel, h('option', { value: 'all' }, 'All tests'), codes.map((c) => h('option', { value: c }, c)));
    filterSel.value = A.testCode;
  }

  function draw() {
    if (!alive) return;
    refreshFilterOptions();
    if (!allRows.length) {
      const msg = A.sheetError ? A.sheetError
        : A.source === 'device' ? 'Results appear here after someone submits a test on this device.' : 'No submissions in the Google Sheet yet.';
      mount(content, h('div', { class: 'card' }, emptyState('chart', A.sheetError ? 'Could not load results' : 'No results yet', msg, 'analytics-empty'),
        A.source === 'device' && !sheetReady() ? h('p', { class: 'muted adm-center' }, 'Want results from every student? ', h('a', { href: '#settings', on: { click: (e) => { e.preventDefault(); goSettings(); } } }, 'Connect your Google Sheet in Settings.')) : null));
      return;
    }
    const byTest = filterRows(allRows, { testCode: A.testCode });
    if (!byTest.length) {
      mount(content, h('div', { class: 'card' }, emptyState('chart', 'No results for this test', null, 'analytics-empty')));
      return;
    }
    const sum = summarize(byTest);
    const buckets = histogramBuckets(byTest.map((r) => r.percentage));
    const qs = questionStats(byTest);
    const multiTest = new Set(byTest.map((r) => r.test_code)).size > 1;

    mount(content,
      kpis(sum),
      h('div', { class: 'adm-two-col' }, histogramCard(buckets), questionCard(qs, multiTest)),
      resultsCard(byTest));
    renderMath(content);
    animateBars(content);
  }

  function kpi(label, value, testid, sub) {
    return h('div', { class: 'adm-kpi' }, h('span', { class: 'adm-kpi__label' }, label), h('strong', { class: 'adm-kpi__value', dataset: { testid } }, value), sub ? h('span', { class: 'faint adm-kpi__sub' }, sub) : null);
  }
  function kpis(s) {
    return h('div', { class: 'adm-kpis' },
      kpi('Submissions', String(s.count), 'kpi-submissions'),
      kpi('Average', formatPercent(s.average), 'kpi-average'),
      kpi('Median', formatPercent(s.median), 'kpi-median'),
      kpi('Highest', formatPercent(s.high), 'kpi-high'),
      kpi('Lowest', formatPercent(s.low), 'kpi-low'),
      kpi('Avg. duration', formatDurationLong(s.avgDuration), 'kpi-duration'));
  }

  function histogramCard(buckets) {
    const max = Math.max(1, ...buckets.map((b) => b.count));
    return h('section', { class: 'card adm-card-chart', 'aria-label': 'Score distribution' },
      h('h3', { class: 'adm-h3' }, 'Score distribution'),
      h('div', { class: 'adm-hist', role: 'group', 'aria-label': 'Histogram of scores in 10-point buckets', dataset: { testid: 'histogram' } },
        buckets.map((b) => h('div', { class: 'adm-hist__col' },
          h('span', { class: 'adm-hist__count' }, b.count),
          h('div', { class: 'adm-hist__track' },
            h('div', { class: ['adm-hist__bar', b.min >= 90 && 'is-high', b.max < 60 && 'is-low'], role: 'img', 'aria-label': `${b.label} percent: ${b.count} submission${b.count === 1 ? '' : 's'}`, dataset: { height: String((b.count / max) * 100), count: b.count } })),
          h('span', { class: 'adm-hist__label' }, b.label)))));
  }

  function questionCard(qs, multiTest) {
    const rows = qs.length ? qs.map((q) => {
      const pct = Math.round(q.pctCorrect);
      return h('tr', {},
        h('td', { class: 'adm-qs__q' }, multiTest ? h('span', { class: 'adm-item__code adm-item__code--sm' }, q.testCode) : null, richText(q.questionText || q.questionId, 'div', 'adm-clamp')),
        h('td', { class: 'adm-qs__pct' },
          h('div', { class: 'adm-meter', role: 'img', 'aria-label': `${pct}% correct` },
            h('div', { class: ['adm-meter__fill', pct < 40 ? 'is-low' : pct < 70 ? 'is-mid' : 'is-high'], dataset: { width: String(pct) } })),
          h('span', {}, `${pct}%`)),
        h('td', {}, `${round2(q.avgPoints)} / ${round2(q.pointsPossible)}`),
        h('td', { class: 'adm-qs__wrong' }, q.commonWrong ? [h('span', { class: 'adm-clamp' }, q.commonWrong.text), h('span', { class: 'faint' }, ` ×${q.commonWrong.count}`)] : h('span', { class: 'faint' }, '—')));
    }) : null;
    return h('section', { class: 'card adm-card-qs', 'aria-label': 'Question statistics' },
      h('h3', { class: 'adm-h3' }, 'Question statistics', h('span', { class: 'faint' }, ' · hardest first')),
      h('div', { class: 'adm-tablewrap', dataset: { testid: 'question-stats' } },
        rows
          ? h('table', { class: 'adm-table' },
            h('thead', {}, h('tr', {}, ['Question', '% correct', 'Avg points', 'Most common wrong answer'].map((t) => h('th', { scope: 'col' }, t)))),
            h('tbody', {}, rows))
          : h('p', { class: 'muted' }, 'No per-question data in these submissions.')));
  }

  function resultsCard(byTest) {
    const tableHost = h('div', { class: 'adm-tablewrap', dataset: { testid: 'results-table' } });
    const countEl = h('span', { class: 'faint' });
    const search = h('input', { class: 'input adm-search', type: 'search', placeholder: 'Search name or email', 'aria-label': 'Search results', value: A.query, dataset: { testid: 'results-search' } });
    let filtered = [];

    const cols = [
      ['student_name', 'Student'], ['student_email', 'Email'], ['test_code', 'Test'], ['score', 'Score'],
      ['percentage', '%'], ['duration_seconds', 'Duration'], ['timestamp', 'Submitted'], ['tab_switches', 'Tab switches'], ['status', 'Status'],
    ];
    function drawTable() {
      filtered = sortRows(filterRows(byTest, { query: A.query }), A.sortKey, A.sortDir);
      countEl.textContent = `${filtered.length} of ${byTest.length}`;
      const head = h('tr', {}, cols.map(([key, label]) => h('th', { scope: 'col', 'aria-sort': A.sortKey === key ? (A.sortDir === 'asc' ? 'ascending' : 'descending') : 'none' },
        h('button', { class: 'adm-sort', type: 'button', dataset: { sort: key }, on: { click: () => {
          if (A.sortKey === key) A.sortDir = A.sortDir === 'asc' ? 'desc' : 'asc'; else { A.sortKey = key; A.sortDir = key === 'student_name' || key === 'student_email' || key === 'test_code' ? 'asc' : 'desc'; }
          drawTable();
        } } }, label, A.sortKey === key ? icon(A.sortDir === 'asc' ? 'up' : 'down', { size: 14 }) : null))));
      const open = (r) => showSubmission(r);
      const body = filtered.map((r) => h('tr', { class: 'adm-row', tabindex: '0', 'aria-label': `View submission by ${r.student_name || r.student_email}`, dataset: { testid: 'result-row' },
        on: { click: () => open(r), keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r); } } } },
        h('td', {}, r.student_name || '—'), h('td', { class: 'adm-td-email' }, r.student_email || '—'),
        h('td', {}, h('span', { class: 'adm-item__code adm-item__code--sm' }, r.test_code)),
        h('td', {}, `${round2(r.score_achieved)} / ${round2(r.score_total)}`),
        h('td', {}, h('span', { class: ['pill', r.percentage >= 70 ? 'pill--success' : r.percentage >= 40 ? 'pill--warning' : 'pill--danger'] }, formatPercent(r.percentage))),
        h('td', {}, formatDurationLong(r.duration_seconds)), h('td', { class: 'adm-td-nowrap' }, fmtDate(r.timestamp)),
        h('td', {}, r.tab_switches ? h('span', { class: 'pill pill--warning' }, r.tab_switches) : '0'),
        h('td', {}, h('span', { class: ['pill', r.status === 'Needs grading' ? 'pill--warning' : r.status === 'Graded' ? 'pill--success' : ''] }, r.status))));
      mount(tableHost, h('table', { class: 'adm-table adm-table--results' }, h('thead', {}, head), h('tbody', {}, body.length ? body : h('tr', {}, h('td', { colspan: cols.length, class: 'muted adm-center' }, 'No matching submissions')))));
    }
    const onSearch = debounce(() => { A.query = search.value; drawTable(); }, 120);
    cleanups.push(() => onSearch.cancel());
    search.addEventListener('input', onSearch);
    drawTable();

    return h('section', { class: 'card adm-card-results', 'aria-label': 'Submissions' },
      h('div', { class: 'adm-toolbar adm-toolbar--wrap' },
        h('h3', { class: 'adm-h3' }, 'Submissions'), countEl, h('span', { class: 'spacer' }), search,
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'export-csv' }, on: { click: () => {
          if (!filtered.length) return toast('Nothing to export', { type: 'warning' });
          downloadFile(`chemistryworks-results${A.testCode !== 'all' ? `-${A.testCode}` : ''}.csv`, toCsv(filtered), 'text/csv');
          toast(`Exported ${filtered.length} row${filtered.length === 1 ? '' : 's'}`, { type: 'success' });
        } } }, icon('download', { size: 16 }), 'Export CSV')),
      tableHost);
  }

  function showSubmission(r) {
    const label = (res) => (res.needsGrading ? 'Needs grading' : res.isCorrect ? 'Correct' : res.answered ? (res.pointsEarned > 0 ? 'Partial' : 'Incorrect') : 'Skipped');
    const items = (r.responses || []).map((res, i) => h('li', { class: ['adm-resp', res.isCorrect ? 'is-correct' : res.needsGrading ? '' : res.answered ? 'is-wrong' : 'is-skipped'] },
      h('div', { class: 'adm-resp__head' }, h('strong', {}, `Q${i + 1}`), h('span', { class: ['pill', res.needsGrading ? 'pill--warning' : res.isCorrect ? 'pill--success' : res.answered ? 'pill--danger' : ''] }, label(res)),
        h('span', { class: 'faint' }, `${round2(res.pointsEarned)} / ${round2(res.pointsPossible)} pts`)),
      richText(res.questionText, 'div', 'adm-resp__q'),
      h('dl', { class: 'adm-resp__ans' },
        h('dt', {}, 'Student'), h('dd', {}, res.givenAnswerText || '—'),
        res.isCorrect ? null : [h('dt', {}, 'Correct'), h('dd', {}, res.correctAnswerText || '—')])));
    openModal({
      title: `${r.student_name || r.student_email} · ${r.test_code}`, wide: true, testid: 'submission-modal',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, `${round2(r.score_achieved)} / ${round2(r.score_total)} (${formatPercent(r.percentage)}) · ${formatDurationLong(r.duration_seconds)} · ${fmtDate(r.timestamp)}${r.tab_switches ? ` · ${r.tab_switches} tab switch${r.tab_switches === 1 ? '' : 'es'}` : ''}`),
        items.length ? h('ol', { class: 'adm-resps' }, items) : h('p', { class: 'muted' }, 'No per-question responses were stored for this submission.')),
      actions: [{ label: 'Close', variant: 'primary', autofocus: true }],
    });
  }

  function animateBars(rootEl) {
    const bars = rootEl.querySelectorAll('[data-height], [data-width]');
    const apply = () => bars.forEach((b) => {
      if (b.dataset.height != null) b.style.height = `${b.dataset.height}%`;
      if (b.dataset.width != null) b.style.width = `${b.dataset.width}%`;
    });
    if (prefersReducedMotion()) return apply();
    requestAnimationFrame(() => requestAnimationFrame(apply));
  }

  loadSource();
  return () => { alive = false; cleanups.forEach((fn) => fn()); };
}
