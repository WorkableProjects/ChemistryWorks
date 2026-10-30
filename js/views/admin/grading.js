// Admin "Grading" tab: review every submission from the Google Sheet, grade open-ended answers,
// override auto-graded points, and export final scores for a gradebook (Aeries, Google Classroom).
import { h, mount, icon, richText, renderMath, toast, formatDurationLong } from '../../ui.js';
import { CONFIG } from '../../config.js';
import { load } from '../../lib/storage.js';
import { fetchResults, saveGrade } from '../../lib/api.js';
import { TYPE_LABELS } from '../../lib/schema.js';
import { skeleton, emptyState, downloadFile, fmtDate, round2, debounce } from './common.js';
import { normalizeRow, filterRows, sortRows, toGradebookCsv, formatPercent, applyGrades, STATUS } from './stats.js';
import { invalidateSheetCache } from './analytics.js';

// Module state: remembered while switching tabs in the session.
const G = { testCode: 'all', status: STATUS.NEEDS_GRADING, query: '', rawRows: null, error: '', selectedId: null };

const statusPill = (status) => h('span', {
  class: ['pill', status === STATUS.NEEDS_GRADING ? 'pill--warning' : status === STATUS.GRADED ? 'pill--success' : 'pill--primary'],
  dataset: { testid: 'grade-status' },
}, status);

