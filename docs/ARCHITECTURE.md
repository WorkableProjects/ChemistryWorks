# ChemistryWorks — Architecture & Contracts

This is the source of truth for data shapes and module interfaces. Every module must conform to it.

## Stack

- Static site, **no build step**. Native ES modules (`<script type="module">`), plain CSS. GitHub Pages publishes the runtime files (`.github/workflows/pages.yml`; see `docs/hosting/github-pages.md`). `netlify.toml` is kept only for rollback.
- KaTeX 0.16.11 + mhchem + auto-render from cdnjs (globals `katex`, `renderMathInElement`). Use `renderMath(root)` from `js/ui.js`; never call KaTeX directly from views.
- Google Identity Services for sign-in (`js/lib/auth.js`). Demo sign-in when no client ID is configured.
- Submissions: Google Apps Script Web App (Netlify Forms backup is off on Pages: `NETLIFY_FORMS: false`). Apps Script also stores **published tests** and serves **results** to the admin Grading tab.
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

## V2 contracts

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

## V3 contracts (docs/archive/v3/v3plan.md)

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

## V4 contracts (docs/archive/v4/v4plan.md)

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

## V5 contracts (docs/archive/v5/v5plan.md)

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
Each = `js/lib/qtypes/<type>.js` + `js/views/qtypes/<type>.js` (+ editor), styles `css/qt-<type>.css`, import added to `js/lib/qtypes/index.js` / `views/qtypes/index.js`, label in `TYPE_LABELS`.
`v5Types` hides them from the builder menu only; existing tests always render. Answer value and key:

| Type | Answer value | `correctAnswer` / key |
|---|---|---|
| `ionicformula` | `{ cation: id, anion: id, nCation: int, nAnion: int, name?: string }` | `{ formula: 'Al2O3', name?: 'aluminium oxide' }`; formula compared normalised; name only when `askName` |
| `ionbuilder` | `{ p, n, e }` (`mode: 'particles'`) or `{ symbol, massNumber, charge }` (`mode: 'symbol'`) | same shape; exact per field (S11b: `massNumber` added to the symbol mode, per the brief) |
| `oxidation` | `[int \| null, ...]` (one per element symbol in the formula, in order) | `{ formula: 'H2SO4', key: [1, 6, -2] }`; per atom, fraction = atoms right / atoms |
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

### S06a profile data layer (`js/lib/profile.js`, `js/lib/sync.js`)
- `profile:<email>` also holds `xpMigrated` (one-time local XP sent as the first sync delta) and `server` (cached `getStudentProfile` result: profile, results, attempts, assigned, hub). `sync.js` keeps its queue in `syncq:<email>`.
- Profile shape for the home page is documented at the top of `js/lib/profile.js`. `openAttempt` attaches sync when `studentHome` is on (`attempt.unsync()` detaches).

## V6 contracts (docs/v6/v6plan.md)

Written by W0. Every v6 agent codes against this section. If you must change a contract, change it here in the same commit and say so in your report. Each agent adds notes only under its own `### <agent ID> …` heading at the end of this section.

Decisions that bind every contract below (see `docs/v6/delegations/README.md`): answer keys stay in the browser (no server-side grading, no key stripping, no `checkAnswer`); admin sign-in is Google only (no access code); `ADMIN_KEY` is only the backend's Sheet credential; tags stay local until a published test uses them; Classroom grades go as `draftGrade` until released; Classroom sync runs as the deploying account.

### TypeDef (all 42 types)

All 42 types (the 20 built-ins and the 22 registry types) use one contract. A type is three modules plus a fixture:

| Module | Path | Loaded | Holds |
|---|---|---|---|
| Definition | `js/lib/qtypes/<type>.js` | statically, by `js/lib/qtypes/index.js` (the renamed `v4-types.js`) | pure logic, no DOM, runs in Node |
| UI | `js/views/qtypes/<type>.js` | lazily, `loadTypeUI(type)` | `render`, optional `review` |
| Editor | `js/views/admin/editors/<type>.js` | lazily, `loadTypeEditor(type)` | `edit` |
| Fixture | `test/fixtures/types/<type>.json` | by tests only | answers for the conformance test |

Definitions stay small and synchronous, so `schema.js`, `grading.js`, export and the modes never wait on a type and never import UI code. A definition registers itself with `registerType(def)` when `qtypes/index.js` imports it. Registry API (`js/lib/qtypes/registry.js`): `registerType(def)`, `typeDef(type)` (now non-null for every one of the 42 types), `registeredTypes()`. After S06b no consumer has a `switch` on a type name; an unknown type is a validation error.

