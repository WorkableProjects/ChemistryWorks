# ChemWorks v6.0 — Plan

> **Status:** Draft for review. Answer the Open questions at the end, then this plan gets split into agent briefs
> (`docs/v6/delegations/`) the way v5 was.
> **Version:** 6.0.0 (major: `apps-script/Code.gs` changes how submissions, tests and tokens are handled → `BACKEND_VERSION` raised)
> **Builds on:** v5.0.1 (Class Hub, student home + profile, 12 game modes on one shared attempt, 42 question types, data store)

## Why v6 is mostly a "make it solid" release

v5 added a lot in one weekend, and its own progress log (`docs/archive/v5/v5-progress.md`) shows what that cost:

- Tests were skipped under an "ASAP" override, apart from `changelog.test.mjs`. The 5.0.0 release then **did not load for anyone**
  (a missing export), which 5.0.1 fixed the same day. CI runs only unit tests, and only on push to `main`. A browser
  test in CI would have caught it before release.
- Five v5 pieces were skipped: S08c (code splitting), S08d (performance test), S13b (PWA/offline), S13c (practice sets) and
  S14a (accessibility audit + flag clean-up).
- None of the v5 backend actions and none of the v5 client modules have tests (details in Research).
- The backend trusts the browser for identity on submit, answer keys and scores (details in V6-02).

So v6 does three things, in this order:
1. **Trust:** CI that blocks bad releases, tests for everything v5 added, and the security holes closed.
2. **Debt:** finish v5's skipped work and remove the v2–v5 layers that slow every change.
3. **Features:** two teacher-facing features: Google Classroom grade sync and question tagging.

## Scope

| ID | Requirement | Priority |
|---|---|---|
| V6-01 | CI + test coverage: e2e on every PR, v5 coverage, no sleeps | High (first) |
| V6-02 | Security and integrity of submissions, tests and feedback | High |
| V6-03 | Backend performance and data hygiene (locks, full-sheet reads, pruning) | High |
| V6-04 | One question-type system (move the 20 built-in types into the registry) | High |
| V6-05 | Code clean-up: flags, dead branches, compatibility shims, split runner/builder, CSS loading | Medium |
| V6-06 | Accessibility audit (WCAG 2.1 AA), carried over from S14a | Medium |
| V6-07 | Offline and install (PWA), carried over from S13b | Medium |
| V6-08 | Deployment automation (clasp, config, post-deploy check) | Medium |
| V6-09 | New features: Google Classroom grade sync + question tagging | Medium |
| V6-10 | Docs, changelog, release | High (last) |

---

## Research: what the code does today

### Size and shape

- About 30k lines of JS, CSS and data, plus a 2,444-line `apps-script/Code.gs`. The site has no build step: it uses native ES modules, and `index.html` loads **34 stylesheets** with `<link>` tags.
- Biggest files:

  | File | Lines |
  |---|---|
  | `js/views/admin/builder.js` | 1,133 (one `renderBuilder` closure, 165–1133) |
  | `js/views/runner.js` | 824 (one `render` closure, 49–~800) |
  | `js/lib/schema.js` | 799 |
  | `js/views/admin/editors/core.js` | 677 |
  | `js/views/admin/grading.js` | 663 |
- There are no TODO, FIXME or HACK markers. The debt is in the structure, not in notes left in the code.

### Question types: two parallel systems

- **20 built-in types** are handled in `switch` blocks:
  - `grading.js` (57 cases), `schema.js` (59), `runner/widgets.js` (20) and `editors/core.js` (20).
  - The types: mcq, multi, numeric, formula, truefalse, matching, ordering, fillblank, lewis, structure, orbital, short, open, balance, econfig, ptable, sigfigs, categorize, hotspot, graph.
- **22 newer types** use the registry: `js/lib/qtypes/<t>.js` plus `js/views/qtypes/<t>.js`, loaded by `lib/qtypes/v4-types.js`.
- Every consumer tries `typeDef()` first and then falls back to the switch. A change that touches every type therefore touches two systems.
- `schema.js` imports all 22 registry definitions at startup, so the landing page pays for them.

### Feature flags

- All 13 `FEATURES` in `js/config.js` are `true`.
- `teacherTools` is never read anywhere.
- The flag-off branches are dead code. Examples:
  - The whole pre-shell admin tab UI (`admin.js:60-190`).
  - The `v2 ?` conditionals in `builder.js` and `library.js`.
  - The non-store path in `library.js`.
  - The `!feature('appearance')` branch in `theme.js`.
  - The `classHub` ternaries in `classes.js`, `accommodations.js`, `grading.js` and `student.js`.

### Compatibility shims

- `LEGACY_TO_MODE` and `?game=` mapping (`game.js:8`).
- Section type `constants→resources` (`sections.js:79`).
- The `ADMIN_KEY` fallback, marked "upgrade period" (`admin-session.js:4`).
- `unavailable` replies for older `Code.gs` versions (`api.js:274,287`).
- The hidden Netlify Forms form (`index.html:73-90`) and `netlify.toml`, even though hosting is GitHub Pages and `NETLIFY_FORMS:false`.

