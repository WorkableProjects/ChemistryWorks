# Moving ChemistryWorks from Netlify to GitHub Pages

This document is an implementation brief for Claude. Migrate the static site hosting from Netlify to GitHub Pages while keeping the existing Google Apps Script backend. Make only the changes needed for a reliable Pages deployment; do not replace the backend or expose any secrets.

## Target deployment

- Repository: `WorkableProjects/ChemistryWorks`
- GitHub Pages project-site URL: `https://workableprojects.github.io/ChemistryWorks/`
- GitHub Pages OAuth **origin** (origins must not include a path): `https://workableprojects.github.io`
- Site source: repository root on the default branch; no build command; output is the repository root (`.`).

Before implementing, verify that this is still the intended repository and that GitHub Pages is available/enabled for it. Check GitHub Pages' current usage limits and acceptable-use policy for this project's intended use. Pages is static hosting; it must not be used as a replacement backend or for a commercial SaaS service if that conflicts with GitHub's policy.

## Migration tasks

1. **Audit the app's URLs and routing.**
   - The app is static HTML/CSS/JavaScript with a root `index.html` and ES modules; it does not need a compilation/build step.
   - Audit links, imports, `fetch()` calls, form actions, and redirects for paths beginning with `/`. A root-relative URL such as `/data/tests/...` points to the host root and will miss the `/ChemistryWorks/` project prefix. Convert paths to a Pages-safe base-aware form where needed, while keeping local development working.
   - `netlify.toml` currently rewrites `/test` to `/index.html`. GitHub Pages does not read `netlify.toml` and does not provide Netlify-style rewrites. Find every use of `/test` and preserve the intended behavior with a Pages-compatible approach. Prefer a small static fallback or a supported in-app URL/query route; do not break direct links, refreshes, or test-code links. Document any unavoidable URL change.
   - Consider adding an empty root `.nojekyll` file so GitHub Pages serves the static project without Jekyll processing.

2. **Disable Netlify Forms.**
   - In `js/config.js`, set `NETLIFY_FORMS: false` (not `'auto'`). ChemistryWorks already sends submissions to the configured Google Apps Script endpoint; Netlify Forms is only the secondary backup and will not work on GitHub Pages.
   - Inspect the submission flow and make sure a failed/unsupported form POST does not mislead users or prevent the Apps Script submission. Keep local/offline outbox behavior intact.
   - The Netlify detection form in `index.html` may be removed if it is no longer used, but only after confirming nothing else depends on it.

3. **Configure GitHub Pages deployment.**
   - Provide a simple GitHub Actions Pages workflow (recommended) that checks out the repository, uploads the repository root as the Pages artifact, and deploys it, with the required Pages permissions and concurrency settings. This project has no build step. Exclude repository-only material from the published artifact where appropriate (for example `.git`, tests, and development docs), but ensure all runtime files and `data/tests/` are included.
   - Alternatively, document the repository Settings → Pages configuration if deploying from a branch. Do not configure both methods ambiguously.
   - Add any required Pages-specific files/configuration. Do not delete `netlify.toml` unless its removal is intentional and the Netlify deployment is no longer needed; it may be retained for rollback.

4. **Update Google OAuth.**
   - In Google Cloud Console, open the OAuth 2.0 Web client whose ID is configured as `GOOGLE_CLIENT_ID` in `js/config.js`.
   - Under **Authorized JavaScript origins**, add `https://workableprojects.github.io` (scheme + host only—no `/ChemistryWorks/` path and no trailing slash). If a custom domain is used instead, add that domain's origin too.
   - Keep existing origins needed for local development or other live deployments. Do not add a redirect URI for this Google Identity Services JavaScript-button flow unless the implementation has changed to require one.
   - The OAuth client ID is public client configuration; never put a client secret in the browser or repository.
   - Claude cannot make this Google Cloud Console change unless the user has explicitly provided an authorized mechanism. Clearly tell the user to add the origin and authorize the Pages domain before testing sign-in.

5. **Account for Netlify-only behavior.**
   - `netlify.toml` also sets response headers, including `Cache-Control: no-cache` for `/data/tests/*`. GitHub Pages will not apply those Netlify headers. Review test-catalog fetching and update strategy; avoid relying on those headers for freshness. If cache freshness matters, use a deliberate version/query strategy or document the limitation.
   - GitHub Pages does not provide Netlify Forms or a general server-side runtime. Continue to use the existing Apps Script API for server-side actions and submissions.

## Validation and handoff

- Run the existing unit tests and relevant test-data validation. Run the browser/e2e tests if the environment supports them.
- Build or locally serve the exact Pages artifact and test it under the **project subpath** `/ChemistryWorks/`, not just at `/`. Verify CSS, images, JavaScript modules, bundled tests, and direct navigation/refresh for the supported test routes.
- Check browser console/network errors, Google sign-in after the OAuth origin is added, student submission to Apps Script, and the admin/backend flows that can be safely tested.
- Confirm Netlify Forms is disabled and no code path depends on it. Do not claim that a form backup exists on Pages.
- Summarize changed files, tests run, Pages setup steps, and the remaining user action in Google Cloud Console. Do not claim the site is live until a deployment has actually succeeded.

Useful references:

- GitHub Pages overview: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- GitHub Pages limits and policy: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- GitHub Actions Pages deployment: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
