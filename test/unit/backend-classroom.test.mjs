// Google Classroom backend: manifest, courses, roster import, coursework, publish trigger, grade preview and sync,
// the overwrite guard, cursor resume, error mapping and auto-sync on release.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeGas, plain } from './helpers/gas.mjs';
import { makeFakeClassroom } from './helpers/fake-classroom.mjs';

const TEACHER = 'teacher@school.org';
const COURSE = 'c1';
const HOUR = 3600000;
const iso = (ms) => new Date(ms).toISOString();
const PROJECT_DENIED = { message: '@ProjectPermissionDenied The Developer Console project is not permitted to make this request.', code: 403 };
const NOT_TEACHER = { message: 'API call to classroom.courses.list failed with error: The caller does not have permission', code: 403 };

let g;
let fc;

beforeEach(() => {
  g = makeGas({ SITE_URL: 'https://chem.example.org/' });
  fc = makeFakeClassroom();
  g.ctx.Classroom = fc.service;
  g.ctx.Session.getEffectiveUser = () => ({ getEmail: () => TEACHER });
  fc.addCourse({ id: COURSE, name: 'Chem P1', section: 'P1' });
});

const mkTest = (code = 'T1') => g.A({
  action: 'publishTest',
  test: { code, title: `Test ${code}`, questions: [
    { id: 'q1', type: 'truefalse', text: 'x', correctAnswer: true, points: 5 },
    { id: 'q2', type: 'truefalse', text: 'y', correctAnswer: true, points: 5 }] },
});

// A class linked to the fake course, plus a test and an assignment posted to Classroom (10 points).
function setup(emails, { inCourse = emails, over = {}, autoSync = false } = {}) {
  inCourse.forEach((e) => fc.addStudent(COURSE, e));
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails, ...(autoSync ? { autoSyncClassroom: true } : {}) } }).cls;
  const linked = g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: COURSE });
  assert.equal(linked.result, 'success');
  mkTest();
  const r = g.A({ action: 'saveAssignment', postToClassroom: true, assignment: { classId: cls.id, testCode: 'T1', title: 'Quiz', ...over } });
  assert.equal(r.result, 'success');
  assert.ok(r.assignment.classroomCourseWorkId, JSON.stringify(plain(r)));
  return { cls, a: plain(r.assignment), cw: r.assignment.classroomCourseWorkId };
}

const sub = (email, over = {}) => g.addSubmission({
  Timestamp: iso(g.clock), 'Student Name': email, 'Student Email': email, 'Test Code': 'T1', 'Submission ID': `sub-${email}`,
  Status: 'Auto-graded', 'Score Achieved': 8, 'Total Score': 10, 'Percentage (%)': 80, ...over,
});
const released = (over = {}) => ({ 'Released At': iso(g.clock), ...over });
const setCell = (email, header, value) => {
  const heads = plain(g.run('SUBMISSION_HEADERS'));
  const row = g.sheets.get('Submissions').rows.find((r, i) => i > 0 && r[3] === email);
  row[heads.indexOf(header)] = value;
};
const preview = (a) => plain(g.A({ action: 'previewGradeSync', assignmentId: a.id }));
const byEmail = (r) => Object.fromEntries(r.rows.map((x) => [x.email, x]));
const sync = (a, extra = {}) => plain(g.A({ action: 'syncGrades', assignmentId: a.id, ...extra }));
const patches = () => fc.callsTo('submissions.patch');

// ---------- manifest ----------

test('manifest: Classroom advanced service and every scope the script needs', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../../apps-script/appsscript.json', import.meta.url), 'utf8'));
  const svc = m.dependencies.enabledAdvancedServices.find((s) => s.userSymbol === 'Classroom');
  assert.deepEqual({ id: svc.serviceId, version: svc.version }, { id: 'classroom', version: 'v1' });
  for (const scope of ['classroom.courses.readonly', 'classroom.rosters.readonly', 'classroom.profile.emails', 'classroom.coursework.students']) {
    assert.ok(m.oauthScopes.includes(`https://www.googleapis.com/auth/${scope}`), scope);
  }
  const code = fs.readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8');
  const needs = { SpreadsheetApp: 'spreadsheets', UrlFetchApp: 'script.external_request', ScriptApp: 'script.scriptapp', MailApp: 'script.send_mail', 'Session.getEffectiveUser': 'userinfo.email' };
  for (const [used, scope] of Object.entries(needs)) {
    assert.ok(code.includes(used), `${used} is used`);
    assert.ok(m.oauthScopes.includes(`https://www.googleapis.com/auth/${scope}`), `${scope} for ${used}`);
  }
});

test('every Classroom action needs an admin', () => {
  for (const body of [{ action: 'listClassroomCourses' }, { action: 'linkClassroomCourse', classId: 'x', courseId: COURSE },
    { action: 'importClassroomRoster', classId: 'x' }, { action: 'previewGradeSync', assignmentId: 'x' }, { action: 'syncGrades', assignmentId: 'x' }]) {
    assert.equal(g.post(body).error, 'unauthorized', body.action);
    assert.equal(g.post({ ...body, idToken: g.login('ada@x.org') }).result, 'error', `${body.action} with a student token`);
  }
  assert.equal(fc.calls.length, 0);
});

// ---------- courses ----------

