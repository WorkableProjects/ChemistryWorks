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
- `js/version.js` `SITE_VERSION` (`4.0.0`) — kept equal to `package.json` `version` (unit test). Shown under the
  landing card; compared with the backend's `?action=ping` in S06.

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
  `feature('adminAccounts')`) when the backend is older than `SITE_VERSION`. Never shown to students; a failed ping shows nothing.
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
