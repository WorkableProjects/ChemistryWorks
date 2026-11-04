# v4 S05 + S10–S19 delegation plan

Finishes `docs/v3/v4.0plan.md`. One Sonnet subagent per session; up to three run at once in **waves**; within a wave
no two agents own the same file. Opus dispatches each wave after reviewing and committing the previous one.

## Already built (read before starting — do not rebuild)
- `docs/v3/v4-progress.md` (what each session did), `docs/ARCHITECTURE.md` "V4 contracts", `docs/DESIGN.md` (tokens, components, motion).
- **Question-type registry**: `js/lib/qtypes/registry.js` + `js/views/qtypes/registry.js`; new types = one pure module + one UI
  module, already imported by `js/lib/qtypes/v4-types.js` / `js/views/qtypes/index.js`. Hidden behind `FEATURES.v4Types` until Opus flips it.
- **Per-student instance pipeline**: `js/lib/instantiate.js` (`instantiateTest(test, { email })`, called by `js/app.js openTest`),
  steps register via `addInstantiateStep(name, fn)` from `js/lib/instantiate-steps.js`; stubs `js/lib/algorithmic.js` (S10), `js/lib/pools.js` (S11).
- **Admin auth**: `js/lib/admin-session.js` (`adminKey()`, `hasAdminAuth()`, `adminRequestAuth()`); every admin call in `js/lib/api.js` merges it.
  Backend: `apps-script/Code.gs` 4.0.0, every admin action goes through `requireAdmin_`, writes append to the `Log` sheet via the existing log helper.
- **Feature flags**: `feature(name)` from `js/config.js` (`adminShell`, `adminAccounts`, `teacherTools`, `studentTools`, `v4Types`).
  Unfinished work ships behind a flag; Opus owns `js/config.js` (report any new flag you need; until then read it with `feature('x')`, unknown = off).
- Builder game-options panel stub: `js/views/admin/game-options.js` (`gameOptionsPanel(test, changed) -> Node|null`).

## Rules (every task)
- Stay inside **Owns**. Need a change elsewhere → describe it exactly in your report ("Changes needed in files you don't own").
- Never git checkout/stash/reset/commit — other agents work in the same tree.
- Same `data-testid`s everywhere (E2E relies on them); new testids get a feature prefix.
- CSS: tokens only (no hex outside base.css/print.css — a unit test enforces it); light + dark; 360/768/1366 px; 44 px targets;
  motion only transform/opacity ≤ 400 ms and off under reduced motion.
- Backend (only the agent that owns `Code.gs` in that wave): keep every existing action/response shape, admin actions via
  `requireAdmin_`, public student actions verify the ID token like `getStudentStatus` does, new sheets/columns via `getSheet_`
  headers, update `VERSION` only if told, document every new action/field in `docs/ARCHITECTURE.md` "V4 contracts" — only the
  Code.gs owner edits ARCHITECTURE.md in a wave; others put their contract text in their report.
- Tests: unit tests for every pure helper (`test/unit/v4-<area>-*.test.mjs`), one E2E file per task (`test/e2e/v4-<area>.test.mjs`).
  Run `node --check` on touched JS, `npm test`, `npm run validate:tests`, and ONLY your own E2E file. Never weaken existing tests.
- Report: `reports/<ID>.md` — STATUS, Summary, Files changed, Commands + results, Deviations, Changes needed in files you don't own,
  Contracts (new actions/fields), Guide text (teacher-facing paragraphs Opus merges into docs/guide.md), Manual steps for Dutch, Open questions.

## Waves and ownership
| Wave | Task | Session | Owns (exclusive in its wave) |
|---|---|---|---|
| A | T13 | S05 Admin revamp | `js/views/admin.js`, `css/admin.css`, new `css/admin-shell.css`, new `js/views/admin/{shell,dashboard}.js`, new `js/lib/greetings.js`, `js/views/admin/library.js`, `js/views/admin/builder.js`, `js/views/admin/grading.js`, `css/grading.css` |
| A | T14 | S10 Types III + algorithmic | `js/lib/qtypes/{molarmass,imagechoice,particles,titration,estimate}.js`, `js/views/qtypes/{same}.js`, new `css/qtypes-s10.css`, `js/lib/algorithmic.js`, new `js/lib/chemfuncs.js`, `js/views/admin/editors/core.js`, new `js/views/admin/variables-editor.js`, `apps-script/Code.gs` (Seed column only), `docs/ARCHITECTURE.md`, `data/tests/DEMOV4C.json` |
| A | T15 | S14 Games I | `js/lib/games/**`, `js/views/games/**`, `js/views/game-shell.js`, `js/views/game.js`, `js/views/mode-select.js`, `css/game.css`, `css/status.css` (mode rules), `js/views/admin/game-options.js` |
| B | T16 | S11 Classes, bank, pools, templates, import | `apps-script/Code.gs`, `docs/ARCHITECTURE.md`, `js/lib/api.js`, `js/lib/pools.js`, new `js/views/admin/{classes,bank,import}.js`, new `js/lib/{roster,bank,importers}.js`, `js/views/admin/builder.js`, `js/views/admin/grading.js`, `js/views/admin/library.js`, `js/views/admin.js` / `js/views/admin/shell.js` (nav entries only), `data/templates/**` |
| B | T17 | S15 Games II + XP + practice (client) | `js/lib/games/**`, `js/views/games/**`, `js/views/game-shell.js`, `js/views/game.js`, `js/views/mode-select.js`, `css/game.css`, new `js/lib/xp.js`, new `js/views/practice-card.js`, new `js/lib/leaderboard.js` (client; backend in T21) |
| B | T18 | S16 Student tools | `js/views/runner.js`, `css/runner.css`, `js/views/reference-pane.js`, `css/references.css`, `js/ui.js` (settings popover only), `js/views/landing.js`, `css/landing.css`, `js/views/feedback.js`, new `js/views/tools/**`, new `css/tools.css`, `js/lib/submit.js` (flags/notes in payload) |
| C | T19 | S12 Scheduling + accommodations | `apps-script/Code.gs`, `docs/ARCHITECTURE.md`, `js/lib/api.js`, `js/lib/student-status.js`, `js/app.js`, `js/views/runner.js`, `js/views/submitted.js`, `js/views/status-page.js`, `js/views/admin/builder.js`, `js/views/admin/grading.js`, new `js/views/admin/accommodations.js`, new `js/lib/schedule.js`, `js/lib/schema.js` (test-level fields only) |
| C | T20 | S17 Platform (client) | `js/views/admin/settings.js`, new `js/lib/{backup,errors}.js`, `js/lib/version-check.js`, `DEPLOYMENT.md` |
| D | T21 | S13 Live + mastery + backend for leaderboard/errors | `apps-script/Code.gs`, `docs/ARCHITECTURE.md`, `js/lib/api.js`, new `js/views/admin/{live,mastery,profile}.js`, `js/views/runner.js` (progress ping only), `js/lib/leaderboard.js` (wire to backend), `js/lib/errors.js` (wire to backend), `js/views/admin.js`/`shell.js` (nav entries only), `js/views/admin/settings.js` (Errors toggle) |
| E | Opus | S18 Hardening | full E2E, a11y/perf pass, all flags on, bug list |
| E | T22 | S19 Release docs | `docs/guide.md`, `docs/ARCHITECTURE.md`, `DEPLOYMENT.md`, `README.md`, `docs/v3/v4-progress.md`, `CHANGELOG`-style notes |

## Log