test('listClassroomCourses: active courses only, every page, with the sync account', () => {
  fc = makeFakeClassroom({ pageSize: 2 });
  g.ctx.Classroom = fc.service;
  fc.addCourse({ id: 'a', name: 'A', section: 'S1', room: 'R1' });
  fc.addCourse({ id: 'b', name: 'B' });
  fc.addCourse({ id: 'old', name: 'Old', courseState: 'ARCHIVED' });
  fc.addCourse({ id: 'd', name: 'D' });
  const r = plain(g.A({ action: 'listClassroomCourses' }));
  assert.equal(r.result, 'success');
  assert.deepEqual(r.courses.map((c) => c.id), ['a', 'b', 'd']);
  assert.deepEqual(r.courses[0], { id: 'a', name: 'A', section: 'S1', room: 'R1', courseState: 'ACTIVE' });
  assert.equal(r.syncAccount, TEACHER);
  const calls = fc.callsTo('courses.list');
  assert.equal(calls.length, 2, 'two pages');
  assert.equal(calls[0].args.opt.teacherId, 'me');
  assert.deepEqual(calls[0].args.opt.courseStates, ['ACTIVE']);
});

test('linkClassroomCourse: links, unlinks, and rejects courses that are not the account\'s active courses', () => {
  fc.addCourse({ id: 'old', name: 'Old', courseState: 'ARCHIVED' });
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: ['a@x.org'] } }).cls;
  assert.equal(g.A({ action: 'linkClassroomCourse', classId: 'nope', courseId: COURSE }).error, 'not_found');
  assert.equal(g.A({ action: 'linkClassroomCourse', courseId: COURSE }).error, 'invalid_request');
  assert.equal(g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: 'zzz' }).error, 'classroom_course_not_found');
  assert.equal(g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: 'old' }).error, 'classroom_course_not_found');
  const ok = plain(g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: COURSE }));
  assert.deepEqual({ ...ok, result: undefined }, { result: undefined, classId: cls.id, classroomCourseId: COURSE, courseName: 'Chem P1', syncAccount: TEACHER });
  assert.equal(plain(g.A({ action: 'listClasses' }).classes)[0].classroomCourseId, COURSE);
  const off = plain(g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: '' }));
  assert.equal(off.classroomCourseId, '');
  assert.equal(plain(g.A({ action: 'listClasses' }).classes)[0].classroomCourseId, '');
  assert.ok(g.rows('Log').some((r) => r[2] === 'linkClassroomCourse' && r[3] === cls.id));
});

test('saveClass keeps the Classroom link and sets the auto-sync setting', () => {
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: ['a@x.org'] } }).cls;
  g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: COURSE });
  g.A({ action: 'saveClass', cls: { id: cls.id, name: 'P1 renamed', emails: ['a@x.org', 'b@x.org'] } });
  let c = plain(g.A({ action: 'listClasses' }).classes)[0];
  assert.equal(c.classroomCourseId, COURSE);
  assert.equal(c.autoSyncClassroom, false);
  g.A({ action: 'saveClass', cls: { id: cls.id, name: 'P1', emails: ['a@x.org'], autoSyncClassroom: true } });
  c = plain(g.A({ action: 'listClasses' }).classes)[0];
  assert.equal(c.autoSyncClassroom, true);
  assert.equal(c.classroomCourseId, COURSE);
  g.A({ action: 'saveClass', cls: { id: cls.id, name: 'P1', emails: ['a@x.org'] } });
  assert.equal(plain(g.A({ action: 'listClasses' }).classes)[0].autoSyncClassroom, true, 'omitting the field leaves it alone');
});

// ---------- roster import ----------

test('importClassroomRoster: merges lower-cased emails across pages and counts students without an email', () => {
  fc = makeFakeClassroom({ pageSize: 2 });
  g.ctx.Classroom = fc.service;
  fc.addCourse({ id: COURSE, name: 'Chem P1' });
  ['Ann@X.org', 'old@x.org', 'new2@x.org'].forEach((e) => fc.addStudent(COURSE, e));
  fc.addStudent(COURSE, '');
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: ['old@x.org', 'keep@x.org'] } }).cls;
  assert.equal(g.A({ action: 'importClassroomRoster', classId: cls.id }).error, 'classroom_not_linked');
  g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: COURSE });
  const r = plain(g.A({ action: 'importClassroomRoster', classId: cls.id }));
  assert.deepEqual({ added: r.added, total: r.total, skippedNoEmail: r.skippedNoEmail, syncAccount: r.syncAccount }, { added: 2, total: 4, skippedNoEmail: 1, syncAccount: TEACHER });
  assert.deepEqual(plain(g.A({ action: 'listClasses' }).classes)[0].emails.sort(), ['ann@x.org', 'keep@x.org', 'new2@x.org', 'old@x.org']);
  assert.equal(fc.callsTo('students.list').length, 2, 'two pages per import');
  const again = plain(g.A({ action: 'importClassroomRoster', classId: cls.id }));
  assert.equal(again.added, 0);
  const rep = plain(g.A({ action: 'importClassroomRoster', classId: cls.id, mode: 'replace' }));
  assert.deepEqual({ added: rep.added, total: rep.total }, { added: 0, total: 3 });
  assert.deepEqual(plain(g.A({ action: 'listClasses' }).classes)[0].emails.sort(), ['ann@x.org', 'new2@x.org', 'old@x.org']);
  assert.ok(g.rows('Log').some((r2) => r2[2] === 'importClassroomRoster'));
});

test('importClassroomRoster: unknown class and Classroom errors', () => {
  assert.equal(g.A({ action: 'importClassroomRoster', classId: 'nope' }).error, 'not_found');
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: [] } }).cls;
  g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: COURSE });
  fc.inject('students.list', NOT_TEACHER);
  assert.equal(g.A({ action: 'importClassroomRoster', classId: cls.id }).error, 'classroom_not_teacher');
  fc.clearInjected();
  fc.inject('students.list', { message: 'Requested entity was not found.', code: 404 });
  assert.equal(g.A({ action: 'importClassroomRoster', classId: cls.id }).error, 'classroom_course_not_found');
});

// ---------- coursework ----------

