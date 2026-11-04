# ChemistryWorks v3.0 — Plan

> **Status:** Implemented (see .claude/delegation/v3/PLAN.md for deviations)
> **Builds on:** v2.5 (game mode, release toggle, PDF export, Apps Script 3.0.0)

## Original notes

- Allow for students to see the feedback, final score, etc. (same as PDF export) by logging into the same test link AFTER a teacher has clicked the toggle when grading "Release grade & comments to student"
- Add a test toggle to disallow a student to submit a test again (test recognizes via email -- if shown in the sheet already, say no)

## Revised scope

| ID | Requirement | Priority |
|---|---|---|
| V3-00 | Verified student identity on the backend (prerequisite for V3-01 / V3-02) | High |
| V3-01 | Released feedback on the test link: full PDF-style review, any device | High |
| V3-02 | "One submission per student" test toggle, enforced by email | High |
| V3-03 | Teacher tools: release all, allow retake | Medium |
| V3-04 | More games (new original game modes) | Medium |
| V3-05 | More question types | Medium |
| V3-06 | UI additions and animations | Medium |
| V3-07 | Polishing pass | Medium |

---

## What the code does today (research)

- **Feedback only works on the device that submitted.** `js/views/feedback.js` reads the submission from `localResults` in `localStorage` (`js/lib/submit.js` `getLocalResults()`), then calls backend `getFeedback` with the submission UUID + email. The UUID is the secret; another device has neither the UUID nor the stored responses.
- **`getFeedback` returns scores and comments, not the answers.** Responses (question text, student answer, correct answer) come from the local copy. The view is a simple list. The PDF export (`js/lib/export.js` `buildExportModel` + `js/views/admin/export-view.js` `exportDocument`) is much richer: diagrams, images, correct answers, section headings, "Graded by".
- **Opening a test link never checks the sheet.** `app.js` `openTest()` → `loadTest()` → `mode-select` or `runner`. Nothing asks "has this student already submitted?"
- **Submissions are fire-and-forget.** `submit.js` `sendGas()` posts with `mode: 'no-cors'`, so the browser cannot read the reply. A backend rejection at submit time would be invisible to the student. Any "already submitted" message must come from a separate, readable call made *before* the test starts.
- **Email is self-asserted.** `auth.js` decodes the Google ID token in the browser and then throws the token away. The backend trusts whatever `student_email` is posted. If the backend looked up results by email + test code alone, anyone who knows (or guesses) a classmate's school email could read their grades.
- **The Google client is already set up** (`GOOGLE_CLIENT_ID` in `js/config.js`), so a real ID token is available at sign-in.
- **Test settings** live in `normalizeTest()` (`js/lib/schema.js`), with switches in `js/views/admin/builder.js` (`sw('gameMode', …)`). Published tests are stored in the `Tests` sheet, so the backend can read their settings. Bundled tests (`data/tests/*.json`) are not in the sheet.
- **Backend:** `apps-script/Code.gs` v2.0.0, 23 Submissions columns, `COL` map, header auto-append in `getSheet_()`. Unit tests run it in a `vm` with fake services (`test/unit/apps-script.test.mjs`). E2E tests mock Apps Script through `onGas` in `test/e2e/helpers.mjs`.

---

## V3-00 — Verified student identity

**Why:** V3-01 hands back a student's answers, grades and comments based on who they are. V3-02 blocks by email. Both need the backend to know the email is real.

**Client (`js/lib/auth.js`)**
- Keep the Google credential: `setUser({ …, idToken: response.credential, idTokenExp: p.exp })` (sessionStorage, as today).
- Add `getIdToken()`: returns the token if it has more than 60 s left; otherwise returns `null` and calls `google.accounts.id.prompt()` so GIS (already `auto_select: true`) re-issues one silently.
- Demo sign-in has no token (`provider: 'demo'`).

**Backend (`Code.gs`)**
- `verifyStudent_(idToken)`: `UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + token)`; accept only if `aud` equals the `GOOGLE_CLIENT_ID` script property, `email_verified` is true, `exp` is in the future, and `iss` is `accounts.google.com` / `https://accounts.google.com`. Returns the lowercased email or an error.
- Cache verified tokens in `CacheService` (key = SHA-256 of the token, TTL = time left on the token, max 6 h) to save UrlFetch quota.
- Optional: if the `ALLOWED_DOMAINS` script property is set, check the token's `hd` / email domain. This makes the domain restriction real (today it is client-side only).
- Dev fallback: script property `ALLOW_UNVERIFIED_EMAIL=true` accepts `studentEmail` without a token. This is for local or demo use only and is off by default.

