// "By question" grading: pick a test and a question, then grade that one question for every student in a
// column. Saves through the same saveGrade action as the per-student view, always sending the student's FULL
// grades object with only this question's points changed (mergeGrade), so nothing else is touched.
import { h, mount, icon, richText, renderMath, toast } from '../../ui.js';
import { load, save as saveLocal } from '../../lib/storage.js';
import { saveGrade } from '../../lib/api.js';
import { TYPE_LABELS, MANUAL_TYPES } from '../../lib/schema.js';
import { cleanComment, MAX_COMMENT_CHARS } from '../../lib/comments.js';
import { withQuestionImage } from '../question-image.js';
import { orbitalDiagram } from '../orbital-view.js';
import { structureDiagram } from '../structure-view.js';
import { lewisDiagram } from '../lewis-view.js';
import { hotspotDiagram } from '../widgets/hotspot-stage.js';
import { typeUI } from '../qtypes/registry.js';
import { commentBankPicker } from '../comment-view.js';
import { emptyState, fmtDate, round2 } from './common.js';
import { sortRows, validatePoints, mergeGrade, mergeComment, pendingAfter, stepIndex, STATUS } from './stats.js';

/** Diagram of a student's drawing-type answer (orbital / Lewis structure / Lewis dots / hotspot), or null. */
export function answerDiagram(q, res, size = 'sm') {
  if (!q || !res || !res.answered || res.givenAnswer == null) return null;
  try {
    if (res.type === 'orbital') return orbitalDiagram(q, res.givenAnswer, { size });
    if (res.type === 'structure') return structureDiagram(q, res.givenAnswer, { size });
    if (res.type === 'lewis') return lewisDiagram(q.element, res.givenAnswer);
    if (res.type === 'hotspot') return hotspotDiagram(q, res.givenAnswer, { size, marks: true, showTargets: true });
    if (typeUI(res.type)?.review) return typeUI(res.type).review(q, res.givenAnswer, { key: false, size });
  } catch { /* fall back to text */ }
  return null;
}

const isManual = (res) => (typeof res.manual === 'boolean' ? res.manual : MANUAL_TYPES.includes(res.type));
const findRes = (row, qid) => (row.auto_responses || []).find((x) => x && String(x.questionId) === String(qid));

/** Questions of a test found in its rows' responses: [{ id, number, text, type, manual }] in first-seen order. */
export function questionsOf(rows) {
  const out = new Map();
  for (const r of rows) for (const res of r.auto_responses || []) {
    if (!res || res.questionId == null || out.has(String(res.questionId))) continue;
    out.set(String(res.questionId), { id: String(res.questionId), number: out.size + 1, text: res.questionText || '', type: res.type || '', manual: isManual(res) });
  }
  return [...out.values()];
}

const state = { testCode: '', questionId: '', onlyPending: true };

/**
 * ctx: { gasUrl, adminKey(), getRows() -> normalized rows, getTest(code) -> Promise<test|null>, onSaved(id, patch),
 *        modeToggle: Element, onRefresh() }.  Returns a cleanup function.
 */
