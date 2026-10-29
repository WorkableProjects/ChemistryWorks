// Shared Playwright helpers for the E2E suite. Not a test file (no .test.mjs suffix).
import { createRequire } from 'node:module';
import { listen } from '../../scripts/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

export const GAS_URL = 'https://gas.example.test/exec';
export const ADMIN_CODE = 'chemadmin';
export const STUDENT = { name: 'Ada Lovelace', email: 'ada@example.org' };

/** Start the static server and one chromium for the whole test file. */
export async function startEnv() {
  const { server, url } = await listen(0);
  const browser = await chromium.launch();
  return {
    url,
    browser,
    async close() {
      await browser.close().catch(() => {});
      await new Promise((r) => server.close(r));
      server.closeAllConnections?.();
    },
  };
}

/**
 * Create an isolated browser context + page with deterministic network.
 * Returns a session: { page, context, gas, netlify, errors, modes, serveTest(code, obj), close() }.
 *   gas / netlify   every captured POST (parsed), including ones answered with a failure
 *   modes           { gas: 'ok'|'fail', netlify: 200|500 } mutable at any time
 */
export async function newSession(env, { config = {}, viewport, acceptDownloads = true } = {}) {
  const context = await env.browser.newContext({ viewport: viewport || { width: 1280, height: 900 }, acceptDownloads });
  const gas = [];
  const netlify = [];
  const errors = [];
  const modes = { gas: 'ok', netlify: 200 };
  const overrides = new Map(); // pathname -> body object

  const cfg = { GAS_WEB_APP_URL: GAS_URL, NETLIFY_FORMS: true, ...config };
  await context.addInitScript((c) => { window.CHEMISTRYWORKS_CONFIG = c; }, cfg);

  const origin = new URL(env.url).origin;
  await context.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.origin === origin) {
      if (req.method() === 'POST' && u.pathname === '/') {
        const body = Object.fromEntries(new URLSearchParams(req.postData() || ''));
        netlify.push(body);
        return route.fulfill({ status: modes.netlify, contentType: 'text/plain', body: modes.netlify === 200 ? 'ok' : 'error' });
      }
      if (req.method() === 'GET' && overrides.has(u.pathname)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overrides.get(u.pathname)) });
      }
      return route.continue();
    }
    if (u.origin === new URL(GAS_URL).origin) {
      if (req.method() === 'POST') {
        let body = null;
        try { body = JSON.parse(req.postData() || 'null'); } catch { body = { raw: req.postData() }; }
        gas.push(body);
        if (modes.gas === 'fail') return route.abort('failed');
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"result":"success"}' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"result":"error","error":"not_found"}' });
    }
    // Fonts, KaTeX CDN, Google Identity Services, ...: deterministic and offline-safe.
    return route.abort('blockedbyclient');
  });

  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource/i.test(text) || /net::ERR_/i.test(text)) return; // aborted CDN / mocked failures
    errors.push(`console.error: ${text}`);
  });

  return {
    page, context, gas, netlify, errors, modes, url: env.url,
    serveTest(code, test) { overrides.set(`/data/tests/${code}.json`, test); },
    async close() {
      await context.close().catch(() => {});
    },
  };
}

/** Run `fn(session)` and fail afterwards if the page logged any error. */
export async function withSession(env, opts, fn) {
  const s = await newSession(env, opts);
  try {
    await fn(s);
    if (s.errors.length) throw new Error(`Browser errors:\n${s.errors.join('\n')}`);
  } finally {
    await s.close();
  }
}

export const tid = (id) => `[data-testid="${id}"]`;

/** The landing view moves focus to its first field ~60ms after render; wait for that so typing is not hijacked. */
export async function landingReady(page) {
  await page.waitForFunction(() => ['demo-name', 'code-input'].includes(document.activeElement?.dataset?.testid));
}

export async function signIn(page, name = STUDENT.name, email = STUDENT.email) {
  await landingReady(page);
  await page.locator(tid('demo-name')).fill(name);
  await page.locator(tid('demo-email')).fill(email);
  await page.locator(tid('demo-signin')).click();
}

/** Sign in from the landing page and open a test by code. */
export async function startTest(s, code = 'CHEM101', user = STUDENT) {
  const { page } = s;
  await page.goto(s.url + '/');
  await signIn(page, user.name, user.email);
  await page.locator(tid('code-input')).fill(code);
  await page.locator(tid('code-submit')).click();
  await page.locator(tid('runner')).waitFor();
  await activeId(page); // wait for first card
}

export const activeCard = (page) => page.locator('[data-testid="question-card"].is-active');

export async function activeId(page) {
  const card = activeCard(page);
  await card.first().waitFor();
  return card.first().getAttribute('data-question-id');
}

