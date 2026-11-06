# Rules for every v5 delegation agent

You are one worker on ChemWorks v5. The orchestrator gave you one **agent ID** (e.g. `S03a`). Your brief is the
section with that ID in `docs/v5/delegations/<session>.md`. Do only that brief.

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
