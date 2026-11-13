# BACKEND — `apps-script/Code.gs` lane (B1 → B2 → B3 → B4)

Only one of these runs at a time. Each one adds tests in `test/unit/backend-*.test.mjs` using the `vm` harness.
Don't change `VERSION` (S13b sets it to 6.0.0).

## B1 — Security and integrity
**Model:** sonnet · **After:** S01b · **Plan:** V6-02 rows 1, 2, 4, 5, 6, 7, 8, 10 · **Contract:** V6 → Identity,
Backend errors, Admin access
**Owns:** `apps-script/Code.gs`, `test/unit/backend-security.test.mjs` (new)

1. **Submissions (#1):**
   - When a valid ID token is sent, `student_email` and `student_name` come from the token, not the body.
   - Without a token, accept only if `ALLOW_UNVERIFIED_EMAIL` is set, and write `unverified` in a new `Identity`
     column (append the column via `getSheet_`'s header migration).
   - The single-submission check uses the stored email.
2. **Roster (#2):** GET `getTest` returns `{ error: 'not_on_roster' }` for `rosterOnly` tests. The POST-with-token path
   is unchanged.
3. **Feedback (#4):** `getFeedback` requires a valid token whose email matches the row's email.
4. **Formula injection (#5):** run every user-supplied cell through `text_()`. Known misses:
   - Students `name`
   - Attempts `mode`
   - `lastActiveDate`
   - Stream `createdBy`
   - Assignment `classId`
   
   Grep every `appendRow` and `setValue(s)` for others. Test: write `=HYPERLINK("x")` into every string field of every
   action and assert that no stored cell starts with `=`, `+`, `-` or `@`.
5. **Errors (#6):** the catch-alls (`doGet`, `doPost`) log `String(err)` plus the stack to `Errors` with a short `ref`,
   and return `{ result: 'error', error: 'server_error', ref }`.
6. **reportError (#7):** limit per sender (token email, else a client-provided ID, hashed), e.g. 20/h, plus a global
   limit of 500/h.
7. **ADMIN_KEY (#8):**
   - Use a constant-time compare.
   - After 10 failures per hour (counted in CacheService), lock out for the rest of the hour and return `locked`.
   - The key keeps working only as the Sheet credential (Decision 3). Remove nothing else here; S03 removes the client
     access code.
8. **Client-trusted values (#10):**
   - `submitGameScore`: cap the score by mode from the test's question count, using a table per mode in the contract.
   - `syncProgress`: work out `streakDays` from server-side activity dates (ignore the client value), and accept
     badges only from a known list (export the list from `js/lib/xp.js` and copy it into Code.gs, with a unit test
     checking the two lists match).
9. **Tests:** one backend test per row. Update existing backend tests whose assumptions changed (e.g. a
   body-email submission now needs a token or `ALLOW_UNVERIFIED_EMAIL`).

## B2 — Performance and housekeeping
**Model:** sonnet · **After:** B1, S02b · **Plan:** V6-03 · **Contract:** V6 → Backend housekeeping
**Owns:** `apps-script/Code.gs`, `test/unit/backend-perf.test.mjs` (new)

1. **Locks:**
   - `appendRow` paths (submissions, live pings, errors, log) take no script lock.
   - Upserts and grade writes keep the lock.
   - `syncProgress` uses `tryLock(1500)` and returns `{ error: 'busy', retryAfter: 30 }` on failure (the client sync
     queue already backs off).
2. **Row-index cache:** a CacheService map from `key → row` for Students (email), Attempts (`email|code`) and
   Submissions (`submissionId`, `email|code`). `upsertByKey_` reads one row, and rebuilds the map on a miss or when
   the key isn't found at the cached row.
3. **Header cache:** cache the header map per sheet for each execution.
4. **Column-limited reads:** `getResults_` skips the answers JSON unless `includeAnswers: true`.
   `testSummaries_` caches parsed summaries keyed by the test's `updatedAt`.
5. **N+1:** read Accommodations once per request in `buildHub_` and `getAssignmentStatus`.
6. **Leaderboard:** `clearLeaderboard_` rewrites the range in one call.
7. **Pruning:**
   - `setupTriggers()` installs a daily `pruneSheets_` trigger.
   - Retention comes from `Settings` (`retainLiveDays` 1, `retainLogDays` 180, `retainErrorsDays` 180,
     `archiveStreamDays` 300).
   - Stream posts move to `Stream_archive`.
   - Pruning works in chunks and rewrites the range, never deleting row by row.
   - `setup()` calls `setupTriggers()`, which is safe to run more than once.
8. **`diag`** (admin action): row counts per sheet plus timings for `listTests`, `getResults`, `getClassHub` and
   `syncProgress`, with a fake student.
9. **Tests:**
   - Count the fake-sheet `getValues` calls to prove the reads shrank, e.g. `syncProgress` reads ≤ 2 rows.
   - The lock-free paths take no lock.
   - Pruning keeps the right rows.
   - The trigger setup can run twice safely.

## B3 — Tags backend
**Model:** sonnet · **After:** B2 · **Plan:** V6-09 B · **Contract:** V6 → Tags
**Owns:** `apps-script/Code.gs`, `test/unit/backend-tags.test.mjs` (new), `js/lib/api.js` (append wrappers)

1. **`Tags` sheet:** add it per the contract, created lazily.
2. **`publishTest`** accepts `tagDefs` and upserts them in the same lock:
   - A new ID becomes a row owned by the caller.
   - For an existing ID, the Sheet wins unless the caller owns the row, in which case the caller's name, colour and
     description are applied.
   - Reject publishing if a question references an ID that is neither in `tagDefs` nor on the Sheet
     (`error: 'unknown_tag'`, listing the IDs).
3. **Actions:**
   - `listTags`: non-deleted rows, plus a usage count over published tests (cached and cleared on publish or tag write).
   - `saveTag`: owner only; edits only, never creates (`error: 'not_on_sheet'`).
   - `deleteTag`: owner only; soft delete.
   - `mergeTags`: owner of both tags; rewrites IDs in the owner's published tests under the lock; sets `mergedInto`.
     Resolution follows `mergedInto` chains.
4. **`tagIndex`:** `getTest`, `getTestFor_` and `getFeedback` return `{ id: { name, color } }` for the IDs the test
   uses, including deleted tags (name kept) and resolving merged ones.
5. **Text:** `text_()` on name and description.
6. **API wrappers** at the end of `api.js`: `listTags`, `saveTag`, `deleteTag`, `mergeTags`.
7. **Tests:**
   - Sheet tags only come from publishing.
   - Owner-only edits.
   - The Sheet wins for tags someone else owns.
   - Soft delete, merges, `tagIndex`.
   - `unknown_tag`.

## B4 — Google Classroom backend
**Model:** sonnet · **After:** B3 · **Plan:** V6-09 A · **Contract:** V6 → Google Classroom
**Owns:** `apps-script/Code.gs`, `apps-script/appsscript.json`, `test/unit/backend-classroom.test.mjs` (new),
`test/unit/helpers/fake-classroom.mjs` (new), `js/lib/api.js` (append wrappers)

1. **Manifest:** `appsscript.json` enables the Classroom advanced service (`dependencies.enabledAdvancedServices`,
   `Classroom` v1) and declares `oauthScopes`:
   - every scope the script already needs (find them by grepping service use: Spreadsheet, Mail, UrlFetch, Script
     properties, triggers)
   - `classroom.courses.readonly`
   - `classroom.rosters.readonly`
   - `classroom.profile.emails`
   - `classroom.coursework.students`
2. **Course actions:**
   - `listClassroomCourses`: `Classroom.Courses.list({ teacherId: 'me', courseStates: ['ACTIVE'] })`, paged. Also
     return `Session.getEffectiveUser().getEmail()` as `syncAccount`.
   - `linkClassroomCourse`: sets `Classes.classroomCourseId`.
   - `importClassroomRoster`: `Courses.Students.list` → emails, merged into the class roster.
3. **`saveAssignment`** with `postToClassroom: true`:
   - Create coursework: title, description = instructions + test link, `maxPoints`, due date/time, `workType: 'ASSIGNMENT'`, `materials: [{ link }]`.
   - `state: 'DRAFT'` when `publishAt` is in the future; publishing happens through a trigger at `publishAt`.
   - Store `classroomCourseWorkId`.
   - **Deleting:** `deleteAssignment({ deleteInClassroom })` deletes the coursework in Classroom only when `deleteInClassroom` is true.
4. **`previewGradeSync`:** for each roster student, return the email, ChemistryWorks final score, release state, the
   current Classroom draft and assigned grades, the last value we sent (`ClassroomSync`), and the action:
   `new | update | same | skipped_not_on_roster | skipped_teacher_changed`.
   - Grade rules (Decision 7): released → `assignedGrade` (and `draftGrade`); graded but not released → `draftGrade` only;
     not graded → skip.
   - The overwrite guard: if the Classroom value differs from our last sent value, skip unless `overwrite: true`.
5. **`syncGrades`:**
   - Apply the actions with `StudentSubmissions.patch` and `updateMask`, about 100 ms apart.
   - Stop at about 25 s and return a `cursor`, so the client calls again.
   - Write a row to `ClassroomSync` and to `Log` for each student.
   - Map errors: `ProjectPermissionDenied` → `classroom_not_our_coursework`, 403 → `classroom_not_teacher`.
6. **Auto-sync on release:** with the class setting `autoSyncClassroom`, `releaseAll` and `saveGrade(release)` sync
   those students on a best-effort basis and record failures.
7. **`fake-classroom.mjs`:** a fake Classroom service with courses, students with profiles, coursework,
   studentSubmissions (with patch and updateMask), paging, and injectable errors.
8. **Tests:**
   - Every grade-rule row.
   - The overwrite guard.
   - Cursor resume.
   - Permission errors.
   - Draft coursework published through the trigger.
   - Roster import.
