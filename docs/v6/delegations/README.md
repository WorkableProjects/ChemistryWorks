# v6 delegations: orchestrator runbook

Every piece of v6 is briefed here. The orchestrating session **does not plan or write feature code**. Its jobs:
- launch these agents
- merge their work
- run the tests
- keep `docs/v6/v6-progress.md` current

Pace: one wave at a time, **green before the next wave**. There is no deadline that justifies skipping tests.

## Models: Sonnet and Haiku only
**No Opus workers.** Every `Agent` call sets `model` explicitly to `"sonnet"` or `"haiku"`. Never omit it, because
omitting it inherits the orchestrator's model.

| Model | Use for | Agents |
|---|---|---|
| `sonnet` | New modules, backend, security, refactors that need judgement, UI, test design | W0, S01a, S01b, B1, B2, B3, B4, S02b, S02c, S02d, S03, S05, S06a, S06b, S07, S08b, S09, S10, S11, S12a, S12b, S12c, S13a |
| `haiku` | Mechanical: renames, flag and dead-code removal, comment clean-up, docs and release from a spec | S02a, S08a, S08c, S13b |

Re-running a failed agent: use the **same model**. Upgrade a Haiku brief to Sonnet only if Haiku fails it twice, and
note that in the progress file. Never upgrade to Opus.

## Files
| File | Agents |
|---|---|
| `00-common.md` | Rules every agent follows (they read it themselves) |
| `W0.md` | W0: V6 contracts, progress file |
| `S01.md` | S01a CI + smoke test · S01b green e2e baseline |
| `S02.md` | S02a test renames · S02b backend tests · S02c client tests · S02d e2e coverage |
| `BACKEND.md` | B1 security · B2 performance · B3 tags · B4 Google Classroom |
| `S03.md` | S03 client security (submit, admin sign-in, feedback token) |
| `S05-S06.md` | S05, S06a, S06b: one question-type system |
| `S07.md` | S07 XSS audit, CSP, SRI |
| `S08.md` | S08a flags and shims · S08b splits and CSS loading · S08c comments and leftovers |
| `S09-S11.md` | S09 accessibility · S10 PWA · S11 deployment automation |
| `S12.md` | S12a tags in the builder · S12b tags everywhere else · S12c Google Classroom UI |
| `S13.md` | S13a hardening + ARCHITECTURE rewrite · S13b docs + 6.0.0 release |

## How to launch one agent
```
Agent({
  description: "v6 <ID> <short title>",
  subagent_type: "general-purpose",
  model: "<sonnet|haiku>",          // REQUIRED. Never omit, never "opus".
  isolation: "worktree",
  prompt: "You are v6 agent <ID>. Read docs/v6/delegations/00-common.md, then do the section '## <ID>' in docs/v6/delegations/<FILE>. Report in the format 00-common.md gives."
})
```
- Worktrees branch from the current HEAD, so **commit every merge before launching agents that depend on it**.
- Launch every agent whose dependencies are merged in one message (parallel), **up to 5 at once**.

## Dependency graph
`After` = must be merged into the integration branch before launch.

