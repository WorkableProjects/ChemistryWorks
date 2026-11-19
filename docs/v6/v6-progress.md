# ChemWorks v6 — progress

Runbook: `docs/v6/delegations/README.md`. Plan: `docs/v6/v6plan.md`. Contracts: `docs/ARCHITECTURE.md` → V6 contracts.
Rule for all of v6: green before the next wave. No test is skipped, deleted or weakened to get green.

## Decisions (the user's answers; agents don't re-ask)

1. **Features:** Google Classroom grade sync and question tagging. No practice sets, live game, bank sharing or rubric grading in 6.0.
2. **No server-side grading.** Answer keys stay in the test sent to the browser. No `stripKeys`, no `checkAnswer`.
3. **Admin sign-in is Google only,** checked against the `Admins` sheet. No access code.
   - `ADMIN_KEY` stays, but only as the backend's credential for Sheet access, entered in admin → Settings.
   - Netlify leftovers, including `netlify.toml`, are removed.
   - Local dev and e2e keep a demo admin sign-in only when Google isn't configured (no `GOOGLE_CLIENT_ID`).
4. **clasp + `gas-deploy.yml`:** yes, optional. The manual paste route stays documented.
5. **Test files are renamed by area,** in one rename-only commit (S02a).
6. **No translations.** English only.
7. **Classroom:** graded but not released grades go as `draftGrade`; released grades go as `assignedGrade`.
8. **Classroom sync runs as the deploying account.** Each teacher who wants sync uses their own deployment.
9. **Tags:**
   - A tag stays in the teacher's browser storage, like a draft, until a published test uses it.
   - Publishing writes it to the `Tags` sheet.
   - Sheet tags can be used by every teacher, but only the owner can edit them.

## Agents

Status: `todo`, `running`, `partial`, `blocked`, `done` (merged and green).

| ID | Model | Status | Sha | Tests | Notes |
|---|---|---|---|---|---|
| W0 | sonnet | done | 4a4d13a | unit 791 | contracts + progress |
| S01a | sonnet | done | 7fb403e | unit 791, smoke 3 | CI, Playwright 1.63.0 |
| S01b | sonnet | done | a29b647 | unit 791, e2e 140 | stale tests updated; outbox banner restored. Found: bundled library counts 0; demo users never see View feedback |
| S02a | haiku | done | 843471b | unit 816, e2e 140 | 55 renames; first run blocked (worktree cut from main), retried same model |
| B1 | sonnet | done | 9d79f32 | unit 816, smoke 3 | client follow-ups for S03: getFeedback/submit need idToken; reportError needs clientId |
| S02b | sonnet | done | 7220c37 | unit 869 +1 todo | FOUND SECURITY: getClassHub_ trusts body._email (no token) — B2 must fix and un-todo the test in backend-student.test.mjs |
| S02c | sonnet | done | 0dd2de0 | unit 1097 | Found: game_mode flag dropped by buildPayload (submit.js); sync.js stale 0ms timer; profile synced flag per session |
| S02d | sonnet | done | 112ff10 | unit 1173, e2e 174 | merge conflict in admin/helpers resolved to S03 side. Found: stream posts make no bell notification; overdue shows Missing not Late; Boss may skip last question |
| S03 | sonnet | done | 389ccc6 | unit 1173, smoke 4 | full e2e verified at end of wave 3. Found: chemadmin/access-code still in DEPLOYMENT.md, guide.md, spec (S13b) |
| B2 | sonnet | done | 8d3eb20 | unit 1202, grading e2e 12, smoke 4 | also closed getClassHub _email hole; one follow-up (public trigger name, includeAnswers clients, email|code index). Found: index cache write unlocked (race could miss Extra-attempt mark) |
| S05 | sonnet | done | f041994 | unit 1287, e2e 181 | 5 types moved. Deferred: CSS split to S08b (ensureCss); admin export + grade-by-question must preload types with `review` (S06) |
| S06a | sonnet | done | 0ac059f | not run (user: test once at end) | 9 types moved |
| S06b | sonnet | done | 17f9d64 | not run | 6 types moved, switches deleted; isManual/resultExtras added |
| S11 | sonnet | done | aaf00b4 | unit 1320, smoke 4 | rate-limited mid-run, resumed. config.js loads config.local.js (gitignored); gas-deploy needs CLASPRC_JSON, GAS_SCRIPT_ID, GAS_DEPLOYMENT_ID secrets |
| B3 | sonnet | done | 158c1ce | unit 1304 | Tests sheet gains Owner column. S12a must extend api.js publishTest to send tagDefs and keep reply tags/ids |
| B4 | sonnet | done | 4173baa | not run | hourly publishDueClassroomWork trigger. Found: setupChecklist_ ids differ from contract (S13a) |
| S07 | sonnet | done | 3f232a4 | not run | CSP meta, SRI, theme-boot.js; csp.test.mjs e2e unverified |
| S08a | haiku | done (partial) | 08d452d | not run | Left for S08c: Code.gs Netlify webhook path + its test (backend-core:163), admin.js LEGACY_TABS shim, sections.js constants→resources; docs FEATURES/Netlify mentions (S13b) |
| S08b | sonnet | done | 2d38131 | not run | S13b must run `npm run stamp:version` after bump. Found: landing.js dead signed-in code; .dash in tools.css + admin-shell.css |
| S08c | haiku | todo | | | |
| S09 | sonnet | todo | | | |
| S12a | sonnet | todo | | | |
| S12c | sonnet | todo | | | |
| S12b | sonnet | todo | | | |
| S14 | sonnet | done (partial) | bd4af2f | not run | student-layout e2e unverified; screenshots via CW_SHOTS_DIR not captured; wide widgets not individually resized |
| S10 | sonnet | done | 86e40fa | not run | pwa e2e selectors unverified; CSP worker-src/manifest-src added |
| S13a | sonnet | todo | | | |
| S13b | haiku | todo | | | |

## Handoff notes

(none yet)
