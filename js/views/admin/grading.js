// Admin "Grading" tab: review every submission from the Google Sheet, grade open-ended answers,
// override auto-graded points, and export final scores for a gradebook (Aeries, Google Classroom).
import { h, mount, icon, richText, renderMath, toast, openModal, formatDurationLong } from '../../ui.js';
import { CONFIG } from '../../config.js';
import { load, save as saveLocal } from '../../lib/storage.js';
import { adminKey, hasAdminAuth } from '../../lib/admin-session.js';
import { fetchResults, saveGrade, releaseAll, allowRetake } from '../../lib/api.js';
import { TYPE_LABELS, MANUAL_TYPES } from '../../lib/schema.js';
import { loadTest } from '../../lib/tests.js';
import { groupQuestions } from '../../lib/sections.js';
import { cleanComments, MAX_COMMENT_CHARS } from '../../lib/comments.js';
import { commentBody, commentBankPicker } from '../comment-view.js';
import { withQuestionImage } from '../question-image.js';
import { renderGradeByQuestion, answerDiagram } from './grade-by-question.js';
import { skeleton, emptyState, downloadFile, fmtDate, round2, debounce } from './common.js';
import { normalizeRow, filterRows, sortRows, toGradebookCsv, formatPercent, applyGrades, validatePoints, isOverride, planBulk, summarizeBulk, BULK, STATUS, FILTER_RELEASED } from './stats.js';

// Module state: remembered while switching tabs in the session.
const G = { testCode: 'all', status: STATUS.NEEDS_GRADING, query: '', rawRows: null, error: '', selectedId: null, mode: 'student', selected: new Set(), perQuestion: false };

// Test definitions (for sections + answer diagrams), cached per code. A failed lookup is cached as null.
const testCache = new Map();
async function ensureTest(code) {
  if (!code || testCache.has(code)) return;
  try { testCache.set(code, (await loadTest(code, { config: CONFIG, includeDrafts: true })).test); } catch { testCache.set(code, null); }
}
// Manual (teacher-graded) answer: use the flag from the grader; old rows fall back to the type.
const isManual = (res) => (typeof res.manual === 'boolean' ? res.manual : MANUAL_TYPES.includes(res.type));

const statusPill = (status) => h('span', {
  class: ['pill', status === STATUS.NEEDS_GRADING ? 'pill--warning' : status === STATUS.GRADED ? 'pill--success' : status === STATUS.EXTRA ? 'pill--danger' : 'pill--primary'],
  dataset: { testid: 'grade-status' },
}, status);

