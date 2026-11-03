import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, startTest, tid, poll, waitText, adhocTest, signIn, landingReady } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const gameTest = (code, overrides = {}) => adhocTest(code, {
  gameMode: true,
  questions: [
    { id: 'q1', type: 'mcq', text: 'Pick B', points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }, { id: 'd', text: 'D' }], correctAnswer: 'b', explanation: 'B is right.' },
    { id: 'q2', type: 'truefalse', text: 'Water is wet.', points: 1, correctAnswer: true },
    { id: 'q3', type: 'numeric', text: 'What is 2 + 3?', points: 1, correctAnswer: 5 },
    { id: 'q4', type: 'multi', text: 'Pick A and C', points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], correctAnswer: ['a', 'c'] },
    { id: 'q5', type: 'formula', text: 'Formula of water', points: 1, correctAnswer: 'H2O' },
    { id: 'q6', type: 'open', text: 'Explain.', points: 2 },
  ],
  ...overrides,
});

const open = async (s, code) => {
  const { page } = s;
  await page.goto(s.url + '/');
  await signIn(page);
  await page.locator(tid('code-input')).fill(code);
  await page.locator(tid('code-submit')).click();
};

const currentId = async (page) => {
  await page.locator(tid('game-question')).waitFor();
  return page.locator(tid('game-question')).getAttribute('data-question-id');
};

/** Answer the current question correctly (or wrongly) and return its feedback correctness. */
async function answer(page, id, right = true) {
  switch (id) {
    case 'q1': await page.locator(tid(right ? 'game-option-b' : 'game-option-a')).click(); break;
    case 'q2': await page.locator(tid(right ? 'game-option-true' : 'game-option-false')).click(); break;
    case 'q3': await page.locator(tid('game-numeric-input')).fill(right ? '5' : '6'); await page.locator(tid('game-submit')).click(); break;
    case 'q4':
      for (const o of right ? ['a', 'c'] : ['b']) await page.locator(tid(`game-option-${o}`)).click();
      await page.locator(tid('game-submit')).click(); break;
    case 'q5': await page.locator(tid('game-formula-input')).fill(right ? 'H2O' : 'H2O2'); await page.locator(tid('game-submit')).click(); break;
    default: throw new Error(`unexpected question ${id}`);
  }
  await page.locator(tid('game-feedback')).waitFor();
}

test('gameMode test shows the chooser; Study mode opens the normal runner', () => withSession(env, {}, async (s) => {
  s.serveTest('GM1', gameTest('GM1'));
  await open(s, 'GM1');
  await s.page.locator(tid('mode-select')).waitFor();
  assert.match(await s.page.locator(tid('game-practice-note')).textContent(), /not submitted/);
  await s.page.locator(tid('mode-study')).click();
  await s.page.locator(tid('runner')).waitFor();
  assert.equal(await s.page.locator(tid('mode-select')).count(), 0);
}));

test('test without gameMode goes straight to the runner', () => withSession(env, {}, async (s) => {
  await startTest(s, 'CHEM101'); // waits for the runner
  assert.equal(await s.page.locator(tid('mode-select')).count(), 0);
  s.serveTest('GM0', gameTest('GM0', { gameMode: false }));
  await s.page.goto(s.url + '/?code=GM0');
  await s.page.locator(tid('runner')).waitFor();
  assert.equal(await s.page.locator(tid('mode-select')).count(), 0);
}));

test('game mode: play through, scores, end screen, no submission', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('GM2', gameTest('GM2'));
  await open(s, 'GM2');
  await page.locator(tid('mode-game')).click();
  await waitText(page.locator(tid('game-skipped')), '1 question skipped in game mode.');
  await page.locator(tid('game-start')).click();

  // Answer the first question wrongly, the rest correctly.
  let wrongPoints = null;
  const seen = [];
  for (let n = 0; n < 5; n++) {
    const id = await currentId(page);
    seen.push(id);
    await answer(page, id, n !== 0);
    const pts = (await page.locator(tid('game-points')).textContent()).trim();
    if (n === 0) {
      wrongPoints = pts;
      assert.equal(await page.locator(tid('game-feedback')).getAttribute('data-correct'), 'false');
    } else {
      assert.equal(await page.locator(tid('game-feedback')).getAttribute('data-correct'), 'true');
      assert.match(pts, /^\+[\d,]+ points/);
      assert.ok(Number(pts.match(/\+([\d,]+)/)[1].replace(/,/g, '')) >= 500);
    }
    await page.locator(tid('game-next')).click();
  }
  assert.equal(wrongPoints, '0 points');
  assert.deepEqual([...seen].sort(), ['q1', 'q2', 'q3', 'q4', 'q5']);

  await page.locator(tid('game-end')).waitFor();
  const score = Number((await page.locator(tid('game-final-score')).textContent()).replace(/,/g, ''));
  assert.ok(score > 0);
  await waitText(page.locator(tid('game-correct')), '4 / 5');
  await waitText(page.locator(tid('game-accuracy')), '80%');
  await waitText(page.locator(tid('game-best-streak')), '4');
  assert.equal(await page.locator('[data-testid="game-review"] li').count(), 5);
  assert.equal(await page.locator('[data-testid="game-review"] li[data-correct="true"]').count(), 4);

  // Personal best is saved locally; Play again reshuffles and restarts.
  const best = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cw:gamebest:')));
  assert.equal(best.length, 1);
  await page.locator(tid('game-again')).click();
  await page.locator(tid('game-question')).waitFor();
  await waitText(page.locator(tid('game-score')), '0');

  // Nothing was sent anywhere.
  assert.equal(s.gas.length, 0);
  assert.equal(s.netlify.length, 0);
}));

test('game mode: keyboard answers, power-ups and switching to Study mode', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('GM3', gameTest('GM3', { questions: gameTest('x').questions.slice(0, 1) }));
  await open(s, 'GM3');
  await page.locator(tid('mode-game')).click();
  await page.locator(tid('game-start')).click();
  await page.locator(tid('game-question')).waitFor();
  await page.locator(tid('game-fifty')).click();
  assert.equal(await page.locator('.game-tile.is-removed').count(), 2);
  assert.equal(await page.locator(tid('game-fifty')).count(), 0);
  await page.locator(tid('game-freeze')).click();
  assert.equal(await page.locator(tid('game-freeze')).count(), 0);
  // Tiles are shuffled, so find the tile for B and press its number.
  const idx = await page.evaluate(() => [...document.querySelectorAll('.game-tile')].findIndex((el) => el.dataset.opt === 'b'));
  await page.keyboard.press(String(idx + 1));
  await page.locator(tid('game-feedback')).waitFor();
  assert.equal(await page.locator(tid('game-feedback')).getAttribute('data-correct'), 'true');
  await page.locator(tid('game-next')).click();
  await page.locator(tid('game-end')).waitFor();
  await page.locator(tid('game-to-study')).click();
  await page.locator(tid('runner')).waitFor();
  assert.equal(s.gas.length, 0);
  assert.equal(s.netlify.length, 0);
}));

test('game mode: dark theme and narrow viewport render without horizontal scroll', () => withSession(env, { viewport: { width: 375, height: 800 } }, async (s) => {
  const { page } = s;
  s.serveTest('GM4', gameTest('GM4'));
  await page.addInitScript(() => localStorage.setItem('cw:theme', '"dark"'));
  await open(s, 'GM4');
  await page.locator(tid('mode-select')).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.locator(tid('mode-game')).click();
  await page.locator(tid('game-start')).click();
  await page.locator(tid('game-question')).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
}));
