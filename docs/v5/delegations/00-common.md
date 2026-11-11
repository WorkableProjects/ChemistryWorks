# Rules for every v5 delegation agent

You are one worker on ChemWorks v5. The orchestrator gave you one **agent ID** (e.g. `S03a`). Your brief is the
section with that ID in `docs/v5/delegations/<session>.md`. Do only that brief.

## ASAP override (from the user — wins over every brief)
- **No testing.** Don't write new test files, don't rewrite old ones, don't run `npm test` or any e2e. Skip every
  "Tests" / "E2E" / "Unit" item in your brief. Only run `node --check <file>` on each JS file you changed.
- If you delete a module, also delete test files that import only that module (nothing more).
- Ship the feature **on**: build it behind its flag as the brief says, but don't spend time on the flag-off path
  beyond not crashing.
- Be fast: no extra docs, no refactors outside your brief. Report `Tests: skipped (ASAP)`.

## Design rules (v5 "unslop" pass — every new or touched UI follows these)
Direction: **exact, calm, a little lab-notebook.** World: the lab bench — navy ink, teal reagent, cool grey paper.
- Spacing on a 4px grid, from `--space-*`. Same things, same size. No one-off values.
- Colour: tokens only. Surfaces stay neutral (`--bg`, `--bg-elev`, `--bg-sunken`); the accent (`--primary`) marks the
  primary action, the selection or the one number that matters — nothing else. No gradients, glows, coloured
  shadows, blur/glass. Borders are `1px solid var(--border)`. Shadows only `--shadow-sm` / `--shadow` / `--shadow-lg`.
- Radius: controls `--radius-control` (10px), cards `--radius` / `--radius-lg`. Pills (999px) only for status chips,
  avatars, meters and segmented controls — never buttons or inputs.
- Type: weights 400 / 500 / 600 only. Sentence case everywhere; no uppercase or tracked labels. Hierarchy from size
  and colour (`--text`, `--text-muted`, `--text-faint`). Figures, codes and formulas in `var(--font-mono)` with
  `font-variant-numeric: tabular-nums`.
- Icons: the existing `icon()` set in `js/ui.js`, one size, colour of their text. **No emoji** anywhere in the UI.
- Copy: plain and short. No exclamation marks, no hype, no trailing period on labels/buttons/headings. A change says
  what it compares to. Empty states: one sentence + one action.
- Motion: `--dur-fast` hover/press, `--dur-base` menus, `--dur-slow` entrances; easing `--ease-out` only (no bounce or
  overshoot; `--ease-spring` is now an alias). Animate opacity/transform/colour only. No looping animation unless the
  thing is live (timer, loader). No hover lift/scale on cards; press = `scale(0.98)`.
- One moment per screen (a level ring, a score ring, a chart, the periodic-table tile); everything around it quiet.
  Stat cards are a label, a figure and a comparison — no sparklines or icons to fill space.
- Signature: the **element tile** — a small square with a mono symbol/number, like a periodic-table cell — for test
  codes, avatars' fallback and mode icons. Use it; don't invent other motifs.

## Read first (and nothing else unless your brief needs it)
1. Your brief.
2. `docs/ARCHITECTURE.md` → **V5 contracts** (written by W0). Code against it. If you must change a contract, change it
   there in the same commit and say so in your report.
3. The files your brief names. Use Grep to find more; don't read whole large files (`runner.js`, `builder.js`,
   `Code.gs`) top to bottom — jump to the parts you need.

`docs/v5/v5plan.md` is the full plan. Read only the section your brief points to.

## Open-question answers
Use the answers in `docs/v5/delegations/README.md` → **Decisions**. Don't re-ask.

## Work rules
- You run in your own git worktree. Commit there on the current branch with a clear message. **Don't push, don't open a PR.**
- Stay inside the files your brief **owns**. Hotspot files (below) take small, additive edits only.
- New v5 UI goes behind its `FEATURES` flag (`js/config.js`, read with `feature(name)`), as listed in V5 contracts.
  With the flag off, the app must behave like before.
- Follow existing patterns: ES modules, no build step, no new npm deps, no frameworks, colours from tokens only
  (unit test rejects raw hex in views), every animation off under reduced motion, existing `data-testid`s kept.
- Writing for users (labels, help text) is plain and short, for teachers and students.
- Don't touch: `js/version.js`, `package.json` version, `changelog/`, `docs/v5/v5-progress.md`, `docs/v5/v5plan.md`
  (orchestrator / S14c own these).

## Hotspot files (append-only, keep edits tiny so merges are trivial)
`js/config.js` (FEATURES), `js/lib/qtypes/v4-types.js` and `js/views/qtypes/index.js` (type imports), `js/lib/schema.js`
(`TYPE_LABELS`), `index.html` (stylesheet/script tags), `js/lib/api.js` (new wrappers: add at the end of the file),
`docs/ARCHITECTURE.md` (only under your own `### <agent ID> …` heading inside V5 contracts), `apps-script/Code.gs`
(backend-lane agents only).

## Tests
- Run `npm test` (unit) — must pass.
- Run only the e2e files you added or touched: `node --test --test-concurrency=1 test/e2e/<file>.test.mjs`.
  The orchestrator runs the full suite after merging.
- Add tests as your brief says. Name new files `test/unit/v5-*.test.mjs`, `test/e2e/v5-*.test.mjs`.
- Never skip, delete or weaken a test to get green, except tests your brief says to remove or rewrite.

## Stop rules
- If blocked by a missing dependency (a contract or module from another agent isn't there), stop and report — don't
  build a stand-in.
- If something takes far more than the brief implies, finish a working, flagged subset and report what's left.

## Report (your final message, ≤150 words)
```
ID: <agent ID>   Status: done | partial | blocked
Commits: <short sha> <subject>
Tests: npm test <pass/fail counts>; e2e <files: pass/fail>
Contract changes: none | <what>
Left / follow-ups: <bullets or none>
```
