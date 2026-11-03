# ChemistryWorks v2 — delegation plan

## Goal
Implement docs/v2plan.md (V2-01 … V2-09) in the existing no-build static app (ES modules, plain CSS,
Node test runner, Playwright E2E, Apps Script backend).

## Mode
DELEGATE-MULTI. Opus wrote the shared contracts (wave 0, committed); Sonnet executors build the UI in
parallel (wave 1–2); a design pass (wave 3); Opus integrates and verifies.

## Ground rules for every executor
- **Source of truth for data shapes: `docs/ARCHITECTURE.md`, section "V2 contracts"** (read it fully) plus the
  existing sections (view contract, testids, security notes). The product spec is `docs/v2plan.md`.
- Wave 0 already implemented (do NOT edit unless your spec owns the file): `js/lib/schema.js`,
  `js/lib/grading.js`, `js/lib/orbital.js`, `js/lib/sections.js`, `js/lib/structure.js`, `js/lib/comments.js`,
  `js/views/comment-view.js`, `js/lib/api.js`, `apps-script/Code.gs`, `js/views/admin/stats.js` (normalizeRow).
- No build step, no npm dependencies. DOM via `h()` from `js/ui.js`; never `innerHTML` with test content or
  user input (use `h()`, `richText()`, `textContent`). Math via `renderMath(root)`.
- Several executors work **in the same working tree at the same time**. Edit only files you own. If an E2E
  test fails because of a file you don't own (e.g. a syntax error mid-edit by another executor), wait a minute
  and rerun before concluding anything. **Do not run `git commit`, `git stash`, `git checkout` or any git
  command that changes the tree.** `git diff`/`git status` are fine.
- Keyboard + touch usable controls, visible focus, `aria-*` labels, no information by colour alone.
- Colours only via CSS custom properties from `css/base.css`; existing tokens: --bg --bg-elev --bg-sunken
  --border --border-strong --text --text-muted --text-faint --primary --primary-hover --primary-ink
  --primary-line --primary-ring --primary-soft --on-primary --success --success-ink --success-soft --danger
  --danger-ink --danger-line --danger-soft --warning --warning-ink --warning-line --warning-soft --radius
  --radius-sm --radius-lg --shadow-sm --shadow --font --mono --dur --ease. Never hard-code hex colours in
  view CSS (a later design task restyles everything through these tokens). Font for formulas/numbers: var(--mono).
- Shared sample test for E2E: `test/fixtures/tests/CHEMV2.json` (code `CHEMV2`; served as bundled by the
  E2E helper, NOT listed in the fixture catalog index.json — open it by code). Read
  `test/e2e/helpers.mjs` and copy patterns from the existing `test/e2e/*.test.mjs` files.
- Commands: `npm test` (unit), `node --test test/e2e/<file>.test.mjs` (one E2E file),
  `npm run test:e2e` (all E2E; slow, ~2–3 min).

## Waves
- Wave 1 (parallel): T01 runner+references, T02 diagrams+results, T03 builder, T04 grading, T06 library counts + student feedback
- Wave 2 (parallel): T05 export/PDF, T07 unit tests for wave-0 libs
- Wave 3: T08 Lab-notebook design system (V2-09), T09 docs (README, guide.md, DEPLOYMENT.md)
- Opus: integration, full test run, review, commit, push.

## Log
