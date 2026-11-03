# ChemistryWorks

A lightweight, serverless chemistry testing platform: Google sign-in, thirteen question types (ten auto-graded, including Lewis dot diagrams, full Lewis structures for bonding, fill-in-the-blank and ordering, plus teacher-graded short answer, open response with rubrics and orbital diagrams), instant client-side scoring, light / dark mode, and submissions synced to Google Sheets (with Netlify Forms as a backup).

- **Students** sign in with Google, enter a test code (or open `/test?code=CHEM101`), and take a focused, auto-saved, keyboard-friendly test with live formula rendering.
- **Teachers** open `?admin=true` to build tests visually or as JSON, preview them, publish them to the Sheet, grade open-ended answers (with rubric checkboxes), and export final scores for a gradebook.

Everyone can switch **light / dark / system** theme and pick an accent colour from the sun/moon button in the header. Students and the teacher panel keep separate accents (blue and violet by default), so it is always obvious which mode you are in.

Turn off **Show score to students** on a test and students only see "Submission received"; you review and grade every answer privately in the **Grading** tab, then export the final scores (CSV) to copy into Aeries or Google Classroom.

## What's new in v2

- **Submission counts** in the teacher's test library (completed submissions per test, shown once the Apps Script URL and admin key are set).
- **Split-screen reference pane**: tests can attach a periodic table, text notes (constants, formulas) and images that students view beside the questions, resize and collapse without losing answers.
- **Partial credit and overrides**: Full / Half / Zero buttons or any score from 0 to the question's points; changing an auto-graded score is saved as an override.
- **Sections**: named groups of questions with instructions and automatically calculated point totals; unsectioned questions still work.
- **Orbital diagrams**: a new teacher-graded question type where students place up / down electron arrows.
- **Lewis brackets and charges**: structure questions can require brackets, an overall charge and per-atom formal charges (teacher graded).
- **Comments and release**: add formatted comments to individual questions; students see them only after you release the grade.
- **PDF export**: print one student's reviewed submission (scores, answers, diagrams, and comments if released).
- **Lab-notebook look**: warm paper surfaces, ink-blue text and monospace formulas, full on student screens and toned down for the teacher panel.

Existing tests, submissions and grades keep working unchanged. Upgrading the backend is described in [DEPLOYMENT.md](DEPLOYMENT.md#upgrading-to-v2).

## Teacher workflow: grade, comment, release, export

1. Open **Grading** in the admin panel and pick a submission (filter by **Needs grading**).
2. Score each question with **Full / Half / Zero** or type a number (0 to the question's points). Auto-graded answers keep their automatic score unless you override it.
3. Optionally write a **comment** on any question (bold, italic, lists and links are supported).
4. Tick **Release grade & comments to student** and **Save**. Until released, students see neither your comments nor the final grade details.
5. Click **Export PDF** to print that student's reviewed submission (comments are included only after release). **Export grades** still downloads the CSV of final scores.

**Students:** after signing in, **Your submitted tests** on the home screen lists past submissions. Once the teacher has released a grade, **View feedback** shows the score and the teacher's comments. This works on the device the student submitted from.

## Quick start

```bash
npm start          # http://localhost:3000  (demo sign-in is enabled until a Google Client ID is set)
```

Open http://localhost:3000/?admin=true (code `chemadmin`) for the admin panel.

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
| Ordering | arrange items (drag or arrow buttons) | per-position partial credit |
| Fill in the blanks | inline blanks (text, number or formula), optional word bank | per-blank partial credit |
| Lewis dot diagram | dots around one element | valence count + placement |
| Lewis structure (bonding) | bond orders + lone pairs on a molecule / polyatomic ion skeleton | exact (resonance forms accepted), optional partial credit |
| Lewis structure with brackets and charges | as above, plus brackets, an overall charge and per-atom formal charges (`studentCharges`) | teacher graded |
| Orbital diagram | up / down electron arrows in s, p, d or f orbital boxes | teacher graded in the admin **Grading** tab |
| Short answer | free text | teacher graded in the admin **Grading** tab |
| Open response | long free text, optional rubric and word range | teacher graded with rubric checkboxes |

That is thirteen types; the two Lewis structure rows are one question type (`structure`) with `studentCharges` off or on.
Formula, numeric and fill-in questions automatically show students **how to type charges** (`SO4^2-`, `Na^+`) or **powers of ten** (`6.02e23`) when the answer needs them, with insert buttons for `^ + −` and `×10^`.

The full test JSON schema and module contracts are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). To have an AI write tests for you, give it [docs/guide.md](docs/guide.md).

## Deploying

See [DEPLOYMENT.md](DEPLOYMENT.md) for Google Cloud (sign-in), Google Sheets + Apps Script (backend), and Netlify setup, and fill in `js/config.js`.

## Project layout

```
index.html            app shell + hidden Netlify form
js/                   app (ES modules, no build step)
css/                  styles
data/tests/           bundled tests (index.json = catalog; ships empty)
test/fixtures/tests/  sample tests used only by the automated test suite
apps-script/Code.gs   Google Apps Script backend
test/                 unit + E2E tests
```