test('saveAssignment with postToClassroom creates the coursework and stores its id', () => {
  const dueAt = '2026-11-20T15:45:00.000Z';
  const { a, cw } = setup(['a@x.org'], { over: { instructions: 'Read chapter 3', dueAt } });
  const created = fc.callsTo('work.create');
  assert.equal(created.length, 1);
  const { resource, courseId } = created[0].args;
  assert.equal(courseId, COURSE);
  assert.equal(resource.title, 'Quiz');
  assert.ok(resource.description.includes('Read chapter 3'));
  assert.ok(resource.description.includes('https://chem.example.org/?code=T1'));
  assert.equal(resource.maxPoints, 10);
  assert.equal(resource.workType, 'ASSIGNMENT');
  assert.equal(resource.state, 'PUBLISHED');
  assert.deepEqual(resource.dueDate, { year: 2026, month: 11, day: 20 });
  assert.deepEqual(resource.dueTime, { hours: 15, minutes: 45 });
  assert.deepEqual(resource.materials, [{ link: { url: 'https://chem.example.org/?code=T1', title: 'Quiz' } }]);
  assert.equal(a.classroomCourseWorkId, cw);
  assert.equal(g.rows('Assignments')[0][13], cw, 'stored in the Assignments sheet');
  assert.equal(plain(g.A({ action: 'listAssignments' }).assignments)[0].classroomCourseWorkId, cw);
});

test('saveAssignment: reports the Classroom state and syncs the account', () => {
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: [] } }).cls;
  g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: COURSE });
  mkTest();
  const r = plain(g.A({ action: 'saveAssignment', postToClassroom: true, assignment: { classId: cls.id, testCode: 'T1' } }));
  assert.equal(r.classroomState, 'PUBLISHED');
  assert.equal(r.syncAccount, TEACHER);
  assert.equal(r.classroomError, undefined);
});

test('saveAssignment: saving again updates the same coursework instead of creating another', () => {
  const { cls, a, cw } = setup(['a@x.org']);
  const r = plain(g.A({ action: 'saveAssignment', postToClassroom: true, assignment: { id: a.id, classId: cls.id, testCode: 'T1', title: 'Renamed', instructions: 'New text' } }));
  assert.equal(r.assignment.classroomCourseWorkId, cw);
  assert.equal(fc.callsTo('work.create').length, 1);
  assert.equal(fc.callsTo('work.patch').length, 1);
  assert.equal(fc.workOf(COURSE, cw).title, 'Renamed');
  assert.equal(fc.work[COURSE].length, 1);
  const keep = plain(g.A({ action: 'saveAssignment', assignment: { id: a.id, classId: cls.id, testCode: 'T1', title: 'Edited locally' } }));
  assert.equal(keep.assignment.classroomCourseWorkId, cw, 'a save without postToClassroom keeps the link');
  assert.equal(fc.callsTo('work.patch').length, 1, 'and does not call Classroom');
});

test('saveAssignment: coursework deleted in Classroom is created again on the next post', () => {
  const { cls, a, cw } = setup(['a@x.org']);
  fc.work[COURSE] = [];
  const r = plain(g.A({ action: 'saveAssignment', postToClassroom: true, assignment: { id: a.id, classId: cls.id, testCode: 'T1' } }));
  assert.ok(r.assignment.classroomCourseWorkId);
  assert.notEqual(r.assignment.classroomCourseWorkId, cw);
  assert.equal(fc.work[COURSE].length, 1);
});

test('saveAssignment: without postToClassroom Classroom is never called', () => {
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: [] } }).cls;
  g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: COURSE });
  fc.calls.length = 0;
  mkTest();
  const r = plain(g.A({ action: 'saveAssignment', assignment: { classId: cls.id, testCode: 'T1' } }));
  assert.equal(r.result, 'success');
  assert.equal(r.assignment.classroomCourseWorkId, '');
  assert.equal(fc.calls.length, 0);
});

test('saveAssignment: a failed post keeps the assignment, reports a code, and saving again retries', () => {
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: [] } }).cls;
  mkTest();
  const unlinked = plain(g.A({ action: 'saveAssignment', postToClassroom: true, assignment: { classId: cls.id, testCode: 'T1' } }));
  assert.equal(unlinked.result, 'success');
  assert.equal(unlinked.classroomError, 'classroom_not_linked');
  assert.equal(g.rows('Assignments').length, 1);
  g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: COURSE });
  const id = unlinked.assignment.id;
  fc.inject('work.create', PROJECT_DENIED, { times: 1 });
  const denied = plain(g.A({ action: 'saveAssignment', postToClassroom: true, assignment: { id, classId: cls.id, testCode: 'T1' } }));
  assert.equal(denied.result, 'success');
  assert.equal(denied.classroomError, 'classroom_not_our_coursework');
  assert.equal(denied.assignment.classroomCourseWorkId, '');
  const retry = plain(g.A({ action: 'saveAssignment', postToClassroom: true, assignment: { id, classId: cls.id, testCode: 'T1' } }));
  assert.equal(retry.classroomError, undefined);
  assert.ok(retry.assignment.classroomCourseWorkId);
  assert.equal(g.rows('Assignments').length, 1);
});

test('saveAssignment: other Classroom failures come back as classroom_error with a short detail', () => {
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: [] } }).cls;
  g.A({ action: 'linkClassroomCourse', classId: cls.id, courseId: COURSE });
  mkTest();
  fc.inject('work.create', { message: 'Backend Error', code: 500 });
  const r = plain(g.A({ action: 'saveAssignment', postToClassroom: true, assignment: { classId: cls.id, testCode: 'T1' } }));
  assert.equal(r.classroomError, 'classroom_error');
  assert.equal(r.classroomDetail, 'Backend Error');
});