export function renderGrading(root, ctx, { goSettings }) {
  let alive = true;
  const cleanups = [];
  const gasUrl = CONFIG.GAS_WEB_APP_URL;
  const adminKey = () => load('adminKey', '', 'session');

  if (!gasUrl || !adminKey()) {
    mount(root, h('div', { class: 'card' },
      emptyState('pen', 'Connect your Google Sheet to grade', 'Grading reads every student submission from the Google Sheet. Set the Apps Script URL and your admin key first.', 'grading-unconfigured'),
      h('p', { class: 'adm-center' }, h('button', { class: 'btn btn--primary', type: 'button', on: { click: goSettings } }, icon('key', { size: 16 }), 'Open Settings'))));
    return () => { alive = false; };
  }

  let rows = [];
  const content = h('div', { class: 'stack' });
  mount(root, h('div', { class: 'stack adm-grading', dataset: { testid: 'grading' } }, content));

  async function loadRows(force = false) {
    if (G.rawRows && !force) { rows = G.rawRows.map(normalizeRow); return draw(); }
    mount(content, skeleton(5));
    let res;
    try { res = await fetchResults({ gasUrl, adminKey: adminKey() }); } catch (e) { res = { ok: false, error: e.message }; }
    if (!alive) return;
    if (!res.ok) {
      G.error = res.error || 'Request failed';
      G.rawRows = null;
      rows = [];
      toast(`Could not load submissions: ${G.error}`, { type: 'error', timeout: 5000 });
    } else {
      G.error = '';
      G.rawRows = res.rows;
      rows = G.rawRows.map(normalizeRow);
    }
    draw();
  }

  function draw() {
    if (!alive) return;
    const selected = G.selectedId && rows.find((r) => r.submission_id === G.selectedId);
    if (selected) drawGrader(selected);
    else { G.selectedId = null; drawList(); }
  }

  /* ---------------------------------------------------------------- list */
  function visibleRows() {
    // Oldest first, so students are graded in submission order.
    return sortRows(filterRows(rows, { testCode: G.testCode, status: G.status, query: G.query }), 'timestamp', 'asc');
  }

  function drawList() {
    const codes = [...new Set(rows.map((r) => r.test_code).filter(Boolean))].sort();
    if (G.testCode !== 'all' && !codes.includes(G.testCode)) G.testCode = 'all';
    const byTest = filterRows(rows, { testCode: G.testCode });
    const count = (s) => byTest.filter((r) => r.status === s).length;

    const testSel = h('select', { class: 'select adm-select-sm', 'aria-label': 'Filter by test', dataset: { testid: 'grading-test-filter' },
      on: { change: () => { G.testCode = testSel.value; drawList(); } } },
    h('option', { value: 'all' }, 'All tests'), codes.map((c) => h('option', { value: c }, c)));
    testSel.value = G.testCode;
    const statusSel = h('select', { class: 'select adm-select-sm', 'aria-label': 'Filter by status', dataset: { testid: 'grading-status-filter' },
      on: { change: () => { G.status = statusSel.value; drawList(); } } },
    h('option', { value: STATUS.NEEDS_GRADING }, `Needs grading (${count(STATUS.NEEDS_GRADING)})`),
    h('option', { value: STATUS.GRADED }, `Graded (${count(STATUS.GRADED)})`),
    h('option', { value: STATUS.AUTO }, `Auto-graded (${count(STATUS.AUTO)})`),
    h('option', { value: 'all' }, `All (${byTest.length})`));
    statusSel.value = G.status;
    const search = h('input', { class: 'input adm-search', type: 'search', placeholder: 'Search name or email', 'aria-label': 'Search submissions', value: G.query, dataset: { testid: 'grading-search' } });
    const tableHost = h('div', { class: 'adm-tablewrap', dataset: { testid: 'grading-table' } });
    const refreshBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'grading-refresh' }, on: { click: () => loadRows(true) } }, icon('refresh', { size: 16 }), 'Refresh');
    const exportBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'export-grades' }, on: { click: () => {
      const list = visibleRows();
      if (!list.length) return toast('Nothing to export', { type: 'warning' });
      downloadFile(`chemistryworks-grades${G.testCode !== 'all' ? `-${G.testCode}` : ''}.csv`, toGradebookCsv(list), 'text/csv');
      const pending = list.filter((r) => r.status === STATUS.NEEDS_GRADING).length;
      toast(pending ? `Exported ${list.length} rows (${pending} still need grading)` : `Exported ${list.length} rows`, { type: pending ? 'warning' : 'success' });
    } } }, icon('download', { size: 16 }), 'Export grades');

    function drawTable() {
      const list = visibleRows();
      const body = list.map((r) => {
        const open = () => { G.selectedId = r.submission_id; draw(); };
        return h('tr', { class: 'adm-row', tabindex: '0', 'aria-label': `Grade ${r.student_name || r.student_email}`, dataset: { testid: 'grading-row' },
          on: { click: open, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } } },
        h('td', {}, r.student_name || '—'), h('td', { class: 'adm-td-email' }, r.student_email || '—'),
        h('td', {}, h('span', { class: 'adm-item__code adm-item__code--sm' }, r.test_code)),
        h('td', { class: 'adm-td-nowrap' }, fmtDate(r.timestamp)),
        h('td', {}, r.status === STATUS.NEEDS_GRADING ? h('span', { class: 'faint' }, 'Pending') : `${round2(r.score_achieved)} / ${round2(r.score_total)} (${formatPercent(r.percentage)})`),
        h('td', {}, statusPill(r.status)));
      });
      mount(tableHost, h('table', { class: 'adm-table adm-table--results' },
        h('thead', {}, h('tr', {}, ['Student', 'Email', 'Test', 'Submitted', 'Score', 'Status'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, body.length ? body : h('tr', {}, h('td', { colspan: 6, class: 'muted adm-center' },
          G.status === STATUS.NEEDS_GRADING ? 'Nothing left to grade.' : 'No matching submissions.')))));
    }
    const onSearch = debounce(() => { G.query = search.value; drawTable(); }, 120);
    cleanups.push(() => onSearch.cancel());
    search.addEventListener('input', onSearch);

    mount(content,
      h('div', { class: 'adm-toolbar adm-toolbar--wrap' },
        h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Test'), testSel),
        h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Status'), statusSel),
        h('span', { class: 'spacer' }), refreshBtn),
      G.error
        ? h('div', { class: 'card' }, emptyState('alert', 'Could not load submissions', G.error, 'grading-error'))
        : h('section', { class: 'card adm-card-results', 'aria-label': 'Submissions to grade' },
          h('div', { class: 'adm-toolbar adm-toolbar--wrap' }, h('h3', { class: 'adm-h3' }, 'Submissions'), h('span', { class: 'spacer' }), search, exportBtn),
          tableHost,
          h('p', { class: 'field__hint' }, 'Export grades downloads a CSV of final scores (name, email, score, percent) to copy into Aeries or Google Classroom.')));
    drawTable();
  }

  /* ---------------------------------------------------------------- grader */
  function drawGrader(row) {
    const responses = row.auto_responses || [];
    const saved = row.grades || {};
    const inputs = new Map(); // questionId -> { input, res }
    const totalEl = h('strong', { dataset: { testid: 'grade-total' } });
    const warnEl = h('span', { class: 'field-error', role: 'alert' });

    const currentGrades = () => {
      const out = {};
      for (const [qid, { input, res }] of inputs) {
        const v = input.value.trim();
        if (v === '') continue;
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        // Store a grade only for open-ended answers or real overrides of the auto score.
        if (res.type === 'short' || res.needsGrading || n !== Number(res.pointsEarned) || Object.prototype.hasOwnProperty.call(saved, qid)) out[qid] = n;
      }
      return out;
    };
    const missing = () => [...inputs.values()].filter(({ input, res }) => res.needsGrading && input.value.trim() === '').length;
    const updateTotal = () => {
      const t = applyGrades(responses, currentGrades());
      totalEl.textContent = `${t.scoreAchieved} / ${t.scoreTotal} (${formatPercent(t.percentage)})`;
      const m = missing();
      warnEl.textContent = m ? `${m} open-ended ${m === 1 ? 'answer needs' : 'answers need'} points.` : '';
    };

    const cards = responses.map((res, i) => {
      const possible = Number(res.pointsPossible) || 0;
      const has = Object.prototype.hasOwnProperty.call(saved, res.questionId);
      const initial = has ? saved[res.questionId] : res.needsGrading ? '' : res.pointsEarned;
      const input = h('input', { class: 'input adm-points', type: 'number', min: '0', max: String(possible), step: 'any', value: initial === '' ? '' : String(initial),
        'aria-label': `Points for question ${i + 1} (out of ${possible})`, dataset: { testid: `points-${res.questionId}` },
        on: { input: () => { clampOnBlur = true; updateTotal(); } } });
      let clampOnBlur = false;
      input.addEventListener('blur', () => {
        if (!clampOnBlur || input.value.trim() === '') return;
        const n = Math.min(possible, Math.max(0, Number(input.value) || 0));
        input.value = String(n);
        updateTotal();
      });
      inputs.set(res.questionId, { input, res });
      const set = (v) => { input.value = String(v); updateTotal(); };
      const isShort = res.type === 'short';
      const label = res.needsGrading ? 'Needs grading' : isShort && !res.answered ? 'Not answered'
        : res.isCorrect ? 'Auto: correct' : res.answered ? (res.pointsEarned > 0 ? 'Auto: partial' : 'Auto: incorrect') : 'Not answered';
      const tone = res.needsGrading ? 'pill--warning' : res.isCorrect ? 'pill--success' : res.answered && !isShort ? 'pill--danger' : '';
      return h('li', { class: ['adm-resp', 'adm-grade', res.needsGrading && 'is-pending'], dataset: { testid: 'grade-item', question: res.questionId } },
        h('div', { class: 'adm-resp__head' },
          h('strong', {}, `Q${i + 1}`),
          h('span', { class: 'faint' }, TYPE_LABELS[res.type] || res.type || ''),
          h('span', { class: ['pill', tone] }, label)),
        richText(res.questionText, 'div', 'adm-resp__q'),
        h('dl', { class: 'adm-resp__ans' },
          h('dt', {}, 'Student'), h('dd', { class: isShort ? 'adm-pre' : '' }, res.answered ? (res.givenAnswerText || '—') : h('span', { class: 'faint' }, 'Not answered')),
          (res.correctAnswerText && res.correctAnswerText !== '—') ? [h('dt', {}, isShort ? 'Sample' : 'Correct'), h('dd', { class: isShort ? 'adm-pre' : '' }, res.correctAnswerText)] : null),
        h('div', { class: 'adm-grade__pts' },
          h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Points'), input, h('span', { class: 'muted' }, `/ ${possible}`)),
          h('button', { class: 'btn btn--subtle btn--sm', type: 'button', on: { click: () => set(possible) } }, 'Full'),
          h('button', { class: 'btn btn--subtle btn--sm', type: 'button', on: { click: () => set(0) } }, 'Zero'),
          !isShort && !res.needsGrading ? h('span', { class: 'faint' }, `Auto: ${round2(res.pointsEarned)}`) : null));
    });

    const note = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Private note (only teachers see this)', dataset: { testid: 'grade-note' } });
    note.value = row.teacher_note || '';

    const list = visibleRows();
    const pos = list.findIndex((r) => r.submission_id === row.submission_id);
    const neighbor = (d) => (pos >= 0 ? list[pos + d] : null);
    const go = (r) => { G.selectedId = r ? r.submission_id : null; draw(); window.scrollTo({ top: 0 }); };

    const saveBtn = h('button', { class: 'btn btn--primary', type: 'button', dataset: { testid: 'save-grade' }, on: { click: () => save(false) } }, icon('check', { size: 16 }), 'Save grade');
    const saveNextBtn = h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'save-grade-next' }, on: { click: () => save(true) } }, 'Save & next', icon('right', { size: 16 }));

    async function save(next) {
      if (missing()) { toast('Enter points for every open-ended answer first.', { type: 'warning' }); return; }
      // Pick the next submission before saving: once graded, this one may drop out of the filtered list.
      const following = next ? neighbor(1) : null;
      for (const b of [saveBtn, saveNextBtn]) b.disabled = true;
      (next ? saveNextBtn : saveBtn).classList.add('is-loading');
      const grades = currentGrades();
      const res = await saveGrade({ gasUrl, adminKey: adminKey(), submissionId: row.submission_id, grades, note: note.value });
      if (!alive) return;
      for (const b of [saveBtn, saveNextBtn]) { b.disabled = false; b.classList.remove('is-loading'); }
      if (!res.ok) { toast(`Could not save grade: ${res.error}`, { type: 'error', timeout: 5000 }); return; }
      const raw = G.rawRows.find((r) => r.submission_id === row.submission_id);
      if (raw) {
        const gr = res.grade || {};
        Object.assign(raw, { status: STATUS.GRADED, grades: gr.grades || grades, final_score: gr.final_score ?? null, final_percentage: gr.final_percentage ?? null, graded_at: gr.graded_at || new Date().toISOString(), teacher_note: note.value });
      }
      rows = G.rawRows.map(normalizeRow);
      invalidateSheetCache();
      toast(`Saved grade for ${row.student_name || row.student_email}`, { type: 'success' });
      if (next) {
        if (following) go(following);
        else { toast('That was the last one in this list.', { type: 'info' }); go(null); }
      } else draw();
    }

    const prevBtn = h('button', { class: 'btn btn--subtle btn--sm', type: 'button', disabled: !neighbor(-1), on: { click: () => go(neighbor(-1)) } }, icon('left', { size: 16 }), 'Previous');
    const nextBtn = h('button', { class: 'btn btn--subtle btn--sm', type: 'button', disabled: !neighbor(1), on: { click: () => go(neighbor(1)) } }, 'Next', icon('right', { size: 16 }));

    mount(content,
      h('div', { class: 'adm-toolbar adm-toolbar--wrap' },
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'grading-back' }, on: { click: () => go(null) } }, icon('left', { size: 16 }), 'All submissions'),
        h('span', { class: 'spacer' }),
        pos >= 0 ? h('span', { class: 'faint' }, `${pos + 1} of ${list.length}`) : null, prevBtn, nextBtn),
      h('section', { class: 'card stack', 'aria-label': 'Submission details' },
        h('div', { class: 'adm-toolbar adm-toolbar--wrap' },
          h('h3', { class: 'adm-h3' }, row.student_name || row.student_email || 'Student'),
          statusPill(row.status)),
        h('p', { class: 'muted' }, [row.student_email, `${row.test_code}${row.test_title ? ` · ${row.test_title}` : ''}`, fmtDate(row.timestamp), formatDurationLong(row.duration_seconds),
          row.tab_switches ? `${row.tab_switches} tab switch${row.tab_switches === 1 ? '' : 'es'}` : null].filter(Boolean).join(' · ')),
        row.status === STATUS.GRADED ? h('p', { class: 'faint' }, `Graded ${fmtDate(row.graded_at)} · auto score was ${round2(row.auto_score)} / ${round2(row.score_total)}`) : null),
      cards.length ? h('ol', { class: 'adm-resps' }, cards) : h('div', { class: 'card' }, h('p', { class: 'muted' }, 'No per-question responses were stored for this submission.')),
      h('section', { class: 'card stack' }, note),
      h('div', { class: 'adm-grade__bar card' },
        h('span', {}, 'Final score: ', totalEl), warnEl, h('span', { class: 'spacer' }), saveNextBtn, saveBtn));
    updateTotal();
    renderMath(content);
    const firstPending = cards.length ? [...inputs.values()].find(({ input, res }) => res.needsGrading && input.value === '') : null;
    firstPending?.input.focus({ preventScroll: true });
  }

  loadRows();
  return () => { alive = false; cleanups.forEach((fn) => fn()); };
}
