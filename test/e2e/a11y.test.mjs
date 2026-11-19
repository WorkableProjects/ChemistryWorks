// Accessibility (WCAG 2.1 AA): view announcements and focus, keyboard-only answers for every drag or pointer widget,
// and an axe-core pass over the main views in light and dark at 360 px and 1366 px. Serious and critical issues fail.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  startEnv, newSession, withSession, startTest, tid, poll, waitText, signIn, signInStudentAs, unlockAdmin, withAdminKey, createMockBackend,
  answerCHEM101, submit, activeCard, goNext, STUDENT,
} from './helpers.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

const requireFromHere = createRequire(import.meta.url);
const AXE_SOURCE = fs.readFileSync(requireFromHere.resolve('axe-core/axe.min.js'), 'utf8');
const opts = (...texts) => texts.map((t, i) => ({ id: String.fromCharCode(97 + i), text: t }));
const single = (code, q) => ({ code, title: `A11y ${code}`, description: '', timeLimitMinutes: null, questions: [q] });

/* ---------------------------------------------------------------- view announcement and focus */

test('the app root is not a live region; each view is announced and focus moves to its heading', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await page.goto(s.url + '/');
  await page.locator(tid('view-announcer')).waitFor({ state: 'attached' });
  assert.equal(await page.locator('#app[aria-live]').count(), 0, '#app has no aria-live');
  const live = page.locator(tid('view-announcer'));
  assert.equal(await live.getAttribute('aria-live'), 'polite');
  await poll(async () => (await live.textContent()).trim().length > 0, { message: 'landing announced' });

  await signIn(page);
  await page.locator(tid('home')).waitFor();
  await poll(async () => (await live.textContent()).trim().length > 0, { message: 'home announced' });

  s.serveTest('A11YRUN', single('A11YRUN', { id: 'q1', type: 'mcq', text: 'Pick B', points: 1, options: opts('A', 'B'), correctAnswer: 'b' }));
  await page.locator(tid('home-code-input')).fill('A11YRUN');
  await page.locator(tid('home-code-submit')).click();
  await page.locator(tid('runner')).waitFor();
  await poll(async () => /^Test: A11y A11YRUN, 1 question$/.test((await live.textContent()).trim()), { message: 'runner announces title and count' });
  const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, tabindex: document.activeElement?.getAttribute('tabindex'), text: document.activeElement?.textContent }));
  assert.equal(focus.tabindex, '-1', 'focus is on the view title');
  assert.match(focus.text, /A11y A11YRUN/);
}));

/* ---------------------------------------------------------------- keyboard-only answers */

const press = (page, key, n = 1) => (async () => { for (let i = 0; i < n; i++) await page.keyboard.press(key); })();
async function open(s, code, q) {
  s.serveTest(code, single(code, q));
  await startTest(s, code);
}

test('categorize: choose a group from the keyboard', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await open(s, 'KCAT', { id: 'c1', type: 'categorize', text: 'Sort.', points: 2,
    categories: [{ id: 'acid', label: 'Acids' }, { id: 'base', label: 'Bases' }],
    items: [{ id: 'i1', text: 'HCl' }, { id: 'i2', text: 'NaOH' }], correctAnswer: { i1: 'acid', i2: 'base' } });
  await page.locator(tid('cat-select-i1')).focus();
  await press(page, 'ArrowDown');
  await page.locator(`${tid('cat-bin-acid')} ${tid('cat-item-i1')}`).waitFor();
  await waitText(page.locator(tid('cat-status')), /HCl placed in Acids/);
  await page.locator(tid('cat-select-i2')).focus();
  await press(page, 'ArrowDown', 2);
  await page.locator(`${tid('cat-bin-base')} ${tid('cat-item-i2')}`).waitFor();
}));

