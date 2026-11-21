// Browser tests for the v2 diagram widgets: orbital energy diagram, Lewis brackets / charges, and the
// sectioned results page (CHEMV2 sample test).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startEnv, withSession, startTest, tid, poll, waitText, waitAttr, activeCard, activeId, goNext, goPrev, submit,
} from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

// Canonical display order of CHEMV2: unsectioned first, then Part A, then Part B.
const ORDER = ['warm', 'orbN', 'orbFe', 'config', 'no3', 'co2'];
async function goTo(page, id) {
  for (let n = 0; n < 12 && (await activeId(page)) !== id; n++) {
    if (ORDER.indexOf(await activeId(page)) < ORDER.indexOf(id)) await goNext(page); else await goPrev(page);
  }
  assert.equal(await activeId(page), id);
}

async function clickTimes(locator, n) { for (let i = 0; i < n; i++) await locator.click(); }
const box = (page, sub, i) => activeCard(page).locator(tid(`orbital-box-${sub}-${i}`));

async function assertOrbN(page) {
  const want = { '1s-0': 'ud', '2s-0': 'ud', '2p-0': 'u', '2p-1': 'u', '2p-2': 'u' };
  for (const [k, state] of Object.entries(want)) {
    const [sub, i] = k.split('-');
    await waitAttr(box(page, sub, i), 'data-state', state);
  }
  await waitText(activeCard(page).locator(tid('orbital-count')), '7 electrons placed');
}

