// Optional game sound: short Web Audio tones, no audio files. Off by default; the choice is saved
// under the `gameSound` key. Every call is a safe no-op when audio is unavailable.

import { load, save } from '../storage.js';

const KEY = 'gameSound';
let ctx = null;

export const isSoundOn = () => load(KEY, false) === true;
export function setSoundOn(on) { return save(KEY, !!on); }

// [frequency Hz, start offset s, length s]
const TONES = {
  correct: [[660, 0, 0.09], [880, 0.09, 0.12]],
  wrong: [[220, 0, 0.18]],
  tick: [[520, 0, 0.04]],
  life: [[523, 0, 0.08], [659, 0.08, 0.08], [784, 0.16, 0.12]],
  win: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.2]],
  flip: [[400, 0, 0.05]],
};

/** Play a named tone when sound is on. */
export function playTone(name) {
  try {
    if (!isSoundOn()) return;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    for (const [freq, at, len] of TONES[name] || []) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.12, now + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + len + 0.02);
    }
  } catch { /* audio is optional */ }
}
