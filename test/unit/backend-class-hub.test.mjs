// Class hub backend (admin side): saveAssignment, deleteAssignment, listAssignments, postStream, listStream, deleteStreamPost,
// getAssignmentStatus, remindMissing, batch.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeGas, plain } from './helpers/gas.mjs';

let g;
const HOUR = 3600000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();

beforeEach(() => { g = makeGas(); });

const mkClass = (emails, name = 'P1') => g.A({ action: 'saveClass', cls: { name, emails } }).cls;
const mkTest = (code = 'T1') => g.A({ action: 'publishTest', test: { code, title: `Test ${code}`, questions: [{ id: 'q1', type: 'truefalse', text: 'x', correctAnswer: true }] } });
const mkAssignment = (classId, over = {}) => g.A({ action: 'saveAssignment', assignment: { classId, testCode: 'T1', title: 'Quiz', ...over } });
const submit = (email, at, over = {}) => g.addSubmission({ Timestamp: typeof at === 'number' ? iso(at) : at, 'Student Name': email, 'Student Email': email, 'Test Code': 'T1', Status: 'Auto-graded', 'Percentage (%)': 80, ...over });
const statusOf = (id) => Object.fromEntries(plain(g.A({ action: 'getAssignmentStatus', id }).rows).map((r) => [r.email, r]));
const hubOf = (email) => g.post({ action: 'getClassHub', idToken: g.login(email) });

// ---------- saveAssignment / listAssignments / deleteAssignment ----------

test('assignment admin actions need an admin', () => {
  for (const body of [{ action: 'saveAssignment', assignment: {} }, { action: 'listAssignments' }, { action: 'deleteAssignment', id: 'x' },
    { action: 'postStream', classId: 'k', body: 'x' }, { action: 'listStream', classId: 'k' }, { action: 'deleteStreamPost', id: 'x' },
    { action: 'getAssignmentStatus', id: 'x' }, { action: 'remindMissing', id: 'x' }, { action: 'batch', requests: [] }]) {
    assert.equal(g.post(body).error, 'unauthorized', body.action);
    assert.equal(g.post({ ...body, idToken: g.login('ada@x.org') }).result, 'error', `${body.action} with a student token`);
  }
});

test('saveAssignment: validates input', () => {
  const c = mkClass(['ada@x.org']);
  assert.equal(g.A({ action: 'saveAssignment' }).error, 'invalid_request');
  assert.equal(g.A({ action: 'saveAssignment', assignment: { classId: c.id } }).error, 'invalid_request');
  assert.equal(g.A({ action: 'saveAssignment', assignment: { testCode: 'T1' } }).error, 'invalid_request');
  assert.equal(mkAssignment('no-such-class').error, 'not_found');
  assert.equal(mkAssignment(c.id, { dueAt: 'next friday-ish' }).error, 'invalid_date');
  assert.equal(mkAssignment(c.id, { opensAt: 'nope' }).error, 'invalid_date');
  assert.equal(mkAssignment(c.id, { publishAt: 'nope' }).error, 'invalid_date');
  assert.equal(g.A({ action: 'saveAssignment', assignment: { id: 'asg-missing', classId: c.id, testCode: 'T1' } }).error, 'not_found');
  assert.equal(g.rows('Assignments').length, 0);
});

test('saveAssignment: creates with defaults, posts to the stream once, and an edit keeps id, creator and the single post', () => {
  const c = mkClass(['ada@x.org']);
  mkTest('T1');
  const r = g.A({ action: 'saveAssignment', assignment: { classId: c.id, testCode: 't1', modes: ['classic', '', 'study'] } });
  assert.equal(r.result, 'success');
  const a = r.assignment;
  assert.equal(a.testCode, 'T1');
  assert.equal(a.title, 'Test T1', 'title defaults to the test title');
  assert.equal(a.lateAllowed, true);
  assert.equal(a.required, false);
  assert.deepEqual(plain(a.modes), ['classic', 'study']);
  assert.equal(r.post.type, 'assignment');
  g.tick(HOUR);
  const e = g.A({ action: 'saveAssignment', assignment: { id: a.id, classId: c.id, testCode: 'T1', title: 'Renamed', lateAllowed: false, required: true } });
  assert.equal(e.assignment.id, a.id);
  assert.equal(e.assignment.title, 'Renamed');
  assert.equal(e.assignment.lateAllowed, false);
  assert.equal(e.assignment.required, true);
  assert.equal(e.assignment.createdAt, a.createdAt);
  assert.equal(e.post, undefined);
  assert.equal(g.rows('Assignments').length, 1);
  assert.equal(g.rows('Stream').length, 1);
});

