# ChemistryWorks Deployment Guide

This guide takes you from a fresh clone to a live site that signs students in with Google, grades tests in the browser, and records every submission in a Google Sheet. It replaces section 8 of `chemistryworks_specification.md`, which has a few inaccuracies (see "Corrections to the original sketch" at the end).

## Overview

```
 Student browser (static site on Netlify)
   |  Google Identity Services sign-in (needs the OAuth Client ID)
   |  grades the test locally (answer key ships with the test)
   |
   +--POST (text/plain JSON, no-cors)--------> Apps Script Web App --> Google Sheet
   |                                            (Submissions + Tests tabs)
   |                                                  ^
   +--POST (form-urlencoded to "/")--> Netlify Forms  |  optional outgoing webhook
                                          (backup) ---+  (deduplicated by submission_id)

 Teacher: /?admin=true --> builds tests, "Publish" --> Apps Script (ADMIN_KEY) --> Tests tab
                       <-- analytics reads results from the Submissions tab (ADMIN_KEY)
```

What you need: a Google account, a free Netlify account, a Git host (GitHub/GitLab/Bitbucket) holding this repo. Everything except the Google OAuth client and Apps Script URL works without any setup, so you can start locally.

---

## 1. Run it locally

```bash
npm start            # serves the site at http://localhost:3000 (no install step, no dependencies)
npm test             # unit tests (node --test)
npm run test:e2e     # browser tests (uses the pre-installed playwright package)
```

With no `GOOGLE_CLIENT_ID` configured, the landing page shows a **demo sign-in** (type any name and email). Enter `CHEM101` to take the bundled sample test. Open `http://localhost:3000/?admin=true` and enter the admin access code (`chemadmin` by default) to see the admin panel.

On `localhost`/`127.0.0.1` the Netlify Forms backup is skipped automatically, and Apps Script is skipped until you configure its URL. Submissions are still saved on the device ("This device" analytics).

---

## 2. Google Cloud: OAuth client for Google sign-in

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a project (for example **ChemistryWorks**).
2. Go to **APIs & Services > OAuth consent screen** (in newer consoles: **Google Auth Platform > Branding / Audience**).
   - If your school uses Google Workspace and only your own students should sign in, choose **Internal**. Nobody outside the domain can sign in, and no verification is needed.
   - Otherwise choose **External**. Sign-in only requests basic profile information (name, email, picture), which does not need Google verification, but you must fill in the app name, support email and developer contact. While the app is in "Testing" status, only listed test users can sign in; click **Publish app** to allow any Google account.
3. Go to **APIs & Services > Credentials > Create credentials > OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized JavaScript origins** (origins only: scheme + host + port, no path, no trailing slash):
     - `https://YOUR-SITE.netlify.app` (and your custom domain if you add one)
     - `http://localhost:3000`
     - `http://127.0.0.1:3000`
   - **Authorized redirect URIs: leave empty.** ChemistryWorks uses the Google Identity Services button/One Tap flow, which returns a credential to JavaScript on the page; it never redirects, so redirect URIs are not used.
4. Copy the **Client ID** (ends in `.apps.googleusercontent.com`). It is public, not a secret.
5. Optional: restrict who can sign in by setting `ALLOWED_EMAIL_DOMAINS: ['myschool.org']` in `js/config.js` (step 4). This is a client-side check; use an **Internal** consent screen if you need it enforced by Google.

New origins can take a few minutes (occasionally longer) to start working.

---

## 3. Google Sheet and Apps Script