test('deleteAssignment: deletes the coursework only when deleteInClassroom is true', () => {
  const one = setup(['a@x.org']);
  const keep = plain(g.A({ action: 'deleteAssignment', id: one.a.id }));
  assert.deepEqual({ deleted: keep.deleted, classroomDeleted: keep.classroomDeleted }, { deleted: true, classroomDeleted: false });
  assert.equal(fc.callsTo('work.remove').length, 0);
  assert.ok(fc.workOf(COURSE, one.cw), 'still in Classroom');

  const two = g.A({ action: 'saveAssignment', postToClassroom: true, assignment: { classId: one.cls.id, testCode: 'T1', title: 'Second' } });
  const cw2 = two.assignment.classroomCourseWorkId;
  const gone = plain(g.A({ action: 'deleteAssignment', id: two.assignment.id, deleteInClassroom: true }));
  assert.equal(gone.classroomDeleted, true);
  assert.equal(fc.workOf(COURSE, cw2), undefined);
  assert.equal(g.rows('Assignments').length, 0);

  const plainOne = g.A({ action: 'saveAssignment', assignment: { classId: one.cls.id, testCode: 'T1', title: 'Local only' } });
  const calls = fc.calls.length;
  const local = plain(g.A({ action: 'deleteAssignment', id: plainOne.assignment.id, deleteInClassroom: true }));
  assert.equal(local.classroomDeleted, false, 'nothing to delete in Classroom');
  assert.equal(fc.calls.length, calls);
});

test('deleteAssignment: a Classroom failure still deletes the assignment and says so', () => {
  const { a } = setup(['a@x.org']);
  fc.inject('work.remove', PROJECT_DENIED);
  const r = plain(g.A({ action: 'deleteAssignment', id: a.id, deleteInClassroom: true }));
  assert.equal(r.result, 'success');
  assert.equal(r.classroomDeleted, false);
  assert.equal(r.classroomError, 'classroom_not_our_coursework');
  assert.equal(g.rows('Assignments').length, 0);
});

// ---------- draft coursework and the publish trigger ----------

test('a future publishAt posts a draft, and the trigger publishes it once the time has passed', () => {
  const publishAt = iso(g.clock + 2 * HOUR);
  const { cw } = setup(['a@x.org'], { over: { publishAt } });
  assert.equal(fc.callsTo('work.create')[0].args.resource.state, 'DRAFT');
  assert.equal(fc.workOf(COURSE, cw).state, 'DRAFT');
  assert.equal(fc.subs[`${COURSE}/${cw}`], undefined, 'no submissions while it is a draft');

  assert.deepEqual(plain(g.run('publishDueClassroomWork()')), { published: 0, failed: 0 });
  assert.equal(fc.workOf(COURSE, cw).state, 'DRAFT', 'not yet due');

  g.tick(3 * HOUR);
  assert.deepEqual(plain(g.run('publishDueClassroomWork()')), { published: 1, failed: 0 });
  assert.equal(fc.workOf(COURSE, cw).state, 'PUBLISHED');
  assert.equal(fc.subs[`${COURSE}/${cw}`].length, 1, 'students now have submissions');

  const gets = fc.callsTo('work.get').length;
  assert.deepEqual(plain(g.run('publishDueClassroomWork()')), { published: 0, failed: 0 });
  assert.equal(fc.callsTo('work.get').length, gets, 'a published assignment is not checked again');
});

test('publish trigger: a publish failure is counted and retried on the next run', () => {
  const { cw } = setup(['a@x.org'], { over: { publishAt: iso(g.clock + HOUR) } });
  g.tick(2 * HOUR);
  fc.inject('work.patch', { message: 'Backend Error', code: 500 }, { times: 1 });
  assert.deepEqual(plain(g.run('publishDueClassroomWork()')), { published: 0, failed: 1 });
  assert.equal(fc.workOf(COURSE, cw).state, 'DRAFT');
  assert.deepEqual(plain(g.run('publishDueClassroomWork()')), { published: 1, failed: 0 });
  assert.equal(fc.workOf(COURSE, cw).state, 'PUBLISHED');
});

test('publish trigger: does nothing without the Classroom service, and is public so a trigger can call it', () => {
  delete g.ctx.Classroom;
  assert.deepEqual(plain(g.run('publishDueClassroomWork()')), { published: 0, failed: 0 });
  assert.equal(g.run("typeof publishDueClassroomWork"), 'function');
  assert.ok(plain(g.run('triggerList_()')).every((t) => !t.handler.endsWith('_')), 'no trigger handler ends in an underscore');
  g.run('setupTriggers()');
  assert.ok(g.triggers.some((t) => t.getHandlerFunction() === 'publishDueClassroomWork'));
});

// ---------- grade rules ----------

