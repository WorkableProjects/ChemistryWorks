import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  startTest, withSession, startEnv, tid, poll, waitText, waitAttr, A, activeCard, goNext, submit, noHorizontalScroll,
} from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const box = async (loc) => (await loc.boundingBox());

test('CHEMV2 shows the reference pane with tabs and a periodic table', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEMV2');
  const pane = page.locator(tid('reference-pane'));
  await pane.waitFor();
  assert.equal(await pane.getAttribute('data-collapsed'), 'false');
  await page.locator(tid('runner-split')).waitFor();
  assert.ok(await page.locator(tid('ref-tab-pt')).isVisible());
  assert.ok(await page.locator(tid('ref-tab-consts')).isVisible());
  assert.ok(await page.locator(tid('pt-Fe')).isVisible());
  assert.match(await page.locator(tid('pt-Fe')).getAttribute('aria-label'), /26 Fe, Iron, 55\.85/);
  // Side by side: the pane is to the right of the question card.
  const card = await box(activeCard(page).first());
  const p = await box(pane);
  assert.ok(p.x >= card.x + card.width - 1, 'pane is right of the questions');

  await page.locator(tid('pt-Fe')).click();
  await waitText(page.locator(tid('pt-detail')), /Iron \(Fe\).*26.*55\.85.*group 8.*period 4/);

  await page.locator(tid('ref-tab-consts')).click();
  await waitAttr(page.locator(tid('ref-tab-consts')), 'aria-selected', 'true');
  assert.ok(await page.locator(tid('ref-panel-consts')).isVisible());
  assert.ok(!(await page.locator(tid('pt-Fe')).isVisible()));
  assert.match(await page.locator(tid('ref-panel-consts')).textContent(), /Avogadro/);
  // Arrow keys move between tabs and do not navigate the questions.
  const before = await activeCard(page).first().getAttribute('data-question-id');
  await page.locator(tid('ref-tab-consts')).focus();
  await page.keyboard.press('ArrowLeft');
  await waitAttr(page.locator(tid('ref-tab-pt')), 'aria-selected', 'true');
  assert.equal(await activeCard(page).first().getAttribute('data-question-id'), before);
}));

