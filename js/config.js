// ChemistryWorks runtime configuration.
// Fill these in after following DEPLOYMENT.md. Any key can also be overridden at runtime by
// defining `window.CHEMISTRYWORKS_CONFIG = { ... }` before js/app.js loads (used by the E2E tests).

const DEFAULTS = {
  APP_NAME: 'ChemistryWorks',

  // Google Identity Services OAuth Web Client ID (DEPLOYMENT.md step 1).
  GOOGLE_CLIENT_ID: '179519385690-u3qo36gnublg8pmfve57uqtv0lm24e9r.apps.googleusercontent.com',

  // Google Apps Script Web App URL ending in /exec (DEPLOYMENT.md step 2).
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbwLio3PF206ggVZAhwZcPKi9FLsxh2Doi9hHnXUuhG8fdz8e1xtBoQF8sOuVX80UYrh/exec',

  // Link to the Google Sheet that receives submissions (shown in the admin panel).
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/1yYGaYJAW_dDIUwu73nvUbgE78HbEQAdfVqupW6eKSWQ/edit?gid=0#gid=0',

  // When no GOOGLE_CLIENT_ID is set, allow a name/email "demo" sign-in so the app is usable
  // locally. Set to false in production once Google Sign-In is configured.
  ALLOW_DEMO_SIGNIN: false,
  // Optional: restrict Google sign-in to these email domains, e.g. ['myschool.org'].
  ALLOWED_EMAIL_DOMAINS: [],

  // Default question layout: 'focus' (one question at a time) or 'scroll' (all on one page).
  DEFAULT_MODE: 'focus',

  // Kill switches (V6): true turns a feature off for every user. All off by default; see docs/ARCHITECTURE.md.
  // Override per page with window.CHEMISTRYWORKS_CONFIG = { KILL_SWITCHES: { classHub: true } }.
  KILL_SWITCHES: Object.freeze({
    classHub: false,      // class pages, assignments, stream and notifications; the Class Hub nav
    gameModes: false,     // the mode switcher; the runner stays in Study
    studentSync: false,   // sync.js never starts; progress stays on the device
  }),
};

const OVERRIDES = typeof window !== 'undefined' && window.CHEMISTRYWORKS_CONFIG ? window.CHEMISTRYWORKS_CONFIG : {};

/** Loads js/config.local.js (written by the Pages workflow from repository variables). A missing file or bad export gives {}. */
export async function loadLocalConfig(importer = () => import('./config.local.js')) {
  try {
    const mod = await importer();
    const local = mod && (mod.default || mod.LOCAL_CONFIG);
    return local && typeof local === 'object' ? local : {};
  } catch {
    return {};
  }
}

/** Layers config objects left to right (later wins); KILL_SWITCHES are merged key by key. */
export function mergeConfig(defaults, ...layers) {
  const out = { ...defaults };
  let switches = { ...(defaults.KILL_SWITCHES || {}) };
  for (const layer of layers) {
    if (!layer) continue;
    Object.assign(out, layer);
    switches = { ...switches, ...(layer.KILL_SWITCHES || {}) };
  }
  out.KILL_SWITCHES = Object.freeze(switches);
  return Object.freeze(out);
}

const LOCAL = await loadLocalConfig();

export const CONFIG = mergeConfig(DEFAULTS, LOCAL, OVERRIDES);

/** True only when the kill switch `name` is exactly `true`. Unknown names are off. */
export function killed(name, config = CONFIG) {
  return Object.prototype.hasOwnProperty.call(config.KILL_SWITCHES || {}, name) && config.KILL_SWITCHES[name] === true;
}
