// Full-width student question view: the runner, game modes, results and feedback fill the screen, short options flow
// into columns, text keeps a reading measure, the docked rail leaves the rest of the width to the content, and small
// screens keep their single column. Also renders every type at 1920px.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { startEnv, withSession, startTest, tid, activeCard, submit, noHorizontalScroll, nextFrames, settled, STUDENT } from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

// Set CW_SHOTS_DIR to also save screenshots.
const SHOTS = process.env.CW_SHOTS_DIR || '';
const shot = async (page, name) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const opts = (...t) => t.map((text, i) => ({ id: String.fromCharCode(97 + i), text }));
const LONG = 'A long paragraph of prompt text that goes on and on so the line length is limited by the reading measure and not by the width of the screen, which is very wide indeed on a classroom monitor. '.repeat(3);

const CODE = 'LAYOUT1';
const layoutTest = () => ({
  code: CODE, title: 'Layout', description: '', timeLimitMinutes: null, gameMode: true, showResults: true, showCorrectAnswers: true,
  questions: [
    { id: 'q1', type: 'mcq', text: LONG, points: 1, options: opts('Na', 'K', 'Li', 'Rb'), correctAnswer: 'b', explanation: 'K is potassium.' },
    { id: 'q2', type: 'mcq', text: 'Which statement describes the long option?', points: 1, correctAnswer: 'a',
      options: opts('This option is deliberately longer than forty characters in total', 'Short') },
    { id: 'q3', type: 'matching', text: 'Match each symbol to its element.', points: 2, partialCredit: true,
      left: opts('Na', 'K', 'Li', 'Fe', 'Cu', 'Zn'), right: opts('Sodium', 'Potassium', 'Lithium', 'Iron', 'Copper', 'Zinc'),
      correctAnswer: { a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f' } },
    { id: 'q4', type: 'mcq', text: 'Lightest element', points: 1, options: opts('Hydrogen', 'Helium'), correctAnswer: 'a' },
    { id: 'q5', type: 'mcq', text: 'Noble gas in balloons', points: 1, options: opts('Neon', 'Helium'), correctAnswer: 'b' },
    { id: 'q6', type: 'mcq', text: 'Most abundant gas in air', points: 1, options: opts('Nitrogen', 'Oxygen'), correctAnswer: 'a' },
  ],
});

const widthOf = (loc) => loc.evaluate((el) => el.getBoundingClientRect().width);
const trackCount = (loc) => loc.evaluate((el) => (getComputedStyle(el).display === 'grid' ? getComputedStyle(el).gridTemplateColumns.split(' ').length : 1));

async function gotoCard(page, id) {
  for (let i = 0; i < 8; i++) {
    if ((await activeCard(page).getAttribute('data-question-id')) === id) return;
    await page.locator(tid('next-btn')).click();
    await nextFrames(page);
  }
}

test('1920px: the runner, modes and results fill the width; 3 option columns; 75ch prompt; no sideways scroll', () => withSession(env, { viewport: { width: 1920, height: 1080 } }, async (s) => {
  const { page } = s;
  s.serveTest(CODE, layoutTest());
  await startTest(s, CODE);
  await activeCard(page).waitFor();

  assert.ok(await widthOf(page.locator('.runner-main')) >= 1920 * 0.9, '.runner-main fills the viewport');
  assert.ok(await widthOf(page.locator('.runner-footer__inner')) >= 1920 * 0.9, 'the footer spreads across the bar');
  assert.ok(await widthOf(page.locator('.runner-bar__inner')) >= 1920 * 0.9, 'the runner bar fills the viewport');

  assert.equal(await trackCount(page.locator('.q-choices__list--cols').first()), 3, 'four short options render in 3 columns');
  assert.equal(await trackCount(activeCard(page).locator(tid('q-split'))), 2, 'a split type shows prompt and answer side by side');

  const measure = await activeCard(page).locator('.q-text').first().evaluate((el) => {
    const probe = document.createElement('div');
    probe.style.cssText = 'width:75ch;height:0;visibility:hidden';
    el.appendChild(probe);
    const limit = probe.getBoundingClientRect().width;
    probe.remove();
    return { width: el.getBoundingClientRect().width, limit };
  });
  assert.ok(measure.width <= measure.limit + 1, `prompt is ${measure.width}px, limit ${measure.limit}px`);

  await gotoCard(page, 'q2');
  assert.equal(await trackCount(activeCard(page).locator('.q-choices__list')), 1, 'a long option keeps one option per row');

  await gotoCard(page, 'q3');
  assert.equal(await activeCard(page).locator(tid('q-split')).getAttribute('data-layout'), 'wide');
  assert.equal(await trackCount(activeCard(page).locator(tid('q-split'))), 1, 'a wide type stacks prompt and answer');
  assert.ok(await noHorizontalScroll(page), 'matching has no horizontal scroll');
  await shot(page, 'runner-1920-light');

  // Game mode.
  await page.locator(tid('mode-option-classic')).click();
  await page.locator(`${tid('mode-shell')}[data-mode="classic"]`).waitFor();
  assert.ok(await widthOf(page.locator('.mode-main')) >= 1920 * 0.9, '.mode-main fills the viewport');
  assert.ok(await widthOf(page.locator('.mode-bar__inner')) >= 1920 * 0.9, '.mode-bar__inner fills the viewport');
  assert.ok(await noHorizontalScroll(page));

  // Results.
  await page.locator(tid('mode-option-study')).click();
  await page.locator(tid('runner')).waitFor();
  await submit(page);
  assert.ok(await widthOf(page.locator('.results')) >= 1920 * 0.9, '.results fills the viewport');
  assert.ok(await noHorizontalScroll(page));
  await shot(page, 'results-1920-light');
}));

test('the feedback page fills the width too', () => withSession(env, { viewport: { width: 1920, height: 1080 } }, async (s) => {
  const { page } = s;
  await page.goto(s.url + '/');
  const w = await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'feedback';
    document.body.appendChild(el);
    const width = el.getBoundingClientRect().width;
    el.remove();
    return width;
  });
  assert.ok(w >= 1920 * 0.9, `.feedback is ${w}px`);
}));

