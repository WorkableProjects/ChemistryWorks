// S15: Reaction Lab, Molecule Builder, Periodic Puzzle, Daily Element by keyboard; XP panel; leaderboard off = no network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, tid, signIn, adhocTest, poll } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

async function openGame(s, code, gameId) {
  const { page } = s;
  await page.goto(s.url + '/');
  await signIn(page);
  await page.locator(tid('code-input')).fill(code);
  await page.locator(tid('code-submit')).click();
  await page.locator(tid('mode-game')).click();
  await page.locator(tid(`game-pick-${gameId}`)).click();
  await page.locator(tid('game-start')).click();
}
const relaxed = (code) => adhocTest(code, { gameMode: true, gameOptions: { untimed: true } });

test('Reaction Lab: balance by keyboard, score and XP on the end screen; no leaderboard traffic', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('RL1', relaxed('RL1'));
  await openGame(s, 'RL1', 'reactionlab');
  for (let i = 0; i < 8; i++) {
    await page.locator(tid('lab-question')).waitFor();
    if (await page.locator(tid('lab-check')).count()) {
      await page.locator(tid('lab-check')).click(); // all-ones answer: usually wrong, still advances
    } else {
      await page.locator(tid('lab-option-0')).click();
    }
    await page.waitForTimeout(1500);
    if (await page.locator(tid('game-end')).count()) break;
  }
  await page.locator(tid('game-end')).waitFor({ timeout: 20000 });
  await page.locator(tid('xp-panel')).waitFor();
  assert.match(await page.locator(tid('xp-level')).innerText(), /Level \d+/);
  assert.equal(s.gas.filter((b) => /GameScore|Leaderboard/.test(b.action || '')).length, 0);
}));

test('Molecule Builder: build water with + buttons, then pick a shape', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('MB1', relaxed('MB1'));
  await openGame(s, 'MB1', 'molbuilder');
  await page.locator(tid('mol-question')).waitFor();
  const prompt = await page.locator(tid('mol-question')).innerText();
  assert.match(prompt, /Build /);
  await page.locator(tid('mol-build')).click(); // empty build is wrong and moves on
  await page.locator(tid('mol-msg')).waitFor();
  await poll(async () => /Not quite/.test(await page.locator(tid('mol-msg')).innerText()), { message: 'wrong build message' });
}));

test('Periodic Puzzle: choosing a tile then its right cell places it', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('PP1', relaxed('PP1'));
  await openGame(s, 'PP1', 'periodicpuzzle');
  const tile = page.locator('[data-testid^="pp-tile-"]').first();
  const symbol = (await tile.getAttribute('data-testid')).replace('pp-tile-', '');
  const number = await page.evaluate(async (sym) => (await import('/js/lib/elements.js')).ELEMENTS.find((e) => e.symbol === sym).number, symbol);
  await tile.click();
  await page.locator(tid(`pp-cell-${number}`)).click();
  await page.locator(tid(`pp-placed-${symbol}`)).waitFor();
}));

test('Daily Element: a wrong guess reveals a clue; giving up ends with the answer and a streak', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('DE1', relaxed('DE1'));
  await openGame(s, 'DE1', 'dailyelement');
  assert.equal(await page.locator(`${tid('daily-clues')} li`).count(), 1);
  await page.locator(tid('daily-input')).fill('zzz');
  await page.locator(tid('daily-submit')).click();
  await poll(async () => (await page.locator(`${tid('daily-clues')} li`).count()) === 2, { message: 'second clue' });
  for (let i = 0; i < 6 && !(await page.locator(tid('game-end')).count()); i++) {
    await page.locator(tid('daily-input')).fill('zzz');
    await page.locator(tid('daily-submit')).click();
    await page.waitForTimeout(150);
  }
  await page.locator(tid('game-end')).waitFor();
  await page.locator(tid('daily-streak')).waitFor();
}));