test('ordering: move an item with Enter on its arrow button', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await open(s, 'KORD', { id: 'o1', type: 'ordering', text: 'Order.', points: 2, items: [{ id: 'x', text: 'One' }, { id: 'y', text: 'Two' }, { id: 'z', text: 'Three' }], correctAnswer: ['x', 'y', 'z'] });
  const ids = () => page.locator('.q-order__item').evaluateAll((els) => els.map((e) => e.dataset.item));
  const first = (await ids())[0];
  await page.locator(tid(`ordering-down-${first}`)).focus();
  await press(page, 'Enter');
  await poll(async () => (await ids())[1] === first, { message: 'item moved down' });
  assert.match(await page.locator('.q-order .sr-only[aria-live]').textContent(), /moved to position 2 of 3/);
  assert.equal(await page.evaluate(() => document.activeElement?.className.includes('q-order__btn')), true, 'focus stays on a move button');
  await press(page, 'Enter');
  await poll(async () => (await ids())[2] === first, { message: 'item moved down again' });
}));

test('matching: pick an option with the arrow keys', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await open(s, 'KMAT', { id: 'm1', type: 'matching', text: 'Match.', points: 2, left: opts('Na', 'K'), right: opts('Sodium', 'Potassium'), correctAnswer: { a: 'a', b: 'b' } });
  await page.locator(tid('match-a-a')).focus();
  await press(page, 'Space');
  assert.equal(await page.locator(tid('match-a-a')).isChecked(), true);
  await page.locator(tid('match-b-a')).focus();
  await press(page, 'ArrowDown'); // radios in a row share a name: arrows move within the row
  await press(page, 'ArrowRight');
  assert.equal(await page.locator(tid('match-b-b')).isChecked(), true);
}));

test('hotspot: pick a label, move the crosshair with the arrows, place with Enter', () => withSession(env, {}, async (s) => {
  const { page } = s;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#cde"/></svg>';
  await page.route('https://img.example.test/k.svg', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }));
  await open(s, 'KHOT', { id: 'h1', type: 'hotspot', text: 'Label.', points: 1, radius: 0.1, image: { url: 'https://img.example.test/k.svg', alt: 'A blue rectangle' },
    labels: [{ id: 'a', text: 'Centre', x: 0.5, y: 0.5 }] });
  await page.locator(tid('hotspot-label-a')).focus();
  await press(page, 'Enter'); // pick up: focus moves to the picture
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.testid), 'hotspot-stage');
  await press(page, 'ArrowRight', 2);
  await waitText(page.locator(tid('hotspot-status')), /Crosshair at/);
  await press(page, 'Enter');
  await page.locator(tid('hotspot-pin-a')).waitFor({ state: 'visible' });
}));

test('molbuild: pick two atoms with Enter to bond them', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await open(s, 'KMOL', { id: 'mb', type: 'molbuild', text: 'Build water.', points: 2, atoms: ['O', 'H', 'H'], bonds: [[0, 1, 1], [0, 2, 1]] });
  for (const sym of ['O', 'H']) { await page.locator(tid(`molbuild-add-${sym}`)).focus(); await press(page, 'Enter'); }
  await page.locator(tid('molbuild-atom-0')).focus();
  await press(page, 'Enter');
  await waitText(page.locator(tid('molbuild-status')), /picked up/);
  await page.locator(tid('molbuild-atom-1')).focus();
  await press(page, 'Enter');
  await waitText(page.locator(tid('molbuild-status')), /single bond/);
  assert.equal(await page.locator('.qm-bond').count(), 1);
}));

test('ionicformula: place ions with Enter on their tiles', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await open(s, 'KION', { id: 'ion', type: 'ionicformula', text: 'Build sodium chloride.', points: 1,
    ions: [{ id: 'Na+', symbol: 'Na', charge: 1, name: 'sodium' }, { id: 'Cl-', symbol: 'Cl', charge: -1, name: 'chloride' }], cation: 'Na+', anion: 'Cl-' });
  await page.locator(tid('ionicformula-cation-Na+')).focus();
  await press(page, 'Enter');
  await page.locator(tid('ionicformula-anion-Cl-')).focus();
  await press(page, 'Enter');
  await poll(async () => /NaCl/.test((await page.locator(tid('ionicformula-formula')).textContent()).replace(/\s/g, '')), { message: 'formula shown' });
}));

test('bohr: add electrons to a shell with Enter', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await open(s, 'KBOH', { id: 'b', type: 'bohr', text: 'Draw.', points: 1, mode: 'element', element: 'He' });
  await page.locator(tid('bohr-shell-1-inc')).focus();
  await press(page, 'Enter', 2);
  await waitText(page.locator(tid('bohr-shell-1')), '2');
  await waitText(page.locator(tid('bohr-total')), /Placed: 2/);
}));

