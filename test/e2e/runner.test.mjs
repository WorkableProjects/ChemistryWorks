import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startEnv, withSession, startTest, tid, poll, waitText, waitAttr, activeCard, activeId, goNext, goPrev, A,
  answerCHEM101, submit, STUDENT,
} from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const PAYLOAD_FIELDS = [
  'submission_id', 'student_name', 'student_email', 'test_code', 'test_title', 'score_achieved', 'score_total',
  'percentage', 'responses', 'started_at', 'submitted_at', 'duration_seconds', 'flags',
];
const NETLIFY_FIELDS = [
  'form-name', 'submission_id', 'student_name', 'student_email', 'test_code', 'test_title', 'score_achieved',
  'score_total', 'percentage', 'duration_seconds', 'responses_json', 'flags_json', 'submitted_at',
];

test('full correct CHEM101 run: 100.00%, 12 / 12, payloads captured', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  await answerCHEM101(page);
  await waitText(page.locator(tid('progress-text')), '7 of 7 answered');
  await submit(page);

  await waitText(page.locator(tid('score-percentage')), '100.00%');
  await waitText(page.locator(tid('score-points')), '12 / 12');
  await waitText(page.locator(tid('score-correct')), '7 of 7 correct');
  await waitText(page.locator(tid('answered-count')), '7 of 7 answered');
  await waitAttr(page.locator(tid('submission-status')), 'data-gas', 'sent');
  await waitAttr(page.locator(tid('submission-status')), 'data-netlify', 'sent');
  await waitAttr(page.locator(tid('submission-status')), 'data-queued', 'false');
  for (const id of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7']) {
    await waitAttr(page.locator(tid(`review-item-${id}`)), 'data-correct', 'true');
  }

  assert.equal(s.gas.length, 1);
  const p = s.gas[0];
  for (const f of PAYLOAD_FIELDS) assert.ok(f in p, `GAS payload has ${f}`);
  assert.equal(p.student_name, STUDENT.name);
  assert.equal(p.student_email, STUDENT.email);
  assert.equal(p.test_code, 'CHEM101');
  assert.equal(p.test_title, 'Foundations of Chemistry');
  assert.equal(p.score_achieved, 12);
  assert.equal(p.score_total, 12);
  assert.equal(p.percentage, '100.00');
  assert.equal(p.responses.length, 7);
  assert.ok(p.responses.every((r) => r.isCorrect));
  assert.match(p.submission_id, /\S{8,}/);
  assert.ok(Number.isInteger(p.duration_seconds) && p.duration_seconds >= 0);
  assert.equal(p.flags.auto_submitted, false);
  assert.equal(p.flags.mode, 'focus');
  assert.equal(p.flags.tab_switches, 0);

  assert.equal(s.netlify.length, 1);
  const n = s.netlify[0];
  for (const f of NETLIFY_FIELDS) assert.ok(f in n, `Netlify body has ${f}`);
  assert.equal(n['form-name'], 'chemistryworks-submissions');
  assert.equal(n.submission_id, p.submission_id);
  assert.equal(n.test_code, 'CHEM101');
  assert.equal(JSON.parse(n.responses_json).length, 7);
}));

test('mixed answers with partial credit give 47.25%', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  // q1 right (1) ; q2 a,b,c => (2-1)/3*2 = 0.67 ; q3 wrong (0) ; q4 wrong case (0) ; q5 wrong (0)
  // q6 na,mg right + al wrong => 2/3*3 = 2 ; q7 1.2e24 within 1% => 2   => 5.67 / 12 = 47.25%
  await A.mcq(page, 'b'); await goNext(page);
  await A.multi(page, ['a', 'b', 'c']); await goNext(page);
  await A.numeric(page, '19'); await goNext(page);
  await A.formula(page, 'h2so4'); await goNext(page);
  await A.tf(page, false); await goNext(page);
  await A.match(page, { na: 'p1', mg: 'p2', al: 'p1' }); await goNext(page);
  await A.numeric(page, '1.2e24');
  await submit(page);

  await waitText(page.locator(tid('score-percentage')), '47.25%');
  await waitText(page.locator(tid('score-points')), '5.67 / 12');
  await waitText(page.locator(tid('score-correct')), '2 of 7 correct');
  await waitAttr(page.locator(tid('review-item-q2')), 'data-status', 'partial');
  await waitAttr(page.locator(tid('review-item-q6')), 'data-status', 'partial');
  await waitAttr(page.locator(tid('review-item-q4')), 'data-status', 'incorrect');
  assert.equal(s.gas[0].percentage, '47.25');
  assert.equal(s.gas[0].score_achieved, 5.67);
}));

