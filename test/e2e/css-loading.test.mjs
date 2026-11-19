// Stylesheets load by view: the landing page asks for at most three of the site's own stylesheets, a view brings its
// own sheets when it opens, and every sheet is requested once with ?v=<SITE_VERSION>.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startEnv, newSession, tid, signIn, unlockAdmin } from './helpers.mjs';
import { SITE_VERSION } from '../../js/version.js';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env.close(); });

/** Records the site's own stylesheet requests as file names ("runner.css") with their query strings. */
function recordSheets(page, origin) {
  const seen = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.origin === origin && req.resourceType() === 'stylesheet') seen.push({ name: u.pathname.split('/').pop(), search: u.search });
  });
  return seen;
}

test('the landing page requests at most three of its own stylesheets', { timeout: 15000 }, async () => {
  const s = await newSession(env);
  try {
    const sheets = recordSheets(s.page, new URL(env.url).origin);
    await s.page.goto(`${s.url}/`);
    await s.page.locator(tid('demo-signin')).waitFor({ timeout: 5000 });
    const names = sheets.map((x) => x.name);
    assert.ok(names.length <= 3, `landing loaded ${names.length} stylesheets: ${names.join(', ')}`);
    assert.ok(names.includes('base.css') && names.includes('landing.css'), `base.css and landing.css expected, got ${names.join(', ')}`);
    assert.ok(!names.some((n) => n.startsWith('qt-') || n === 'runner.css' || n === 'admin.css'), `no view sheets on the landing page: ${names.join(', ')}`);
    for (const x of sheets) assert.equal(x.search, `?v=${SITE_VERSION}`, `${x.name} carries the site version`);
    assert.deepEqual(s.errors, []);
  } finally {
    await s.close();
  }
});

test('the runner brings its own sheets and the sheet of each question type it shows', { timeout: 20000 }, async () => {
  const s = await newSession(env);
  try {
    s.serveTest('DEMOV5', JSON.parse(fs.readFileSync('data/tests/DEMOV5.json', 'utf8')));
    const sheets = recordSheets(s.page, new URL(env.url).origin);
    await s.page.goto(`${s.url}/?code=DEMOV5`);
    await signIn(s.page);
    await s.page.locator(tid('runner')).waitFor({ timeout: 5000 });
    const names = sheets.map((x) => x.name);
    for (const want of ['runner.css', 'tools.css', 'qtypes.css', 'qt-bohr.css']) assert.ok(names.includes(want), `${want} requested, got ${names.join(', ')}`);
    assert.equal(new Set(names).size, names.length, `each sheet is requested once: ${names.join(', ')}`);
    for (const x of sheets) assert.equal(x.search, `?v=${SITE_VERSION}`, `${x.name} carries the site version`);
    assert.equal(await s.page.locator('link[rel="stylesheet"][data-css="runner"]').count(), 1);
    const barHeight = await s.page.locator('.runner-bar').evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(barHeight > 20, 'runner chrome is styled (the sheet loaded before the first render)');
    assert.deepEqual(s.errors, []);
  } finally {
    await s.close();
  }
});

test('the admin panel loads its sheets once, including admin-shell.css', { timeout: 20000 }, async () => {
  const s = await newSession(env);
  try {
    const sheets = recordSheets(s.page, new URL(env.url).origin);
    await unlockAdmin(s.page, s.url);
    const names = sheets.map((x) => x.name);
    for (const want of ['admin-shell.css', 'admin.css']) assert.ok(names.includes(want), `${want} requested, got ${names.join(', ')}`);
    assert.equal(names.filter((n) => n === 'admin-shell.css').length, 1, 'admin-shell.css is requested once');
    assert.deepEqual(s.errors, []);
  } finally {
    await s.close();
  }
});
