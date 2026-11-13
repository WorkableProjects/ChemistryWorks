// Assign dialog: library test, one or more classes, opens / due, late, instructions, modes, required, publish later.
import { h, openModal, toast } from '../../../ui.js';
import { field } from '../common.js';
import { loadTest } from '../../../lib/tests.js';
import { modesForTest } from '../../../lib/modes/index.js';
import { saveAssignment } from '../../../lib/api.js';
import { publishedTestsResource } from '../data.js';
import { assignmentsRes, creds, toLocalInput, fromLocalInput } from './data.js';

/**
 * `assignment` edits one; `copyFrom` pre-fills a new one ("Copy to class"); `classId` pre-selects a class.
 * `classes` is the class list ([{ id, name, period }]).
 */
export function openAssignDialog(ctx, { classes, classId = '', assignment = null, copyFrom = null, onSaved } = {}) {
  const src = assignment || copyFrom || {};
  const editing = !!assignment;
  const fresh = !assignment && !copyFrom;
  const tests = publishedTestsResource();
  const test = h('select', { class: 'select', 'aria-label': 'Test', dataset: { testid: 'assign-test' } }, h('option', { value: '' }, 'Loading tests'));
  const fillTests = (list) => {
    const cur = test.value || src.testCode || '';
    test.replaceChildren(h('option', { value: '' }, 'Choose a test'), ...list.map((t) => h('option', { value: t.code, selected: t.code === cur }, `${t.code} · ${t.title}`)));
    if (cur && !list.some((t) => t.code === cur)) test.append(h('option', { value: cur, selected: true }, cur));
    if (cur) test.value = cur;
  };
  if (tests.peek()) fillTests(tests.peek());
  tests.get().then(fillTests).catch(() => { test.replaceChildren(h('option', { value: src.testCode || '' }, src.testCode || 'Could not load tests')); });

  const picked = new Set(editing ? [src.classId] : (fresh && classId ? [classId] : []));
  const classBoxes = (classes || []).map((c) => {
    const box = h('input', { type: 'checkbox', checked: picked.has(c.id), disabled: editing, dataset: { testid: `assign-class-${c.id}` },
      on: { change: () => { if (box.checked) picked.add(c.id); else picked.delete(c.id); } } });
    return h('label', { class: 'row' }, box, h('span', {}, c.name, c.period ? ` · Period ${c.period}` : ''));
  });

  const opens = h('input', { class: 'input', type: 'datetime-local', value: toLocalInput(src.opensAt), dataset: { testid: 'assign-opens' } });
  const due = h('input', { class: 'input', type: 'datetime-local', value: toLocalInput(src.dueAt), dataset: { testid: 'assign-due' } });
  const publish = h('input', { class: 'input', type: 'datetime-local', value: toLocalInput(src.publishAt), dataset: { testid: 'assign-publish' } });
  const late = h('input', { type: 'checkbox', checked: src.lateAllowed !== false, dataset: { testid: 'assign-late' } });
  const required = h('input', { type: 'checkbox', checked: fresh ? true : !!src.required, dataset: { testid: 'assign-required' } });
  const instructions = h('textarea', { class: 'textarea', rows: 3, maxlength: '2000', dataset: { testid: 'assign-instructions' } });
  instructions.value = src.instructions || '';
  // Only classes linked to a Google Classroom course can post there; an assignment is posted once.
  const linked = (classes || []).some((c) => c.classroomCourseId);
  const toClassroom = h('input', { type: 'checkbox', checked: false, disabled: !linked || !!src.classroomCourseWorkId, dataset: { testid: 'assign-classroom' } });

  // Allowed modes come from the chosen test; every box ticked (or none) = every mode the test offers.
  const modeHost = h('div', { class: 'hub-modes', dataset: { testid: 'assign-modes' } });
  let modeBoxes = [];
  const wantedModes = new Set(src.modes || []);
  async function drawModes() {
    const code = test.value;
    modeBoxes = [];
    if (!code) { modeHost.replaceChildren(h('p', { class: 'faint' }, 'Choose a test to see its modes')); return; }
    modeHost.replaceChildren(h('p', { class: 'faint' }, 'Loading modes'));
    try {
      const { test: t } = await loadTest(code, { config: ctx.config });
      if (test.value !== code) return;
      const rows = modesForTest(t).filter((m) => m.available);
      modeBoxes = rows.map((m) => ({ id: m.mode.id, box: h('input', { type: 'checkbox', checked: !wantedModes.size || wantedModes.has(m.mode.id) }) }));
      modeHost.replaceChildren(...rows.map((m, i) => h('label', { class: 'row' }, modeBoxes[i].box, h('span', {}, m.mode.label || m.mode.id))));
    } catch { modeHost.replaceChildren(h('p', { class: 'faint' }, 'Modes are not available for this test. Students can use any mode it offers.')); }
  }
  test.addEventListener('change', drawModes);
  drawModes();

  const err = h('p', { class: 'field-error', role: 'alert' });
  return openModal({
    title: editing ? 'Edit assignment' : copyFrom ? 'Copy to class' : 'Assign a test', testid: 'assignment-form', wide: true,
    body: h('div', { class: 'stack hub-admin' },
      field('Test', test),
      h('fieldset', { class: 'hub-fieldset' }, h('legend', { class: 'field__label' }, 'Classes'), ...(classBoxes.length ? classBoxes : [h('p', { class: 'faint' }, 'Create a class first')])),
      h('div', { class: 'hub-grid' }, field('Opens', opens, 'Leave empty to open now'), field('Due', due)),
      h('label', { class: 'row' }, late, h('span', {}, 'Allow late work')),
      h('label', { class: 'row' }, required, h('span', {}, 'Required (otherwise optional practice)')),
      h('label', { class: 'row', title: linked ? '' : 'Link a class to Google Classroom first (Classes)' }, toClassroom,
        h('span', {}, src.classroomCourseWorkId ? 'Posted to Google Classroom' : 'Post to Google Classroom', linked ? null : h('span', { class: 'faint' }, ' · link a class first'))),
      field('Instructions', instructions),
      h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Allowed modes'), modeHost),
      field('Publish later', publish, 'Students see it from this time. Leave empty to publish now'),
      err),
    actions: [{ label: 'Cancel', variant: 'ghost' }, { label: editing ? 'Save' : 'Assign', variant: 'primary', testid: 'assign-save', onClick: async (close) => {
      err.textContent = '';
      if (!test.value) { err.textContent = 'Choose a test'; return; }
      if (!picked.size) { err.textContent = 'Choose at least one class'; return; }
      const chosen = modeBoxes.filter((x) => x.box.checked).map((x) => x.id);
      const modes = chosen.length === modeBoxes.length ? [] : chosen;
      const base = { testCode: test.value, instructions: instructions.value.trim(), opensAt: fromLocalInput(opens.value), dueAt: fromLocalInput(due.value),
        lateAllowed: late.checked, required: required.checked, modes, publishAt: fromLocalInput(publish.value),
        ...(toClassroom.checked ? { postToClassroom: true } : {}) };
      const targets = editing ? [src.classId] : [...picked];
      const out = await assignmentsRes().optimistic((d) => d, async () => {
        const rs = await Promise.all(targets.map((cid) => saveAssignment({ ...creds(), assignment: { ...base, classId: cid, ...(editing ? { id: src.id } : {}) } })));
        const bad = rs.find((r) => !r.ok);
        if (bad) throw new Error(bad.error || 'Request failed');
        const cErr = rs.find((r) => r.data.classroomError);
        if (cErr) toast(`Saved, but not posted to Google Classroom (${cErr.data.classroomError.replace(/_/g, ' ')})`, { type: 'warning', timeout: 8000 });
        return { ok: true, rows: rs.map((r) => r.data.assignment).filter(Boolean) };
      }, { message: 'Could not save the assignment', retry: false,
        onSuccess: (d, r) => { const ids = new Set(r.rows.map((x) => x.id)); return [...(d || []).filter((x) => !ids.has(x.id)), ...r.rows]; } });
      if (!out.ok) { err.textContent = out.error && out.error.message ? out.error.message : 'Could not save'; return; }
      close();
      toast(editing ? 'Assignment saved' : `Assigned to ${targets.length} class${targets.length === 1 ? '' : 'es'}`, { type: 'success' });
      onSaved?.(out.result.rows);
    } }],
  });
}
