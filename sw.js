// Service worker: the app shell works offline. Network first for everything on this site, falling back to the cache.
// The cache name carries the site version, so a new release never mixes old and new files: the page shows
// "Update available" and reloads when the student or teacher chooses.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `cw-${VERSION}`;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'js/app.js', 'js/config.js', 'js/config.local.js', 'js/version.js', 'js/ui.js', 'css/base.css',
  'assets/brand/favicon-64.png', 'assets/brand/icon-512.png', 'data/tests/catalog.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' })))).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('cw-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

const CACHEABLE = /^https:\/\/(fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com)\//;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE.test(req.url)) return; // Apps Script and Google sign-in always go to the network
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: sameOrigin });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html') || await cache.match('./');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