test('saveAssignment: instructions are capped and a title that starts like a formula is stored as text', () => {
  const c = mkClass(['ada@x.org']);
  const a = mkAssignment(c.id, { title: '=HYPERLINK("http://x")', instructions: 'y'.repeat(5000), modes: Array.from({ length: 30 }, (_, i) => `m${i}`) }).assignment;
  assert.equal(a.instructions.length, 2000);
  assert.equal(a.modes.length, 16);
  assert.ok(!g.rows('Assignments')[0][3].startsWith('='), 'cell does not start with =');
});

test('listAssignments: all, or one class', () => {
  const c1 = mkClass(['ada@x.org'], 'P1');
  const c2 = mkClass(['bob@x.org'], 'P2');
  mkAssignment(c1.id, { title: 'A' });
  mkAssignment(c1.id, { title: 'B' });
  mkAssignment(c2.id, { title: 'C' });
  assert.equal(g.A({ action: 'listAssignments' }).assignments.length, 3);
  assert.deepEqual(plain(g.A({ action: 'listAssignments', classId: c2.id }).assignments).map((a) => a.title), ['C']);
  assert.equal(g.A({ action: 'listAssignments', classId: 'none' }).assignments.length, 0);
});

test('listAssignments sees a new assignment straight away (cache is busted on save and delete)', () => {
  const c = mkClass(['ada@x.org']);
  assert.equal(g.A({ action: 'listAssignments' }).assignments.length, 0);
  const a = mkAssignment(c.id).assignment;
  assert.equal(g.A({ action: 'listAssignments' }).assignments.length, 1);
  g.A({ action: 'deleteAssignment', id: a.id });
  assert.equal(g.A({ action: 'listAssignments' }).assignments.length, 0);
});

test('deleteAssignment: removes the assignment, its stream post and its reminders, not other posts', () => {
  const c = mkClass(['ada@x.org']);
  const a = mkAssignment(c.id, { dueAt: iso(g.clock - HOUR) }).assignment;
  const keep = mkAssignment(c.id, { title: 'Keep' }).assignment;
  g.A({ action: 'postStream', classId: c.id, body: 'a plain post' });
  assert.equal(g.A({ action: 'remindMissing', id: a.id }).reminded, 1);
  assert.equal(g.rows('Stream').length, 4);
  assert.deepEqual(plain(g.A({ action: 'deleteAssignment', id: a.id })), { result: 'success', id: a.id, deleted: true });
  const left = g.A({ action: 'listStream', classId: c.id }).posts;
  assert.equal(left.length, 2);
  assert.ok(left.some((p) => p.body === 'a plain post'));
  assert.ok(left.some((p) => p.type === 'assignment' && p.body === 'Keep'));
  assert.equal(g.A({ action: 'listAssignments' }).assignments[0].id, keep.id);
  assert.equal(g.A({ action: 'deleteAssignment', id: a.id }).error, 'not_found');
  assert.equal(g.A({ action: 'deleteAssignment' }).error, 'invalid_request');
});

// ---------- stream ----------

test('postStream: validates, and only classes that exist can be posted to', () => {
  const c = mkClass(['ada@x.org']);
  assert.equal(g.A({ action: 'postStream', classId: c.id, body: '   ' }).error, 'invalid_request');
  assert.equal(g.A({ action: 'postStream', body: 'hi' }).error, 'invalid_request');
  assert.equal(g.A({ action: 'postStream', classId: c.id, body: 'hi', type: 'assignment' }).error, 'invalid_request');
  assert.equal(g.A({ action: 'postStream', classId: c.id, body: 'x'.repeat(2001) }).error, 'too_large');
  assert.equal(g.A({ action: 'postStream', classId: 'ghost', body: 'hi' }).error, 'not_found');
  const ok = g.A({ action: 'postStream', classId: c.id, body: '  hello  ', pinned: true });
  assert.equal(ok.post.body, 'hello');
  assert.equal(ok.post.pinned, true);
  assert.equal(ok.post.createdBy, 'ADMIN_KEY');
  assert.equal(g.rows('Stream').length, 1);
});