**Deployment impact:** `UrlFetchApp` adds the `script.external_request` scope. The teacher must re-authorize when deploying the new version and add the `GOOGLE_CLIENT_ID` script property.

**Acceptance criteria**
- [ ] A forged, expired or wrong-audience token is rejected (`unauthorized`).
- [ ] An expired token mid-session is refreshed without a visible sign-out.
- [ ] Without `GOOGLE_CLIENT_ID` set, the new student actions return `identity_not_configured` and the app falls back to v2.5 behavior (no lockout, local-only feedback).

---

## V3-01 — Released feedback on the test link

**Flow:** a student opens `?code=CHEM101` → signs in → `openTest()` calls the new status check before loading the runner.

| Server says | Student sees |
|---|---|
| No submission | The test, as today |
| Submitted, not released | "You submitted this test on {date}. Your teacher hasn't released grades yet." If single-submission (V3-02) there is no start button; otherwise **Take again**. |
| Submitted and released | The **feedback review** (below), plus **Download PDF**. **Take again** appears only if retakes are allowed. |
| Check failed (offline or old backend) | Fall back: local check, then the test (fail open; V3-02 has a server backstop) |

**Backend: new action `getStudentStatus`** (no admin key)
- Body: `{ action, testCode, idToken }` (or `studentEmail` under the dev fallback).
- Finds every Submissions row with a matching email and test code (case-insensitive), skipping rows marked `Extra attempt` (V3-02).
- Returns `{ submitted, attempts: n, latest: { submission_id, submitted_at, status, released } }`, and when the latest *released* row exists:
  `feedback: { submission_id, test_code, test_title, student_name, submitted_at, released_at, final_score, score_total, final_percentage, grades, comments, graded_by, responses }`.
- The teacher note is never returned (same as `getFeedback`).
- If the published test has `showCorrectAnswers: false`, strip `correctAnswer` / `correctAnswerText` from `responses` on the server. The client strips them too for bundled tests.
- Multiple attempts: show the most recent released one, and list the others by date.

**Client**
- `js/lib/api.js`: `fetchStudentStatus({ gasUrl, testCode, idToken })`. Never throws. Maps `unknown_action` to the existing `OUTDATED_BACKEND` message.
- `js/app.js` `openTest()`: after `loadTest()`, call the status check and route to `feedback` / a new "already submitted" notice / the runner. Add a short loading state ("Checking your submission…").
- `js/views/feedback.js`: rebuild the released view on the **export model** so it matches the PDF:
  - Build a row from `feedback` (with `grades` applied by `applyGrades`) → `buildExportModel({ row, test, includeComments: true })` → render with `exportDocument(model)` inside the app shell (screen styles for `.export-doc`).
  - **Download PDF** → `printSubmission({ row, test, includeComments: true })`. The filename comes from `exportFilename()`.
  - Respect `test.showCorrectAnswers` (hide the "Correct answer" blocks when it is off).
  - Keep the existing `payload` entry point (landing "Your submitted tests"). It should prefer the server copy when it is available, so both paths show the same view.
- Landing "Your submitted tests": add a **Released** badge when the status call reports it (optional, one call per listed test, so lazy-load or skip).
- Teacher copy (`admin/grading.js`): change "Not released — the student sees no comments yet" to "Not released. Once released, the student sees this review by opening the test link."

**Acceptance criteria**
- [ ] On a new device or browser, after release, opening the test link and signing in shows the full review: score, each question, the student's answer (including diagrams and images), the correct answer (if enabled), per-question points, comments and "Graded by".
- [ ] Before release, no grades, comments or answers are returned or shown.
- [ ] Download PDF produces the same document as the teacher's export with comments.
- [ ] Un-releasing hides it again on the next visit.
- [ ] Another student's email or a forged token returns nothing.

---

## V3-02 — "One submission per student" toggle