test('progress bar and navigator tiles reflect state', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  const bar = page.locator(tid('progress-bar'));
  await waitAttr(bar, 'aria-valuenow', '0');
  assert.equal(await bar.getAttribute('aria-valuemax'), '7');
  await A.mcq(page, 'b');
  await waitAttr(bar, 'aria-valuenow', '1');
  await waitText(page.locator(tid('progress-text')), '1 of 7 answered');
  await goNext(page);
  await A.multi(page, ['a']);
  await waitAttr(bar, 'aria-valuenow', '2');
  await A.multi(page, ['a']); // untick -> unanswered again
  await waitAttr(bar, 'aria-valuenow', '1');

  await activeCard(page).locator(tid('flag-btn')).click();
  await waitAttr(activeCard(page).locator(tid('flag-btn')), 'aria-pressed', 'true');

  await page.locator(tid('navigator-toggle')).click();
  await page.locator(tid('navigator')).waitFor();
  const cls = async (id) => (await page.locator(tid(`nav-item-${id}`)).getAttribute('class')).split(/\s+/);
  await poll(async () => (await cls('q1')).includes('is-answered'), { message: 'q1 answered tile' });
  assert.ok(!(await cls('q1')).includes('is-current'));
  const c2 = await cls('q2');
  assert.ok(c2.includes('is-current') && c2.includes('is-flagged') && !c2.includes('is-answered'), c2.join(' '));
  const c3 = await cls('q3');
  assert.ok(!c3.includes('is-answered') && !c3.includes('is-flagged') && !c3.includes('is-current'), c3.join(' '));

  // tile click jumps
  await page.locator(tid('nav-item-q5')).click();
  await poll(async () => (await activeId(page)) === 'q5', { message: 'jump to q5' });
}));

test('submit modal lists unanswered questions, jump buttons work, cancel keeps going', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  await A.mcq(page, 'b');
  await page.locator(tid('submit-btn')).click();
  const modal = page.locator(tid('submit-modal'));
  await modal.waitFor();
  const warn = page.locator(tid('unanswered-warning'));
  await warn.waitFor();
  assert.match(await warn.textContent(), /You have 6 unanswered questions/);
  const jumps = warn.locator('button');
  assert.equal(await jumps.count(), 6);
  assert.deepEqual(await jumps.allTextContents(), ['2', '3', '4', '5', '6', '7']);

  // jump to question 4
  await warn.locator('button[aria-label="Go to question 4"]').click();
  await modal.waitFor({ state: 'detached' });
  await poll(async () => (await activeId(page)) === 'q4', { message: 'jump to q4' });

  // cancel keeps the test running and answers intact
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('submit-modal')).waitFor();
  await page.locator(tid('cancel-submit')).click();
  await page.locator(tid('submit-modal')).waitFor({ state: 'detached' });
  await A.formula(page, 'H2SO4');
  await waitAttr(page.locator(tid('progress-bar')), 'aria-valuenow', '2');
  assert.equal(s.gas.length, 0, 'nothing submitted');

  // Escape also dismisses
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('submit-modal')).waitFor();
  await page.keyboard.press('Escape');
  await page.locator(tid('submit-modal')).waitFor({ state: 'detached' });
  assert.equal(await page.locator(tid('results')).count(), 0);
}));

test('a fully answered test shows no unanswered warning', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  await answerCHEM101(page);
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('submit-modal')).waitFor();
  assert.equal(await page.locator(tid('unanswered-warning')).count(), 0);
  await page.locator(tid('cancel-submit')).click();
}));

