// Client error reporting (V4-08, S17). Off unless the backend's Settings say errorReports = on (the backend refuses
// otherwise). Never sends answers or test content: only the message, a short stack, the page (no query string) and the
// browser. Rate-limited: at most 5 reports per page load and one per 10 seconds.
import { publicCall } from './api.js';

export const LIMITS = { perPage: 5, gapMs: 10000 };

/** Remove anything that could hold student input (quoted strings, JSON, emails) and cap the length. */
export function scrub(text, max = 500) {
  return String(text || '')
    .replace(/"[^"]{0,200}"|'[^']{0,200}'/g, '"…"')
    .replace(/\{[\s\S]{0,400}\}/g, '{…}')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
    .slice(0, max);
}

export function makeLimiter({ perPage = LIMITS.perPage, gapMs = LIMITS.gapMs } = {}) {
  let count = 0; let last = -Infinity;
  return (now = Date.now()) => {
    if (count >= perPage || now - last < gapMs) return false;
    count++; last = now; return true;
  };
}

export function installErrorReporting(config) {
  if (typeof window === 'undefined' || !config?.GAS_WEB_APP_URL) return () => {};
  const allow = makeLimiter();
  let disabled = false;
  const send = (message, detail) => {
    if (disabled || !allow()) return;
    publicCall('reportError', { message: scrub(message), detail: scrub(detail, 1500), page: location.pathname, browser: navigator.userAgent.slice(0, 160) }, { gasUrl: config.GAS_WEB_APP_URL })
      .then((r) => { if (!r.ok && (r.unavailable || r.error === 'error_reports_off')) disabled = true; });
  };
  const onError = (e) => send(e.message || 'Error', e.error && e.error.stack);
  const onRejection = (e) => send(e.reason && e.reason.message ? e.reason.message : 'Unhandled promise rejection', e.reason && e.reason.stack);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
}
