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
| S05 | Admin revamp | Not started | | |
| S06 | Admin accounts + backend 4.0 base | Not started | | |
| S07 | Teacher tools I | Not started | | |
| S08 | Question types I | Not started | | |
| S09 | Question types II | Not started | | |
| S10 | Question types III + algorithmic | Not started | | |
| S11 | Classes + bank + pools | Not started | | |
| S12 | Scheduling + accommodations | Not started | | |
| S13 | Live + mastery | Not started | | |
| S14 | Games I | Not started | | |
| S15 | Games II + leaderboard | Not started | | |
| S16 | Student tools | Not started | | |
| S17 | Platform | Not started | | |
| S18 | Hardening | Not started | | |
| S19 | Release | Not started | | |

## Handoff notes

<!-- Newest first. For each session: what got done, what's half-done (and behind which flag), next step, surprises. -->

### S00–S04 (2026-11-04)
- Done: FIX-3 finished; S01 flags/version/module split; S02 tokens, logo, DESIGN.md; S03 shell + student views; S04 runner, results, feedback, PDF header.
- **Not verified:** the full unit + E2E suites were not run after the S03/S04 view changes (owner's instruction). First step next session: `npm run test:all` and `npm run validate:tests`, fix anything red, and look at screenshots at 360/768/1366 in light and dark.
- Deviations: the reference pane stays side-by-side (collapses to a slim rail, stacks on narrow screens) instead of a right drawer, because `v2-runner.test.mjs` asserts that layout. The runner header no longer repeats the test title (the runner bar shows it). Local results have no released flag, so landing shows "Submitted" unless one is present.
- Surprises: `assets/brand/source/*.svg` were PNGs wrapped in SVG; the mark was redrawn as paths (`chemworks-mark.svg`). Google Fonts don't load in the sandbox, so screenshots show fallback fonts.
- Next: S05 admin revamp (behind `FEATURES.adminShell`).
