# v6 progress

Built in one session on 2026-11-13, without sub-agents and, at the user's request, without new or updated tests.

## Done
- **V6-02 Security:** token-bound submission identity (+ Unverified column), GET refuses roster-only tests, `getFeedback` needs a token, `text_()` on the remaining user columns, generic `server_error` + ref, per-sender error-report limit, constant-time `ADMIN_KEY` + lock-out, CORS submissions with outbox retry, server-side streak, per-test game-score cap, badge allowlist, CSP meta, SRI on KaTeX, `innerHTML` helpers hardened, admin access code removed.
- **V6-03 Backend performance:** re-entrant `tryLock`, short lock for progress sync, row-index cache in `upsertByKey_`, header check once per execution, accommodations read once per request, `getResults` can skip answers, one-call leaderboard clear, daily pruning trigger + retention settings, `diag` action shown in Platform.
- **V6-05 Clean-up (part):** all 13 feature flags removed (3 kill switches kept), dead admin tab UI and `v2`/store branches removed, Netlify form/config/code and `netlify.toml` removed, `unavailable` path for old backends removed, one catalog file on the client, shared `js/lib/dates.js`, attempts read through `storage.js`, `?v=` on every stylesheet, session tags stripped from comments.
- **V6-06 Accessibility (part):** `#app` no longer a live region; one polite announcer + focus to the view's `<h1>`.
- **V6-07 PWA:** manifest, versioned service worker, offline banner (flushes the outbox when back online), "Update available" banner.
- **V6-08 Deployment:** `ci.yml`, Pages deploys only after CI and writes `js/config.local.js` from repository variables, `docs/guide.md` published, clasp example + `npm run gas:push` + manual `gas-deploy.yml` with a ping check, `setup()` creates every sheet, installs the trigger and logs a checklist, Platform deployment checklist.
- **V6-09 A Classroom sync** and **B Question tags:** backend actions, sheets and UI as in the plan (builder picker/filter/apply, Admin → Tags, grading averages, feedback "By topic", profile accuracy, game-mode filter, library filter, import by name, backup).
- **V6-10:** version 6.0.0, changelog, DEPLOYMENT.md rewritten, ARCHITECTURE.md current-state section (old notes archived), README/guide updated.

## Left
- **V6-01 tests/CI:** no new tests were written. `npm test`: 735 pass, 55 fail. The failures are tests of intentionally changed behaviour (Netlify channel, `feature()` export, publish reply shape, and backend `vm` mocks that lack `tryLock`, `setProperty`, `Utilities`). Update the harness and these tests first. E2E suite not run; stale e2e tests from v5 are not fixed. No smoke/axe/perf tests.
- **V6-04 one question-type system:** not started (20 built-in types still in switch blocks; CSS still per session).
- **V6-05:** `runner.js` / `builder.js` not split; view CSS still linked in `index.html` (not lazy); boot loader SVG still duplicated; `constants→resources` shim kept.
- **V6-06:** WCAG audit and keyboard (pick-then-place) alternatives for drag widgets not done.
- **V6-09:** tracker per-tag columns not done (grading has per-tag averages); CSV not reformatted for Classroom import.
