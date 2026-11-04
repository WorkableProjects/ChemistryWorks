// Admin credentials for every admin request (contract shared by S06 admin accounts and the admin views).
// Views never read storage for the admin key directly: they call these helpers.
//
//   adminKey()       the ADMIN_KEY typed in Settings for this tab ('' if none). Upgrade-period fallback (V4-07).
//   hasAdminAuth()   true when this tab can make admin requests: an admin key is set, OR (V4-07) the signed-in
//                    Google user has been confirmed as an admin by the backend.
//   adminRequestAuth()  extra fields merged into every admin POST body by js/lib/api.js: { adminKey } today;
//                    S06 adds { idToken } for a confirmed Google admin.
//
// S06 owns the implementation below; the exported names and return shapes are fixed.

import { load } from './storage.js';

export function adminKey() {
  return load('adminKey', '', 'session') || '';
}

export function hasAdminAuth() {
  return !!adminKey();
}

export function adminRequestAuth() {
  const key = adminKey();
  return key ? { adminKey: key } : {};
}
