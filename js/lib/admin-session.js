// Admin credentials for every admin request (contract shared by S06 admin accounts and the admin views).
// Views never read storage for the admin key directly: they call these helpers.
//
//   adminKey()       the ADMIN_KEY typed in Settings for this tab ('' if none). Upgrade-period fallback (V4-07).
//   hasAdminAuth()   true when this tab can make admin requests: an admin key is set, OR (V4-07) the signed-in
//                    Google user has been confirmed as an admin by the backend (`whoami`).
//   adminRequestAuth()  extra fields merged into every admin POST body by js/lib/api.js: { idToken } (fresh) for a
//                    confirmed Google admin, plus { adminKey } when a key is set.
//
// "Confirmed" is a session flag holding the email the backend confirmed via `whoami`. It only counts while the
// signed-in user's email still matches it AND a usable ID token exists, so signing out or switching accounts
// drops it. The backend re-verifies the token on every request; this flag only decides what the UI offers.

import { load, save, remove } from './storage.js';
import { getUser, getIdToken } from './auth.js';

const CONFIRMED_KEY = 'adminConfirmed';

export function adminKey() {
  return load('adminKey', '', 'session') || '';
}

const norm = (e) => String(e || '').trim().toLowerCase();

/** Remember that the backend confirmed `email` as an admin (the signed-in Google user). */
export function setAdminConfirmed(email) {
  const e = norm(email);
  if (e) save(CONFIRMED_KEY, e, 'session'); else remove(CONFIRMED_KEY, 'session');
}

export function clearAdminConfirmed() {
  remove(CONFIRMED_KEY, 'session');
}

/** The confirmed admin's email while it still matches the signed-in user and a token is available, else ''. */
export function confirmedAdminEmail() {
  const confirmed = norm(load(CONFIRMED_KEY, '', 'session'));
  if (!confirmed) return '';
  const u = getUser();
  if (!u || u.provider !== 'google' || norm(u.email) !== confirmed) return '';
  return getIdToken() ? confirmed : '';
}

export function hasAdminAuth() {
  return !!adminKey() || !!confirmedAdminEmail();
}

export function adminRequestAuth() {
  const out = {};
  if (confirmedAdminEmail()) {
    const t = getIdToken();
    if (t) out.idToken = t;
  }
  const key = adminKey();
  if (key) out.adminKey = key;
  return out;
}
