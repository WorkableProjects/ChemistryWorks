# Rules for every v6 delegation agent

You are one worker on ChemWorks v6. The orchestrator gave you one **agent ID**, e.g. `S05`. Your brief is the section with that
ID in `docs/v6/delegations/<file>.md`. Do only that brief. **Don't launch sub-agents.**

## The v6 rule: tests are not optional
v5 shipped with tests skipped, and 5.0.0 didn't load for anyone. That doesn't happen again.

**Tests**
- `npm test` must pass before you report.
- Run every e2e file you added or touched (`node --test --test-concurrency=1 test/e2e/<file>.test.mjs`). They must pass.
- Never skip, delete, `.todo` or weaken a test to get green. Removing or rewriting tests is allowed only when your brief
  says so.
- A test that fails because the app changed on purpose gets updated to the new behaviour. Say which ones in your report.

**Changes to the app**
- Every user-visible change you make gets a test: unit for logic, e2e for a flow.
- If the app won't boot, fix that before anything else. After any change to `index.html`, `js/app.js` or an import list,
  run the boot smoke test: `node --test test/e2e/smoke.test.mjs`, written by S01a.

## Read first, and nothing else unless your brief needs it
1. Your brief.
2. `docs/v6/v6plan.md`: only the section your brief points to.
3. `docs/ARCHITECTURE.md` → **V6 contracts**, written by W0. Code against it. If you must change a contract, change it
   there in the same commit and say so in your report.
4. The files your brief names. Use Grep to find more. Don't read big files (`runner.js`, `builder.js`, `Code.gs`,
   `schema.js`) top to bottom; jump to the parts you need.

## Decisions (already made by the user; don't re-ask)
See `README.md` → Decisions.

## Work rules
- **Commits:** you run in your own git worktree. Commit there with a clear message. **Don't push, don't open a PR.**
- **Ownership:** stay inside the files your brief **owns**. Hotspot files (below) take small, additive edits only.
- **Code style:** ES modules, no build step, no frameworks. No new runtime npm dependencies. Dev dependencies only
  where a brief names them (`playwright`, `axe-core`).
- **Colours and motion:** tokens only from `css/base.css` (a unit test rejects raw hex). Every animation must be off under reduced motion.
- **Testids:** keep existing `data-testid`s unless your brief says to rename one. If you rename one, update every test.
- **Copy:** plain and short, for teachers and students. Sentence case, no exclamation marks, no emoji.
- **Design:** follow `docs/DESIGN.md` and the v5 design rules in `docs/archive/v5/delegations/00-common.md` → "Design
  rules". Every new or touched UI follows them.
- **Comments:** don't add session tags to code comments (`// v6 S05:`). Write what the code does; git has the history.
- **Hands off:** `js/version.js`, the `package.json` version, `changelog/`, `docs/v6/v6-progress.md` and
  `docs/v6/v6plan.md` belong to the orchestrator and S13b.
- **File names:** name new test files by area, not version: `test/unit/tags.test.mjs`, `test/e2e/class-hub.test.mjs`.

## Backend lane (`apps-script/Code.gs`)
- Only one agent edits `Code.gs` at a time. The order is fixed in README (B1 → B2 → B3 → B4, then S11's small `setup()` edits).
- Every new user-supplied cell goes through `text_()`.
- Every new action gets tests in the `vm` harness (`test/unit/apps-script.test.mjs` pattern; after S02a the backend
  tests live in `test/unit/backend-*.test.mjs`).
- Don't change `VERSION`; S13b does.

## Hotspot files (keep edits tiny and additive so merges are trivial)
- `js/config.js`
- `index.html`: stylesheet and script tags
- `js/lib/api.js`: new wrappers go at the end of the file
- `js/lib/qtypes/index.js` and `js/views/qtypes/index.js`: type imports (`v4-types.js` until S05 renames it)
- `js/lib/schema.js`: `TYPE_LABELS`
- `js/views/admin/shell.js`: `NAV_ITEMS`
- `docs/ARCHITECTURE.md`: only under your own `### <agent ID> …` heading inside V6 contracts
- `package.json`: `scripts` and `devDependencies` only

## Stop rules
- **Blocked:** if a contract or module from another agent isn't there, stop and report. Don't build a stand-in.
- **Too big:** if the work is far bigger than the brief implies, finish a working, tested subset and report what's left.
- **Bug outside your files:** if you find a real bug outside your files, don't fix it. List it under "Found".

## Report (your final message, ≤150 words)
```
ID: <agent ID>   Status: done | partial | blocked
Commits: <short sha> <subject>
Tests: npm test <pass>/<total>; e2e <file: pass/total, …>; smoke <pass/fail>
Updated tests (behaviour changed on purpose): none | <file: why>
Contract changes: none | <what>
Found (not fixed): none | <bullets>
Left: none | <bullets>
```