1. Create a new Google Sheet, for example **ChemistryWorks Data**.
2. **Extensions > Apps Script**. Delete the placeholder code and paste the contents of `apps-script/Code.gs`.
3. (Optional) To pin the time zone and web-app settings from `apps-script/appsscript.json`: **Project Settings** (gear icon) > tick **Show "appsscript.json" manifest file in editor**, then open `appsscript.json` in the file list and paste the repo version. Skipping this is fine; the deployment dialog sets the same options.
4. Select the `setup` function in the toolbar and click **Run**. Approve the authorization prompts (you may need **Advanced > Go to ... (unsafe)**; this is your own script). `setup` creates the **Submissions** and **Tests** tabs with formatted headers and prints the next steps in the execution log.
5. **Set the admin key.** **Project Settings > Script properties > Add script property**: name `ADMIN_KEY`, value a long random passphrase. Without it, publishing tests and reading results from the admin panel are refused (`admin_key_not_configured`). Student submissions and loading published tests still work.
6. **Deploy > New deployment**, type **Web app**:
   - Description: `ChemistryWorks API`
   - **Execute as: Me**
   - **Who has access: Anyone** (required so students' browsers can post without a Google login prompt)
7. Click **Deploy** and copy the **Web app URL** ending in `/exec`. (The `/dev` URL is a test URL that only works for you; do not use it.)
8. Sanity check: open `YOUR_EXEC_URL?action=ping` in a browser. You should see `{"result":"success","version":"1.1.0"}`.

**Upgrading from 1.0.0 (adds grading):** paste the new `apps-script/Code.gs`, then redeploy as below. The first submission or `getResults` after the upgrade adds the new columns (Status, Final Score, Final Percentage (%), Grades (JSON), Graded At, Teacher Note) to your existing Submissions tab; old rows are kept.

**Updating the script later without changing the URL:** after editing `Code.gs`, choose **Deploy > Manage deployments**, click the pencil (**Edit**) on your existing deployment, set **Version: New version**, and **Deploy**. The `/exec` URL stays the same. If you instead choose **New deployment**, you get a different URL and must update `js/config.js`. Saving the file alone does not change what `/exec` serves.

---

## 4. Configure `js/config.js`

Edit the values at the top of `js/config.js`:

| Key | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID from step 2 |
| `GAS_WEB_APP_URL` | The `/exec` URL from step 3 |
| `SHEET_URL` | Link to your Google Sheet (shown in the admin panel) |
| `ADMIN_ACCESS_CODE` | Change from the default `chemadmin`; it only hides the admin UI |
| `ALLOW_DEMO_SIGNIN` | Set to `false` in production so only Google sign-in is offered |
| `ALLOWED_EMAIL_DOMAINS` | Optional, e.g. `['myschool.org']` |
| `NETLIFY_FORMS` | Leave `'auto'` (on everywhere except localhost) |

Commit and push. For quick experiments you can also define `window.CHEMISTRYWORKS_CONFIG = {...}` before `js/app.js` loads, but editing the file is the normal route.

---

## 5. Netlify

1. In [Netlify](https://app.netlify.com/): **Add new site > Import an existing project**, connect the repository.
2. Build settings: **Build command** empty, **Publish directory** `.` (these match `netlify.toml`, so the defaults are already right).
3. Deploy. Add your Netlify domain to the OAuth client's Authorized JavaScript origins (step 2) if you have not yet.
4. **Forms:** Netlify detects `<form name="chemistryworks-submissions" data-netlify="true">` in `index.html` during deploy. Check **Forms** in the site dashboard; `chemistryworks-submissions` should be listed. If the Forms page says detection is disabled, open **Site configuration > Forms** (older UI: **Forms > Settings**) and enable form detection, then trigger **Deploys > Trigger deploy > Clear cache and deploy site**.
5. **Optional webhook to the sheet:** **Forms > Form notifications > Add notification > Outgoing webhook**, pick the `chemistryworks-submissions` form, and paste the `/exec` URL. Netlify then POSTs every form submission to Apps Script, which stores it if it has not already. This is safe because the sheet de-duplicates on `submission_id`, so a submission delivered by both the browser and Netlify is stored once. It gives you a second route into the sheet if a student's browser could not reach Apps Script. (Netlify's free plan has a monthly form-submission quota; the backup posts count against it.)

---

## 6. Creating tests

Open `https://YOUR-SITE.netlify.app/?admin=true`, enter the admin access code, then:

- **Builder** tab: create a test visually or edit JSON, **Preview**, **Save draft** (stored in this browser only), **Download JSON**.
- **Settings** tab: paste your `ADMIN_KEY` (kept for the browser session only) and use **Ping backend** to verify the connection.
- **Publish** sends the test to the **Tests** tab of your sheet. Students can then open it by code from any device, with no redeploy.

Two ways to ship a test:

| | Bundled JSON | Published |
|---|---|---|
| Where | `data/tests/CODE.json` plus an entry in `data/tests/index.json`, committed to Git | Admin panel "Publish" (stored in the sheet) |
| Needs a redeploy | Yes | No |
| Version history | Git | Overwritten on re-publish (same code) |
| Works if Apps Script is down | Yes | No |

Test JSON reference (short): a test has `code`, `title`, optional settings (`timeLimitMinutes`, `shuffleQuestions`, `shuffleOptions`, `showResults`, `showCorrectAnswers`, `passingPercent`, ...) and a `questions` array. Question types are `mcq`, `multi`, `numeric`, `formula`, `truefalse` and `matching`; chemistry notation uses KaTeX with mhchem, e.g. `$\ce{H2O}$`. The full schema, scoring rules and numeric/formula matching behavior are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). `data/tests/CHEM101.json` is a complete example.

---

## 7. Verify end to end

- [ ] Local: `npm start` works; `npm test` and `npm run test:e2e` pass.
- [ ] `YOUR_EXEC_URL?action=ping` returns `success` and a version.
- [ ] Admin panel > Settings > **Ping backend** shows connected.
- [ ] On the live site, the Google sign-in button appears (not the demo form) and signing in shows your name and email.
- [ ] Take `CHEM101`: answer, submit, and see the score and review.
- [ ] The **Submissions** tab has a new row with the right name, email, test code, score, percentage and JSON responses.
- [ ] Submit the same attempt's retry (**retry-submit** on the results page, or the webhook if enabled): the sheet still has one row for that attempt.
- [ ] Netlify **Forms** shows the submission.
- [ ] Publish a test from the admin panel; open it by code in a private window from another account.
- [ ] Admin > Analytics with source "Sheet" loads the results.
- [ ] Go offline (browser dev tools), submit: the result is queued, and it is delivered on the next visit once you are back online.

