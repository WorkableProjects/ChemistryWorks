// Registers the service worker (sw.js) and offers a reload when a new version is waiting.
// It never reloads on its own: a student in the middle of a test keeps the version they started with.
import { toast } from '../ui.js';

const UPDATE_TOAST_MS = 10 * 60 * 1000;

/** True when a worker may be registered here (https, or localhost during development). */
export function canRegister(nav = globalThis.navigator, loc = globalThis.location) {
  return !!nav && 'serviceWorker' in nav && !!loc && (loc.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(loc.hostname));
}

function promptReload(reg) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) return; // the first worker claiming the page is not an update
    location.reload();
  });
  toast('Update available', {
    type: 'info',
    timeout: UPDATE_TOAST_MS,
    action: { label: 'Reload', onClick: () => {
      reloading = true;
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      else location.reload();
    } },
  });
}

/** Register sw.js (relative to the page, so it works under /ChemistryWorks/). Resolves to the registration or null. */
export async function registerServiceWorker() {
  if (!canRegister()) return null;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    let prompted = false;
    const prompt = () => { if (!prompted) { prompted = true; promptReload(reg); } };
    // A worker already controls the page: anything that installs after this is a new version.
    if (reg.waiting && navigator.serviceWorker.controller) prompt();
    reg.addEventListener('updatefound', () => {
      const next = reg.installing;
      if (!next) return;
      next.addEventListener('statechange', () => {
        if (next.state === 'installed' && navigator.serviceWorker.controller) prompt();
      });
    });
    return reg;
  } catch {
    return null; // blocked (private window, old browser): the site works as before, just not offline
  }
}

if (typeof document === 'undefined') { /* not in a browser */ }
else if (document.readyState === 'complete') registerServiceWorker();
else window.addEventListener('load', () => { registerServiceWorker(); });
