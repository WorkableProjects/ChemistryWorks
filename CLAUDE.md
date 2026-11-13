# ChemistryWorks — notes for Claude

## Releases and the changelog (required on every version bump)

Every new version gets its own release notes file. Users read them in **Settings → What's new**.

When you bump the version, do all of these in the same change:

1. Set the version in `js/version.js` (`SITE_VERSION`) and `package.json` (`"version"`). Use semver: patch for fixes, minor for features, major for breaking/backend changes.
2. Create `changelog/<version>.md` (e.g. `changelog/4.2.0.md`) in this format:

   ```md
   # 4.2.0 — YYYY-MM-DD

   Optional one-line summary (e.g. "Backend upgrade required: see DEPLOYMENT.md").

   ## Added
   - ...

   ## Changed
   - ...

   ## Fixed
   - ...
   ```

   Only `#` title, `##` headings, `- ` bullets, paragraphs, `**bold**` and `` `code` `` are rendered. Leave out empty sections. Write for teachers and students, not developers.
3. Add the version to the **front** of `changelog/index.json` (newest first).
4. If the release needs a new `apps-script/Code.gs`, also raise `BACKEND_VERSION` in `js/version.js` and `VERSION` in Code.gs. Otherwise leave them.

`test/unit/changelog.test.mjs` fails if any of this is missing or out of order. If you finish user-facing work without bumping the version, ask whether to bump it.

## Commands

- `npm start` — local server on http://localhost:3000 (`?admin=true` opens admin without a backend)
- `npm test` — unit tests; `npm run test:e2e` — Playwright browser tests