test('postStream: an edit pins, unpins and changes the text of a post; assignment posts keep their text', () => {
  const c = mkClass(['ada@x.org']);
  const p = g.A({ action: 'postStream', classId: c.id, body: 'first' }).post;
  assert.equal(g.A({ action: 'postStream', id: p.id, pinned: true }).post.pinned, true);
  assert.equal(g.A({ action: 'postStream', id: p.id, body: 'edited' }).post.body, 'edited');
  assert.equal(g.A({ action: 'postStream', id: p.id, pinned: false }).post.pinned, false);
  assert.equal(g.A({ action: 'postStream', id: 'nope', pinned: true }).error, 'not_found');
  const asg = mkAssignment(c.id, { title: 'Quiz' });
  assert.equal(g.A({ action: 'postStream', id: asg.post.id, body: 'changed' }).post.body, 'Quiz');
  assert.equal(g.rows('Stream').length, 2, 'edits never add rows');
});

test('listStream: pinned first, then newest first', () => {
  const c = mkClass(['ada@x.org']);
  const post = (body, pinned) => { g.tick(1000); return g.A({ action: 'postStream', classId: c.id, body, pinned }).post; };
  post('old', false);
  const pin1 = post('pinned old', true);
  post('mid', false);
  post('pinned new', true);
  post('new', false);
  const bodies = plain(g.A({ action: 'listStream', classId: c.id }).posts).map((p) => p.body);
  assert.deepEqual(bodies, ['pinned new', 'pinned old', 'new', 'mid', 'old']);
  g.A({ action: 'postStream', id: pin1.id, pinned: false });
  assert.deepEqual(plain(g.A({ action: 'listStream', classId: c.id }).posts).map((p) => p.body), ['pinned new', 'new', 'mid', 'pinned old', 'old']);
  assert.equal(g.A({ action: 'listStream' }).error, 'invalid_request');
  assert.deepEqual(plain(g.A({ action: 'listStream', classId: 'other' }).posts), []);
});

test('listStream and the student hub cap the stream at 100, keeping pinned posts first', () => {
  const c = mkClass(['ada@x.org']);
  const first = g.A({ action: 'postStream', classId: c.id, body: 'oldest but pinned', pinned: true }).post;
  for (let i = 0; i < 104; i++) { g.tick(1000); g.A({ action: 'postStream', classId: c.id, body: `p${i}` }); }
  assert.equal(g.rows('Stream').length, 105);
  const t = plain(g.A({ action: 'listStream', classId: c.id }).posts);
  assert.equal(t.length, 100);
  assert.equal(t[0].id, first.id);
  assert.equal(t[1].body, 'p103');
  assert.equal(t.at(-1).body, 'p5');
  const s = plain(hubOf('ada@x.org').stream);
  assert.equal(s.length, 100);
  assert.equal(s[0].id, first.id);
  assert.equal(s.at(-1).body, 'p5');
});

test('deleteStreamPost: deletes one post, then not_found', () => {
  const c = mkClass(['ada@x.org']);
  const a = g.A({ action: 'postStream', classId: c.id, body: 'a' }).post;
  g.A({ action: 'postStream', classId: c.id, body: 'b' });
  assert.deepEqual(plain(g.A({ action: 'deleteStreamPost', id: a.id })), { result: 'success', id: a.id, deleted: true });
  assert.deepEqual(plain(g.A({ action: 'listStream', classId: c.id }).posts).map((p) => p.body), ['b']);
  assert.equal(g.A({ action: 'deleteStreamPost', id: a.id }).error, 'not_found');
  assert.equal(g.A({ action: 'deleteStreamPost' }).error, 'invalid_request');
});

// ---------- getAssignmentStatus ----------