**Definition (`js/lib/qtypes/<type>.js`).** Every function is required unless marked optional.
```js
{
  type: 'mcq', label: 'Multiple choice', shortLabel: 'MCQ',
  group: 'Basics' | 'Match & sort' | 'Chemistry' | 'Diagrams & graphs',
  manual: false,                                  // true = teacher graded (short, open, orbital, ...)
  normalize(q, H),                                // mutate q in place: defaults, coercion, tags kept. q.type/id/points/text are already done
  validate(q, where, errors, H),                  // push strings `${where}: ...`; never throw
  blank(base) -> question,                        // builder "Add question" template; base = { id, type, text, points }
  isAnswered(q, answer) -> boolean,
  grade(q, answer, H) -> { fraction, full },      // fraction 0..1, full = fraction === 1. Manual types return { fraction: 0, full: false }
  format(q, answer) -> string,                    // the student's answer as text (results, CSV, grading list)
  keyText(q) -> string,                           // the correct answer as text
  correctAnswer(q) -> any,                        // stored as `correctAnswer` in graded results
  toPdf(q, answer, H) -> string[],                // optional; lines of text the PDF / print export prints for this response. Default: [format(q, answer)]
}
```
`score(q, answer, H)` in the 22 existing definitions is renamed `grade` (S05, one pass). `answerText` is renamed `format`. `H` is the helper bag the callers pass in, so type modules never import `schema.js` or `grading.js` (no import cycle): `{ normalizeQuestion, validateQuestion, gradeQuestion, isAnswered, formatAnswer, correctAnswerText, parseNumber }`.

**UI module (`js/views/qtypes/<type>.js`).** Default export:
```js
export default {
  type: 'mcq',
  render(widgetCtx) -> { el, refresh(answer), focus(), destroy?() },   // student widget
  review(q, answer, { key, size }) -> Node | null,                    // optional visual for results, grading, export
};
// widgetCtx = { q, api: { get(id), set(id, value, { debounce }) }, readOnly, uid }
```
`widgetCtx.api` is the same `api` the runner has always passed to `buildWidget(q, api)`. The answer value `render` writes with `api.set` is the answer value every definition function receives. Every widget root keeps `data-testid="<type>-widget"` and its existing part testids.

**Editor module (`js/views/admin/editors/<type>.js`).** Default export `{ type, edit(editorCtx) -> Node }`, `editorCtx = { q, redraw, changed, uid }` (the arguments `typeEditor(q, redraw, changed, uid)` always had).

**Loaders (`js/lib/qtypes/registry.js` for the map, called from the views):** `loadTypeUI(type) -> Promise<UIModule>` and `loadTypeEditor(type) -> Promise<EditorModule>`. Each is a static map of `type -> () => import(...)`, so the paths stay relative and statically analysable. Both cache the promise. `typeUI(type)` returns the module synchronously once loaded, else `null`. An unknown type rejects with `unknown_type:<type>`. The landing page loads no type UI.

**CSS per type:** `css/qt-<type>.css`, loaded by the type's UI module through `ensureCss('qt-<type>')`. Shared widget styles stay in `css/qtypes.css`.

**Answer fixtures (`test/fixtures/types/<type>.json`).** One file per type, 42 in total:
```json
{ "question": { "id": "mcq-1", "type": "mcq", "text": "...", "points": 2 },
  "correct": "<answer value>", "wrong": "<answer value>", "partial": "<answer value, optional>" }
```
- `question` is a raw question, as a teacher would write it.
- `correct`, `wrong` and `partial` are values the widget would produce through `api.set`.
- `partial` is present only when the type gives partial credit.
- The conformance test runs `normalize` on `question` first. Then it requires: `validate` returns no errors; `grade(correct).full`; `grade(wrong).fraction === 0`; `0 < grade(partial).fraction < 1`; `format`, `keyText` and `toPdf` return non-empty text for `correct`; the question renders in the runner and every mode, accepts the `correct` answer, and shows in results and the PDF view with no console error.
- For a `manual: true` type, `wrong` is a blank answer. The test then requires `isAnswered(correct)`, `!isAnswered(wrong)` and that `grade` is never `full`.
- `test/fixtures/v5/<type>.json` files are question arrays only. S02c moves them into this shape and deletes the folder.

### Kill switches

- `CONFIG.KILL_SWITCHES = Object.freeze({ classHub: false, gameModes: false, studentSync: false })` in `js/config.js`. All default `false`. It replaces `CONFIG.FEATURES`, `feature(name)` and the `?features=` URL handling, which are deleted.
- Override per page with `window.CHEMISTRYWORKS_CONFIG = { KILL_SWITCHES: { classHub: true } }`. Overrides merge over the defaults. There is no URL override.
- `killed(name, config = CONFIG) -> boolean`: true only when the value is exactly `true`. An unknown name is `false`.
- What a kill switch does:
  - `classHub`: hides class pages, assignments, the stream and notifications for students, and the Class Hub nav for teachers. Student home still works.
  - `gameModes`: the mode switcher is hidden and the runner stays in Study.
  - `studentSync`: `sync.js` never starts and no `syncProgress` call is made. Progress stays on the device.
- Wiring points (S08a): hub nav and the student class page, the mode switcher, `sync.js` start. Nothing else reads these.

### CSS loading