/** Poll until `fn()` returns a truthy value (web-first style, no fixed sleeps). */
export async function poll(fn, { timeout = 10000, interval = 50, message = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Timed out waiting for ${message} (last: ${last instanceof Error ? last.message : JSON.stringify(last)})`);
}

/** Wait until the locator's trimmed text equals (string) or matches (RegExp) `expected`. */
export async function waitText(locator, expected, { timeout = 10000 } = {}) {
  let text = '';
  await poll(async () => {
    text = ((await locator.first().textContent({ timeout: 1000 })) || '').trim();
    return typeof expected === 'string' ? text === expected : expected.test(text);
  }, { timeout, message: `text ${expected} (got "${text}")` });
  return text;
}

export async function waitAttr(locator, name, expected, { timeout = 10000 } = {}) {
  let v = null;
  await poll(async () => { v = await locator.first().getAttribute(name, { timeout: 1000 }); return v === expected; },
    { timeout, message: `attr ${name}=${expected} (got ${v})` });
}

export async function goNext(page) {
  const before = await activeId(page);
  await page.locator(tid('next-btn')).click();
  await poll(async () => (await activeCard(page).first().getAttribute('data-question-id')) !== before, { message: 'next question' });
}

export async function goPrev(page) {
  const before = await activeId(page);
  await page.locator(tid('prev-btn')).click();
  await poll(async () => (await activeCard(page).first().getAttribute('data-question-id')) !== before, { message: 'previous question' });
}

/** Answer helpers operate on the active card (focus mode). */
export const A = {
  mcq: (page, optId) => activeCard(page).locator(tid(`option-${optId}`)).click(),
  multi: async (page, ids) => { for (const id of ids) await activeCard(page).locator(tid(`option-${id}`)).click(); },
  numeric: (page, text) => activeCard(page).locator(tid('numeric-input')).fill(text),
  formula: (page, text) => activeCard(page).locator(tid('formula-input')).fill(text),
  tf: (page, v) => activeCard(page).locator(tid(v ? 'tf-true' : 'tf-false')).click(),
  match: async (page, pairs) => {
    for (const [l, r] of Object.entries(pairs)) await activeCard(page).locator(tid(`match-${l}-${r}`)).check({ force: true });
  },
};

/** Correct answers for CHEM101, using every widget. Ends on the last question (no submit). */
export async function answerCHEM101(page, { correct = true } = {}) {
  await A.mcq(page, 'b'); await goNext(page);
  await A.multi(page, ['a', 'c', 'e']); await goNext(page);
  await A.numeric(page, '18.016'); await goNext(page);
  await A.formula(page, 'H2SO4'); await goNext(page);
  await A.tf(page, true); await goNext(page);
  await A.match(page, { na: 'p1', mg: 'p2', al: 'p3' }); await goNext(page);
  await A.numeric(page, '1.2044e24');
}

/** Open the submit modal from the last question and confirm. */
export async function submit(page) {
  await page.locator(tid('submit-btn')).click();
  await page.locator(tid('submit-modal')).waitFor();
  await page.locator(tid('confirm-submit')).click();
  await page.locator(tid('results')).waitFor();
}

export async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

export async function unlockAdmin(page, baseUrl, { path = '/?admin=true' } = {}) {
  await page.goto(baseUrl + path);
  await page.locator(tid('admin-gate')).waitFor();
  // The landing view (rendered under the gate) moves focus 60ms after render; let that settle before typing.
  await page.waitForFunction(() => ['demo-name', 'code-input', 'admin-code-input'].includes(document.activeElement?.dataset?.testid));
  await page.waitForTimeout(150);
  await page.locator(tid('admin-code-input')).fill(ADMIN_CODE);
  await page.locator(tid('admin-unlock')).click();
  await page.locator(tid('admin')).waitFor();
}

/** Minimal valid ad-hoc test object. */
export function adhocTest(code, overrides = {}) {
  return {
    code,
    title: `Ad hoc ${code}`,
    description: '',
    timeLimitMinutes: null,
    questions: [
      { id: 'q1', type: 'mcq', text: 'Pick B', points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctAnswer: 'b', explanation: 'B is right.' },
      { id: 'q2', type: 'truefalse', text: 'Water is wet.', points: 1, correctAnswer: true, explanation: 'Yes.' },
    ],
    ...overrides,
  };
}

/** The builder focuses a new question's text box ~80ms after adding it; wait so later typing is not hijacked. */
export async function addQuestion(page, type) {
  await page.locator(tid('add-question')).click();
  await page.locator(tid(`add-question-${type}`)).click();
  await page.waitForFunction(() => document.activeElement?.dataset?.testid === 'q-text');
}
