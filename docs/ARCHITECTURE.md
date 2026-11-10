# ChemistryWorks — Architecture & Contracts

This is the source of truth for data shapes and module interfaces. Every module must conform to it.

## Stack

- Static site, **no build step**. Native ES modules (`<script type="module">`), plain CSS. Netlify publishes the repo root.
- KaTeX 0.16.11 + mhchem + auto-render from cdnjs (globals `katex`, `renderMathInElement`). Use `renderMath(root)` from `js/ui.js`; never call KaTeX directly from views.
- Google Identity Services for sign-in (`js/lib/auth.js`). Demo sign-in when no client ID is configured.
- Submissions: Google Apps Script Web App (primary) + Netlify Forms (backup). Apps Script also stores **published tests** and serves **results** to the admin Grading tab.
- Tests: Node's built-in runner (`node --test`), zero npm dependencies. E2E uses the pre-installed `playwright` package (`require('playwright')` / `import { chromium } from 'playwright'`).

## File map

```
index.html                 app shell + hidden Netlify form
netlify.toml               publish ".", /test -> index.html
css/base.css               tokens, shared components, landing         (Opus)
css/runner.css             student test runner + results               (T02)
css/admin.css              admin panel                                  (T03)
js/config.js               CONFIG (overridable via window.CHEMISTRYWORKS_CONFIG)
js/app.js                  router + ctx                                 (Opus)
js/ui.js                   h(), mount(), icon(), richText(), renderMath(), toast(), openModal(), formatDuration(), seededShuffle(), appHeader(), userBadge()
js/lib/storage.js          load/save/remove/keys (prefix "cw:")
js/lib/auth.js             getUser/signOut/onAuthChange/demoSignIn/renderGoogleButton
js/lib/tests.js            loadTest/loadCatalog/getDrafts/saveDraft/deleteDraft/normalizeCode
js/lib/schema.js           test schema: normalize/validate/templates     (T01)
js/lib/formula.js          chemical formula parsing/formatting           (T01)
js/lib/lewis.js            Lewis dot diagrams (one element)
js/lib/structure.js        full Lewis structures: validation, scoring, layout, formal charges
js/lib/blanks.js           fill-in-the-blank markers, per-blank matching, word bank
js/lib/hints.js            when to show "how to type charges / exponents" help (formatHelpFor)
js/lib/theme.js            light/dark/system theme + accent per role (student / admin)
js/views/lewis-view.js     dot-diagram widget + static diagram
js/views/structure-view.js Lewis-structure SVG widget + static diagram
js/lib/grading.js          auto-grading engine                           (T01)
js/lib/api.js              Apps Script client                            (T04)
js/lib/submit.js           payload + dual submission + outbox            (T04)
js/views/landing.js        sign-in + code entry                          (Opus)
js/views/runner.js         student test-taking                           (T02)
js/views/results.js        submission confirmation + score review        (T02)
js/views/admin.js          library, builder, grading, settings
apps-script/Code.gs        Apps Script backend                           (T04)
data/tests/*.json          bundled tests; index.json = catalog (ships empty)
test/fixtures/tests/       sample tests (CHEM101, ...) used only by the automated tests
scripts/serve.mjs          static dev server (exports listen(port) -> {server,url})
test/unit/*.test.mjs       unit tests (node --test)
test/e2e/*.test.mjs        browser tests (node --test + playwright)
```

## View contract

```js
// js/views/<name>.js
export function render(root, ctx, params) { /* build DOM in root */ return cleanupFn /* optional */; }

ctx = {
  config,                    // CONFIG from js/config.js
  user,                      // getter: { name, email, picture|null, provider: 'google'|'demo' } | null
  signOut(),                 // signs out and returns to landing
  navigate(view, params),    // 'landing' | 'runner' | 'results' | 'admin'
  openTest(code),            // async: load by code and open runner (student mode)
}
runner  params: { test /* normalized */, source: 'bundled'|'published'|'draft', preview?: boolean }
results params: { test, grade /* gradeTest() output */, payload /* buildPayload() output or null in preview */,
                  submission /* submitResults() output or null in preview */, preview?: boolean }
```

## Test JSON schema

```jsonc
{
  "code": "CHEM101",              // required, normalized to /^[A-Z0-9_-]{2,32}$/
  "title": "Foundations",         // required
  "description": "",              // default ""
  "timeLimitMinutes": 20,         // default null (untimed); positive number
  "shuffleQuestions": false,      // default false
  "shuffleOptions": false,        // default false (mcq/multi options only)
  "showResults": true,            // default true: student sees score after submitting
  "showCorrectAnswers": true,     // default true: student sees per-question review w/ correct answers + explanations
  "allowModeToggle": true,        // default true: student may switch focus/scroll layout
  "defaultMode": null,            // default null -> CONFIG.DEFAULT_MODE; else 'focus'|'scroll'
  "passingPercent": null,         // default null; number 0-100 shows Pass/Not yet badge
  "questions": [ /* Question[] , at least 1, unique ids */ ]
}
```

Common question fields: `id` (required, unique, /^[A-Za-z0-9_-]+$/), `type`, `text` (required, may contain KaTeX `$...$`, `$\ce{...}$`), `points` (default 1, > 0), `explanation` (default "").

| type | extra fields | `correctAnswer` | student answer shape |
|---|---|---|---|
| `mcq` | `options: [{id,text}]` (≥2, unique ids) | option id (string) | option id (string) |
| `multi` | `options`, `partialCredit` (default false) | array of option ids (≥1) | array of option ids |
| `numeric` | `tolerance` (default 0, ≥0), `toleranceType` `'absolute'|'percent'` (default absolute), `unit` (default "") | number | raw input string |
| `formula` | `caseSensitive` (default true) | string, or array of accepted strings | raw input string |
| `truefalse` | — | boolean | boolean |
| `matching` | `left: [{id,text}]` (≥2), `right: [{id,text}]` (≥2, may include distractors, reusable), `partialCredit` (default true) | `{ leftId: rightId }` covering every left id | `{ leftId: rightId }` (partial allowed) |
| `ordering` | `items: [{id,text}]` (≥2), `partialCredit` (default true), `topLabel`, `bottomLabel` | array of every item id in order | array of item ids |
| `fillblank` | `blanks: [{id, answers: [..], kind: 'text'|'number'|'formula', tolerance?, toleranceType?, unit?}]`, text contains `{{id}}` once per blank, `partialCredit` (default true), `caseSensitive` (default false, text blanks), `wordBank` (default false), `distractors` | — (answers live in `blanks`) | `{ blankId: string }` |
| `lewis` | `element`, `checkPlacement` (default true) | valence electrons 1–8 | `[top, right, bottom, left]` dots |
| `structure` | `atoms: [{id, symbol, x?, y?}]`, `bonds: [[idA, idB]]`, `charge` (default 0), `partialCredit` (default false), `showElectronCount` (default false) | `{ bonds: [order per bond], lonePairs: {atomId: n} }` or an array of them (resonance) | same shape |
| `short` | `sampleAnswer` (default "", model answer / rubric for the teacher) | — (teacher graded) | free text |
| `open` | `rubric: [{text, points}]` (sum must equal `points`), `minWords`, `maxWords`, `showRubric` (default true), `sampleAnswer` | — (teacher graded) | free text |

`formula`, `numeric` and `fillblank` also take `formatHelp`: `'auto'` (default) | `'always'` | `'never'`. `formatHelpFor(q)` (js/lib/hints.js) returns `{ charges, exponents }`; the runner shows a "How to type charges" / "How to type powers of ten" box plus insert buttons when true. Auto = an accepted formula has a charge or the text mentions ions; a numeric answer is ≥ 10⁴ or < 10⁻³ or the text mentions scientific notation.

Answers map: `answers = { [questionId]: answer }`. Unanswered = key missing, `null`, `""` (after trim), `[]`, or `{}`.

### Scoring rules