test('answers and progress survive collapsing, resizing and switching tabs', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEMV2');
  // The first question of CHEMV2 is "warm" (unsectioned). Answer whichever widget it has.
  const card = activeCard(page).first();
  const id = await card.getAttribute('data-question-id');
  assert.equal(id, 'warm');
  const input = card.locator('input[type="text"], textarea, [data-testid^="option-"], [data-testid="tf-true"]').first();
  const tidAttr = await input.getAttribute('data-testid');
  if (tidAttr && (tidAttr.startsWith('option-') || tidAttr === 'tf-true')) await input.click();
  else await input.fill('hello');
  await waitText(page.locator(tid('progress-text')), /^1 of \d+ answered$/);
  const progress = (await page.locator(tid('progress-text')).textContent()).trim();
  const cardBefore = await card.elementHandle();

  // Collapse via the toggle.
  await page.locator(tid('ref-toggle')).click();
  await waitAttr(page.locator(tid('reference-pane')), 'data-collapsed', 'true');
  assert.equal(await page.locator(tid('ref-toggle')).getAttribute('aria-expanded'), 'false');
  assert.ok(await page.locator(tid('ref-toggle')).isVisible(), 'rail keeps the toggle');
  await poll(async () => (await box(page.locator(tid('reference-pane')))).width < 90, { message: 'collapsed rail is slim' });
  // R toggles it back.
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('r');
  await waitAttr(page.locator(tid('reference-pane')), 'data-collapsed', 'false');

  // Resize with the keyboard.
  const sep = page.locator(tid('ref-resizer'));
  await sep.focus();
  const w0 = Number(await sep.getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowLeft');
  await waitAttr(sep, 'aria-valuenow', String(w0 + 5));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await waitAttr(sep, 'aria-valuenow', String(w0 - 5));
  assert.equal(await sep.getAttribute('aria-valuemin'), '20');
  assert.equal(await sep.getAttribute('aria-valuemax'), '60');
  assert.equal(await page.locator(tid('runner-split')).evaluate((el) => el.style.getPropertyValue('--ref-w')), `${w0 - 5}%`);
  // Still on the same question (the arrow keys went to the separator, not the runner).
  assert.equal(await activeCard(page).first().getAttribute('data-question-id'), id);

  // Switching tabs.
  await page.locator(tid('ref-tab-consts')).click();
  await page.locator(tid('ref-tab-pt')).click();

  assert.equal((await page.locator(tid('progress-text')).textContent()).trim(), progress);
  assert.ok(await cardBefore.evaluate((el) => el.isConnected), 'question card was not re-mounted');
  assert.equal(await activeCard(page).first().getAttribute('data-question-id'), id);
  if (tidAttr && tidAttr.startsWith('option-')) assert.equal(await card.locator(`[data-testid="${tidAttr}"]`).getAttribute('aria-checked'), 'true');
  else if (tidAttr !== 'tf-true') assert.equal(await card.locator('input[type="text"], textarea').first().inputValue(), 'hello');

  // The pane state is remembered across a reload (collapse + width + tab).
  await page.locator(tid('ref-toggle')).click();
  await page.locator(tid('ref-tab-consts')).waitFor({ state: 'hidden' });
  await page.reload();
  await page.locator(tid('reference-pane')).waitFor();
  await waitAttr(page.locator(tid('reference-pane')), 'data-collapsed', 'true');
  await page.keyboard.press('r');
  await waitAttr(page.locator(tid('reference-pane')), 'data-collapsed', 'false');
  assert.equal(await page.locator(tid('ref-resizer')).getAttribute('aria-valuenow'), String(w0 - 5));
}));

test('pointer drag on the resizer changes the pane width', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEMV2');
  const sep = page.locator(tid('ref-resizer'));
  const w0 = Number(await sep.getAttribute('aria-valuenow'));
  const b = await box(sep);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 120, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  const w1 = Number(await sep.getAttribute('aria-valuenow'));
  assert.ok(w1 > w0, `dragging left widens the pane (${w0} -> ${w1})`);
  assert.ok(w1 <= 60 && w1 >= 20);
}));

test('section headers, pills and instructions', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEMV2');
  // Focus mode: a header appears on the first question of each section; the unsectioned first question has none.
  assert.equal(await page.locator(tid('section-header')).count(), 0);
  assert.equal(await activeCard(page).first().locator(tid('section-pill')).count(), 0);
  await goNext(page); // orbN, first of Part A
  const hA = activeCard(page).first().locator(tid('section-header'));
  await hA.waitFor();
  assert.equal(await hA.getAttribute('data-section-id'), 'secA');
  assert.match(await hA.textContent(), /Part A: Electron configuration/);
  assert.match(await hA.textContent(), /Use the periodic table in the reference pane\./);
  assert.match(await hA.textContent(), /pts/);
  assert.match(await activeCard(page).first().locator(tid('section-pill')).textContent(), /Part A/);
  await goNext(page); await goNext(page); // orbFe, config (no header)
  assert.equal(await activeCard(page).first().locator(tid('section-header')).count(), 0);
  assert.match(await activeCard(page).first().locator(tid('section-pill')).textContent(), /Part A/);
  await goNext(page); // no3, first of Part B
  const hB = activeCard(page).first().locator(tid('section-header'));
  await hB.waitFor();
  assert.equal(await hB.getAttribute('data-section-id'), 'secB');
  assert.match(await hB.textContent(), /Draw complete Lewis structures/);

  // Navigator groups tiles under the section titles and keeps the testids.
  await page.locator(tid('navigator-toggle')).click();
  await page.locator(tid('navigator')).waitFor();
  const groupTitles = await page.locator('.nav-group__title').allTextContents();
  assert.deepEqual(groupTitles.map((t) => t.trim()), ['General', 'Part A: Electron configuration', 'Part B: Bonding']);
  for (const q of ['warm', 'orbN', 'orbFe', 'config', 'no3', 'co2']) assert.equal(await page.locator(tid(`nav-item-${q}`)).count(), 1);
  assert.match(await page.locator(tid('nav-item-no3')).getAttribute('class'), /is-current/);
}));

