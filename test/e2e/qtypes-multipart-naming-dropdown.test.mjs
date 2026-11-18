// V4 S08: multipart, naming, dropdown + per-question extras (hint cost, confidence, explanation) on DEMOV4A.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startEnv, withSession, tid, startTest, activeCard, goNext, submit, waitText, noHorizontalScroll, unlockAdmin, addQuestion, poll } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const DEMO = JSON.parse(readFileSync(new URL('../../data/tests/DEMOV4A.json', import.meta.url), 'utf8'));
const opts = { config: { FEATURES: { v4Types: true } } };
const part = (page, id) => activeCard(page).locator(tid(`multipart-part-${id}`));

async function open(s) {
  s.serveTest('DEMOV4A', DEMO);
  await startTest(s, 'DEMOV4A');
}

test('every type answered correctly; hint costs a point; confidence is stored and shown', () => withSession(env, opts, async (s) => {
  const { page } = s;
  await open(s);
  // q1 multipart
  await part(page, 'a').locator(tid('option-b')).click();
  await part(page, 'b').locator(tid('numeric-input')).fill('2');
  await goNext(page);
  // q2 naming toName (+ confidence appears only after answering)
  assert.equal(await activeCard(page).locator(tid('confidence-row')).isVisible(), false);
  await activeCard(page).locator(tid('naming-input')).fill('Copper (II) Sulfate Pentahydrate');
  await activeCard(page).locator(tid('confidence-row')).waitFor({ state: 'visible' });
  await activeCard(page).locator(tid('confidence-2')).click();
  assert.equal(await activeCard(page).locator(tid('confidence-2')).getAttribute('aria-checked'), 'true');
  await goNext(page);
  // q3 naming toFormula with live preview
  await activeCard(page).locator(tid('naming-input')).fill('Fe2O3');
  assert.match(await activeCard(page).locator(tid('naming-preview')).innerHTML(), /<sub>2<\/sub>/);
  await goNext(page);
  // q4 dropdown: native selects labelled "Blank n of 3"
  const sel = (id) => activeCard(page).locator(tid(`dropdown-${id}`));
  assert.equal(await sel('b2').getAttribute('aria-label'), 'Blank 2 of 3');
  await sel('b1').selectOption('metal'); await sel('b2').selectOption('nonmetal'); await sel('b3').selectOption('ionic');
  await goNext(page);
  // q5 hint (-1 pt) + confidence
  const hintBtn = activeCard(page).locator(tid('hint-btn'));
  assert.equal((await hintBtn.textContent()).trim(), 'Show hint (−1 pt)');
  assert.equal(await activeCard(page).locator(tid('hint-text')).isVisible(), false);
  await hintBtn.click();
  await waitText(activeCard(page).locator(tid('hint-text')), /It orbits the nucleus/);
  assert.equal(await hintBtn.isVisible(), false);
  await activeCard(page).locator(tid('option-b')).click();
  await activeCard(page).locator(tid('confidence-3')).click();
  await submit(page);

  await waitText(page.locator(tid('score-points')), '11 / 12');
  assert.equal(await page.locator(tid('review-item-q1')).getAttribute('data-correct'), 'true');
  for (const q of ['q1', 'q2', 'q3', 'q4', 'q5']) assert.equal(await page.locator(tid(`review-item-${q}`)).getAttribute('data-correct'), 'true', q);
  const q5 = page.locator(tid('review-item-q5'));
  await waitText(q5.locator(tid('results-hint')), /Hint used \(−1 pt\)/);
  await waitText(q5.locator(tid('results-confidence')), /Certain/);
  assert.match(await q5.textContent(), /Electrons are negative/); // explanation
  assert.match(await page.locator(tid('review-item-q1')).textContent(), /Hydrogen gas is released/);
  assert.match(await page.locator(tid('review-item-q1')).textContent(), /\(a\) .*\(b\)/s);
  // payload carries hint + confidence on the response rows
  await s.page.waitForTimeout(200);
  const body = s.netlify[0] || s.gas.find((g) => g && g.responses_json) || {};
  const rows = JSON.parse(body.responses_json || (body.payload && body.payload.responses_json) || '[]');
  const r5 = rows.find((r) => r.questionId === 'q5');
  assert.equal(r5.confidence, 3);
  assert.equal(r5.hintUsed, true);
  assert.equal(rows.find((r) => r.questionId === 'q2').confidence, 2);
  assert.equal(rows.find((r) => r.questionId === 'q3').confidence, undefined);
  assert.ok(await noHorizontalScroll(page));
}));