test('getAssignmentStatus: not found for an unknown id', () => {
  assert.equal(g.A({ action: 'getAssignmentStatus', id: 'nope' }).error, 'not_found');
  assert.equal(g.A({ action: 'getAssignmentStatus' }).error, 'not_found');
});

test('getAssignmentStatus: not started, in progress, turned in, graded and released (due in the future)', () => {
  const emails = ['ns', 'ip', 'ti', 'gr', 'rel', 'zero'].map((n) => `${n}@x.org`);
  const c = mkClass(emails);
  const a = mkAssignment(c.id, { dueAt: iso(g.clock + DAY) }).assignment;
  g.post({ action: 'syncProgress', idToken: g.login('ip@x.org'), attempt: { code: 'T1', mode: 'study', answeredCount: 3, total: 10 } });
  g.post({ action: 'syncProgress', idToken: g.login('zero@x.org'), attempt: { code: 'T1', mode: 'study', answeredCount: 0, total: 10 } });
  submit('ti@x.org', g.clock - HOUR);
  submit('gr@x.org', g.clock - HOUR, { Status: 'Graded', 'Final Percentage (%)': 90 });
  submit('rel@x.org', g.clock - HOUR, { Status: 'Graded', 'Final Percentage (%)': 95, 'Released At': iso(g.clock - 1000) });
  const s = statusOf(a.id);
  assert.equal(s['ns@x.org'].status, 'not_started');
  assert.equal(s['zero@x.org'].status, 'not_started', 'an attempt with nothing answered is not progress');
  assert.equal(s['ip@x.org'].status, 'in_progress');
  assert.equal(s['ip@x.org'].percentDone, 30);
  assert.equal(s['ip@x.org'].lastMode, 'study');
  assert.equal(s['ti@x.org'].status, 'turned_in');
  assert.equal(s['ti@x.org'].late, false);
  assert.equal(s['ti@x.org'].score, undefined, 'score only once graded');
  assert.equal(s['gr@x.org'].status, 'graded');
  assert.equal(s['gr@x.org'].score, 90);
  assert.equal(s['rel@x.org'].status, 'released');
  assert.equal(s['rel@x.org'].score, 95);
});

test('getAssignmentStatus: after the due time: missing, late, in progress stays in progress, turned in on time stays on time', () => {
  const c = mkClass(['miss@x.org', 'late@x.org', 'ontime@x.org', 'prog@x.org', 'latelate@x.org']);
  const due = g.clock - 2 * HOUR;
  const a = mkAssignment(c.id, { dueAt: iso(due) }).assignment;
  submit('ontime@x.org', due - HOUR);
  submit('late@x.org', due + HOUR);
  submit('latelate@x.org', due + HOUR, { Status: 'Graded', 'Final Percentage (%)': 70 });
  g.post({ action: 'syncProgress', idToken: g.login('prog@x.org'), attempt: { code: 'T1', answeredCount: 1, total: 4 } });
  const s = statusOf(a.id);
  assert.equal(s['miss@x.org'].status, 'missing');
  assert.equal(s['late@x.org'].status, 'late');
  assert.equal(s['late@x.org'].late, true);
  assert.equal(s['ontime@x.org'].status, 'turned_in');
  assert.equal(s['prog@x.org'].status, 'in_progress');
  assert.equal(s['latelate@x.org'].status, 'graded', 'graded wins over late');
});

test('getAssignmentStatus: an assignment with no due date is never missing or late', () => {
  const c = mkClass(['a@x.org', 'b@x.org']);
  const a = mkAssignment(c.id).assignment;
  submit('b@x.org', g.clock - 400 * DAY);
  g.tick(400 * DAY);
  const s = statusOf(a.id);
  assert.equal(s['a@x.org'].status, 'not_started');
  assert.equal(s['b@x.org'].status, 'turned_in');
});