### Duplication

- Date formatting is written four times: `submitted.js`, `admin/common.js`, `hub/data.js`, `notifications.js`.
- The `formulaToHTML` wrapper is written three times.
- There are two catalog files (`catalog.json` plus a fallback `index.json`).
- `admin-shell.css` is both linked in `index.html` and lazy-loaded.
- The boot-loader SVG is copied by hand between `index.html` and `flaskSvg()`.

### Backend (`Code.gs` 5.0.0)

- **Storage:** 17 tabs in one Sheet, created lazily by `getSheet_`, which also adds missing columns.
- **Auth:**
  - Students sign in with a Google ID token checked against `tokeninfo` (cached up to 6 h).
  - Admins use an ID token plus the `Admins` sheet, or the legacy `ADMIN_KEY`.
- **Locking:** one script-wide `withLock_` (10 s wait) serialises **every** write, including student progress pings and syncs.
- **Full-sheet reads:**
  - `getResults_` reads every Submissions row, including the answers JSON.
  - `testSummaries_` and `assignedTests_` parse every test.
  - `accommodationFor_` reads the whole Accommodations sheet, and `buildHub_` calls it **once per assignment**.
  - `upsertByKey_` reads a whole sheet under the lock, and `syncProgress_` calls it 2–3 times.
  - `getSheet_` re-reads the header row on every call.
- **Never pruned:** `Live`, `Log`, `Errors` and `Stream` only grow.
- **Errors:** the catch-all sends `String(err)` back to the client.
- **Version mismatch:** `VERSION` is still `'5.0.0'`. That is correct (5.0.1 was site-only), but two test files hard-code it.

### Client API

- `js/lib/api.js` never throws. It has no retry or backoff, apart from one token refresh for admins.
- `js/lib/store.js` keeps a 60 s cache plus a warm copy in `sessionStorage`. It de-duplicates requests and rolls back failed optimistic writes.
- **Submissions are posted with `mode: 'no-cors'`** (`submit.js:98`). The browser can't read the reply, so a lock timeout or `submission_too_large` looks like success and is never queued for retry. On Pages there is no Netlify backup, so **a failed submission can be lost silently**.
- `js/lib/sync.js` queues progress (at most every 30 s, backoff up to 5 min, flushed on `pagehide`).
- `hub/data.js:18` still says the backend lacks `listStream`. It has it now, and any error, including an auth error, silently falls back to empty data.

### Tests and CI

- **Files:** 52 unit and 22 e2e. 38 unit and 16 e2e files are named after the version that added them (`v2-*`, `v25-*`, `v4-*`).
- **Unit tests:** **791 / 791 pass** (2026-11-13).
- **E2E tests:** the full run was still in progress when this plan was written. At least three already fail:
  - "library lists CHEM101 and the new bank tests"
  - "short answer: score is provisional…"
  - "hidden score: student only sees 'Submission received'"
- **No tests at all for:**
  - The v5 backend actions: `syncProgress`, profile, `getClassHub`, assignments, stream, `batch`, `remindMissing`, `markNotificationsRead`.
  - The v5 client modules: `sync`, `store`, `profile`, `xp`, `attempt`, modes, hub.
  - The student home, Class Hub or game modes in the browser.
- **Unused fixtures:** `test/fixtures/v5/*.json` is not referenced by any test.
- **Game tests:** deleted in v5 (`3a7ff78`) and not replaced.
- **Fixed sleeps in e2e:** `helpers.mjs`, `admin`, `v2-grading` (1.5 s), `v25-runner`, `v4-hotspot`, `v4-qtypes-s08`, `v4-admin-shell`.
- **CI** (`.github/workflows/pages.yml`):
  - Runs on push to `main` only, with no PR trigger.
  - Runs `npm test` (unit), then deploys.
  - No e2e, no `validate:tests`, no lint.
  - Playwright is assumed to be pre-installed and isn't in `package.json`.

### Deployment

- **Manual steps** in `DEPLOYMENT.md`:
  - Paste `Code.gs` and `appsscript.json` by hand.
  - Run `setup` in the editor and approve permissions.
  - Set five script properties.
  - "Manage deployments → Edit → New version". Choosing "New deployment" changes the URL and breaks the site.
  - Check `?action=ping` by eye.
  - Edit `js/config.js` by hand.
- **Out-of-date content:**
  - `DEPLOYMENT.md` is Netlify-first, its ping example says 3.0.0 and its type list is from v1.
  - `README.md` points to Netlify and to "Upgrading to v4".
- **Guide fallback broken on Pages:** the workflow doesn't publish `docs/`, so the builder's fallback copy of `docs/guide.md` returns a 404 on the live site.

---

## V6-01 — CI and test coverage (do this first)

**Rule for all of v6:** nothing merges unless `npm run test:all` and `npm run validate:tests` pass. Skipping tests to save time, as v5 did, is not allowed.

