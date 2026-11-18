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
| S02a | haiku | todo | | | |
| B1 | sonnet | todo | | | |
| S02b | sonnet | todo | | | |
| S02c | sonnet | todo | | | |
| S02d | sonnet | todo | | | |
| S03 | sonnet | todo | | | |
| B2 | sonnet | todo | | | |
| S05 | sonnet | todo | | | |
| S06a | sonnet | todo | | | |
| S06b | sonnet | todo | | | |
| S11 | sonnet | todo | | | |
| B3 | sonnet | todo | | | |
| B4 | sonnet | todo | | | |
| S07 | sonnet | todo | | | |
| S08a | haiku | todo | | | |
| S08b | sonnet | todo | | | |
| S08c | haiku | todo | | | |
| S10 | sonnet | todo | | | |
| S09 | sonnet | todo | | | |
| S12a | sonnet | todo | | | |
| S12c | sonnet | todo | | | |
| S12b | sonnet | todo | | | |
| S13a | sonnet | todo | | | |
| S13b | haiku | todo | | | |

## Handoff notes

(none yet)
