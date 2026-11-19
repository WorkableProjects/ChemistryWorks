// ensureCss: one <link> per sheet, versioned URL, idempotent, never rejects, and the "already loaded" check views use.
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SITE_VERSION } from '../../js/version.js';

let seq = 0;
/** A fresh copy of the loader (its tracking maps are module state) and a stand-in document. */
async function setup() {
  const links = [];
  const makeLink = () => {
    const handlers = {};
    return { dataset: {}, addEventListener: (type, fn) => { handlers[type] = fn; }, fire: (type) => handlers[type]?.() };
  };
  globalThis.document = {
    head: { appendChild: (l) => { links.push(l); }, querySelectorAll: () => links },
    createElement: (tag) => { assert.equal(tag, 'link'); return makeLink(); },
  };
  const loader = await import(`../../js/lib/css-loader.js?case=${++seq}`);
  return { links, ...loader };
}
afterEach(() => { delete globalThis.document; mock.timers.reset(); });

test('cssUrl is relative to the module and ends in ?v=SITE_VERSION', async () => {
  const { cssUrl } = await setup();
  const url = new URL(cssUrl('hub'));
  assert.ok(url.pathname.endsWith('/css/hub.css'), url.pathname);
  assert.equal(url.search, `?v=${SITE_VERSION}`);
});

test('ensureCss adds one link and returns the same promise for the same name', async () => {
  const { links, ensureCss } = await setup();
  const a = ensureCss('hub');
  const b = ensureCss('hub');
  assert.equal(a, b);
  assert.equal(links.length, 1);
  assert.equal(links[0].rel, 'stylesheet');
  assert.equal(links[0].dataset.css, 'hub');
  assert.match(links[0].href, /\/css\/hub\.css\?v=/);
  links[0].fire('load');
  await a;
  ensureCss('hub');
  assert.equal(links.length, 1, 'no second link after the first loaded');
});

test('ensureCss skips a sheet whose link is already in the page', async () => {
  const { links, ensureCss } = await setup();
  links.push({ dataset: { css: 'base' } });
  await ensureCss('base');
  assert.equal(links.length, 1);
});

test('ensureCss resolves, never rejects, when the sheet fails to load', async () => {
  const { links, ensureCss } = await setup();
  const p = ensureCss('missing');
  links[0].fire('error');
  assert.equal(await p, undefined);
});

test('ensureCss resolves after 3 seconds when the sheet never answers', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { ensureCss } = await setup();
  let done = false;
  const p = ensureCss('slow').then(() => { done = true; });
  mock.timers.tick(2999);
  await Promise.resolve();
  assert.equal(done, false);
  mock.timers.tick(1);
  await p;
  assert.equal(done, true);
});

test('media is set on the link when asked for', async () => {
  const { links, ensureCss } = await setup();
  ensureCss('print', { media: 'print' });
  assert.equal(links[0].media, 'print');
});

test('pendingCss is a promise until every sheet settled, then null', async () => {
  const { links, ensureCss, pendingCss } = await setup();
  const p = pendingCss(['a', 'b', 'a']);
  assert.ok(p instanceof Promise);
  assert.equal(links.length, 2, 'duplicates in the list are linked once');
  links.forEach((l) => l.fire('load'));
  await p;
  assert.equal(pendingCss(['a', 'b']), null);
  assert.equal(await ensureCss('a'), undefined);
});

test('without a document ensureCss resolves and pendingCss settles', async () => {
  delete globalThis.document;
  const { ensureCss, pendingCss } = await import(`../../js/lib/css-loader.js?case=${++seq}`);
  await ensureCss('hub');
  await pendingCss(['hub', 'home']);
  assert.equal(pendingCss(['hub', 'home']), null);
});
