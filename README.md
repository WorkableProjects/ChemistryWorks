<p align="center">
  <img src="assets/brand/wordmark.png" alt="ChemistryWorks" width="440">
</p>

<p align="center">
  A chemistry assessment platform for teachers and students.
</p>

ChemistryWorks lets teachers create and manage chemistry assessments, review student work, and share feedback. Students can complete assignments online, with support for chemical formulas, diagrams, and other chemistry-specific answers.

## Features

### For teachers

- Create assessments with a visual editor or JSON, then preview and publish them.
- Use a broad range of question formats, including auto-graded and teacher-graded questions.
- Review submissions, award partial credit, add comments, and release grades when ready.
- Organize tests with classes, rosters, question banks, and randomized pools.
- Export grades as CSV and reviewed submissions as PDF.
- Use classroom tools such as assessment insights, print versions, and activity logs.

### For students

- Sign in with Google and access assigned assessments from the student dashboard.
- Complete assessments with autosave and chemistry-aware formula rendering.
- Use available study tools such as a calculator, constants, scratchpad, and read-aloud support.
- View released grades and teacher feedback.

The platform also supports light, dark, and system themes. See the [teacher guide](docs/guide.md) for detailed instructions and the [architecture notes](docs/ARCHITECTURE.md) for the test schema and module contracts.

## Run locally

Requirements: Node.js 20 or later.

```bash
npm start
```

Open <http://localhost:3000>. The local demo sign-in is enabled until a Google Client ID is configured. To open the admin panel, visit <http://localhost:3000/?admin=true> and use the demo code `chemadmin`.

## Tests and validation

```bash
npm test                 # Unit tests
npm run test:e2e          # Playwright browser tests
npm run validate:tests    # Validate test files in data/tests/
```

The application and unit tests use Node's built-in runner and do not require additional dependencies. End-to-end tests require Playwright and Chromium.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for setup instructions for Google sign-in, Google Sheets and the Apps Script backend, and Netlify. Add the required project settings to `js/config.js` before deployment.

For existing installations, consult the upgrade instructions in [DEPLOYMENT.md](DEPLOYMENT.md#upgrading-to-v4).

## Repository structure

```text
index.html            Application shell
js/                   JavaScript application modules
css/                  Stylesheets
data/tests/           Bundled test catalog and test data
apps-script/Code.gs   Google Apps Script backend
test/                 Unit and browser tests
```