**Test JSON:** `singleSubmission: boolean` (default `false`, so existing tests are unchanged).
- `schema.js` `normalizeTest()` → `t.singleSubmission = bool(t.singleSubmission, false)`; add it to the blank-test defaults; `scripts/validate-tests.mjs` accepts it.
- `builder.js`: `sw('singleSubmission', 'One submission per student', 'Blocks a second submission from the same email. Use Grading → Allow retake for exceptions.', false)`.
- Library: show a small "1 attempt" tag on tests with this setting.

**Enforcement (three layers)**
1. **On open (primary):** `getStudentStatus` reports `submitted: true` → show "You've already submitted this test." No runner. If it is released, show the feedback instead (V3-01).
2. **On this device (offline-safe):** if `localResults` or the outbox already has this email + code, block. This catches an offline submission that hasn't reached the sheet yet.
3. **On submit (backstop):** `handleSubmission_()` checks for an existing row with the same email + code, ignoring rows with Retake Allowed set. The test counts as single-submission if the published test in the `Tests` sheet has `singleSubmission`, **or** the payload says `single_submission: true` (needed for bundled tests). A duplicate is **stored, not dropped**, with Status `Extra attempt`, so a student's work is never silently lost and the teacher can see it. Extra attempts are excluded from submission counts, from `getStudentStatus` and from the default grading list (shown with a filter).
- Runner pre-submit re-check: just before sending, call the status check again (catches a second tab or device). If it says submitted, show the "already submitted" modal and don't send. On a network error, send anyway; layer 3 will flag it.
- Resume: in-progress attempts (`progress:` keys) still open normally until a submission exists.
- Game mode: practice is not a submission. After a submission, still offer Game mode if `gameMode` is on, and hide Study mode.
- Preview (admin) is never blocked.

**Payload:** `buildPayload()` adds `single_submission: !!test.singleSubmission`. `toNetlifyFields()` adds it too.

**Acceptance criteria**
- [ ] With the toggle on, a student who has a row in the sheet cannot start the test again (any device), and sees a clear message.
- [ ] With the toggle off, behavior matches v2.5 (V3-01 feedback still shows, with **Take again**).
- [ ] A forced second submission lands as `Extra attempt` and does not change the counts or the student's feedback.
- [ ] **Allow retake** (V3-03) lets that one student submit once more.

---

## V3-03 — Teacher tools (supports V3-01 / V3-02)

- **Release all graded** (Grading tab, per test): a new admin action `releaseAll { testCode }` sets Released At on every `Graded` / `Auto-graded` row for that test. It asks for confirmation and shows "Released n submissions".
- **Allow retake** (per submission, in the grading detail): a new admin action `allowRetake { submissionId, allow }` sets new column 24 `Retake Allowed At`. A row with it set no longer blocks; its feedback stays viewable. The grading list shows "Retake allowed".
- Status filter in the grading list: All / Needs grading / Graded / Released / Extra attempts.

---

## V3-04 — More games

**Today:** one game (`js/views/game.js`, `js/lib/game.js`). It is timed and shows one question at a time, with speed points, streak bonus and two power-ups (50/50, Freeze). It plays `mcq`, `multi`, `truefalse`, `numeric` and `formula` questions, and stores the best score per student and test in `localStorage`. Game mode is practice only and never submits.

**Structure change (do first):** turn game mode into a set of games the student can pick from.
- `js/lib/games/` with one module per game: `{ id, title, blurb, icon, playableTypes, minQuestions, score(...) }`. The existing game moves to `games/classic.js` unchanged.
- `mode-select.js`: "Game mode" opens a game picker (cards showing the best score for each game, with unplayable games greyed out and the reason shown).
- Test JSON: `gameMode: true` keeps working. Optional `games: ['classic', 'survival', …]` limits which games a test offers (default: all that are playable).
- Best score key: `gamebest:<email>:<code>:<gameId>`. Read the old key as `classic`.

