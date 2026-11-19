// Puts ?v=<SITE_VERSION> on every local stylesheet and script URL in index.html, so a release is never served from a
// stale browser cache. Run it after bumping js/version.js; a unit test fails while index.html is out of step.
//   node scripts/stamp-version.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SITE_VERSION } from '../js/version.js';

const INDEX = fileURLToPath(new URL('../index.html', import.meta.url));

/** Local css/js URLs in href and src attributes (not http(s) ones). */
const LOCAL_URL = /((?:href|src)=")((?!https?:|\/\/)[^"?#]+\.(?:css|js))(\?v=[^"]*)?(")/g;

/** index.html with every local css/js URL carrying ?v=<version>. */
export function stampHtml(html, version = SITE_VERSION) {
  return html.replace(LOCAL_URL, (_m, pre, url, _old, post) => `${pre}${url}?v=${version}${post}`);
}

/** The local css/js URLs in an html string, as [url, version|null]. */
export function localUrls(html) {
  return [...html.matchAll(LOCAL_URL)].map((m) => [m[2], m[3] ? m[3].slice(3) : null]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = await readFile(INDEX, 'utf8');
  await writeFile(INDEX, stampHtml(html));
  console.log(`index.html stamped with ?v=${SITE_VERSION}`);
}