test('previewGradeSync: every grade rule', () => {
  const roster = ['rel@x.org', 'draft@x.org', 'needs@x.org', 'none@x.org', 'away@x.org', 'extra@x.org', 'regrade@x.org'];
  const { a } = setup(roster, { inCourse: [...roster.filter((e) => e !== 'away@x.org'), 'outsider@x.org'] });
  sub('rel@x.org', released());
  sub('draft@x.org', { Status: 'Graded', 'Score Achieved': 8, 'Final Score': 6, 'Final Percentage (%)': 60 });
  sub('needs@x.org', { Status: 'Needs grading' });
  sub('extra@x.org', { Status: 'Extra attempt' });
  sub('away@x.org', released());
  sub('regrade@x.org', { Status: 'Graded', 'Score Achieved': 2, 'Final Score': 9, 'Final Percentage (%)': 90 });

  const r = preview(a);
  assert.equal(r.result, 'success');
  assert.equal(r.maxPoints, 10);
  assert.equal(r.syncAccount, TEACHER);
  assert.equal(r.courseWorkId, a.classroomCourseWorkId);
  const rows = byEmail(r);
  assert.deepEqual(r.rows.map((x) => x.email), roster, 'roster order; Classroom students not on the roster are ignored');
  assert.deepEqual({ p: rows['rel@x.org'].points, rel: rows['rel@x.org'].released, t: rows['rel@x.org'].target, a: rows['rel@x.org'].action }, { p: 8, rel: true, t: 'assigned', a: 'new' });
  assert.deepEqual({ p: rows['draft@x.org'].points, rel: rows['draft@x.org'].released, t: rows['draft@x.org'].target, a: rows['draft@x.org'].action }, { p: 6, rel: false, t: 'draft', a: 'new' });
  assert.equal(rows['needs@x.org'].action, 'skipped_not_graded');
  assert.equal(rows['needs@x.org'].points, null);
  assert.equal(rows['none@x.org'].action, 'skipped_not_graded');
  assert.equal(rows['extra@x.org'].action, 'skipped_not_graded', 'an extra attempt never counts');
  assert.equal(rows['away@x.org'].action, 'skipped_not_on_roster');
  assert.equal(rows['regrade@x.org'].points, 9, 'the final score after teacher grading is used');
  assert.equal(rows['rel@x.org'].possible, 10);
  assert.deepEqual(r.counts, { new: 3, skipped_not_graded: 3, skipped_not_on_roster: 1 });
});

test('previewGradeSync: the grade is rounded to two decimals of maxPoints', () => {
  const { a } = setup(['a@x.org']);
  sub('a@x.org', { Status: 'Graded', 'Score Achieved': 1, 'Total Score': 3, 'Final Score': 1, 'Final Percentage (%)': 33.33 });
  assert.equal(byEmail(preview(a))['a@x.org'].points, 3.33);
});

test('syncGrades: released grades go as assigned and draft, unreleased as draft only', () => {
  const { a } = setup(['rel@x.org', 'draft@x.org']);
  sub('rel@x.org', released());
  sub('draft@x.org', { Status: 'Graded', 'Final Score': 6, 'Final Percentage (%)': 60 });
  const r = sync(a);
  assert.deepEqual({ done: r.done, synced: r.synced, failed: r.failed, skipped: r.skipped, cursor: r.cursor }, { done: true, synced: 2, failed: 0, skipped: 0, cursor: '' });
  const rel = fc.submissionOf(COURSE, a.classroomCourseWorkId, 'rel@x.org');
  const dr = fc.submissionOf(COURSE, a.classroomCourseWorkId, 'draft@x.org');
  assert.deepEqual({ d: rel.draftGrade, a: rel.assignedGrade }, { d: 8, a: 8 });
  assert.deepEqual({ d: dr.draftGrade, a: dr.assignedGrade }, { d: 6, a: undefined });
  const masks = Object.fromEntries(patches().map((p) => [p.args.id, p.args.opt.updateMask]));
  assert.equal(masks[rel.id], 'draftGrade,assignedGrade');
  assert.equal(masks[dr.id], 'draftGrade');
  assert.deepEqual(plain(r.results).sort((x, y) => x.email.localeCompare(y.email)), [{ email: 'draft@x.org', status: 'draft' }, { email: 'rel@x.org', status: 'assigned' }]);
});

test('previewGradeSync: same, update (grade changed, then released) and never back to draft-only', () => {
  const roster = ['a@x.org', 'b@x.org', 'c@x.org'];
  const { a } = setup(roster);
  sub('a@x.org', released());
  sub('b@x.org', { Status: 'Graded', 'Final Score': 6, 'Final Percentage (%)': 60 });
  sub('c@x.org', released());
  sync(a);
  assert.deepEqual(preview(a).counts, { same: 3 });

  setCell('a@x.org', 'Final Score', 5);
  setCell('a@x.org', 'Final Percentage (%)', 50);
  setCell('b@x.org', 'Released At', iso(g.clock));
  setCell('c@x.org', 'Released At', '');
  const rows = byEmail(preview(a));
  assert.equal(rows['a@x.org'].action, 'update', 'grade changed, Classroom still holds what we sent');
  assert.equal(rows['a@x.org'].points, 5);
  assert.equal(rows['a@x.org'].lastSent, 8);
  assert.equal(rows['b@x.org'].action, 'update', 'draft becomes assigned once released');
  assert.equal(rows['c@x.org'].action, 'same', 'a student already assigned is never moved back to draft-only');
  const r = sync(a);
  assert.equal(r.synced, 2);
  assert.equal(fc.submissionOf(COURSE, a.classroomCourseWorkId, 'a@x.org').assignedGrade, 5);
  assert.equal(fc.submissionOf(COURSE, a.classroomCourseWorkId, 'b@x.org').assignedGrade, 6);
  assert.equal(fc.submissionOf(COURSE, a.classroomCourseWorkId, 'c@x.org').assignedGrade, 8);
  assert.deepEqual(preview(a).counts, { same: 3 });
});

// ---------- overwrite guard ----------

