// On-demand stylesheets. A view calls ensureCss('hub') before it renders and css/hub.css is linked once.
// The URL is built from this module's own URL, so it stays relative under any base path (GitHub Pages serves the
// site from /ChemistryWorks/), and it always carries ?v=SITE_VERSION so a release is never served from a stale cache.

import { SITE_VERSION } from '../version.js';

const TIMEOUT_MS = 3000;
const pending = new Map();
const settled = new Set();

/** Absolute URL of css/<name>.css with the cache-busting version. */
export function cssUrl(name) {
  return `${new URL(`../../css/${name}.css`, import.meta.url).href}?v=${SITE_VERSION}`;
}

/**
 * Links css/<name>.css once and resolves when it has loaded, failed, or 3 seconds have passed. It never rejects:
 * a missing stylesheet must not block a view. Later calls with the same name return the same promise.
 * `media` limits the sheet to a media query (print.css uses 'print', so it never blocks rendering).
 */
export function ensureCss(name, { media = '' } = {}) {
  if (pending.has(name)) return pending.get(name);
  const promise = typeof document === 'undefined'
    ? Promise.resolve().then(() => { settled.add(name); })
    : new Promise((resolve) => {
      const href = cssUrl(name);
      let link = [...document.head.querySelectorAll('link[data-css]')].find((l) => l.dataset.css === name);
      if (link) { settled.add(name); resolve(); return; }
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.css = name;
      if (media) link.media = media;
      const timer = setTimeout(() => done(), TIMEOUT_MS);
      const done = () => { clearTimeout(timer); settled.add(name); resolve(); };
      link.addEventListener('load', done, { once: true });
      link.addEventListener('error', done, { once: true });
      document.head.appendChild(link);
    });
  pending.set(name, promise);
  return promise;
}

/** Links every name in the list. Resolves when all have settled. */
export function ensureCssAll(names) {
  return Promise.all(names.map(ensureCss)).then(() => undefined);
}

/** Null when every stylesheet in the list has already loaded (so a caller can carry on synchronously), else a promise. */
export function pendingCss(names) {
  const list = [...new Set(names)];
  const jobs = list.map(ensureCss);
  return list.every((n) => settled.has(n)) ? null : Promise.all(jobs).then(() => undefined);
}
