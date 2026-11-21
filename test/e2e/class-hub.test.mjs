// Class Hub, end to end across two browser sessions that share one stateful mock backend:
// the teacher assigns and posts, the student finds it in Up next (and the bell), opens it with no code and submits
// after the due time, and the teacher's tracker shows Late.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startEnv, newSession, tid, poll, waitText, unlockAdmin, withAdminKey, signInStudentAs, createMockBackend, adhocTest, A, goNext, submit, STUDENT,
} from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const CODE = 'HUB1';
const BEN = 'ben@example.org';
const HOUR = 3600000;
const localInput = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

async function assignAsTeacher(teacher, dueAt) {
  const { page, url } = teacher;
  await unlockAdmin(page, url);
  await page.locator(tid('tab-classes')).click();
  await page.locator(tid('class-open-c1')).click();
  await page.locator(tid('class-tab-assignments')).click();
  await page.locator(tid('assignments-empty')).waitFor();
  await page.locator(tid('assign-btn')).click();
  await page.locator(tid('assign-test')).selectOption(CODE);
  await page.locator(tid('assign-due')).fill(localInput(dueAt));
  await page.locator(tid('assign-save')).click();
  await page.locator(tid('toast')).filter({ hasText: 'Assigned to 1 class' }).waitFor();
}

test('teacher assigns, student sees it in Up next and the bell, submits late, tracker shows Late', async () => {
  const be = createMockBackend({
    classes: [{ id: 'c1', name: 'Period 3 Chemistry', period: '3', emails: [STUDENT.email, BEN] }],
    tests: [{ code: CODE, title: 'Hub quiz' }], students: { [STUDENT.email]: STUDENT.name, [BEN]: 'Ben Okafor' },
  });
  const teacher = await newSession(env);
  const student = await newSession(env);
  try {
    for (const s of [teacher, student]) { be.attach(s); s.serveTest(CODE, adhocTest(CODE, { title: 'Hub quiz' })); }
    await withAdminKey(teacher);
    await signInStudentAs(student);

    // Teacher: assign to the class (due in one hour), then post to the stream.
    const dueAt = Math.floor((Date.now() + HOUR) / 60000) * 60000;
    await assignAsTeacher(teacher, dueAt);
    assert.equal(be.state.assignments.length, 1);
    const [assignment] = be.state.assignments;
    assert.equal(assignment.testCode, CODE);
    assert.equal(assignment.classId, 'c1');
    assert.equal(Date.parse(assignment.dueAt), dueAt);
    await teacher.page.locator(tid('class-tab-stream')).click();
    await teacher.page.locator(tid('stream-input')).fill('Bring a calculator on Friday');
    await teacher.page.locator(tid('stream-post-btn')).click();
    await poll(() => be.state.stream.some((p) => p.type === 'post' && p.body === 'Bring a calculator on Friday'), { message: 'stream post stored' });

    // Student: Up next shows the assignment, the bell has one unread notification.
    const sp = student.page;
    await sp.goto(student.url + '/');
    const row = sp.locator(`${tid('up-next')} ${tid(`assignment-${assignment.id}`)}`);
    await row.waitFor();
    assert.match(await row.textContent(), /Hub quiz/);
    assert.match(await sp.locator(tid(`assignment-chip-${assignment.id}`)).textContent(), /^(Due today|Due tomorrow|Due )/);
    await waitText(sp.locator(tid('bell-count')), '1');
    await sp.locator(tid('bell')).click();
    await sp.locator(tid(`notification-new:${assignment.id}`)).waitFor();
    await poll(() => student.gas.some((b) => b.action === 'markNotificationsRead' && b.ids.includes(`new:${assignment.id}`)), { message: 'notification marked read' });
    await sp.locator(tid('bell-count')).waitFor({ state: 'hidden' });
    await sp.locator(tid('bell')).click(); // close the panel

    // Student: the class page shows the teacher's post and the assignment.
    await sp.locator(tid('class-link-c1')).click();
    await sp.locator(tid('class-page')).waitFor();
    const post = be.state.stream.find((p) => p.type === 'post');
    await waitText(sp.locator(`${tid(`stream-post-${post.id}`)} .hub-post__body`), 'Bring a calculator on Friday');
    await sp.locator(`${tid('class-assignments')} ${tid(`assignment-${assignment.id}`)}`).waitFor();
    await sp.locator(tid('class-back')).click();

    // Time passes: an hour and ten minutes later the assignment is overdue.
    const later = dueAt + 10 * 60000;
    await student.context.clock.setFixedTime(later);
    be.state.now = () => later;
    await sp.reload();
    await waitText(sp.locator(tid(`assignment-chip-${assignment.id}`)), 'Missing'); // overdue and nothing turned in

    // Open it without typing a code, answer, submit.
    await sp.locator(tid(`assignment-open-${assignment.id}`)).click();
    await sp.locator(tid('runner')).waitFor();
    await A.mcq(sp, 'b'); await goNext(sp); await A.tf(sp, true);
    await submit(sp);
    await poll(() => be.state.submissions.length === 1, { message: 'submission stored' });
    assert.equal(be.state.submissions[0].testCode, CODE);
    assert.ok(Date.parse(be.state.submissions[0].submittedAt) > dueAt, 'submitted after the due time');

    // Student's class page lists it under Past, marked Late.
    await sp.locator(tid('home-btn')).click();
    await sp.locator(tid('class-link-c1')).click();
    await waitText(sp.locator(`${tid('class-past')} ${tid(`assignment-chip-${assignment.id}`)}`), 'Late');

    // Teacher: the tracker shows Ada as Late and Ben as Missing.
    const tp = teacher.page;
    await tp.locator(tid('class-tab-assignments')).click();
    await tp.locator(`${tid(`assignment-${assignment.id}`)} .hub-item__main`).click();
    await tp.locator(tid('tracker')).waitFor();
    assert.equal(await tp.locator(`${tid(`tracker-row-${STUDENT.email}`)} .pill`).getAttribute('data-status'), 'late');
    await waitText(tp.locator(`${tid(`tracker-row-${STUDENT.email}`)} .pill`), 'Late');
    assert.equal(await tp.locator(`${tid(`tracker-row-${BEN}`)} .pill`).getAttribute('data-status'), 'missing');
    await tp.locator(tid('tracker-filter-late')).click();
    assert.equal(await tp.locator('[data-testid^="tracker-row-"]').count(), 1);

    for (const s of [teacher, student]) assert.deepEqual(s.errors, []);
  } finally {
    await teacher.close();
    await student.close();
  }
});
