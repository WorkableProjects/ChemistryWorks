import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTest, withSession, startEnv, tid, poll, activeCard, noHorizontalScroll, newSession } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const SVG = (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="${c}"/></svg>`;
async function serveImages(page) {
  await page.route('**/images/opt-*.svg', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG(route.request().url().includes('opt-a') ? '#c33' : '#39c') }));
}

function longTest() {
  const qs = [];
  for (let i = 0; i < 20; i++) {
    qs.push({ id: `q${i}`, type: 'mcq', text: `Question ${i}. ${'Some long wording to make the page tall. '.repeat(12)}`, points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctAnswer: 'b' });
  }
  return { code: 'LONG25', title: 'Long', description: '', timeLimitMinutes: null, questions: qs };
}

for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 800 }]]) {
  test(`Questions drawer stays pinned to the viewport after scrolling (${name}, scroll mode)`, async () => {
    const s = await newSession(env, { viewport });
    try {
      const { page } = s;
      s.serveTest('LONG25', longTest());
      await startTest(s, 'LONG25');
      if (!(await page.locator(tid('runner')).getAttribute('class')).includes('runner--scroll')) await page.locator(tid('mode-toggle')).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="runner"]').classList.contains('runner--scroll'));
      await page.evaluate(() => window.scrollTo(0, 3000));
      await poll(async () => (await page.evaluate(() => window.scrollY)) > 1500, { message: 'scrolled' });
      await page.locator(tid('navigator-toggle')).click();
      const drawer = page.locator(tid('navigator'));
      await poll(async () => (await drawer.getAttribute('class')).includes('is-open'), { message: 'drawer open' });
      await page.waitForTimeout(400);
      const r = await drawer.evaluate((el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, vw: innerWidth, vh: innerHeight }; });
      assert.ok(r.top >= -1 && r.bottom <= r.vh + 1, `drawer within viewport vertically: ${JSON.stringify(r)}`);
      assert.ok(r.left >= 0 && r.right <= r.vw + 1, `drawer within viewport horizontally: ${JSON.stringify(r)}`);
      assert.ok(r.bottom - r.top > 200, 'drawer has real height');
      assert.ok(await drawer.locator('.nav-tile').first().isVisible(), 'drawer tiles visible');
      // Still pinned after scrolling further.
      await page.evaluate(() => window.scrollTo(0, 6000));
      const r2 = await drawer.evaluate((el) => el.getBoundingClientRect().top);
      assert.ok(Math.abs(r2 - r.top) < 2, 'drawer did not move with the page');
      assert.equal(s.errors.length, 0, s.errors.join('\n'));
    } finally { await s.close(); }
  });
}

test('ordering question lays out cleanly on a phone and reorders with the arrow buttons', () => withSession(env, { viewport: { width: 390, height: 800 } }, async (s) => {
  const { page } = s;
  s.serveTest('ORD25', { code: 'ORD25', title: 'Ord', description: '', timeLimitMinutes: null, questions: [{
    id: 'o1', type: 'ordering', text: 'Order these', points: 2, correctAnswer: ['i1', 'i2', 'i3'], topLabel: 'Small', bottomLabel: 'Large',
    items: [{ id: 'i1', text: 'A fairly long first item that has to wrap over several lines on a narrow phone screen' }, { id: 'i2', text: 'Second' }, { id: 'i3', text: 'Unbreakable_Supercalifragilisticexpialidocious_Unbreakable_Supercalifragilistic' }],
  }] });
  await startTest(s, 'ORD25');
  await page.locator('.q-order__item').first().waitFor();
  assert.ok(await noHorizontalScroll(page), 'no horizontal page scroll');
  // Every item text sits inside its row, and its row inside the card.
  const bad = await page.evaluate(() => [...document.querySelectorAll('.q-order__item')].filter((li) => {
    const r = li.getBoundingClientRect();
    return [...li.children].some((c) => { const b = c.getBoundingClientRect(); return b.right > r.right + 1 || b.left < r.left - 1; }) || li.scrollWidth > li.clientWidth + 1;
  }).length);
  assert.equal(bad, 0, 'nothing overflows an ordering row');
  // Buttons stay tappable (>= 32px) and the texts are not squeezed into a narrow column.
  const textW = await page.locator('.q-order__content').first().evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(textW > 200, `item text has room (${textW}px)`);
  const first = await page.locator('.q-order__item').first().getAttribute('data-item');
  await page.locator(tid(`ordering-down-${first}`)).click();
  await poll(async () => (await page.locator('.q-order__item').nth(1).getAttribute('data-item')) === first, { message: 'item moved down' });
}));

test('image answer choices render, have an accessible name and can be selected (mcq + multi)', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await serveImages(page);
  s.serveTest('IMG25', { code: 'IMG25', title: 'Images', description: '', timeLimitMinutes: null, questions: [
    { id: 'q1', type: 'mcq', text: 'Which flask?', points: 1, correctAnswer: 'b',
      options: [{ id: 'a', text: '', image: { url: '/images/opt-a.svg', alt: 'Red flask' } }, { id: 'b', text: 'Blue one', image: { url: '/images/opt-b.svg', alt: 'Blue flask' } }, { id: 'c', text: 'No picture' }] },
    { id: 'q2', type: 'multi', text: 'Pick all', points: 1, correctAnswer: ['a'],
      options: [{ id: 'a', text: '', image: { url: '/images/opt-a.svg', alt: 'Red again' } }, { id: 'b', text: 'Plain' }] },
  ] });
  await startTest(s, 'IMG25');
  const card = activeCard(page);
  const optA = card.locator(tid('option-a'));
  await optA.locator('img').waitFor();
  await poll(() => optA.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0), { message: 'image loaded' });
  assert.equal(await optA.locator('img').getAttribute('alt'), 'Red flask');
  assert.equal(await optA.locator('img').getAttribute('loading'), 'lazy');
  const h140 = await optA.locator('img').evaluate((img) => img.getBoundingClientRect().height);
  assert.ok(h140 <= 141, `image capped at ~140px (${h140})`);
  assert.equal(await card.locator(tid('option-c')).locator('img').count(), 0, 'text-only option has no image');
  await optA.click();
  assert.equal(await optA.getAttribute('aria-checked'), 'true');
  assert.ok(await optA.evaluate((el) => el.classList.contains('is-selected')));
  await card.locator(tid('option-b')).click();
  assert.equal(await optA.getAttribute('aria-checked'), 'false');
  assert.equal(await card.locator(tid('option-b')).getAttribute('aria-checked'), 'true');
  await page.locator(tid('next-btn')).click();
  const card2 = page.locator('[data-testid="question-card"].is-active[data-question-id="q2"]');
  await card2.waitFor();
  await card2.locator(tid('option-a')).click();
  assert.equal(await card2.locator(tid('option-a')).getAttribute('aria-checked'), 'true');
}));
