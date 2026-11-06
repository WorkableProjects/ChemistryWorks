// Site version, shown under the landing sign-in card and in Settings > What's new.
// Bump on every release; keep in step with package.json "version" AND add changelog/<version>.md + its entry in
// changelog/index.json (test/unit/changelog.test.mjs fails otherwise). See CLAUDE.md.
export const SITE_VERSION = '4.1.1';

// Lowest Apps Script (apps-script/Code.gs VERSION) this site works with. The admin banner shows when the backend is
// older. Raise it only when a release needs a Code.gs change, so site-only releases don't nag teachers to redeploy.
export const BACKEND_VERSION = '4.0.0';