test('orbital widget, Lewis charges, persistence and sectioned results', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await startTest(s, 'CHEMV2');

  /* ---- orbN: nitrogen */
  await goTo(page, 'orbN');
  // highest energy sublevel is at the top
  const subsOrder = await activeCard(page).locator('.orb-sub').allTextContents();
  assert.deepEqual(subsOrder, ['2p', '2s', '1s']);
  await waitAttr(box(page, '1s', 0), 'data-state', 'empty');
  await waitText(activeCard(page).locator(tid('orbital-count')), '0 electrons placed');

  // 1s: click cycles '' -> u -> ud
  await clickTimes(box(page, '1s', 0), 2);
  await waitAttr(box(page, '1s', 0), 'data-state', 'ud');
  // 2s by keyboard: ArrowUp then ArrowDown = paired
  await box(page, '2s', 0).focus();
  await page.keyboard.press('ArrowUp');
  await waitAttr(box(page, '2s', 0), 'data-state', 'u');
  await page.keyboard.press('ArrowDown');
  await waitAttr(box(page, '2s', 0), 'data-state', 'ud');
  // 2p: one up arrow in each box, moving with ArrowRight
  await box(page, '2p', 0).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await assertOrbN(page);
  // backwards + clear: shift-click goes back, Backspace empties
  await box(page, '2p', 2).click({ modifiers: ['Shift'] });
  await waitAttr(box(page, '2p', 2), 'data-state', 'empty');
  await box(page, '2p', 2).click();
  await waitAttr(box(page, '2p', 2), 'data-state', 'u');
  await box(page, '2p', 1).focus();
  await page.keyboard.press('Backspace');
  await waitAttr(box(page, '2p', 1), 'data-state', 'empty');
  await page.keyboard.press('ArrowUp');
  await assertOrbN(page);
  const label = await box(page, '2p', 0).getAttribute('aria-label');
  assert.match(label, /2p orbital 1: one electron, spin up/);

  /* ---- no3: Lewis structure with brackets and charges */
  await goTo(page, 'no3');
  const card = activeCard(page);
  await clickTimes(card.locator(tid('structure-bond-0')), 2);
  await clickTimes(card.locator(tid('structure-bond-1')), 1);
  await clickTimes(card.locator(tid('structure-bond-2')), 1);
  await clickTimes(card.locator(tid('structure-atom-o1')), 2);
  await clickTimes(card.locator(tid('structure-atom-o2')), 3);
  await clickTimes(card.locator(tid('structure-atom-o3')), 3);
  // the skeleton's -1 is not pre-drawn as brackets
  assert.equal(await card.locator('.st-bracket').count(), 0);
  await waitAttr(card.locator(tid('structure-bracket')), 'aria-pressed', 'false');
  await card.locator(tid('structure-bracket')).click();
  await waitAttr(card.locator(tid('structure-bracket')), 'aria-pressed', 'true');
  await card.locator(tid('structure-charge-down')).click();
  await waitText(card.locator(tid('structure-charge-value')), '1−');
  await card.locator(tid('structure-fc-n-up')).click();
  await waitText(card.locator(tid('structure-fc-n')), '1+');
  await card.locator(tid('structure-fc-o2-down')).click();
  await waitText(card.locator(tid('structure-fc-o2')), '1−');
  assert.match(await card.locator(tid('structure-fc-n')).getAttribute('aria-label'), /Formal charge on N: 1\+/);
  assert.equal(await card.locator('.st-bracket').count(), 2);
  assert.equal((await card.locator(tid('structure-charge-mark')).textContent()).trim(), '−');
  assert.equal(await card.locator('.st-fc').count(), 2);

  // wait for the autosave to hold everything, then reload
  const key = `cw:progress:ada@example.org:CHEMV2`;
  await poll(async () => {
    const raw = await page.evaluate((k) => localStorage.getItem(k), key);
    const a = raw && JSON.parse(raw).answers;
    return a && a.orbN && a.no3?.bracket === true && a.no3.charge === -1 && a.no3.formalCharges?.n === 1;
  }, { message: 'progress saved' });
  await page.reload();
  await page.locator(tid('runner')).waitFor();
  await goTo(page, 'no3');
  const card2 = activeCard(page);
  await waitAttr(card2.locator(tid('structure-bracket')), 'aria-pressed', 'true');
  await waitText(card2.locator(tid('structure-charge-value')), '1−');
  await waitText(card2.locator(tid('structure-fc-n')), '1+');
  await waitText(card2.locator(tid('structure-fc-o2')), '1−');
  assert.equal(await card2.locator('.st-bracket').count(), 2);
  await goTo(page, 'orbN');
  await assertOrbN(page);

  /* ---- co2: no studentCharges -> no bracket / charge controls */
  await goTo(page, 'co2');
  const co2 = activeCard(page);
  await co2.locator(tid('structure-bond-0')).waitFor();
  assert.equal(await co2.locator(tid('structure-bracket')).count(), 0);
  assert.equal(await co2.locator(tid('structure-charge-up')).count(), 0);
  assert.equal(await co2.locator('[data-testid^="structure-fc-"]').count(), 0);

  /* ---- submit and review */
  await submit(page);
  const headings = page.locator(tid('results-section'));
  assert.equal(await headings.count(), 2);
  const titles = await headings.allTextContents();
  assert.match(titles[0], /Part A: Electron configuration/);
  assert.match(titles[1], /Part B: Bonding/);

  const orbItem = page.locator(tid('review-item-orbN'));
  await orbItem.waitFor();
  assert.equal(await orbItem.getAttribute('data-status'), 'pending');
  const orbDiagram = orbItem.locator('.orb[role="img"]').first();
  assert.match(await orbDiagram.getAttribute('aria-label'), /^Your orbital diagram: .*7 electrons/);
  assert.equal(await orbItem.locator('.orb-box').count() >= 6, true);
  assert.match(await orbItem.textContent(), /Sample answer/);
  assert.match(await orbItem.textContent(), /Your teacher will grade this answer/);

  const noItem = page.locator(tid('review-item-no3'));
  assert.equal(await noItem.getAttribute('data-status'), 'pending');
  const mine = noItem.locator('svg.st').first();
  assert.equal(await mine.locator('.st-bracket').count(), 2);
  assert.equal((await mine.locator('.st-charge').textContent()).trim(), '−');
  assert.equal(await mine.locator('.st-fc').count(), 2);
  assert.match(await noItem.textContent(), /Reference answer/);
  assert.doesNotMatch(await noItem.textContent(), /Correct answer/);

  // orbFe was not answered: shows as unanswered, with the fixture's sample answer for comparison
  const fe = page.locator(tid('review-item-orbFe'));
  assert.match(await fe.textContent(), /Sample answer/); // the CHEMV2 fixture gives orbFe a sample answer
}));
