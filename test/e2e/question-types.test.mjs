// Browser tests for the ordering, fill-in-the-blank, Lewis structure and open-response types, the
// charge / exponent typing help, and the appearance menu (dark mode, accent per role).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startEnv, withSession, startTest, tid, poll, waitText, waitAttr, activeCard, goNext, submit, unlockAdmin, addQuestion,
} from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const NEWQ = {
  code: 'NEWQ',
  title: 'New question types',
  showResults: true,
  showCorrectAnswers: true,
  questions: [
    { id: 'q1', type: 'formula', text: 'Write the formula of the sulfate ion.', points: 1, correctAnswer: 'SO4^2-' },
    { id: 'q2', type: 'numeric', text: 'How many molecules are in 1 mol?', points: 1, correctAnswer: 6.022e23, tolerance: 1, toleranceType: 'percent' },
    {
      id: 'q3', type: 'fillblank', points: 2, text: 'Sodium forms the ion {{b1}} by electron {{b2}}.',
      blanks: [{ id: 'b1', answers: ['Na+'], kind: 'formula' }, { id: 'b2', answers: ['loss', 'losing'] }],
    },
    {
      id: 'q4', type: 'ordering', text: 'Lowest to highest electronegativity', points: 3, topLabel: 'Lowest', bottomLabel: 'Highest',
      items: [{ id: 'na', text: 'Na' }, { id: 'c', text: 'C' }, { id: 'f', text: 'F' }],
      correctAnswer: ['na', 'c', 'f'],
    },
    {
      id: 'q5', type: 'structure', text: 'Draw the Lewis structure of CO2.', points: 3, showElectronCount: true,
      atoms: [{ id: 'o1', symbol: 'O', x: 0, y: 0 }, { id: 'c', symbol: 'C', x: 1, y: 0 }, { id: 'o2', symbol: 'O', x: 2, y: 0 }],
      bonds: [['o1', 'c'], ['c', 'o2']],
      correctAnswer: { bonds: [2, 2], lonePairs: { o1: 2, c: 0, o2: 2 } },
    },
    {
      id: 'q6', type: 'open', text: 'Explain why CO2 is linear.', points: 4, minWords: 5,
      rubric: [{ text: 'Two bonding domains', points: 2 }, { text: 'No lone pairs on C', points: 2 }],
    },
  ],
};

async function clickTimes(locator, n) { for (let i = 0; i < n; i++) await locator.click(); }

test('new types: typing help, every widget, grading and review', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('NEWQ', NEWQ);
  await startTest(s, 'NEWQ');

  // q1 formula with a charge: help box + insert buttons
  const card1 = activeCard(page);
  await card1.locator(tid('charge-help')).waitFor();
  assert.match(await card1.locator(tid('charge-help')).textContent(), /How to type charges[\s\S]*SO4\^2-/);
  await card1.locator(tid('formula-input')).fill('SO4');
  await card1.locator(tid('insert-^')).click();
  await page.keyboard.type('2');
  await card1.locator(tid('insert-−')).click();
  assert.equal(await card1.locator(tid('formula-input')).inputValue(), 'SO4^2-');
  await waitText(card1.locator(tid('formula-preview')), 'SO42−');
  await goNext(page);

  // q2 numeric in scientific notation: exponent help
  await activeCard(page).locator(tid('exponent-help')).waitFor();
  await activeCard(page).locator(tid('numeric-input')).fill('6.02x10^23');
  await waitText(activeCard(page).locator(tid('numeric-preview')), /6\.02 × 10²³/);
  await goNext(page);

  // q3 fill in the blanks (inline inputs, formula blank gets charge help)
  const card3 = activeCard(page);
  await card3.locator(tid('charge-help')).waitFor();
  await card3.locator(tid('blank-b1')).fill('Na^+');
  await card3.locator(tid('blank-b2')).fill('Loss');
  await goNext(page);

  // q4 ordering: move items with the arrow buttons until the order is Na, C, F
  const card4 = activeCard(page);
  const order = async () => card4.locator('.q-order__item').evaluateAll((els) => els.map((e) => e.dataset.item));
  const target = ['na', 'c', 'f'];
  for (let i = 0; i < target.length; i++) {
    let cur = await order();
    while (cur.indexOf(target[i]) > i) {
      await card4.locator(tid(`ordering-up-${target[i]}`)).click();
      await poll(async () => (await order()).join() !== cur.join(), { message: 'item moved' });
      cur = await order();
    }
  }
  assert.deepEqual(await order(), target);
  await goNext(page);

  // q5 Lewis structure: double bonds (click twice) and two lone pairs on each O
  const card5 = activeCard(page);
  await waitText(card5.locator(tid('structure-count')), '0 of 16 valence electrons drawn');
  await clickTimes(card5.locator(tid('structure-bond-0')), 2);
  await clickTimes(card5.locator(tid('structure-bond-1')), 3);
  await card5.locator(tid('structure-bond-1')).click({ modifiers: ['Shift'] }); // back from triple to double
  await clickTimes(card5.locator(tid('structure-atom-o1')), 2);
  await card5.locator(tid('structure-atom-o2')).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await waitText(card5.locator(tid('structure-count')), '16 of 16 valence electrons drawn');
  assert.equal(await card5.locator('.st-bond.is-set').count(), 2);
  await goNext(page);

  // q6 open response with rubric shown
  const card6 = activeCard(page);
  await card6.locator(tid('open-rubric')).waitFor();
  await card6.locator(tid('open-input')).fill('Carbon has two double bonds and no lone pairs so it is linear.');
  await waitText(page.locator(tid('progress-text')), '6 of 6 answered');
  await submit(page);

  // 10 auto-graded points earned; the 4-point open response waits for the teacher.
  await waitText(page.locator(tid('score-points')), /^10 \/ 14/);
  for (const id of ['q1', 'q2', 'q3', 'q4', 'q5']) await waitAttr(page.locator(tid(`review-item-${id}`)), 'data-correct', 'true');
  await waitAttr(page.locator(tid('review-item-q6')), 'data-status', 'pending');
  assert.equal(await page.locator(`${tid('review-item-q5')} svg.st`).count(), 2, 'student + correct structure drawn');

  const res = s.gas[0].responses;
  assert.deepEqual(res.find((r) => r.questionId === 'q5').givenAnswer, { bonds: [2, 2], lonePairs: { o1: 2, c: 0, o2: 2 } });
  assert.deepEqual(res.find((r) => r.questionId === 'q4').givenAnswer, ['na', 'c', 'f']);
  assert.equal(res.find((r) => r.questionId === 'q6').rubric.length, 2);
  assert.equal(s.gas[0].needs_grading, true);
}));

