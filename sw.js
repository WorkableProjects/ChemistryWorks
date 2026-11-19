// ChemistryWorks service worker: the app shell works offline, tests and the changelog stay fresh when online.
//  - Shell (sw-list.js): precached in a cache named for SITE_VERSION and served cache-first, so one version's files
//    never mix with another's. A new version waits until the student chooses to reload.
//  - Everything else on this site (tests, catalog, changelog, config): network-first with a cache fallback.
//  - Fonts and KaTeX from their CDNs: cached after first use.
//  - Apps Script and Google requests are never touched.
// Every URL is relative to the worker's scope, because Pages serves the site under /ChemistryWorks/.
importScripts('sw-list.js');

const { version, files } = self.CW_SW;
const SHELL_CACHE = `cw-shell-${version}`;
const DATA_CACHE = 'cw-data';
const EXTERNAL_CACHE = 'cw-external';
const EXTERNAL_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

const scope = new URL(self.registration.scope);
const shellUrls = files.map((f) => new URL(f, scope).href);
const shellSet = new Set(shellUrls);
const indexUrl = new URL('index.html', scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // no-cache so the precache never stores a stale copy from the browser's HTTP cache.
    await cache.addAll(shellUrls.map((u) => new Request(u, { cache: 'no-cache' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('cw-shell-') && name !== SHELL_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

// The page asks a waiting worker to take over only after the student presses Reload.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirstExternal(request) {
  const cache = await caches.open(EXTERNAL_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin !== scope.origin) {
    if (EXTERNAL_HOSTS.includes(url.hostname)) event.respondWith(cacheFirstExternal(request));
    return; // Apps Script, Google sign-in and everything else go straight to the network
  }

  // Page loads (/, /?code=ABC, /index.html) get the cached shell of this version.
  const atRoot = url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`;
  if (request.mode === 'navigate' && atRoot) {
    event.respondWith((async () => (await caches.open(SHELL_CACHE).then((c) => c.match(indexUrl))) || fetch(request))());
    return;
  }

  const bare = url.origin + url.pathname;
  if (shellSet.has(bare)) {
    // A stamped URL (?v=...) finds the same file: the cache is already per version.
    event.respondWith((async () => (await caches.open(SHELL_CACHE).then((c) => c.match(bare))) || fetch(request))());
    return;
  }

  if (url.pathname.startsWith(scope.pathname)) event.respondWith(networkFirst(request));
});