test('overwrite guard: a grade we did not send is skipped unless overwrite is true', () => {
  const roster = ['mine@x.org', 'teacher@x.org', 'edited@x.org', 'cleared@x.org'];
  const { a, cw } = setup(roster);
  roster.forEach((e) => sub(e, { Status: 'Graded', 'Final Score': 6, 'Final Percentage (%)': 60 }));
  sync(a, { emails: ['edited@x.org', 'cleared@x.org'] });
  fc.submissionOf(COURSE, cw, 'teacher@x.org').draftGrade = 3; // typed by the teacher, nothing sent by us
  fc.submissionOf(COURSE, cw, 'edited@x.org').draftGrade = 1; // teacher changed what we sent
  delete fc.submissionOf(COURSE, cw, 'cleared@x.org').draftGrade; // teacher cleared it
  const rows = byEmail(preview(a));
  assert.equal(rows['mine@x.org'].action, 'new');
  assert.equal(rows['teacher@x.org'].action, 'skipped_teacher_changed');
  assert.equal(rows['teacher@x.org'].classroomDraft, 3);
  assert.equal(rows['teacher@x.org'].lastSent, null);
  assert.equal(rows['edited@x.org'].action, 'skipped_teacher_changed');
  assert.equal(rows['edited@x.org'].lastSent, 6);
  assert.equal(rows['cleared@x.org'].action, 'new');

  fc.calls.length = 0;
  const r = sync(a);
  assert.deepEqual({ synced: r.synced, skipped: r.skipped }, { synced: 2, skipped: 2 });
  assert.equal(fc.submissionOf(COURSE, cw, 'teacher@x.org').draftGrade, 3, 'untouched');
  assert.equal(fc.submissionOf(COURSE, cw, 'edited@x.org').draftGrade, 1, 'untouched');
  assert.equal(patches().length, 2);

  const forced = sync(a, { overwrite: true });
  assert.deepEqual({ synced: forced.synced, skipped: forced.skipped }, { synced: 2, skipped: 2 });
  assert.equal(fc.submissionOf(COURSE, cw, 'teacher@x.org').draftGrade, 6);
  assert.equal(fc.submissionOf(COURSE, cw, 'edited@x.org').draftGrade, 6);
  assert.deepEqual(preview(a).counts, { same: 4 });
});

test('overwrite guard: a grade the teacher typed is protected when releasing too', () => {
  const { a, cw } = setup(['a@x.org']);
  sub('a@x.org', released());
  fc.submissionOf(COURSE, cw, 'a@x.org').assignedGrade = 4;
  assert.equal(byEmail(preview(a))['a@x.org'].action, 'skipped_teacher_changed');
  assert.equal(sync(a).synced, 0);
  assert.equal(fc.submissionOf(COURSE, cw, 'a@x.org').assignedGrade, 4);
});

test('syncGrades: emails restricts the rows that are written', () => {
  const { a } = setup(['a@x.org', 'b@x.org']);
  sub('a@x.org', released());
  sub('b@x.org', released());
  const r = sync(a, { emails: ['B@x.org'] });
  assert.deepEqual(plain(r.results), [{ email: 'b@x.org', status: 'assigned' }]);
  assert.equal(patches().length, 1);
});

// ---------- cursor ----------

test('syncGrades: stops at the time budget with a cursor and the next call resumes without repeating work', () => {
  const roster = ['s1@x.org', 's2@x.org', 's3@x.org', 's4@x.org', 's5@x.org', 's6@x.org'];
  const { a } = setup(roster);
  roster.forEach((e) => sub(e, released()));
  fc.onPatch = () => g.tick(10000);

  const first = sync(a);
  assert.equal(first.result, 'success');
  assert.equal(first.done, false);
  assert.equal(first.cursor, '3');
  assert.equal(first.synced, 3);
  assert.equal(patches().length, 3);

  const second = sync(a, { cursor: first.cursor });
  assert.equal(second.done, true);
  assert.equal(second.cursor, '');
  assert.equal(second.synced, 3);
  assert.equal(patches().length, 6);
  assert.equal(new Set(patches().map((p) => p.args.id)).size, 6, 'no student patched twice');
  assert.deepEqual(preview(a).counts, { same: 6 });
  assert.equal(g.rows('ClassroomSync').length, 6);
});

test('syncGrades: rejects a bad cursor', () => {
  const { a } = setup(['a@x.org']);
  assert.equal(sync(a, { cursor: 'abc' }).error, 'invalid_request');
  assert.equal(sync(a, { cursor: '-1' }).error, 'invalid_request');
});

test('syncGrades: Classroom rate limit stops the run and hands back a cursor to resume', () => {
  const roster = ['s1@x.org', 's2@x.org', 's3@x.org'];
  const { a } = setup(roster);
  roster.forEach((e) => sub(e, released()));
  const second = fc.userIdOf(COURSE, 's2@x.org');
  fc.inject('submissions.patch', { message: 'Quota exceeded for quota metric', code: 429 }, { times: 1, when: (args) => fc.subs[`${args.courseId}/${args.cwId}`].find((s) => s.id === args.id).userId === second });
  const r = sync(a);
  assert.equal(r.result, 'error');
  assert.equal(r.error, 'classroom_rate_limited');
  assert.equal(r.done, false);
  assert.equal(r.cursor, '1');
  assert.equal(r.synced, 1);
  const resumed = sync(a, { cursor: r.cursor });
  assert.equal(resumed.result, 'success');
  assert.equal(resumed.done, true);
  assert.deepEqual(preview(a).counts, { same: 3 });
});

// ---------- errors, ClassroomSync and Log rows ----------

test('syncGrades: a ProjectPermissionDenied student is marked failed and the sync carries on', () => {
  const roster = ['a@x.org', 'b@x.org', 'c@x.org'];
  const { a, cw } = setup(roster);
  roster.forEach((e) => sub(e, released()));
  const bad = fc.submissionOf(COURSE, cw, 'b@x.org').id;
  fc.inject('submissions.patch', PROJECT_DENIED, { when: (args) => args.id === bad });
  const r = sync(a);
  assert.equal(r.result, 'success');
  assert.deepEqual({ synced: r.synced, failed: r.failed }, { synced: 2, failed: 1 });
  assert.deepEqual(plain(r.results).find((x) => x.email === 'b@x.org'), { email: 'b@x.org', status: 'failed', error: 'classroom_not_our_coursework' });
  const rows = Object.fromEntries(g.rows('ClassroomSync').map((x) => [x[1], x]));
  assert.equal(rows['b@x.org'][6], 'failed');
  assert.equal(rows['b@x.org'][7], 'classroom_not_our_coursework');
  assert.equal(rows['a@x.org'][6], 'assigned');
  assert.equal(rows['c@x.org'][6], 'assigned');
  fc.clearInjected();
  assert.equal(byEmail(preview(a))['b@x.org'].action, 'new', 'a failed student is offered again');
  assert.equal(sync(a).synced, 1);
  assert.equal(g.rows('ClassroomSync').find((x) => x[1] === 'b@x.org')[6], 'assigned');
});

