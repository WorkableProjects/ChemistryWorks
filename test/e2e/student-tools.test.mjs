import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, tid, waitText, adhocTest, signIn, startTest, submit, poll, activeCard } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const TOOLS = { calculator: true, constants: true, scratchpad: true, highlighter: true, readAloud: true };
const toolTest = (code, extra = {}) => adhocTest(code, {
  tools: TOOLS,
  questions: [
    { id: 'q1', type: 'mcq', text: 'Which is $\\ce{H2O}$? Water is H2O.', points: 1, options: [{ id: 'a', text: 'Water' }, { id: 'b', text: 'Salt NaCl' }], correctAnswer: 'a', explanation: 'x' },
    { id: 'q2', type: 'truefalse', text: 'Water is wet.', points: 1, correctAnswer: true, explanation: 'Yes.' },
  ],
  ...extra,
});
const openCalc = async (page) => {
  await page.locator(tid('ref-tab-tool-calc')).click();
  await page.locator(tid('calc-input')).waitFor();
};
const calc = async (page, expr) => {
  await page.locator(tid('calc-input')).fill(expr);
  await page.locator(tid('calc-equals')).click();
};

test('calculator and units/constants tabs', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('TL1', toolTest('TL1'));
  await startTest(s, 'TL1');
  await page.locator(tid('reference-pane')).waitFor();
  await openCalc(page);
  await calc(page, '2*(3+4)^2');
  await waitText(page.locator(tid('calc-result')), '98');
  await calc(page, '6.022e23 / 2');
  await waitText(page.locator(tid('calc-result')), '3.011e+23');
  await calc(page, 'log(1000) + ln(e)');
  await waitText(page.locator(tid('calc-result')), '4');
  await calc(page, '1/0');
  await waitText(page.locator(tid('calc-result')), /divide by zero/);
  // Keys, Enter key, memory, ans.
  await page.locator(tid('calc-clear')).click();
  for (const k of ['7', 'mul', '6']) await page.locator(tid(`calc-key-${k}`)).click();
  await page.locator(tid('calc-input')).press('Enter');
  await waitText(page.locator(tid('calc-result')), '42');
  assert.equal(await page.locator(tid('calc-input')).inputValue(), '7×6');
  await page.locator(tid('calc-mplus')).click();
  await page.locator(tid('calc-mem')).waitFor();
  await page.locator(tid('calc-clear')).click();
  await page.locator(tid('calc-mr')).click();
  assert.equal(await page.locator(tid('calc-input')).inputValue(), '42');
  // Typing in the calculator does not trigger runner shortcuts (G would flag the question).
  await page.locator(tid('calc-input')).fill('');
  await page.locator(tid('calc-input')).pressSequentially('g');
  assert.equal(await page.locator(tid('flag-btn')).first().getAttribute('aria-pressed'), 'false');
  // Constants tab + converter.
  await page.locator(tid('ref-tab-tool-constants')).click();
  await page.locator(tid('const-NA')).waitFor();
  await page.locator(tid('conv-category')).selectOption('volume');
  await page.locator(tid('conv-from')).selectOption('mL');
  await page.locator(tid('conv-to')).selectOption('L');
  await page.locator(tid('conv-value')).fill('250');
  await waitText(page.locator(tid('conv-result')), /0\.25 L/);
}));

test('scratchpad: saved with progress, never submitted', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('TL2', toolTest('TL2'));
  await startTest(s, 'TL2');
  await activeCard(page).locator(tid('scratch-toggle')).click();
  await activeCard(page).locator(tid('scratch-text')).fill('n = m / M');
  const canvas = activeCard(page).locator(tid('scratch-canvas'));
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 60, { steps: 4 });
  await page.mouse.up();
  await poll(async () => (await page.evaluate(() => localStorage.getItem('cw:progress:ada@example.org:TL2')) || '').includes('"strokes":[['), { message: 'stroke saved' });
  await page.reload();
  await page.locator(tid('runner')).waitFor();
  await activeCard(page).locator(tid('scratch-toggle')).click();
  assert.equal(await activeCard(page).locator(tid('scratch-text')).inputValue(), 'n = m / M');
  // Submit: nothing from the scratchpad is in the payload.
  await activeCard(page).locator(tid('option-a')).click();
  await page.locator(tid('next-btn')).click();
  await page.locator(tid('truefalse-true')).click().catch(() => {});
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('submit-modal')).waitFor();
  await page.locator(tid('confirm-submit')).click();
  await page.locator(tid('results')).waitFor();
  const sub = s.gas.find((b) => b.submission_id);
  assert.ok(sub);
  assert.ok(!JSON.stringify(sub).includes('n = m / M'));
  assert.ok(!JSON.stringify(sub).includes('strokes'));
}));