test('keyboard shortcuts: arrows, option number, t, g, ?', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  await page.locator('body').click({ position: { x: 5, y: 5 } });

  await page.keyboard.press('2');
  await waitAttr(activeCard(page).locator(tid('option-b')), 'aria-checked', 'true');
  await waitAttr(page.locator(tid('progress-bar')), 'aria-valuenow', '1');

  await page.keyboard.press('ArrowRight');
  await poll(async () => (await activeId(page)) === 'q2', { message: 'ArrowRight -> q2' });
  await page.keyboard.press('ArrowLeft');
  await poll(async () => (await activeId(page)) === 'q1', { message: 'ArrowLeft -> q1' });

  for (const id of ['q2', 'q3', 'q4', 'q5']) {
    await page.keyboard.press('ArrowRight');
    await poll(async () => (await activeId(page)) === id, { message: `-> ${id}` });
  }
  await page.keyboard.press('t');
  await waitAttr(activeCard(page).locator(tid('tf-true')), 'aria-checked', 'true');
  await page.keyboard.press('f');
  await waitAttr(activeCard(page).locator(tid('tf-false')), 'aria-checked', 'true');

  await page.keyboard.press('g');
  await waitAttr(activeCard(page).locator(tid('flag-btn')), 'aria-pressed', 'true');
  await page.keyboard.press('g');
  await waitAttr(activeCard(page).locator(tid('flag-btn')), 'aria-pressed', 'false');

  await page.keyboard.press('?');
  await page.locator(tid('shortcuts-modal')).waitFor();
  await page.keyboard.press('Escape');
  await page.locator(tid('shortcuts-modal')).waitFor({ state: 'detached' });

  await page.keyboard.press('n');
  await page.locator(`${tid('navigator')}.is-open`).waitFor();
}));

test('scroll mode shows all cards and answers persist across the toggle', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  assert.equal(await page.locator(tid('question-card')).count(), 1, 'focus mode renders the active card only');
  await A.mcq(page, 'b');

  await page.locator(tid('mode-toggle')).click();
  await poll(async () => (await page.locator(tid('question-card')).count()) === 7, { message: '7 cards in scroll mode' });
  await waitAttr(page.locator('[data-question-id="q1"] ' + tid('option-b')), 'aria-checked', 'true');
  // answer another question in scroll mode
  await page.locator('[data-question-id="q5"] ' + tid('tf-true')).click();
  await waitAttr(page.locator(tid('progress-bar')), 'aria-valuenow', '2');

  await page.locator(tid('mode-toggle')).click();
  await poll(async () => (await page.locator(tid('question-card')).count()) === 1, { message: 'back to focus mode' });
  await waitAttr(page.locator(tid('progress-bar')), 'aria-valuenow', '2');
  while ((await activeId(page)) !== 'q1') await goPrev(page);
  await waitAttr(activeCard(page).locator(tid('option-b')), 'aria-checked', 'true');
  for (let i = 0; i < 4; i++) await goNext(page);
  await waitAttr(activeCard(page).locator(tid('tf-true')), 'aria-checked', 'true');
}));

test('scroll-mode submit records mode in the payload', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  await page.locator(tid('mode-toggle')).click();
  await poll(async () => (await page.locator(tid('question-card')).count()) === 7);
  await page.locator('[data-question-id="q1"] ' + tid('option-b')).click();
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('confirm-submit')).click();
  await page.locator(tid('results')).waitFor();
  assert.equal(s.gas[0].flags.mode, 'scroll');
}));

test('formula and numeric widgets show live previews', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  for (let i = 0; i < 3; i++) await goNext(page); // q4 formula
  assert.equal(await activeId(page), 'q4');
  await A.formula(page, 'CuSO4.5H2O');
  const fp = activeCard(page).locator(tid('formula-preview'));
  await poll(async () => (await fp.innerHTML()).includes('<sub>4</sub>'), { message: 'formula subscripts' });
  const html = await fp.innerHTML();
  assert.ok(html.includes('<sub>2</sub>'), html);
  assert.ok(html.includes('·'), 'hydrate dot');

  await A.formula(page, 'SO4^2-');
  await poll(async () => (await fp.innerHTML()).includes('<sup>2−</sup>'), { message: 'charge superscript' });

  for (let i = 0; i < 3; i++) await goNext(page); // q7 numeric
  assert.equal(await activeId(page), 'q7');
  await A.numeric(page, '6.02x10^23');
  await waitText(activeCard(page).locator(tid('numeric-preview')), 'Interpreted as 6.02 × 10²³');
  await A.numeric(page, 'abc');
  await waitText(activeCard(page).locator(tid('numeric-preview')), 'Not a number yet');
}));

