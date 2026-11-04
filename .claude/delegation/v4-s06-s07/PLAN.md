# v4 S06 + S07 delegation plan

Two independent sessions of `docs/v3/v4.0plan.md`, one Sonnet subagent each, running in parallel in the same working tree.
- **T09 = S06** Admin accounts + backend 4.0 base (V4-07 admin sign-in, `Admins`, `Log`, version check, deploy notes).
- **T10 = S07** Teacher tools I, client only (Insights, grade by question, comment bank, bulk tools, print test, duplicate/versions).

Already on the branch (read, don't rebuild): S00–S04 (see `docs/v3/v4-progress.md`, `docs/ARCHITECTURE.md` "V4 contracts", `docs/DESIGN.md`).
S05 (admin shell revamp) is NOT done: build on the current admin tabs (`js/views/admin.js`).

## Shared contract (written by Opus, committed): `js/lib/admin-session.js`
`adminKey()`, `hasAdminAuth()`, `adminRequestAuth()` — names and return shapes fixed. T09 implements the Google-admin part;
T10 replaces every direct `load('adminKey', '', 'session')` in its owned files with `adminKey()` / `hasAdminAuth()`.

## File ownership (exclusive)
- T09: `apps-script/Code.gs`, `apps-script/appsscript.json`, `js/lib/api.js`, `js/lib/auth.js`, `js/lib/admin-session.js`, `js/app.js`,
  `js/views/admin/settings.js`, `js/views/admin/builder.js` (auth gate lines only), new `js/views/admin/admins.js`, new `js/lib/version-check.js`,
  `DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, `test/unit/apps-script.test.mjs`, `test/unit/api.test.mjs`, `test/unit/v2-api.test.mjs`, new `test/unit/v4-admin-*.test.mjs`.
- T10: `js/views/admin.js`, `js/views/admin/grading.js`, `js/views/admin/library.js`, `js/views/admin/stats.js`, `js/lib/comments.js`,
  `js/views/comment-view.js`, `css/admin.css`, `css/grading.css`, new `js/views/admin/insights.js`, new `js/views/admin/grade-by-question.js`,
  new `js/views/admin/print-test.js`, new `js/lib/versions.js`, new `test/unit/v4-teacher-*.test.mjs`.
- Shared files neither may edit: `js/config.js`, `css/base.css`, `js/ui.js`, `docs/v3/*`. Need a change there → write it in your report.

## Rules
- Same `data-testid`s; tokens only in CSS (no hex in CSS except base/print); `node --check` every JS file you touch.
- Run `npm test` (unit, ~2 s) before reporting. Do NOT run the E2E suite (owner's instruction). Don't edit existing E2E tests.
- Never git checkout/stash/reset/commit; the other agent is editing other files at the same time.
- Unfinished parts hide behind `feature('<flag>')` from `js/config.js` (flags: `adminAccounts`, `teacherTools`).
