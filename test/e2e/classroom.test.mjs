// Google Classroom, end to end against the stateful mock backend: link a course and import its roster, assign with
// Post to Classroom, preview and sync grades (draft until released), and the overwrite guard.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, newSession, tid, poll, waitText, unlockAdmin, withAdminKey, createMockBackend, adhocTest } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const CODE = 'CLS1';
const [ADA, BEN, CY, DEE] = ['ada@example.org', 'ben@example.org', 'cy@example.org', 'dee@example.org'];

test('link, import roster, post, preview, sync, and keep a teacher-changed grade unless overwrite is ticked', async () => {
  const be = createMockBackend({
    classes: [{ id: 'c1', name: 'Period 3 Chemistry', period: '3', emails: [ADA] }],
    tests: [{ code: CODE, title: 'Classroom quiz' }],
    students: { [ADA]: 'Ada Lovelace', [BEN]: 'Ben Okafor', [CY]: 'Cy Young', [DEE]: 'Dee Dee' },
  });
  be.classroom.addCourse({ id: 'crs1', name: 'Chemistry 3', section: 'P3' }, [ADA, BEN, CY, DEE]);
  const teacher = await newSession(env);
  try {
    be.attach(teacher); teacher.serveTest(CODE, adhocTest(CODE, { title: 'Classroom quiz' }));
    await withAdminKey(teacher);
    const { page, url } = teacher;
    await unlockAdmin(page, url);
    await page.locator(tid('tab-classes')).click();

    // 1. Link the course (the picker says which account syncs) and import the roster.
    await page.locator(tid('class-link-c1')).click();
    await waitText(page.locator(tid('link-account')), 'Syncs as sync@school.example');
    await page.locator(tid('course-crs1')).check();
    await page.locator(tid('link-save')).click();
    await page.locator(tid('class-linked-c1')).waitFor();
    assert.equal(be.state.classes[0].classroomCourseId, 'crs1');
    await page.locator(tid('class-import-c1')).click();
    await page.locator(tid('import-run')).click();
    await poll(() => be.state.classes[0].emails.length === 4, { message: 'roster imported' });
    await page.locator(tid('toast')).filter({ hasText: '3 added' }).waitFor();
    // The auto-sync switch is saved on the class.
    // The roster import re-renders the class card, so click until the switch has saved (it is a visually hidden input).
    const autosync = page.locator(tid('class-autosync-c1'));
    await poll(async () => {
      if (!await autosync.isChecked()) await autosync.click({ force: true });
      return be.state.calls.some((c) => c.action === 'saveClass' && c.cls.autoSyncClassroom === true);
    }, { message: 'autoSyncClassroom saved' });

    // 2. Assign with Post to Classroom.
    await page.locator(tid('class-open-c1')).click();
    await page.locator(tid('class-tab-assignments')).click();
    await page.locator(tid('assign-btn')).click();
    await page.locator(tid('assign-test')).selectOption(CODE);
    await page.locator(tid('assign-classroom')).check({ force: true });
    await page.locator(tid('assign-save')).click();
    await page.locator(tid('toast')).filter({ hasText: 'Assigned to 1 class' }).waitFor();
    const [assignment] = be.state.assignments;
    assert.ok(assignment.classroomCourseWorkId, 'posted to Classroom');
    assert.equal(be.state.calls.find((c) => c.action === 'saveAssignment').postToClassroom, true);

    // 3. Three students graded, one of them released.
    be.classroom.grade(ADA, CODE, 8, 10, true);
    be.classroom.grade(BEN, CODE, 6, 10, false);
    be.classroom.grade(CY, CODE, 9, 10, false);

    // 4. The preview: assigned, draft, draft and a skip.
    await page.locator(`${tid(`assignment-${assignment.id}`)} .hub-item__main`).click();
    await page.locator(tid('tracker')).waitFor();
    await page.locator(tid('sync-grades')).click();
    await page.locator(tid(`sync-row-${ADA}`)).waitFor();
    await waitText(page.locator(tid('sync-account')), 'Syncs as sync@school.example');
    await waitText(page.locator(tid(`sync-action-${ADA}`)), 'Send and release');
    await waitText(page.locator(tid(`sync-action-${BEN}`)), 'Send as draft');
    await waitText(page.locator(tid(`sync-action-${CY}`)), 'Send as draft');
    await waitText(page.locator(tid(`sync-action-${DEE}`)), 'Skip: not graded yet');

    // 5. Sync (two pages on the cursor), then the tracker shows Synced.
    await page.locator(tid('sync-run')).click();
    await waitText(page.locator(tid('sync-result')), '3 synced, 0 failed, 1 skipped');
    assert.equal(be.state.calls.filter((c) => c.action === 'syncGrades').length, 2, 'looped on the cursor');
    assert.deepEqual(be.state.classroom.cw[assignment.id][ADA], { draft: 8, assigned: 8, sent: 8, state: 'assigned' });
    assert.equal(be.state.classroom.cw[assignment.id][BEN].assigned, undefined, 'unreleased stays a draft');
    await page.locator(tid('sync-close')).click();
    await page.locator(`${tid(`tracker-sync-${ADA}`)}[data-sync="synced"]`).waitFor();
    await page.locator(`${tid(`tracker-sync-${BEN}`)}[data-sync="synced"]`).waitFor();
    assert.match(await page.locator(tid(`tracker-sync-${CY}`)).textContent(), /^Synced/);
    assert.equal(await page.locator(tid(`tracker-sync-${DEE}`)).getAttribute('data-sync'), 'none');

    // 6. A grade the teacher changed in Classroom is skipped unless Overwrite is ticked.
    be.classroom.setClassroomGrade(assignment.id, BEN, { draft: 3 });
    await page.locator(tid('sync-grades')).click();
    await waitText(page.locator(tid(`sync-action-${BEN}`)), 'Skip: changed in Classroom');
    await page.locator(tid('sync-run')).click();
    await waitText(page.locator(tid('sync-result')), /^0 synced/);
    assert.equal(be.state.classroom.cw[assignment.id][BEN].draft, 3, 'kept the teacher\'s grade');
    await page.locator(tid('sync-close')).click();
    await page.locator(tid('sync-grades')).click();
    await page.locator(tid('sync-overwrite')).check();
    await page.locator(tid('sync-run')).click();
    await waitText(page.locator(tid('sync-result')), /^1 synced/);
    assert.equal(be.state.classroom.cw[assignment.id][BEN].draft, 6, 'overwritten');
    await page.locator(tid('sync-close')).click();

    // Deleting asks about the Classroom coursework too.
    await page.locator('[aria-label="Delete assignment"]').click();
    await page.locator(tid('delete-in-classroom')).check();
    await page.locator(tid('assignment-delete-confirm')).click();
    await poll(() => be.state.calls.some((c) => c.action === 'deleteAssignment' && c.deleteInClassroom === true), { message: 'deleted in Classroom too' });

    assert.deepEqual(teacher.errors, []);
  } finally {
    await teacher.close();
  }
});