test('scroll mode shows both section headers', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEMV2');
  await page.locator(tid('mode-toggle')).click();
  await poll(async () => (await page.locator(tid('section-header')).count()) === 2, { message: 'two section headers' });
  const ids = await page.locator(tid('section-header')).evaluateAll((els) => els.map((e) => e.dataset.sectionId));
  assert.deepEqual(ids, ['secA', 'secB']);
}));

test('shuffleQuestions shuffles inside a section only', () => withSession(env, {}, async (s) => {
  const { page } = s;
  const t = JSON.parse(readFileSync(new URL('../fixtures/tests/CHEMV2.json', import.meta.url), 'utf8'));
  s.serveTest('CHEMV2', { ...t, shuffleQuestions: true });
  await startTest(s, 'CHEMV2');
  await page.locator(tid('mode-toggle')).click();
  await poll(async () => (await page.locator(tid('question-card')).count()) === 6, { message: 'six cards' });
  const order = await page.locator(tid('question-card')).evaluateAll((els) => els.map((e) => e.dataset.questionId));
  assert.equal(order[0], 'warm');
  assert.deepEqual(order.slice(1, 4).sort(), ['config', 'orbFe', 'orbN']);
  assert.deepEqual(order.slice(4).sort(), ['co2', 'no3']);
}));

test('a test without references has no reference pane', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEM101');
  assert.equal(await page.locator(tid('reference-pane')).count(), 0);
  assert.equal(await page.locator(tid('runner-split')).count(), 0);
  assert.equal(await page.locator(tid('section-header')).count(), 0);
  // R does nothing special (no pane).
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('r');
  assert.equal(await page.locator(tid('reference-pane')).count(), 0);
}));

test('narrow viewport: pane stacks above the questions, collapsed, and the test can be submitted', () => withSession(env, { viewport: { width: 390, height: 800 } }, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEMV2');
  const pane = page.locator(tid('reference-pane'));
  await pane.waitFor();
  assert.equal(await pane.getAttribute('data-collapsed'), 'true');
  assert.ok(await page.locator(tid('ref-toggle')).isVisible());
  assert.ok(!(await page.locator(tid('pt-Fe')).isVisible()), 'body hidden while collapsed');
  assert.ok(!(await page.locator(tid('ref-resizer')).isVisible()), 'resizer hidden when stacked');
  const p = await box(pane);
  const c = await box(activeCard(page).first());
  assert.ok(p.y + p.height <= c.y + 1, 'pane is above the questions');
  assert.ok(await noHorizontalScroll(page), 'no horizontal page scroll');

  await page.locator(tid('ref-toggle')).click();
  await waitAttr(pane, 'data-collapsed', 'false');
  await page.locator(tid('pt-Fe')).waitFor();
  const open = await box(pane);
  assert.ok(open.width <= 390, 'pane fits the viewport');
  assert.ok(open.height <= 800 * 0.5 + 80, `open pane is capped (${open.height})`);
  assert.ok(await noHorizontalScroll(page), 'no horizontal page scroll with the pane open');
  await page.locator(tid('ref-toggle')).click();

  // Submit flow still works (all questions unanswered -> warning, then confirm).
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('submit-modal')).waitFor();
  await page.locator(tid('confirm-submit')).click();
  await page.locator(tid('results')).waitFor();
}));
