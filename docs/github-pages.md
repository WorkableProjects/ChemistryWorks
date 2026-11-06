# Hosting on GitHub Pages

Site: https://workableprojects.github.io/ChemistryWorks/

## One-time setup
1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. (Not "Deploy from a branch".)
2. Push to `main` (or run **Actions → Deploy to GitHub Pages → Run workflow**). `.github/workflows/pages.yml` publishes only the runtime files: `index.html`, `404.html`, `.nojekyll`, `css/`, `js/`, `data/`, `assets/`, `changelog/`.
3. **Google Cloud Console → APIs & Services → Credentials →** the OAuth Web client in `js/config.js` (`GOOGLE_CLIENT_ID`) **→ Authorized JavaScript origins → add** `https://workableprojects.github.io` (no path, no trailing slash). Keep existing origins. Sign-in fails on Pages until this is done.

## Differences from Netlify
- **Test links:** `?code=CHEM101`. Old `/test?code=…` links are redirected by `404.html` and `test/index.html` (generated in the workflow).
- **Netlify Forms:** off (`NETLIFY_FORMS: false`). Apps Script is the only submission backend; the offline outbox still retries.
- **Headers:** `netlify.toml` headers are not applied. Test files are fetched with `cache: 'no-cache'`, so updates are picked up without the old `/data/tests/*` header (Pages caches ~10 min otherwise).
- `netlify.toml` is kept for rollback only.
