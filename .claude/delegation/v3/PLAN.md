# v3.0 delegation plan

Source: docs/v2.5/v3.0plan.md. User asked for minimal testing: run `npm test` (unit) + `node --check`; no new test suites required.

- Opus (direct): V3-00..V3-03 — Code.gs 3.0.0, auth token, api, student-status.js, app.js routing, feedback.js review,
  submit.js, admin grading tools, library tag, docs, DEPLOYMENT.
- Wave B (parallel, Sonnet): T01 question types part 1 · T02 games · T03 motion tokens + global UI animations
- Wave C (Sonnet): T04 question types part 2 (+ wire new types into games)
- Wave D (Sonnet): T05 runner/results animations + a11y/perf polish

Decisions: the big runner.js/builder.js split (V3-07 code health) is NOT done wholesale; new types put their widget/editor
code in new modules (js/views/widgets/<type>.js, js/views/admin/editors/<type>.js) and only register in runner/builder.
Leaderboard out of scope. Sound optional, off by default.
