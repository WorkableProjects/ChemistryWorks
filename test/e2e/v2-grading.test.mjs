import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, tid, poll, waitText, unlockAdmin } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const row = (over = {}) => ({
  submission_id: 'sub-v2-1', timestamp: '2026-03-01T10:00:00Z', student_name: 'Ada Lovelace', student_email: 'ada@example.org',
  test_code: 'CHEMV2', test_title: 'Electrons & Bonding (v2 sample)', score_achieved: 1, score_total: 11, percentage: 9.09, duration_seconds: 600,
  status: 'Needs grading', final_score: null, final_percentage: null, grades: null, comments: {}, released_at: '',
  responses: [
    { questionId: 'warm', type: 'mcq', questionText: 'Which particle has a negative charge?', pointsPossible: 1, pointsEarned: 1, isCorrect: true, answered: true, needsGrading: false, manual: false, givenAnswer: 'b', givenAnswerText: 'Electron', correctAnswerText: 'Electron' },
    { questionId: 'orbN', type: 'orbital', sectionId: 'secA', questionText: 'Draw the orbital diagram for nitrogen.', pointsPossible: 3, pointsEarned: 0, isCorrect: false, answered: true, needsGrading: true, manual: true,
      givenAnswer: { '1s': ['ud'], '2s': ['ud'], '2p': ['u', 'u', 'u'] }, givenAnswerText: '1s: ↑↓; 2s: ↑↓; 2p: ↑ ↑ ↑', correctAnswerText: '—' },
    { questionId: 'config', type: 'short', sectionId: 'secA', questionText: 'Write the electron configuration of sodium.', pointsPossible: 1, pointsEarned: 0, isCorrect: false, answered: true, needsGrading: true, manual: true,
      givenAnswer: '1s2 2s2 2p6 3s1', givenAnswerText: '1s2 2s2 2p6 3s1', correctAnswerText: '1s2 2s2 2p6 3s1' },
  ],
  ...over,
});

async function openGrader(s, r, extra = {}) {
  const { page, url } = s;
  s.onGas = (body) => {
    if (body.action === 'getResults') return { result: 'success', rows: [r] };
    if (body.action === 'saveGrade') return { result: 'success', grade: { status: 'Graded', final_score: 5, score_total: 5, final_percentage: 100, grades: body.grades, comments: body.comments, released_at: body.release ? '2026-03-02T00:00:00.000Z' : '', graded_at: new Date().toISOString(), teacher_note: body.note } };
    return null;
  };
  await unlockAdmin(page, url);
  await page.evaluate(() => sessionStorage.setItem('cw:adminKey', JSON.stringify('secret')));
  await page.locator(tid('tab-grading')).click();
  await page.locator(tid('grading-status-filter')).selectOption('all');
  await page.locator(tid('grading-row')).first().click();
  await page.locator(tid('grade-item')).first().waitFor();
}
const saves = (s) => s.gas.filter((b) => b.action === 'saveGrade');

test('Full / Half / Zero buttons, validation, override pill', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await openGrader(s, row());
  await page.locator(tid('grade-half-orbN')).click();
  assert.equal(await page.locator(tid('points-orbN')).inputValue(), '1.5');
  await page.locator(tid('grade-full-orbN')).click();
  assert.equal(await page.locator(tid('points-orbN')).inputValue(), '3');
  await page.locator(tid('grade-zero-orbN')).click();
  assert.equal(await page.locator(tid('points-orbN')).inputValue(), '0');

  // Override on the auto-graded question.
  assert.equal(await page.locator(tid('override-warm')).isVisible(), false);
  await page.locator(tid('grade-half-warm')).click();
  assert.equal(await page.locator(tid('points-warm')).inputValue(), '0.5');
  await waitText(page.locator(tid('override-warm')), 'Override · auto 1');

  // Invalid entries.
  await page.locator(tid('points-orbN')).fill('-1');
  await waitText(page.locator(tid('points-error-orbN')), 'Points can’t be negative.');
  assert.equal(await page.locator(tid('points-orbN')).getAttribute('aria-invalid'), 'true');
  await page.locator(tid('points-orbN')).fill('99');
  await waitText(page.locator(tid('points-error-orbN')), 'Maximum is 3 points.');
  await page.locator(tid('points-config')).fill('1');
  await page.locator(tid('save-grade')).click();
  await page.locator(tid('toast')).filter({ hasText: 'Fix the highlighted points first.' }).waitFor();
  assert.equal(saves(s).length, 0);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.testid), 'points-orbN');
  await page.locator(tid('points-orbN')).fill('2.5');
  assert.equal(await page.locator(tid('points-orbN')).getAttribute('aria-invalid'), null);
  assert.equal(await page.locator(tid('points-error-orbN')).textContent(), '');
}));