test('1280px with the rail open: the content fills the rest of the width', () => withSession(env, { viewport: { width: 1280, height: 800 } }, async (s) => {
  const { page } = s;
  s.serveTest(CODE, layoutTest());
  await startTest(s, CODE);
  await page.locator(tid('navigator-toggle')).click();
  await page.locator(`${tid('navigator')}.is-open`).waitFor();
  await settled(page, tid('navigator')); // the rail slides in over 320 ms
  await nextFrames(page);
  const { left, right, rail } = await page.evaluate(() => {
    const m = document.querySelector('.runner-main').getBoundingClientRect();
    const d = document.querySelector('[data-testid="navigator"]').getBoundingClientRect();
    return { left: m.left, right: m.right, rail: d.right };
  });
  assert.ok(left >= rail, 'the content starts to the right of the rail');
  assert.ok(left - rail <= 48, `the content sits beside the rail (gap ${left - rail}px)`);
  assert.ok(right >= 1280 - 1, `the content reaches the right edge (${right})`);
  assert.ok(await noHorizontalScroll(page));
  await shot(page, 'runner-1280-rail-light');
}));

test('360px: one column, no horizontal scroll, the old gutters', () => withSession(env, { viewport: { width: 360, height: 800 } }, async (s) => {
  const { page } = s;
  s.serveTest(CODE, layoutTest());
  await startTest(s, CODE);
  assert.ok(await noHorizontalScroll(page));
  assert.equal(await page.locator('.runner-main').evaluate((el) => getComputedStyle(el).paddingLeft), '14px');
  assert.equal(await trackCount(page.locator('.q-choices__list').first()), 1, 'options stack in one column');
  assert.equal(await activeCard(page).locator(tid('q-split')).evaluate((el) => getComputedStyle(el).display), 'block');
  await gotoCard(page, 'q3');
  assert.ok(await noHorizontalScroll(page), 'matching fits at 360px');
  await shot(page, 'runner-360-light');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await shot(page, 'runner-360-dark');
}));

// Every type at 1920px: the card stays inside the viewport.
const FIXTURES = readdirSync(new URL('../fixtures/types/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const fixture = (type) => JSON.parse(readFileSync(new URL(`../fixtures/types/${type}.json`, import.meta.url), 'utf8'));

for (const type of FIXTURES) {
  test(`${type}: renders at 1920px inside the viewport`, () => withSession(env, { viewport: { width: 1920, height: 1080 } }, async (s) => {
    const { page } = s;
    const fx = fixture(type);
    const code = `LW${type.toUpperCase()}`.slice(0, 16);
    s.serveTest(code, { code, title: `Layout ${type}`, description: '', timeLimitMinutes: null, questions: [fx.question] });
    await startTest(s, code);
    await page.evaluate(([key, value]) => localStorage.setItem(`cw:${key}`, JSON.stringify(value)), [
      `progress:${STUDENT.email}:${code}`,
      { answers: { [fx.question.id]: fx.correct }, flagged: [], index: 0, startedAt: Date.now(), mode: 'focus', v: 5, total: 1 },
    ]);
    await page.goto(`${s.url}/?code=${code}`);
    await page.locator(tid('runner')).waitFor();
    await activeCard(page).waitFor();
    await nextFrames(page);
    assert.ok(await noHorizontalScroll(page), `${type}: no horizontal page scroll`);
    const over = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="question-card"].is-active');
      return [...card.querySelectorAll('*')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && !el.closest('svg, [hidden]');
      }).map((el) => String(el.className || el.tagName)).slice(0, 5);
    });
    assert.deepEqual(over, [], `${type}: nothing leaves the viewport`);
  }));
}

test('hotspot: clicks still grade after the stage is scaled at 1920px', () => withSession(env, { viewport: { width: 1920, height: 1080 } }, async (s) => {
  const { page } = s;
  const fx = fixture('hotspot');
  const code = 'LWHOTCLICK';
  s.serveTest(code, { code, title: 'Hotspot clicks', description: '', timeLimitMinutes: null, showResults: true, showCorrectAnswers: true, questions: [fx.question] });
  await startTest(s, code);
  const img = activeCard(page).locator('.q-hot__frame img');
  await img.waitFor();
  await img.evaluate((i) => i.decode().catch(() => {}));
  for (const label of fx.question.labels) {
    await page.locator(tid(`hotspot-label-${label.id}`)).click();
    const box = await img.boundingBox();
    await page.mouse.click(box.x + label.x * box.width, box.y + label.y * box.height);
  }
  await submit(page);
  assert.equal(await page.locator(`${tid(`review-item-${fx.question.id}`)}[data-correct="true"]`).count(), 1, 'the scaled stage still grades the clicks as correct');
}));