export function renderGradeByQuestion(root, { gasUrl, adminKey, getRows, getTest, onSaved, modeToggle, onRefresh }) {
  let alive = true;
  let seq = 0;
  const cleanups = [];
  const host = h('div', { class: 'stack adm-gbq', dataset: { testid: 'grade-by-question' } });
  mount(root, host);

  const rowsFor = (code) => getRows().filter((r) => r.test_code === code && r.status !== STATUS.EXTRA);

  async function draw() {
    if (!alive) return;
    const mine = ++seq;
    const all = getRows().filter((r) => r.status !== STATUS.EXTRA);
    const codes = [...new Set(all.map((r) => r.test_code).filter(Boolean))].sort();
    if (!codes.includes(state.testCode)) { state.testCode = codes[0] || ''; state.questionId = ''; }
    const test = state.testCode ? await getTest(state.testCode) : null;
    if (!alive || mine !== seq) return;
    const rows = rowsFor(state.testCode);
    const questions = questionsOf(rows);
    if (!questions.some((q) => q.id === state.questionId)) state.questionId = (questions.find((q) => q.manual) || questions[0] || {}).id || '';
    const q = questions.find((x) => x.id === state.questionId) || null;
    const qDef = test && q ? (test.questions || []).find((x) => String(x.id) === q.id) || null : null;

    const testSel = h('select', { class: 'select adm-select-sm', 'aria-label': 'Test', dataset: { testid: 'gbq-test' }, on: { change: () => { state.testCode = testSel.value; state.questionId = ''; draw(); } } },
      codes.map((c) => h('option', { value: c }, c)));
    testSel.value = state.testCode;
    const qSel = h('select', { class: 'select adm-select-sm adm-gbq__qsel', 'aria-label': 'Question', dataset: { testid: 'gbq-question' }, on: { change: () => { state.questionId = qSel.value; draw(); } } },
      questions.map((x) => h('option', { value: x.id }, `Q${x.number} · ${TYPE_LABELS[x.type] || x.type}${x.manual ? ' · by hand' : ''} · ${x.text.replace(/\s+/g, ' ').slice(0, 50)}`)));
    qSel.value = state.questionId;
    const pendingBox = h('input', { type: 'checkbox', checked: state.onlyPending, dataset: { testid: 'gbq-only-pending' }, on: { change: () => { state.onlyPending = pendingBox.checked; draw(); } } });

    const toolbar = h('div', { class: 'adm-toolbar adm-toolbar--wrap' },
      modeToggle,
      h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Test'), testSel),
      h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Question'), qSel),
      h('label', { class: 'adm-inline' }, pendingBox, h('span', {}, 'Only answers that need grading')),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', dataset: { testid: 'gbq-refresh' }, on: { click: () => onRefresh?.() } }, icon('refresh', { size: 16 }), 'Refresh'));

    if (!q) {
      mount(host, toolbar, h('div', { class: 'card' }, emptyState('pen', 'Nothing to grade here', 'No submissions with per-question answers were found.', 'gbq-empty')));
      return;
    }

    let list = sortRows(rows, 'timestamp', 'asc').map((r) => ({ r, res: findRes(r, q.id) })).filter((x) => x.res);
    const totalCount = list.length;
    if (state.onlyPending) list = list.filter(({ r, res }) => res.needsGrading && !(r.grades && Object.prototype.hasOwnProperty.call(r.grades, q.id)));
    const possible = Number((list[0] || { res: {} }).res.pointsPossible) || Number((rowsFor(state.testCode)[0] && findRes(rowsFor(state.testCode)[0], q.id) || {}).pointsPossible) || 0;

    const cards = list.map(({ r, res }, i) => buildCard(r, res, i));
    const cardEls = cards.map((c) => c.el);
    const focusCard = (i) => { const c = cards[stepIndex(i, 0, cards.length)]; if (c) { c.el.focus(); c.el.scrollIntoView({ block: 'nearest' }); } };

    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const idx = cardEls.findIndex((el) => el === e.target || el.contains(e.target));
      if (idx < 0) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (typing) {
        if (e.key === 'Enter' && e.target.dataset.testid === 'gbq-points' && !e.shiftKey) { e.preventDefault(); cards[idx].save().then((ok) => { if (ok) focusCard(idx + 1); }); }
        return;
      }
      if (e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') { e.preventDefault(); focusCard(idx + 1); }
      else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') { e.preventDefault(); focusCard(idx - 1); }
      else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); cards[idx].setPoints(Math.min(Number(e.key), cards[idx].possible)); }
      else if (e.key === 'Enter') { e.preventDefault(); cards[idx].save().then((ok) => { if (ok) focusCard(idx + 1); }); }
    };

    const legend = h('p', { class: 'field__hint', dataset: { testid: 'gbq-hint' } },
      'Keys: J / K or arrow keys move between students, 0-9 set points, Enter saves and moves on. Points can never exceed the question maximum.');
    mount(host, toolbar,
      h('section', { class: 'card stack', 'aria-label': `Question ${q.number}` },
        h('div', { class: 'adm-toolbar adm-toolbar--wrap' },
          h('h3', { class: 'adm-h3' }, `Q${q.number}`),
          h('span', { class: 'faint' }, TYPE_LABELS[q.type] || q.type),
          h('span', { class: 'pill' }, `${round2(possible)} pt${round2(possible) === 1 ? '' : 's'}`),
          h('span', { class: 'spacer' }), h('span', { class: 'faint', dataset: { testid: 'gbq-count' } }, `${list.length} of ${totalCount} shown`)),
        withQuestionImage(qDef, richText(q.text, 'div', 'adm-resp__q')),
        legend),
      list.length
        ? h('ol', { class: 'adm-resps adm-gbq__list', dataset: { testid: 'gbq-list' }, on: { keydown: onKey } }, cardEls)
        : h('div', { class: 'card' }, emptyState('check', 'All caught up', state.onlyPending ? 'No ungraded answers for this question. Untick the box above to see every student.' : 'No answers.', 'gbq-empty')));
    renderMath(host);
    if (cards[0]) cards[0].el.tabIndex = 0;

    function buildCard(r0, res0, i) {
      const possibleQ = Number(res0.pointsPossible) || 0;
      const qid = q.id;
      let row = r0;
      const has = r0.grades && Object.prototype.hasOwnProperty.call(r0.grades, qid);
      const initial = has ? r0.grades[qid] : res0.needsGrading ? '' : res0.pointsEarned;
      const errorEl = h('span', { class: 'adm-points__error', role: 'alert' });
      const input = h('input', { class: 'input adm-points', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: initial === '' ? '' : String(initial),
        'aria-label': `Points for ${r0.student_name || r0.student_email} (out of ${possibleQ})`, dataset: { testid: 'gbq-points' }, on: { input: () => validate() } });
      const ta = h('textarea', { class: 'textarea', rows: 2, maxlength: String(MAX_COMMENT_CHARS), placeholder: 'Optional comment the student will see after release',
        'aria-label': `Comment for ${r0.student_name || r0.student_email}`, dataset: { testid: 'gbq-comment' } });
      ta.value = typeof r0.comments?.[qid] === 'string' ? r0.comments[qid] : '';
      const status = h('span', { class: 'pill', hidden: true, dataset: { testid: 'gbq-saved' } }, 'Saved');
      const warn = h('span', { class: 'faint', dataset: { testid: 'gbq-warn' } });
      const saveBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button', dataset: { testid: 'gbq-save' }, on: { click: () => save() } }, icon('check', { size: 14 }), 'Save');
      const validate = () => {
        const v = validatePoints(input.value, possibleQ);
        input.classList.toggle('is-invalid', !v.ok);
        if (!v.ok) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
        errorEl.textContent = v.ok ? '' : v.error;
        status.hidden = true;
        return v;
      };
      const setPoints = (n) => { input.value = String(round2(n)); validate(); };
      const quick = (name, val, text) => h('button', { class: 'btn btn--subtle btn--sm', type: 'button', dataset: { testid: `gbq-${name}` }, on: { click: () => setPoints(val) } }, text);

      async function save() {
        const v = validate();
        if (!v.ok) { input.focus(); return false; }
        if (v.value == null) { toast('Enter points first.', { type: 'warning' }); input.focus(); return false; }
        const fresh = getRows().find((x) => x.submission_id === r0.submission_id) || row;
        row = fresh;
        const grades = mergeGrade(fresh.grades, qid, v.value);
        const comments = mergeComment(fresh.comments, qid, cleanComment(ta.value));
        const left = pendingAfter(fresh, grades);
        const gradedBy = load('gradedBy', '') || fresh.graded_by || '';
        saveBtn.disabled = true; saveBtn.classList.add('is-loading');
        const out = await saveGrade({ gasUrl, adminKey: adminKey(), submissionId: fresh.submission_id, grades, note: fresh.teacher_note || '', comments, ...(gradedBy ? { gradedBy } : {}) });
        if (!alive) return false;
        saveBtn.disabled = false; saveBtn.classList.remove('is-loading');
        if (!out.ok) { toast(`Could not save: ${out.error}`, { type: 'error', timeout: 5000 }); return false; }
        if (out.warning) toast(out.warning, { type: 'warning', timeout: 12000 });
        if (gradedBy) saveLocal('gradedBy', gradedBy);
        const gr = out.grade || {};
        onSaved(fresh.submission_id, {
          status: STATUS.GRADED, grades: gr.grades || grades, final_score: gr.final_score ?? null, final_percentage: gr.final_percentage ?? null,
          graded_at: gr.graded_at || new Date().toISOString(), teacher_note: fresh.teacher_note || '',
          comments: gr.comments && typeof gr.comments === 'object' ? gr.comments : comments,
          ...(gr.graded_by !== undefined ? { graded_by: gr.graded_by } : gradedBy ? { graded_by: gradedBy } : {}),
        });
        status.hidden = false;
        warn.textContent = left ? `${left} other open-ended answer${left === 1 ? '' : 's'} for this student still need${left === 1 ? 's' : ''} points.` : '';
        el.classList.remove('is-pending');
        el.classList.add('is-saved');
        return true;
      }

      const diagram = answerDiagram(qDef, res0, 'sm');
      const manual = isManual(res0);
      const el = h('li', { class: ['adm-resp', 'adm-gbq__row', res0.needsGrading && 'is-pending'], tabindex: i === 0 ? '0' : '-1', 'aria-label': `${r0.student_name || r0.student_email}, student ${i + 1}`, dataset: { testid: 'gbq-row', submission: r0.submission_id } },
        h('div', { class: 'adm-resp__head' },
          h('strong', {}, r0.student_name || r0.student_email || 'Student'), h('span', { class: 'faint' }, r0.student_name ? r0.student_email : ''),
          h('span', { class: 'faint' }, fmtDate(r0.timestamp)), status),
        res0.answered
          ? [diagram ? h('div', { class: 'adm-grade__diagram' }, diagram) : null, h('div', { class: manual ? 'adm-pre' : '', dataset: { testid: 'gbq-answer' } }, res0.givenAnswerText || '—')]
          : h('span', { class: 'faint', dataset: { testid: 'gbq-answer' } }, 'Not answered'),
        h('div', { class: 'adm-grade__pts' },
          h('label', { class: 'adm-inline' }, h('span', { class: 'field__label' }, 'Points'), input, h('span', { class: 'muted' }, `/ ${possibleQ}`)),
          quick('full', possibleQ, 'Full'), quick('half', round2(possibleQ / 2), 'Half'), quick('zero', 0, 'Zero'),
          !manual && !res0.needsGrading ? h('span', { class: 'faint' }, `Auto: ${round2(res0.pointsEarned)}`) : null, saveBtn),
        errorEl, warn,
        h('div', { class: 'adm-comment' }, ta,
          commentBankPicker({ testCode: state.testCode, questionId: qid, getText: () => ta.value, setText: (t) => { ta.value = t; status.hidden = true; }, onRubricPoints: setPoints })));
      return { el, save, setPoints, possible: possibleQ };
    }
  }

  draw();
  return () => { alive = false; cleanups.forEach((fn) => fn()); };
}