test('graph plotting: move the crosshair with the arrows and add a point with Enter', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await open(s, 'KGRA', { id: 'g', type: 'graph', mode: 'plot', text: 'Plot.', points: 1, targets: [[5, 50]], toleranceX: 1, toleranceY: 10,
    chart: { xMin: 0, xMax: 10, yMin: 0, yMax: 100, xLabel: 'Time', yLabel: 'Temperature', series: [] } });
  await page.locator(tid('graph-plot')).focus();
  await press(page, 'ArrowRight', 3);
  await waitText(page.locator(tid('graph-status')), /Crosshair at/);
  await press(page, 'Enter');
  await waitText(page.locator(tid('graph-count')), /^1 placed/);
}));

test('structure: add bond lines and lone pairs from the keyboard', () => withSession(env, {}, async (s) => {
  const { page } = s;
  await open(s, 'KSTR', { id: 'st', type: 'structure', text: 'Draw CO2.', points: 3, showElectronCount: true,
    atoms: [{ id: 'o1', symbol: 'O', x: 0, y: 0 }, { id: 'c', symbol: 'C', x: 1, y: 0 }, { id: 'o2', symbol: 'O', x: 2, y: 0 }],
    bonds: [['o1', 'c'], ['c', 'o2']], correctAnswer: { bonds: [2, 2], lonePairs: { o1: 2, c: 0, o2: 2 } } });
  const count = page.locator(tid('structure-count'));
  const before0 = (await count.textContent()).trim();
  await page.locator(tid('structure-bond-0')).focus();
  await press(page, 'Enter', 2);
  await page.locator(tid('structure-atom-o1')).focus();
  await press(page, 'Enter', 2);
  await poll(async () => (await count.textContent()).trim() !== before0, { message: 'electron count changed by keyboard' });
  assert.match(await page.locator(tid('structure-bond-0')).getAttribute('aria-label'), /^Bond between O and C/);
}));

/* ---------------------------------------------------------------- axe-core */

const THEMES = ['light', 'dark'];
const WIDTHS = [360, 1366];
const MODE_IDS = ['classic', 'lightning', 'survival', 'flashcards', 'mistakes', 'tower', 'boss', 'matchup', 'quizshow', 'race', 'bingo'];
const MODES_CODE = 'A11YMODES';
const modesTest = () => ({
  code: MODES_CODE, title: 'Every mode', description: '', timeLimitMinutes: null, gameMode: true, showResults: true, showCorrectAnswers: true,
  questions: ['m1', 'm2', 'm3', 'm4', 'm5'].map((id, i) => ({ id, type: 'mcq', text: `Question ${i + 1}`, points: 1, options: opts(`Yes ${i}`, `No ${i}`), correctAnswer: 'a', explanation: 'Because.' })),
});