- **CI workflow** (`.github/workflows/ci.yml`, new):
  - Runs on `pull_request` and on push to any `claude/**` or `main` branch.
  - Jobs: unit, e2e (Playwright from `package.json` as a devDependency, Chromium installed in CI), `validate:tests`, and a "site boots" smoke test that loads `/` and fails on any console error or a loader still showing after 5 s.
  - `pages.yml` deploys only after CI passes on `main`.
- **Fix the failing e2e tests** at their cause. If the full run turns up more failures, list them in `v6-progress.md` before any feature work starts.
- **Backend tests**, using the existing `vm` harness in `apps-script.test.mjs`:
  - Every v5 action: `getStudentProfile`, `saveStudentProfile`, `syncProgress` (XP never drops, daily cap), `getClassHub`, `saveAssignment` / `deleteAssignment` / `listAssignments`, `postStream` / `listStream` / `deleteStreamPost`, `getAssignmentStatus` (missing / late / turned in at the due-date boundary, accommodations), `remindMissing`, `markNotificationsRead`, and `batch` (allowlist, 50-item cap, per-item errors).
- **Client unit tests:** `attempt`, `store` (cache, de-duplication, rollback), `sync` (throttle, backoff, merge), `profile`, `xp`, mode scoring.
- **Use the v5 fixtures:** `test/fixtures/v5/*.json` should drive one test per type: render → answer → grade → results → PDF export.
- **New e2e tests:**
  - Student home.
  - Class Hub: teacher assigns → student sees Up next → opens with no code → submits late → tracker shows Late.
  - Every game mode × one auto-graded and one teacher-graded type.
  - Mode switch keeps answers.
  - The v5 performance targets (the old S08d brief: draft delete < 100 ms with no network, and so on).
- **Remove fixed sleeps:** replace `waitForTimeout` and sleeps with `waitForSelector`, `expect.poll` or the response itself.
- **Rename test files** by area instead of version (`v4-hotspot` → `qtype-hotspot`, `v2-grading` → `grading-ui`). Do this in its own commit so `git log --follow` still works.

## V6-02 — Security and integrity

Each item is checked against `Code.gs` 5.0.0.

| # | Problem | Fix |
|---|---|---|
| 1 | `handleSubmission_` stores `s.student_email` **from the request body**, and the single-submission check uses the same claimed email. Anyone can submit as anyone. | When a token is sent, the stored email and name come from the token. Without a token, accept only when `ALLOW_UNVERIFIED_EMAIL` is set, and mark the row "unverified" in grading. |
| 2 | GET `getTest_` checks only the open/close window, **not `rosterOnly`**. Only the POST form does. A full test, including answer keys, is served to anyone with the code. | Remove the GET path for tests that are roster-only or hide answers. The client already prefers POST with a token. |
| 3 | Answer keys ship to the browser for every auto-graded type, and scores are calculated by the client. | **Server-side grading** (Open question 2). Build step: `scripts/build-gas.mjs` bundles `js/lib/grading.js` + `formula.js` + the qtype graders into `apps-script/grading.gs`. `submit` re-grades from the stored test and saves the server score. Students get the test **without keys** (`stripKeys(test)`); "instant feedback" in game modes calls a light `checkAnswer` action, or stays local only for tests marked "practice". |
| 4 | `getFeedback` accepts submission ID + email with **no token**. | Require the token, and the email must match the row. |
| 5 | Formula injection: `text_()` is skipped for Students `name`, Attempts `mode`, `lastActiveDate`, Stream `createdBy` and Assignment `classId`. | Send every user-supplied cell through `text_()`. Add a test that writes `=HYPERLINK(...)` to every column. |
| 6 | The catch-all sends `String(err)` to the client. | Log the full error to `Errors` and return a code plus a short ID. |
| 7 | `reportError` has a **global** limit of 60/h, so one sender can block everyone's reports. | Limit per sender (token email or a hashed client ID), plus a larger global limit. |
| 8 | `ADMIN_KEY` is compared with `!==` and has no rate limit. | Use a constant-time compare and a lock-out after N failures per hour. Plan to remove the key: Google admin sign-in is the default now (Open question 3). |
| 9 | Submissions are posted with `no-cors`, so failures are invisible and can be lost. | Post `text/plain` with normal CORS (Apps Script allows it, as `api.js` already does). Read the reply; on error or timeout, keep the submission in the outbox and show "Not sent yet — we'll retry". |
| 10 | Client-trusted values: game scores up to 100,000, XP, badges and `streakDays`. | Calculate the streak on the server from activity dates. Cap the score per mode from the question count. Accept badges only from a known list. |
| 11 | XSS risk from teacher content: `innerHTML` sinks at `ui.js:39` (`html:` prop, about 21 call sites), `reaction.js` `joinHTML`, econfig `configToHTML`, `bohr.js:54`. | Audit every `html:` call site. Escape inputs in those helpers, with unit tests using `<img onerror>` payloads. Add a Content-Security-Policy `<meta>` (self + cdnjs + Google + fonts). Add SRI on the KaTeX and font links. |
| 12 | `ADMIN_ACCESS_CODE: 'chemadmin'` is in the public repo. | When `adminAccounts` is on (it is), drop the access-code gate entirely: admin = Google sign-in on the `Admins` sheet. |