- `ensureCss(name) -> Promise<void>` in `js/lib/css-loader.js`. `name` is a file stem under `css/` (`'hub'` loads `css/hub.css`).
- The URL is built from `import.meta.url`, so it stays relative under the `/ChemistryWorks/` Pages path, and always ends in `?v=` + `SITE_VERSION`.
- It is idempotent: a stylesheet is added once (tracked with a `data-css` attribute) and later calls return the same promise.
- It never rejects: it resolves on load, on error, or after 3 seconds. A missing sheet must not block a view.
- `index.html` links only `css/base.css` and `css/landing.css` (plus fonts and KaTeX). Every other stylesheet is loaded by the view that owns it. Every CSS and JS URL in `index.html` carries `?v=` + `SITE_VERSION`; the boot script in `index.html` reads the version from `js/version.js`.
- Ownership (a view calls `ensureCss` for its own sheets before it renders):

| Owner | Stylesheets |
|---|---|
| Runner, modes, tools | `runner`, `modes`, `game`, `tools`, `references` |
| Results, submitted, feedback | `results`, `feedback`, `export`, `diagrams` |
| Student home, profile, status | `home`, `status` |
| Class page, notifications | `hub` |
| Appearance panel | `appearance` |
| Admin shell and every admin view | `admin-shell`, `admin`, `hub-admin`, `admin-student`, `grading` |
| Admin → Tags (S12a) | `tags` |
| Google Classroom UI (S12c) | `classroom` |
| Each question type | `qt-<type>` |
| Print | `print`, linked once with `media="print"` |

### Backend errors