test('getAssignmentStatus: exactly at the due time is on time; one millisecond later is late or missing', () => {
  const c = mkClass(['at@x.org', 'after@x.org', 'none@x.org']);
  const due = Date.UTC(2026, 10, 20, 17, 0, 0);
  const a = mkAssignment(c.id, { dueAt: iso(due) }).assignment;
  submit('at@x.org', due);
  submit('after@x.org', due + 1);
  g.setClock(due);
  let s = statusOf(a.id);
  assert.equal(s['at@x.org'].status, 'turned_in');
  assert.equal(s['at@x.org'].late, false);
  assert.equal(s['after@x.org'].status, 'late');
  assert.equal(s['none@x.org'].status, 'not_started', 'at the due time it is not yet missing');
  g.setClock(due + 1);
  s = statusOf(a.id);
  assert.equal(s['none@x.org'].status, 'missing');
});

test('time zones: a due time without an offset is wall-clock time in the script zone, one with an offset is exact, a bare date is end of day', () => {
  const parse = (v, tz) => g.ctx.parseWhen_(v, tz);
  assert.equal(parse('2026-11-20T17:00', 'UTC'), Date.UTC(2026, 10, 20, 17, 0));
  assert.equal(parse('2026-11-20T17:00', 'America/New_York'), Date.UTC(2026, 10, 20, 22, 0), 'EST is UTC-5');
  assert.equal(parse('2026-07-01T09:00', 'America/New_York'), Date.UTC(2026, 6, 1, 13, 0), 'EDT is UTC-4');
  assert.equal(parse('2026-11-20T17:00', 'Asia/Kolkata'), Date.UTC(2026, 10, 20, 11, 30), 'half-hour zone');
  assert.equal(parse('2026-11-20T17:00:00+01:00', 'America/New_York'), Date.UTC(2026, 10, 20, 16, 0), 'explicit offset wins');
  assert.equal(parse('2026-11-20T17:00:00Z', 'Asia/Kolkata'), Date.UTC(2026, 10, 20, 17, 0));
  assert.equal(parse('2026-11-20', 'America/New_York'), Date.UTC(2026, 10, 21, 4, 59, 59), 'end of that day in New York');
  assert.equal(parse('', 'UTC'), null);
});

test('time zones: the script zone decides whether a turn-in is late', () => {
  g.setTz('America/New_York');
  const c = mkClass(['a@x.org', 'b@x.org']);
  const a = mkAssignment(c.id, { dueAt: '2026-11-20T17:00' }).assignment; // 22:00Z
  submit('a@x.org', Date.UTC(2026, 10, 20, 21, 59));
  submit('b@x.org', Date.UTC(2026, 10, 20, 22, 1));
  g.setClock(Date.UTC(2026, 10, 21));
  const s = statusOf(a.id);
  assert.equal(s['a@x.org'].status, 'turned_in', '16:59 New York is before 17:00 New York');
  assert.equal(s['b@x.org'].status, 'late');
  const hub = hubOf('a@x.org');
  assert.equal(plain(hub.assignments)[0].effectiveDueAt, iso(Date.UTC(2026, 10, 20, 22, 0)));
});

test('accommodation extensions: a student with extensionUntil is judged against the later time', () => {
  const c = mkClass(['ext@x.org', 'plain@x.org', 'early@x.org', 'all@x.org']);
  const due = g.clock - 2 * HOUR;
  const a = mkAssignment(c.id, { dueAt: iso(due) }).assignment;
  g.A({ action: 'saveAccommodation', email: 'ext@x.org', testCode: 'T1', extensionUntil: iso(g.clock + DAY) });
  g.A({ action: 'saveAccommodation', email: 'early@x.org', testCode: 'T1', extensionUntil: iso(due - DAY) });
  g.A({ action: 'saveAccommodation', email: 'all@x.org', extensionUntil: iso(g.clock + DAY) }); // all tests
  let s = statusOf(a.id);
  assert.equal(s['ext@x.org'].status, 'not_started', 'not missing while the extension runs');
  assert.equal(s['all@x.org'].status, 'not_started', 'an all-tests extension applies');
  assert.equal(s['plain@x.org'].status, 'missing');
  assert.equal(s['early@x.org'].status, 'missing', 'an extension earlier than the due time changes nothing');
  submit('ext@x.org', due + HOUR);
  submit('plain@x.org', due + HOUR);
  s = statusOf(a.id);
  assert.equal(s['ext@x.org'].status, 'turned_in', 'turned in before the extended time');
  assert.equal(s['ext@x.org'].late, false);
  assert.equal(s['plain@x.org'].status, 'late');
  g.tick(2 * DAY);
  g.addSubmission({ Timestamp: iso(g.clock), 'Student Email': 'all@x.org', 'Test Code': 'T1', Status: 'Auto-graded' });
  assert.equal(statusOf(a.id)['all@x.org'].status, 'late', 'past the extension it is late again');
});

