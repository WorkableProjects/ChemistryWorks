// Shared Playwright helpers for the E2E suite. Not a test file (no .test.mjs suffix).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { scheduler } from 'node:timers/promises';
import { listen } from '../../scripts/serve.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

export const GAS_URL = 'https://gas.example.test/exec';
/** Default action/locator timeout: a broken suite fails fast instead of waiting 30 s per locator. */
export const ACTION_TIMEOUT = 5000;
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
 * Returns a session: { page, context, gas, errors, modes, onGas, serveTest(code, obj), close() }.
 *   gas             every captured Apps Script POST (parsed), including ones answered with a failure
 *   modes           { gas: 'ok'|'fail' } mutable at any time
 */
export async function newSession(env, { config = {}, viewport, acceptDownloads = true, gasDelayMs = 0 } = {}) {
  const context = await env.browser.newContext({ viewport: viewport || { width: 1280, height: 900 }, acceptDownloads });
  const gas = [];
  const statusCalls = [];
  const errors = [];
  const modes = { gas: 'ok' };
  const overrides = new Map(); // pathname -> body object

  // Tests always use demo sign-in, whatever Google settings js/config.js has for the live site.
  const cfg = { GAS_WEB_APP_URL: GAS_URL, GOOGLE_CLIENT_ID: '', ALLOW_DEMO_SIGNIN: true, ...config };
  await context.addInitScript((c) => { window.CHEMISTRYWORKS_CONFIG = c; }, cfg);

  const origin = new URL(env.url).origin;
  await context.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.origin === origin) {
      if (req.method() === 'GET' && overrides.has(u.pathname)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overrides.get(u.pathname)) });
      }
      // The sample tests (CHEM101, ...) live in test/fixtures/tests; serve them as if bundled in data/tests.
      if (req.method() === 'GET' && u.pathname.startsWith('/data/tests/')) {
        const name = u.pathname.slice('/data/tests/'.length);
        if (/^[A-Za-z0-9_-]+\.json$/.test(name)) {
          try {
            const body = readFileSync(new URL(`../fixtures/tests/${name}`, import.meta.url), 'utf8');
            return route.fulfill({ status: 200, contentType: 'application/json', body });
          } catch { return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }); }
        }
      }
      return route.continue();
    }
    if (u.origin === new URL(GAS_URL).origin) {
      if (req.method() === 'POST') {
        let body = null;
        try { body = JSON.parse(req.postData() || 'null'); } catch { body = { raw: req.postData() }; }
        // v3: the read-only submission-status check is recorded separately so `gas` keeps meaning "writes".
        if (body && body.action === 'getStudentStatus') statusCalls.push(body); else gas.push(body);
        if (session.gasDelayMs > 0) await scheduler.wait(session.gasDelayMs); // slow backend: every mock reply waits
        if (modes.gas === 'fail') return route.abort('failed');
        const reply = session.onGas?.(body) || { result: 'success' };
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"result":"error","error":"not_found"}' });
    }
    // Fonts, KaTeX CDN, Google Identity Services, ...: deterministic and offline-safe.
    return route.abort('blockedbyclient');
  });

  context.setDefaultTimeout(ACTION_TIMEOUT);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource/i.test(text) || /net::ERR_/i.test(text)) return; // aborted CDN / mocked failures
    errors.push(`console.error: ${text}`);
  });

  const session = {
    page, context, gas, errors, modes, statusCalls, url: env.url, gasDelayMs,
    onGas: null, // optional (body) => reply object for Apps Script POSTs (admin actions)
    serveTest(code, test) { overrides.set(`/data/tests/${code}.json`, test); },
    async close() {
      await context.close().catch(() => {});
    },
  };
  return session;
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
  await page.waitForFunction(() => ['demo-name', 'home-code-input'].includes(document.activeElement?.dataset?.testid));
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
  await page.locator(tid('home-code-input')).fill(code);
  await page.locator(tid('home-code-submit')).click();
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
    await scheduler.wait(interval);
  }
  throw new Error(`Timed out waiting for ${message} (last: ${last instanceof Error ? last.message : JSON.stringify(last)})`);
}

/** Wait until every CSS transition and animation on the element has finished. */
export async function settled(page, selector) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && el.getAnimations().every((a) => a.playState === 'finished' || a.playState === 'idle');
  }, selector);
}

/** Wait two animation frames, so layout and resize observers have run. */
export const nextFrames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

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
    for (const [l, r] of Object.entries(pairs)) {
      // The radio is visually hidden and a toast can sit over it on a phone, so click the element itself.
      const input = activeCard(page).locator(tid(`match-${l}-${r}`));
      await input.evaluate((el) => el.click());
      await poll(() => input.isChecked(), { message: `match ${l}-${r} checked` });
    }
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