test('wrong answers: partial credit on multipart and dropdown, certain-but-wrong nudge, hint restored after reload', () => withSession(env, opts, async (s) => {
  const { page } = s;
  await open(s);
  await part(page, 'a').locator(tid('option-a')).click(); // wrong
  await part(page, 'b').locator(tid('numeric-input')).fill('2'); // right (2 pts)
  await goNext(page);
  await activeCard(page).locator(tid('naming-input')).fill('copper sulfate');
  await goNext(page);
  await activeCard(page).locator(tid('naming-input')).fill('FeO');
  await goNext(page);
  const sel = (id) => activeCard(page).locator(tid(`dropdown-${id}`));
  await sel('b1').selectOption('metal'); await sel('b2').selectOption('metal'); await sel('b3').selectOption('ionic');
  await goNext(page);
  await activeCard(page).locator(tid('hint-btn')).click();
  // reload: the revealed hint and the answers persist
  await page.reload();
  await page.locator(tid('runner')).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="question-card"]').length > 0);
  assert.equal(await activeCard(page).first().getAttribute('data-question-id'), 'q5', 'resumes on the question that was open');
  await activeCard(page).locator(tid('hint-text')).waitFor({ state: 'visible' });
  await activeCard(page).locator(tid('option-c')).click(); // wrong
  await activeCard(page).locator(tid('confidence-3')).click();
  await submit(page);
  // q1: 2/3, q2 0, q3 0, q4 2/3*3 = 2, q5 wrong (0, hint cost never below 0) -> 4 / 12
  await waitText(page.locator(tid('score-points')), '4 / 12');
  assert.equal(await page.locator(tid('review-item-q1')).getAttribute('data-status'), 'partial');
  assert.equal(await page.locator(tid('review-item-q2')).getAttribute('data-status'), 'incorrect');
  assert.equal(await page.locator(tid('review-item-q4')).getAttribute('data-status'), 'partial');
  await waitText(page.locator(tid('review-item-q5')).locator(tid('results-confidence')), /Certain — worth a second look/);
}));

test('builder: Extras disclosure and the new types are editable', () => withSession(env, opts, async (s) => {
  const { page } = s;
  await unlockAdmin(page, s.url);
  await page.locator(tid('new-test')).click();
  await page.locator(tid('test-code')).waitFor();
  await addQuestion(page, 'naming');
  const ed = page.locator(tid('question-editor')).last();
  await ed.locator(tid('naming-direction')).waitFor();
  await ed.locator('summary', { hasText: 'Extras' }).click();
  await ed.locator(tid('q-confidence')).check({ force: true });
  await ed.locator(tid('q-hint-text')).fill('Think ions');
  await ed.locator(tid('q-hint-cost')).fill('0.5');
  assert.equal(await ed.locator(tid('q-confidence')).isChecked(), true);
  await addQuestion(page, 'multipart');
  const mp = page.locator(tid('question-editor')).last();
  await mp.locator(tid('multipart-editor-part-1')).waitFor();
  await mp.locator(tid('multipart-add')).click();
  await mp.locator(tid('multipart-editor-part-2')).waitFor();
  await poll(async () => (await mp.locator(tid('q-points')).inputValue()) === '3', { message: 'points = sum of parts' });
  await addQuestion(page, 'dropdown');
  await page.locator(tid('question-editor')).last().locator(tid('dropdown-correct-0-0')).waitFor();
  // the JSON view shows the extras on the naming question
  await page.locator(tid('builder-mode-json')).click();
  const json = await page.locator('textarea').last().inputValue();
  assert.match(json, /"confidence": true/);
  assert.match(json, /"cost": 0.5/);
}));
