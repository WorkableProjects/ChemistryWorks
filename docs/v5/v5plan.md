# ChemWorks v5.0 — Plan

> **Status:** Draft — needs answers to **Open questions** before S01 starts
> **Version:** 5.0.0 (major: new backend actions and sheets → `apps-script/Code.gs` 5.0.0, `BACKEND_VERSION` raised)
> **Builds on:** v4.1.0 (admin shell, 30+ question types, 14 games, student tools, XP, leaderboard, What's new)

## Original notes

- Revise all games to use the questions within a practice; not be independent (e.g. the periodic table sort game has NO relevance to average atomic mass — it has no mass in it). Each game is a **game mode of the normal Study mode**: it doesn't change the questions, just how you do them.
- Animation of the sidebar in the Admin Panel.
- Remove: Insights, Mastery.
- More question types.
- A whole student dashboard instead of the basic one (screenshot): polished, a whole student profile (use Google Sheets).
- More polished animations where there are none (more professional), e.g. the light ↔ dark switch.
- More UI improvements (a better accent selector, etc.).
- More big improvements.

## Scope

| ID | Requirement | Priority |
|---|---|---|
| V5-01 | Games become modes of the test's own questions | High |
| V5-02 | Student dashboard + profile, synced through Google Sheets | High |
| V5-10 | **Class Hub:** assignments, due dates, class stream, notifications | High |
| V5-03 | Remove Insights and Mastery | High (small, first) |
| V5-04 | Admin sidebar animation | Medium |
| V5-05 | Motion pass (theme switch and everywhere still static) | Medium |
| V5-06 | UI improvements: Appearance panel, accent selector | Medium |
| V5-07 | More question types | Medium |
| V5-08 | More big improvements (proposals — pick in Open questions) | Low–Medium |
| V5-09 | Tests, docs, changelog, release | High (last) |

---

## What the code does today (research)

### Games (`js/lib/games/`, `js/views/games/`, `js/views/game.js`, `js/views/mode-select.js`)

14 games in `GAMES` (`js/lib/games/index.js`). They fall into three groups:

| Group | Games | Uses the test's questions? |
|---|---|---|
| Question-driven | Classic, Survival, Lightning Round, Tower, Boss Battle, Flashcards, Mistake Review | Yes, but only a **subset of types** (`CLASSIC_TYPES`, `SURVIVAL_TYPES`, `LIGHTNING_TYPES`, … — each list different) |
| Half | Match-Up | Only `matching` questions; "playable" is false for most practices |
| Independent (built-in content) | Element Hunt, Periodic Puzzle, Daily Element, Molecule Builder, Reaction Lab, Unit Dash | **No.** Fixed content baked into `js/lib/games/*.js` (element families, 18 hard-coded equations in `reactionlab.js`, unit drills). This is the problem in the notes: a test on average atomic mass offers a periodic-table sort with no masses in it. |

Other facts:
- `splitGameQuestions()` (`js/lib/game.js`) **skips** open-ended and many structured types, and the mode chooser tells students "N questions are skipped in game mode". So a game round is not the same set of questions as the test.
- Game answers never reach the study attempt: progress, flags and answers in the runner are separate from game play. Playing a game does not count as doing the practice.
- `gameOptions` (`js/lib/games/options.js`, builder `js/views/admin/game-options.js`) lets a teacher pick games and limit types per test.
- XP, badges, cosmetics, best scores and history are **localStorage only** (`js/lib/xp.js`, `cw:xp:<email>`): lost on a new device or Chromebook reset. Only the leaderboard is server-side (`Leaderboard` sheet).

### Student landing / dashboard (screenshot of the current dashboard, `js/views/landing.js`, `js/views/tools/dashboard.js`, `dashboard-model.js`, `js/views/practice-card.js`)

Built from **this device's** localStorage (`progress:*` keys and `getLocalResults()`). Problems visible in the screenshot:
- The same tests appear **three times**: "My dashboard" list, "Continue where you left off" cards and "Your tests" cards (DEMOV3 twice in "Your tests").
- An **empty white card** under the dashboard list (the practice-card slot / a block with no content).
- Odd numbers: "17.5%" on an in-progress test, "0 released", "0 answered" rows that were opened once and never started.
- Version label shows `v4.0.0` (cached JS or a stale label) while the site is 4.1.0.
- No grades over time, no due dates, no class, no teacher-assigned work, nothing that follows the student to another device.

### Insights and Mastery

- Insights: nav item + in-test tab (`NAV_ITEMS`, `TEST_TABS`, `TEST_SECTIONS` in `js/views/admin/shell.js`), view `js/views/admin/insights.js`, logic `testInsights` / `questionInsights` in `js/views/admin/stats.js`, tests in `test/unit/v4-teacher-stats.test.mjs`, an "Open Insights" link in `js/views/admin/dashboard.js`, a hint in the builder ("Shown in results and Insights").
- Mastery: nav item, `js/views/admin/mastery.js`, `js/lib/mastery.js`. **`js/views/admin/live.js` imports `liveSummary` from `js/lib/mastery.js`** — that function must move before the file is deleted.

### Admin shell (`js/views/admin/shell.js`, `css/admin-shell.css`)

Sidebar has three widths (full ≥1200px, icons-only 768–1199px or collapsed, off-canvas drawer on phones). The active "pill" slides, the phone drawer slides in. The **expand/collapse itself snaps** (no width animation), labels pop in/out, the content area jumps, and switching sections has no transition.

### Theme (`js/lib/theme.js`, Settings)

Light / dark / system plus 7 fixed accents (navy, blue, violet, teal, green, orange, rose). Switching theme swaps every color in one frame (a flash). The accent picker is a plain row of swatches with no preview.

### Backend (`apps-script/Code.gs` 4.0.0)

Sheets: Submissions, Tests, Admins, Log, Classes, Bank, Accommodations, Live, Leaderboard, Errors, Settings. Students are verified by Google ID token (`getStudentStatus`, `getFeedback`). There is no per-student record beyond submission rows.

---

## V5-01 — Games become modes of Study mode

**Rule:** a game is a different way to do **the same questions** as Study mode. It never adds, drops or swaps questions, and never brings its own content.

### Model

- One **attempt** per test per student, shared by Study mode and every game. Answers given in a game are saved to the attempt exactly like the runner saves them (same `progress:*` record, same autosave, same flags). Switching mode keeps your place.
- A game is a **presentation layer**: `{ id, title, blurb, icon, order, pacing, scoring, render(shell, attempt) }`. It asks the attempt for the next question and shows it with the **same question widget the runner uses** (`js/views/runner/widgets.js` + the type registry). No game has its own per-type list any more; `CLASSIC_TYPES`, `SURVIVAL_TYPES`, `LIGHTNING_TYPES`, `BOSS_TYPES`, `TOWER_TYPES`, `MISTAKE_TYPES` go away.
- **Every type plays.** Auto-graded types give instant right/wrong in the game. Teacher-graded types (`short`, `open`, `lewis` drawings, …) are answered in place and marked "Saved — your teacher grades this" (counts as answered, no game points, no life lost).
- Instant feedback in a game follows the test's settings: if the test hides correctness until release, the game shows "Saved" instead of right/wrong and scores on completion/speed only. (See Open question 2.)
- Submitting stays in Study mode's review screen. A game ends on a summary: questions answered, game score, "Review & submit" (goes to the runner's review page) or "Keep playing".
- Mode switcher in the runner header: **Study · Classic · Survival · …** (segmented control / menu). Replaces the separate mode-select page and game picker; `mode-select.js` becomes a first-visit chooser only.

