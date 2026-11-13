// ChemistryWorks runtime configuration.
// Fill these in after following DEPLOYMENT.md. Any key can also be overridden at runtime by
// defining `window.CHEMISTRYWORKS_CONFIG = { ... }` before js/app.js loads (used by the E2E tests).

const DEFAULTS = {
  APP_NAME: 'ChemistryWorks',

  // Google Identity Services OAuth Web Client ID (DEPLOYMENT.md step 1).
  GOOGLE_CLIENT_ID: '179519385690-u3qo36gnublg8pmfve57uqtv0lm24e9r.apps.googleusercontent.com',

  // Google Apps Script Web App URL ending in /exec (DEPLOYMENT.md step 2).
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbyyxOV9lRPPGBTUGGcNeRLgM49wJOtnsDFAa71kKRg0VobGifN8rAE8zAHEqupmgqzu/exec',

  // Link to the Google Sheet that receives submissions (shown in the admin panel).
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/1yYGaYJAW_dDIUwu73nvUbgE78HbEQAdfVqupW6eKSWQ/edit?gid=0#gid=0',

  // When no GOOGLE_CLIENT_ID is set, allow a name/email "demo" sign-in so the app is usable
  // locally. Set to false in production once Google Sign-In is configured.
  ALLOW_DEMO_SIGNIN: false,

  // Optional: restrict Google sign-in to these email domains, e.g. ['myschool.org'].
  ALLOWED_EMAIL_DOMAINS: [],

  // Default question layout: 'focus' (one question at a time) or 'scroll' (all on one page).
  DEFAULT_MODE: 'focus',

  // Things a teacher may need to switch off on a live site. Everything else is always on.
  KILL_SWITCHES: {
    classHub: true,    // assignments, class stream, notifications
    gameModes: true,   // game modes on a test
    studentSync: true, // student progress sync to the Sheet
  },
};

// js/config.local.js (written by the Pages workflow from repository variables) sets window.CHEMISTRYWORKS_LOCAL.
const OVERRIDES = typeof window !== 'undefined'
  ? { ...(window.CHEMISTRYWORKS_LOCAL || {}), ...(window.CHEMISTRYWORKS_CONFIG || {}) }
  : {};

export const CONFIG = Object.freeze({
  ...DEFAULTS,
  ...OVERRIDES,
  KILL_SWITCHES: Object.freeze({ ...DEFAULTS.KILL_SWITCHES, ...(OVERRIDES.KILL_SWITCHES || {}) }),
});

/** False only when a teacher switched `name` off in KILL_SWITCHES. */
export function enabled(name, config = CONFIG) {
  return (config.KILL_SWITCHES || {})[name] !== false;
}