test('comment preview, release and save payload', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await openGrader(s, row());
  await page.locator(tid('points-orbN')).fill('2.5');
  await page.locator(tid('points-config')).fill('1');
  await page.locator(tid('comment-orbN')).fill('**Great** see https://example.com');
  const prev = page.locator(tid('comment-preview-orbN'));
  await prev.locator('strong').waitFor();
  assert.equal(await prev.locator('strong').textContent(), 'Great');
  const a = prev.locator('a');
  assert.equal(await a.getAttribute('target'), '_blank');
  assert.match(await a.getAttribute('rel'), /noopener/);
  assert.equal(await page.locator(tid('comment-preview-config')).isVisible(), false);
  await waitText(page.locator(tid('released-status')), /Not released/);
  await page.locator(tid('comment-config')).fill('temp');
  await page.locator(tid('comment-config')).fill('');
  await page.locator(tid('release-grade')).check();
  await page.locator(tid('save-grade')).click();
  await poll(() => saves(s).length === 1, { message: 'saveGrade POST' });
  const save = saves(s)[0];
  assert.equal(save.release, true);
  assert.deepEqual(save.comments, { orbN: '**Great** see https://example.com' });
  assert.deepEqual(save.grades, { orbN: 2.5, config: 1 });
  await waitText(page.locator(tid('released-status')), /^Released/);
  assert.equal(await page.locator(tid('release-grade')).isChecked(), true);
}));

test('existing comments and release state are loaded; list shows Released column', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await openGrader(s, row({ status: 'Graded', grades: { orbN: 2, config: 1 }, final_score: 4, comments: { config: 'Nice work' }, released_at: '2026-03-02T00:00:00Z' }));
  assert.equal(await page.locator(tid('comment-config')).inputValue(), 'Nice work');
  assert.equal(await page.locator(tid('release-grade')).isChecked(), true);
  await waitText(page.locator(tid('released-status')), /^Released/);
  await page.locator(tid('grading-back')).click();
  await waitText(page.locator(tid('grading-row')).first().locator('td').nth(6), 'Yes');
}));

test('section headings and orbital diagram', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await openGrader(s, row());
  const heads = page.locator(tid('grade-section'));
  await heads.first().waitFor();
  assert.equal(await heads.count(), 1);
  assert.match(await heads.first().textContent(), /Part A: Electron configuration/);
  assert.match(await heads.first().textContent(), /8 pts/);
  const cell = page.locator(`${tid('grade-item')}[data-question="orbN"] dl`);
  assert.ok(await cell.locator('.orb, [role=img]').count() >= 1, 'orbital diagram rendered');
  assert.match(await cell.textContent(), /2p/);
}));

test('export button requires a saved grade', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await openGrader(s, row());
  await page.locator(tid('points-orbN')).fill('2');
  await page.locator(tid('export-pdf')).click();
  await page.locator(tid('toast')).filter({ hasText: 'Save the grade first' }).waitFor();
}));

test('Save & next with "Graded by" filled saves once (no repeat loop) on the last submission', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await openGrader(s, row());
  await page.locator(tid('grade-full-orbN')).click();
  await page.locator(tid('grade-full-config')).click();
  await page.locator(tid('graded-by')).fill('Ms. Rivera');
  await page.locator(tid('save-grade-next')).click();
  await poll(() => saves(s).length >= 1, { message: 'saveGrade POST' });
  await page.locator(tid('grading-table')).waitFor();
  await page.waitForTimeout(1500);
  assert.equal(saves(s).length, 1, 'grade saved exactly once');
  assert.equal(await page.evaluate(() => localStorage.getItem('cw:gradedBy')), JSON.stringify('Ms. Rivera'));
}));