test('accommodation extensions reach the student hub: effective due time and canSubmit', () => {
  const c = mkClass(['ext@x.org', 'plain@x.org']);
  const due = g.clock - HOUR;
  mkAssignment(c.id, { dueAt: iso(due), lateAllowed: false });
  g.A({ action: 'saveAccommodation', email: 'ext@x.org', testCode: 'T1', extensionUntil: iso(g.clock + DAY) });
  const ext = plain(hubOf('ext@x.org').assignments)[0];
  const plainStudent = plain(hubOf('plain@x.org').assignments)[0];
  assert.equal(ext.effectiveDueAt, iso(g.clock + DAY));
  assert.equal(ext.canSubmit, true);
  assert.equal(plainStudent.status, 'missing');
  assert.equal(plainStudent.canSubmit, false, 'no late turn-ins and the due time has passed');
});

test('getAssignmentStatus: only the roster of the assignment class is listed, with names from the profile', () => {
  const c = mkClass(['ada@x.org']);
  mkClass(['other@x.org'], 'P2');
  const a = mkAssignment(c.id).assignment;
  g.post({ action: 'getStudentProfile', idToken: g.login('ada@x.org', { name: 'Ada L' }) });
  const r = g.A({ action: 'getAssignmentStatus', id: a.id });
  assert.deepEqual(plain(r.rows).map((x) => [x.email, x.name]), [['ada@x.org', 'Ada L']]);
  assert.equal(r.assignment.id, a.id);
});

test('getAssignmentStatus ignores submissions that do not count and other tests', () => {
  const c = mkClass(['a@x.org', 'b@x.org', 'c@x.org']);
  const a = mkAssignment(c.id, { dueAt: iso(g.clock + DAY) }).assignment;
  submit('a@x.org', g.clock - HOUR, { Status: 'Extra attempt' });
  submit('b@x.org', g.clock - HOUR, { Status: 'Not on roster' });
  submit('c@x.org', g.clock - HOUR, { 'Test Code': 'OTHER' });
  const s = statusOf(a.id);
  assert.deepEqual(['a@x.org', 'b@x.org', 'c@x.org'].map((e) => s[e].status), ['not_started', 'not_started', 'not_started']);
});

// ---------- remindMissing ----------

test('remindMissing: reminds only students who have not turned in, posts once, and only they see it', () => {
  const c = mkClass(['miss@x.org', 'prog@x.org', 'done@x.org', 'graded@x.org']);
  const a = mkAssignment(c.id, { title: 'Lab 1', dueAt: iso(g.clock - HOUR) }).assignment;
  g.post({ action: 'syncProgress', idToken: g.login('prog@x.org'), attempt: { code: 'T1', answeredCount: 1, total: 4 } });
  submit('done@x.org', g.clock - 2 * HOUR);
  submit('graded@x.org', g.clock - 2 * HOUR, { Status: 'Graded' });
  const r = g.A({ action: 'remindMissing', id: a.id });
  assert.equal(r.result, 'success');
  assert.equal(r.reminded, 2);
  assert.equal(r.post.type, 'reminder');
  assert.equal(r.post.classId, c.id);
  assert.match(r.post.body, /Lab 1/);
  assert.deepEqual(plain(g.rows('Stream').filter((p) => p[2] === 'reminder').map((p) => JSON.parse(p[3]).emails.sort())), [['miss@x.org', 'prog@x.org']]);
  const miss = hubOf('miss@x.org');
  assert.deepEqual(plain(miss.reminders), ['T1']);
  assert.ok(miss.notifications.some((n) => n.type === 'reminder'));
  assert.ok(miss.stream.some((p) => p.type === 'reminder'));
  for (const e of ['done@x.org', 'graded@x.org']) {
    const h = hubOf(e);
    assert.deepEqual(plain(h.reminders), [], e);
    assert.ok(!h.stream.some((p) => p.type === 'reminder'), e);
  }
});