---

## 8. Troubleshooting

**Google button missing or "Error 400: origin_mismatch" / "The given origin is not allowed for the given client ID".** The page's exact origin is not in the OAuth client's Authorized JavaScript origins. Origins must match scheme, host and port exactly (`http://localhost:3000` is different from `http://127.0.0.1:3000` and from `https://...`). Fix it in Cloud Console, wait a few minutes, and hard-reload.

**"Access blocked: app has not completed verification" / test users only.** The consent screen is External and in Testing status. Add the user as a test user or publish the app (basic scopes need no verification).

**Submissions do not appear in the sheet, and the browser shows no error.** Posts to Apps Script use `mode: 'no-cors'`, so the browser deliberately cannot read the response: any HTTP result looks like an opaque success, and only a network failure is reported. Open the Apps Script **Executions** page to see whether the request arrived and what error it threw. Common causes: the URL is a `/dev` URL, the deployment access is not **Anyone**, or the script was never authorized (run `setup` once).

**Apps Script "Authorization required" or a Google login page instead of JSON.** The deployment is not set to **Execute as: Me / Anyone**, or you have not run a function and granted permissions. Redeploy with the right settings.

**I changed `Code.gs` but behavior did not change.** The web app serves the deployed *version*, not the editor. **Deploy > Manage deployments > Edit > New version > Deploy** (keeps the URL).

**`admin_key_not_configured` / `unauthorized` in the admin panel.** Set the `ADMIN_KEY` script property (step 3.5), and enter the same value under Admin > Settings. Script property changes apply immediately; no redeploy needed.

**Netlify form not detected.** The form must be in the deployed `index.html` as static HTML (it is). Make sure form detection is enabled, then clear the cache and redeploy. Submissions made before detection was enabled are not retroactively recorded.

**Netlify backup returns an error on a custom setup.** Posts go to `/` on the same origin; they fail on hosts other than Netlify. Set `NETLIFY_FORMS: false` if you deploy elsewhere.

**A test I published is not found.** Codes are upper-cased (`chem101` opens `CHEM101`). Check the **Tests** tab of the sheet and that the page uses the current `/exec` URL.

**Very large tests.** A Sheets cell holds 50,000 characters. Publishing is refused with `test_too_large` beyond about 49,000 characters of test JSON; split the test or ship it as bundled JSON.

---

## 9. Limitations and security

- **Answer keys are client-side.** Grading happens in the browser, so the correct answers are in the downloaded test file and a determined student can find them with developer tools. Treat ChemistryWorks as a **formative, low/medium-stakes** tool (practice, quizzes, checks for understanding), not a proctored exam.
- **Scores are self-reported by the browser.** A student could forge a submission to the Apps Script URL. Compare against the review responses and use the tab-switch and auto-submit flags only as hints.
- **The admin access code is UI-only.** It is visible in `js/config.js`. What actually protects publishing tests and reading results is the **`ADMIN_KEY`** script property, checked server-side by Apps Script. Use a long random value and do not commit it.
- **Student data.** The sheet holds names, emails and answers. Keep it private to the teacher account, and follow your school's data-privacy policy (for example FERPA/COPPA). Anyone can POST submissions to the `/exec` URL and read published tests by code, but cannot read results without `ADMIN_KEY`.
- **Quotas.** Apps Script has daily execution limits and the script serializes writes with a lock; this comfortably handles a class at a time. Netlify Forms has a monthly submission quota on free plans.
- **Domain restriction** via `ALLOWED_EMAIL_DOMAINS` is client-side; use an Internal consent screen for enforcement.

---

## Corrections to the original sketch (spec section 8)

- OAuth: only **Authorized JavaScript origins** are needed for the Google Identity Services button flow. Redirect URIs are not used and should be left empty. A `127.0.0.1:3000` origin is added alongside `localhost:3000` because they are distinct origins.
- Apps Script: updating the script requires a **new version** on the existing deployment (Manage deployments > Edit), otherwise the `/exec` URL keeps serving old code; "New deployment" creates a new URL.
- Apps Script access must be **Anyone** (not "Anyone with Google account"), and the Web App URL used by the client must be the `/exec` one.
- Browser posts to Apps Script use `Content-Type: text/plain` with `no-cors`; `application/json` would trigger a CORS preflight that Apps Script does not answer.
- The Netlify outgoing webhook delivers `{ "data": {...form fields...} }`, which `Code.gs` understands, and duplicates are dropped by `submission_id`.
- The script now also stores published tests and serves results, protected by `ADMIN_KEY`.
