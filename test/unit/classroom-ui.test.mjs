import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toClassroomCsv, STATUS } from '../../js/views/admin/stats.js';
import { classroomErrorText, actionLabel } from '../../js/views/admin/classroom-sync.js';

const row = (o) => ({ student_name: 'Ada Lovelace', student_email: 'ADA@example.org', test_code: 'T1', test_title: 'Quiz 1', score_achieved: 8, status: STATUS.AUTO, timestamp: '2026-01-01T00:00:00Z', ...o });

test('Classroom CSV: last name, first name, email, one column per test', () => {
  const csv = toClassroomCsv([row({}), row({ test_code: 'T2', test_title: 'Quiz 2', score_achieved: 5 }), row({ student_name: 'Ben Okafor', student_email: 'ben@example.org' })]);
  assert.deepEqual(csv.trim().split('\r\n'), [
    'Last Name,First Name,Email Address,Quiz 1,Quiz 2',
    'Lovelace,Ada,ada@example.org,8,5',
    'Okafor,Ben,ben@example.org,8,',
  ]);
});

test('Classroom CSV: newest submission wins, ungraded is blank, extra attempts are ignored', () => {
  const csv = toClassroomCsv([
    row({ score_achieved: 2, timestamp: '2026-01-01T00:00:00Z' }),
    row({ score_achieved: 9, timestamp: '2026-01-02T00:00:00Z' }),
    row({ score_achieved: 1, timestamp: '2026-01-03T00:00:00Z', status: STATUS.EXTRA }),
    row({ student_email: 'cy@example.org', student_name: 'Cy', status: STATUS.NEEDS_GRADING }),
  ]);
  assert.deepEqual(csv.trim().split('\r\n').slice(1), ['Lovelace,Ada,ada@example.org,9', ',Cy,cy@example.org,']);
});

test('error copy is a plain sentence for the Classroom codes', () => {
  assert.equal(classroomErrorText('classroom_not_our_coursework'), 'This assignment was made in Classroom, not here. Post it from ChemistryWorks to sync grades.');
  assert.match(classroomErrorText('classroom_not_teacher'), /not a teacher/);
  assert.match(classroomErrorText('classroom_error', 'Quota'), /Quota$/);
});

test('sync action labels', () => {
  assert.equal(actionLabel({ action: 'new', target: 'assigned' }), 'Send and release');
  assert.equal(actionLabel({ action: 'update', target: 'draft' }), 'Send as draft');
  assert.equal(actionLabel({ action: 'skipped_teacher_changed' }), 'Skip: changed in Classroom');
});
