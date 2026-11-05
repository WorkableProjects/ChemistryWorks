// V4-08 version check: compare the deployed Apps Script version (?action=ping) with this site's version and, for
// admins only, show a banner with the upgrade steps when the backend is older. A failed ping shows nothing.

import { h } from '../ui.js';
import { SITE_VERSION } from '../version.js';
import { pingBackend } from './api.js';

/** Parse "4.0.0" / "v4.0" / "4.0.0-beta" into [major, minor, patch] (missing or bad parts = 0), or null. */
export function parseVersion(v) {
  const m = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i.exec(String(v == null ? '' : v));
  return m ? [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)] : null;
}

/** -1 when a < b, 0 when equal, 1 when a > b; null when either is not a version. */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** True only when the backend version is known and lower than the site version. */
export function isBackendOutdated(backendVersion, siteVersion = SITE_VERSION) {
  return compareVersions(backendVersion, siteVersion) === -1;
}

/** -> { outdated, backendVersion, siteVersion }. Never throws; a failed ping is { outdated: false }. */
export async function checkBackendVersion({ gasUrl, siteVersion = SITE_VERSION, ping = pingBackend, fetchImpl } = {}) {
  if (!gasUrl) return { outdated: false, backendVersion: '', siteVersion };
  try {
    const res = await ping({ gasUrl, fetchImpl });
    if (!res || !res.ok) return { outdated: false, backendVersion: '', siteVersion };
    return { outdated: isBackendOutdated(res.version, siteVersion), backendVersion: String(res.version || ''), siteVersion };
  } catch {
    return { outdated: false, backendVersion: '', siteVersion };
  }
}

/** The admin-only banner element. */
export function versionBanner({ backendVersion, siteVersion = SITE_VERSION } = {}) {
  const bv = String(backendVersion || '').replace(/^v/i, '') || 'older than 3.0.0';
  const el = h('div', { class: 'notice notice--warning', role: 'status', dataset: { testid: 'version-banner' }, style: 'margin: 12px 16px;' },
    h('div', { class: 'stack' },
      h('strong', {}, `The Apps Script backend is version ${bv}; this site is ${siteVersion}.`),
      h('span', {}, 'Update Code.gs so new features work:'),
      h('ol', {},
        h('li', {}, 'Paste the latest apps-script/Code.gs into your Apps Script project and Save.'),
        h('li', {}, 'Run setup once from the editor (approve any new permission prompt).'),
        h('li', {}, 'Deploy > Manage deployments > pencil > Version: New version > Deploy (keep the same /exec URL).'))),
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': 'Dismiss', on: { click: () => el.remove() } }, 'Dismiss'));
  return el;
}
