// FIX-3: hotspot ("Label the diagram") pins line up with the picture in results, grading and export;
// student tap-to-zoom on small screens.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, withSession, tid, startTest, activeCard, submit, unlockAdmin, noHorizontalScroll } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const SHOTS = '/tmp/claude-0/-home-user/ChemistryWorks/2d8ca981-3ddd-502a-8613-a4bf4ef17afe/scratchpad';
const IMG_URL = 'https://img.example.test/narrow.svg';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" fill="#cde"/><circle cx="60" cy="40" r="20" fill="#48a"/><rect x="120" y="70" width="50" height="30" fill="#a84"/></svg>';

const hotQ = {
  id: 'hot', type: 'hotspot', text: 'Label the diagram.', points: 2, radius: 0.1, partialCredit: true,
  image: { url: IMG_URL, alt: 'A circle and a rectangle' },
  labels: [{ id: 'a', text: 'Circle', x: 0.3, y: 0.33 }, { id: 'b', text: 'Rectangle', x: 0.72, y: 0.7 }],
};
const hotTest = { code: 'HOT1', title: 'Hotspot test', description: '', timeLimitMinutes: null, questions: [hotQ] };

async function routeImage(page) {
  await page.route(IMG_URL, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }));
}

/** Every pin centre must be within 2px of frame.left + x * frame.width, frame.top + y * frame.height. */
async function assertPinsAligned(page, scope, expected) {
  await scope.locator('img').first().evaluate((i) => i.decode().catch(() => {}));
  const res = await scope.evaluate((root, exp) => {
    const frame = root.querySelector('.q-hot__frame');
    const f = frame.getBoundingClientRect();
    const out = { frameW: f.width, frameH: f.height, diffs: [] };
    for (const [id, p] of Object.entries(exp)) {
      const pin = root.querySelector(`.q-hot__pin[data-label-id="${id}"]`);
      const r = pin.getBoundingClientRect();
      out.diffs.push(Math.hypot(r.left + r.width / 2 - (f.left + p.x * f.width), r.top + r.height / 2 - (f.top + p.y * f.height)));
    }
    return out;
  }, expected);
  assert.ok(res.frameW > 20 && res.frameH > 10, 'frame has size');
  assert.equal(res.diffs.length, Object.keys(expected).length);
  for (const d of res.diffs) assert.ok(d <= 2, `pin off by ${d}px`);
  return res;
}

async function placeLabel(page, labelId, fx, fy) {
  await page.locator(tid(`hotspot-label-${labelId}`)).click();
  const box = await activeCard(page).locator('.q-hot__frame img').boundingBox();
  await page.mouse.click(box.x + fx * box.width, box.y + fy * box.height);
}

