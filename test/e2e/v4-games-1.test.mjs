import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, tid, waitText, adhocTest, signIn } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const mcqs = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({
  id: `q${i + 1}`, type: 'mcq', text: `Pick A (${i + 1})`, points: 1, explanation: 'A is right.',
  options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }, { id: 'd', text: 'D' }], correctAnswer: 'a', ...extra,
}));
const gameTest = (code, overrides = {}) => adhocTest(code, { gameMode: true, questions: mcqs(6), ...overrides });

async function openGame(s, code, gameId) {
  const { page } = s;
  await page.goto(s.url + '/');
  await signIn(page);
  await page.locator(tid('code-input')).fill(code);
  await page.locator(tid('code-submit')).click();
  await page.locator(tid('mode-game')).click();
  await page.locator(tid(`game-pick-${gameId}`)).click();
}

/** Keyboard only: focus the option tile and press Enter. */
async function pick(page, id) {
  await page.locator(tid('game-question')).waitFor();
  await page.waitForTimeout(150); // the board moves focus to the question shortly after it renders
  await page.locator(tid(`game-option-${id}`)).focus();
  await page.keyboard.press('Enter');
  await page.locator(tid('game-feedback')).waitFor();
}
const nextByKey = async (page) => { await page.locator(`${tid('game-next')}:focus`).waitFor(); await page.keyboard.press('Enter'); };

test('options: question count, power-ups, relaxed mode and no clock are respected by Classic', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('GO1', gameTest('GO1', { gameOptions: { questions: 3, powerUps: { fifty: false, freeze: false, hint: false }, untimed: true } }));
  await openGame(s, 'GO1', 'classic');
  await page.locator(tid('game-relaxed-note')).waitFor(); // forced relaxed: no toggle
  assert.equal(await page.locator(tid('game-relaxed-toggle')).count(), 0);
  await page.locator(tid('game-start')).click();
  await waitText(page.locator(tid('game-progress')), 'Question 1 of 3');
  assert.equal(await page.locator(tid('game-time')).count(), 0, 'no countdown in relaxed mode');
  assert.equal(await page.locator(tid('game-fifty')).count(), 0);
  assert.equal(await page.locator(tid('game-freeze')).count(), 0);
  await page.locator(tid('game-power-skip')).waitFor();
  await pick(page, 'a');
  assert.match(await page.locator(tid('game-points')).textContent(), /^\+750 points/); // flat, no speed points
  await page.locator(tid('game-next')).click();
  await page.locator(tid('game-power-skip')).click(); // skip: straight to question 3, once only
  await waitText(page.locator(tid('game-progress')), 'Question 3 of 3');
  assert.equal(await page.locator(tid('game-power-skip')).count(), 0);
  await pick(page, 'b');
  await page.locator(tid('game-next')).click();
  await page.locator(tid('game-end')).waitFor();
  await waitText(page.locator(tid('game-correct')), '1 / 3');
  assert.equal(s.gas.length, 0);
  assert.equal(s.netlify.length, 0);
}));

test('options: students may switch relaxed mode on when allowed; game options can hide games', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('GO2', gameTest('GO2', { gameOptions: { games: ['classic', 'tower'], sound: false } }));
  await page.goto(s.url + '/');
  await signIn(page);
  await page.locator(tid('code-input')).fill('GO2');
  await page.locator(tid('code-submit')).click();
  await page.locator(tid('mode-game')).click();
  assert.equal(await page.locator('[data-testid^="game-pick-"]:not([data-testid^="game-pick-status"])').count(), 2);
  await page.locator(tid('game-pick-classic')).click();
  await page.locator(tid('game-relaxed-toggle')).check();
  await page.locator(tid('game-start')).click();
  assert.equal(await page.locator(tid('game-time')).count(), 0);
  assert.equal(await page.locator(tid('game-sound')).count(), 0, 'sound not allowed by the teacher');
}));

test('Tower: playable by keyboard, three wobbles topple it, height is the score', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('TW1', gameTest('TW1'));
  await openGame(s, 'TW1', 'tower');
  await page.locator(tid('game-start')).click();
  for (const id of ['a', 'a']) { await pick(page, id); await nextByKey(page); }
  assert.equal(await page.locator(tid('tower-stack')).getAttribute('data-height'), '2');
  await pick(page, 'b');
  assert.equal(await page.locator(tid('tower-stack')).getAttribute('data-wobbles'), '1');
  await nextByKey(page);
  await pick(page, 'b'); await nextByKey(page);
  await pick(page, 'b');
  assert.equal(await page.locator(tid('tower-stack')).getAttribute('data-fell'), 'true');
  await nextByKey(page);
  await page.locator(tid('game-end')).waitFor();
  await waitText(page.locator(tid('tower-height')), '2');
  await waitText(page.locator(tid('game-final-score')), '200');
  assert.equal(s.gas.length, 0);
  assert.equal(s.netlify.length, 0);
}));

