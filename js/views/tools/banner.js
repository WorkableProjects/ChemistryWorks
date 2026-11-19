// Offline / waiting-submission banner. networkBanner({ ctx }) -> { el, destroy() }
// Shown in the runner and on the landing page: offline (answers are safe on the device) and "a submission is waiting".

import { h, icon, toast } from '../../ui.js';
import { getOutbox, flushOutbox } from '../../lib/submit.js';
import { bannerState } from './network.js';

export function networkBanner({ config } = {}) {
  const text = h('span', { class: 'net-banner__text' });
  const sendBtn = h('button', { type: 'button', class: 'btn btn--sm', dataset: { testid: 'net-send-now' }, on: { click: async () => {
    sendBtn.disabled = true;
    const n = await flushOutbox({ config });
    sendBtn.disabled = false;
    toast(n ? 'Sent.' : 'Still waiting. We will try again when you are online.', { type: n ? 'success' : 'warning' });
    update();
  } } }, 'Send now');
  const el = h('div', { class: 'net-banner', role: 'status', 'aria-live': 'polite', hidden: true, dataset: { testid: 'net-banner' } }, icon('alert', { size: 18 }), text, sendBtn);
  function update() {
    const st = bannerState({ online: typeof navigator === 'undefined' || navigator.onLine !== false, outbox: getOutbox().length });
    el.hidden = !st;
    if (!st) return;
    el.dataset.kind = st.kind;
    text.textContent = st.text;
    sendBtn.hidden = st.kind !== 'queued' && !getOutbox().length;
  }
  const onNet = async () => { if (navigator.onLine !== false && getOutbox().length) { await flushOutbox({ config }); } update(); };
  window.addEventListener('online', onNet);
  window.addEventListener('offline', update);
  const poll = setInterval(update, 5000);
  update();
  return { el, update, destroy() { window.removeEventListener('online', onNet); window.removeEventListener('offline', update); clearInterval(poll); } };
}
