// PWA files: the precache list is generated, the manifest points at real files, every URL is relative, and the
// page policy lets the worker and manifest load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildSwList } from '../../scripts/build-sw-list.mjs';
import { canRegister } from '../../js/lib/sw-register.js';
import { SITE_VERSION } from '../../js/version.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('sw-list.js is up to date (run npm run build:sw-list)', async () => {
  assert.equal(read('sw-list.js'), await buildSwList());
});

test('the precache list carries the site version and only existing, relative files', async () => {
  const list = read('sw-list.js');
  assert.ok(list.includes(`"version": "${SITE_VERSION}"`));
  const { files } = JSON.parse(list.slice(list.indexOf('{'), list.lastIndexOf('}') + 1));
  assert.ok(files.includes('index.html') && files.includes('css/base.css') && files.includes('js/app.js'));
  for (const f of files) {
    assert.ok(!f.startsWith('/') && !/^https?:/.test(f), `${f} is relative`);
    assert.ok(existsSync(new URL(`../../${f}`, import.meta.url)), `${f} exists`);
  }
  assert.ok(!files.some((f) => f.startsWith('data/') || f.startsWith('changelog/')), 'tests and changelog are network-first');
});

test('sw.js names its cache after the version, skips Apps Script and Google, and has no absolute paths', () => {
  const sw = read('sw.js');
  assert.match(sw, /cw-shell-\$\{version\}/);
  assert.match(sw, /Apps Script, Google sign-in and everything else go straight to the network/);
  assert.ok(!/['"`]\/[A-Za-z]/.test(sw.replace(/\/\/.*$/gm, '')), 'no root-absolute URLs');
});

test('manifest has relative start_url and scope, and its icons exist', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.ok(m.name && m.short_name && m.icons.length >= 2);
  for (const i of m.icons) assert.ok(existsSync(new URL(`../../${i.src}`, import.meta.url)), `${i.src} exists`);
  assert.ok(m.icons.some((i) => i.sizes === '512x512'));
});

test('index.html links the manifest, registers from a module and allows the worker in the CSP', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /<script type="module" src="js\/lib\/sw-register\.js\?v=/);
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /worker-src 'self'/);
  assert.match(csp, /manifest-src 'self'/);
});

test('the Pages workflow publishes the worker, its list and the manifest', () => {
  const y = read('.github/workflows/pages.yml');
  for (const f of ['sw.js', 'sw-list.js', 'manifest.webmanifest']) assert.ok(y.includes(f), f);
});

test('canRegister needs https or localhost and service worker support', () => {
  const nav = { serviceWorker: {} };
  assert.equal(canRegister(nav, { protocol: 'https:', hostname: 'x.github.io' }), true);
  assert.equal(canRegister(nav, { protocol: 'http:', hostname: '127.0.0.1' }), true);
  assert.equal(canRegister(nav, { protocol: 'http:', hostname: 'example.org' }), false);
  assert.equal(canRegister({}, { protocol: 'https:', hostname: 'x.github.io' }), false);
});