test('a failed student shows the plain error and Retry sends again', async () => {
  const be = createMockBackend({
    classes: [{ id: 'c1', name: 'Period 3', period: '3', emails: [ADA], classroomCourseId: 'crs1' }],
    tests: [{ code: CODE, title: 'Classroom quiz' }], students: { [ADA]: 'Ada Lovelace' },
  });
  be.classroom.addCourse({ id: 'crs1', name: 'Chemistry 3' }, [ADA]);
  be.state.assignments.push({ id: 'asg1', classId: 'c1', testCode: CODE, title: 'Classroom quiz', classroomCourseWorkId: 'cw1', lateAllowed: true, modes: [], createdAt: new Date().toISOString() });
  be.classroom.grade(ADA, CODE, 7, 10, false);
  be.state.classroom.failEmails = [ADA];
  const teacher = await newSession(env);
  try {
    be.attach(teacher); await withAdminKey(teacher);
    const { page, url } = teacher;
    await unlockAdmin(page, url);
    await page.locator(tid('tab-classes')).click();
    await page.locator(tid('class-open-c1')).click();
    await page.locator(tid('class-tab-assignments')).click();
    await page.locator(`${tid('assignment-asg1')} .hub-item__main`).click();
    await page.locator(tid('sync-grades')).click();
    await page.locator(tid('sync-run')).click();
    await waitText(page.locator(tid('sync-result')), /^0 synced, 1 failed/);
    await page.locator(tid('sync-close')).click();
    await waitText(page.locator(tid(`tracker-sync-${ADA}`)), /^This assignment was made in Classroom, not here\. Post it from ChemistryWorks to sync grades\./);
    be.state.classroom.failEmails = [];
    await page.locator(tid(`tracker-retry-${ADA}`)).click();
    await page.locator(`${tid(`tracker-sync-${ADA}`)}[data-sync="synced"]`).waitFor();
    assert.equal(be.state.classroom.cw.asg1[ADA].draft, 7);
    assert.deepEqual(teacher.errors, []);
  } finally {
    await teacher.close();
  }
});