export function renderGrading(root, ctx, { goSettings }) {
  let alive = true;
  const cleanups = [];
  const gasUrl = CONFIG.GAS_WEB_APP_URL;

  if (!gasUrl || !hasAdminAuth()) {
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

  let gbqCleanup = null;
  const stopGbq = () => { try { gbqCleanup?.(); } catch (e) { console.error(e); } gbqCleanup = null; };

  // "By student | By question" switch shown above both list views.
  const modeToggle = () => h('div', { class: 'adm-seg', role: 'tablist', 'aria-label': 'Grade by', dataset: { testid: 'grading-mode' } },
    [['student', 'By student'], ['question', 'By question']].map(([m, label]) => h('button', {
      class: 'adm-seg__btn', type: 'button', role: 'tab', 'aria-selected': String(G.mode === m), dataset: { testid: `grading-mode-${m}` },
      on: { click: () => { if (G.mode !== m) { G.mode = m; draw(); } } },
    }, label)));

  function drawByQuestion() {
    gbqCleanup = renderGradeByQuestion(content, {
      gasUrl, adminKey, getRows: () => rows, modeToggle: modeToggle(), onRefresh: () => loadRows(true),
      getTest: async (code) => { await ensureTest(code); return testCache.get(code) || null; },
      onSaved: (id, patch) => {
        const raw = G.rawRows && G.rawRows.find((r) => r.submission_id === id);
        if (raw) Object.assign(raw, patch);
        rows = (G.rawRows || []).map(normalizeRow);
      },
    });
  }

  function draw() {
    if (!alive) return;
    stopGbq();
    const selected = G.selectedId && rows.find((r) => r.submission_id === G.selectedId);
    if (selected) {
      if (testCache.has(selected.test_code)) drawGrader(selected);
      else ensureTest(selected.test_code).then(() => { if (alive && G.selectedId === selected.submission_id) drawGrader(selected); });
    } else { G.selectedId = null; if (G.mode === 'question') drawByQuestion(); else drawList(); }
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
    h('option', { value: FILTER_RELEASED }, `Released (${byTest.filter((r) => r.released_at && r.status !== STATUS.EXTRA).length})`),
    h('option', { value: STATUS.EXTRA }, `Extra attempts (${count(STATUS.EXTRA)})`),
    h('option', { value: 'all' }, `All (${byTest.filter((r) => r.status !== STATUS.EXTRA).length})`));
    statusSel.value = G.status;
    const search = h('input', { class: 'input adm-search', type: 'search', placeholder: 'Search name or email', 'aria-label': 'Search submissions', value: G.query, dataset: { testid: 'grading-search' } });
    const tableHost = h('div', { class: 'adm-tablewrap', dataset: { testid: 'grading-table' } });
    const refreshBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'grading-refresh' }, on: { click: () => loadRows(true) } }, icon('refresh', { size: 16 }), 'Refresh');
    // V3-03: release every graded / auto-graded submission of the selected test.
    const releaseAllBtn = G.testCode === 'all' ? null : h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'release-all' }, on: { click: () => {
      const code = G.testCode;
      const ready = byTest.filter((r) => (r.status === STATUS.GRADED || r.status === STATUS.AUTO) && !r.released_at).length;
      openModal({
        title: `Release all graded submissions for ${code}?`,
        testid: 'release-all-modal',
        body: ready
          ? `${ready} graded submission${ready === 1 ? '' : 's'} will be released. Students then see their score, answers and your comments by opening the test link. Submissions that still need grading are not released.`
          : 'There are no graded, unreleased submissions for this test right now. Release anyway to catch any new ones?',
        actions: [
          { label: 'Cancel', variant: 'ghost', onClick: (close) => close() },
          { label: 'Release all', variant: 'primary', testid: 'confirm-release-all', onClick: async (close) => {
            const res = await releaseAll({ gasUrl, adminKey: adminKey(), testCode: code });
            close();
            if (!res.ok) { toast(`Could not release: ${res.error}`, { type: 'error', timeout: 5000 }); return; }
            toast(`Released ${res.released} submission${res.released === 1 ? '' : 's'}`, { type: 'success' });
            loadRows(true);
          } },
        ],
      });
    } } }, icon('check', { size: 16 }), 'Release all graded');
    const perQuestionBox = h('input', { type: 'checkbox', checked: !!G.perQuestion, dataset: { testid: 'export-per-question' }, on: { change: () => { G.perQuestion = perQuestionBox.checked; } } });
    const exportBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'export-grades' }, on: { click: () => {
      const list = visibleRows();
      if (!list.length) return toast('Nothing to export', { type: 'warning' });
      downloadFile(`chemistryworks-grades${G.testCode !== 'all' ? `-${G.testCode}` : ''}.csv`, toGradebookCsv(list, { perQuestion: !!G.perQuestion }), 'text/csv');
      const pending = list.filter((r) => r.status === STATUS.NEEDS_GRADING).length;
      toast(pending ? `Exported ${list.length} rows (${pending} still need grading)` : `Exported ${list.length} rows`, { type: pending ? 'warning' : 'success' });
    } } }, icon('download', { size: 16 }), 'Export grades');

    // Bulk tools: checkboxes + a bar that loops the single-row actions with progress. Selection only ever counts visible rows.
    const bulkHost = h('div', { class: 'adm-bulk-host', dataset: { testid: 'bulk-host' } });
    const selectedRows = () => visibleRows().filter((r) => G.selected.has(r.submission_id));

    function drawBulk() {
      const sel = selectedRows();
      if (!sel.length) { mount(bulkHost); return; }
      const btn = (action, label, testid, iconName) => h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid }, on: { click: () => confirmBulk(action, label) } }, icon(iconName, { size: 14 }), label);
      mount(bulkHost, h('div', { class: 'adm-bulk', role: 'region', 'aria-label': 'Bulk actions', dataset: { testid: 'bulk-bar' } },
        h('strong', { dataset: { testid: 'bulk-count' } }, `${sel.length} selected`),
        btn(BULK.RELEASE, 'Release', 'bulk-release', 'check'),
        btn(BULK.UNRELEASE, 'Un-release', 'bulk-unrelease', 'x'),
        btn(BULK.RETAKE, 'Allow retake', 'bulk-retake', 'refresh'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: 'bulk-clear' }, on: { click: () => { G.selected.clear(); drawTable(); } } }, 'Clear')));
    }

    function confirmBulk(action, label) {
      const { eligible, skipped } = planBulk(selectedRows(), action);
      const note = {
        [BULK.RELEASE]: 'Students then see their score, answers and your comments. Submissions that still need grading, and ones already released, are skipped.',
        [BULK.UNRELEASE]: 'Students lose access to their review. Their grades are kept as they are.',
        [BULK.RETAKE]: 'Each student can submit once more. Rows that already have a retake allowed are skipped.',
      }[action];
      openModal({
        title: `${label} ${eligible.length} submission${eligible.length === 1 ? '' : 's'}?`, testid: 'bulk-modal',
        body: h('div', {}, h('p', {}, note), skipped.length ? h('p', { class: 'faint' }, `${skipped.length} selected row${skipped.length === 1 ? ' does' : 's do'} not apply and will be skipped.`) : null),
        actions: [
          { label: 'Cancel', variant: 'ghost', autofocus: true },
          { label: label, variant: 'primary', testid: 'bulk-confirm', onClick: (close) => { close(); if (eligible.length) runBulk(action, eligible, skipped.length); else toast('Nothing to do for this selection.', { type: 'info' }); } },
        ],
      });
    }

    async function runBulk(action, targets, skippedCount) {
      const bar = h('div', { class: 'adm-bulk', role: 'status', dataset: { testid: 'bulk-progress' } },
        h('progress', { max: String(targets.length), value: '0', 'aria-label': 'Bulk progress' }), h('span', {}, `0 / ${targets.length}`));
      mount(bulkHost, bar);
      let done = 0;
      let failed = 0;
      for (const [i, r] of targets.entries()) {
        let res;
        try {
          if (action === BULK.RETAKE) res = await allowRetake({ gasUrl, adminKey: adminKey(), submissionId: r.submission_id, allow: true });
          else res = await saveGrade({ gasUrl, adminKey: adminKey(), submissionId: r.submission_id, grades: r.grades || {}, note: r.teacher_note || '', release: action === BULK.RELEASE });
        } catch (e) { res = { ok: false, error: e.message }; }
        if (!alive) return;
        const raw = G.rawRows && G.rawRows.find((x) => x.submission_id === r.submission_id);
        if (res && res.ok && raw) {
          if (action === BULK.RETAKE) raw.retake_allowed_at = res.retake_allowed_at || new Date().toISOString();
          else {
            const gr = res.grade || {};
            Object.assign(raw, { status: STATUS.GRADED, grades: gr.grades || r.grades || {}, final_score: gr.final_score ?? raw.final_score ?? null, final_percentage: gr.final_percentage ?? raw.final_percentage ?? null,
              graded_at: gr.graded_at || new Date().toISOString(), released_at: gr.released_at !== undefined ? gr.released_at : (action === BULK.RELEASE ? new Date().toISOString() : '') });
          }
        }
        if (res && res.ok) done++; else failed++;
        bar.firstChild.value = String(i + 1);
        bar.lastChild.textContent = `${i + 1} / ${targets.length}`;
      }
      rows = (G.rawRows || []).map(normalizeRow);
      G.selected.clear();
      toast(summarizeBulk(action, { done, skipped: skippedCount, failed }), { type: failed ? 'warning' : 'success', timeout: 6000 });
      drawList();
    }

    function drawTable() {
      const list = visibleRows();
      const visibleIds = new Set(list.map((r) => r.submission_id));
      for (const id of [...G.selected]) if (!visibleIds.has(id)) G.selected.delete(id);
      const allBox = h('input', { type: 'checkbox', 'aria-label': 'Select all visible submissions', checked: list.length > 0 && list.every((r) => G.selected.has(r.submission_id)), disabled: !list.length, dataset: { testid: 'bulk-select-all' },
        on: { change: () => { if (allBox.checked) list.forEach((r) => G.selected.add(r.submission_id)); else G.selected.clear(); drawTable(); } } });
      const body = list.map((r) => {
        const open = () => { G.selectedId = r.submission_id; draw(); };
        const pick = h('input', { type: 'checkbox', 'aria-label': `Select ${r.student_name || r.student_email}`, checked: G.selected.has(r.submission_id), dataset: { testid: 'bulk-select' },
          on: { change: () => { if (pick.checked) G.selected.add(r.submission_id); else G.selected.delete(r.submission_id); allBox.checked = list.every((x) => G.selected.has(x.submission_id)); drawBulk(); } } });
        const stop = (e) => e.stopPropagation();
        return h('tr', { class: 'adm-row', tabindex: '0', 'aria-label': `Grade ${r.student_name || r.student_email}`, dataset: { testid: 'grading-row' },
          on: { click: open, keydown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } } } },
        h('td', { class: 'adm-td-check', on: { click: stop, keydown: stop } }, pick),
        h('td', {}, r.student_name || '—'), h('td', { class: 'adm-td-email' }, r.student_email || '—'),
        h('td', {}, h('span', { class: 'adm-item__code adm-item__code--sm' }, r.test_code)),
        h('td', { class: 'adm-td-nowrap' }, fmtDate(r.timestamp)),
        h('td', {}, r.status === STATUS.NEEDS_GRADING ? h('span', { class: 'faint' }, 'Pending') : `${round2(r.score_achieved)} / ${round2(r.score_total)} (${formatPercent(r.percentage)})`),
        h('td', {}, statusPill(r.status)),
        h('td', { dataset: { testid: 'grading-released' } }, r.released_at ? 'Yes' : '—',
          r.retake_allowed_at ? h('span', { class: 'pill pill--primary adm-retake-pill', dataset: { testid: 'retake-allowed' } }, 'Retake allowed') : null));
      });
      mount(tableHost, h('table', { class: 'adm-table adm-table--results' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'adm-td-check' }, allBox), ['Student', 'Email', 'Test', 'Submitted', 'Score', 'Status', 'Released'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, body.length ? body : h('tr', {}, h('td', { colspan: 8, class: 'muted adm-center' },
          G.status === STATUS.NEEDS_GRADING ? 'Nothing left to grade.' : 'No matching submissions.')))));
      drawBulk();
    }
    const onSearch = debounce(() => { G.query = search.value; drawTable(); }, 120);
    cleanups.push(() => onSearch.cancel());
    search.addEventListener('input', onSearch);

    mount(content,
      h('div', { class: 'adm-toolbar adm-toolbar--wrap' },
        modeToggle(),
        h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Test'), testSel),
        h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Status'), statusSel),
        h('span', { class: 'spacer' }), releaseAllBtn, refreshBtn),
      G.error
        ? h('div', { class: 'card' }, emptyState('alert', 'Could not load submissions', G.error, 'grading-error'))
        : h('section', { class: 'card adm-card-results', 'aria-label': 'Submissions to grade' },
          h('div', { class: 'adm-toolbar adm-toolbar--wrap' }, h('h3', { class: 'adm-h3' }, 'Submissions'), h('span', { class: 'spacer' }), search,
            h('label', { class: 'adm-inline adm-inline--sm', title: 'Add one points column per question to the CSV' }, perQuestionBox, h('span', {}, 'Per-question columns')), exportBtn),
          bulkHost,
          tableHost,
          h('p', { class: 'field__hint' }, 'Export grades downloads a CSV of final scores (name, email, score, percent) to copy into Aeries or Google Classroom.')));
    drawTable();
  }

  /* ---------------------------------------------------------------- grader */
  function drawGrader(row) {
    const responses = row.auto_responses || [];
    const saved = row.grades || {};
    const test = testCache.get(row.test_code) || null;
    const qById = new Map((test?.questions || []).map((q) => [q.id, q]));
    const inputs = new Map();   // questionId -> { input, res, possible, errorEl, overrideEl }
    const comments = new Map(); // questionId -> textarea
    const totalEl = h('strong', { dataset: { testid: 'grade-total' } });
    const warnEl = h('span', { class: 'field-error', role: 'alert' });

    const check = (qid) => {
      const { input, possible } = inputs.get(qid);
      return validatePoints(input.value, possible);
    };
    const currentGrades = () => {
      const out = {};
      for (const [qid, { res }] of inputs) {
        const v = check(qid);
        if (!v.ok || v.value == null) continue;
        // Store a grade only for manual answers or real overrides of the auto score.
        if (isManual(res) || res.needsGrading || isOverride(res, v.value) || Object.prototype.hasOwnProperty.call(saved, qid)) out[qid] = v.value;
      }
      return out;
    };
    const currentComments = () => {
      const map = {};
      for (const [qid, ta] of comments) map[qid] = ta.value;
      return cleanComments(map);
    };
    const missing = () => [...inputs.entries()].filter(([qid, { input, res }]) => res.needsGrading && input.value.trim() === '').length;
    const updateTotal = () => {
      const t = applyGrades(responses, currentGrades());
      totalEl.textContent = `${t.scoreAchieved} / ${t.scoreTotal} (${formatPercent(t.percentage)})`;
      const m = missing();
      warnEl.textContent = m ? `${m} open-ended ${m === 1 ? 'answer needs' : 'answers need'} points.` : '';
    };

    function buildCard(res, i) {
      const q = qById.get(res.questionId) || null;
      const possible = Number(res.pointsPossible) || 0;
      const manual = isManual(res);
      const has = Object.prototype.hasOwnProperty.call(saved, res.questionId);
      const initial = has ? saved[res.questionId] : res.needsGrading ? '' : res.pointsEarned;
      const errorEl = h('span', { class: 'adm-points__error', role: 'alert', dataset: { testid: `points-error-${res.questionId}` } });
      const overrideEl = h('span', { class: 'pill pill--warning adm-override', hidden: true, dataset: { testid: `override-${res.questionId}` } },
        icon('pen', { size: 14 }), h('span', {}));
      const input = h('input', { class: 'input adm-points', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: initial === '' ? '' : String(initial),
        'aria-label': `Points for question ${i + 1} (out of ${possible})`, 'aria-describedby': `points-error-${res.questionId}`, dataset: { testid: `points-${res.questionId}` },
        on: { input: () => refreshPoints() } });
      errorEl.id = `points-error-${res.questionId}`;
      inputs.set(res.questionId, { input, res, possible, errorEl, overrideEl });
      const refreshPoints = () => {
        const v = validatePoints(input.value, possible);
        if (v.ok) { input.removeAttribute('aria-invalid'); input.classList.remove('is-invalid'); errorEl.textContent = ''; } else {
          input.setAttribute('aria-invalid', 'true'); input.classList.add('is-invalid'); errorEl.textContent = v.error;
        }
        const over = v.ok && isOverride(res, v.value);
        overrideEl.hidden = !over;
        if (over) overrideEl.lastChild.textContent = `Override · auto ${round2(res.pointsEarned)}`;
        updateTotal();
      };
      const set = (v) => { input.value = String(round2(v)); refreshPoints(); };
      // Open responses: rubric checkboxes fill in the points box (the teacher can still type any value).
      const rubric = Array.isArray(res.rubric) && res.rubric.length ? res.rubric : null;
      const rubricBoxes = rubric ? rubric.map((r, k) => h('input', { type: 'checkbox', dataset: { testid: `rubric-${res.questionId}-${k}` },
        on: { change: () => set(rubricBoxes.reduce((sum, b, j) => sum + (b.checked ? Number(rubric[j].points) || 0 : 0), 0)) } })) : [];
      const rubricEl = rubric ? h('div', { class: 'adm-rubric' }, h('span', { class: 'field__label' }, 'Rubric'),
        h('ul', {}, rubric.map((r, k) => h('li', {}, h('label', { class: 'adm-rubric__item' }, rubricBoxes[k], richText(r.text, 'span'), h('span', { class: 'pill' }, `${r.points} pt${Number(r.points) === 1 ? '' : 's'}`)))))) : null;
      const label = res.needsGrading ? 'Needs grading' : manual && !res.answered ? 'Not answered'
        : res.isCorrect ? 'Auto: correct' : res.answered ? (res.pointsEarned > 0 ? 'Auto: partial' : 'Auto: incorrect') : 'Not answered';
      const tone = res.needsGrading ? 'pill--warning' : res.isCorrect ? 'pill--success' : res.answered && !manual ? 'pill--danger' : '';

      // Diagram of the student's answer (orbital / Lewis structure / Lewis dots) above the text.
      const diagram = answerDiagram(q, res, 'sm');
      const answerCell = res.answered
        ? [diagram ? h('div', { class: 'adm-grade__diagram' }, diagram) : null, h('div', { class: manual ? 'adm-pre' : '' }, res.givenAnswerText || '—')]
        : h('span', { class: 'faint' }, 'Not answered');

      // Comment for the student, with a live formatted preview.
      const cInit = row.comments && typeof row.comments[res.questionId] === 'string' ? row.comments[res.questionId] : '';
      const preview = h('div', { class: 'adm-comment__preview', hidden: true, dataset: { testid: `comment-preview-${res.questionId}` } });
      const ta = h('textarea', { class: 'textarea', rows: 2, maxlength: String(MAX_COMMENT_CHARS), placeholder: 'Optional comment the student will see after you release the grade',
        'aria-label': `Comment for student on question ${i + 1}`, dataset: { testid: `comment-${res.questionId}` },
        on: { input: () => renderPreview() } });
      ta.value = cInit;
      const renderPreview = () => {
        const t = ta.value.trim();
        preview.hidden = !t;
        if (!t) { preview.replaceChildren(); return; }
        preview.replaceChildren(h('span', { class: 'field__label' }, 'Preview'), commentBody(ta.value));
      };
      comments.set(res.questionId, ta);
      renderPreview();

      const quick = (name, val, text) => h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `grade-${name}-${res.questionId}` }, on: { click: () => set(val) } }, text);
      const card = h('li', { class: ['adm-resp', 'adm-grade', res.needsGrading && 'is-pending'], dataset: { testid: 'grade-item', question: res.questionId } },
        h('div', { class: 'adm-resp__head' },
          h('strong', {}, `Q${i + 1}`),
          h('span', { class: 'faint' }, TYPE_LABELS[res.type] || res.type || ''),
          h('span', { class: ['pill', tone] }, label)),
        withQuestionImage(qById.get(res.questionId), richText(res.questionText, 'div', 'adm-resp__q')),
        h('dl', { class: 'adm-resp__ans' },
          h('dt', {}, 'Student'), h('dd', {}, answerCell),
          (res.correctAnswerText && res.correctAnswerText !== '—' && !(rubric && /^Rubric:/.test(res.correctAnswerText))) ? [h('dt', {}, manual ? 'Sample' : 'Correct'), h('dd', { class: manual ? 'adm-pre' : '' }, rubric ? res.correctAnswerText.replace(/\n*Rubric:[\s\S]*$/, '') : res.correctAnswerText)] : null),
        rubricEl,
        h('div', { class: 'adm-grade__pts' },
          h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Points'), input, h('span', { class: 'muted' }, `/ ${possible}`)),
          quick('full', possible, 'Full'), quick('half', round2(possible / 2), 'Half'), quick('zero', 0, 'Zero'),
          !manual && !res.needsGrading ? h('span', { class: 'faint' }, `Auto: ${round2(res.pointsEarned)}`) : null,
          overrideEl),
        errorEl,
        h('div', { class: 'adm-comment' },
          h('label', { class: 'field__label', for: `comment-${res.questionId}` }, 'Comment for student'),
          ta,
          h('span', { class: 'field__hint' }, '**bold**, *italic*, - lists, links'),
          commentBankPicker({ testCode: row.test_code, questionId: res.questionId, getText: () => ta.value, setText: (t) => { ta.value = t; renderPreview(); }, onRubricPoints: (n) => set(Math.min(possible, n)) }),
          preview));
      ta.id = `comment-${res.questionId}`;
      refreshPoints();
      return card;
    }

    // Order + group: with the test definition, canonical section order; otherwise as stored.
    let body;
    let n = 0;
    if (test && responses.length) {
      const byQ = new Map(responses.map((r) => [r.questionId, r]));
      const used = new Set();
      const groups = groupQuestions(test, { skipEmpty: true }).map((g) => {
        const rs = g.questions.map((q) => byQ.get(q.id)).filter(Boolean);
        rs.forEach((r) => used.add(r));
        return { section: g.section, points: g.points, rs };
      }).filter((g) => g.rs.length);
      const extra = responses.filter((r) => !used.has(r));
      if (extra.length) groups.push({ section: null, points: null, rs: extra });
      body = h('div', { class: 'adm-grade__sections' }, groups.map((g) => h('section', { class: 'adm-grade__section' },
        g.section ? h('h4', { class: 'adm-grade__sectionhead', dataset: { testid: 'grade-section' } }, g.section.title || 'Section',
          h('span', { class: 'faint' }, ` · ${round2(g.points)} pt${round2(g.points) === 1 ? '' : 's'}`)) : null,
        h('ol', { class: 'adm-resps' }, g.rs.map((r) => buildCard(r, n++))))));
    } else {
      body = responses.length ? h('ol', { class: 'adm-resps' }, responses.map((r, i) => buildCard(r, i))) : null;
    }

    const note = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Private note (only teachers see this)', dataset: { testid: 'grade-note' } });
    note.value = row.teacher_note || '';

    // Who graded: saved with the grade; defaults to the name last used on this device.
    const gradedBy = h('input', { class: 'input', type: 'text', id: 'graded-by', maxlength: '200', autocomplete: 'name', placeholder: 'e.g. Ms. Rivera', dataset: { testid: 'graded-by' } });
    gradedBy.value = row.graded_by || load('gradedBy', '') || '';

    const releaseBox = h('input', { type: 'checkbox', id: 'release-grade', dataset: { testid: 'release-grade' } });
    releaseBox.checked = !!row.released_at;
    const releaseStatus = h('span', { class: 'faint', dataset: { testid: 'released-status' } },
      row.released_at ? `Released ${fmtDate(row.released_at)}` : 'Not released. Once released, the student sees this review by opening the test link.');

    const snapshot = () => JSON.stringify([currentGrades(), currentComments(), note.value, releaseBox.checked, gradedBy.value.trim()]);
    let baseline = '';
    const isDirty = () => snapshot() !== baseline;

    const list = visibleRows();
    const pos = list.findIndex((r) => r.submission_id === row.submission_id);
    const neighbor = (d) => (pos >= 0 ? list[pos + d] : null);
    const go = (r) => { G.selectedId = r ? r.submission_id : null; draw(); window.scrollTo({ top: 0 }); };

    const saveBtn = h('button', { class: 'btn btn--primary', type: 'button', dataset: { testid: 'save-grade' }, on: { click: () => saveGradeAndMaybeNext(false) } }, icon('check', { size: 16 }), 'Save grade');
    const saveNextBtn = h('button', { class: 'btn btn--ghost', type: 'button', dataset: { testid: 'save-grade-next' }, on: { click: () => saveGradeAndMaybeNext(true) } }, 'Save & next', icon('right', { size: 16 }));

    async function saveGradeAndMaybeNext(next) {
      const bad = [...inputs.keys()].find((qid) => !check(qid).ok);
      if (bad) {
        toast('Fix the highlighted points first.', { type: 'warning' });
        inputs.get(bad).input.focus();
        return;
      }
      if (missing()) { toast('Enter points for every open-ended answer first.', { type: 'warning' }); return; }
      // Pick the next submission before saving: once graded, this one may drop out of the filtered list.
      const following = next ? neighbor(1) : null;
      for (const b of [saveBtn, saveNextBtn]) b.disabled = true;
      (next ? saveNextBtn : saveBtn).classList.add('is-loading');
      const grades = currentGrades();
      const res = await saveGrade({ gasUrl, adminKey: adminKey(), submissionId: row.submission_id, grades, note: note.value, comments: currentComments(), release: releaseBox.checked, gradedBy: gradedBy.value.trim() });
      // Remember the grader's name on this device (storage save, not this function: calling that re-saved forever).
      if (gradedBy.value.trim()) saveLocal('gradedBy', gradedBy.value.trim());
      if (!alive) return;
      for (const b of [saveBtn, saveNextBtn]) { b.disabled = false; b.classList.remove('is-loading'); }
      if (!res.ok) { toast(`Could not save grade: ${res.error}`, { type: 'error', timeout: 5000 }); return; }
      if (res.warning) toast(res.warning, { type: 'warning', timeout: 12000 });
      const raw = G.rawRows.find((r) => r.submission_id === row.submission_id);
      if (raw) {
        const gr = res.grade || {};
        Object.assign(raw, {
          status: STATUS.GRADED, grades: gr.grades || grades, final_score: gr.final_score ?? null, final_percentage: gr.final_percentage ?? null,
          graded_at: gr.graded_at || new Date().toISOString(), teacher_note: note.value,
          comments: gr.comments && typeof gr.comments === 'object' ? gr.comments : currentComments(),
          graded_by: gr.graded_by !== undefined ? gr.graded_by : gradedBy.value.trim(),
          released_at: gr.released_at !== undefined ? gr.released_at : (releaseBox.checked ? (raw.released_at || new Date().toISOString()) : ''),
        });
      }
      rows = G.rawRows.map(normalizeRow);
      toast(`Saved grade for ${row.student_name || row.student_email}`, { type: 'success' });
      if (next) {
        if (following) go(following);
        else { toast('That was the last one in this list.', { type: 'info' }); go(null); }
      } else draw();
    }

    const exportBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'export-pdf' }, on: { click: async () => {
      if (isDirty()) { toast('Save the grade first', { type: 'warning' }); return; }
      try {
        const { printSubmission } = await import('./export-view.js');
        // Use the comments on screen: `row` is captured when the grader opens and goes stale after a save.
        const latest = G.rawRows.find((r) => r.submission_id === row.submission_id);
        const comments = { ...(latest && typeof latest.comments === 'object' ? latest.comments : {}), ...row.comments, ...currentComments() };
        await printSubmission({ row: { ...row, comments, graded_by: gradedBy.value.trim() }, test, includeComments: true });
      } catch (e) { toast('Could not export: ' + (e && e.message ? e.message : 'unavailable'), { type: 'error' }); }
    } } }, icon('download', { size: 16 }), 'Export PDF');

    // V3-03: allow this student one more submission (single-submission tests).
    const retakeBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'allow-retake' }, 'aria-pressed': String(!!row.retake_allowed_at),
      on: { click: async () => {
        const allow = !row.retake_allowed_at;
        retakeBtn.disabled = true;
        const res = await allowRetake({ gasUrl, adminKey: adminKey(), submissionId: row.submission_id, allow });
        retakeBtn.disabled = false;
        if (!res.ok) { toast(`Could not update retake: ${res.error}`, { type: 'error', timeout: 5000 }); return; }
        row.retake_allowed_at = allow ? (res.retake_allowed_at || new Date().toISOString()) : '';
        const raw = G.rawRows && G.rawRows.find((r) => r.submission_id === row.submission_id);
        if (raw) raw.retake_allowed_at = row.retake_allowed_at;
        retakeBtn.setAttribute('aria-pressed', String(allow));
        retakeBtn.lastChild.textContent = allow ? 'Retake allowed (undo)' : 'Allow retake';
        toast(allow ? 'This student can submit once more.' : 'Retake removed.', { type: 'success' });
      } } }, icon('refresh', { size: 16 }), h('span', {}, row.retake_allowed_at ? 'Retake allowed (undo)' : 'Allow retake'));
    const prevBtn = h('button', { class: 'btn btn--subtle btn--sm', type: 'button', disabled: !neighbor(-1), on: { click: () => go(neighbor(-1)) } }, icon('left', { size: 16 }), 'Previous');
    const nextBtn = h('button', { class: 'btn btn--subtle btn--sm', type: 'button', disabled: !neighbor(1), on: { click: () => go(neighbor(1)) } }, 'Next', icon('right', { size: 16 }));

    mount(content,
      h('div', { class: 'adm-toolbar adm-toolbar--wrap' },
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'grading-back' }, on: { click: () => go(null) } }, icon('left', { size: 16 }), 'All submissions'),
        h('span', { class: 'spacer' }),
        pos >= 0 ? h('span', { class: 'faint' }, `${pos + 1} of ${list.length}`) : null, exportBtn, prevBtn, nextBtn),
      h('section', { class: 'card stack', 'aria-label': 'Submission details' },
        h('div', { class: 'adm-toolbar adm-toolbar--wrap' },
          h('h3', { class: 'adm-h3' }, row.student_name || row.student_email || 'Student'),
          statusPill(row.status), h('span', { class: 'spacer' }), retakeBtn),
        row.status === STATUS.EXTRA ? h('p', { class: 'notice notice--warning' }, icon('alert'), h('span', {}, 'Extra attempt: this student had already submitted this one-submission test. It is stored for your records but not counted and not shown to the student.')) : null,
        h('p', { class: 'muted' }, [row.student_email, `${row.test_code}${row.test_title ? ` · ${row.test_title}` : ''}`, fmtDate(row.timestamp), formatDurationLong(row.duration_seconds),
          row.tab_switches ? `${row.tab_switches} tab switch${row.tab_switches === 1 ? '' : 'es'}` : null].filter(Boolean).join(' · ')),
        row.status === STATUS.GRADED ? h('p', { class: 'faint' }, `Graded ${fmtDate(row.graded_at)}${row.graded_by ? ` by ${row.graded_by}` : ''} · auto score was ${round2(row.auto_score)} / ${round2(row.score_total)}`) : null),
      body || h('div', { class: 'card' }, h('p', { class: 'muted' }, 'No per-question responses were stored for this submission.')),
      h('section', { class: 'card stack' },
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Graded by'), gradedBy),
        note),
      h('div', { class: 'adm-grade__bar card' },
        h('span', {}, 'Final score: ', totalEl), warnEl, h('span', { class: 'spacer' }),
        h('label', { class: 'adm-inline adm-release', for: 'release-grade' }, releaseBox, 'Release grade & comments to student'),
        releaseStatus, saveNextBtn, saveBtn));
    updateTotal();
    baseline = snapshot();
    renderMath(content);
    const firstPending = responses.length ? [...inputs.values()].find(({ input, res }) => res.needsGrading && input.value === '') : null;
    firstPending?.input.focus({ preventScroll: true });
  }

  loadRows();
  return () => { alive = false; stopGbq(); cleanups.forEach((fn) => fn()); };
}