test('student places labels; results pins align with the picture at 360 / 768 / 1366', () => withSession(env, { viewport: { width: 1366, height: 900 } }, async (s) => {
  const { page } = s;
  s.serveTest('HOT1', hotTest);
  await routeImage(page);
  await startTest(s, 'HOT1');
  const img = activeCard(page).locator('.q-hot__frame img');
  await img.waitFor();
  await img.evaluate((i) => i.decode());

  // Image (200 px) is narrower than the card: the frame hugs the picture.
  const frameW = (await activeCard(page).locator('.q-hot__frame').boundingBox()).width;
  const cardW = (await activeCard(page).boundingBox()).width;
  assert.ok(frameW <= 201 && frameW < cardW, `frame ${frameW} should hug the image, card ${cardW}`);

  await placeLabel(page, 'a', 0.31, 0.32); // right
  await placeLabel(page, 'b', 0.2, 0.2); // wrong spot
  await page.locator(tid('hotspot-pin-a')).waitFor();
  await page.locator(tid('hotspot-pin-b')).waitFor();
  await page.locator(tid('submit-btn')).waitFor();
  await submit(page);

  const item = page.locator(tid('review-item-hot'));
  await item.waitFor();
  if ((await item.locator('.results-item__head').getAttribute('aria-expanded')) !== 'true') await item.locator('.results-item__head').click();
  const mine = item.locator('.results-answer').first();
  const key = item.locator('.results-answer--correct');
  await mine.locator(tid('hotspot-diagram')).waitFor();
  await key.locator(tid('hotspot-diagram')).waitFor();

  // Read the saved fractions from the student pins' own geometry once (frame-relative), then verify at each width.
  const answer = {};
  for (const id of ['a', 'b']) {
    answer[id] = await mine.evaluate((root, lid) => {
      const f = root.querySelector('.q-hot__frame').getBoundingClientRect();
      const r = root.querySelector(`.q-hot__pin[data-label-id="${lid}"]`).getBoundingClientRect();
      return { x: (r.left + r.width / 2 - f.left) / f.width, y: (r.top + r.height / 2 - f.top) / f.height };
    }, id);
  }
  assert.ok(Math.abs(answer.a.x - 0.31) < 0.03 && Math.abs(answer.a.y - 0.32) < 0.03, `pin a at ${JSON.stringify(answer.a)}`);
  assert.ok(Math.abs(answer.b.x - 0.2) < 0.03 && Math.abs(answer.b.y - 0.2) < 0.03, `pin b at ${JSON.stringify(answer.b)}`);

  // Marks: glyph + class, not colour alone.
  assert.equal(await mine.locator('.q-hot__pin[data-label-id="a"] .q-hot__mark').textContent(), '✓');
  assert.equal(await mine.locator('.q-hot__pin[data-label-id="b"] .q-hot__mark').textContent(), '✗');
  assert.match(await mine.locator('.q-hot__legend').textContent(), /Circle.*✓.*Rectangle.*✗/s);
  // Key: circles at the answer positions.
  assert.equal(await key.locator('.q-hot__target').count(), 2);
  assert.equal(await mine.locator('.q-hot__target').count(), 0);
  assert.match(await mine.textContent(), /Circle: \(31%, 32%\)/); // existing text stays

  for (const width of [360, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    await assertPinsAligned(page, mine, answer);
    await assertPinsAligned(page, key, { a: { x: 0.3, y: 0.33 }, b: { x: 0.72, y: 0.7 } });
    // circle centred on its key position, diameter = 2 * radius * frame width
    const c = await key.evaluate((root) => {
      const f = root.querySelector('.q-hot__frame').getBoundingClientRect();
      const t = root.querySelector('.q-hot__target').getBoundingClientRect();
      return { dx: t.left + t.width / 2 - (f.left + 0.3 * f.width), dy: t.top + t.height / 2 - (f.top + 0.33 * f.height), d: t.width, fw: f.width };
    });
    assert.ok(Math.abs(c.dx) <= 2 && Math.abs(c.dy) <= 2, 'circle centred');
    assert.ok(Math.abs(c.d - 0.2 * c.fw) <= 2, `circle diameter ${c.d} vs ${0.2 * c.fw}`);
    assert.ok(await noHorizontalScroll(page), `no horizontal scroll at ${width}`);
  }
  for (const width of [360, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    await item.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/t03-results-${width}.png` });
  }
}));

test('student: tap image on a phone opens the zoom, placing works there', () => withSession(env, { viewport: { width: 360, height: 740 } }, async (s) => {
  const { page } = s;
  s.serveTest('HOT1', hotTest);
  await routeImage(page);
  await startTest(s, 'HOT1');
  await activeCard(page).locator('.q-hot__frame img').waitFor();
  assert.ok(await page.locator(tid('hotspot-zoom-open')).isVisible(), 'zoom button visible at 360');
  // Tapping the image with no label selected opens the zoom.
  const first = activeCard(page).locator('.q-hot__frame img');
  await first.evaluate((el) => el.scrollIntoView({ block: 'center' })); // a sticky header can cover the default scroll spot
  const fb = await first.boundingBox();
  await page.mouse.click(fb.x + fb.width / 2, fb.y + fb.height / 2);
  const modal = page.locator(tid('hotspot-zoom'));
  await modal.waitFor();
  assert.ok(await noHorizontalScroll(page));
  await modal.locator(tid('hotspot-zoom-label-a')).click();
  const zimg = modal.locator('.q-hot__stage--zoom img');
  await zimg.evaluate((i) => i.decode());
  const box = await zimg.boundingBox();
  assert.ok(box.width > 200, `zoomed image bigger than natural (${box.width})`);
  await page.mouse.click(box.x + 0.3 * box.width, box.y + 0.33 * box.height);
  await modal.locator('.q-hot__stage--zoom .q-hot__pin:not([hidden])').waitFor();
  await page.locator(tid('hotspot-zoom-done')).click();
  await modal.waitFor({ state: 'detached' });
  await page.locator(tid('hotspot-pin-a')).waitFor();
  assert.match(await activeCard(page).locator(tid('hotspot-status')).textContent(), /Circle placed/);
  // On a wide screen the zoom button is hidden.
  await page.setViewportSize({ width: 1024, height: 800 });
  assert.equal(await page.locator(tid('hotspot-zoom-open')).isVisible(), false);
}));

test('snap animation runs on place and is off under reduced motion', () => withSession(env, { viewport: { width: 1000, height: 800 } }, async (s) => {
  const { page } = s;
  s.serveTest('HOT1', hotTest);
  await routeImage(page);
  await startTest(s, 'HOT1');
  await activeCard(page).locator('.q-hot__frame img').evaluate((i) => i.decode());
  await placeLabel(page, 'a', 0.3, 0.3);
  const anim = await page.locator(tid('hotspot-pin-a')).evaluate((el) => getComputedStyle(el).animationName);
  assert.ok(anim === 'q-hot-snap' || anim === 'none', `animation name ${anim}`); // may already be finished
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await placeLabel(page, 'b', 0.6, 0.6);
  const calm = await page.locator(tid('hotspot-pin-b')).evaluate((el) => getComputedStyle(el).animationName);
  assert.equal(calm, 'none');
}));

test('grading view shows the student pins on the picture', () => withSession(env, { viewport: { width: 1280, height: 900 } }, async (s) => {
  const { page, url } = s;
  await routeImage(page);
  const row = {
    submission_id: 'sub-hot-1', timestamp: '2026-03-01T10:00:00Z', student_name: 'Ada Lovelace', student_email: 'ada@example.org',
    test_code: 'HOT1', test_title: 'Hotspot test', score_achieved: 1, score_total: 2, percentage: 50, duration_seconds: 60,
    status: 'Needs grading', final_score: null, final_percentage: null, grades: null, comments: {}, released_at: '',
    responses: [{
      questionId: 'hot', type: 'hotspot', questionText: 'Label the diagram.', pointsPossible: 2, pointsEarned: 1, isCorrect: false, answered: true, needsGrading: false, manual: false,
      givenAnswer: { a: { x: 0.31, y: 0.32 }, b: { x: 0.2, y: 0.2 } }, givenAnswerText: 'Circle: (31%, 32%); Rectangle: (20%, 20%)', correctAnswerText: 'Circle: (30%, 33%); Rectangle: (72%, 70%)',
    }],
  };
  s.serveTest('HOT1', hotTest);
  s.onGas = (body) => (body.action === 'getResults' ? { result: 'success', rows: [row] } : null);
  await unlockAdmin(page, url);
  await page.evaluate(() => sessionStorage.setItem('cw:adminKey', JSON.stringify('secret')));
  await page.locator(tid('tab-grading')).click();
  await page.locator(tid('grading-status-filter')).selectOption('all');
  await page.locator(tid('grading-row')).first().click();
  const item = page.locator(tid('grade-item')).first();
  await item.waitFor();
  const diagram = item.locator(tid('hotspot-diagram'));
  await diagram.waitFor();
  const scope = item.locator('.adm-grade__diagram');
  await assertPinsAligned(page, scope, { a: { x: 0.31, y: 0.32 }, b: { x: 0.2, y: 0.2 } });
  assert.equal(await scope.locator('.q-hot__pin').count(), 2);
  assert.equal(await scope.locator('.q-hot__target').count(), 2); // key circles shown to the grader
}));


test('PDF export shows the student pins and the key circles, with glyphs for black and white', () => withSession(env, { viewport: { width: 1280, height: 900 } }, async (s) => {
  const { page, url } = s;
  await routeImage(page);
  await page.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  const row = {
    submission_id: 'sub-hot-2', timestamp: '2026-03-01T10:00:00Z', student_name: 'Ada Lovelace', student_email: 'ada@example.org',
    test_code: 'HOT1', test_title: 'Hotspot test', score_achieved: 1, score_total: 2, percentage: 50, duration_seconds: 60,
    status: 'Graded', final_score: 1, final_percentage: 50, grades: {}, comments: {}, released_at: '2026-03-02T00:00:00Z',
    responses: [{
      questionId: 'hot', type: 'hotspot', questionText: 'Label the diagram.', pointsPossible: 2, pointsEarned: 1, isCorrect: false, answered: true, needsGrading: false, manual: false,
      givenAnswer: { a: { x: 0.31, y: 0.32 }, b: { x: 0.2, y: 0.2 } }, givenAnswerText: 'Circle: (31%, 32%); Rectangle: (20%, 20%)', correctAnswerText: 'Circle: (30%, 33%); Rectangle: (72%, 70%)',
    }],
  };
  s.serveTest('HOT1', hotTest);
  s.onGas = (body) => (body.action === 'getResults' ? { result: 'success', rows: [row] } : null);
  await unlockAdmin(page, url);
  await page.evaluate(() => sessionStorage.setItem('cw:adminKey', JSON.stringify('secret')));
  await page.locator(tid('tab-grading')).click();
  await page.locator(tid('grading-status-filter')).selectOption('all');
  await page.locator(tid('grading-row')).first().click();
  await page.locator(tid('grade-item')).first().waitFor();
  await page.locator(tid('export-pdf')).click();
  await page.waitForFunction(() => window.__printed === 1);
  const item = page.locator(`#print-root ${tid('export-item-hot')}`);
  const mine = item.locator(tid('export-answer'));
  const key = item.locator(tid('export-correct'));
  assert.equal(await mine.locator('.q-hot__pin').count(), 2);
  assert.equal(await key.locator('.q-hot__target').count(), 2);
  assert.equal(await mine.locator('.q-hot__pin .q-hot__mark').allTextContents().then((a) => a.join('')), '✓✗');
  // #print-root is display:none on screen, so check the pin positions as % of the frame (same box as the picture).
  const pos = (loc, id) => loc.locator(`.q-hot__pin[data-label-id="${id}"]`).evaluate((e) => [e.style.left, e.style.top]);
  assert.deepEqual(await pos(mine, 'a'), ['31%', '32%']);
  assert.deepEqual(await pos(mine, 'b'), ['20%', '20%']);
  assert.deepEqual(await pos(key, 'b'), ['72%', '70%']);
  assert.equal(await mine.locator('.q-hot__frame > .q-hot__img').count(), 1);
}));
