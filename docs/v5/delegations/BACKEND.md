# Backend lane — `apps-script/Code.gs` 5.0.0

Only these three agents edit `Code.gs`, one after another. Each extends `test/unit/apps-script.test.mjs`'s in-memory
fakes (add `CacheService` / `LockService` fakes if missing) and adds its own `test/unit/v5-backend-*.test.mjs`.
Contracts: V5 contracts → Backend 5.0 and Client API. Keep every v4 action working unchanged.

## B1 — Students, Attempts, profile + sync, cache and batch base (plan S05)
**Model:** sonnet · **After:** W0 · **Plan:** V5-02 "Backend", "Backend changes summary"
**Owns:** `apps-script/Code.gs`, `test/unit/v5-backend-profile.test.mjs`, end of `js/lib/api.js`

1. `VERSION = '5.0.0'`. `setup()` creates `Students` and `Attempts` with the contract headers (idempotent).
2. Small helpers first, reused by B2/B3: `readCols_(sheet, names)` (read only needed columns), `cached_(key, ttl, fn)` +
   `bust_(...keys)` on `CacheService.getScriptCache()`, `upsertByKey_(sheet, keyCols, row)` under `LockService`,
   `studentFromToken_(body)` (reuse the existing ID-token check; returns lower-cased email or error).
3. Actions: `getStudentProfile` (profile + own submissions, score only when released + assigned tests from `Classes`
   rosters), `saveStudentProfile` (prefs; throttle), `syncProgress` (upsert attempt; XP/badge merge: never lower,
   daily cap like `ROUND_XP_CAP`), admin `getStudentProfileAdmin` (Decision 6: no XP/level/badges).
   A student can only ever read/write their own email — test that with a forged email field.
4. `batch`: `{ action: 'batch', ops: [{ action, ... }] }` → `{ results: [...] }`, one auth check, allowed only for
   listed admin write actions; per-op errors don't abort others.
5. Client wrappers at the end of `js/lib/api.js`; unset backend → resolve `{ result: 'offline' }` like existing wrappers.
6. Tests: unit for every action, auth refusal, merge rules, batch. `npm test` green.

## B2 — Fast reads for V5-11 (plan S08 backend)
**Model:** sonnet · **After:** B1 · **Plan:** V5-11 "Backend"
**Owns:** `apps-script/Code.gs`, `test/unit/v5-backend-perf.test.mjs`, end of `js/lib/api.js`

1. `listTests` adds summary fields per test: question count, total points, updatedAt, status, submission count,
   needs-grading count — one pass over Tests + Submissions (read only needed columns), cached; bust on publish/delete/
   submit/saveGrade/release.
2. `getResults` accepts `testCode`, `status`, `since` (ISO); without filters it behaves as today.
3. Writes (`publishTest`, `deleteTest`, `saveGrade`, `releaseAll`, `allowRetake`, …) also return the updated row/summary
   (`row` field) — additive, old fields unchanged.
4. Cache `getSettings` and class rosters; bust on their writes.
5. Tests: summary counts, filters, `since`, cache busting (fake cache), write responses. Old tests untouched and green.

## B3 — Class Hub backend (plan S07 backend)
**Model:** sonnet · **After:** B2 · **Plan:** V5-10 "Backend", "Tests"
**Owns:** `apps-script/Code.gs`, `test/unit/v5-backend-hub.test.mjs`, end of `js/lib/api.js`

1. `setup()` adds `Assignments`, `Stream` (and read-state storage per Decision 7).
2. Admin: `saveAssignment` (also writes a stream post of type `assignment`), `deleteAssignment`, `listAssignments`,
   `postStream`, `deleteStreamPost`, `getAssignmentStatus` (roster × Submissions × Attempts → status per student:
   not_started / in_progress(%, lastMode) / turned_in / late / missing / graded / released), `remindMissing`
   (stores a reminder the student home shows). Log writes like other admin writes.
3. Student: `getClassHub` (own classes only: classes, stream, assignments with own status, derived notifications:
   new assignment, due in 24 h, feedback released, reminder; `publishAt` in the future = hidden),
   `markNotificationsRead`. Fold a `hub` field into `getStudentProfile` so the home makes one request.
4. Grading data: submissions from an assignment carry `dueAt` and `late`.
5. Status function as a pure helper `assignmentStatus_(assignment, submission, attempt, accommodation, now)` with unit
   tests: due-date boundary (1 s before/after), script time zone, accommodation extension, late allowed vs not,
   scheduled publish, a student outside the class can't see it.