- `mcq`, `truefalse`: exact match → full points.
- `multi`: exact set match → full points. With `partialCredit`: `max(0, (correctSelected − wrongSelected) / correctCount) × points`.
- `numeric`: parse input with `parseNumber` (accepts `18.02`, `-3`, `1,204.5`, `6.02e23`, `6.02E+23`, `6.02x10^23`, `6.02 × 10^23`, `6.02*10^23`, `6.02×10²³`, unicode minus `−`; a trailing unit equal to the question's `unit` — case-insensitive, whitespace-insensitive — is ignored). Correct when `|x − key| ≤ tolerance` (absolute) or `|x − key| ≤ |key| × tolerance / 100` (percent). Also add a relative epsilon of 1e-9·|key| for float noise.
- `formula`: correct when `normalizeFormula(input)` equals `normalizeFormula(any accepted)`; case-insensitive comparison only if `caseSensitive: false`.
- `matching`: without partial credit: all pairs correct → full points. With `partialCredit` (default): `correctPairs / leftCount × points`.
- `ordering`: `correctPositions / itemCount × points` (all-or-nothing when `partialCredit: false`).
- `fillblank`: each blank matches when the input equals any accepted answer: text = trimmed, whitespace-collapsed, trailing `.!?` ignored, case-insensitive unless `caseSensitive`; number = `parseNumber` + tolerance; formula = `formulasEqual`. Score `correctBlanks / blankCount × points` with partial credit. `gradeTest` reports `questionText` with blanks as `____(1)`.
- `structure`: answer normalized (missing = 0). Correct when every bond order and every atom's lone-pair count equals one accepted structure. With `partialCredit`: best `(matching bonds + matching atoms) / (bondCount + atomCount)`. Validation checks the key uses exactly the valence electrons (Σ valence − charge) for main-group atoms.
- `open`: like `short` (needs grading); results carry `rubric` so the Grading tab can show checkboxes that sum into the points box.
- `short`: never auto-graded. An answered short question scores 0 with `needsGrading: true` until a teacher grades it in the admin **Grading** tab; `gradeTest` also returns `pendingCount` / `pendingPoints`. The Sheet row gets `Status = Needs grading`; saving a grade (`saveGrade`, admin key required) stores per-question points in `Grades (JSON)` and the recomputed `Final Score` / `Final Percentage (%)`, with `Status = Graded`. Teachers may also override auto-graded points.
- `pointsEarned` rounded to 2 decimals. `isCorrect` is true only for full points. `percentage = (scoreAchieved / scoreTotal × 100).toFixed(2)` (string), `"0.00"` when total is 0.

## Module interfaces

### js/lib/formula.js (T01)
```js
export function normalizeFormula(str): string
//  - trims, removes all whitespace
//  - unicode subscripts ₀-₉ -> 0-9, superscripts ⁰-⁹⁺⁻ -> ^digits+/-  (e.g. "SO₄²⁻" -> "SO4^2-")
//  - hydrate dots "·", "•", "∙", "*" -> "."
//  - charge forms normalized to "^<n><sign>": "SO4^2-", "SO4{2-}", "SO4^-2" -> "SO4^2-"; "Na+" / "Na^+" / "Na^1+" -> "Na^+"
//  - unicode minus "−" -> "-"
//  - "->" arrows untouched
export function formulaToHTML(str): string
//  Safe HTML (all text escaped). Digits directly after a letter, ")" or "]" become <sub>;
//  a leading coefficient (start of string, or after ".", "+", space or "·") stays normal;
//  charges ("^2-", "^+", trailing "+"/"-" right after an element/subscript at end of a species) become <sup>, using "−" for minus.
//  "H2O" -> "H<sub>2</sub>O"; "CuSO4.5H2O" -> "CuSO<sub>4</sub>·5H<sub>2</sub>O"; "SO4^2-" -> "SO<sub>4</sub><sup>2−</sup>"; "Ca(OH)2" -> "Ca(OH)<sub>2</sub>"
export function formulaToLatex(str): string      // "\\ce{H2O}"  (escapes braces/backslashes)
export function formulasEqual(a, b, { caseSensitive = true } = {}): boolean
```

### js/lib/grading.js (T01)
```js
export function parseNumber(str, { unit = '' } = {}): number   // NaN when unparseable
export function isAnswered(question, answer): boolean
export function gradeQuestion(question, answer): {
  answered: boolean, isCorrect: boolean, pointsEarned: number, pointsPossible: number, partial: boolean // partial = 0 < earned < possible
}
export function gradeTest(test, answers): {
  scoreAchieved: number, scoreTotal: number, percentage: string, // "85.71"
  correctCount: number, answeredCount: number, questionCount: number,
  results: Array<{
    questionId, questionText, type,
    givenAnswer,            // raw answer (or null when unanswered)
    givenAnswerText,        // formatAnswer(q, given)
    correctAnswer,          // q.correctAnswer
    correctAnswerText,      // formatAnswer(q, q.correctAnswer)
    isCorrect, answered, pointsEarned, pointsPossible
  }>
}
export function formatAnswer(question, answer): string
//  mcq -> option text; multi -> option texts joined "; " in option order; truefalse -> "True"/"False";
//  numeric -> raw string (+ " " + unit when the raw string has no unit), or the number when given a number;
//  formula -> the string (first accepted when given an array: joined " / ");
//  matching -> "Sodium (Na) → +1; Magnesium (Mg) → +2" in left order (unmatched -> "—"); unanswered -> "—"
```

### js/lib/schema.js (T01)
```js
export const QUESTION_TYPES = ['mcq', 'multi', 'numeric', 'formula', 'truefalse', 'matching', 'ordering', 'fillblank', 'lewis', 'structure', 'short', 'open'];
export const MANUAL_TYPES = ['short', 'open'];      // teacher graded
export const TYPE_LABELS = { mcq: 'Multiple choice', ..., structure: 'Lewis structure (bonding)', open: 'Open response (teacher graded)' };
export function normalizeTest(raw): Test          // deep copy with defaults applied; never mutates input; code uppercased/trimmed
export function validateTest(test): { valid: boolean, errors: string[] }
//  error strings are human-readable and prefixed with a location, e.g. 'Question 3 (q3): correctAnswer must be a number.'
export function blankQuestion(type, id): Question  // valid template for the builder (e.g. mcq with 4 options, first correct)
export function nextQuestionId(questions): string  // 'q1', 'q2', ... first unused
export function blankTest(): Test                  // { code: '', title: '', ..., questions: [] }
```

### js/lib/api.js (T04) — Apps Script client
All requests to `gasUrl` use `Content-Type: text/plain;charset=utf-8` bodies (simple CORS request, no preflight).
```js
export async function pingBackend({ gasUrl, fetchImpl = fetch }): { ok, version?, error? }          // GET ?action=ping
export async function fetchPublishedTest(code, { gasUrl, fetchImpl = fetch }): Test | null          // GET ?action=getTest&code=CODE
export async function publishTest(test, { gasUrl, adminKey, fetchImpl = fetch }): { ok, error? }    // POST {action:'publishTest', adminKey, test}
export async function listPublishedTests({ gasUrl, adminKey, fetchImpl = fetch }): { ok, tests: [{code,title,updatedAt}], error? } // POST {action:'listTests', adminKey}
export async function deletePublishedTest(code, { gasUrl, adminKey, fetchImpl = fetch }): { ok, error? } // POST {action:'deleteTest', adminKey, code}
export async function fetchResults({ gasUrl, adminKey, testCode, fetchImpl = fetch }): { ok, rows: ResultRow[], error? } // POST {action:'getResults', adminKey, testCode?}
// ResultRow = { timestamp (ISO), submission_id, student_name, student_email, test_code, test_title,
//               score_achieved (number), score_total (number), percentage (number), duration_seconds (number),
//               responses (array, gradeTest().results), flags (object) }
// Never throws: network/parse failures -> { ok:false, error } (fetchPublishedTest -> null).
```

### js/lib/submit.js (T04)
```js
export function buildPayload({ test, grade, user, startedAt, submittedAt, flags }): Payload
// Payload = {
//   submission_id: string (unique, e.g. crypto.randomUUID()),
//   student_name, student_email, test_code, test_title,
//   score_achieved: number, score_total: number, percentage: string,
//   responses: grade.results,
//   started_at: ISO string, submitted_at: ISO string, duration_seconds: integer,
//   flags: { tab_switches: number, auto_submitted: boolean, mode: 'focus'|'scroll' }
// }
export function toNetlifyFields(payload): Record<string,string>
// keys exactly match the hidden form in index.html: form-name, submission_id, student_name, student_email, test_code,
// test_title, score_achieved, score_total, percentage, duration_seconds, responses_json, flags_json, submitted_at
export async function submitResults(payload, { config, fetchImpl = fetch, hostname = location.hostname }):
  { gas: 'sent'|'skipped'|'failed', netlify: 'sent'|'skipped'|'failed', queued: boolean }
// - GAS: skipped when !config.GAS_WEB_APP_URL; else POST mode:'no-cors', text/plain JSON body (opaque response = 'sent').
// - Netlify: skipped when !netlifyFormsEnabled(config, hostname); else POST "/" form-urlencoded; res.ok -> 'sent'.
// - Always appends payload to local results log (storage key 'localResults', newest last, cap 500).
// - If every non-skipped channel failed: push to storage 'outbox' and queued=true.
export async function flushOutbox({ config, fetchImpl = fetch, hostname }): number  // resend queued payloads; returns count sent
export function getOutbox(): Payload[]
export function getLocalResults(): Payload[]
```

### apps-script/Code.gs (T04)
- Sheets: `Submissions` and `Tests` (auto-created with bold header rows, header background `#E2E8F0`, frozen row 1).
- `Submissions` columns: Timestamp, Submission ID, Student Name, Student Email, Test Code, Test Title, Score Achieved, Total Score, Percentage (%), Duration (s), Tab Switches, Auto Submitted, Detailed Responses (JSON), Flags (JSON).
- `Tests` columns: Code, Title, Updated At, Test JSON.
- Script property `ADMIN_KEY` guards publishTest/listTests/deleteTest/getResults.
- `doGet(e)`: `action=ping` → `{result:'success', version}`; `action=getTest&code=` → `{result:'success', test}` or `{result:'error', error:'not_found'}`.
- `doPost(e)`: JSON body. `action` in publishTest/listTests/deleteTest/getResults → admin ops. No action → submission. Also accepts Netlify outgoing-webhook bodies (`{ data: { ...form fields } , ... }` with `responses_json`/`flags_json` strings). Submissions are de-duplicated by `submission_id` (dual-submit + webhook may deliver twice). Uses `LockService`.
- All responses: `ContentService` JSON `{ result: 'success'|'error', ... }`.

## Storage keys (prefix `cw:` added by storage.js)

| key | area | owner | shape |
|---|---|---|---|
| `user` | session | auth.js | User |
| `adminUnlocked` | session | app.js | boolean |
| `adminKey` | session | admin.js | string |
| `drafts` | local | tests.js | `{ [CODE]: Test & {updatedAt} }` |
| `progress:<email>:<CODE>` | local | runner.js | `{ answers, flagged: string[], index: number, startedAt: ms, tabSwitches: number, mode: 'focus'|'scroll', updatedAt: ms, title }` |
| `outbox` | local | submit.js | Payload[] |
| `localResults` | local | submit.js | Payload[] |
| `theme` | local | theme.js | `'system'|'light'|'dark'` |
| `accent:student`, `accent:admin` | local | theme.js | `'blue'|'violet'|'teal'|'green'|'orange'|'rose'` |

## Required `data-testid`s (E2E tests depend on these)

Landing (done): `signin-card`, `demo-name`, `demo-email`, `demo-signin`, `code-card`, `code-input`, `code-submit`, `code-error`, `user-badge`, `sign-out`, `admin-link`, `resume-list`, `resume-<CODE>`; admin gate: `admin-gate`, `admin-code-input`, `admin-unlock`. Shared: `toast`, `brand`.

Runner: `runner`; `progress-bar` (role=progressbar with `aria-valuenow` = answered count, `aria-valuemax` = total), `progress-text` ("3 of 7 answered"), `timer`, `question-card` (attr `data-question-id`, and class `is-active` on the current card in focus mode), within a card: `flag-btn` (aria-pressed), `clear-answer`, `option-<optionId>` (mcq/multi clickable card; `aria-checked`), `numeric-input`, `numeric-preview`, `formula-input`, `formula-preview`, `tf-true`, `tf-false`, `match-<leftId>-<rightId>` (radio input in the matrix), `charge-help`, `exponent-help`, `insert-<label>` (e.g. `insert-^`), `blank-<blankId>`, `ordering-item-<id>`, `ordering-up-<id>`, `ordering-down-<id>`, `ordering-keep`, `structure-bond-<i>`, `structure-atom-<atomId>`, `structure-count`, `open-input`, `open-rubric`, `lewis-<side>`, `short-input`; navigation: `prev-btn`, `next-btn`, `review-btn`, `mode-toggle`, `navigator-toggle`, `navigator`, `nav-item-<questionId>` (class `is-answered` / `is-flagged` / `is-current`), `submit-btn`, `submit-modal`, `confirm-submit`, `cancel-submit`, `unanswered-warning`, `preview-banner`, `exit-preview`, `shortcuts-modal`.

Results: `results`, `score-percentage` (e.g. "85.71%"), `score-points` (e.g. "10 / 12"), `score-correct` ("5 of 7 correct"), `completion-time`, `answered-count`, `submission-status` (attr `data-gas`, `data-netlify`, `data-queued`), `review-list`, `review-item-<questionId>` (attr `data-correct="true|false"`), `pass-badge`, `home-btn`, `retry-submit`, `results-hidden` (shown instead of score when `showResults` false).

Shared header: `theme-toggle`, `theme-menu`, `theme-system|light|dark`, `accent-<name>`.

Admin: `admin`, `tab-library`, `tab-builder`, `tab-grading`, `tab-settings`, `lock-admin`; library: `library-item-<CODE>`, `edit-<CODE>`, `preview-<CODE>`, `copy-link-<CODE>`; builder: `test-code`, `test-title`, `test-description`, `test-time-limit`, `add-question` (opens type menu) and `add-question-<type>`, `question-editor` (attr `data-index`), within editor: `q-id`, `q-text`, `q-points`, `q-delete`, `q-up`, `q-down`, `q-duplicate`, `option-text-<i>`, `option-correct-<i>`, `add-option`, `numeric-answer`, `numeric-tolerance`, `formula-answers`, `tf-answer`, `match-left-<i>`, `match-right-<i>`, `match-correct-<i>`, `format-help`, `format-help-note`, `order-item-<i>`, `add-order-item`, `blank-answers-<i>`, `blank-kind-<i>`, `add-blank`, `atom-id|symbol|x|y|lp-<i>`, `add-atom`, `bond-a|b|order-<i>`, `add-bond`, `structure-charge`, `structure-preview`, `structure-electrons`, `rubric-text-<i>`, `rubric-points-<i>`, `add-rubric`; `validation-errors` (attr `data-count`), `builder-mode-visual`, `builder-mode-json`, `json-textarea`, `apply-json`, `save-draft`, `preview-test`, `download-json`, `import-json`, `publish-test`, `new-test`; grading: `grading`, `grading-row`, `points-<qid>`, `rubric-<qid>-<i>`, `grade-total`, `save-grade`, `export-grades`; `sheet-link`; settings: `admin-key-input`, `save-admin-key`, `ping-backend`, `backend-status`, `setup-checklist`.

## Security notes

- Answer keys ship to the browser (client-side grading is part of the spec). Treat ChemistryWorks as a low/medium-stakes formative assessment tool. See DEPLOYMENT.md "Limitations".
- Never insert test content or student input via `innerHTML`. Use `h()` / `richText()` / `textContent`. `formulaToHTML()` output is the only HTML string allowed (it escapes input).

## Theming

- `css/base.css` defines every colour as a custom property on `:root`. Accent palettes: `:root[data-accent="blue|violet|teal|green|orange|rose"]`. Dark mode: `:root[data-theme="dark"]` (neutral tokens) plus `:root[data-theme="dark"][data-accent=…]` (lighter accent). Never hard-code colours in view CSS: use tokens (`--primary`, `--primary-soft`, `--primary-ink`, `--on-primary`, `--success-ink`, `--warning-line`, `--glass`, …).
- `js/lib/theme.js`: `applyRole('student'|'admin')` is called by `navigate()` in js/app.js (admin view and admin previews use the teacher accent). `themeControl()` in js/ui.js renders the header menu; `appHeader()` includes it automatically and the landing page shows it floating.
- index.html has a tiny inline script that applies the saved theme/accent before first paint.

## V2 contracts (docs/v2plan.md)

### Test JSON additions

```jsonc
{
  "sections": [ { "id": "sec1", "title": "Part A: Bonding", "instructions": "Show your work." } ],  // default []
  "references": [                                                                                     // default [] (V2-02, per test)
    { "id": "ref1", "type": "periodic-table", "title": "" },
    { "id": "ref2", "type": "text", "title": "Constants", "content": "$R = 8.314$ J/(mol·K)" },   // richText, KaTeX allowed
    { "id": "ref3", "type": "image", "title": "Solubility chart", "url": "https://…/chart.png", "alt": "Solubility rules table" }
  ],
  "questions": [ { "id": "q1", "section": "sec1", ... } ]   // question.section optional (absent = unsectioned)
}
```

- **Section order (V2-04)** — `js/lib/sections.js`: unsectioned questions first, then sections in `sections` order; inside a group questions keep their `questions` order. `normalizeTest()` stores `questions` in this canonical order, so array index == display order everywhere. `groupQuestions(test)` → `[{ section|null, questions, points }]`. Section point totals are **calculated** (`sectionPoints`), never stored. With `shuffleQuestions`, questions shuffle *within* their group only; groups never move. Results rows carry `sectionId` when the question has a section.
- **References (V2-02)**: `REFERENCE_TYPES = ['periodic-table','resources','text','image']`. `resources` = `{ id, type:'resources', title, items:[{ name, value, unit }] }` (legacy type `constants` is normalized to `resources`) — per-test values (value/unit are richText, e.g. `$6.02 \times 10^{23}$`); the builder pre-fills `DEFAULT_RESOURCES` and teachers edit them. The periodic table (`js/lib/elements.js`) reproduces the CST Chemistry Reference Sheet: printed 2-decimal masses, `(n)` for most-stable isotopes, 2012 names (Uut, Uup, Uus, Uuo), La/Ac in group 3; `referenceTitle(ref)`; `safeImageUrl(url)` (https or site-relative only). At most one periodic table. Image refs need `alt`.

### New question type: `orbital` (V2-05, teacher graded) — `js/lib/orbital.js`

| field | default | meaning |
|---|---|---|
| `maxSublevel` | `"2p"` | highest sublevel shown, in Aufbau order `AUFBAU = 1s 2s 2p 3s 3p 4s 3d 4p 5s 4d 5p 6s 4f 5d 6p 7s 5f 6d 7p` |
| `orbitalTypes` | `["s","p"]` | sublevel types included (subset of s, p, d, f) |
| `sampleAnswer` | `null` | optional reference answer for the teacher, same shape as the answer |

Shown sublevels = `sublevelsFor(q)` (lowest energy first). Answer: `{ "1s": ["ud"], "2s": ["ud"], "2p": ["u","u","u"] }`, one entry per orbital box, each `''` (empty) | `'u'` (↑) | `'d'` (↓) | `'ud'` (↑↓). Helpers: `normalizeOrbitalAnswer`, `isOrbitalAnswered`, `orbitalElectronCount`, `describeOrbital` (text form), `boxLabel(sub, i, box)` (aria text — spin is never shown by colour alone), `BOX_STATES = ['', 'u', 'ud', 'd']` (widget cycle order). Views: `js/views/orbital-view.js` exports `orbitalWidget(q, api)` (runner widget contract) and `orbitalDiagram(q, answer, { label })` (static). testids: `orbital-box-<sublevel>-<i>` (e.g. `orbital-box-2p-0`, attr `data-state`), `orbital-count`.

### Lewis structure brackets & charges (V2-06) — `js/lib/structure.js`

`structure` questions take `studentCharges: boolean` (default `false` = v1 behaviour, auto graded). When `true` the student also draws brackets, an overall bracket charge and per-atom formal charges, and the question is **teacher graded**. The answer (and the reference `correctAnswer`) then also has `bracket: boolean`, `charge: int −4..4`, `formalCharges: { atomId: int −4..4 }` (`normalizeChargeMarks`, `MAX_CHARGE`, `chargeLabel(n, { explicit })`). When `studentCharges` is true the skeleton's `charge` is NOT pre-drawn as brackets (the student draws them); it still sets the valence-electron total. testids in the widget: `structure-bracket` (toggle, aria-pressed), `structure-charge-up` / `structure-charge-down` / `structure-charge-value`, `structure-fc-<atomId>` (formal-charge control on an atom).

### Manual (teacher) grading

`isManualQuestion(q)` (schema.js) = `MANUAL_TYPES` (`short`, `open`, `orbital`) or a `structure` with `studentCharges`. Use it instead of `MANUAL_TYPES.includes(type)`. `gradeTest` result rows add `manual: boolean` (and `sectionId?`). Grading UIs must use `res.manual`, not the type.

### Partial credit (V2-03)

Scores stay numeric in `Grades (JSON)` `{ questionId: points }` — any number 0..max (2-decimal precision). Grader UI: Full / Half / Zero buttons + a number box; negative, above-max or non-numeric entries are **rejected with a message** (not silently clamped) and block saving. A grade on an auto-graded question that differs from its auto score is an *override* and is shown as such ("Override · auto 1.5"). The backend still clamps defensively.

### Comments & release (V2-07)

- Formatting (`js/lib/comments.js`): `**bold**`, `*italic*`/`_italic_`, `- ` / `1. ` lists, `[text](https://…)` and bare http(s) URLs; schemes https/http/mailto only. `parseComment(text)` → block tree; `commentBody(text)` (`js/views/comment-view.js`) renders it with textContent only, links `target=_blank rel="noopener noreferrer nofollow"`. `cleanComment`/`cleanComments` trim, cap at 2000 chars and drop empty comments. `commentToText` = plain text.
- Storage: Submissions columns 21 `Comments (JSON)` `{ questionId: text }`, 22 `Released At` (ISO, empty = not released) and 23 `Graded By` (free text; `saveGrade({ gradedBy })`, omitted = kept; rows add `graded_by`). Older sheets get the headers appended; empty cells = no comments / not released.
- `saveGrade({ …, comments?, release? })`: comments omitted → kept; `release: true` sets Released At (kept if already set), `false` clears it. Response `grade` adds `comments`, `released_at`. `fetchResults` rows (after `normalizeRow`) add `comments` (`{}` default) and `released_at` (`''`).
- Students: `fetchFeedback({ gasUrl, submissionId, studentEmail })` (backend `getFeedback`, no admin key; id + matching email required). Before release → `{ ok:true, released:false }` only. After → `{ ok:true, released:true, released_at, status, final_score, score_total, final_percentage, grades, comments }`. The private teacher note is never returned.

### Submission counts (V2-01)

`fetchSubmissionCounts({ gasUrl, adminKey })` → `{ ok, counts: { CODE: n } }` (admin key; backend `getSubmissionCounts`). Every Submissions row is a completed submission (in-progress answers only exist in the student's browser), so counts = rows per test code.

### Export (V2-08)

`js/lib/export.js` (pure): `exportFilename(row)` and `buildExportModel({ row, test, includeComments })`; `js/views/admin/export-view.js`: `printSubmission({ row, test, includeComments })` renders the document into `#print-root` and calls `window.print()` (`css/print.css`). Teacher comments are always included (release only controls what students see). Printing uses `@page { margin: 0 }` so browsers add no date/title/URL header or footer; repeating `thead`/`tfoot` spacers in `.print-frame` supply each page's top/bottom margin.

### CSS files (v2)

`css/references.css` (reference pane, periodic table), `css/diagrams.css` (orbital + structure charge widgets/diagrams), `css/grading.css` (grader additions), `css/feedback.css` (student feedback view, landing results list), `css/print.css` (export). Design tokens for the Lab notebook look are documented in `docs/DESIGN.md` (V2-09).

## V3 contracts (docs/v2.5/v3.0plan.md)

### Identity (V3-00)
- `js/lib/auth.js`: the Google user keeps `idToken` + `idTokenExp` (sessionStorage). `getIdToken()` returns it with > 60 s left,
  else `null` and asks GIS to re-issue silently (`prompt()`); `getFreshIdToken(timeoutMs)` waits for that refresh.
- `Code.gs verifyStudent_(body)`: tokeninfo check (`aud` = script property `GOOGLE_CLIENT_ID`, `email_verified`, `exp`, `iss`),
  optional `ALLOWED_DOMAINS`; verified tokens cached in `CacheService` (SHA-256 key, TTL ≤ 6 h). `ALLOW_UNVERIFIED_EMAIL=true`
  accepts `studentEmail` without a token (dev only). Errors: `unauthorized`, `identity_not_configured`.

### Backend actions (Code.gs 3.0.0)
| Action | Auth | Body | Reply |
|---|---|---|---|
| `getStudentStatus` | ID token | `{ testCode, idToken }` | `{ submitted, blocking, attempts, latest, others[], feedback? }` |
| `releaseAll` | admin key | `{ testCode }` | `{ released: n }` |
| `allowRetake` | admin key | `{ submissionId, allow }` | `{ retake_allowed_at }` |

`feedback` = `{ submission_id, test_code, test_title, student_name, student_email, submitted_at, released_at, status, final_score,
score_total, final_percentage, grades, comments, graded_by, responses }` for the latest **released** counted row. Never includes the
teacher note; `correctAnswer(Text)` stripped when the published test has `showCorrectAnswers: false`. `blocking` = a counted row
without `Retake Allowed At`.

Submissions column 24 `Retake Allowed At` (`COL.RETAKE`). Status `Extra attempt`: a submission to a single-submission test
(published `singleSubmission` or payload `single_submission: true`) when a blocking row already exists. Extra attempts are stored,
excluded from counts, from `getStudentStatus`, and from the default grading list.

### Client
- `js/lib/student-status.js` `checkSubmissionState(ctx, test)` → `{ source: 'server'|'local'|'none', submitted, blocking, attempts,
  latest, feedback, others }`. Server failure → local check (`hasLocalSubmission` = localResults or outbox). `preSubmitBlocked()`
  is the runner's pre-send re-check.
- `app.js openTest()`: shows `submission-status-check`, then routes: released → `feedback`; submitted and (single-submission
  blocking, or server-confirmed) → `submitted`; otherwise `mode-select` / `runner`.
- `feedback` view renders `exportDocument(buildExportModel(...))` and **Download PDF** (`printSubmission`).
- Test JSON: `singleSubmission: boolean` (default false); `games?: string[]` (limits the game picker).
- Payload / Netlify field: `single_submission`.

### data-testids (v3)
`submission-status-check`, `already-submitted`, `take-again`, `practice-game`, `feedback-download-pdf`, `test-single-submission-<CODE>`,
`release-all`, `confirm-release-all`, `allow-retake`, `retake-allowed`, `already-submitted-modal`, `reduce-motion`.

### Required questions (v3)
`requireAllQuestions` (test, default false) and `required` (question, optional). `isRequired(test, q)` in `js/lib/schema.js`.
The runner tags them (`required-pill`) and the submit modal lists unanswered required questions (`required-warning`) without a
**Submit test** button. A timer auto-submit is never blocked. Builder: `opt-requireAllQuestions`, `q-required`.

## V4 contracts (docs/v3/v4.0plan.md)

### Feature flags (V4-08, S01)
- `js/config.js` `CONFIG.FEATURES` = `{ adminShell, adminAccounts, teacherTools, studentTools }` (all `false`).
  Read with `feature(name)`. Turn on per page with `window.CHEMISTRYWORKS_CONFIG = { FEATURES: { name: true } }` or the
  URL `?features=name1,name2` / `?features=all`. Unknown names are always off. Half-done v4 features ship behind a flag.

### Site version (S01)
- `js/version.js` `SITE_VERSION` (`4.1.0`) — kept equal to `package.json` `version` (unit test). Shown under the
  landing card and in Settings → What's new. `BACKEND_VERSION` (`4.0.0`) is the lowest Code.gs the site needs.
- Release notes: `changelog/<version>.md` per version, listed newest first in `changelog/index.json`
  (`js/lib/changelog.js`, `js/views/changelog.js`). `test/unit/changelog.test.mjs` requires notes for `SITE_VERSION`.

### Module layout (S01)
- `js/views/runner.js` = the runner view; per-type answer widgets live in `js/views/runner/widgets.js`
  (`buildWidget(q, api)`); `runner.js` re-exports `formatInterpreted`, `optionImageEl`, `choiceImagesEl`.
- `js/views/admin/builder.js` = the builder view; built-in per-type editors live in `js/views/admin/editors/core.js`
  (`typeEditor(q, redraw, changed, uid)`).

### Brand + shell (S02/S03)
- Tokens and logo: see `docs/DESIGN.md`. `brandLogo('wordmark'|'mark', { mono })` and `brandMarkSvg()` in `js/ui.js`.
- `icon(name)` renders from one hidden SVG sprite (`#cw-icon-sprite`, symbols `#i-<name>`); `ICON_NAMES` lists them.
- `appHeader({ title, subtitle, right, onHome })`: navy bar + one Settings popover (testids unchanged: `brand`,
  `theme-toggle`, `theme-menu`, `theme-<pref>`, `accent-<name>`, `reduce-motion`).
- Accents: `navy` added and default for both roles (`DEFAULT_ACCENT`).
- CSS files: `results.css` (results + feedback cards, split from runner.css), `landing.css`, `status.css`
  (status pages + mode select), `export.css` (PDF screen header).

### Label the diagram (FIX-3)
- `js/views/widgets/hotspot-stage.js` `hotspotDiagram(q, points|null, { size, showTargets, marks, label })`: read-only
  picture + pins used by results, grading and export. `points = null` draws the answer key.

### Admin accounts + backend 4.0 base (V4-07 / V4-08, S06)
- **Version**: `Code.gs` `VERSION = '4.0.0'`; `?action=ping` -> `{ result, version }`. `js/lib/version-check.js`
  (`compareVersions`, `isBackendOutdated`, `checkBackendVersion`, `versionBanner`) shows an admin-only banner (behind
  `feature('adminAccounts')`) when the backend is older than `BACKEND_VERSION`. Never shown to students; a failed ping shows nothing.
- **Admin auth** `requireAdmin_(body)` guards every admin action. Request fields: `idToken` (Google ID token, verified like a
  student's: audience = `GOOGLE_CLIENT_ID`, Google issuer, not expired, `email_verified`, `ALLOWED_DOMAINS`), or the legacy
  `adminKey`. With `idToken` the verified lower-cased email must be on the `Admins` sheet; the key is NOT consulted as a fallback.
  Result: `{ ok, email, role, via: 'google' | 'key' }`. Key callers are `role: 'admin'` and count as owner for admin
  management only while the Admins sheet has no owner.
- **Error codes** (`{ result: 'error', error }`): `invalid_token`, `not_admin`, `identity_not_configured` (no `GOOGLE_CLIENT_ID`),
  `unauthorized` (bad/missing key), `admin_key_not_configured` (no key and no token), `owner_only`, `last_owner`,
  `cannot_remove_self`, `invalid_email`, `invalid_role`, `not_found`.
- **Sheets**: `Admins` = `Email | Role | Added by | Added at` (roles `owner` / `admin`; anything else reads as `admin`;
  emails trimmed + lower-cased, blanks and duplicates ignored; created and seeded from `ADMIN_EMAILS` (first = owner) when
  missing or empty). `Log` = `Time | Admin | Action | Target | Details`, one row per successful admin write
  (`publishTest`, `deleteTest`, `saveGrade`, `releaseAll`, `allowRetake`, `saveAdmin`, `removeAdmin`); Admin = the email, or `ADMIN_KEY`.
- **Actions** (admin, POST): `whoami` -> `{ email, role, via }`; `listAdmins` -> `{ admins: [{ email, role, added_by, added_at }] }`;
  `saveAdmin { email, role }` and `removeAdmin { email }` (owner only; refuse removing yourself and removing/demoting the last owner);
  `getLog { limit }` -> `{ rows: [{ time, admin, action, target, details }] }` newest first (default 100, max 500).
  `saveGrade` by a Google admin that sends no `gradedBy` records the admin's email. All existing actions keep their shapes with `adminKey`.
- **Client**: `js/lib/admin-session.js` (`adminKey()`, `hasAdminAuth()`, `adminRequestAuth()`, `setAdminConfirmed(email)`,
  `clearAdminConfirmed()`, `confirmedAdminEmail()`): a session flag `adminConfirmed` (the email `whoami` confirmed) counts only
  while it matches the signed-in Google user and a token exists. `js/lib/api.js` merges `adminRequestAuth()` into every admin POST
  (an explicit `adminKey` argument wins), retries once with `getFreshIdToken()` on `invalid_token`, and adds `whoAmI`,
  `listAdmins`, `saveAdmin`, `removeAdmin`, `getLog`. Admin gate (`js/app.js`, behind `adminAccounts`): signed-in Google user ->
  `whoAmI` -> panel with no prompt; otherwise Google button + "Use access code instead". UI: `js/views/admin/admins.js`
  (Settings -> Admins for owners, Settings -> Activity log).

### Question types III + algorithmic questions (V4-03 / V4-09, S10)
- **New registry types** (`js/lib/qtypes/<type>.js` + `js/views/qtypes/<type>.js`, styles in `css/qtypes-s10.css`):
  - `molarmass` `{ formula, answer?, tolerance (0.05), toleranceType, showWork }`; answer `{ value, work: [{ symbol, count, mass }] }`; only `value` is graded (parsed with an optional "g/mol"); the key is `answer` or the molar mass computed from `formula`.
  - `imagechoice` `{ multiple, options: [{ id, text?, image: { url, alt } }], correctAnswer: id | [ids], partialCredit }`; every option needs a picture (`safeImageUrl`) and alt text. Answer = id or array of ids.
  - `particles` `{ species: [{ id, label, shape: circle|square|triangle|diamond, tone: 1-6 }], zones: [{ id, label }] (default one zone `box`, max 4), targets: { zoneId: { speciesId: count } }, maxPerZone (24), partialCredit }`; answer = `[{ s, z, x, y }]` (x, y are fractions; only the counts per zone and species are graded; `correctAnswer` is the key laid out as particles).
  - `titration` `{ analyte: { type: acid|base, kind: strong|weak, conc, volumeMl, K? }, titrant: { conc }, ask: volume|ph|both, atVolume?, volumeTolerance (0.5 mL), phTolerance (0.2), maxVolume?, partialCredit }`; exact charge-balance simulation (`titrationPH(q, mL)`), answer `{ volume, ph }`.
  - `estimate` `{ min, max, step, answer, tolerance, toleranceType, unit }`; answer = number.
- **Chemistry functions** `js/lib/chemfuncs.js` (pure): `parseFormulaCounts`, `molarMass`, `molarMassBreakdown`, `moles`, `massFromMoles`, `convert(value, from, to)`, ideal gas (`idealGasP/V/N/T`), dilution (`dilutionC2/V2/V1`), `pH`, `pOH`, `hFromPH`, `pHStrongAcid/Base`, `pHWeakAcid/Base`, plus math (`sqrt`, `log`, `ln`, `exp`, `pow`, `round`, `min`, `max`). `CHEM_FUNCS` is the only set of functions a formula may call; `CHEM_CONSTANTS` = `pi`, `NA`, `R`, `Kw`.
- **Algorithmic questions** `js/lib/algorithmic.js` (registers the `algorithmic` instantiate step). A `numeric`, `sigfigs`, `dimensional` or `multipart` question may carry
  `variables: { name: { min, max, step?, sigFigs? } | { pick: [...] } | { formula, sigFigs? } }` and `answerFormula: "= m / molarMass(compound)"`.
  `{name}` in any text field is replaced by the drawn value; the formula sets `numeric.correctAnswer`, `sigfigs.answer` (rounded to `sigFigs`) or `dimensional.answer.value`
  (`answerSigFigs` rounds any type; dimensional `givenVariable: 'm'` sets `given.value`). Multipart: variables on the question, `answerFormula` (and optional extra `variables`) on each part.
  Each question draws from its own stream seeded by `seed + '#alg#' + id`, so the same email gets the same numbers on every device. The step stores `q.drawn = { name: value }`
  and skips questions that already have `drawn` (an instantiated copy is never redrawn, so regrading uses the stored key). A bad definition leaves the question untouched (logged).
  The formula language is a hand-written parser (numbers, "text", variables, constants, `+ - * / ^ ** × ÷ −`, parentheses, unary minus, whitelisted calls); no `eval` / `Function`.
  `validateVariables(q, where, errors)` (exported) dry-runs the definition; **hook for `schema.js validateQuestion`** (call it for every question, it is a no-op without algorithmic fields).
  Builder: `js/views/admin/variables-editor.js` (`variablesEditor(q, redraw, changed)`), mounted under the numeric and sigfigs editors in `editors/core.js`.
- **Backend**: `Submissions` column 25 `Seed` (`COL.SEED`) holds the student's instance seed. `handleSubmission_` reads `payload.instance.seed` (also `instance_json` / `instance_seed` form fields), text, max 200 characters; older sheets get the header appended by `getSheet_`.

### Backend 4.0.0 additions (S11–S17)
Sheets (created on first use): `Classes` (ID, Name, Period, Emails JSON, Updated By/At), `Bank` (ID, Question JSON, Tags JSON, Added/Edited By/At),
`Accommodations` (Email, Test Code or blank = all, Extra Time, Extra Attempts, Reduced Choices, Read Aloud, Extension Until, Notes, Updated By/At),
`Settings` (Key, Value: errorReports, releaseEmails), `Live` (one row per student per test, overwritten), `Leaderboard` (best score per student per game),
`Errors`. Submissions columns 26–29: `Drawn Questions`, `Time Limit Applied`, `Late`, `Class`; statuses `Closed (not counted)` and `Not on roster`.

Admin actions (via `requireAdmin_`, writes logged): `listClasses`, `saveClass {cls}`, `deleteClass {id}`, `listBank`, `saveBankItem {item:{id?,question,tags}}`,
`deleteBankItem {id}`, `getAccommodations {testCode?}`, `saveAccommodation {email,testCode?,extraTime,extraAttempts,reducedChoices,readAloud,extensionUntil,notes,merge?}`,
`deleteAccommodation`, `extendWindow {email,testCode,until}`, `applyRegrade {testCode, updates:[{submissionId,responses,scoreAchieved,scoreTotal,percentage}]}`,
`getLive {testCode?}`, `clearLeaderboard {testCode,gameId?}`, `hideLeaderboardEntry {testCode,email,hidden}`, `getErrors {limit}`, `getSettings`, `saveSettings {settings}`.

Public actions: `getTest` (GET refuses `not_open` / `closed`; POST with `idToken` applies the student's extension and the roster: `not_on_roster`),
`progressPing {idToken|studentEmail,testCode,answered,total,timeLeft,submitted}`, `submitGameScore {testCode,gameId|game,score,name|displayName}`,
`getLeaderboard {testCode,gameId|game}` (both only when `gameMode` and `gameOptions.leaderboard`; scores capped at 100,000), `reportError` (only when Settings
errorReports is on; ≤ 60/hour). `getStudentStatus` also returns `accommodations`, `window {state,…}`, `roster {required,ok}`, `extraAttemptsLeft`.
`submit` (no-cors) enforces roster + window, marks late work and applies the penalty; the client adds `idToken` at send time (never stored in the outbox)
and `instance {seed,drawn}` + `time_limit_applied`.

### Client (S10–S17)
- `js/lib/instantiate.js` pipeline: `algorithmic.js` (variables + safe formula parser, no eval) and `pools.js` (per-student draw) steps.
- `js/lib/schedule.js` (window / late / accommodations), `js/views/unavailable.js` (Opens on / Closed / Not on roster pages).
- `js/lib/importers.js` (plain text, CSV, Google Forms, rosters), `data/templates/*.json` (6 starter tests), `js/lib/regrade.js`, `js/lib/mastery.js`,
  `js/lib/backup.js` (bundle `kind: chemworks-backup`), `js/lib/errors.js` (scrubbed, rate-limited reports).
- Admin views: `classes.js`, `accommodations.js`, `bank.js`, `import.js`, `live.js`, `mastery.js`, `platform.js`, `test-extras.js` (builder panel);
  registered as classic tabs and as sidebar items (`registerNavItem`).
- Flags (`js/config.js`): `adminShell`, `teacherTools`, `studentTools`, `v4Types` on; `adminAccounts` off until Code.gs 4.0.0 + Admins sheet.

## V5 contracts (docs/v5/v5plan.md)

Written by W0. Later agents code against this; if you must change a contract, edit it here in the same commit.
Defaults used for the plan's open questions: shared attempt (1), "Saved" when answers are hidden (2), `Attempts` sheet on (3),
six independent games removed (4), notifications derived on read (7).

### Feature flags (W0)
`js/config.js` `FEATURES`, all `false`: `v5Attempt` (shared attempt + mode switcher), `v5Games` (game modes; needs `v5Attempt`),
`studentHome` (V5-02), `classHub` (V5-10; needs `studentHome`), `perfStore` (V5-11 client), `v5Motion` (V5-04/05),
`appearance` (V5-06), `v5Types` (V5-07). Flag off = behaviour as in 4.x. `teacherTools` stays until S01a removes its last reader.

### Attempt (`js/lib/attempt.js`, S02)
- **Storage key**: unchanged `progress:<email>:<CODE>` (via `storage.js`, local). Existing fields stay as-is:
  `answers {qid: value}`, `confidence {qid: 1-3}`, `hints [qid]`, `flagged [qid]`, `index` (position in test order), `startedAt` (ms),
  `tabSwitches`, `mode` (`'focus'|'scroll'`, the runner layout), `updatedAt` (ms), `title`, and with `studentTools`: `scratch`, `struck`, `flagNotes`.
  **Added** (all optional): `lastMode` (mode id, default `'study'`), `modeState { <modeId>: object }` (each mode's resume data, JSON, < 4 KB),
  `wrong [qid]` (answered wrong where correctness is shown; feeds Mistake Review), `v: 5`. Old records load unchanged.
- `openAttempt(test, { email, preview })` -> attempt:
  - `questions` instantiated (`instantiate.js`) in test order; `test`; `email`.
  - `get(id)`, `set(id, value)` (an empty/cleared value removes the answer; triggers autosave + `subscribe`), `isAnswered(id)`, `flag(id, on)` / `isFlagged(id)`.
  - `next({ filter })` -> next unanswered question after the current index (wraps; `filter(q)` optional) or `null`.
  - `answeredCount`, `total`.
  - `results()` -> `{ [qid]: { correct: true | false | null } }`. `null` = "Saved" (teacher-graded type, or correctness hidden).
  - `lastMode`, `setMode(id)` (saves immediately and notifies subscribers).
  - `subscribe(fn)` -> unsubscribe; `fn({ type: 'answer'|'flag'|'mode'|'reset', id? })`.
  - `save()`: autosave debounced 400 ms after a change; immediate on `setMode`, `pagehide` and `visibilitychange`; no save when `preview` or after submit.
  - `toSubmission()` -> the payload `submit.js` builds today (answers, flags, confidence, hints, timings); `mode: lastMode` goes in `game_mode`.
  - `destroy()` removes listeners.
- **Correctness is shown** (instant grading) only when `test.showResults !== false` AND `test.showCorrectAnswers !== false`
  AND the type is auto-graded. Otherwise `results()` gives `correct: null` and modes show "Saved" and score on completion/speed only.
  Teacher-graded types (`short`, `open`, `lewis` drawing, `orbital`, ...) are always `null`.

### Game mode definition (S03/S04)
- Files: `js/lib/modes/<id>.js` (pure logic) + `js/views/modes/<id>.js` (DOM). Registry `js/lib/modes/index.js`: `MODES`, `modeById(id)`,
  `modesForTest(test, attempt?)` -> `[{ mode, available, reason }]` in `order`. `study` is always first and always available.
- **Ids**: `study, classic, lightning, survival, flashcards, mistakes, tower, boss, matchup, quizshow, race, bingo`.
- **Definition**: `{ id, title, blurb, icon, order, pacing: 'self'|'timed'|'lives', scoring(attempt, events) -> { score, detail }, minQuestions?: number, available(test) -> { ok, reason? }, render(host, attempt, ctx) -> { destroy() } }`.
- `ctx = { widgetFor(q) -> HTMLElement (the runner widget, bound to attempt.set/get), feedback(q, result) -> HTMLElement, onEnd(summary), sound, reducedMotion }`.
  `summary = { modeId, score, answered, correct, total, durationMs }`; the shell then shows "Review & submit" (runner review page) or "Keep playing".
- A mode never adds, drops or swaps questions: it only orders/groups `attempt.questions`. Teacher-graded types: answered in place,
  "Saved — your teacher grades this", no points, no life lost. Timers pause/scale on long types (balance, graph, structure, ...).
- `gameOptions.games` (test JSON) lists allowed mode ids. Removed ids `elementhunt, periodicpuzzle, dailyelement, molbuilder, reactionlab, unitdash`
  and unknown ids are ignored; if nothing valid is left, **all** modes are offered (Decision 4 fallback). Nothing is renamed.
- Best scores: `gamebest:<email>:<CODE>:<modeId>` (as today). Leaderboard and `submitGameScore` use the mode id as `gameId`.
- Minimums: `matchup` >= 3 pairable questions (`mcq`, `numeric`, `naming`, `formula`, plus `matching` pairs); `quizshow` >= 6; `bingo` >= 9.
- The runner header mode switcher replaces the mode-select page (`mode-select.js` = first-visit chooser only). `ptable` questions use the periodic-table board widget in every mode.

### Data store (`js/lib/store.js`, S08a)
- `resource(name, { fetch, key, ttl })` -> `{ get({ force }), refresh(), patch(fn), optimistic(change, request), subscribe(fn), peek() }`.
  `get()` returns cached data at once (or awaits the first fetch); `refresh()` fetches in the background and notifies subscribers.
  `patch(fn)`: `fn(data)` returns the new data (local only, no network). `optimistic(change, request)`: apply `change` via patch, await `request()`;
  on failure roll back and `toast` an error with a Retry action (re-runs `request`); on success optionally patch with the returned row.
- One in-flight request per resource key (de-dupe); `sessionStorage` warm start under `cw:store:<name>[:<key>]`, `ttl` default 60 s; cleared on sign-out.
- Resources: `tests, counts, results, classes, bank, profile, hub`. A draft delete touches no network.

### Backend 5.0 (`apps-script/Code.gs`, B1-B3)
`VERSION = '5.0.0'` (set by B1); site `BACKEND_VERSION` is raised at release by S14c only. New sheets are created by `setup()` and on first use (`getSheet_`).
- **`Students`**: `email, name, picture, firstSeen, lastSeen, classIds, xp, level, streakDays, lastActiveDate, badgesJson, prefsJson, statsJson, updatedAt`.
  `prefsJson` also holds `notifReadAt` (ms) and `notifRead` (array of notification ids, max 200): the only notification state stored.
- **`Attempts`**: `email, code, mode, answeredCount, total, percentDone, updatedAt, answersJson` (one row per student per test, overwritten).
- **`Assignments`**: `id, classId, testCode, title, instructions, opensAt, dueAt, lateAllowed, required, modesJson, publishAt, createdBy, createdAt`.
- **`Stream`**: `id, classId, type ('post'|'assignment'|'reminder'), body, pinned, createdBy, createdAt`.
- No `Notifications` sheet: notifications are derived on read from assignments, submissions and reminders.
- **Auth**: student actions use `verifyStudent_(body)` (`idToken`; the token's email only). Admin actions use `requireAdmin_(body)`.
  Responses are `{ result: 'success', ... }` or `{ result: 'error', error }`.
- **New error codes**: `not_found`, `invalid_request`, `rate_limited`, `not_in_class`, `invalid_date`, `too_large` (plus the v4 `unauthorized`, `invalid_token`, `identity_not_configured`, `not_admin`).
- **Student actions** (POST):
  - `getStudentProfile {idToken}` -> `{ profile: {email,name,picture,firstSeen,lastSeen,classIds,xp,level,streakDays,lastActiveDate,badges[],prefs{},stats{}}, results: [{testCode,title,submittedAt,status,released,percentage?,scoreAchieved?,scoreTotal?}] (score fields only when released), attempts: [{code,mode,answeredCount,total,percentDone,updatedAt}], assigned: [{testCode,title,opensAt,closesAt,status}], hub: <getClassHub result> }`. Creates the Students row on first call.
  - `saveStudentProfile {idToken, prefs?:{theme,accent,avatar,textSize,density,reduceMotion,dyslexia}}` -> `{ profile }`. One write per 5 s per student (else `rate_limited`).
  - `syncProgress {idToken, attempt?:{code,mode,answeredCount,total,answers?}, xp?:{delta,badges?:[id],streakDays?,lastActiveDate?}}` -> `{ profile, attempt? }`.
    **XP merge**: `xp = serverXp + min(max(delta, 0), XP_DAY_CAP - gainedToday)`; never lowered; `XP_DAY_CAP = 600` per script-time-zone day; badges are a set union; level recomputed with the `xpForLevel` formula. `answers` stored only when `answersJson` < 40 KB.
  - `getClassHub {idToken}` -> `{ classes: [{id,name,period}], assignments: [{id,classId,testCode,title,instructions,opensAt,dueAt,lateAllowed,required,modes[],status}], stream: [{id,classId,type,body,pinned,createdAt,createdBy}], notifications: [{id,type,refId,title,createdAt,read}], reminders: [testCode] }`. Only this student's classes (match on `Classes.Emails`); assignments whose `publishAt` is in the future are left out.
  - `markNotificationsRead {idToken, ids?:[id], all?:true}` -> `{ readAt }`.
- **Admin actions** (POST, `requireAdmin_`, writes logged):
  - `getStudentProfileAdmin {email}` -> like `getStudentProfile` but without xp/level/badges, with last seen, streak, all submissions (scores included) and accommodations.
  - `listTests {summary:true}` -> `{ tests: [{code,title,updatedAt,status,questionCount,points,needsGrading,submissionCount}] }` (no `summary`: old shape). Replaces `getTest`xN + `getSubmissionCounts` + full `getResults` in the library.
  - `getResults {testCode?, status?, since?}` -> `{ rows, now }`; `since` = ms epoch returns only rows changed after it; pass `now` back next time.
  - `batch {requests:[{action,...}]}` (max 50) -> `{ results: [<each action's response>] }`; each request is authorised and logged on its own; one error does not stop the rest.
  - `saveAssignment {assignment}` (new when no `id`) -> `{ assignment }`; `deleteAssignment {id}`; `listAssignments {classId?}` -> `{ assignments }`.
  - `postStream {classId, body, type?, pinned?}` -> `{ post }`; `deleteStreamPost {id}`.
  - `getAssignmentStatus {id}` -> `{ assignment, rows: [{email,name,status,percentDone?,lastMode?,submittedAt?,late?,score?}] }`.
  - `remindMissing {id}` -> `{ reminded }` (adds a `reminder` stream post; those students see it in `getClassHub.reminders`).
- **Assignment status** (per student): `not_started`, `in_progress`, `turned_in`, `late`, `missing`, `graded`, `released`.
  Precedence: released > graded > late / turned_in > in_progress > missing > not_started.
  **Due rule**: compare in the script time zone (`appsscript.json` `timeZone`); `dueAt` is ISO text with offset; turned in at exactly `dueAt` is on time (`late` only after it).
  An accommodation `extensionUntil` or extra time moves that student's due time: `dueAt = max(dueAt, extensionUntil)`. Past `dueAt` with nothing turned in = `missing`
  (also when `lateAllowed`, until it is turned in, then `late`).
- **Cache** (`CacheService.getScriptCache`, 120 s): keys `tests:list`, `settings`, `classes:list`, `roster:<classId>`, `assignments:list`; cleared by `publishTest`, `deleteTest`, `saveClass`, `deleteClass`, `saveSettings`, `saveAssignment`, `deleteAssignment`. Student/profile data is never cached. Write actions return the changed row.
- `getLeaderboard` / `submitGameScore` accept the new mode ids and ignore removed ones. `submit`, grading and release are unchanged.

- **B3 notes**: Stream `body` of `assignment` / `reminder` posts is stored as JSON `{text, assignmentId, testCode, emails}`; API output has plain `body` text. `getClassHub` assignments also carry additive `canSubmit`, `effectiveDueAt`, `percentDone`, `lastMode`, `submittedAt`, `late`. Notification ids: `new:<assignmentId>`, `due:<assignmentId>`, `feedback:<assignmentId>`, `reminder:<postId>`; types `assignment|due_soon|feedback|reminder`. `postStream {id, pinned?, body?}` edits an existing post. Submissions gain columns `Assignment ID`, `Due At` (rows expose `late`, `assignmentId`, `dueAt`); a submission to an assignment past its due time is `late` when `lateAllowed`, else stored as `Closed (not counted)`.

### Client API (`js/lib/api.js`, append at the end)
One exported wrapper per action, each `async fn({ gasUrl, adminKey?, idToken?, fetchImpl, ...fields })`, **never throws**, resolves `{ ok: true, data } | { ok: false, error, unavailable? }`
(built on `adminCall` / `publicCall`): `getStudentProfile`, `saveStudentProfile`, `syncProgress`, `getStudentProfileAdmin`, `listTestsSummary`, `getResultsSince`, `batchCall`,
`saveAssignment`, `deleteAssignment`, `listAssignments`, `postStream`, `deleteStreamPost`, `getAssignmentStatus`, `remindMissing`, `getClassHub`, `markNotificationsRead`.
**Unset or old backend** (no `gasUrl`, or `unavailable: true`): callers keep working from localStorage and show the "Not synced" chip; nothing throws; retry only on next page show or mode switch.
Student calls add the signed-in user's `idToken` (`getFreshIdToken()`).

### Student home + profile (S06)
- Routes: `?view=home` (the student home; default after sign-in when `studentHome` is on), `?view=profile`, `?view=class&id=<classId>`. Flag off: today's landing.
- Local profile key: `profile:<email>` (local) = `{ prefs, xp, level, streakDays, lastActiveDate, badges, stats, notifReadAt, notifRead, syncedAt, dirty }`; `xp:<email>` stays the XP source (read both, write both).
- Sync chip (`data-testid="sync-chip"`, attr `data-state`): `synced` ("Synced"), `syncing` ("Syncing…"), `offline` ("Not synced"), `error` ("Sync failed, retrying").
  `syncProgress` is throttled to one per 30 s, plus on mode switch and `pagehide`.

### New question types (S11/S12)
Each = `js/lib/qtypes/<type>.js` + `js/views/qtypes/<type>.js` (+ editor), styles `css/qt-<type>.css`, import added to `v4-types.js` / `views/qtypes/index.js`, label in `TYPE_LABELS`.
`v5Types` hides them from the builder menu only; existing tests always render. Answer value and key:

| Type | Answer value | `correctAnswer` / key |
|---|---|---|
| `ionicformula` | `{ cation: id, anion: id, nCation: int, nAnion: int, name?: string }` | `{ formula: 'Al2O3', name?: 'aluminium oxide' }`; formula compared normalised; name only when `askName` |
| `ionbuilder` | `{ p, n, e }` (`mode: 'particles'`) or `{ symbol, charge }` (`mode: 'symbol'`) | same shape; exact per field |
| `isotopemass` | `{ rows: [{ mass, abundance }], result }` (or `{ missing }` when `ask: 'abundance'`) | `{ result }` or `{ missing }` + `tolerance`; partial per row |
| `bohr` | `{ shells: [int, ...] }` | `{ shells: [2,8,1] }`; per shell |
| `molbuild` | `{ atoms: [{id, el}], bonds: [{a, b, order}] }` | `{ formula, bonds? }`; formula + optional connectivity |
| `gaslaw` | `{ law: 'boyle'\|'charles'\|'gaylussac'\|'combined'\|'ideal', knowns: {sym: number}, result }` | `{ law, result }` + `tolerance` |
| `oxidation` | `{ [atomId]: int }` | same shape; per atom |
| `heatcurve` | `{ [segmentId]: { phase, dH? } }` | same shape; per label |
| `solubility` | `{ [productId]: 's'\|'aq' }` or `{ precipitate: productId }` | same shape; per item |

Partial credit follows the existing `partialCredit` flag. Demo: one question per type in `test/fixtures/v5/<type>.json` (a JSON array with one question, id `<type>-1`), assembled by S12z into `data/tests/DEMOV5.json`.

### Motion tokens (S09)
- Existing in `css/base.css`: `--dur-fast` 120ms, `--dur-base` 200ms, `--dur-slow` 320ms, `--dur`, `--ease`, `--ease-out`, `--ease-enter`, `--ease-spring`. S09 adds `--stagger-step: 40ms` and `--dur-theme: 400ms`. No ad-hoc timings in CSS or JS.
- Reduced motion: CSS uses the existing reduce-motion rules (OS media query plus the app switch); JS uses `prefersReducedMotion()` from `js/lib/theme.js` and nothing else.
- `ui.js` `stagger(listEl, { step = 40 } = {})` (exists): sets `animation-delay` on `.stagger-item` children (max 12 steps, 0 under reduced motion). `viewTransition(fn)` wraps View Transitions; `countUp(el, to, opts)` animates numbers.

### New `data-testid`s
- Runner / modes: `mode-switcher`, `mode-<modeId>`, `mode-host`, `mode-summary`, `mode-review-submit`, `mode-keep-playing`, `mode-saved-note`, `mode-score`.
- Student home: `home`, `home-header`, `home-code-input`, `home-code-submit`, `up-next`, `up-next-<assignmentId>`, `continue-btn`, `in-progress`, `in-progress-<CODE>`, `remove-attempt-<CODE>`, `results-list`, `practice-shelf`, `calendar-strip`, `notif-bell`, `notif-list`, `notif-<id>`, `sync-chip`, `profile`, `profile-stats`, `profile-badges`, `profile-history`.
- Class Hub, student: `class-page`, `class-stream`, `stream-post-<id>`, `class-assignments`. Teacher: `assign-btn`, `assignment-form`, `assign-due`, `assign-late`, `assign-save`, `assignment-<id>`, `tracker`, `tracker-row-<email>`, `tracker-filter-<status>`, `remind-missing`, `stream-input`, `stream-post-btn`, `stream-pin-<id>`, `copy-assignment-<id>`.
- Library / store: `library-skeleton`, `undo-toast`, `retry-btn` (existing `library-item-<CODE>` kept).
- Appearance: `appearance-panel`, `theme-seg-<pref>`, `accent-swatch-<name>`, `accent-custom`, `appearance-preview`, `text-size-<s|m|l>`, `density-<comfortable|compact>`, `dyslexia-toggle`.
- Teacher student view: `student-view`, `student-attempts`, `student-accommodations`.
- Question types: `<type>-widget` on every new widget root, parts as `<type>-<part>[-<id>]` (e.g. `ionicformula-cation-Na`, `ionbuilder-p`, `isotopemass-row-0`, `bohr-shell-1`, `oxidation-atom-<id>`, `heatcurve-seg-<id>`, `solubility-product-<id>`). Existing testids stay.
