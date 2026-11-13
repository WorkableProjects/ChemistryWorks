// Read-aloud button for a question card, using the Web Speech API when the browser has it.
// readAloudButton({ getText }) -> { el, stop() } | null (null when speech synthesis is unavailable)

import { h, icon } from '../../ui.js';

export const speechAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

let current = null; // only one question is spoken at a time
export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  if (current) current.reset();
  current = null;
}

export function readAloudButton({ getText }) {
  if (!speechAvailable()) return null;
  const label = h('span', { class: 'q-flag__label' }, 'Read aloud');
  const btn = h('button', { type: 'button', class: 'q-flag tool-read', 'aria-pressed': 'false', title: 'Read this question aloud', dataset: { testid: 'read-aloud' } },
    icon('play', { size: 16 }), label);
  const state = { reset() { btn.setAttribute('aria-pressed', 'false'); label.textContent = 'Read aloud'; btn.classList.remove('is-reading'); } };
  btn.addEventListener('click', () => {
    if (btn.getAttribute('aria-pressed') === 'true') { stopSpeaking(); return; }
    stopSpeaking();
    const u = new window.SpeechSynthesisUtterance(getText());
    u.lang = document.documentElement.lang || 'en';
    u.onend = u.onerror = () => { if (current === state) { current = null; state.reset(); } };
    current = state;
    btn.setAttribute('aria-pressed', 'true'); label.textContent = 'Stop reading'; btn.classList.add('is-reading');
    window.speechSynthesis.speak(u);
  });
  return { el: btn, stop: () => { if (current === state) stopSpeaking(); } };
}
