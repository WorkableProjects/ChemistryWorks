// ChemistryWorks runtime configuration.
// Fill these in after following DEPLOYMENT.md. Any key can also be overridden at runtime by
// defining `window.CHEMISTRYWORKS_CONFIG = { ... }` before js/app.js loads (used by the E2E tests).

const DEFAULTS = {
  APP_NAME: 'ChemistryWorks',

  // Google Identity Services OAuth Web Client ID (DEPLOYMENT.md step 1).
  GOOGLE_CLIENT_ID: '',

  // Google Apps Script Web App URL ending in /exec (DEPLOYMENT.md step 2).
  GAS_WEB_APP_URL: '',

  // Link to the Google Sheet that receives submissions (shown in the admin panel).
  SHEET_URL: '',

  // Client-side gate for the admin UI. This only hides the UI; real protection for
  // publishing tests and reading results is the ADMIN_KEY script property in Apps Script.
  ADMIN_ACCESS_CODE: 'chemadmin',

  // When no GOOGLE_CLIENT_ID is set, allow a name/email "demo" sign-in so the app is usable
  // locally. Set to false in production once Google Sign-In is configured.
  ALLOW_DEMO_SIGNIN: true,

  // Optional: restrict Google sign-in to these email domains, e.g. ['myschool.org'].
  ALLOWED_EMAIL_DOMAINS: [],

  // 'auto' = post to Netlify Forms unless running on localhost/127.0.0.1; true/false to force.
  NETLIFY_FORMS: 'auto',

  // Default question layout: 'focus' (one question at a time) or 'scroll' (all on one page).
  DEFAULT_MODE: 'focus',
};

export const CONFIG = Object.freeze({
  ...DEFAULTS,
  ...(typeof window !== 'undefined' && window.CHEMISTRYWORKS_CONFIG ? window.CHEMISTRYWORKS_CONFIG : {}),
});

export function netlifyFormsEnabled(config = CONFIG, hostname = (typeof location !== 'undefined' ? location.hostname : '')) {
  if (config.NETLIFY_FORMS === true || config.NETLIFY_FORMS === false) return config.NETLIFY_FORMS;
  return !['localhost', '127.0.0.1', '0.0.0.0', ''].includes(hostname);
}