export async function unlockAdmin(page, baseUrl, { path = '/?admin=true', dashboard = false } = {}) {
  // No Google client ID in tests, so the demo admin opens the panel directly.
  await page.goto(baseUrl + path);
  await page.locator(tid('admin')).waitFor();
  // The admin shell opens on the Dashboard; tests that want the Library start there with dashboard: false.
  if (!dashboard && await page.locator(tid('dashboard')).count()) {
    const phone = (await page.locator(tid('admin')).getAttribute('data-nav')) === 'drawer';
    if (phone) { // phone: open the drawer, wait for it to finish sliding in
      await page.locator(tid('admin-nav-toggle')).click();
      await page.waitForFunction(() => document.querySelector('[data-testid="admin-sidebar"]')?.inert === false);
      await settled(page, tid('admin-sidebar'));
    }
    await page.locator(tid('tab-library')).click({ force: phone });
    await page.locator(tid('library-sections')).first().waitFor();
  }
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

/** Sign the session in as a Google student the mock backend can identify (its ID token is `mock.<email>`). */
export function signInStudentAs(s, user = STUDENT) {
  return s.context.addInitScript((u) => {
    try {
      if (!sessionStorage.getItem('cw:user')) {
        sessionStorage.setItem('cw:user', JSON.stringify({ name: u.name, email: u.email, picture: null, provider: 'google', idToken: `mock.${u.email}`, idTokenExp: 4102444800 }));
      }
    } catch { /* storage blocked */ }
  }, user);
}

export const withAdminKey = (s) => s.context.addInitScript(() => sessionStorage.setItem('cw:adminKey', JSON.stringify('secret')));

/**
 * A small stateful Apps Script stand-in for the Class Hub. Assignments, stream posts, submissions and read marks
 * live in `state`, so a teacher session and a student session can share one backend:
 *   const be = createMockBackend({ classes: [{ id, name, emails }], tests: [{ code, title }], students: { email: name } });
 *   be.attach(teacherSession); be.attach(studentSession);
 * Mirrors Code.gs: a new assignment adds a stream post and a "New assignment" notification, a submission after the due
 * time is Late, a roster student with nothing turned in after the due time is Missing.
 */
export function createMockBackend({ classes = [], tests = [], students = {}, profile = {} } = {}) {
  const state = {
    classes, tests, students, assignments: [], stream: [], submissions: [], attempts: {}, readIds: new Set(), seq: 1, calls: [],
    now: () => Date.now(), // tests may replace it to move the backend clock
  };
  const nextId = (p) => `${p}${state.seq++}`;
  const emailOf = (b) => String(b.idToken || '').replace(/^mock\./, '').toLowerCase();
  const rosterOf = (classId) => ((state.classes.find((c) => c.id === classId) || {}).emails || []).map((e) => e.toLowerCase());
  const classesOf = (email) => state.classes.filter((c) => (c.emails || []).some((e) => e.toLowerCase() === email));
  const ms = (v) => (v ? Date.parse(v) : null);
  const iso = (t) => new Date(t).toISOString();

  function statusOf(a, email) {
    const sub = [...state.submissions].reverse().find((x) => x.email === email && x.testCode === a.testCode);
    const due = ms(a.dueAt);
    const out = { status: 'not_started', canSubmit: !(due !== null && state.now() > due && a.lateAllowed === false) };
    if (sub) {
      const late = due !== null && ms(sub.submittedAt) > due;
      return { ...out, canSubmit: false, status: sub.released ? 'released' : sub.graded ? 'graded' : late ? 'late' : 'turned_in', submittedAt: sub.submittedAt, late };
    }
    const att = state.attempts[`${email}|${a.testCode}`];
    if (att && att.answeredCount > 0) return { ...out, status: 'in_progress', percentDone: att.total ? Math.round((att.answeredCount / att.total) * 100) : 0, lastMode: att.mode };
    return { ...out, status: due !== null && state.now() > due ? 'missing' : 'not_started' };
  }

  function hubFor(email) {
    const mine = classesOf(email);
    const ids = new Set(mine.map((c) => c.id));
    const assignments = state.assignments.filter((a) => ids.has(a.classId)).map((a) => {
      const st = statusOf(a, email);
      return { ...a, status: st.status, canSubmit: st.canSubmit, effectiveDueAt: a.dueAt || undefined, ...(st.percentDone !== undefined ? { percentDone: st.percentDone, lastMode: st.lastMode } : {}), ...(st.submittedAt ? { submittedAt: st.submittedAt, late: st.late } : {}) };
    });
    const stream = state.stream.filter((p) => ids.has(p.classId)).sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || ms(y.createdAt) - ms(x.createdAt));
    const notifications = assignments.map((a) => ({ id: `new:${a.id}`, type: 'assignment', refId: a.id, title: a.title, createdAt: a.createdAt, read: state.readIds.has(`new:${a.id}`) }));
    return { classes: mine.map((c) => ({ id: c.id, name: c.name, period: c.period })), assignments, stream, notifications, reminders: [] };
  }

  function profileFor(email) {
    const mine = classesOf(email);
    const results = state.submissions.filter((x) => x.email === email).map((x) => ({
      testCode: x.testCode, title: x.title, submittedAt: x.submittedAt, status: x.released ? 'released' : 'submitted', released: !!x.released,
      percentage: x.released ? x.percentage : null, scoreAchieved: x.released ? x.scoreAchieved : null, scoreTotal: x.released ? x.scoreTotal : null,
    }));
    const attempts = Object.entries(state.attempts).filter(([k]) => k.startsWith(`${email}|`)).map(([, a]) => a);
    return {
      result: 'success',
      profile: { name: state.students[email] || '', xp: 0, level: 1, streakDays: 0, classIds: mine.map((c) => c.id), badges: [], prefs: {}, stats: {}, ...(profile.profile || {}) },
      results: [...results, ...(profile.results || [])], attempts: [...attempts, ...(profile.attempts || [])], assigned: profile.assigned || [], hub: hubFor(email),
    };
  }

  function handle(b) {
    state.calls.push(b);
    if (b.submission_id && !b.action) { // a test submission
      state.submissions.push({ id: b.submission_id, email: String(b.student_email || '').toLowerCase(), name: b.student_name, testCode: b.test_code, title: b.test_title, submittedAt: b.submitted_at });
      return { result: 'success' };
    }
    switch (b.action) {
      case 'getStudentProfile': return profileFor(emailOf(b));
      case 'getClassHub': return { result: 'success', ...hubFor(emailOf(b)) };
      case 'markNotificationsRead':
        (b.ids || []).forEach((i) => state.readIds.add(i));
        if (b.all) hubFor(emailOf(b)).notifications.forEach((n) => state.readIds.add(n.id));
        return { result: 'success', readAt: state.now() };
      case 'syncProgress':
        if (b.attempt) state.attempts[`${emailOf(b)}|${b.attempt.code}`] = { ...b.attempt, updatedAt: iso(state.now()) };
        return { result: 'success' };
      case 'listClasses': return { result: 'success', classes: state.classes.map((c) => ({ period: '', updated_by: '', updated_at: '', ...c })) };
      case 'listTests': return { result: 'success', tests: state.tests.map((t) => ({ updatedAt: '2026-01-01T00:00:00Z', submissionCount: 0, ...t })) };
      case 'listAssignments': return { result: 'success', assignments: state.assignments.filter((a) => !b.classId || a.classId === b.classId) };
      case 'saveAssignment': {
        const a = b.assignment || {};
        const test = state.tests.find((t) => t.code === a.testCode);
        const row = { id: nextId('asg'), classId: a.classId, testCode: a.testCode, title: a.title || (test && test.title) || a.testCode, instructions: a.instructions || '', opensAt: a.opensAt || '',
          dueAt: a.dueAt || '', lateAllowed: a.lateAllowed !== false, required: a.required === true, modes: a.modes || [], publishAt: a.publishAt || '', createdBy: 'teacher', createdAt: iso(state.now()) };
        const at = a.id ? state.assignments.findIndex((x) => x.id === a.id) : -1;
        if (at >= 0) { state.assignments[at] = { ...state.assignments[at], ...row, id: a.id, createdAt: state.assignments[at].createdAt }; return { result: 'success', assignment: state.assignments[at] }; }
        state.assignments.push(row);
        const post = { id: nextId('post'), classId: row.classId, type: 'assignment', body: row.title, pinned: false, createdAt: row.createdAt, createdBy: 'teacher' };
        state.stream.push(post);
        return { result: 'success', assignment: row, post };
      }
      case 'deleteAssignment': state.assignments = state.assignments.filter((a) => a.id !== b.id); return { result: 'success', id: b.id, deleted: true };
      case 'getAssignmentStatus': {
        const a = state.assignments.find((x) => x.id === b.id);
        if (!a) return { result: 'error', error: 'not_found' };
        const rows = rosterOf(a.classId).map((email) => {
          const st = statusOf(a, email);
          return { email, name: state.students[email] || '', status: st.status, ...(st.percentDone !== undefined ? { percentDone: st.percentDone, lastMode: st.lastMode } : {}), ...(st.submittedAt ? { submittedAt: st.submittedAt, late: st.late } : {}) };
        });
        return { result: 'success', assignment: a, rows };
      }
      case 'postStream': {
        if (b.id) {
          const p = state.stream.find((x) => x.id === b.id);
          if (!p) return { result: 'error', error: 'not_found' };
          if (b.pinned !== undefined) p.pinned = !!b.pinned;
          return { result: 'success', post: p };
        }
        const post = { id: nextId('post'), classId: b.classId, type: 'post', body: b.body, pinned: false, createdAt: iso(state.now()), createdBy: 'teacher' };
        state.stream.push(post);
        return { result: 'success', post };
      }
      case 'listStream': return { result: 'success', posts: state.stream.filter((p) => p.classId === b.classId).sort((x, y) => ms(y.createdAt) - ms(x.createdAt)) };
      default: return null; // anything else: the session's default success reply
    }
  }
  return { state, handle, hubFor, attach(session) { session.onGas = handle; return session; } };
}
