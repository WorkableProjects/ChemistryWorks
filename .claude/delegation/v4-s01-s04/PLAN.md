# v4 S01–S04 delegation plan

## Goal
Implement sessions S01–S04 of `docs/v3/v4.0plan.md`:
- S01 Foundations: `FEATURES` flags, site version, code-health split of `runner.js` / `builder.js`.
- S02 Brand system (V4-00): navy/teal tokens, display font, SVG logos, naming rules, contrast tests, DESIGN.md.
- S03 App shell + student views (V4-01): shared components, icon sprite, header + settings popover, landing, mode select, status pages.
- S04 Runner + results revamp (V4-01): runner layout, navigator rail / bottom sheet, results, feedback, PDF header.

## Mode
Split: Opus does flags, tokens, shared components and integration; Sonnet subagents do the module splits and per-view revamps with exclusive file ownership.

## Hard constraints (every task)
- Static site, no build step, no new dependencies. ES modules in `js/`, plain CSS in `css/`.
- `data-testid` values must not change; the E2E suite (`npm run test:e2e`) must stay green.
- Behaviour must not change in refactor tasks (pure moves).
- Branch: everything lands on `claude/elegant-knuth-3ig53s` (the session branch), not `v4`.

## Verification
- `npm test` (unit), `npm run test:e2e` (Playwright, ~6 min, each file picks a free port so parallel runs are safe), `npm run validate:tests`.

## Log

## Wave 2 design brief (S03 + S04 view tasks T04–T08) — read before any view task
Source of truth: `docs/v3/v4.0plan.md` sections **V4-00** and **V4-01** (read both fully, especially "Student views", "Motion", "PDF export").

Already built (commits on this branch) — use, do not rebuild:
- Tokens in `css/base.css`: `--brand-navy`, `--brand-teal` (fills/decoration only on light surfaces), `--brand-teal-ink` (teal text), `--bg/--bg-elev/--bg-sunken`, `--text/-muted/-faint`, `--border/-strong/-control`, `--primary` (navy light / teal dark) + `-hover/-soft/-line/-ink/-ring`, `--on-primary`, `--success/-danger/-warning` (+`-soft/-ink/-line`), `--space-1..8` (4…64px), `--radius-sm/-/-lg/-xl`, `--shadow-sm/-/-lg`, `--font-display` (Plus Jakarta Sans: headings, buttons, scores), `--font-body`, `--font-mono` (numbers, codes, formulas), `--dur-fast` 120ms / `--dur-base` 200ms / `--dur-slow` 320ms, `--ease`, `--ease-out`, `--ease-enter`, `--ease-spring`, `--touch` 44px, `--header-h` 60px.
- Components in `css/base.css` + `js/ui.js`: `.btn` (`--primary/--ghost/--subtle/--success/--danger`, `--sm/--lg/--block`), `.card`, `.pill` (`--primary/--success/--danger/--warning`), `.notice--info/success/warning/error`, `.input`, `.field`, `openModal`, `toast`, `icon(name)` (sprite; names in `ICON_NAMES`: flask home flag lock clock check x left right grid list logout sheet plus trash up down copy download upload eye chart key info alert refresh pen sun moon monitor sort keyboard settings menu book play gamepad pencil layers send award hourglass inbox sidebar panel user type sparkle minus external), `brandLogo('wordmark'|'mark', {mono})`, `flaskLoader({size,label})`, `appHeader({title, subtitle, right, onHome})` (navy bar), `userBadge`, `stagger(listEl)` (+ `.stagger-item`), `countUp(el, to)`, `prefersReducedMotion()`, `viewTransition`.

Rules for every view task:
1. **Same features, same `data-testid`s.** Never rename/remove a testid or change what a testid'd element does (tests click/type/read them). You may move elements and wrap them. Keep focus management and aria as good or better.
2. **Tokens only:** no hex/rgb colour literals in view CSS (a unit test fails on hex in any css file except base.css/print.css). `rgb(255 255 255 / x)` style overlays are discouraged; use tokens / `color-mix(in srgb, var(--x) N%, transparent)`.
3. **Motion:** only `transform`/`opacity`, ≤ 400ms, token durations/easings; everything off/instant under `@media (prefers-reduced-motion: reduce)` AND `:root[data-motion="reduce"]` (base.css already zeroes durations globally for both, so token-based animations are covered automatically; JS-driven animation must check `prefersReducedMotion()`).
4. **Layout:** works at 360, 768, 1366 px with no horizontal scroll; 44px min touch targets; works in light and dark (`:root[data-theme="dark"]`).
5. **Naming:** full name "ChemistryWorks" in titles/intro/footers/PDF footer; short name "ChemWorks" only in compact spots (logo). Never both in one string.
6. **No tests:** the owner asked not to run test suites this session. Do run `node --check <file>` on every JS file you touch. Do NOT run `npm test` / `npm run test:e2e`. Do not edit test files.
7. Stay inside your **Owns** list. Other engineers are editing other files concurrently: never git checkout/stash/reset/commit.
