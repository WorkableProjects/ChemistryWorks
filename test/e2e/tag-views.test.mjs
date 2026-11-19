// Tags in grading, the student's released feedback and the profile. A rename on the Sheet shows up everywhere, and a
// result that is not released shows no "By topic".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, tid, poll, waitText, unlockAdmin, adhocTest, startTest, A, goNext, submit } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const TAG = 'tg_ab12cd';

const tagged = (code) => {
  const t = adhocTest(code);
  t.questions[0].tags = [TAG];
  t.questions[1].tags = [TAG];
  return t;
};

const resp = (id, earned, ok) => ({ questionId: id, type: 'truefalse', questionText: `Question ${id}`, pointsPossible: 1, pointsEarned: earned, isCorrect: ok, answered: true, needsGrading: false, manual: false, givenAnswer: ok, givenAnswerText: ok ? 'True' : 'False', correctAnswerText: 'True' });
const row = (id, email, name, r1, r2) => ({
  submission_id: id, timestamp: '2026-03-01T10:00:00Z', student_name: name, student_email: email, test_code: 'TAGV', test_title: 'Tagged test',
  score_achieved: r1 + r2, score_total: 2, percentage: ((r1 + r2) / 2) * 100, duration_seconds: 60, grades: null, comments: {}, released_at: '',
  responses: [resp('q1', r1, r1 === 1), resp('q2', r2, r2 === 1)],
});

test('grading: the tag filter and "By tag" use the Sheet name, and a rename shows after a reload', () => withSession(env, {}, async (s) => {
  const { page } = s;
  let tagName = 'Stoichiometry';
  s.serveTest('TAGV', tagged('TAGV'));
  s.onGas = (b) => {
    if (b.action === 'getResults') return { result: 'success', rows: [row('s1', 'ada@example.org', 'Ada', 1, 0), row('s2', 'bob@example.org', 'Bob', 1, 1)] };
    if (b.action === 'listTags') return { result: 'success', tags: [{ id: TAG, ownerEmail: 'admin@example.org', ownerName: 'admin', name: tagName, color: 'teal', description: '', mergedInto: '', usage: { questions: 2, tests: 1 } }] };
    return null;
  };
  const open = async () => {
    await unlockAdmin(page, s.url);
    await page.evaluate(() => sessionStorage.setItem('cw:adminKey', JSON.stringify('secret')));
    await page.locator(tid('tab-grading')).click();
    await page.locator(tid('grading-status-filter')).selectOption('all');
    await page.locator(tid('grading-row')).first().waitFor();
  };

  await open();
  await poll(async () => (await page.locator(`${tid('grading-tag-filter')} option`).allTextContents()).includes('Stoichiometry'), { message: 'tag filter lists the Sheet name' });
  const raw = await page.locator(`${tid('grading-tag-filter')} option`).evaluateAll((os) => os.map((o) => o.value + o.textContent));
  assert.ok(!raw.some((x) => x.includes('Unknown')), 'no unknown tag once the names have loaded');
  const stats = page.locator(tid('grading-tag-stats'));
  await stats.waitFor();
  await waitText(stats.locator(tid('grading-tag-stats-row')).first(), /Stoichiometry/);
  await waitText(stats.locator(tid('grading-tag-stats-pct')).first(), '75%'); // ada 1 of 2 and bob 2 of 2
  assert.doesNotMatch(await stats.textContent(), /tg_ab12cd/, 'the id is never shown');

  await page.locator(tid('grading-tag-filter')).selectOption(TAG);
  assert.equal(await page.locator(tid('grading-row')).count(), 2, 'both submissions are of a test that has the tag');

  await page.locator(tid('grading-mode-question')).click();
  await waitText(page.locator(tid('gbq-tag-stats')).locator(tid('gbq-tag-stats-row')).first(), /Stoichiometry/);
  await page.locator(tid('gbq-tag-filter')).selectOption(TAG);
  assert.equal(await page.locator(`${tid('gbq-question')} option`).count(), 2, 'both questions carry the tag');

  tagName = 'Mole ratios';
  await open();
  await waitText(page.locator(tid('grading-tag-stats')).locator(tid('grading-tag-stats-row')).first(), /Mole ratios/);
  assert.doesNotMatch(await page.locator(tid('grading-tag-stats')).textContent(), /Stoichiometry/);
}));

