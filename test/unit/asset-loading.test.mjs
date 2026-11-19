// Stylesheet loading by view, versioned URLs in index.html, the boot loader copy, and the split of the two big view files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { SITE_VERSION } from '../../js/version.js';
import { flaskSvg } from '../../js/ui.js';
import { QT_SHEETS, typeCssNames } from '../../js/lib/qtypes/registry.js';
import { stampHtml, localUrls } from '../../scripts/stamp-version.mjs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html');
const cssFiles = readdirSync(new URL('css/', root)).filter((f) => f.endsWith('.css')).map((f) => f.replace(/\.css$/, ''));

function walk(dir, out = []) {
  for (const e of readdirSync(new URL(dir, root), { withFileTypes: true })) {
    if (e.isDirectory()) walk(`${dir}${e.name}/`, out);
    else if (e.name.endsWith('.js')) out.push(`${dir}${e.name}`);
  }
  return out;
}

/* ---------------------------------------------------------------- index.html */

test('index.html links only base.css and landing.css from css/', () => {
  const sheets = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="(css\/[^"?]+)/g)].map((m) => m[1]);
  assert.deepEqual(sheets, ['css/base.css', 'css/landing.css']);
});

test('every local css and js URL in index.html carries ?v=SITE_VERSION (run npm run stamp:version after a bump)', () => {
  const urls = localUrls(html);
  assert.ok(urls.length >= 4, 'base.css, landing.css, theme-boot.js and app.js');
  for (const [url, version] of urls) assert.equal(version, SITE_VERSION, `${url} should end in ?v=${SITE_VERSION}`);
  assert.equal(stampHtml(html), html, 'index.html is already stamped');
});

test('stampHtml adds, replaces and leaves external URLs alone', () => {
  const out = stampHtml('<link href="css/a.css"><script src="js/b.js?v=1.0.0"></script><link href="https://x.test/c.css"><img src="a.png">', '9.9.9');
  assert.equal(out, '<link href="css/a.css?v=9.9.9"><script src="js/b.js?v=9.9.9"></script><link href="https://x.test/c.css"><img src="a.png">');
});

test('the boot loader in index.html is the same markup as flaskSvg()', () => {
  const m = /<span class="cw-loader__art">([\s\S]*?)<\/span>/.exec(html);
  assert.ok(m, 'boot loader markup in index.html');
  const normalise = (svg) => svg.replace(/\bcwl\d+\b/g, 'ID').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
  assert.equal(normalise(m[1]), normalise(flaskSvg(96)));
});

/* ---------------------------------------------------------------- views and sheets */

test('every top-level view lists the stylesheets it needs, and each one exists', async () => {
  const views = ['landing', 'runner/index', 'results', 'feedback', 'submitted', 'unavailable', 'game', 'admin', 'profile', 'class'];
  for (const v of views) {
    const { styles } = await import(`../../js/views/${v}.js`);
    assert.ok(styles, `${v} exports styles`);
    if (typeof styles === 'function') continue; // landing: the home screen's list for a signed-in student
    assert.ok(Array.isArray(styles) && styles.length, `${v} styles is a list`);
    for (const name of styles) assert.ok(cssFiles.includes(name), `${v}: css/${name}.css does not exist`);
  }
  const home = await import('../../js/views/home/index.js');
  for (const name of home.styles) assert.ok(cssFiles.includes(name), `home: css/${name}.css does not exist`);
});

test('every stylesheet except base and landing is loaded by something', () => {
  const named = new Set(QT_SHEETS.map((t) => `qt-${t}`));
  for (const f of walk('js/')) {
    const src = read(f);
    for (const m of src.matchAll(/styles\s*=\s*\[([^\]]*)\]/g)) for (const n of m[1].matchAll(/'([\w-]+)'/g)) named.add(n[1]);
    for (const m of src.matchAll(/ensureCss\('([\w-]+)'/g)) named.add(m[1]);
  }
  for (const css of cssFiles.filter((n) => !['base', 'landing'].includes(n))) assert.ok(named.has(css), `css/${css}.css is never loaded`);
});

test('QT_SHEETS matches the css/qt-*.css files', () => {
  const files = cssFiles.filter((n) => n.startsWith('qt-')).map((n) => n.slice(3)).sort();
  assert.deepEqual([...QT_SHEETS].sort(), files);
});

test('typeCssNames: shared sheets, the type sheet, and diagrams for the drawing types', () => {
  assert.deepEqual(typeCssNames('truefalse'), ['runner', 'qtypes', 'qt-truefalse']);
  assert.deepEqual(typeCssNames('mcq'), ['runner', 'qtypes']);
  assert.ok(typeCssNames('lewis').includes('diagrams'));
  assert.ok(typeCssNames('orbital').includes('diagrams'));
});

test('no view links a stylesheet by hand any more', () => {
  for (const f of walk('js/views/')) assert.doesNotMatch(read(f), /createElement\('link'\)|ensureToolsCss/, `${f} should use ensureCss`);
});

/* ---------------------------------------------------------------- split files */

/** Lines of each function or arrow function that starts at the left margin of a file. */
function topLevelFunctions(src) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{$/.exec(lines[i]);
    if (!m) continue;
    let end = i;
    if (/\{\s*$/.test(lines[i])) while (end < lines.length && !/^\};?$/.test(lines[end])) end++;
    out.push({ name: m[1] || m[2], lines: end - i + 1 });
  }
  return out;
}

test('the runner and builder are split into modules with no closure over 250 lines', () => {
  for (const f of [...walk('js/views/runner/'), ...walk('js/views/admin/builder/')]) {
    for (const fn of topLevelFunctions(read(f))) assert.ok(fn.lines <= 250, `${f}: ${fn.name} is ${fn.lines} lines`);
  }
});

test('the runner and builder keep their parts in the planned modules', () => {
  for (const n of ['index', 'timer', 'drawer', 'nav', 'submit', 'shortcuts', 'live']) assert.ok(existsSync(new URL(`js/views/runner/${n}.js`, root)), `runner/${n}.js`);
  for (const n of ['index', 'settings', 'questions', 'import', 'publish', 'preview']) assert.ok(existsSync(new URL(`js/views/admin/builder/${n}.js`, root)), `builder/${n}.js`);
});

test('the old runner.js and builder.js files are gone and nothing imports them', () => {
  assert.equal(existsSync(new URL('js/views/runner.js', root)), false);
  assert.equal(existsSync(new URL('js/views/admin/builder.js', root)), false);
  for (const f of walk('js/')) assert.doesNotMatch(read(f), /from '[^']*\/(?:runner|builder)\.js'/, `${f} imports a removed file`);
});

test('the three formula span copies are replaced by formulaSpan in ui.js', () => {
  for (const f of ['js/views/results.js', 'js/views/qtypes/naming.js', 'js/views/admin/export-view.js', 'js/views/qtypes/formula.js']) {
    const src = read(f);
    assert.match(src, /formulaSpan/, `${f} uses formulaSpan`);
    assert.doesNotMatch(src, /formulaToHTML/, `${f} no longer builds the span itself`);
  }
  assert.match(read('js/ui.js'), /export function formulaSpan\(/);
});