test('flag with a note goes into the payload', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('TL3', toolTest('TL3'));
  await startTest(s, 'TL3');
  assert.equal(await activeCard(page).locator(tid('flag-note-row')).isHidden(), true);
  await activeCard(page).locator(tid('flag-btn')).click();
  const note = activeCard(page).locator(tid('flag-note'));
  await note.waitFor();
  await note.fill('Is this H2O or D2O?');
  await note.press('Enter'); // must not jump to the next question
  assert.equal(await page.locator('[data-testid="question-card"].is-active').getAttribute('data-question-id'), 'q1');
  await activeCard(page).locator(tid('option-a')).click();
  await submit(page);
  const sub = s.gas.find((b) => b.submission_id);
  assert.deepEqual(sub.flags.questions, { q1: 'Is this H2O or D2O?' });
}));

test('strike-out and highlighter work from the keyboard-reachable toolbar', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('TL4', toolTest('TL4'));
  await startTest(s, 'TL4');
  const card = activeCard(page);
  await card.locator(tid('mark-strike-mode')).focus();
  await page.keyboard.press('Enter');
  assert.equal(await card.locator(tid('mark-strike-mode')).getAttribute('aria-pressed'), 'true');
  await card.locator(tid('option-b')).click();
  assert.match(await card.locator(tid('option-b')).getAttribute('class'), /is-struck/);
  assert.equal(await card.locator('.opt.is-selected, .opt[aria-checked="true"]').count(), 0, 'striking does not choose the option');
  await card.locator(tid('mark-strike-mode')).click();
  await card.locator(tid('option-b')).click(); // normal mode again: selects
  await card.locator(tid('option-b')).focus();
  await page.keyboard.press('x'); // un-strike
  assert.doesNotMatch(await card.locator(tid('option-b')).getAttribute('class'), /is-struck/);
  // Highlight a word of the question text.
  await page.evaluate(() => {
    const t = document.querySelector('.q-card.is-active .q-text');
    const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) if (n.textContent.includes('Water is')) break;
    const r = document.createRange(); r.setStart(n, n.textContent.indexOf('Water')); r.setEnd(n, n.textContent.indexOf('Water') + 5);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });
  await card.locator(tid('mark-highlight')).click();
  assert.equal(await card.locator('mark.tool-mark').count(), 1);
  await card.locator(tid('mark-clear-highlights')).click();
  assert.equal(await card.locator('mark.tool-mark').count(), 0);
}));

test('read aloud speaks formulas sensibly', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await page.context().addInitScript(() => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { window.__spoken.push(u.text); }, cancel() {} } });
  });
  s.serveTest('TL5', toolTest('TL5'));
  await startTest(s, 'TL5');
  await activeCard(page).locator(tid('read-aloud')).click();
  const spoken = await page.evaluate(() => window.__spoken);
  assert.equal(spoken.length, 1);
  assert.match(spoken[0], /H two O/);
  assert.match(spoken[0], /Option A\. Water\./);
  assert.match(spoken[0], /Option B\. Salt N A C L\./);
  assert.equal(await activeCard(page).locator(tid('read-aloud')).getAttribute('aria-pressed'), 'true');
}));

test('offline banner while taking a test; recovered when back online', () => withSession(env, {}, async (s) => {
  const { page, context } = s;
  s.serveTest('TL6', toolTest('TL6'));
  await startTest(s, 'TL6');
  assert.equal(await page.locator(tid('net-banner')).isHidden(), true);
  await context.setOffline(true);
  await page.locator(tid('net-banner')).waitFor({ state: 'visible' });
  await waitText(page.locator(tid('net-banner')), /offline/i);
  await context.setOffline(false);
  await page.locator(tid('net-banner')).waitFor({ state: 'hidden' });
}));

test('a submission waiting in the outbox shows a banner on the landing page', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.modes.gas = 'fail';
  s.serveTest('TL7', toolTest('TL7'));
  await startTest(s, 'TL7');
  await activeCard(page).locator(tid('option-a')).click();
  await submit(page);
  await poll(async () => !!(await page.evaluate(() => localStorage.getItem('cw:outbox'))), { message: 'queued' });
  await page.goto(s.url + '/');
  await page.locator(tid('home')).waitFor();
  await waitText(page.locator(tid('net-banner')), /waiting to be sent/);
  await page.locator(tid('net-send-now')).waitFor();
}));