test('students: released feedback and the profile show "By topic" with the current name; an unreleased result shows none', () => withSession(env, {}, async (s) => {
  const { page } = s;
  let released = false;
  let tagName = 'Stoichiometry';
  s.serveTest('TAGV', tagged('TAGV'));
  await startTest(s, 'TAGV');
  await A.mcq(page, 'b'); await goNext(page);
  await A.tf(page, false);
  await submit(page);
  assert.equal(await page.locator(tid('results-topics')).count(), 0, 'the instant result is not released: no "By topic"');
  const sub = s.gas.find((b) => b.submission_id);
  assert.ok(sub);

  s.onGas = (b) => {
    const tagIndex = { [TAG]: { name: tagName, color: 'teal' } };
    if (b.action === 'getFeedback') {
      return released
        ? { result: 'success', released: true, released_at: '2026-03-01T10:00:00Z', status: 'Graded', final_score: 1, score_total: 2, final_percentage: 50, grades: {}, comments: {}, tagIndex }
        : { result: 'success', released: false, tagIndex };
    }
    if (b.action === 'getStudentProfile') {
      return { result: 'success', profile: {}, attempts: [], assigned: [], hub: null,
        results: [{ testCode: 'TAGV', title: sub.test_title, submittedAt: sub.submitted_at, released, status: released ? 'released' : 'submitted', ...(released ? { percentage: 50, scoreAchieved: 1, scoreTotal: 2 } : {}) }] };
    }
    return null;
  };
  const asGoogle = () => page.evaluate(async () => {
    const { getUser } = await import('/js/lib/auth.js');
    Object.assign(getUser(), { provider: 'google', idToken: 'test-token', idTokenExp: Math.floor(Date.now() / 1000) + 3600 });
  });
  await page.locator(tid('home-btn')).first().click();
  await page.locator(tid('home')).waitFor();
  await asGoogle();

  // Not released: the profile has no tag section.
  await page.locator(tid('profile-link')).click();
  await page.locator(tid('profile')).waitFor();
  await poll(() => s.gas.some((b) => b.action === 'getStudentProfile'), { message: 'profile request' });
  await page.waitForTimeout(300);
  assert.equal(await page.locator(tid('profile-tags')).count(), 0);

  // Released.
  released = true;
  await page.locator(tid('profile-back')).click();
  await page.locator(tid('home')).waitFor();
  await page.locator('[data-testid^="view-feedback-"]').first().waitFor();
  await page.locator('[data-testid^="view-feedback-"]').first().click();
  await page.locator(tid('feedback-released')).waitFor();
  const topics = page.locator(tid('feedback-topics'));
  await topics.waitFor();
  await waitText(topics.locator(tid('feedback-topics-row')).first(), /Stoichiometry/);
  await waitText(topics.locator(tid('feedback-topics-pct')).first(), '50%');
  assert.doesNotMatch(await topics.textContent(), /tg_ab12cd/);

  // The teacher renames the tag; the student sees the new name in feedback and on the profile.
  tagName = 'Mole ratios';
  await page.locator(tid('feedback-back')).click();
  await page.locator(tid('home')).waitFor();
  await page.locator('[data-testid^="view-feedback-"]').first().click();
  await waitText(page.locator(tid('feedback-topics')).locator(tid('feedback-topics-row')).first(), /Mole ratios/);

  await page.locator(tid('feedback-back')).click();
  await page.locator(tid('home')).waitFor();
  await page.locator(tid('profile-link')).click();
  await page.locator(tid('profile')).waitFor();
  const prof = page.locator(tid('profile-tags'));
  await prof.waitFor();
  await waitText(prof.locator(tid('profile-tags-row')).first(), /Mole ratios/);
  await waitText(prof.locator(tid('profile-tags-pct')).first(), '50%');
  assert.doesNotMatch(await prof.textContent(), /tg_ab12cd/);
}));
