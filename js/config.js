// ChemistryWorks runtime configuration.
// Fill these in after following DEPLOYMENT.md. Any key can also be overridden at runtime by
// defining `window.CHEMISTRYWORKS_CONFIG = { ... }` before js/app.js loads (used by the E2E tests).

const DEFAULTS = {
  APP_NAME: 'ChemistryWorks',

  // Google Identity Services OAuth Web Client ID (DEPLOYMENT.md step 1).
  GOOGLE_CLIENT_ID: '179519385690-u3qo36gnublg8pmfve57uqtv0lm24e9r.apps.googleusercontent.com',

  // Google Apps Script Web App URL ending in /exec (DEPLOYMENT.md step 2).
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbx1ZXB00c8RFbGbY4R0eq4Vo0GrlISHKnv5qHHCJ0B3QVI9jA5mY-FgcBwxuuwwGyF3/exec',

  // Link to the Google Sheet that receives submissions (shown in the admin panel).
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/1yYGaYJAW_dDIUwu73nvUbgE78HbEQAdfVqupW6eKSWQ/edit?gid=0#gid=0',

  // Client-side gate for the admin UI. This only hides the UI; real protection for
  // publishing tests and reading results is the ADMIN_KEY script property in Apps Script.
  ADMIN_ACCESS_CODE: 'chemadmin',

  // When no GOOGLE_CLIENT_ID is set, allow a name/email "demo" sign-in so the app is usable
  // locally. Set to false in production once Google Sign-In is configured.
  ALLOW_DEMO_SIGNIN: false,

  // Optional: restrict Google sign-in to these email domains, e.g. ['myschool.org'].
  ALLOWED_EMAIL_DOMAINS: [],

  // Netlify Forms backup. Off: the site is hosted on GitHub Pages, which has no form handling.
  // ('auto' = post unless on localhost; only meaningful on Netlify.)
  NETLIFY_FORMS: false,

  // Default question layout: 'focus' (one question at a time) or 'scroll' (all on one page).
  DEFAULT_MODE: 'focus',

  // V4-08 feature flags: half-done v4 features ship hidden between sessions. Override per page with
  // window.CHEMISTRYWORKS_CONFIG = { FEATURES: { name: true } } or, on one device, the URL ?features=name1,name2
  // (or ?features=all). Read flags with feature('name').
  FEATURES: {
    adminShell: true,      // S05: Classroom-style admin shell + dashboard
    adminAccounts: true,  // S06: Google sign-in for admins — turn on after deploying Code.gs 4.0.0 and filling the Admins sheet
    teacherTools: true,    // S07: grade by question, comment bank (always shown)
    studentTools: true,    // S16: calculator, scratchpad, read-aloud (per test: test.tools)
    v4Types: true,         // S08–S10: new question types (registry). Turn off to hide them from the builder.
    v5Attempt: false,      // V5-01: shared attempt + mode switcher in the runner
    v5Games: false,        // V5-01: game modes on the shared attempt (needs v5Attempt)
    studentHome: false,    // V5-02: student home, profile page, Google Sheets sync
    classHub: false,       // V5-10: assignments, class stream, notifications (needs studentHome)
    perfStore: false,      // V5-11: client data store, optimistic updates, lazy loading
    v5Motion: false,       // V5-04/05: sidebar animation + motion pass
    appearance: false,     // V5-06: appearance panel (theme, accent, text size, density)
    v5Types: false,        // V5-07: new question types (ionicformula, ionbuilder, isotopemass, ...)
  },
};

const OVERRIDES = typeof window !== 'undefined' && window.CHEMISTRYWORKS_CONFIG ? window.CHEMISTRYWORKS_CONFIG : {};

export const CONFIG = Object.freeze({
  ...DEFAULTS,
  ...OVERRIDES,
  FEATURES: Object.freeze({ ...DEFAULTS.FEATURES, ...(OVERRIDES.FEATURES || {}) }),
});

/** Flags switched on through the URL (?features=a,b or ?features=all) for this page load only. */
// Read once at load: the router rewrites the URL (e.g. ?admin=true), which would otherwise drop ?features=.
const INITIAL_SEARCH = typeof location !== 'undefined' ? location.search : '';

export function urlFeatures(search = INITIAL_SEARCH) {
  const raw = new URLSearchParams(search).get('features');
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/** True when the V4 feature flag `name` is on (config, then ?features=). Unknown names are off. */
export function feature(name, config = CONFIG, search) {
  if (!Object.prototype.hasOwnProperty.call(config.FEATURES || {}, name)) return false;
  if (config.FEATURES[name] === true) return true;
  const fromUrl = urlFeatures(search);
  return fromUrl.includes('all') || fromUrl.includes(name);
}

export function netlifyFormsEnabled(config = CONFIG, hostname = (typeof location !== 'undefined' ? location.hostname : '')) {
  if (config.NETLIFY_FORMS === true || config.NETLIFY_FORMS === false) return config.NETLIFY_FORMS;
  return !['localhost', '127.0.0.1', '0.0.0.0', ''].includes(hostname);
}