- Reply shape for every error: `{ result: 'error', error: '<code>', ref?: '<shortId>' }`. `ref` is 6 lowercase base-36 characters, always present on `server_error`.
- `doGet` and `doPost` catch-alls log the full `String(err)` and stack to the `Errors` sheet (`Page` = `backend:<action>`, `Message` = `[<ref>] <message>`, `Detail` = stack) and reply `{ result: 'error', error: 'server_error', ref }`. The error text never reaches the client.
- `getTest` keeps its older shape for refusals, `{ error, opensAt?, closesAt?, title? }` with no `result` (the client's `fetchPublishedTestResult` depends on it). Clients check `error` first.
- Codes:

| Code | Meaning | Client treats as |
|---|---|---|
| `server_error` | Unexpected failure; has `ref` | retry (outbox) |
| `busy` | Lock or `tryLock` timed out; may carry `retryAfter` seconds | retry |
| `rate_limited` | Per-sender or global limit | retry later |
| `locked` | Too many bad `ADMIN_KEY` attempts this hour | final until the hour ends |
| `unknown_action`, `invalid_request`, `invalid_json`, `invalid_id`, `invalid_date`, `invalid_email`, `invalid_test`, `invalid_role`, `missing_*` | Bad input | final |
| `unauthorized` | No token and not allowed without one | sign in |
| `invalid_token` | Token invalid, expired or for another audience | refresh the token once, then sign in |
| `not_authorized` | Valid token, but the row belongs to someone else (feedback) | final |
| `not_admin`, `owner_only`, `last_owner`, `cannot_remove_self`, `admin_key_not_configured` | Admin rules | final |
| `not_found` | No such row | final |
| `not_open`, `closed` | Outside the test's window | final |
| `not_on_roster` | Roster-only test, student not listed | final |
| `single_submission` | Reserved: a second submission to a single-submission test. Today the backend stores the extra row as `Extra attempt` and replies success | final |
| `submission_too_large`, `test_too_large`, `too_large`, `comments_too_large`, `class_too_large`, `item_too_large` | Size limits | final |
| `leaderboard_off`, `error_reports_off` | Switched off in Settings | final |
| `unknown_tag` | Publish references a tag id that is neither in `tagDefs` nor on the Sheet; reply adds `ids: string[]` | fix and republish |
| `not_on_sheet` | `saveTag` or `mergeTags` on an id that is not a Sheet tag | final |
| `classroom_not_linked` | Class has no `classroomCourseId`, or the assignment has no `classroomCourseWorkId` | link first |
| `classroom_course_not_found` | The course id is not one of the deploying account's active courses | final |
| `classroom_not_teacher` | Classroom replied 403: the deploying account is not a teacher of the course | final |
| `classroom_not_our_coursework` | Classroom replied `ProjectPermissionDenied`: this project did not create the coursework | final |
| `classroom_rate_limited` | Classroom quota hit; reply may carry a `cursor` to resume | retry |
| `classroom_error` | Any other Classroom failure; adds `detail` (short text) | show, retry |

### Submit

- The client posts a student submission to `GAS_WEB_APP_URL` with `Content-Type: text/plain;charset=utf-8` (a simple request, so no preflight), a JSON string as the body, normal CORS (no `mode: 'no-cors'`), and reads the reply. The body is the existing payload plus `submission_id` and, at send time only, `idToken`. The token is never stored in the outbox.
- The backend treats `submission_id` as the idempotency key. A repeat replies `{ result: 'success', duplicate: true }`, so retrying is always safe.
- Outcome rules (`js/lib/submit.js`, 15 second timeout):

| Reply | Result |
|---|---|
| `{ result: 'success' }` (including `duplicate: true`) | Done. Remove from the outbox, keep in `localResults` |
| A final error: `closed`, `not_open`, `not_on_roster`, `single_submission`, `submission_too_large`, `invalid_request`, `invalid_email`, `missing_*`, `unauthorized` | Show the message. Do not queue |
| Network error, timeout, non-JSON reply, `server_error`, `busy`, `rate_limited`, `invalid_token` | Keep in the outbox with the same `submission_id`. Show "Not sent yet — we'll retry" with a Retry button |

- `invalid_token` retries after one silent token refresh; if there is still no valid token, the submission waits in the outbox until the student signs in.
- The outbox (`outbox` storage key, `Payload[]`) is flushed on page load, on `online`, on Retry and on a timer with backoff. The client never drops an outbox item; only a `success` or a final error removes it.
- There is no Netlify channel and no `NETLIFY_FORMS`.

### Identity

- `verifyStudent_(body)` validates `idToken` (Google `tokeninfo`, cached up to 6 hours) and returns `{ email, name }` from the token. A client-supplied email is never used when a token is present.
- Submissions: with a valid token, the stored `Student Email` and `Student Name` come from the token (if the token has no `name` claim, the body's name is kept as display text only, through `text_()`). The single-submission check and the roster check use the stored email.
- Without a token, the submission is accepted only when the script property `ALLOW_UNVERIFIED_EMAIL` is `true` (local and demo only). Otherwise the reply is `unauthorized`.
- A new `Identity` column on `Submissions` (added by `getSheet_`'s header migration) holds `verified` or `unverified`. Grading and results show an "Unverified" mark for `unverified` rows.
- `getTest` over GET returns `{ error: 'not_on_roster' }` for a `rosterOnly` test. Roster-only tests are served only through the POST path with a valid token.
- `getFeedback` requires a valid token, and the token's email must equal the row's email. Otherwise `unauthorized`, `invalid_token` or `not_authorized`.
- Every user-supplied cell goes through `text_()` (it prefixes `'` before a leading `=`, `+`, `-` or `@`). A backend test writes `=HYPERLINK("x")` to every string field of every action and asserts that no stored cell starts with one of those characters.
- `reportError` limits per sender (token email, else a client-supplied ID, hashed): 20 per hour, plus a global limit of 500 per hour.
- Client-trusted values (B1):
  - `streakDays` is computed on the server from activity dates; the client's value is ignored.
  - Badges are accepted only if the id is in `BADGE_IDS` in `Code.gs`, which must equal the ids in `BADGES` in `js/lib/xp.js` (a unit test compares the two lists).
  - `submitGameScore` caps the score at `min(100000, perQuestion[mode] * questionCount + flat[mode])`, where `questionCount` is the number of questions in the test. A score above the cap is clamped, not rejected. The ceilings come from the mode rules, bonuses included, and may be raised only together with a test:

| Mode | `perQuestion` | `flat` |
|---|---|---|
| `classic` | 1500 | 0 |
| `lightning` | 150 | 0 |
| `survival` | 100 × the test's highest question points + 50 | 0 |
| `boss` | 100 × the test's highest question points + 50 | 1000 |
| `tower`, `matchup`, `mistakes` | 100 | 0 |
| `bingo` | 100 | 2500 |
| `quizshow` | 500 | 0 |
| `race` | 150 | 0 |
| `study`, `flashcards` | 0 | 0 |

### Admin access

- An admin is a Google account whose email is on the `Admins` sheet (seeded from the `ADMIN_EMAILS` script property). Admin POSTs carry `idToken`; the backend checks the token, then the sheet. `whoami` returns `{ email, role, via }`. Roles are `owner` and `admin`.
- There is no access code. `ADMIN_ACCESS_CODE`, `accessCodeGate()`, the "Use access code instead" button and the `adminUnlocked` storage key are deleted.
- `ADMIN_KEY` (script property) is only the backend's credential for Sheet access: set-up and recovery, for example before the `Admins` sheet has an owner. It is sent as `adminKey` in the POST body, typed into admin → Settings → "Sheet key", kept in session storage (`adminKey`), and never required to open the admin panel. The backend compares it in constant time and, after 10 failures in an hour (counted in `CacheService`), replies `locked` until the hour ends.
- Demo admin sign-in exists only when Google is not configured: `demoAdminAllowed(config)` is true only when `config.GOOGLE_CLIENT_ID` is empty. It must be impossible when a client ID is set (unit test). Local dev and e2e set `GOOGLE_CLIENT_ID: ''` through `window.CHEMISTRYWORKS_CONFIG`. The demo admin only ever talks to mock backends.

### Tags (V6-09 B)

**Two homes.** A tag is local (browser storage, like a draft) until a published test uses it. Publishing writes it to the `Tags` sheet; from then on the Sheet is the source of truth. Only the owner edits a Sheet tag; any admin can use it. Local tags never call the backend.

**`Tags` sheet columns:** `id, ownerEmail, name, color, description, firstTestCode, createdAt, updatedAt, deletedAt, mergedInto`. Created lazily by `getSheet_`. Rows exist only for tags a published test has used. Deleting sets `deletedAt` (the row stays so old results keep the name). `name` (max 40 characters) and `description` (max 200) go through `text_()`.

**Fields**
- `id`: `tg_` + 6 lowercase base-36 characters (`/^tg_[0-9a-z]{6}$/`), made in the browser when the tag is created, and never changed.
- `color`: one of `blue | violet | teal | green | orange | rose | gray` (the accent names; no raw colour values). Each maps to a token when rendered, and text contrast is checked with `contrast.js`.

**Local store.** Storage key `tags:<email>` through `storage.js`, which adds the `cw:` prefix, so the localStorage key is `cw:tags:<email>`. Value: an array of
```js
{ id, name, color, description, onSheet, updatedAt }   // onSheet: false until a publish succeeds, then true
```
Same lifetime as drafts. `js/lib/backup.js` includes it. A tag with `onSheet: true` is edited through `saveTag`, not locally; its local record is a cached copy.

**Question field.** `q.tags: string[]` of ids only, never names. At most 10 per question, de-duplicated. `normalize` keeps it. `validate` warns about an id that is neither local nor on the Sheet and errors on more than 10. The importer accepts tag names (`"tags": ["Ions"]`) and maps them to ids: local tags first, then Sheet tags, then it offers to create local tags for the rest.

**`publishTest`** gains a field: `tagDefs: [{ id, name, color, description }]`, the definitions of every tag any question uses.
- In the same locked write, a new id becomes a Sheet row owned by the publisher (`firstTestCode` = the test code).
- An id already on the Sheet: the Sheet's name and colour win, unless the publisher owns the row, in which case the publisher's values are applied.
- If a question references an id that is in neither `tagDefs` nor the Sheet: `{ result: 'error', error: 'unknown_tag', ids: [...] }` and nothing is published.
- The success reply adds `tags: [{ id, ownerEmail, name, color, description, applied: 'created' | 'updated' | 'unchanged' | 'sheet_wins' }]`. The builder updates its local records from it and sets `onSheet: true`.
- Unpublishing or deleting a test never deletes a Sheet tag.

**Actions (admin POST, token required):**

| Action | Request | Reply |
|---|---|---|
| `listTags` | `{}` | `{ result: 'success', tags: [{ id, ownerEmail, ownerName, name, color, description, firstTestCode, createdAt, updatedAt, mergedInto, usage: { questions, tests } }] }`: non-deleted rows; `usage` is counted over published tests (cached, cleared on a publish or tag write). The picker's Shared list shows other owners' tags with `usage.tests > 0` |
| `saveTag` | `{ tag: { id, name?, color?, description? } }` | `{ result: 'success', tag }`. Owner only (`owner_only`). Edits an existing Sheet tag; it never creates one (`not_on_sheet`) |
| `deleteTag` | `{ id }` | `{ result: 'success', id }`. Owner only. Soft delete |
| `mergeTags` | `{ from, into }` | `{ result: 'success', into: tag, rewrittenTests, rewrittenQuestions }`. Owner of both, `from !== into`. In one locked pass it replaces `from` with `into` in the owner's published tests (de-duplicating) and sets `from.mergedInto = into` and `from.deletedAt`. Other owners' tests keep the old id; it resolves through `mergedInto` (chains are followed) |

**`tagIndex`.** `getTest` (GET and POST), `getTestFor_` and `getFeedback` replies include `tagIndex: { [id]: { name, color } }` for the ids the test's questions use, keyed by the id as stored in the test. A deleted tag keeps its name. A merged id resolves to the target's name and colour. An id that is not found is simply missing, and the client shows "Unknown tag". Students and the PDF export read names from `tagIndex`; admin views read the `tags` store resource (`listTags`). Raw ids are never shown.

**Client API (`js/lib/api.js`, appended):** `listTags`, `saveTag`, `deleteTag`, `mergeTags`. `js/lib/tags.js` offers `resolve(ids)` (local, then Sheet, following `mergedInto`) and `tagDefsFor(test)`.

### Google Classroom (V6-09 A)

**Who it runs as.** The script runs as the deploying account (`executeAs: USER_DEPLOYING`). Classroom calls use the Classroom advanced service (`Classroom`, v1) and work only for courses where that account is a teacher. Every reply below that touches Classroom includes `syncAccount`, the effective user's email, so the UI can say "Syncs as <email>". ChemistryWorks creates the Classroom assignment itself, because the API lets a project change grades only on coursework that project created.

**Scopes (`apps-script/appsscript.json`).** `dependencies.enabledAdvancedServices` lists `Classroom` v1. `oauthScopes` lists every scope the script already uses plus:
- `https://www.googleapis.com/auth/classroom.courses.readonly`
- `https://www.googleapis.com/auth/classroom.rosters.readonly`
- `https://www.googleapis.com/auth/classroom.profile.emails`
- `https://www.googleapis.com/auth/classroom.coursework.students`

No client-side Google scope changes; students never see a Classroom prompt. Re-running `setup()` asks the deployer to approve the new scopes once.

**Sheets**
- `ClassroomSync` (new): `assignmentId, email, courseWorkId, submissionId, sentGrade, sentAt, status, error`. One row per (`assignmentId`, `email`), upserted. `sentGrade` is the points last sent. `status` is `draft` (draft grade sent), `assigned` (assigned grade sent) or `failed`. `submissionId` is the Classroom student submission id.
- `Classes.classroomCourseId` (new column).
- `Classes.autoSyncClassroom` (new column, `true` or `false`; the class setting for auto-sync on release).
- `Assignments.classroomCourseWorkId` (new column).
- `getSheet_` adds missing columns as it does today.

**Actions (admin POST, token required):**

| Action | Request | Reply |
|---|---|---|
| `listClassroomCourses` | `{}` | `{ result, courses: [{ id, name, section, room, courseState }], syncAccount }`: `Courses.list({ teacherId: 'me', courseStates: ['ACTIVE'] })`, all pages |
| `linkClassroomCourse` | `{ classId, courseId }` (`courseId: ''` unlinks) | `{ result, classId, classroomCourseId, courseName, syncAccount }`; `classroom_course_not_found` if the course is not one of the account's courses |
| `importClassroomRoster` | `{ classId, mode: 'merge' \| 'replace' }` (default `merge`) | `{ result, added, total, skippedNoEmail }`: emails from `Courses.Students.list`, lower-cased, merged into the class roster (`Emails (JSON)`) |
| `saveAssignment` | the existing `assignment` plus `postToClassroom: boolean` | the existing reply, plus `assignment.classroomCourseWorkId`, `classroomState` (`DRAFT` or `PUBLISHED`), and `classroomError` (a code) when posting failed. The assignment is saved either way; saving again retries |
| `deleteAssignment` | `{ id, deleteInClassroom?: boolean }` | the existing reply plus `classroomDeleted: boolean`. Coursework is deleted in Classroom only when `deleteInClassroom` is `true` |
| `previewGradeSync` | `{ assignmentId }` | `{ result, courseWorkId, maxPoints, syncAccount, counts, rows: [{ email, name, points, possible, released, classroomDraft, classroomAssigned, lastSent, action }] }` |
| `syncGrades` | `{ assignmentId, overwrite?: boolean, emails?: string[], cursor?: string }` | `{ result, done, cursor, synced, failed, skipped, results: [{ email, status, error? }] }` |

`postToClassroom: true` creates coursework with the assignment's title, `description` = instructions + the test link (`?code=<CODE>`), `maxPoints` = the test's total points, the due date and time from `dueAt`, `workType: 'ASSIGNMENT'` and `materials: [{ link }]`. `state` is `DRAFT` when `publishAt` is in the future (the `publishDueClassroomWork_` trigger publishes it once `publishAt` has passed), otherwise `PUBLISHED`. If the assignment already has a `classroomCourseWorkId`, saving updates that coursework instead of creating another.

**Grade rules**
- The grade is `round(fraction × maxPoints, 2)`, where `fraction` is the student's final score (after teacher grading and regrades) over the test's points, taken from the submission ChemistryWorks counts for that student (an `Extra attempt` never counts).
- A student with no counted submission, or with teacher-graded questions still ungraded, is `skipped_not_graded`.
- Released submission (`Released At` set): send `assignedGrade` and `draftGrade`, both set to the grade. Graded but not released: send `draftGrade` only (only the teacher sees it in Classroom). A student already synced as `assigned` is never moved back to draft-only (that row is `same`).
- Students are matched by lower-cased email against Classroom `userProfiles.emailAddress`, restricted to the linked class's roster. A roster student who is not in the Classroom course is `skipped_not_on_roster`. Classroom students who are not on the class roster are ignored.
- `action` values: `new` (Classroom has no grade), `update` (our value or release state changed since the last sync and Classroom still holds what we sent), `same` (nothing to do), `skipped_not_on_roster`, `skipped_not_graded`, `skipped_teacher_changed`.
- **Overwrite guard:** compare Classroom's current value (the assigned grade when the target state is `assigned`, else the draft grade) with the last value we sent (`ClassroomSync.sentGrade`). If Classroom holds a grade we did not send (it differs from `sentGrade`, or there is no `ClassroomSync` row at all), the row is `skipped_teacher_changed`. Only `syncGrades` with `overwrite: true` writes those rows; without it they are reported as skipped and never written.
- `syncGrades` applies `StudentSubmissions.patch` with an `updateMask` (`draftGrade`, or `draftGrade,assignedGrade`), about 100 ms apart. It stops at about 25 seconds and returns `done: false` with an opaque `cursor`; the client calls again with it until `done`. Each student gets a `ClassroomSync` row and a `Log` row. The tracker shows "Synced <time>" from `sentAt`.
- Errors per student: `ProjectPermissionDenied` gives `classroom_not_our_coursework`; a 403 gives `classroom_not_teacher`; anything else gives `classroom_error`. A failure marks that student's row `failed` and the sync carries on with the next student.
- Auto-sync: when `Classes.autoSyncClassroom` is true, `releaseAll` and `saveGrade({ release: true })` sync the affected students on a best-effort basis. A failure never fails the release; it is recorded as `failed` and the tracker offers Retry.
- Without Classroom, the CSV export stays, reformatted so Classroom's "Import grades" accepts it.

**Client API (`js/lib/api.js`, appended by B4):** `listClassroomCourses`, `linkClassroomCourse`, `importClassroomRoster`, `previewGradeSync`, `syncGrades`. `saveAssignment` and `deleteAssignment` gain the new fields.

### Backend housekeeping

- **`setupTriggers()`** installs the time-driven triggers and is safe to run any number of times (it removes its own earlier triggers by handler name, then installs). It keeps one list of `{ handler, schedule }`. B2 installs `pruneSheets` daily (public, because Apps Script cannot trigger functions whose names end in `_`) (around 03:00 script time). B4 appends `publishDueClassroomWork_` to the same list. `setup()` calls `setupTriggers()`.
- **Retention settings** live in the `Settings` sheet (`Key`, `Value`), read through `readSettings_()` and written through `saveSettings`. Keys, with defaults: `retainLiveDays` 1, `retainLogDays` 180, `retainErrorsDays` 180, `archiveStreamDays` 300. Values are whole numbers from 1 to 3650; anything else is ignored. `Stream` posts older than `archiveStreamDays` move to `Stream_archive`. Pruning works in chunks and rewrites the range in one call; it never deletes row by row.
- **`diag`** (admin action, request `{}`) replies:
```js
{ result: 'success', version, generatedAt,
  sheets: [{ name, rows }],                                         // every tab
  timings: { listTests, getResults, getClassHub, syncProgress },    // ms, measured with a fake student
  lastPrune: { at, removed: { Live, Log, Errors }, archived } | null }
```
  Admin → Platform shows it.
- **`setup()`** returns `{ checklist: [{ key, ok, hint }] }` with keys `adminKey`, `googleClientId`, `adminOwner`, `triggers`, `classroomScopes` (S11). It sets default script properties and retention defaults only where they are missing.
- **Versions:** `VERSION` in `Code.gs` and `BACKEND_VERSION` stay at their current values until S13b sets 6.0.0.

### B1 Security and integrity (Code.gs)

- `verifyIdToken_` and `verifyStudent_` return `{ email, name }` (`name` is `''` when the token has none).
- `getFeedback` takes `idToken` (a body `studentEmail` is no longer read). The client (`api.js` `getFeedback`) must send the token.
- A repeat `submission_id` still replies `duplicate: true` before any identity check, so retries are safe.
- `submissionRow_` adds `identity`: `verified`, `unverified`, or `''` for rows written before 6.0.
- Server errors are logged with `Page` = `backend:<action>`, `Message` = `[<ref>] <text>`, `Detail` = stack.
- `reportError` accepts `idToken` or `clientId` to identify the sender. Without either, all reports share one sender bucket.
- `submitGameScore` for a mode not in the cap table uses 100 per question.
- `syncProgress` counts a streak day only when the sync carries XP above zero.

### B2 Performance and housekeeping (Code.gs)

- `getResults` leaves `responses` as `[]` unless the request has `includeAnswers: true`; the reply carries `answersIncluded`. Any client that grades or shows answers must ask for them.
- `getClassHub` takes identity from the verified token only. The hub inside `getStudentProfile` / `syncProgress` bundles is built by `buildHub_(email, now)`, which is never reachable from a request.
- `syncProgress` replies `{ result: 'error', error: 'busy', retryAfter: 30 }` when it cannot get the script lock within 1.5 s.
- Settings: `retainLiveDays`, `retainLogDays`, `retainErrorsDays`, `archiveStreamDays` are returned by `getSettings` and accepted by `saveSettings`. Pinned Stream posts are never archived.
- Submissions, live pings, error reports and log lines take no script lock. `withLock_` is re-entrant within one request.

### S03 Client security

- `submitResults` / `flushOutboxResult` (`js/lib/submit.js`) read the reply. `result.gas` is `sent`, `final` (adds `finalError`, never queued, not logged as submitted), `failed` (queued) or `skipped`. `flushOutboxResult` returns `{ sent, final: [{ submission_id, error }] }`; `flushOutbox` still returns the sent count.
- `fetchFeedback({ gasUrl, submissionId, idToken })` sends the ID token (a fresh one when none is passed) and no email. The feedback view shows a sign-in prompt without a token, and a separate message for `not_authorized`.
- `demoAdminAllowed(config)` (`js/lib/admin-session.js`) is true only when `GOOGLE_CLIENT_ID` is empty; `app.js` opens the admin panel directly in that case and otherwise runs the Google + `whoami` flow.
- `reportError` bodies carry `clientId` (random id in the `clientId` storage key) and, when signed in, `idToken`.
- Admin grading views show an "Unverified" pill (`js/views/admin/identity-mark.js`) for rows with `identity: unverified`; `normalizeRow` keeps `identity`.

### S05 Type registry I

- `js/lib/qtypes/registry.js` now also holds the UI and editor maps: `loadTypeUI(type)`, `loadTypeEditor(type)`, `typeUI(type)`, `typeEditorModule(type)`, `hasTypeUI(type)`, `registerTypeUI(def)` (older UI modules) and `preloadQuestionTypes(questions)`. `js/views/qtypes/registry.js` re-exports them.
- `preloadQuestionTypes(questions)` returns `null` when every type the questions use (multipart parts included) is loaded, else a promise that never rejects. `navigate()` in `js/app.js` waits for it before it renders a view that has `params.test`, and the Builder preview calls it. `buildWidget` and `typeEditor` still work if a module has not arrived: they return a placeholder that fills itself in.
- Types not yet moved (the 22 registry types, and the built-ins S06a and S06b move) keep the old UI shape `{ type, widget, editor, review }`, registered by `views/qtypes/index.js`. `loadTypeUI` and `loadTypeEditor` cover them too; `typeEditorModule` wraps their `editor` as `edit(editorCtx)`.
- Moved so far: mcq, multi, truefalse, numeric, formula. `mcq` and `multi` share `js/views/qtypes/choice.js` and `js/views/admin/editors/choice.js`. Shared pieces: `js/lib/qtypes/shared.js` (`normOptions`, `validateList`, `optionText`, `DASH`, small type guards), `js/views/qtypes/shared.js` (option pictures, typing-help box, insert bar, `formatInterpreted`) and `js/views/admin/editors/shared.js` (ids, `parseSci`, `withVariables`, `optionImageControl`, `formatHelpField`).
- `pdfLines(q, answer)` in `js/lib/grading.js` returns the type's `toPdf` lines, else `[formatAnswer(q, answer)]`.
- `manual: false` is now set on every definition, as the contract says.
- `ensureCss` does not exist yet (S08). Until it does, `css/qt-truefalse.css` and `css/qt-formula.css` are linked from `index.html`. Other rules for moved types (`.opt`, `.q-preview`, `.q-unit`, `.q-formula-preview`) are shared with imagechoice, sigfigs, graph, naming and reaction, so they stay in `runner.css`.

### B3 Tags backend (Code.gs)

- The `Tests` sheet gains a fifth column, `Owner` (lower-cased email of the first admin to publish the test; empty for tests published with the admin key and for older tests). `mergeTags` rewrites only tests whose `Owner` equals the caller's email.
- An `ADMIN_KEY` caller has no email, so it owns Tag rows and tests whose owner is empty.
- `listTags` sets `ownerName` to the part of `ownerEmail` before the `@`. `usage` is counted against the live end of any `mergedInto` chain.
- `publishTest` upserts only the tags that questions use. Unknown ids are checked before anything is written. Tag actions are not in the `batch` allow-list.
- `getFeedback` replies (released or not) carry `tagIndex` for the test the submission belongs to.
- `api.js` `publishTest` still sends no `tagDefs` and drops the reply's `tags` and `ids`; the builder wiring (S12a) must extend it.
### S06a Type registry II

- Moved to the TypeDef contract: matching, ordering, fillblank, categorize, balance, econfig, ptable, sigfigs, hotspot. Definitions live in `js/lib/qtypes/<type>.js` (the existing helper modules now also register their type; `matching`, `ordering`, `fillblank` and `ptable` are new files). UI modules are `js/views/qtypes/<type>.js` (the old `js/views/widgets/<type>.js` files moved there); editors are `js/views/admin/editors/<type>.js` (default export `{ type, edit }`). Each is in the `UI_LOADERS` and `EDITOR_LOADERS` maps.
- None of the nine has a `review` function. Results, export and grading draw hotspot answers through `js/views/widgets/hotspot-stage.js` (`hotspotDiagram`), which stays where it is and is imported statically.
- The four switches (`isAnswered`/`score`/`formatAnswer`/`formatCorrect` in `grading.js`, normalize/validate/blank in `schema.js`, `buildWidget`, `typeEditor`) no longer name these types. `fillblank` supplies `displayText`, which `displayQuestionText` uses. `correctAnswer(q)` on each definition replaces the per-type branch in `gradeTest`.
- `optLabel(option)` (plain-text name of a choice) is exported from `js/views/qtypes/shared.js`.
- CSS: `css/qt-<type>.css` for matching, ordering, fillblank, categorize, balance, econfig, ptable and hotspot, split out of `runner.css` and `qtypes.css` and linked from `index.html` until `ensureCss` exists. `sigfigs` has no rules of its own.
