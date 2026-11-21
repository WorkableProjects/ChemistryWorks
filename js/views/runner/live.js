// Live monitor: tells the backend how far along this student is, every 60 seconds, while a teacher has the
// live view open. It stops quietly on older backends.

import { publicCall } from '../../lib/api.js';
import { getIdToken } from '../../lib/auth.js';

/** Starts pinging when the test is live. Returns { isLive, ping, stop }. */
export function startLivePing(rt) {
  const { ctx, test, user, preview, state, total, limitSec } = rt;
  let pingTimer = null;
  const ping = async (submitted = false) => {
    if (preview || !ctx.config?.GAS_WEB_APP_URL || !user) return;
    const idToken = user.provider === 'google' ? getIdToken() : null;
    const res = await publicCall('progressPing', {
      testCode: test.code, name: user.name || '', answered: rt.answeredCount(), total, submitted,
      timeLeft: limitSec ? Math.max(0, Math.round(limitSec - (Date.now() - state.startedAt) / 1000)) : null,
      ...(idToken ? { idToken } : { studentEmail: user.email }),
    }, { gasUrl: ctx.config.GAS_WEB_APP_URL });
    if (!res.ok && (res.unavailable || /identity|unauthorized/.test(res.error || ''))) { clearInterval(pingTimer); pingTimer = null; }
  };
  const isLive = !preview && test.instance?.live === true;
  if (isLive) { ping(); pingTimer = setInterval(() => ping(), 60000); }
  return {
    isLive,
    ping,
    /** Clears the interval; sends a final "submitted" ping when the student finished. */
    stop() {
      if (pingTimer) clearInterval(pingTimer);
      if (isLive && state.done) ping(true);
    },
  };
}