test('text size and dyslexia spacing in the settings popover persist', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await page.goto(s.url + '/');
  await signIn(page);
  await page.locator(tid('theme-toggle')).click();
  await page.locator(tid('font-large')).click();
  await page.locator(tid('dyslexia-spacing')).check();
  const attrs = () => page.evaluate(() => [document.documentElement.dataset.cwFont || '', document.documentElement.dataset.cwSpacing || '']);
  assert.deepEqual(await attrs(), ['large', 'wide']);
  await page.reload();
  await poll(async () => (await attrs())[0] === 'large', { message: 'font restored' });
  assert.deepEqual(await attrs(), ['large', 'wide']);
  await page.locator(tid('theme-toggle')).click();
  await page.locator(tid('font-normal')).click();
  await page.locator(tid('dyslexia-spacing')).uncheck();
  assert.deepEqual(await attrs(), ['', '']);
}));

test('student home lists in-progress and submitted tests', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('TL8', toolTest('TL8'));
  await startTest(s, 'TL8');
  await activeCard(page).locator(tid('option-a')).click();
  await page.locator(tid('brand')).first().click(); // the logo goes home from the runner
  await page.locator(tid('in-progress-TL8')).waitFor();
  await page.locator(tid('open-TL8')).click();
  await page.locator(tid('runner')).waitFor();
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('confirm-submit')).click();
  await page.locator(tid('results')).waitFor();
  await page.goto(s.url + '/');
  await page.locator(tid('home')).waitFor();
  await page.locator(`${tid('results-list')} ${tid('result-waiting')}`).waitFor(); // demo sign-in: no server, so not released yet
  assert.equal(await page.locator(tid('in-progress-TL8')).count(), 0, 'a submitted test leaves In progress');
  assert.match(await page.locator(`${tid('results-list')} li`).first().textContent(), /TL8/);
}));

test('released feedback offers Review my mistakes for game-mode tests only', () => withSession(env, {}, async (s) => {
  const { page } = s;
  s.serveTest('TLA', toolTest('TLA', { gameMode: true }));
  s.serveTest('TLB', toolTest('TLB'));
  s.onGas = (b) => (b.action === 'getFeedback' ? { result: 'success', released: true, released_at: '2026-03-01T10:00:00Z', status: 'Graded', final_score: 1, score_total: 2, final_percentage: 50, grades: {}, comments: {} } : null);
  const sit = async (code) => {
    await page.goto(s.url + '/');
    if (await page.locator(tid('demo-name')).count()) await signIn(page);
    await page.locator(tid('home-code-input')).fill(code);
    await page.locator(tid('home-code-submit')).click();
    await page.locator(tid('runner')).waitFor();
    await activeCard(page).locator(tid('option-b')).click();
    await page.locator(tid('submit-btn')).click();
    await page.locator(tid('confirm-submit')).click();
    await page.locator(tid('results')).waitFor();
    const sub = [...s.gas].reverse().find((b) => b.submission_id && b.test_code === code);
    // A demo sign-in never reaches the server, so seed the cached server snapshot that marks the result released.
    await page.evaluate((x) => {
      const key = `cw:profile:${x.email}`;
      const rec = JSON.parse(localStorage.getItem(key) || '{}');
      rec.server = { profile: {}, attempts: [], assigned: [], hub: null, results: [...((rec.server && rec.server.results) || []),
        { testCode: x.sub.test_code, title: x.sub.test_title, submittedAt: x.sub.submitted_at, released: true, status: 'released', percentage: 50, scoreAchieved: 1, scoreTotal: 2 }] };
      localStorage.setItem(key, JSON.stringify(rec));
    }, { email: 'ada@example.org', sub });
    await page.goto(s.url + '/');
    await page.locator(tid('home')).waitFor();
    // Feedback needs a verified Google account; the backend is mocked, so the token only has to look current.
    await page.evaluate(async () => {
      const { getUser } = await import('/js/lib/auth.js');
      Object.assign(getUser(), { provider: 'google', idToken: 'test-token', idTokenExp: Math.floor(Date.now() / 1000) + 3600 });
    });
    await page.locator(`${tid('results-list')} li:has-text("${code}") [data-testid^="view-feedback-"]`).first().click();
    await page.locator(tid('feedback-released')).waitFor();
  };
  await sit('TLB');
  assert.equal(await page.locator(tid('review-mistakes')).count(), 0);
  await sit('TLA');
  await page.locator(tid('review-mistakes')).click();
  await poll(async () => (await page.evaluate(() => document.body.dataset.view)) === 'game', { message: 'game view' });
}));
