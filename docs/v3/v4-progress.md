# ChemWorks v4 — Progress

Session tracker for `docs/v3/v4.0plan.md`. Update at the end of every session.

**Integration branch:** `v4` (not created yet). S00–S04 were built on `claude/elegant-knuth-3ig53s` (the session branch).

| # | Session | Status | Branch / PR | Notes |
|---|---|---|---|---|
| S00 | Fixes | Done | `claude/v4-plan` (PR #13), `claude/elegant-knuth-3ig53s` | FIX-1, FIX-2, FIX-3 (shared stage in results/grading/PDF, tap-to-zoom, snap animation) |
| S01 | Foundations | Done | `claude/elegant-knuth-3ig53s` | FEATURES flags, SITE_VERSION, runner/builder split. `v4` branch not created (session could only push its own branch) |
| S02 | Brand system | Done | `claude/elegant-knuth-3ig53s` | Tokens, Plus Jakarta Sans, SVG mark, contrast + no-hex tests, DESIGN.md |
| S03 | App shell + student views | Done (untested) | `claude/elegant-knuth-3ig53s` | Navy header + settings popover, icon sprite, landing, mode select, shared status page |
| S04 | Runner + results revamp | Done (untested) | `claude/elegant-knuth-3ig53s` | Runner bar + progress, nav rail (desktop) / bottom sheet (phones), results ring + summary pills, feedback header, PDF header |
| S05 | Admin revamp | Done | `claude/elegant-knuth-3ig53s` | Admin shell (sidebar, dashboard + greetings, two-pane builder, grading split view) |
| S06 | Admin accounts + backend 4.0 base | Done (unit-tested) | `claude/elegant-knuth-3ig53s` | Code.gs 4.0.0, Admins + Log sheets, Google admin gate behind `adminAccounts`, version banner |
| S07 | Teacher tools I | Done (unit-tested) | `claude/elegant-knuth-3ig53s` | Insights, grade by question, comment bank, bulk tools, print test, duplicate / Version B, per-question CSV. Built on the old admin tabs (S05 not done) |
| S08 | Question types I | Done | `claude/elegant-knuth-3ig53s` | multipart, naming, dropdown + confidence/hints |
| S09 | Question types II | Done | `claude/elegant-knuth-3ig53s` | dimensional, nuclear, reaction, vsepr, datatable |
| S10 | Question types III + algorithmic | Done | `claude/elegant-knuth-3ig53s` | molarmass, imagechoice, particles, titration, estimate + algorithmic variables |
| S11 | Classes + bank + pools | Done | `claude/elegant-knuth-3ig53s` | Classes/rosters, roster-only, bank, pools, import, 6 templates |
| S12 | Scheduling + accommodations | Done | `claude/elegant-knuth-3ig53s` | Window, late work, accommodations, extensions, regrade, release emails, announcements |
| S13 | Live + mastery | Done | `claude/elegant-knuth-3ig53s` | Live monitor, mastery, student profiles |
| S14 | Games I | Done | `claude/elegant-knuth-3ig53s` | gameOptions + Tower, Boss Battle, Mistake Review, Unit Dash |
| S15 | Games II + leaderboard | Done | `claude/elegant-knuth-3ig53s` | Reaction Lab, Molecule Builder, Periodic Puzzle, Daily Element, XP/badges, practice, leaderboard |
| S16 | Student tools | Done | `claude/elegant-knuth-3ig53s` | Calculator, constants, scratchpad, read-aloud, highlighter, dashboard, flag notes, offline banner, font size |
| S17 | Platform | Done | `claude/elegant-knuth-3ig53s` | Backup/restore, error reports, platform settings, copy-deployment guide |
| S18 | Hardening | Done | `claude/elegant-knuth-3ig53s` | Flags on, fixes, full E2E run |
| S19 | Release | Done | `claude/elegant-knuth-3ig53s` | Guide, DEPLOYMENT (Upgrading to v4), ARCHITECTURE, README |

## Handoff notes

<!-- Newest first. For each session: what got done, what's half-done (and behind which flag), next step, surprises. -->

### S06 + S07 (2026-11-04)
- S06: every admin action goes through `requireAdmin_` (Google token on the Admins sheet, or ADMIN_KEY). Client sign-in UI is behind `FEATURES.adminAccounts` until Code.gs 4.0.0 is deployed (steps in DEPLOYMENT.md).
- S07: all client-side, visible (no flag). Old `duplicate-<code>` button still makes `CODE_COPY` (E2E asserts it); the new `CODE-2` flow is `duplicate-new-<code>`. Bulk release/un-release use `saveGrade` (Auto-graded rows become Graded). Fixed `normalizeRow` overwriting the Extra attempt status.
- Not run: E2E suite. Run `npm run test:all` first next session.
- S05 still to do; S07 tools will need to move into the new shell.

### S00–S04 (2026-11-04)
- Done: FIX-3 finished; S01 flags/version/module split; S02 tokens, logo, DESIGN.md; S03 shell + student views; S04 runner, results, feedback, PDF header.
- **Not verified:** the full unit + E2E suites were not run after the S03/S04 view changes (owner's instruction). First step next session: `npm run test:all` and `npm run validate:tests`, fix anything red, and look at screenshots at 360/768/1366 in light and dark.
- Deviations: the reference pane stays side-by-side (collapses to a slim rail, stacks on narrow screens) instead of a right drawer, because `v2-runner.test.mjs` asserts that layout. The runner header no longer repeats the test title (the runner bar shows it). Local results have no released flag, so landing shows "Submitted" unless one is present.
- Surprises: `assets/brand/source/*.svg` were PNGs wrapped in SVG; the mark was redrawn as paths (`chemworks-mark.svg`). Google Fonts don't load in the sandbox, so screenshots show fallback fonts.
- Next: S05 admin revamp (behind `FEATURES.adminShell`).