### What happens to each game

| Game | v5 |
|---|---|
| Classic, Lightning Round, Survival, Tower, Boss Battle | **Keep**, rebuilt on the shared attempt + widgets. Timers pause on teacher-graded or long types (balance, graph, structure) or scale by type. |
| Flashcards | **Keep.** Front = question, back = the key (only when the test allows showing answers; otherwise "Flip to answer" opens the widget). |
| Mistake Review | **Keep**, now from the attempt's wrong answers (and released feedback), not a separate local list. |
| Match-Up | **Rework:** pairs built from the test's questions (question ↔ correct answer for mcq / numeric / naming / formula items; plus `matching` pairs). Needs ≥3 such questions; otherwise hidden. |
| Element Hunt, Periodic Puzzle, Daily Element, Molecule Builder, Reaction Lab, Unit Dash | **Remove as games.** Their content is not tied to the practice. Useful parts move: the periodic-table board becomes the widget for `ptable` questions in every mode; the molecule builder and reaction balancer become question types (see V5-07) a teacher can add to a practice. |
| New: **Quiz Show** | Board of tiles grouped by section / topic, point values by difficulty. Picks questions from the test. |
| New: **Race** | Progress car/track: each right answer moves you forward; personal ghost of your last run. |
| New: **Bingo** | 3×3 / 4×4 card of the test's questions; get a line. |