test('typing help is hidden when the answer has no charge / exponent', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('PLAIN', {
    code: 'PLAIN', title: 'Plain',
    questions: [
      { id: 'q1', type: 'formula', text: 'Formula of water?', correctAnswer: 'H2O' },
      { id: 'q2', type: 'numeric', text: 'Molar mass of water?', correctAnswer: 18.02, tolerance: 0.1 },
      { id: 'q3', type: 'formula', text: 'Write water.', correctAnswer: 'H2O', formatHelp: 'always' },
    ],
  });
  await startTest(s, 'PLAIN');
  assert.equal(await activeCard(page).locator(tid('charge-help')).count(), 0);
  await goNext(page);
  assert.equal(await activeCard(page).locator(tid('exponent-help')).count(), 0);
  await goNext(page);
  await activeCard(page).locator(tid('charge-help')).waitFor();
}));

test('appearance: dark mode persists; student and admin have separate accents', () => withSession(env, {}, async (s) => {
  const { page, url } = s;
  await page.goto(url + '/');
  const html = page.locator('html');
  await waitAttr(html, 'data-accent', 'blue');
  await page.locator(tid('theme-toggle')).click();
  await page.locator(tid('theme-dark')).click();
  await waitAttr(html, 'data-theme', 'dark');
  await page.locator(tid('accent-teal')).click();
  await waitAttr(html, 'data-accent', 'teal');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(26, 23, 19)'); // Lab-notebook dark --bg #1A1713 (V2-09)

  await page.reload();
  await waitAttr(html, 'data-theme', 'dark');
  await waitAttr(html, 'data-accent', 'teal');

  await unlockAdmin(page, url);
  await waitAttr(html, 'data-accent', 'violet');
  await waitAttr(html, 'data-role', 'admin');
  await page.locator(tid('theme-toggle')).click();
  await page.locator(tid('theme-light')).click();
  await waitAttr(html, 'data-theme', 'light');
}));

test('admin: no Analytics tab; builder adds the new types and validates them', () => withSession(env, {}, async ({ page, url }) => {
  await unlockAdmin(page, url);
  assert.equal(await page.locator(tid('tab-analytics')).count(), 0);
  for (const id of ['library', 'builder', 'grading', 'settings']) await page.locator(tid(`tab-${id}`)).waitFor();
  await page.locator(tid('tab-builder')).click();
  await page.locator(tid('test-code')).fill('NEWB');
  await page.locator(tid('test-title')).fill('Builder new types');
  for (const t of ['ordering', 'fillblank', 'structure', 'open']) await addQuestion(page, t);
  await page.locator(tid('structure-preview')).locator('svg.st').first().waitFor();
  await waitText(page.locator(tid('structure-electrons')), /✓ Correct structure uses all 16 valence electrons/);
  await waitAttr(page.locator(tid('validation-errors')), 'data-count', '0');

  // Breaking the structure's electron count is caught.
  const editor = page.locator(`${tid('question-editor')}[data-index="2"]`);
  await editor.locator(tid('atom-lp-0')).selectOption('3');
  await waitText(page.locator(tid('structure-electrons')), /uses 18 electrons, but the atoms have 16/);
  await poll(async () => (await page.locator(tid('validation-errors')).getAttribute('data-count')) !== '0', { message: 'validation error' });
  await editor.locator(tid('atom-lp-0')).selectOption('2');
  await waitAttr(page.locator(tid('validation-errors')), 'data-count', '0');

  // Formula questions say when students will get charge help.
  await addQuestion(page, 'formula');
  const f = page.locator(`${tid('question-editor')}[data-index="4"]`);
  assert.equal(await f.locator(tid('format-help-note')).isHidden(), true);
  await f.locator(tid('formula-answers')).fill('NO3^-');
  await waitText(f.locator(tid('format-help-note')), /how to type charges/);
}));