/** Run axe on the page as it is; returns the serious and critical violations as readable lines. */
async function scan(page, label) {
  await page.evaluate(AXE_SOURCE);
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  });
  return res.map((v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.join(' | ')}`);
}

function classBackend() {
  return createMockBackend({
    classes: [{ id: 'c1', name: 'Period 3 Chemistry', period: '3', emails: [STUDENT.email, 'ben@example.org'] }],
    tests: [{ code: 'CHEM101', title: 'Atoms' }], students: { [STUDENT.email]: STUDENT.name, 'ben@example.org': 'Ben Okafor' },
  });
}

async function scenes(theme, width) {
  const problems = [];
  const at = `${theme} ${width}px`;
  const check = async (page, name) => { problems.push(...await scan(page, `${at} ${name}`)); };
  const run = async (name, fn) => {
    try { await fn(); } catch (e) { problems.push(`${at} ${name}: could not reach this view (${e.message.split('\n')[0]})`); }
  };
  const session = async (extra = {}) => {
    const s = await newSession(env, { viewport: { width, height: 900 }, ...extra });
    await s.context.addInitScript((t) => { try { localStorage.setItem('cw:theme', JSON.stringify(t)); } catch { /* ignore */ } }, theme);
    return s;
  };

  // student: landing, home, profile, runner, results, feedback
  {
    const s = await session();
    try {
      s.serveTest('DEMOV5', JSON.parse(fs.readFileSync('data/tests/DEMOV5.json', 'utf8')));
      await run('landing', async () => { await s.page.goto(s.url + '/'); await s.page.locator(tid('demo-name')).waitFor(); await check(s.page, 'landing'); });
      await run('home', async () => { await signIn(s.page); await s.page.locator(tid('home')).waitFor(); await check(s.page, 'home'); });
      await run('profile', async () => { await s.page.goto(s.url + '/?view=profile'); await s.page.locator(tid('profile')).waitFor(); await check(s.page, 'profile'); });
      await run('runner DEMOV5', async () => {
        await s.page.goto(s.url + '/?code=DEMOV5');
        await s.page.locator(tid('runner')).waitFor();
        await activeCard(s.page).first().waitFor();
        await check(s.page, 'runner DEMOV5 first question');
        for (let i = 0; i < 8; i++) { await goNext(s.page); await check(s.page, `runner DEMOV5 question ${i + 2}`); }
      });
    } finally { await s.close(); }
  }
  {
    const s = await session();
    try {
      await run('results and feedback', async () => {
        await startTest(s, 'CHEM101');
        await answerCHEM101(s.page);
        await submit(s.page);
        await check(s.page, 'results');
        const sub = s.gas.find((b) => b.submission_id);
        await s.page.locator(tid('home-btn')).first().click();
        await s.page.locator(tid('home')).waitFor();
        s.onGas = (b) => (b.action === 'getFeedback' ? { result: 'success', released: true, released_at: '2026-03-01T10:00:00Z', status: 'Graded', final_score: 3, score_total: sub.score_total, final_percentage: 50, grades: {}, comments: {} } : null);
        await s.page.evaluate(async ({ email, sub }) => {
          const { getUser } = await import('/js/lib/auth.js');
          Object.assign(getUser(), { provider: 'google', idToken: 'test-token', idTokenExp: Math.floor(Date.now() / 1000) + 3600 });
          const key = `cw:profile:${email}`;
          const rec = JSON.parse(localStorage.getItem(key) || '{}');
          rec.server = { profile: {}, attempts: [], assigned: [], hub: null, results: [{ testCode: sub.test_code, title: sub.test_title, submittedAt: sub.submitted_at, released: true, status: 'released', percentage: 50, scoreAchieved: 3, scoreTotal: sub.score_total }] };
          localStorage.setItem(key, JSON.stringify(rec));
        }, { email: STUDENT.email.toLowerCase(), sub });
        await s.page.reload();
        await s.page.locator(tid('home')).waitFor();
        await s.page.evaluate(async () => {
          const { getUser } = await import('/js/lib/auth.js');
          Object.assign(getUser(), { provider: 'google', idToken: 'test-token', idTokenExp: Math.floor(Date.now() / 1000) + 3600 });
        });
        await s.page.locator('[data-testid^="view-feedback-"]').first().click();
        await s.page.locator(tid('feedback')).waitFor();
        await s.page.locator(tid('feedback-released')).waitFor();
        await check(s.page, 'feedback');
      });
    } finally { await s.close(); }
  }

  // student with a class: class page and notifications
  {
    const s = await session();
    try {
      const be = classBackend();
      be.attach(s);
      await signInStudentAs(s);
      be.state.assignments.push({ id: 'asg1', classId: 'c1', testCode: 'CHEM101', title: 'Atoms', instructions: '', opensAt: '', dueAt: new Date(Date.now() + 86400000).toISOString(), lateAllowed: true, required: false, modes: [], publishAt: '', createdBy: 'teacher', createdAt: new Date().toISOString() });
      await run('home with a class and notifications', async () => {
        await s.page.goto(s.url + '/');
        await s.page.locator(tid('bell')).waitFor();
        await s.page.locator(tid('bell')).click();
        await s.page.locator(tid('bell-panel')).waitFor({ state: 'visible' });
        await check(s.page, 'notifications');
        await s.page.locator(tid('bell')).click();
      });
      await run('class page', async () => {
        await s.page.locator(tid('class-link-c1')).click();
        await s.page.locator(tid('class-page')).waitFor();
        await check(s.page, 'class page');
      });
    } finally { await s.close(); }
  }

  // game modes
  {
    const s = await session();
    try {
      s.serveTest(MODES_CODE, modesTest());
      await startTest(s, MODES_CODE);
      for (const id of MODE_IDS) {
        await run(`mode ${id}`, async () => {
          await s.page.locator(tid(`mode-option-${id}`)).click();
          await s.page.locator(`${tid('mode-shell')}[data-mode="${id}"]`).waitFor();
          await s.page.waitForTimeout(400);
          await check(s.page, `mode ${id}`);
          await s.page.locator(tid('mode-option-study')).click();
          await s.page.locator(tid('runner')).waitFor();
        });
      }
    } finally { await s.close(); }
  }

  // admin
  {
    const s = await session();
    try {
      const be = classBackend();
      be.attach(s);
      be.state.assignments.push({ id: 'asg1', classId: 'c1', testCode: 'CHEM101', title: 'Atoms', instructions: '', opensAt: '', dueAt: new Date(Date.now() + 86400000).toISOString(), lateAllowed: true, required: false, modes: [], publishAt: '', createdBy: 'teacher', createdAt: new Date().toISOString() });
      await withAdminKey(s);
      const phone = width < 768;
      const goTab = async (id) => {
        if (phone) {
          await s.page.locator(tid('admin-nav-toggle')).click();
          await s.page.waitForFunction(() => document.querySelector('[data-testid="admin-sidebar"]')?.inert === false);
          await s.page.waitForTimeout(350);
          await check(s.page, `sidebar drawer (${id})`);
        }
        await s.page.locator(tid(`tab-${id}`)).click({ force: phone });
      };
      await run('admin dashboard', async () => { await unlockAdmin(s.page, s.url, { dashboard: true }); await s.page.locator(tid('dashboard')).waitFor(); await check(s.page, 'admin dashboard'); });
      await run('admin library', async () => { await goTab('library'); await s.page.locator(tid('library-sections')).first().waitFor(); await check(s.page, 'admin library'); });
      await run('admin builder', async () => { await goTab('builder'); await s.page.waitForTimeout(400); await check(s.page, 'admin builder'); });
      await run('admin grading', async () => { await goTab('grading'); await s.page.waitForTimeout(400); await check(s.page, 'admin grading'); });
      await run('admin hub tracker', async () => {
        await goTab('classes');
        await s.page.locator(tid('class-open-c1')).click();
        await s.page.locator(tid('class-tab-assignments')).click();
        await s.page.locator('[data-testid^="assignment-"]').first().waitFor();
        await check(s.page, 'admin class assignments');
        const open = s.page.locator('[data-testid^="assignment-open-"], [data-testid^="assignment-row-"]').first();
        if (await open.count()) { await open.click(); await s.page.locator(tid('tracker')).waitFor(); await check(s.page, 'admin tracker'); }
        const stu = s.page.locator('[data-testid^="tracker-student-"]').first();
        if (await stu.count()) { await stu.click(); await s.page.locator(tid('student-view')).waitFor(); await s.page.waitForTimeout(300); await check(s.page, 'admin student view'); }
      });
      await run('admin tags', async () => {
        if (!await s.page.locator(tid('tab-tags')).count()) return;
        await goTab('tags'); await s.page.waitForTimeout(300); await check(s.page, 'admin tags');
      });
      await run('admin settings and appearance', async () => {
        await goTab('settings');
        await s.page.locator(tid('admin-appearance')).waitFor();
        await check(s.page, 'admin settings and appearance');
      });
      if (!phone) {
        await run('admin sidebar collapsed', async () => {
          await s.page.locator(tid('admin-nav-toggle')).click();
          await s.page.waitForTimeout(350);
          await check(s.page, 'admin sidebar collapsed');
        });
      }
    } finally { await s.close(); }
  }
  return problems;
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`axe: no serious or critical issues, ${theme}, ${width}px`, { timeout: 240000 }, async () => {
      const problems = await scenes(theme, width);
      assert.deepEqual(problems, []);
    });
  }
}