test('remindMissing: a reminder disappears for a student once they turn in; nothing to do posts nothing; unknown id', () => {
  const c = mkClass(['miss@x.org']);
  const a = mkAssignment(c.id, { dueAt: iso(g.clock - HOUR) }).assignment;
  g.A({ action: 'remindMissing', id: a.id });
  assert.deepEqual(plain(hubOf('miss@x.org').reminders), ['T1']);
  submit('miss@x.org', g.clock);
  assert.deepEqual(plain(hubOf('miss@x.org').reminders), []);
  const before = g.rows('Stream').length;
  assert.deepEqual(plain(g.A({ action: 'remindMissing', id: a.id })), { result: 'success', reminded: 0 });
  assert.equal(g.rows('Stream').length, before);
  assert.equal(g.A({ action: 'remindMissing', id: 'nope' }).error, 'not_found');
  assert.equal(g.A({ action: 'remindMissing' }).error, 'not_found');
});

test('remindMissing: students not yet due are reminded too (not started counts as missing work)', () => {
  const c = mkClass(['a@x.org']);
  const a = mkAssignment(c.id, { dueAt: iso(g.clock + DAY) }).assignment;
  assert.equal(g.A({ action: 'remindMissing', id: a.id }).reminded, 1);
});

// ---------- batch ----------

test('batch: runs each request and returns one result per request, in order', () => {
  const c = mkClass(['ada@x.org']);
  const r = g.A({ action: 'batch', requests: [
    { action: 'postStream', classId: c.id, body: 'one' },
    { action: 'postStream', classId: c.id, body: 'two' },
  ] });
  assert.equal(r.result, 'success');
  assert.deepEqual(plain(r.results).map((x) => x.result), ['success', 'success']);
  assert.equal(r.results[1].post.body, 'two');
  assert.equal(g.rows('Stream').length, 2);
});

test('batch: ops is accepted as an alias for requests', () => {
  const c = mkClass(['ada@x.org']);
  const r = g.A({ action: 'batch', ops: [{ action: 'postStream', classId: c.id, body: 'x' }] });
  assert.equal(r.results[0].result, 'success');
});

test('batch: one failing item does not stop the others, and each item reports its own error', () => {
  const c = mkClass(['ada@x.org']);
  const r = g.A({ action: 'batch', requests: [
    { action: 'postStream', classId: c.id, body: 'before' },
    { action: 'postStream', classId: 'ghost', body: 'bad class' },
    { action: 'postStream', classId: c.id, body: '' },
    { action: 'deleteStreamPost', id: 'nope' },
    { action: 'postStream', classId: c.id, body: 'after' },
  ] });
  assert.equal(r.result, 'success');
  assert.deepEqual(plain(r.results).map((x) => x.error || 'ok'), ['ok', 'not_found', 'invalid_request', 'not_found', 'ok']);
  assert.deepEqual(plain(g.A({ action: 'listStream', classId: c.id }).posts).map((p) => p.body).sort(), ['after', 'before']);
});

test('batch: an item that throws becomes an error result and the rest still run', () => {
  const c = mkClass(['ada@x.org']);
  const r = g.A({ action: 'batch', requests: [null, 'postStream', 7, { action: 'postStream', classId: c.id, body: 'fine' }] });
  assert.deepEqual(plain(r.results).map((x) => x.result), ['error', 'error', 'error', 'success']);
});

