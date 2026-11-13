// Registers the service worker (relative URL, so it works under /ChemistryWorks/ on Pages) and shows two banners:
// "Offline — your answers are saved on this device" and "Update available — reload".
import { SITE_VERSION } from '../version.js';
import { h } from '../ui.js';
import { flushOutbox } from './submit.js';
import { CONFIG } from '../config.js';

let banner = null;
function show(text, { action, testid, tone = 'info' } = {}) {
  banner?.remove();
  banner = h('div', { class: ['pwa-banner', `pwa-banner--${tone}`], role: 'status', dataset: { testid } },
    h('span', {}, text), action ? h('button', { class: 'btn btn--sm', type: 'button', on: { click: action.onClick } }, action.label) : null);
  document.body.append(banner);
}
function hide(testid) { if (banner && (!testid || banner.dataset.testid === testid)) { banner.remove(); banner = null; } }

function watchConnection() {
  const update = () => {
    if (navigator.onLine === false) show('Offline — your answers are saved on this device', { testid: 'offline-banner', tone: 'warning' });
    else { hide('offline-banner'); flushOutbox({ config: CONFIG }); }
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  if (navigator.onLine === false) update();
}

export function startPwa() {
  watchConnection();
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || navigator.webdriver) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local) return; // no caching while developing
  navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(SITE_VERSION)}`, { scope: './' }).then((reg) => {
    const offer = (worker) => show('Update available', { testid: 'update-banner', action: { label: 'Reload', onClick: () => worker.postMessage('skipWaiting') } });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(() => { /* offline support is optional */ });
  // Reload only when an update replaced a worker that already controlled this page (not on the very first install).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}