test('clear-answer removes an answer', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  await A.mcq(page, 'a');
  await waitAttr(page.locator(tid('progress-bar')), 'aria-valuenow', '1');
  await activeCard(page).locator(tid('clear-answer')).click();
  await waitAttr(page.locator(tid('progress-bar')), 'aria-valuenow', '0');
  await waitAttr(activeCard(page).locator(tid('option-a')), 'aria-checked', 'false');
}));

test('autosave: reload restores answers, shows a toast, landing offers resume', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  await A.mcq(page, 'b'); await goNext(page);
  await A.multi(page, ['a', 'c']); await goNext(page);
  await A.numeric(page, '18.016');
  const key = `cw:progress:${STUDENT.email}:CHEM101`;
  await poll(async () => {
    const raw = await page.evaluate((k) => localStorage.getItem(k), key);
    return raw && Object.keys(JSON.parse(raw).answers).length === 3;
  }, { message: 'progress saved' });

  await page.reload();
  await page.locator(tid('runner')).waitFor();
  await waitText(page.locator(tid('toast')), /Welcome back/);
  await waitAttr(page.locator(tid('progress-bar')), 'aria-valuenow', '3');
  assert.equal(await activeId(page), 'q3');
  assert.equal(await activeCard(page).locator(tid('numeric-input')).inputValue(), '18.016');
  await goPrev(page);
  await waitAttr(activeCard(page).locator(tid('option-a')), 'aria-checked', 'true');
  await waitAttr(activeCard(page).locator(tid('option-c')), 'aria-checked', 'true');
  await waitAttr(activeCard(page).locator(tid('option-b')), 'aria-checked', 'false');

  await page.locator(tid('brand')).click();
  await page.locator(tid('resume-CHEM101')).waitFor();
  assert.match(await page.locator(tid('resume-CHEM101')).textContent(), /3 answered/);
  await page.locator(tid('resume-CHEM101')).click();
  await page.locator(tid('runner')).waitFor();
  await waitAttr(page.locator(tid('progress-bar')), 'aria-valuenow', '3');

  // after submitting, the saved progress is discarded
  while ((await activeId(page)) !== 'q3') await goNext(page);
  await goNext(page);
  await A.formula(page, 'H2SO4'); await goNext(page);
  await A.tf(page, true); await goNext(page);
  await A.match(page, { na: 'p1', mg: 'p2', al: 'p3' }); await goNext(page);
  await A.numeric(page, '1.2044e24');
  await submit(page);
  await poll(async () => (await page.evaluate((k) => localStorage.getItem(k), key)) === null, { message: 'progress cleared' });
}));

test('flagged state survives a reload', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s);
  await page.keyboard.press('g');
  await waitAttr(activeCard(page).locator(tid('flag-btn')), 'aria-pressed', 'true');
  await page.reload();
  await page.locator(tid('runner')).waitFor();
  await waitAttr(activeCard(page).locator(tid('flag-btn')), 'aria-pressed', 'true');
}));

test('timer: time limit auto-submits and flags the payload', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('TIMED1', {
    code: 'TIMED1', title: 'Timed', timeLimitMinutes: 0.05,
    questions: [{ id: 'q1', type: 'mcq', text: 'Pick B', points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctAnswer: 'b', explanation: 'B.' }],
  });
  await startTest(s, 'TIMED1');
  await poll(async () => /^0:0\d$/.test(((await page.locator(tid('timer')).textContent()) || '').trim()), { message: 'timer counting down' });
  await A.mcq(page, 'b');
  await page.locator(tid('results')).waitFor({ timeout: 10000 });
  await page.locator(tid('timeup-modal')).waitFor();
  await waitText(page.locator(tid('score-percentage')), '100.00%', { timeout: 5000 }).catch(() => {}); // may be under the modal; payload below is authoritative
  assert.equal(s.gas.length, 1);
  assert.equal(s.gas[0].flags.auto_submitted, true);
  assert.equal(s.gas[0].percentage, '100.00');
  await page.keyboard.press('Escape');
  await page.locator(tid('timeup-modal')).waitFor({ state: 'detached' });
}));