## V6-03 — Backend performance and data hygiene

- **Locks:**
  - Use `LockService.getScriptLock()` only for writes that must be atomic (grades, upserts).
  - `appendRow` for submissions, live pings and errors needs no lock.
  - Use a short `tryLock` for progress sync, and on failure tell the client "retry later" instead of waiting 10 s.
- **Row index cache:** `CacheService` maps `key → row number` for Students, Attempts and Submissions (`email|code`). `upsertByKey_` then reads one row instead of the whole sheet. Rebuild the map when a lookup misses.
- **Read only the columns needed:** `getResults_` without the answers JSON unless `includeAnswers`. The summary for the library and the hub is a separate cached view.
- **Fix N+1 calls:** read Accommodations once per request in `buildHub_` and `getAssignmentStatus`.
- **Header cache:** cache the header map for each sheet per execution.
- **Pruning:** a daily time trigger (`setupTriggers()`) trims `Live` older than 1 day, `Log` and `Errors` older than 180 days, and archives `Stream` posts older than a school year to `Stream_archive`. Retention is set in `Settings`.
- **Leaderboard:** `clearLeaderboard_` should rewrite the range in one call instead of deleting rows one at a time.
- **Measure before and after:** a `?action=diag` admin action reports sheet row counts and the timing of the hot actions, shown in admin → Platform.

## V6-04 — One question-type system

