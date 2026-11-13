# ChemistryWorks Deployment Guide

ChemistryWorks is a static site on **GitHub Pages** plus a **Google Apps Script** web app that stores everything in one Google Sheet. There is no build step and no server of your own.

```
Browser (GitHub Pages)  ──text/plain JSON──▶  Apps Script web app (/exec)  ──▶  Google Sheet
        │                                              │
        └── Google sign-in (ID token) ─────────────────┘  verified on every request
```

## 1. Run it locally

```bash
npm start            # http://localhost:3000
npm test             # unit tests
npm run test:e2e     # browser tests (Playwright, a dev dependency)
```

With no `GOOGLE_CLIENT_ID`, the landing page offers a demo sign-in and `?admin=true` opens the admin panel without a backend. The service worker is off on localhost.

## 2. Google Cloud: OAuth client

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. **OAuth consent screen**: **Internal** for a single Google Workspace school, otherwise **External** and **Publish app**.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   - **Authorized JavaScript origins**: `https://YOUR-USER.github.io` and `http://localhost:3000`. Origins only, no path.
   - Leave redirect URIs empty.
4. Copy the client ID (it is public).

## 3. Google Sheet and Apps Script

1. Create a Google Sheet, then **Extensions → Apps Script**.
2. Paste `apps-script/Code.gs`. Show the manifest (**Project Settings → Show "appsscript.json"**) and paste `apps-script/appsscript.json`. It declares the Sheets, mail, trigger and Google Classroom scopes and enables the Classroom advanced service.
3. **Script properties** (Project Settings):
   - `GOOGLE_CLIENT_ID`: the client ID from step 2. Required.
   - `ADMIN_EMAILS` (optional): comma-separated, first one becomes the owner. Or add rows to the **Admins** sheet after setup.
   - `ADMIN_KEY` (optional): a long random string, used only for set-up and recovery (for example before the Admins sheet has an owner). Enter it in admin → Settings, never in the repository.
   - `SITE_URL` (optional): your Pages URL, so Google Classroom assignments link to the test.
   - `ALLOW_UNVERIFIED_EMAIL` stays `false` unless you deliberately accept submissions without Google sign-in (those rows are marked Unverified).
4. Run **`setup`** and approve the permissions. It creates every sheet, adds the daily clean-up trigger and logs what is still missing.
5. **Deploy → New deployment → Web app**, execute as **Me**, access **Anyone**. Copy the `/exec` URL.
6. Check `YOUR_EXEC_URL?action=ping` → `{"result":"success","version":"6.0.0"}`.

**Later updates:** **Deploy → Manage deployments → Edit → Version: New version**. Never "New deployment": that changes the URL and breaks the site.

## 4. Configure the site

Either edit `js/config.js` (`GAS_WEB_APP_URL`, `GOOGLE_CLIENT_ID`, `SHEET_URL`), or, for a fork, leave the code alone and set **repository variables** with the same names (Settings → Secrets and variables → Actions → Variables). The Pages workflow writes them to `js/config.local.js`.

`KILL_SWITCHES` in `js/config.js` turns off the Class Hub, game modes or student progress sync on a live site if you need to.

## 5. GitHub Pages

Settings → Pages → Source: **GitHub Actions**. The `CI` workflow runs unit tests, test validation and browser tests on every pull request and push. `Deploy to GitHub Pages` publishes `main` only after CI passed for that commit. The site is served under `/<repo>/`; every path in the app and the service worker is relative.

## 6. Optional: deploy the backend with clasp

1. `npm install -g @google/clasp`, `clasp login`, copy `apps-script/.clasp.json.example` to `apps-script/.clasp.json` with your script ID.
2. `npm run gas:push` pushes `Code.gs` and the manifest.
3. For the **Deploy Apps Script backend** workflow (manual), add secrets `CLASPRC_JSON` (your `~/.clasprc.json`), `GAS_SCRIPT_ID`, `GAS_DEPLOYMENT_ID` (the existing web app deployment) and the variable `GAS_WEB_APP_URL`. It updates the existing deployment, then fails unless `?action=ping` reports the new version.

Pasting `Code.gs` by hand (step 3) still works.

## 7. Google Classroom grade sync (optional)

Sync runs as the account that deployed the script. It works for courses where that account is a teacher or co-teacher, and only on Classroom assignments ChemistryWorks created. Each teacher who wants sync uses their own deployment (admin → Settings → Platform → **Check this deployment** shows which account sync runs as).

1. Re-run `setup` once after upgrading to approve the Classroom scopes.
2. Admin → Classes → **Link to Google Classroom**, pick the course. **Save and import roster** fills the class from Classroom.
3. When assigning, tick **Post to Google Classroom**.
4. In the assignment tracker, **Sync grades** shows a preview (new, update, no change, not on the Classroom roster), then sends released scores as grades and unreleased ones as draft grades. Grades typed directly in Classroom are kept unless you tick **Overwrite Classroom changes**.

## Upgrading to v6

1. Paste the new `Code.gs` and `appsscript.json` (or `npm run gas:push`).
2. Set `GOOGLE_CLIENT_ID` if it is not set yet. Admins now sign in with Google only; make sure your account is on the **Admins** sheet.
3. Run **`setup`** again: it approves the new scopes, adds the **Tags** and **ClassroomSync** sheets and the daily clean-up trigger.
4. **Manage deployments → Edit → New version**. Check `?action=ping` reports `6.0.0`.
5. Optional: set the retention days in admin → Settings → Platform.

## Question types

42 types: mcq, multi, numeric, formula, truefalse, matching, ordering, fillblank, lewis, structure, orbital, short, open, balance, econfig, ptable, sigfigs, categorize, hotspot, graph, multipart, naming, dropdown, dimensional, nuclear, reaction, vsepr, datatable, molarmass, imagechoice, particles, titration, estimate, ionicformula, isotopemass, ionbuilder, heatcurve, oxidation, solubility, bohr, molbuild, gaslaw. See `docs/guide.md`.

## Troubleshooting

- **"Not sent yet — we'll retry"**: the Sheet did not confirm the submission. It stays on the device and is sent when the student is back online or reopens the site.
- **`server_error` with a ref**: the full error is in the **Errors** sheet; search for `ref <code>`.
- **`not_admin`**: add the account to the **Admins** sheet.
- **`locked_out`**: too many wrong `ADMIN_KEY` attempts this hour; wait an hour.
- **Classroom `project_permission_denied`**: the Classroom assignment was not created by ChemistryWorks. Post it from the assign dialog instead.

## Limits

- Google Sheets is the database: a few hundred milliseconds per read, and Apps Script quotas apply.
- Answer keys are sent with the test so the browser can grade it. For high-stakes tests, use teacher-graded types (`short`, `open`) with no sample answer.