- `gameOptions` keeps working: teacher picks which modes a test offers. Unknown/removed game ids in saved tests are ignored (no crash), and tests with `games: ['elementhunt']` fall back to "all modes".
- Leaderboard and best scores stay per test + mode. XP moves to the profile (V5-02).
- Tests to rewrite: `v25-game`, `v4-games-1`, `v4-games-2` (e2e), `v25-game.test.mjs` (unit). New: "a game round contains exactly the test's questions", "answer in Classic → shows as answered in Study", "every registered type renders in every mode".

## V5-02 — Student dashboard + profile (Google Sheets)

Replace the landing's stacked lists with a real **student home**, backed by the spreadsheet so it follows the student to any device.

### Backend (`Code.gs` 5.0.0)

- New sheet **`Students`**: `email, name, picture, firstSeen, lastSeen, classIds, xp, level, streakDays, lastActiveDate, badgesJson, prefsJson, statsJson, updatedAt`.
- New sheet **`Attempts`** (optional, see Open question 3): `email, code, mode, answeredCount, total, percentDone, updatedAt, answersJson` — server copy of in-progress work so "Continue" works on another device.
- New public actions (Google ID token required, the token's email only — a student can never read another student):
  - `getStudentProfile` → profile row + their submissions (score only when released) + assigned tests from `Classes` rosters (title, code, opens/closes, status).
  - `saveStudentProfile` → prefs (theme, accent, avatar colour), throttled.
  - `syncProgress` → in-progress attempt + XP/badge deltas (server merges; never lowers XP; caps per day like `ROUND_XP_CAP`).
- Teachers see the same profile in the admin Classes/roster view (read-only), replacing what Mastery's `studentProfile` did.
- Offline/unset backend: dashboard still works from localStorage (today's behaviour), with a "Not synced" chip.

### Student home layout

1. **Header band:** avatar, "Good morning, Caden", level ring + XP, day streak, class name(s). Code entry stays as a compact field in the band (not a full card).
2. **Up next:** assignments from their classes (V5-10) with due dates, sorted by due soonest; "Late" / "Opens Fri" chips; one primary "Continue" for the most recent attempt.
3. **In progress:** one deduplicated list (fixes the triple listing), progress bar per test, last mode used, "Remove" for abandoned 0-answered attempts.
4. **Results:** released scores with a small trend chart over time, "Waiting for grading" items, "View feedback".
5. **Practice:** Mistake Review across all tests, recent game bests, badges shelf.
6. **Profile page** (`?view=profile` or avatar → Profile): stats (tests done, average, accuracy by topic from released results only), badges, history, appearance prefs, sign out.

Fixes from the screenshot go in here: no empty card, no duplicates, correct version label.

## V5-10 — Class Hub (assignments + class stream)

The one big feature next to the student dashboard. Today a teacher shares a code and students type it in; nothing tells a student what is due, what is new or what came back graded. The Class Hub turns Classes into a Google Classroom-style space that feeds the student home.

### Teacher side (admin → Classes → a class)

- **Assign** a test or practice to one or more classes: due date/time, open date (reuses the V4 open/close window), "late allowed" switch, optional instructions, which game modes are allowed, "required" vs "optional practice".
- **Stream:** post announcements (text, links, images) and pin one; every assignment also appears as a stream post. Students can't post (no moderation burden); optional "reactions" (seen ✓) so the teacher knows who read it.
- **Assignment tracker:** per assignment, a roster grid — Not started / In progress (% done, last mode used) / Turned in / Late / Missing / Graded / Released — with filters and "Remind missing" (shows a banner on those students' home). Click a student → their profile (V5-02).
- **Schedule ahead:** assign now, publish to students on a date.
- **Copy to class:** reuse an assignment in another class or next year.

### Student side (on the V5-02 home)

- **Up next** is driven by assignments: due soonest first, "Due tomorrow", "Late", "Missing", "Optional practice" chips; one tap opens the test (no code typing).
- **Class page** per class: stream, upcoming / past assignments, teacher name.
- **Notifications** (bell in the header): new assignment, due in 24h, feedback released, teacher reminder. Read state synced to the profile.
- **Calendar strip** on the home: the next 7 days with due items.
- Typing a code still works for anything not assigned.

### Backend

- New sheets: `Assignments` (`id, classId, testCode, title, instructions, opensAt, dueAt, lateAllowed, required, modesJson, publishAt, createdBy, createdAt`), `Stream` (`id, classId, type, body, pinned, createdBy, createdAt`), `Notifications` (`email, id, type, refId, createdAt, readAt`) — or notifications derived on read to save writes (see Open question 7).
- Admin actions: `saveAssignment`, `deleteAssignment`, `listAssignments`, `postStream`, `deleteStreamPost`, `getAssignmentStatus` (roster × submissions × `Attempts`), `remindMissing`.
- Student actions (ID token, own classes only): `getClassHub` (classes, stream, assignments with this student's status), `markNotificationsRead`. Folded into `getStudentProfile` where possible so the home makes one request.
- Grading view: "Late" tag and due date on submissions from an assignment.

### Tests

- Unit: status calculation (missing/late/turned in at the due-date boundary, time zones, accommodations extending due dates).
- E2E: teacher assigns → student sees it in Up next → opens without a code → submits late → teacher tracker shows Late.

## V5-03 — Remove Insights and Mastery

- Delete `js/views/admin/insights.js`, `js/views/admin/mastery.js`, `js/lib/mastery.js` (after moving `liveSummary` to `js/lib/live.js`), insights functions in `stats.js` and their unit tests.
- Remove nav entries, the Insights test tab (`TEST_TABS` / `TEST_SECTIONS` become builder + grading), the dashboard "Open Insights" link, the builder hint text, the `teacherTools` comment.
- Old bookmarks (`section=insights` / `mastery`) land on the test's grading tab / dashboard.
- Keep: grade by question, per-question stats in the grading view, the "How sure are you?" data in results and grading.

## V5-04 — Admin sidebar animation

- Expand ↔ collapse animates width (CSS grid `grid-template-columns` transition on the shell, ~220ms, `--ease-out`); content reflows smoothly instead of jumping.
- Labels fade + slide 4px with a short stagger on expand, fade out first on collapse; group headings collapse to a divider.
- Collapsed: tooltips on hover/focus; the active pill keeps sliding between items.
- Phone drawer: backdrop fades, drawer slides with slight overshoot-free spring, swipe-to-close.
- Section change: content cross-fades (View Transitions where supported).
- `prefers-reduced-motion` / the app's Reduce motion setting: instant, as today.
- E2E: collapse state persists; no layout overlap at 768 / 1199 / 1200px.

## V5-05 — Motion pass

- **Theme switch:** circular reveal from the theme button using the View Transitions API (`document.startViewTransition` + clip-path on `::view-transition-new(root)`); fallback is a 200ms color cross-fade of the tokens. No flash.
- **Accent change:** tokens tween over 200ms.
- Modals and sheets: scale/fade in and out (today they only appear).
- Toasts: slide + stack, swipe to dismiss.
- Runner: question-to-question slide, answer "saved" tick, flag pop, progress bar easing.
- Results: score count-up and ring draw; per-question rows stagger.
- Lists and cards: shared enter stagger (`stagger()` in `ui.js`), skeleton loaders instead of spinners for dashboard / library / grading.
- Buttons: press state, focus ring transition.
- One motion token file (durations/easings already in `base.css`): no ad-hoc timings. Every effect off under reduced motion.

## V5-06 — UI improvements

- **Appearance panel** (student Settings and admin Settings, same component):
  - Theme as a 3-way segmented control with a live mini-preview of each.
  - **Accent selector:** larger swatches with names, checkmark on the active one, a live preview card (button, link, pill, progress bar) in light and dark, and a **custom colour** picker that auto-fixes contrast (darkens/lightens until text on it is ≥4.5:1 and it is ≥3:1 on the page; shows the result).
  - Text size (S / M / L), density (comfortable / compact), reduce motion, dyslexia-friendly font option.
  - Saved to the profile (V5-02) so it follows the student.
- Consistent empty states (illustration + one action) across student and admin views.
- Command palette in admin (Ctrl/⌘ K): jump to a test, a student, a section.

## V5-07 — More question types

Each is a definition in `js/lib/qtypes/<type>.js` + a widget in `js/views/qtypes/<type>.js` + an editor, registered so the runner, every game mode, results, grading, export and PDF pick it up.

| Type | What the student does | Grading |
|---|---|---|
| `isotopemass` — Average atomic mass | Fill an isotope table (mass, % abundance) and compute the average; or find a missing abundance | Numeric with tolerance; partial per row |
| `ionbuilder` — Ion / atom builder | Set protons, neutrons, electrons (steppers) for a given symbol, or write the symbol + charge for given particles | Exact per field |
| `ionicformula` — Ionic compound builder | Drag cation and anion tiles (incl. polyatomic ions) until charges balance; outputs formula and name | Formula match; optional name |
| `bohr` — Bohr / shell model | Drop electrons into shells | Count per shell |
| `molbuild` — Molecule builder | Build a molecule from atoms (from the old game) | Formula + connectivity |
| `gaslaw` — Gas-law setup | Pick the law, place knowns, solve | Numeric + chosen law |
| `oxidation` — Oxidation numbers | Enter the oxidation number above each atom | Per atom |
| `heatcurve` — Heating/cooling curve | Label segments (phase, ΔH) on a curve | Per label |
| `solubility` — Solubility rules | Mark products as (s)/(aq) or pick the precipitate | Per item |

- Each type gets: algorithmic variable support where it makes sense (V4-09), an example in the demo test, unit tests for scoring, one e2e test.
- Priority order (fits the ions / atomic-mass practices teachers are making now): `ionicformula`, `ionbuilder`, `isotopemass`, then the rest.

## V5-08 — More big improvements (proposals)

Pick in Open question 5.

(Assignments and notifications moved into V5-10.)

1. **Teacher student view:** click a student in Classes → profile, all attempts, accommodations in one page.
2. **PWA / install + offline answering:** service worker caches the app; answers queue offline and sync.
3. **Performance:** split `runner.js` and `builder.js` further; lazy-load question-type widgets; Lighthouse ≥90 on landing and runner.
4. **Accessibility audit** (WCAG 2.1 AA) of every game mode and the new types.
5. **Practice sets:** teacher bundles bank questions into a practice that auto-reshuffles each attempt (no submission), ideal for game modes.

## V5-09 — Release

- Version 5.0.0: `js/version.js` (`SITE_VERSION`, `BACKEND_VERSION`), `package.json`, `Code.gs` `VERSION`, `changelog/5.0.0.md`, front of `changelog/index.json` (see `CLAUDE.md`).
- `DEPLOYMENT.md`: "Upgrading to v5" (new sheets created by `setup()`, redeploy the web app).
- `docs/ARCHITECTURE.md`: "V5 contracts" (attempt model, game definition, new actions and columns).
- `docs/guide.md`: game modes, student home, new types.

---

## Backend changes summary (`apps-script/Code.gs` → 5.0.0)

- New sheets: `Students`, `Attempts` (if Open question 3 = yes), `Assignments`, `Stream`, `Notifications` (V5-10).
- New actions: `getStudentProfile`, `saveStudentProfile`, `syncProgress`; admin `getStudentProfileAdmin` (by email, admin only); V5-10 `saveAssignment`, `deleteAssignment`, `listAssignments`, `postStream`, `deleteStreamPost`, `getAssignmentStatus`, `remindMissing`, `getClassHub`, `markNotificationsRead`.
- `getLeaderboard` / `submitGameScore`: accept the new mode ids; ignore removed game ids.
- No change to `submit`, grading or release.

## Running v5 across sessions

Same rules as v4 (`docs/v3/v4.0plan.md` → "Running v4 across sessions"): branch per session from a `v5` branch, unfinished work behind `FEATURES` flags, `npm run test:all` green before ending, progress in `docs/v5/v5-progress.md`.

| # | Session | Covers | Depends on |
|---|---|---|---|
| S01 | Clean-up | V5-03 remove Insights/Mastery; screenshot fixes (duplicates, empty card, version label) | — |
| S02 | Attempt model | Shared attempt store used by runner and games; runner mode switcher | S01 |
| S03 | Game modes I | Classic, Lightning, Survival, Flashcards, Mistake Review on the attempt + runner widgets | S02 |
| S04 | Game modes II | Tower, Boss, Match-Up rework, Quiz Show, Race, Bingo; remove the six independent games | S03 |
| S05 | Backend 5.0 | `Students` / `Attempts` sheets, profile + sync actions, tests | — |
| S06 | Student home | V5-02 layout, profile page, sync, offline fallback | S05, S02 |
| S07 | Class Hub | V5-10 assignments, stream, tracker, notifications (backend + teacher + student) | S06 |
| S08 | Motion + sidebar | V5-04, V5-05 | S01 |
| S09 | Appearance | V5-06 Appearance panel, accent selector, saved to profile | S06, S08 |
| S10 | Question types I | `ionicformula`, `ionbuilder`, `isotopemass` | S02 |
| S11 | Question types II | `bohr`, `molbuild`, `gaslaw`, `oxidation`, `heatcurve`, `solubility` | S10 |
| S12 | Big improvements | Chosen items from V5-08 | S06 |
| S13 | Hardening + release | a11y, performance, every flag on, docs, 5.0.0 | all |

S05 can run in parallel with S02–S04; S08 and S10 can run in parallel with anything after S01–S02.

## Open questions

1. **Game answers count toward the practice?** Recommended: yes — one shared attempt, submit from Study's review. Alternative: games stay practice-only and never touch the attempt.
2. **Right/wrong in games when the test hides answers until release?** Recommended: games show "Saved" only and score on completion/speed. Alternative: games always show correctness (teacher can turn game modes off for real tests).
3. **Server copy of in-progress answers (`Attempts` sheet)?** Gives cross-device "Continue", but adds writes to the sheet. Recommended: yes, throttled to one sync per 30s / on mode switch.
4. **Remove the six independent games outright,** or keep them in a separate "Arcade" section not tied to any test? Recommended: remove (matches the notes); their boards live on as question types.
5. **Which V5-08 items are in scope** for 5.0 vs later?
6. **Teacher view of student profiles:** OK to show XP/streaks to teachers, or grades only?
7. **Notifications stored or derived?** Recommended: derived on read from assignments/stream/releases, with only read state stored (fewer sheet writes).

## Known limits

- Sheets is the database: profile reads are a few hundred ms and quota-limited; the dashboard renders from local data first and updates when the server answers.
- A student who never signs in with Google (demo sign-in) gets a local-only profile.