- Move the 20 built-in types into `js/lib/qtypes/<type>.js` + `js/views/qtypes/<type>.js` + `editors/<type>.js` with the same `TypeDef` contract the 22 registry types use. Delete the `switch` blocks in `grading.js`, `schema.js`, `runner/widgets.js` and `editors/core.js`.
- Lazy-load the UI for each type (`await loadTypeUI(type)`). The definitions stay small and synchronous for grading and for the `Code.gs` bundle (V6-02 #3).
- Add one **conformance test** that loops over the registry. For every type it checks: normalize → validate → render in the runner and every mode → answer from the fixture → grade → results → PDF → `stripKeys` removes the key.
- Rename `v4-types.js` to `qtypes/index.js`, and split the CSS by type (`qt-<type>.css`) instead of by session (`qtypes-s08/s09/s10.css`).
- Order: the simple types first (mcq, multi, truefalse, numeric, formula), then the structured ones, then lewis, structure, orbital and graph.

## V6-05 — Code clean-up

- **Feature flags:** remove all 13 flags and the dead branches listed in Research. Keep a separate `KILL_SWITCHES` object for things a teacher might need to turn off on a live site (`classHub`, `gameModes`, `studentSync`).
- **Compatibility shims:**
  - Remove the Netlify form in `index.html`, `NETLIFY_FORMS` and the Netlify POST in `submit.js`. Keep `netlify.toml` (rollback) or delete it (Open question 3).
  - Remove the `constants→resources` mapping once `validate:tests` shows no bundled test uses it. Add a one-time migration when a test is opened in the builder.
  - Remove the `api.js` `unavailable` paths for backends older than `BACKEND_VERSION`. The version banner already covers them.
- **Split the big closures** (the old S08c brief):
  - `runner.js` → `runner/{timer,drawer,nav,submit,shortcuts,live}.js`
  - `builder.js` → `builder/{settings,questions,import,publish,preview}.js`
  - Keep the public exports the same.
- **CSS:**
  - Load view CSS with the view (`ensureCss(name)` used everywhere, not only the admin shell).
  - `index.html` keeps base + landing only.
  - Put `?v=SITE_VERSION` on every CSS and JS URL, not just two.
- **Shared helpers:** `formatDate`/`formatDue` in `js/lib/dates.js`, the formula span in `ui.js`. Generate the boot loader SVG from one source.
- **One catalog:** `catalog.json` only. `build-catalog` runs in CI and fails if it would change the file.
- **One storage path:** `attempt.js` should use `storage.js`, not `localStorage` directly.
- **Consistent cleanup contract:** views and modes both return a cleanup function.
- **Comments:** strip the session tags (`// v4 S12:`, about 313 of them), because `git blame` has that history.

## V6-06 — Accessibility (the old S14a brief)

- **Fix first:** `#app` has `aria-live="polite"` on the whole app, so every view change is read out in full. Remove it. Announce view changes with one polite live region ("Test: Atoms, question 1 of 12"), and move focus to the view's `<h1>`.
- **Audit (WCAG 2.1 AA):**
  - Areas: student home, profile, class page, notifications, every game mode, the runner with every type, admin hub / tracker / student view, appearance panel, sidebar collapsed + drawer.
  - Checks: keyboard access, focus order, names and roles, 200% zoom, a 360 px width, reduced motion, and `prefers-contrast: more`.
- **Keyboard support for drag and pointer widgets:** hotspot, categorize, ordering, molbuild, ionicformula, bohr, graph plotting and the structure editor. Every one needs an alternative to dragging (pick, then place).
- **Automated check:** add `axe-core` (devDependency) in an e2e pass over every view in both themes, with zero serious or critical issues allowed.

## V6-07 — Offline and install (the old S13b brief)

- Add `manifest.webmanifest` and a service worker (`sw.js`) that precaches the app shell, CSS, JS and fonts, versioned by `SITE_VERSION`.
- Tests: network-first, falling back to cache.
- Answers already autosave locally. With V6-02 #9, submissions queue in the outbox and send when back online. The banner says "Offline — your answers are saved on this device".
- When a new version is ready, show "Update available — reload" instead of mixing old and new files. That is the same problem as the "v4.0.0 label after upgrade" bug in v5.
- Note: Pages serves the site under `/ChemistryWorks/`, so the service worker scope and every URL must stay relative.

## V6-08 — Deployment automation

- **clasp:** `apps-script/.clasp.json.example` and `npm run gas:push`. A manual GitHub Action (`gas-deploy.yml`) pushes `Code.gs` and updates the **existing** deployment ID (`clasp deploy -i <id>`), so the URL never changes. It then calls `?action=ping` and fails if the version doesn't match.
- **`setup()`:** it already creates every tab. Also have it set default script properties and the pruning trigger, and return a checklist of what is still missing (OAuth client, `ADMIN_EMAILS`).
- **Config:** `js/config.js` keeps public values only. The Pages workflow can override them from repository variables (`GAS_WEB_APP_URL`, `GOOGLE_CLIENT_ID`, `SHEET_URL`) by writing `js/config.local.js`, so a second school can deploy a fork without editing code.
- **Pages:** publish `docs/guide.md` in the site artifact so the builder's fallback works.
- **Admin → Platform:** the "copy deployment for another teacher" guide becomes a checklist that marks what is done (backend version, OAuth origin reachable, Admins row present).

## V6-09 — New features: Google Classroom grade sync + question tagging

These two are the v6 features. Everything else that was listed as a candidate (practice sets, live class game, bank sharing, rubric grading) moves to 6.1+.

### A. Google Classroom grade sync

**Goal:** a teacher links a ChemistryWorks assignment to Google Classroom and clicks **Sync grades**, and released scores land in the Classroom gradebook. No more CSV export and copy-paste.

**Facts that shape the design** (Classroom API, called from Apps Script through the **Classroom advanced service**):
- **The coursework must be created by the same Google Cloud project.** The API lets a project change grades only on coursework that project created (`ProjectPermissionDenied` otherwise). So ChemistryWorks **creates** the Classroom assignment itself; it cannot write grades into an assignment a teacher already made by hand in Classroom.
- **The script acts as the person who deployed it** (`executeAs: USER_DEPLOYING`). Sync works only for courses where that account is a teacher or co-teacher. Each teacher who wants sync runs their own copy of the deployment, or adds the deploying account as a co-teacher. The admin UI says which account sync runs as.
- **New OAuth scopes** in `appsscript.json`:
  - `classroom.courses.readonly`
  - `classroom.rosters.readonly`
  - `classroom.profile.emails` (match students by email)
  - `classroom.coursework.students` (create coursework and set grades)
  
  Re-running `setup` asks the deployer to approve them once. No client-side Google scopes change, and students never see a Classroom prompt.
- Grades are written as `draftGrade` and/or `assignedGrade` on each student's submission, out of the coursework's `maxPoints`.

**Teacher flow**
1. **Admin → Classes → a class → Link to Google Classroom:** pick a course from the deploying account's courses (`Courses.list({ teacherId: 'me', courseStates: ['ACTIVE'] })`). The link is saved on the class (`Classes.classroomCourseId`).
   - Optional **Import roster from Classroom** fills the class's email list from `Courses.Students.list` (replaces pasting a CSV).
2. **Assign** (the existing Class Hub assign dialog) gets a **Post to Google Classroom** switch.
   - When on, ChemistryWorks creates a Classroom assignment with the same title, instructions, due date and `maxPoints` = the test's points, and a link to the test (`?code=…`).
   - It stores the IDs on the assignment (`Assignments.classroomCourseWorkId`).
   - Publishing on a schedule (`publishAt`) creates the coursework as a draft (`state: DRAFT`), then publishes it at the same time.
3. **Sync grades** (assignment tracker + grading view):
   - **What is sent:** each student's **final** score (after teacher grading and regrades). Only **released** submissions are sent as `assignedGrade`; graded-but-unreleased ones are sent as `draftGrade` only (Open question 7).
   - **Who it matches:** students are matched by email via `userProfiles.emailAddress`.
   - **Before syncing:** a preview table shows email, ChemistryWorks score, the current Classroom grade, and the action (new / update / no change / not on the Classroom roster).
   - **After syncing:** the result per student goes to `Log` and shows in the tracker as "Synced 3:41 PM".
   - **Never overwrite** a grade a teacher typed directly in Classroom unless the teacher ticks "Overwrite Classroom changes". ChemistryWorks stores the last value it sent (`ClassroomSync` sheet) and compares.
4. **Auto-sync on release:** with the class setting on, releasing grades also syncs them (best effort; failures show on the tracker with Retry).

**Backend (`Code.gs`)**
- **New admin actions:**
  - `listClassroomCourses`
  - `linkClassroomCourse`
  - `importClassroomRoster`
  - `previewGradeSync`
  - `syncGrades` (batched; uses `batch` + the narrower locks from V6-03)
- **Changes to existing actions:** `saveAssignment` gains `postToClassroom`; `deleteAssignment` asks whether to delete the Classroom coursework too.
- **New sheet `ClassroomSync`:** `assignmentId, email, courseWorkId, submissionId, sentGrade, sentAt, status, error`.
- **New columns:** `Classes.classroomCourseId` and `Assignments.classroomCourseWorkId`. `getSheet_` adds missing columns as it does today.
- **Rate limits:** Classroom API calls are throttled (about 1 per 100 ms). A class of 35 is a few seconds, and larger syncs continue in the next request with a cursor.

**Without Classroom:** the CSV export stays and is reformatted as a CSV that Classroom's "Import grades" accepts.

**Tests**
- **Unit:** score-to-grade mapping, released vs draft rules, the overwrite guard, email matching (case, missing students).
- **Backend, in the `vm` harness:** a fake `Classroom` service covering create coursework, list submissions, patch grades, the permission-denied path and paging.
- **E2E:** link course → assign with "Post to Classroom" → grade + release → preview shows the right actions → sync → tracker shows "Synced".

### B. Question tagging (local until published, then shared through the Sheet)

**Goal:** teachers make tags (e.g. "Ions", "Stoichiometry", "NGSS HS-PS1-7", "Unit 3") and put them on questions. A tag stays in the teacher's browser, like a draft, until a **published** test uses it. Publishing writes it to the Sheet, and from then on it is the same tag everywhere: builder, grading, results, tracker, student profile, and **other teachers' builders**. **There is no question bank feature here.** Tags are labels on the questions inside tests, nothing more.

**Two places a tag can live**

| | Local tag | Sheet tag |
|---|---|---|
| Where | Browser storage, `cw:tags:<email>` (the same device-only storage drafts use today) | `Tags` sheet |
| When | Created in the builder or Admin → Tags and not yet used in any published test | Used by at least one published test |
| Who sees it | Only the teacher who made it, on that device | Every admin; students see its name on tests that use it |
| Who can change it | That teacher (changes stay local) | The teacher who owns it. A rename or recolour applies everywhere at once |

- **Same lifetime as drafts:** a local tag is kept, lost or carried over exactly like a draft. If a teacher clears the browser or moves to another computer, their unpublished tags go with their drafts. Backup / restore (`js/lib/backup.js`) includes local tags alongside drafts.
- **No sheet writes for local tags:** creating, renaming or deleting a local tag never calls the backend.

**Data**
- **New sheet `Tags`:** `id, ownerEmail, name, color, description, firstTestCode, createdAt, updatedAt, deletedAt, mergedInto`.
  - **Only tags used by a published test are in it.** It is not a full copy of anyone's library.
  - `id` is a stable short ID (`tg_xxxxxx`) made in the browser when the tag is created, so it never changes when the tag reaches the Sheet. Renaming a tag never touches a test.
  - `ownerEmail` is the teacher who first published it.
  - Deleting sets `deletedAt` (soft delete), so old tests and results still show the name.
  - `mergedInto` keeps old IDs pointing at the merged tag.
- **Test JSON:** each question gets an optional `tags: ["tg_ab12cd", …]` (IDs only, never names).
  - Schema: an array of strings, at most 10 per question.
  - `normalize` keeps it.
  - `validate` warns about IDs that are neither local nor on the Sheet.
  - `stripKeys` (V6-02) keeps it, because tags are not answers.
  - `docs/guide.md` documents `tags`, and how AI-written tests can use tag **names** on import (`"tags": ["Ions"]`). The importer matches names to the teacher's local tags first, then to Sheet tags, and offers to create local tags for the rest.

**Publishing**
- `publishTest` sends the test plus `tagDefs`: the definitions of every tag its questions use.
- The backend upserts them into `Tags` in the same locked write:
  - A new ID becomes a Sheet tag owned by the publisher.
  - An ID already on the Sheet keeps the Sheet's name and colour, because the Sheet wins. If the publisher owns that tag and changed it locally, the change is applied.
- After a successful publish, the builder marks those tags as **on the Sheet** in local storage. From then on they are edited through the Sheet, not locally.
- Unpublishing or deleting a test does not delete Sheet tags. A tag that no published test uses any more drops out of the **Shared tags** list in the picker, but its row stays so old results keep their names.

**Using other teachers' tags**
- The builder's tag picker has two groups:
  - **Your tags:** your local tags plus the Sheet tags you own.
  - **Shared tags:** Sheet tags other teachers own.
- You can put any shared tag on your own questions. You use the same ID, so results group together across teachers (e.g. a department's "Unit 3").
- You can't rename, recolour, merge or delete another teacher's tag. If you want a different name, make your own local tag.
- Local tags of other teachers are never visible. They aren't on the Sheet.

**How names resolve**
- **Drafts:** local tags come from browser storage; Sheet tags come from one cached `listTags` read (CacheService + `store.js`).
- **Published tests:** names and colours always come from the Sheet. `getTest`, the student test payload and `getFeedback` include a small `tagIndex` (`{ id: { name, color } }`) for that test's tags, so students and the PDF export need no second request.

**Where tags appear**
- **Builder:** the tag picker on each question (type to search, Enter to create a local tag), a filter for the question list by tag, and "Apply tag to selected questions" for several questions at once.
- **Admin → Tags** (new page in the admin sidebar):
  - **Local:** create, rename, recolour, delete.
  - **On the Sheet, mine:** rename, recolour, merge, delete, with a "used in N questions across M published tests" count.
  - **Shared:** read-only, with the owner's name.
- **Grading and grade-by-question:** filter questions by tag, plus an average score per tag for the test.
- **Assignment tracker:** a per-tag column group (class average per tag) and a per-student breakdown.
- **Student results and feedback (released only):** a "By topic" summary, e.g. "Ions 8/10 · Stoichiometry 3/6".
- **Student profile:** accuracy by tag across all **released** results. This is the honest replacement for the removed Mastery page, because it is built only from released, teacher-confirmed scores.
- **Game modes:** Mistake review and Flashcards can filter by tag ("Practise only Ions").
- **Library:** filter tests by the tags their questions use.

**Backend (`Code.gs`)**
- **New admin actions:**
  - `listTags`: every non-deleted Sheet tag, with owner and usage counts.
  - `saveTag`: owner only. Edits an existing Sheet tag; it **cannot create one**, because Sheet tags are only created by publishing.
  - `deleteTag`: owner only, soft delete.
  - `mergeTags`: owner only, both tags must be theirs. Rewrites IDs in the owner's published tests in one locked pass and sets `mergedInto`, so other teachers' tests using the old ID still resolve.
- **`publishTest`:** accepts `tagDefs` and upserts them as described in Publishing.
- **`tagIndex`:** `getTest`, `getTestFor_` and `getFeedback` include it.
- **Formula injection:** tag `name` and `description` go through `text_()`.

**Tests**
- **Unit:**
  - Schema: `tags` normalize/validate and the 10-tag limit.
  - Local tag store: create, rename, delete, and marking a tag "on the Sheet" after publish.
  - Importer: names match local tags first, then Sheet tags.
  - Per-tag score totals: released only, partial credit, teacher-graded items.
  - Merge rewrite.
- **Backend:**
  - The Sheet only gets tags through `publishTest`, and `saveTag` can't create one.
  - Owner-only edits, the Sheet winning for tags someone else owns, soft delete, `mergedInto` resolution.
  - `tagIndex` in test payloads.
- **E2E:**
  1. Teacher A makes a local tag and tags 3 questions in a draft, and the tag doesn't appear on the Sheet.
  2. A publishes, and the tag is on the Sheet.
  3. Teacher B sees it under Shared tags and uses it, but can't rename it.
  4. A renames it, and the new name shows in B's builder, grading, the student's released results and the profile.

## V6-10 — Docs and release

- **Version 6.0.0:** `js/version.js` (`SITE_VERSION`, `BACKEND_VERSION` = 6.0.0), `package.json`, `Code.gs` `VERSION`, `changelog/6.0.0.md`, and the front of `changelog/index.json` (see `CLAUDE.md`).
- **`docs/ARCHITECTURE.md`:** rewrite it as **current state**. Today it is a stack of "V2 / V3 / V4 / V5 contracts" sections, so readers must replay history to know the present. Move the old sections to `docs/archive/architecture-v5.md`.
- **`DEPLOYMENT.md`:** Pages-first, an "Upgrading to v6" section (re-run `setup`, new trigger, clasp option), and a current ping example and type list.
- **`README.md`:** Pages deployment and the current upgrade link.
- **`docs/guide.md`:** remove the per-version sections ("v2 additions", "v4 additions") and list every type in one ordered table. Document question `tags` (V6-09 B) and Classroom sync setup (V6-09 A).
- When v6 ships, move `docs/v6/` to `docs/archive/v6/` (see `docs/README.md`).

---

## Sessions

The work splits into sessions the same way as v5 (agent briefs to be written in `docs/v6/delegations/` once the Open questions are answered). Progress goes in `docs/v6/v6-progress.md`. **Each session ends with `npm run test:all` passing in CI.**

| # | Session | Covers | Depends on |
|---|---|---|---|
| S01 | CI + green baseline | V6-01: CI workflow, Playwright as a devDependency, boot smoke test, fix the failing e2e tests | — |
| S02 | v5 coverage | V6-01: backend + client tests for v5, fixture-driven type tests, Class Hub / modes e2e, perf e2e, remove sleeps | S01 |
| S03 | Security I | V6-02 #1, 2, 4–9, 12 (backend + submit path) | S01 |
| S04 | Backend performance | V6-03 | S02 |
| S05 | Type registry I | V6-04: simple types + conformance test | S02 |
| S06 | Type registry II | V6-04: structured + diagram types; delete the switches | S05 |
| S07 | Security II: server grading | V6-02 #3, 10, 11 (`build-gas`, `stripKeys`, `checkAnswer`, CSP) | S03, S06 |
| S08 | Clean-up | V6-05 | S06 |
| S09 | Accessibility | V6-06 | S08 |
| S10 | PWA | V6-07 | S08 |
| S11 | Deployment | V6-08 | S03 |
| S12a | Question tagging | V6-09 B: local tag store, `Tags` sheet filled on publish + actions, schema, builder picker (yours / shared), Admin → Tags, grading / tracker / results / profile views | S06 |
| S12b | Classroom grade sync | V6-09 A: scopes, course link + roster import, post to Classroom, preview + sync, auto-sync on release | S03, S04 |
| S13 | Release | V6-10 | all |

S03 and S11 can run alongside S02. S04, S05 and S11 can run in parallel. S12a can start as soon as S06 is merged; S12b needs S03 + S04 (narrower locks), and S12a and S12b can run in parallel.

**Lessons from v5 for the runbook:**
- No "ASAP" override that skips tests.
- Each agent's report must include the test counts from CI, not "merged".
- The orchestrator runs the boot smoke test after **every** merge, not only at release.

## Backend changes summary (`Code.gs` → 6.0.0)

- **Submit:** email from the token; server re-grade (if Open question 2 = yes); proper CORS replies.
- **Tests:** GET `getTest` restricted; students get tests without keys; new `checkAnswer` action.
- **`getFeedback`:** token required.
- **Errors:** generic error replies; `reportError` limited per sender; `ADMIN_KEY` constant-time compare + lock-out (or removed).
- **Locks and indexes:** narrower locks, row-index cache, column-limited reads, accommodation N+1 fixed.
- **Pruning:** a daily trigger, retention settings and a `diag` action.
- **Formula injection:** `text_()` on every user-supplied column.
- **Classroom sync (V6-09 A):** new Classroom scopes, a `ClassroomSync` sheet, columns `Classes.classroomCourseId` and `Assignments.classroomCourseWorkId`, and actions `listClassroomCourses`, `linkClassroomCourse`, `importClassroomRoster`, `previewGradeSync`, `syncGrades`.
- **Tags (V6-09 B):** a `Tags` sheet that only holds tags used by published tests; `publishTest` upserts `tagDefs`; actions `listTags`, `saveTag` (edit only), `deleteTag`, `mergeTags`; and `tagIndex` in test payloads.

## Open questions

1. ~~Which V6-09 features are in 6.0?~~ **Decided:** Google Classroom grade sync + question tagging. Practice sets, live class game, bank sharing and rubric grading move to 6.1+.
2. **Server-side grading + tests without keys (V6-02 #3)?** This is the biggest change in v6. It stops answer lookup in dev tools and faked scores, but instant feedback then needs a server call (about 0.5–1 s) unless the test is marked "practice". Recommended: yes, keys stripped for anything that isn't a practice.
3. **Remove legacy access:** the `ADMIN_KEY` fallback, the `chemadmin` access code and `netlify.toml`? Recommended: remove all three. Google admin sign-in becomes the only way in.
4. **clasp + a GitHub Action for the backend:** this needs a Google service login stored as a repository secret. Recommended: yes, as optional. Pasting by hand stays documented.
5. **Rename test files by area instead of by version?** This touches 54 files, but only once. Recommended: yes.
6. **Translations (i18n):** none today. Is Spanish (or another language) needed for students? If yes, add a string table during S08 (clean-up) while every view is being touched anyway.
7. ~~Classroom: send unreleased grades as drafts?~~ **Decided: yes.** Graded-but-unreleased scores go as `draftGrade` (only the teacher sees them in Classroom). Released scores go as `assignedGrade`.
8. ~~Who deploys for Classroom sync?~~ **Decided: each teacher who wants sync uses their own deployment** (the existing "copy deployment" guide). Platform → the deployment checklist shows which account sync runs as.
9. ~~Can other teachers use your tags?~~ **Decided: yes, but only tags that are on the Sheet,** meaning tags used by at least one published test. Every other tag stays in that teacher's browser storage, like a draft, until a test using it is published. See V6-09 B.

## Known limits that stay

- Google Sheets stays the database. v6 makes it faster, but a few hundred milliseconds per read and the Apps Script quotas (UrlFetch for `tokeninfo`, MailApp for release emails) remain.
- "Race" stays a race against your own previous run on the same device. Real-time play is a 6.1+ candidate.
- Without server grading (Open question 2 = no), answer keys stay visible to a determined student, as they are today.
