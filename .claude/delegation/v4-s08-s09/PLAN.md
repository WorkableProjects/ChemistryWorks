# v4 S08 + S09 delegation plan

One Sonnet subagent per session, in parallel, same working tree.
- **T11 = S08** Question types I: `multipart`, `naming`, `dropdown` + per-question extras (confidence, hint that costs points, universal explanation).
- **T12 = S09** Question types II: `dimensional`, `nuclear`, `reaction`, `vsepr`, `datatable`.

Spec: `docs/v3/v4.0plan.md` **V4-03** (type table, per-question extras, acceptance criteria). Design rules: `docs/DESIGN.md`
(tokens only, no hex in CSS except base/print; ≥ 44px targets; light + dark; keyboard + screen reader; no drag-only).

## Contract already committed (Opus) — read these first
- `js/lib/qtypes/registry.js` — the definition shape (`registerType`): normalize / validate / blank / isAnswered / score /
  answerText / keyText / correctAnswer + `label`, `shortLabel`, `group`, `manual`; helpers `H` passed in.
- `js/views/qtypes/registry.js` — UI shape (`registerTypeUI`): widget(q, api) / editor(q, redraw, changed, uid) / review(q, answer, { key, size }).
- Stubs exist for all eight types: `js/lib/qtypes/<type>.js` and `js/views/qtypes/<type>.js` (both `export default null`).
  Replace each stub with the real module, which calls `registerType(def)` / `registerTypeUI(ui)` at import time.
  They are already imported by `js/lib/qtypes/v4-types.js` and `js/views/qtypes/index.js`, and every shared dispatch
  (schema normalize/validate/blank/isManual + type list + labels; grading isAnswered/score/answerText/keyText/correctAnswer;
  runner `buildWidget`; builder `typeEditor` + add-question picker groups/short labels; results, grading and export review
  visuals) already falls through to the registry. **You should not need to edit any shared file.**
- Reference implementations to match (v3 per-type split): `js/lib/qtypes/sigfigs.js`, `js/views/widgets/sigfigs.js`,
  `js/views/admin/editors/sigfigs.js`, `js/lib/qtypes/categorize.js`, `js/views/widgets/categorize.js`.
- Widget contract: see `js/views/runner/widgets.js` (`api.get(q.id)`, `api.set(q.id, value, { debounce })`, return
  `{ el, refresh(answer), focus() }`). Editor contract: see `js/views/admin/editors/core.js` (`changed()` after any edit,
  `redraw()` to rebuild the editor).
- Shared CSS for new widgets/editors: put rules in `css/qtypes.css`? NO — two agents. Use **your own new CSS file**
  (T11: `css/qtypes-s08.css`, T12: `css/qtypes-s09.css`, both already linked in index.html).

## Per type, each agent delivers
1. Pure definition with every function, unit tests (`test/unit/v4-qtypes-<type>.test.mjs`): normalize defaults,
   validation messages, scoring (full / partial / zero / malformed answers never throw), answer/key text.
2. Widget + editor + review visual (review optional when text is enough).
3. Sample questions in your own sample test `data/tests/<CODE>.json` (T11: `DEMOV4A`, T12: `DEMOV4B`), valid under
   `npm run validate:tests`. Opus adds both to `data/tests/index.json`.
4. Guide text: write the JSON example + one-paragraph teacher description for each type in your report under "Guide"
   (Opus merges into `docs/guide.md`; do not edit it).
5. One E2E file (`test/e2e/v4-qtypes-s08.test.mjs` / `-s09.test.mjs`) that, for each type: builds nothing, just serves your
   sample test (see `serveTest` / `adhocTest` in `test/e2e/helpers.mjs`), answers every question correctly and one
   incorrectly, submits, and checks the score + results text. Run ONLY your own E2E file
   (`node --test test/e2e/v4-qtypes-s08.test.mjs`), plus `npm test` and `npm run validate:tests`.

## Rules
- Stay in your owned files; never git checkout/stash/reset/commit; another agent edits other files concurrently.
- Same data-testids everywhere; new testids: `<type>-…` prefixes.
- If a shared file truly needs a change, do NOT edit it: describe the exact change in your report.
