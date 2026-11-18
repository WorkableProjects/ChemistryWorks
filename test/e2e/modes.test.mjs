// All 12 modes (Study + 11 games): play one auto-graded and one teacher-graded question in each, then check that
// answers survive switching mode. The modes share one attempt, so an answer given anywhere shows up everywhere.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, startTest, tid, poll, waitText, activeId, activeCard, goNext, goPrev, STUDENT } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const CODE = 'MODES12';
const opts = (a, b) => [{ id: 'a', text: a }, { id: 'b', text: b }];
// Five auto-graded multiple-choice questions with distinct answers (Match-Up needs unique pairs) and one teacher-graded one.
const KEY = { m1: 'b', m2: 'a', m3: 'b', m4: 'a', m5: 'b' };
const modesTest = () => ({
  code: CODE, title: 'Every mode', description: '', timeLimitMinutes: null, gameMode: true, showResults: true, showCorrectAnswers: true,
  questions: [
    { id: 'm1', type: 'mcq', text: 'Symbol for potassium', points: 1, options: opts('Na', 'K'), correctAnswer: 'b', explanation: 'K comes from kalium.' },
    { id: 'm2', type: 'mcq', text: 'Lightest element', points: 1, options: opts('Hydrogen', 'Helium'), correctAnswer: 'a', explanation: 'One proton.' },
    { id: 't1', type: 'short', text: 'Explain why ice floats on water.', points: 1, sampleAnswer: 'Ice is less dense than liquid water.' },
    { id: 'm3', type: 'mcq', text: 'Noble gas in balloons', points: 1, options: opts('Neon', 'Helium'), correctAnswer: 'b', explanation: 'Low density.' },
    { id: 'm4', type: 'mcq', text: 'Most abundant gas in air', points: 1, options: opts('Nitrogen', 'Oxygen'), correctAnswer: 'a', explanation: 'About 78 percent.' },
    { id: 'm5', type: 'mcq', text: 'Metal liquid at room temperature', points: 1, options: opts('Gallium', 'Mercury'), correctAnswer: 'b', explanation: 'Hg.' },
  ],
});

const GAMES = ['classic', 'lightning', 'survival', 'flashcards', 'mistakes', 'tower', 'boss', 'matchup', 'quizshow', 'race', 'bingo'];
// What each mode saves to the attempt when played with right answers.
//   auto: the auto-graded questions are answered   manual: the teacher-graded question is answered
const SAVES = {
  classic: { auto: true, manual: true }, lightning: { auto: true, manual: true }, survival: { auto: true, manual: true },
  tower: { auto: true, manual: true }, boss: { auto: 'until-defeated', manual: true }, race: { auto: true, manual: true },
  // boss: the boss falls before the last auto-graded question, so only most answers are saved
  quizshow: { auto: true, manual: true }, bingo: { auto: true, manual: true },
  flashcards: { auto: false, manual: true }, // the key is on the card back; only a teacher-graded card takes an answer
  matchup: { auto: true, manual: false }, // pairs are made from auto-graded questions only
};
/** Walk the runner to a question with Next / Previous. */
async function gotoQuestion(page, id) {
  const ids = modesTest().questions.map((q) => q.id);
  for (let guard = 0; guard < ids.length; guard++) {
    const here = await activeId(page);
    if (here === id) return;
    if (ids.indexOf(here) < ids.indexOf(id)) await goNext(page); else await goPrev(page);
  }
}
const SHORT = 'Ice is less dense than liquid water.';

async function open(s, modeId) {
  s.serveTest(CODE, modesTest());
  await startTest(s, CODE);
  if (modeId !== 'study') await switchTo(s.page, modeId);
}

async function switchTo(page, modeId) {
  await page.locator(tid(`mode-option-${modeId}`)).click();
  if (modeId === 'study') await page.locator(tid('runner')).waitFor();
  else await page.locator(`${tid('mode-shell')}[data-mode="${modeId}"]`).waitFor();
}

const saved = (page) => page.evaluate(([email, code]) => {
  const raw = localStorage.getItem(`cw:progress:${email}:${code}`);
  return raw ? JSON.parse(raw) : null;
}, [STUDENT.email, CODE]);

/** Wait for the first of the known screens a mode can be showing. */
async function phase(page) {
  const handle = await page.waitForFunction(() => {
    for (const id of ['mode-end', 'mode-feedback', 'mode-question', 'mode-intro', 'quizshow-board', 'bingo-card', 'matchup']) {
      if (document.querySelector(`[data-testid="${id}"]`)) return id;
    }
    return null;
  });
  return handle.jsonValue();
}

/** Answer the question that is on screen (a mode widget) the right way. */
async function answerWidget(page, root) {
  const widget = root.locator(tid('mode-widget'));
  const type = await widget.getAttribute('data-type');
  const qid = await root.getAttribute('data-question-id');
  if (type === 'short') await widget.locator(tid('short-input')).fill(SHORT);
  else await widget.locator(tid(`option-${KEY[qid]}`)).click();
  return type;
}