test('Boss Battle: health drops, a wrong answer costs a life, the boss can be beaten by keyboard', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('BB1', gameTest('BB1', { questions: mcqs(8, { points: 2 }) }));
  await openGame(s, 'BB1', 'boss');
  await page.locator(tid('game-start')).click();
  const hp = async () => Number(await page.locator(tid('boss-panel')).getAttribute('data-health'));
  const max = Number(await page.locator(tid('boss-panel')).getAttribute('data-max'));
  assert.equal(max, Math.round(8 * 20 * 0.7)); // 112
  await pick(page, 'b'); // wrong: boss hits back
  assert.equal(await hp(), max);
  await waitText(page.locator(tid('game-points')), '0 points. Captain Corrode hits back: 2 lives left.');
  await nextByKey(page);
  await pick(page, 'a');
  const afterHit = await hp();
  assert.ok(afterHit < max, 'a right answer damages the boss');
  await nextByKey(page);
  for (let n = 0; n < 6 && (await page.locator(tid('game-end')).count()) === 0; n++) {
    await pick(page, 'a');
    await nextByKey(page);
  }
  await page.locator(tid('game-end')).waitFor();
  await waitText(page.locator(tid('boss-result')), 'Defeated');
  assert.ok(Number((await page.locator(tid('game-final-score')).textContent()).replace(/,/g, '')) >= 500);
  assert.equal(s.gas.length, 0);
}));

test('Mistake Review: unavailable until a mistake exists, then replays it until right twice', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('MR1', gameTest('MR1', { questions: mcqs(3), gameOptions: { games: ['tower', 'mistakes'] } }));
  await page.goto(s.url + '/');
  await signIn(page);
  await page.locator(tid('code-input')).fill('MR1');
  await page.locator(tid('code-submit')).click();
  await page.locator(tid('mode-game')).click();
  assert.equal(await page.locator(tid('game-pick-mistakes')).isDisabled(), true);
  await page.locator(tid('game-pick-tower')).click();
  await page.locator(tid('game-start')).click();
  await pick(page, 'b'); await nextByKey(page); // one mistake recorded
  await pick(page, 'a'); await nextByKey(page);
  await pick(page, 'a'); await nextByKey(page);
  await page.locator(tid('game-end')).waitFor();
  await page.locator(tid('game-back')).click();
  assert.equal(await page.locator(tid('game-pick-mistakes')).isDisabled(), false);
  await page.locator(tid('game-pick-mistakes')).click();
  await page.locator(tid('game-start')).click();
  await pick(page, 'b'); await nextByKey(page); // wrong: comes back
  await pick(page, 'a'); await nextByKey(page); // right once
  await pick(page, 'a'); // right twice: cleared
  await page.locator(tid('game-next')).click();
  await page.locator(tid('game-end')).waitFor();
  await waitText(page.locator(tid('mistakes-cleared')), '1 / 1');
  assert.equal(await page.locator(tid('game-final-score')).count(), 0, 'not scored');
  await page.locator(tid('game-back')).click();
  assert.equal(await page.locator(tid('game-pick-mistakes')).isDisabled(), true);
}));

const FACTOR = { mL: 1e-3, L: 1, g: 1, kg: 1e3, mg: 1e-3, cm: 1e-2, m: 1, km: 1e3, mm: 1e-3, nm: 1e-9, kJ: 1e3, J: 1, mol: 1, mmol: 1e-3 };

test('Unit Dash runs without any test questions and scores a right conversion', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('UD1', adhocTest('UD1', { gameMode: true, questions: [{ id: 'o1', type: 'open', text: 'Explain.', points: 2 }] }));
  await openGame(s, 'UD1', 'unitdash');
  await page.locator(tid('dash-no-questions')).waitFor();
  await page.locator(tid('game-start')).click();
  await page.locator(tid('game-time')).waitFor(); // timed by default
  const prompt = await page.locator(`${tid('dash-question')} p`).textContent();
  const m = prompt.match(/^Convert ([\d.e+-]+) (\S+) to (\S+)\.$/);
  assert.ok(m, prompt); // the first question is always a plain conversion
  const answer = Number((Number(m[1]) * FACTOR[m[2]] / FACTOR[m[3]]).toPrecision(10));
  await page.locator(tid('dash-input')).fill(String(answer));
  await page.keyboard.press('Enter');
  await waitText(page.locator(tid('game-score')), '100');
  assert.equal(s.gas.length, 0);
  assert.equal(s.netlify.length, 0);
}));