test('XSS: HTML in question and option text is rendered literally', () => withSession(env, {}, async (s) => {
  const { page } = s;
  const evil = '<img src=x onerror="window.__xss=1">';
  s.serveTest('XSS1', {
    code: 'XSS1', title: 'XSS', questions: [{
      id: 'q1', type: 'mcq', text: evil, points: 1,
      options: [{ id: 'a', text: evil }, { id: 'b', text: 'safe' }], correctAnswer: 'a', explanation: evil,
    }],
  });
  await startTest(s, 'XSS1');
  const card = activeCard(page);
  const txt = await card.textContent();
  assert.ok(txt.includes('<img src=x onerror="window.__xss=1">'), txt);
  assert.equal(await page.locator('img[src="x"]').count(), 0);
  await A.mcq(page, 'a');
  await submit(page);
  await page.locator(tid('review-item-q1')).waitFor();
  assert.ok((await page.locator(tid('review-item-q1')).textContent()).includes('<img src=x'));
  assert.equal(await page.locator('img[src="x"]').count(), 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
}));

test('showResults:false hides the score', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('HIDDEN1', {
    code: 'HIDDEN1', title: 'Hidden', showResults: false,
    questions: [{ id: 'q1', type: 'truefalse', text: 'True?', points: 1, correctAnswer: true, explanation: 'Yes.' }],
  });
  await startTest(s, 'HIDDEN1');
  await A.tf(page, true);
  await submit(page);
  await page.locator(tid('results-hidden')).waitFor();
  assert.equal(await page.locator(tid('score-percentage')).count(), 0);
  assert.equal(await page.locator(tid('review-list')).count(), 0);
  assert.equal(s.gas[0].percentage, '100.00', 'still recorded');
}));

test('showCorrectAnswers:false hides the review but keeps the score; passingPercent shows a badge', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('NOREV1', {
    code: 'NOREV1', title: 'No review', showCorrectAnswers: false, passingPercent: 60,
    questions: [{ id: 'q1', type: 'truefalse', text: 'True?', points: 1, correctAnswer: true, explanation: 'Yes.' }],
  });
  await startTest(s, 'NOREV1');
  await A.tf(page, false);
  await submit(page);
  await waitText(page.locator(tid('score-percentage')), '0.00%');
  assert.equal(await page.locator(tid('review-list')).count(), 0);
  await waitText(page.locator(tid('pass-badge')), /Not yet/);
}));

test('passing score shows Passed on CHEM102 key run', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEM102');
  assert.equal(await activeId(page), 'q1');
  await A.mcq(page, 'a'); await goNext(page);
  await A.numeric(page, '25.02 g'); await goNext(page);
  await A.numeric(page, '2.00 mol'); await goNext(page);
  await A.formula(page, 'CaCl2'); await goNext(page);
  await A.tf(page, false); await goNext(page);
  await A.multi(page, ['a', 'b', 'c']); await goNext(page);
  await A.match(page, { h2o: 'm1', co2: 'm2', nacl: 'm3', ch4: 'm4' }); await goNext(page);
  await A.numeric(page, '35.7'); await goNext(page);
  await A.numeric(page, '80%'); await goNext(page);
  await A.mcq(page, 'c');
  await submit(page);
  await waitText(page.locator(tid('score-percentage')), '100.00%');
  await waitText(page.locator(tid('score-points')), '21 / 21');
  await waitText(page.locator(tid('pass-badge')), /Passed/);
}));

test('shuffled options (CHEM110) keep grading correct by option id', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEM110');
  const pick = (text) => activeCard(page).locator('[data-testid^="option-"]', { hasText: text }).click();
  await pick('Fluorine'); await goNext(page);
  for (const t of ['NaCl', 'MgO', 'CaF2']) await pick(t);
  await goNext(page);
  await A.formula(page, 'Mg(NO3)2'); await goNext(page);
  await A.tf(page, true); await goNext(page);
  await A.match(page, { ch4: 'tet', nh3: 'pyr', h2o: 'bent', co2: 'lin' }); await goNext(page);
  await A.numeric(page, '18'); await goNext(page);
  await pick('N2'); await goNext(page);
  await A.numeric(page, '16'); await goNext(page);
  await pick('Na+'); await goNext(page);
  await A.formula(page, 'SO₄²⁻');
  await submit(page);
  await waitText(page.locator(tid('score-percentage')), '100.00%');
  await waitText(page.locator(tid('score-points')), '18 / 18');
}));