/** Play a mode to its end screen, answering every question right. */
async function play(page, modeId) {
  for (let guard = 0; guard < 60; guard++) {
    const p = await phase(page);
    if (p === 'mode-end') return;
    if (p === 'mode-intro') await page.locator(tid('mode-start')).click();
    else if (p === 'mode-feedback') await page.locator(tid('mode-next')).click();
    else if (p === 'quizshow-board') await page.locator(`${tid('quizshow-tile')}:not([disabled])`).first().click();
    else if (p === 'bingo-card') await page.locator(`${tid('bingo-cell')}:not([disabled])`).first().click();
    else if (p === 'matchup') {
      const prompt = page.locator(`${tid('matchup-prompt')}:not([disabled])`).first();
      const pair = await prompt.getAttribute('data-pair-id');
      await prompt.click();
      await page.locator(`${tid('matchup-answer')}[data-pair-id="${pair}"]`).click();
    } else if (modeId === 'flashcards') {
      const card = page.locator(tid('mode-question'));
      await page.locator(tid('flash-flip')).click();
      if (await card.locator(tid('mode-widget')).count()) await answerWidget(page, card);
      await page.locator(tid('flash-knew')).click();
    } else {
      const card = page.locator(tid('mode-question'));
      await answerWidget(page, card);
      await page.locator(tid('mode-check')).click();
    }
  }
  throw new Error(`${modeId} did not reach its end screen`);
}

test('Study: answer a graded and a teacher-graded question in the runner', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await open(s, 'study');
  await waitText(page.locator(tid('progress-text')), '0 of 6 answered');
  await gotoQuestion(page, 'm1');
  await activeCard(page).locator(tid('option-b')).click();
  await gotoQuestion(page, 't1');
  await activeCard(page).locator(tid('short-input')).fill(SHORT);
  await waitText(page.locator(tid('progress-text')), '2 of 6 answered');
}));

for (const modeId of GAMES) {
  test(`${modeId}: plays to the end screen and saves answers to the attempt`, () => withSession(env, {}, async (s) => {
    const { page } = s;
    await open(s, modeId === 'mistakes' ? 'study' : modeId);
    if (modeId === 'mistakes') {
      // Mistake review replays the questions that were answered wrong, so give it one.
      await gotoQuestion(page, 'm2');
      await activeCard(page).locator(tid('option-b')).click(); // wrong: the key is a
      await poll(async () => (await saved(page))?.answers?.m2 === 'b', { message: 'wrong answer saved' });
      await switchTo(page, 'mistakes');
      await play(page, modeId);
      await page.locator(tid('mode-end')).waitFor();
      const after = await saved(page);
      assert.equal(after.answers.m2, 'a', 'the fixed answer replaces the wrong one');
      return;
    }
    await play(page, modeId);
    await page.locator(tid('mode-end')).waitFor();
    await waitText(page.locator(`${tid('mode-end')} h1`), /finished$/);
    const { auto, manual } = SAVES[modeId];
    const answers = (await saved(page)).answers;
    if (auto === 'until-defeated') assert.ok(Object.keys(KEY).filter((id) => answers[id] === KEY[id]).length >= 4, `${modeId}: most auto-graded answers saved`);
    for (const [id, right] of Object.entries(KEY)) {
      if (auto === 'until-defeated') { if (answers[id] !== undefined) assert.equal(answers[id], right, `${modeId}: ${id} right`); }
      else if (auto) assert.equal(answers[id], right, `${modeId}: ${id} saved`);
      else assert.equal(answers[id], undefined, `${modeId}: ${id} untouched`);
    }
    if (manual) assert.equal(answers.t1, SHORT, `${modeId}: teacher-graded answer saved`);
    else assert.equal(answers.t1, undefined);
  }));
}

test('an answer given in Classic shows as answered in Study', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await open(s, 'classic');
  await page.locator(tid('mode-start')).click();
  const card = page.locator(tid('mode-question'));
  assert.equal(await card.getAttribute('data-question-id'), 'm1');
  await answerWidget(page, card);
  await page.locator(tid('mode-check')).click();
  await page.locator(tid('mode-feedback')).waitFor();
  await switchTo(page, 'study');
  await waitText(page.locator(tid('progress-text')), '1 of 6 answered');
  await gotoQuestion(page, 'm1');
  assert.equal(await activeCard(page).locator(tid('option-b')).getAttribute('aria-checked'), 'true');
}));

test('switching mode keeps answers in both directions', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await open(s, 'study');
  await gotoQuestion(page, 'm3');
  await activeCard(page).locator(tid('option-b')).click();
  await gotoQuestion(page, 't1');
  await activeCard(page).locator(tid('short-input')).fill(SHORT);
  await waitText(page.locator(tid('progress-text')), '2 of 6 answered');

  await switchTo(page, 'survival'); // Study -> game: m3 and t1 stay answered
  await page.locator(tid('mode-start')).click();
  await phase(page);
  assert.deepEqual(Object.keys((await saved(page)).answers).sort(), ['m3', 't1']);

  await switchTo(page, 'flashcards'); // game -> game
  await switchTo(page, 'study'); // game -> Study
  await waitText(page.locator(tid('progress-text')), '2 of 6 answered');
  await gotoQuestion(page, 't1');
  assert.equal(await activeCard(page).locator(tid('short-input')).inputValue(), SHORT);
  await gotoQuestion(page, 'm3');
  assert.equal(await activeCard(page).locator(tid('option-b')).getAttribute('aria-checked'), 'true');
}));