test('syncGrades: a 403 on a student maps to classroom_not_teacher', () => {
  const { a } = setup(['a@x.org']);
  sub('a@x.org', released());
  fc.inject('submissions.patch', NOT_TEACHER);
  const r = sync(a);
  assert.deepEqual(plain(r.results), [{ email: 'a@x.org', status: 'failed', error: 'classroom_not_teacher' }]);
  assert.equal(g.rows('ClassroomSync')[0][7], 'classroom_not_teacher');
});

test('syncGrades and previewGradeSync: Classroom errors on the read side come back as codes', () => {
  const { a } = setup(['a@x.org']);
  fc.inject('students.list', NOT_TEACHER, { times: 1 });
  assert.equal(preview(a).error, 'classroom_not_teacher');
  fc.inject('submissions.list', PROJECT_DENIED, { times: 1 });
  assert.equal(sync(a).error, 'classroom_not_our_coursework');
  fc.inject('work.get', { message: 'Requested entity was not found.', code: 404 }, { times: 1 });
  assert.equal(preview(a).error, 'classroom_not_linked');
  fc.inject('work.get', { message: 'Backend Error', code: 500 }, { times: 1 });
  const r = preview(a);
  assert.equal(r.error, 'classroom_error');
  assert.equal(r.detail, 'Backend Error');
});

test('previewGradeSync and syncGrades: unknown assignment, and an assignment that was never posted', () => {
  assert.equal(g.A({ action: 'previewGradeSync', assignmentId: 'nope' }).error, 'not_found');
  assert.equal(g.A({ action: 'syncGrades', assignmentId: 'nope' }).error, 'not_found');
  const cls = g.A({ action: 'saveClass', cls: { name: 'P1', emails: ['a@x.org'] } }).cls;
  mkTest();
  const local = g.A({ action: 'saveAssignment', assignment: { classId: cls.id, testCode: 'T1' } }).assignment;
  assert.equal(g.A({ action: 'previewGradeSync', assignmentId: local.id }).error, 'classroom_not_linked');
  assert.equal(g.A({ action: 'syncGrades', assignmentId: local.id }).error, 'classroom_not_linked');
});

test('syncGrades: ClassroomSync and Log get one row per student, upserted on the next sync', () => {
  const { a, cw } = setup(['a@x.org', 'b@x.org']);
  sub('a@x.org', released());
  sub('b@x.org', { Status: 'Graded', 'Final Score': 6, 'Final Percentage (%)': 60 });
  g.setClock(Date.UTC(2026, 10, 18, 12, 0));
  sync(a);
  const rows = Object.fromEntries(g.rows('ClassroomSync').map((x) => [x[1], x]));
  assert.equal(g.rows('ClassroomSync').length, 2);
  assert.deepEqual([rows['a@x.org'][0], rows['a@x.org'][2], rows['a@x.org'][4], rows['a@x.org'][6], rows['a@x.org'][7]], [a.id, cw, 8, 'assigned', '']);
  assert.equal(rows['a@x.org'][3], fc.submissionOf(COURSE, cw, 'a@x.org').id, 'submission id');
  assert.equal(new Date(rows['a@x.org'][5]).toISOString(), '2026-11-18T12:00:00.000Z', 'sentAt');
  assert.deepEqual([rows['b@x.org'][4], rows['b@x.org'][6]], [6, 'draft']);
  const log = g.rows('Log').filter((r) => r[2] === 'syncGrades');
  assert.equal(log.length, 2);
  assert.deepEqual(log.map((r) => r[1]).sort(), ['ADMIN_KEY', 'ADMIN_KEY']);
  assert.ok(log.some((r) => r[3] === `${a.id} · a@x.org` && r[4] === 'assigned 8'));

  setCell('b@x.org', 'Released At', iso(g.clock));
  sync(a);
  assert.equal(g.rows('ClassroomSync').length, 2, 'upserted, not appended');
  assert.equal(g.rows('ClassroomSync').find((x) => x[1] === 'b@x.org')[6], 'assigned');
});

test('previewGradeSync: Classroom students without an email address are not matched', () => {
  const { a } = setup(['a@x.org']);
  fc.addStudent(COURSE, '', 'No Email');
  sub('a@x.org', released());
  const r = preview(a);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].action, 'new');
});

// ---------- auto-sync on release ----------

test('releaseAll syncs the released students when the class has autoSyncClassroom', () => {
  const { a, cw } = setup(['a@x.org', 'b@x.org'], { autoSync: true });
  sub('a@x.org');
  sub('b@x.org', { Status: 'Graded', 'Final Score': 6, 'Final Percentage (%)': 60 });
  const r = plain(g.A({ action: 'releaseAll', testCode: 'T1' }));
  assert.equal(r.result, 'success');
  assert.equal(r.released, 2);
  assert.equal(r._emails, undefined, 'internal field is not sent to the client');
  assert.deepEqual(r.classroomSync, { synced: 2, failed: 0 });
  assert.deepEqual({ d: fc.submissionOf(COURSE, cw, 'a@x.org').draftGrade, a: fc.submissionOf(COURSE, cw, 'a@x.org').assignedGrade }, { d: 8, a: 8 });
  assert.equal(fc.submissionOf(COURSE, cw, 'b@x.org').assignedGrade, 6);
  assert.deepEqual(g.rows('ClassroomSync').map((x) => x[6]), ['assigned', 'assigned']);
  assert.deepEqual(preview(a).counts, { same: 2 });
});

