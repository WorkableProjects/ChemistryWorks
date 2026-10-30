# ChemistryWorks

A lightweight, serverless chemistry testing platform: Google sign-in, seven question types (six auto-graded, plus teacher-graded short answer), instant client-side scoring, and submissions synced to Google Sheets (with Netlify Forms as a backup).

- **Students** sign in with Google, enter a test code (or open `/test?code=CHEM101`), and take a focused, auto-saved, keyboard-friendly test with live formula rendering.
- **Teachers** open `?admin=true` to build tests visually or as JSON, preview them, publish them to the Sheet, grade open-ended answers, export final scores for a gradebook, and view analytics.

Turn off **Show score to students** on a test and students only see "Submission received"; you review and grade every answer privately in the **Grading** tab, then export the final scores (CSV) to copy into Aeries or Google Classroom.

## Quick start

```bash
npm start          # http://localhost:3000  (demo sign-in is enabled until a Google Client ID is set)
```

Open http://localhost:3000/?code=CHEM101 to take the sample test, or http://localhost:3000/?admin=true (code `chemadmin`) for the admin panel.

## Tests

```bash
npm test           # unit tests: grading, formulas, schema, submission pipeline, Apps Script backend
npm run test:e2e   # browser tests (Playwright/Chromium) of the full student and admin flows
npm run validate:tests   # validate every test JSON in data/tests/
```

No dependencies are needed for the app or unit tests (Node's built-in runner, Node 20+). E2E tests need Playwright with Chromium available; if it isn't installed globally, run `npm i --no-save playwright && npx playwright install chromium` first.

## Question types

| Type | Answer | Grading |
|---|---|---|
| Multiple choice | one option | exact |
| Multiple select | several options | exact, optional partial credit |
| Numeric | number (`6.02e23`, `6.02×10^23`, units allowed) | absolute or percent tolerance |
| Chemical formula | `H2SO4`, `CuSO4·5H2O`, `SO4^2-` | normalized formula match |
| True / False | true/false | exact |
| Matching matrix | pairs | per-pair partial credit |
| Short answer | free text | teacher graded in the admin **Grading** tab |

The full test JSON schema and module contracts are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). To have an AI write tests for you, give it [docs/guide.md](docs/guide.md).

## Deploying

See [DEPLOYMENT.md](DEPLOYMENT.md) for Google Cloud (sign-in), Google Sheets + Apps Script (backend), and Netlify setup, and fill in `js/config.js`.

## Project layout

```
index.html            app shell + hidden Netlify form
js/                   app (ES modules, no build step)
css/                  styles
data/tests/           bundled tests (index.json = catalog)
apps-script/Code.gs   Google Apps Script backend
test/                 unit + E2E tests
```