test('batch: only allow-listed actions run; reads, student actions, whoami and nested batch are rejected per item', () => {
  const c = mkClass(['ada@x.org']);
  const tk = g.login('ada@x.org');
  const r = g.A({ action: 'batch', requests: [
    { action: 'listAssignments' },
    { action: 'listStream', classId: c.id },
    { action: 'getAssignmentStatus', id: 'x' },
    { action: 'getResults', code: 'T1' },
    { action: 'listClasses' },
    { action: 'saveAdmin', email: 'evil@x.org', role: 'owner' },
    { action: 'removeAdmin', email: 'a@x.org' },
    { action: 'whoami' },
    { action: 'syncProgress', idToken: tk, xp: { delta: 10 } },
    { action: 'getClassHub', idToken: tk },
    { action: 'batch', requests: [{ action: 'postStream', classId: c.id, body: 'sneaky' }] },
    { action: 'does_not_exist' },
    { action: '' },
    {},
    { action: '__proto__' },
    { action: 'toString' },
    { action: 'hasOwnProperty' },
  ] });
  assert.equal(r.result, 'success');
  assert.ok(plain(r.results).every((x) => x.result === 'error' && x.error === 'unknown_action'), JSON.stringify(r.results));
  assert.equal(g.rows('Stream').length, 0, 'the nested batch did not run');
  assert.equal(g.rows('Admins').filter((a) => a[0] === 'evil@x.org').length, 0);
  assert.equal(g.rows('Students').length, 0);
});

test('batch: every allow-listed write action is accepted', () => {
  const c = mkClass(['ada@x.org']);
  const post = g.A({ action: 'postStream', classId: c.id, body: 'x' }).post;
  const r = g.A({ action: 'batch', requests: [
    { action: 'saveAssignment', assignment: { classId: c.id, testCode: 'T1', title: 'A' } },
    { action: 'saveAccommodation', email: 'ada@x.org', extraTime: 2 },
    { action: 'deleteStreamPost', id: post.id },
    { action: 'saveClass', cls: { name: 'P9', emails: [] } },
  ] });
  assert.deepEqual(plain(r.results).map((x) => x.error), [undefined, undefined, undefined, undefined]);
  assert.deepEqual(plain(r.results).map((x) => x.result), ['success', 'success', 'success', 'success']);
});

test('batch: 50 items are allowed, 51 are refused as too_large and nothing runs', () => {
  const c = mkClass(['ada@x.org']);
  const items = (n) => Array.from({ length: n }, (_, i) => ({ action: 'postStream', classId: c.id, body: `p${i}` }));
  const over = g.A({ action: 'batch', requests: items(51) });
  assert.equal(over.result, 'error');
  assert.equal(over.error, 'too_large');
  assert.equal(g.rows('Stream').length, 0);
  const ok = g.A({ action: 'batch', requests: items(50) });
  assert.equal(ok.result, 'success');
  assert.equal(ok.results.length, 50);
  assert.equal(g.rows('Stream').length, 50);
});

test('batch: requests must be an array; an empty batch succeeds with no results', () => {
  assert.equal(g.A({ action: 'batch' }).error, 'invalid_request');
  assert.equal(g.A({ action: 'batch', requests: 'postStream' }).error, 'invalid_request');
  assert.equal(g.A({ action: 'batch', requests: { action: 'postStream' } }).error, 'invalid_request');
  assert.deepEqual(plain(g.A({ action: 'batch', requests: [] })), { result: 'success', results: [] });
});

test('batch: the admin check happens once up front, so a wrong key or a student token runs nothing', () => {
  const c = mkClass(['ada@x.org']);
  const requests = [{ action: 'postStream', classId: c.id, body: 'x' }];
  assert.equal(g.post({ action: 'batch', adminKey: 'wrong', requests }).error, 'unauthorized');
  assert.equal(g.post({ action: 'batch', idToken: g.login('ada@x.org'), requests }).result, 'error');
  assert.equal(g.rows('Stream').length, 0);
});

test('batch: logged actions are written to the log once per item', () => {
  const c = mkClass(['ada@x.org']);
  const logged = () => g.rows('Log').filter((l) => l[2] === 'saveAssignment').length;
  const before = logged();
  g.A({ action: 'batch', requests: [
    { action: 'saveAssignment', assignment: { classId: c.id, testCode: 'T1', title: 'A' } },
    { action: 'saveAssignment', assignment: { classId: c.id, testCode: 'T1', title: 'B' } },
    { action: 'saveAssignment', assignment: { classId: 'ghost', testCode: 'T1' } },
  ] });
  assert.equal(logged() - before, 2, 'the failed item is not logged');
});