test('releaseAll does not touch Classroom when autoSyncClassroom is off', () => {
  setup(['a@x.org']);
  sub('a@x.org');
  fc.calls.length = 0;
  const r = plain(g.A({ action: 'releaseAll', testCode: 'T1' }));
  assert.equal(r.released, 1);
  assert.equal(r.classroomSync, undefined);
  assert.equal(fc.calls.length, 0);
  assert.equal(g.rows('ClassroomSync').length, 0);
});

test('releaseAll: a Classroom failure never fails the release and is recorded for retry', () => {
  const { a } = setup(['a@x.org'], { autoSync: true });
  sub('a@x.org');
  fc.inject('submissions.patch', PROJECT_DENIED);
  const r = plain(g.A({ action: 'releaseAll', testCode: 'T1' }));
  assert.equal(r.result, 'success');
  assert.equal(r.released, 1);
  assert.deepEqual(r.classroomSync, { synced: 0, failed: 1 });
  assert.equal(g.rows('Submissions')[0][21] !== '', true, 'released');
  const row = g.rows('ClassroomSync')[0];
  assert.deepEqual([row[1], row[6], row[7]], ['a@x.org', 'failed', 'classroom_not_our_coursework']);
  fc.clearInjected();
  assert.equal(sync(a).synced, 1, 'Retry from the tracker');
  assert.equal(g.rows('ClassroomSync')[0][6], 'assigned');
});

test('releaseAll: when the whole Classroom lookup fails every released student is recorded as failed', () => {
  setup(['a@x.org', 'b@x.org'], { autoSync: true });
  sub('a@x.org');
  sub('b@x.org');
  fc.inject('work.get', NOT_TEACHER);
  const r = plain(g.A({ action: 'releaseAll', testCode: 'T1' }));
  assert.equal(r.result, 'success');
  assert.deepEqual(r.classroomSync, { synced: 0, failed: 2 });
  assert.deepEqual(g.rows('ClassroomSync').map((x) => x[6]), ['failed', 'failed']);
  assert.ok(g.rows('ClassroomSync').every((x) => x[7] === 'classroom_not_teacher'));
});

test('saveGrade with release syncs that student when the class has autoSyncClassroom', () => {
  const { cw } = setup(['a@x.org', 'b@x.org'], { autoSync: true });
  const responses = JSON.stringify([{ questionId: 'q1', pointsPossible: 10, pointsEarned: 4 }]);
  sub('a@x.org', { Status: 'Needs grading', 'Detailed Responses (JSON)': responses });
  sub('b@x.org', { Status: 'Needs grading', 'Detailed Responses (JSON)': responses });
  const kept = plain(g.A({ action: 'saveGrade', submissionId: 'sub-b@x.org', grades: { q1: 3 } }));
  assert.equal(kept.classroomSync, undefined, 'saving without release does not sync');
  assert.equal(patches().length, 0);
  const r = plain(g.A({ action: 'saveGrade', submissionId: 'sub-a@x.org', grades: { q1: 7 }, release: true }));
  assert.equal(r.result, 'success');
  assert.deepEqual(r.classroomSync, { synced: 1, failed: 0 });
  const a = fc.submissionOf(COURSE, cw, 'a@x.org');
  assert.deepEqual({ d: a.draftGrade, a: a.assignedGrade }, { d: 7, a: 7 });
  assert.equal(fc.submissionOf(COURSE, cw, 'b@x.org').draftGrade, undefined, 'other students are not synced');
});

test('saveGrade with release records a Classroom failure and still releases', () => {
  setup(['a@x.org'], { autoSync: true });
  sub('a@x.org', { Status: 'Needs grading', 'Detailed Responses (JSON)': JSON.stringify([{ questionId: 'q1', pointsPossible: 10, pointsEarned: 4 }]) });
  fc.inject('submissions.patch', NOT_TEACHER);
  const r = plain(g.A({ action: 'saveGrade', submissionId: 'sub-a@x.org', grades: { q1: 7 }, release: true }));
  assert.equal(r.result, 'success');
  assert.ok(r.grade.released_at);
  assert.deepEqual(r.classroomSync, { synced: 0, failed: 1 });
  assert.equal(g.rows('ClassroomSync')[0][7], 'classroom_not_teacher');
});

test('auto-sync only covers assignments of the test whose class has it switched on', () => {
  const on = setup(['a@x.org'], { autoSync: true });
  const other = g.A({ action: 'saveClass', cls: { name: 'P2', emails: ['a@x.org'] } }).cls;
  fc.addCourse({ id: 'c2', name: 'Chem P2' });
  fc.addStudent('c2', 'a@x.org');
  g.A({ action: 'linkClassroomCourse', classId: other.id, courseId: 'c2' });
  const second = g.A({ action: 'saveAssignment', postToClassroom: true, assignment: { classId: other.id, testCode: 'T1', title: 'P2 quiz' } });
  sub('a@x.org');
  const r = plain(g.A({ action: 'releaseAll', testCode: 'T1' }));
  assert.deepEqual(r.classroomSync, { synced: 1, failed: 0 });
  assert.equal(fc.submissionOf(COURSE, on.cw, 'a@x.org').assignedGrade, 8);
  assert.equal(fc.submissionOf('c2', second.assignment.classroomCourseWorkId, 'a@x.org').assignedGrade, undefined);
});

// ---------- client wrappers ----------

test('api.js exports the Classroom wrappers', async () => {
  const api = await import('../../js/lib/api.js');
  for (const name of ['listClassroomCourses', 'linkClassroomCourse', 'importClassroomRoster', 'previewGradeSync', 'syncGrades', 'saveAssignment', 'deleteAssignment']) {
    assert.equal(typeof api[name], 'function', name);
  }
});