**New games** (all original designs; no copying another product's names, art, sounds or layout):

| Game | Mechanic | Uses |
|---|---|---|
| **Survival** | No timer, 3 lives. A wrong answer costs a life, and every 5 correct answers in a row earns one back. Questions get harder (sorted by points value). | All auto-graded types |
| **Lightning Round** | 60 seconds total and as many questions as possible. Skipping is allowed but costs 2 seconds. | `mcq`, `truefalse`, `numeric` |
| **Element Hunt** | "Click the element that…" on the periodic table already in `reference-pane.js` `periodicTable()` (symbol, group, period, property). Generated from built-in element data (`js/lib/elements.js`), so it needs no test questions. | Element data |
| **Match-Up** | Cards turn face-up two at a time, and the student finds the matching pairs. Pairs come from `matching` questions and from element symbol ↔ name. | `matching` |
| **Flashcards** (study, not scored) | Flip, then mark "knew it" or "review again". Cards marked for review come back later in the session. | All auto-graded types (prompt → correct answer) |

- Shared HUD and end screen move into `js/views/game-shell.js` so each game only renders its own board.
- An optional **class leaderboard is out of scope**: it would need a new backend sheet and raises privacy questions. Best scores stay on the device.
- Tests: unit tests for each game's scoring, plus an E2E test that each game starts, plays one round and ends without submitting.

**Acceptance criteria**
- [ ] The picker lists only games the test can actually play.
- [ ] Each game works by keyboard and touch, and respects reduced motion.
- [ ] No game sends anything to the backend or Netlify.

---

## V3-05 — More question types

**Today:** 13 types (`TYPE_LABELS` in `schema.js`). Adding a type touches `schema.js` (normalize and validate), `grading.js` (`gradeQuestion`, `isAnswered`, `formatAnswer`), `runner.js` (widget), `builder.js` (editor), `export-view.js` and `results.js` (display), `scripts/validate-tests.mjs`, the docs and the tests. Follow the same checklist for each new type.

**Proposed, in priority order:**

| Type | What the student does | Grading |
|---|---|---|
| `balance` — Balance the equation | Types coefficients into boxes in front of each formula (`_ H2 + _ O2 → _ H2O`) | Auto. Accepts any multiple of the lowest whole-number ratio if `allowMultiples`, otherwise the lowest ratio only. Partial credit is optional. |
| `econfig` — Electron configuration | Types `1s2 2s2 2p6` or noble-gas shorthand `[Ne] 3s1`, with a superscript preview like the formula input | Auto. Normalizes order, spacing and shorthand. Handles exceptions (Cr, Cu) through an answer list. |
| `ptable` — Periodic-table pick | Clicks one or more elements on the table | Auto (set comparison, same rules as `multi`) |
| `categorize` — Sort into groups | Drags or taps items into labeled bins (e.g. ionic / covalent / metallic) | Auto. Partial credit per item. |
| `sigfigs` — Significant figures / scientific notation | Numeric answer that also checks the number of significant figures | Auto. Value within tolerance and the sig-fig count match. Each part can earn credit separately. |
| `hotspot` — Label the diagram | Places labels on points of an image (lab equipment, phase diagram) | Auto (each label within a radius of its target) |
| `graph` — Read or plot a graph | Either reads a value off a given chart (numeric) or plots points (heating curve, titration) | Read is auto (it reuses `numeric`). Plot is auto within a tolerance box. |

- `balance`, `econfig` and `ptable` reuse existing parts (formula renderer, superscript map, periodic table) and are the cheapest; do them first.
- Add the auto-graded ones to the game types where they fit (e.g. `ptable` and `econfig` in Survival and Lightning Round).
- Each new type gets: builder editor + preview, a JSON example in `docs/guide.md`, PDF export rendering, and a sample question in a demo test in `data/tests/`.

**Acceptance criteria**
- [ ] Each type can be authored in the visual builder and in JSON, validated, taken, auto-graded, reviewed in results and feedback, and exported to PDF.
- [ ] Teacher overrides and partial credit work the same as for existing types.

---

## V3-06 — UI additions and animations

**Today:** a few keyframes (`view-in`, `rise`, `shake`, `game-pop`, results confetti `results-fall`, admin panel/pop). Reduced motion is honored in `base.css`, `runner.css`, `game.css`, `admin.css` and `references.css`.

**Rules for every animation:** CSS `transform`/`opacity` only (no layout thrash), 120–400 ms, motion tokens in `base.css` (`--dur-fast`, `--dur-base`, `--dur-slow`, `--ease-out`, `--ease-spring`), and switched off under `prefers-reduced-motion: reduce` (plus a manual "Reduce motion" switch next to the theme control, saved in `localStorage`). Keep the runner toned down (DESIGN.md): no motion while a student is answering, apart from feedback on their own actions.

**Additions**
- **Page transitions:** use the View Transitions API (`document.startViewTransition`) in `navigate()` when the browser supports it; otherwise fall back to the current `view-enter`.
- **Runner:** question cards slide in the direction of travel (next/previous) in focus mode; the progress bar fills smoothly; the navigator chip briefly pops when a question becomes answered or flagged; a small "Saved" tick appears on autosave; the timer changes color in its last minute (the existing pulse covers only the last seconds).
- **Results and feedback:** the score counts up from 0, and a percent ring draws in; question rows appear one after another (staggered); confetti is kept only for ≥ the passing percent (or ≥ 90% with no passing percent set).
- **Games:** correct/wrong flash on the chosen answer; a "+850" points pop; a streak flame that grows with the streak; a countdown ring instead of a bar; a lives/hearts animation (Survival); a card flip (Match-Up, Flashcards).
- **Landing:** sign-in card rises in; the code input shakes on an invalid code (the shake already exists for the admin gate); the resume list appears in a stagger.
- **Admin:** drag handles with a lift shadow when reordering questions; a toast slide-in; skeleton loaders for the library and grading lists (the `adm-shimmer` pattern).
- **Optional sound** (off by default, games only): short tones made with Web Audio, with a mute button. No audio files.

**Acceptance criteria**
- [ ] With reduced motion on (OS or app switch), nothing moves except instant state changes.
- [ ] No animation delays input. Clicks and keys work immediately, mid-animation.
- [ ] No noticeable frame drops on a low-end Chromebook (check in DevTools with 4× CPU slowdown).

---

## V3-07 — Polishing pass

- **Accessibility:** a WCAG 2.1 AA audit of the runner, the new question types, the games and the feedback view. Check focus order and visible focus, labels on icon-only buttons, `aria-live` for timer, score and game feedback, contrast of the new colors (extend `v2-contrast.test.mjs`), touch targets ≥ 44 px, and keyboard alternatives for every drag interaction (`categorize`, `hotspot`, ordering).
- **Mobile and Chromebook:** test at 360 px, 768 px and 1366 px wide. Check that the reference pane stacks cleanly, the diagram widgets fit, the on-screen keyboard doesn't cover the inputs, and nothing scrolls sideways.
- **Error and empty states:** one consistent notice style (with a retry) for backend down, outdated Apps Script, offline (queued in the outbox) and test not found. Write proper empty states for an empty library, no submissions, and no playable games.
- **Copy:** review all student-facing messages for plain language and consistent terms ("submit", "release", "test"), using the `design:ux-copy` checklist.
- **Performance:** lazy-load the views that are heavy and rarely needed (admin builder, structure editor, games) with dynamic `import()`. Load KaTeX only when a test contains math. Check Lighthouse performance and accessibility scores (≥ 90).
- **Consistency:** a pass over the Lab-notebook tokens (DESIGN.md): replace any leftover hard-coded colors or spacing with tokens, and use the same button sizes and icons across views.
- **Code health:** split `runner.js` (1,142 lines) and `builder.js` (1,470 lines) into per-type widget and editor modules (`js/views/widgets/<type>.js`, `js/views/admin/editors/<type>.js`). This also makes V3-05 easier. Remove dead code, and keep all tests green.
- **Bugs:** collect open issues and teacher feedback into a list at the start of the pass, and fix them before new features ship.

**Acceptance criteria**
- [ ] Lighthouse accessibility ≥ 95 and performance ≥ 90 on the landing page and runner.
- [ ] No new axe-core violations in E2E (add an axe check to `helpers.mjs`).
- [ ] `npm run test:all` passes.

---

## Backend changes summary (`apps-script/Code.gs` → 3.0.0)

- `VERSION = '3.0.0'`.
- Header 24 `Retake Allowed At`; `COL.RETAKE = 24`. `getSheet_()` appends it to old sheets automatically.
- New status constant `STATUS_EXTRA = 'Extra attempt'`.
- New actions: `getStudentStatus` (public, verified), `releaseAll` and `allowRetake` (admin).
- `handleSubmission_()`: duplicate check for single-submission tests (inside the existing lock).
- `getSubmissionCounts_()`: skip `Extra attempt` rows.
- Helpers: `verifyStudent_()`, `findRowsByEmailCode_()` (one `getValues()` pass over columns 2–5 plus Status, Released At and Retake, rather than a TextFinder loop).
- Script properties: `ADMIN_KEY` (existing), `GOOGLE_CLIENT_ID` (new, required), `ALLOWED_DOMAINS` (optional), `ALLOW_UNVERIFIED_EMAIL` (dev only).
- `getFeedback_` stays for backward compatibility.

## Client changes summary

| File | Change |
|---|---|
| `js/lib/auth.js` | Keep ID token + expiry; `getIdToken()` with silent refresh |
| `js/lib/api.js` | `fetchStudentStatus`, `releaseAll`, `allowRetake` |
| `js/lib/schema.js` | `singleSubmission` |
| `js/lib/submit.js` | `single_submission` in payload/Netlify fields; `hasLocalSubmission(email, code)` |
| `js/app.js` | Status check in `openTest()` and routing |
| `js/views/feedback.js` | Export-model review + Download PDF; server or local source |
| `js/views/runner.js` | Pre-submit re-check + "already submitted" modal |
| `js/views/mode-select.js` | Hide Study mode after a single submission |
| `js/views/landing.js` | Released badge (optional) |
| `js/views/admin/builder.js` | Toggle |
| `js/views/admin/grading.js` | Release all, Allow retake, filter, copy update |
| `js/views/admin/library.js` | "1 attempt" tag |
| `css/feedback.css` | Screen styles for `.export-doc` inside the app |

New `data-testid`s: `submission-status-check`, `already-submitted`, `take-again`, `feedback-download-pdf`, `test-single-submission`, `release-all`, `allow-retake`, `grading-filter`.

## Tests

- **Unit, `apps-script.test.mjs`:** add `UrlFetchApp` / `CacheService` / `Utilities` fakes. Cover: token accepted or rejected (aud, exp, email_verified), domain check, `getStudentStatus` before/after release, `showCorrectAnswers: false` stripping, no teacher note in replies, duplicate → `Extra attempt`, retake override, `releaseAll`, counts excluding extras, header 24 appended to a v2 sheet.
- **Unit:** `api.test.mjs` (new calls, outdated-backend mapping), `schema.test.mjs` (`singleSubmission` default), `submit.test.mjs` (payload field, `hasLocalSubmission`), auth token expiry.
- **E2E (new `v3-feedback.test.mjs`, `v3-single-submission.test.mjs`)** using `onGas`: released review on a fresh context, pending notice, Download PDF, blocked second attempt, offline local block, pre-submit block, retake allowed, toggle off unchanged, old backend fails open.
- Run `npm run test:all` and `npm run validate:tests`.

## Docs to update

- `docs/ARCHITECTURE.md`: "V3 contracts" (new actions and replies, column 24, `singleSubmission`, identity).
- `DEPLOYMENT.md`: "Upgrading to v3": paste `Code.gs`, add the `GOOGLE_CLIENT_ID` script property, **New version** deploy, approve the new external-request permission, check `?action=ping` → `3.0.0`. Update "Limitations": results lookup is now token-verified; the single-submission limit relies on Google sign-in.
- `docs/guide.md`: how students see released feedback; how to use the one-submission toggle and Allow retake.

## Build order

1. V3-00 backend + auth (no visible change yet).
2. V3-01 status check + feedback review.
3. V3-02 toggle + three enforcement layers.
4. V3-03 teacher tools.
5. V3-07 code-health split of `runner.js` / `builder.js` (makes 6–7 easier).
6. V3-05 question types: `balance`, `econfig`, `ptable` first, then the rest.
7. V3-04 game picker, then the new games (Survival → Lightning Round → Element Hunt → Match-Up → Flashcards).
8. V3-06 motion tokens + animations (alongside 6–7 for new UI; a separate pass for existing views).
9. V3-07 remaining polish (accessibility, mobile, performance, copy, bugs).
10. Docs, full test run, deploy the Apps Script **before** the site (the new client fails open against the 2.0.0 backend, but not the other way round).

V3-04 to V3-07 need no backend changes.

## Known limits (unchanged / out of scope)

- Answer keys are still public through `getTest` and the bundled JSON (client-side grading). V3-01 stripping only affects the feedback reply.
- Demo sign-in can't use V3-01 / V3-02 unless `ALLOW_UNVERIFIED_EMAIL` is on.
- A student with two Google accounts can submit once per account. The domain check reduces but doesn't remove this.

# Todo
When done with implementation, give full instructions to get ChemWorks 3.0 live.