| ID | Model | After | Owns (summary) |
|---|---|---|---|
| W0 | sonnet | — | ARCHITECTURE → V6 contracts; `v6-progress.md` |
| S01a | sonnet | — | `.github/workflows/ci.yml`, Playwright devDependency, `test/e2e/smoke.test.mjs` |
| S01b | sonnet | — | Every failing e2e test made green (stale tests updated, real bugs fixed) |
| S02a | haiku | S01a, S01b | Rename test files by area (rename-only commit) |
| B1 | sonnet | S01b | Code.gs security (plan V6-02 #1, 2, 4–8, 10) |
| S02b | sonnet | S02a | Backend tests for every v5 action |
| S02c | sonnet | S02a | Client unit tests for v5 modules; fixture-driven type tests |
| S02d | sonnet | S02a | E2E: home, Class Hub, modes, perf targets; remove fixed sleeps |
| S03 | sonnet | B1, S02a | Client security: submit with CORS + outbox, Google-only admin sign-in, feedback token |
| B2 | sonnet | B1, S02b | Code.gs performance, pruning trigger, `diag` |
| S05 | sonnet | S02c | Type registry I: simple types + conformance test |
| S06a | sonnet | S05 | Type registry II: structured types |
| S06b | sonnet | S06a | Type registry III: diagram + teacher-graded types; delete the switches |
| S11 | sonnet | B2 | clasp, `gas-deploy.yml`, config from repo variables, `setup()` checklist |
| B3 | sonnet | B2 | Code.gs tags: `Tags` sheet, publish upsert, actions, `tagIndex` |
| B4 | sonnet | B3 | Code.gs Google Classroom: scopes, sheet, actions |
| S07 | sonnet | S03, S06b | `html:` audit, escaping, CSP, SRI |
| S08a | haiku | S03, S06b | Remove flags, dead branches, Netlify, compatibility shims |
| S08b | sonnet | S08a | Split runner/builder, view CSS loading, versioned URLs, shared helpers, one catalog |
| S08c | haiku | S08b | Strip session tags from comments; storage path; cleanup contract |
| S10 | sonnet | S08b | Manifest, service worker, update prompt |
| S09 | sonnet | S07, S08c | Accessibility fixes + axe e2e pass |
| S12a | sonnet | B3, S08c | Local tag store, builder tag picker, Admin → Tags, importer |
| S12c | sonnet | B4, S08c, S02d | Google Classroom: link course, roster import, post to Classroom, preview + sync |
| S12b | sonnet | S12a, S02d | Tags in grading, tracker, results, profile, modes, library |
| S13a | sonnet | all above | Full-suite fix-up, console-clean check, ARCHITECTURE rewritten as current state |
| S13b | haiku | S13a | DEPLOYMENT, README, guide, 6.0.0 version + changelog |

**Code.gs lane:** B1 → B2 → B3 → B4. S11 only edits `setup()` and runs after B2. No two of these run at once.

## Waves (each wave = one parallel launch; next wave only when the previous one is merged and green)
1. W0, S01a, S01b
2. S02a, B1
3. S02b, S02c, S02d, S03
4. B2, S05
5. S06a, S11, B3
6. S06b, B4
7. S07, S08a
8. S08b
9. S08c, S10
10. S09, S12a, S12c
11. S12b
12. S13a → S13b

## Merge protocol (after each agent reports)
1. **Read the report.**
   - `blocked`: fix the dependency or relaunch.
   - `partial`: add what's left to the progress file, then launch a follow-up with the same brief, the **same model**, and "Only do: <left>".
   - A report without test counts is incomplete. Send it back.
2. **Merge** its worktree branch: `git merge --no-ff <branch>`.
   - Hotspot conflicts (import lists, `TYPE_LABELS`, `NAV_ITEMS`, stylesheet links, `api.js` tail, ARCHITECTURE subsections) are append against append: keep both sides.
   - Any other conflict goes back to a Sonnet agent with the brief.
3. **After every merge:**
   - Run `npm test` and `node --test test/e2e/smoke.test.mjs` (once S01a is in).
   - At the end of every wave, run `npm run test:all` and `npm run validate:tests`.
   - A failure goes back to the agent that caused it: SendMessage if it's still alive, otherwise a new agent of the same model with the brief plus the failing output.
   - The orchestrator makes no fixes beyond one-line merge fixes.
4. **Record and push:** tick the agent in `docs/v6/v6-progress.md` (ID, model, sha, test counts, notes). Commit and push the integration branch. After wave 1, CI must be green on the pushed commit.

## Branches
- **Integration branch:** the orchestrator session's designated branch.
- **Agent worktrees** stay local; only the orchestrator pushes.
- **Restarts:** if the session restarts, resume from `v6-progress.md`.

## Decisions (the user's answers to the v6plan Open questions; agents don't re-ask)
1. **Features:** Google Classroom grade sync and question tagging. No practice sets, live game, bank sharing or rubric grading in 6.0.
2. **No server-side grading.** Answer keys stay in the test sent to the browser. No `stripKeys`, no `checkAnswer`.
3. **Admin sign-in is Google only,** checked against the `Admins` sheet. Remove `ADMIN_ACCESS_CODE` and the access-code screen.
   - `ADMIN_KEY` stays, but only as the backend's credential for Sheet access, entered in admin → Settings.
   - Netlify leftovers, including `netlify.toml`, are removed.
   - Local dev and e2e keep a demo admin sign-in **only when Google isn't configured** (no `GOOGLE_CLIENT_ID`).
4. **clasp + `gas-deploy.yml`:** yes, optional. The manual paste route stays documented.
5. **Test files are renamed by area,** in one rename-only commit (S02a).
6. **No translations.** English only.
7. **Classroom:** grades that are graded but not released go as `draftGrade`; released grades go as `assignedGrade`.
8. **Classroom sync runs as the deploying account.** Each teacher who wants sync uses their own deployment.
9. **Tags:**
   - A tag stays in the teacher's browser storage, like a draft, until a **published** test uses it.
   - Publishing writes it to the `Tags` sheet.
   - Sheet tags can be used by every teacher, but only the owner can edit them.
