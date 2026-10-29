// Student identity via Google Identity Services, with a demo fallback for local use.
// The signed-in user is kept in sessionStorage so a refresh mid-test does not sign the student out.
//
// User shape: { name: string, email: string, picture: string|null, provider: 'google'|'demo' }

import { load, save, remove } from './storage.js';

const KEY = 'user';
let currentUser = load(KEY, null, 'session');
const listeners = new Set();

export function getUser() {
  return currentUser;
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setUser(user) {
  currentUser = user;
  if (user) save(KEY, user, 'session');
  else remove(KEY, 'session');
  listeners.forEach((fn) => fn(user));
}

export function signOut() {
  if (currentUser?.provider === 'google' && window.google?.accounts?.id) {
    try { window.google.accounts.id.disableAutoSelect(); } catch { /* ignore */ }
  }
  setUser(null);
}

/** Decode the payload of a Google ID token (JWT). The token is not verified client-side. */
export function decodeJwt(token) {
  const part = String(token).split('.')[1];
  if (!part) throw new Error('Malformed credential');
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const json = decodeURIComponent(
    atob(b64).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
  );
  return JSON.parse(json);
}

export function emailAllowed(email, domains = []) {
  if (!domains || !domains.length) return true;
  const d = String(email).split('@')[1]?.toLowerCase();
  return domains.some((x) => String(x).toLowerCase() === d);
}

export function googleConfigured(config) {
  return Boolean(config.GOOGLE_CLIENT_ID);
}

export function demoAllowed(config) {
  return !googleConfigured(config) && config.ALLOW_DEMO_SIGNIN !== false;
}

/** Wait for the GIS script (loaded async in index.html). Resolves false after `timeoutMs`. */
function waitForGis(timeoutMs = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function poll() {
      if (window.google?.accounts?.id) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(poll, 100);
    })();
  });
}

/**
 * Render the official "Sign in with Google" button into `container`.
 * Calls onError(message) for domain rejections or SDK load failures.
 */
export async function renderGoogleButton(container, config, { onError } = {}) {
  const ok = await waitForGis();
  if (!ok) {
    onError?.('Google Sign-In could not load. Check your connection or ad blocker and refresh.');
    return false;
  }
  window.google.accounts.id.initialize({
    client_id: config.GOOGLE_CLIENT_ID,
    auto_select: true,
    cancel_on_tap_outside: true,
    callback: (response) => {
      try {
        const p = decodeJwt(response.credential);
        if (!emailAllowed(p.email, config.ALLOWED_EMAIL_DOMAINS)) {
          onError?.(`Please sign in with your school account (${config.ALLOWED_EMAIL_DOMAINS.join(', ')}).`);
          return;
        }
        setUser({ name: p.name || p.email, email: p.email, picture: p.picture || null, provider: 'google' });
      } catch (err) {
        onError?.('Sign-in failed: ' + err.message);
      }
    },
  });
  window.google.accounts.id.renderButton(container, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', width: 280 });
  return true;
}

/** Demo sign-in (no Google client configured). Validates a plausible email. */
export function demoSignIn(name, email) {
  const n = String(name || '').trim();
  const e = String(email || '').trim().toLowerCase();
  if (!n) throw new Error('Enter your full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Enter a valid email address.');
  setUser({ name: n, email: e, picture: null, provider: 'demo' });
  return currentUser;
}
