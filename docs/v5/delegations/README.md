# v5 delegations — orchestrator runbook

Every piece of v5 is pre-briefed here. The orchestrating session **does not plan or write feature code**: it launches
these agents, merges their work, runs the tests and keeps `docs/v5/v5-progress.md` current. Target: done over one weekend.

## Files
| File | Agents |
|---|---|
| `00-common.md` | Rules every agent follows (they read it themselves) |
| `W0.md` | W0 contracts + flags |
| `S01.md` | S01a, S01b |
| `S02.md` | S02 |
| `S03.md` | S03a, S03b |
| `S04.md` | S04a, S04b |
| `BACKEND.md` | B1 (S05), B2 (S08 backend), B3 (S07 backend) |
| `S06.md` | S06a, S06b |
| `S07.md` | S07a, S07b |
| `S08.md` | S08a, S08b, S08c, S08d |
| `S09.md` | S09a, S09b |
| `S10.md` | S10 |
| `S11.md` | S11a, S11b, S11c |
| `S12.md` | S12a–S12f, S12z |
| `S13.md` | S13a (+ optional S13b, S13c) |
| `S14.md` | S14a, S14b, S14c |

## Models (no Opus workers)
| Model | Use for | Agents |
|---|---|---|
| `sonnet` | Design-sensitive logic, new modules, backend, animation | W0, S01b, S02, S03a, S03b, S04a, B1, B2, B3, S06a, S06b, S07a, S07b, S08a, S08b, S08c, S09a, S09b, S10, S11a, S11c, S12d, S12e, S12f, S13a–c, S14a, S14b |
| `haiku` | Mechanical removal, pattern-following types, tests from a spec, docs/release | S01a, S04b, S08d, S11b, S12a, S12b, S12c, S12z, S14c |

## How to launch one agent
```
Agent({
  description: "v5 <ID> <short title>",
  subagent_type: "general-purpose",
  model: "<sonnet|haiku>",
  isolation: "worktree",
  prompt: "You are v5 agent <ID>. Read docs/v5/delegations/00-common.md, then do the section '## <ID>' in docs/v5/delegations/<FILE>. Report in the format 00-common.md gives."
})
```
Worktrees branch from the current HEAD, so **commit every merge before launching agents that depend on it**.
Launch every agent whose dependencies are merged, in one message (parallel), up to **5 at once**. Agents run in the
background; continue launching/merging as each finishes.

## Dependency graph
`after` = must be merged into the integration branch before launch.

| ID | Model | After | Owns (summary) |
|---|---|---|---|
| W0 | sonnet | — | ARCHITECTURE V5 contracts, v5 FEATURES flags, `v5-progress.md` skeleton |
| S01a | haiku | W0 | Remove Insights + Mastery |
| S01b | sonnet | W0 | Landing fixes (dupes, empty card, version label) |
| B1 | sonnet | W0 | Code.gs 5.0: Students, Attempts, profile/sync, cache + batch helpers |
| S11a | sonnet | W0 | `ionicformula` |
| S11b | haiku | W0 | `ionbuilder` |
| S11c | sonnet | W0 | `isotopemass` |
| S02 | sonnet | S01a | `js/lib/attempt.js`, runner on the attempt, mode switcher |
| B2 | sonnet | B1 | Code.gs: listTests summary, filtered getResults, writes return rows |
| S09a | sonnet | S01a | Sidebar animation |
| S09b | sonnet | S01a | Motion pass |
| S12a–S12f | haiku/sonnet | S11a, S11b | Six more types |
| S03a | sonnet | S02 | Game-mode framework + Classic, Lightning, Survival |
| B3 | sonnet | B2 | Code.gs: Class Hub sheets + actions |
| S08a | sonnet | B2 | `js/lib/store.js`, library optimistic updates |
| S03b | sonnet | S03a | Flashcards, Mistake Review, Tower, Boss |
| S06a | sonnet | B1, S02 | Profile data layer + sync |
| S08b | sonnet | S08a | Grading, dashboard, classes on the store |
| S08c | sonnet | S03b, S12z | Code splitting, lazy widgets/CSS |
| S04a | sonnet | S03b | Match-Up, Quiz Show, Race, Bingo |
| S06b | sonnet | S06a | Student home + profile page |
| S12z | haiku | S12a–f | DEMOV5 test from fixtures |
| S04b | haiku | S04a | Remove six independent games; rewrite game tests |
| S10 | sonnet | S06b, S09b | Appearance panel |
| S07a | sonnet | B3, S08b | Class Hub teacher side |
| S07b | sonnet | B3, S06b | Class Hub student side |
| S08d | haiku | S08b, S08c | Perf e2e test |
| S13a | sonnet | S06b, S07a | Teacher student view |
| S14a | sonnet | all above | Accessibility + every-flag-on hardening |
| S14b | sonnet | S14a | Full-suite fix-up |
| S14c | haiku | S14b | Docs, changelog, 5.0.0 |

Suggested weekend order (each wave = one parallel launch, ≤5 running):
1. **Fri night:** W0 → then S01a, S01b, B1, S11a, S11c
2. **Sat am:** S11b, S02, S09a, S09b, B2
3. **Sat pm:** S12a–S12f (two waves), S03a, B3, S08a
4. **Sat night:** S03b, S06a, S08b, S12z
5. **Sun am:** S04a, S06b, S08c, S07a
6. **Sun pm:** S04b, S07b, S10, S08d, S13a
7. **Sun night:** S14a → S14b → S14c

## Merge protocol (after each agent reports)
1. Read only the report. If `blocked`, fix the dependency or relaunch; if `partial`, add the leftover to the progress file
   and launch a follow-up with the same brief plus "Only do: <leftover>".
2. Merge its worktree branch into the integration branch (`git merge --no-ff <branch>`).
   Hotspot conflicts (import lists, `TYPE_LABELS`, `FEATURES`, stylesheet links, `api.js` tail, ARCHITECTURE subsections)
   are append-vs-append: keep both sides. Anything else: send the conflict back to a Sonnet agent with the brief.
3. `npm test`. After every 3–4 merges also `npm run test:e2e` and `npm run validate:tests`.
   A failure goes back to the agent that caused it (SendMessage if still alive, else a new Sonnet agent with the brief +
   the failing output). Don't fix features in the orchestrator beyond one-line merge fixes.
4. Tick the agent in `docs/v5/v5-progress.md` (ID, sha, notes). Commit and push the integration branch.

## Branches
Integration branch = the orchestrator session's designated branch (earlier sessions could only push their own branch).
Agent worktrees stay local; only the orchestrator pushes. If the session restarts, resume from `v5-progress.md`.

## Decisions (answers to v5plan Open questions)
If the plan's Open questions already have answers, those win; record them here before launching. Otherwise ask the user
once at kickoff (one AskUserQuestion call, 4 questions max: Q2, Q5, Q6 and anything they reopened); if no answer,
use these defaults:
1. Game answers count toward the practice: **yes**, one shared attempt, submit from Study review.
2. Tests that hide answers until release: games show **"Saved"** and score on completion/speed only.
3. `Attempts` sheet: **yes**, sync throttled to one per 30 s and on mode switch / page hide.
4. Six independent games: **remove**; boards live on as question types.
5. V5-08 scope: **item 1 (teacher student view)** and **item 3 (a11y audit, inside S14a)**. Items 2 (PWA) and 4
   (practice sets) are later — skip S13b/S13c unless the user says otherwise.
6. Teachers see: **grades, progress and activity (last seen, streak)**; XP/level/badges hidden from teachers.
7. Notifications: **derived on read**; only read state stored (`Students.prefsJson.notifReadAt` + per-id set).
