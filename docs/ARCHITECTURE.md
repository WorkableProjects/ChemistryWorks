# ChemistryWorks — Architecture & Contracts

This is the source of truth for data shapes and module interfaces. Every module must conform to it.

## Stack

- Static site, **no build step**. Native ES modules (`<script type="module">`), plain CSS. Netlify publishes the repo root.
- KaTeX 0.16.11 + mhchem + auto-render from cdnjs (globals `katex`, `renderMathInElement`). Use `renderMath(root)` from `js/ui.js`; never call KaTeX directly from views.
- Google Identity Services for sign-in (`js/lib/auth.js`). Demo sign-in when no client ID is configured.
- Submissions: Google Apps Script Web App (primary) + Netlify Forms (backup). Apps Script also stores **published tests** and serves **results** to the admin analytics panel.
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
js/lib/grading.js          auto-grading engine                           (T01)
js/lib/api.js              Apps Script client                            (T04)
js/lib/submit.js           payload + dual submission + outbox            (T04)
js/views/landing.js        sign-in + code entry                          (Opus)
js/views/runner.js         student test-taking                           (T02)
js/views/results.js        submission confirmation + score review        (T02)
js/views/admin.js          builder, library, analytics, settings         (T03)
apps-script/Code.gs        Apps Script backend                           (T04)
data/tests/*.json          bundled tests; index.json = catalog
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
| `short` | `sampleAnswer` (default "", model answer / rubric for the teacher) | — (teacher graded) | free text |

Answers map: `answers = { [questionId]: answer }`. Unanswered = key missing, `null`, `""` (after trim), `[]`, or `{}`.

### Scoring rules

- `mcq`, `truefalse`: exact match → full points.
- `multi`: exact set match → full points. With `partialCredit`: `max(0, (correctSelected − wrongSelected) / correctCount) × points`.
- `numeric`: parse input with `parseNumber` (accepts `18.02`, `-3`, `1,204.5`, `6.02e23`, `6.02E+23`, `6.02x10^23`, `6.02 × 10^23`, `6.02*10^23`, `6.02×10²³`, unicode minus `−`; a trailing unit equal to the question's `unit` — case-insensitive, whitespace-insensitive — is ignored). Correct when `|x − key| ≤ tolerance` (absolute) or `|x − key| ≤ |key| × tolerance / 100` (percent). Also add a relative epsilon of 1e-9·|key| for float noise.
- `formula`: correct when `normalizeFormula(input)` equals `normalizeFormula(any accepted)`; case-insensitive comparison only if `caseSensitive: false`.
- `matching`: without partial credit: all pairs correct → full points. With `partialCredit` (default): `correctPairs / leftCount × points`.
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
export const QUESTION_TYPES = ['mcq', 'multi', 'numeric', 'formula', 'truefalse', 'matching'];
export const TYPE_LABELS = { mcq: 'Multiple choice', multi: 'Multiple select', numeric: 'Numeric', formula: 'Chemical formula', truefalse: 'True / False', matching: 'Matching' };
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
// - Always appends payload to local results log (storage key 'localResults', newest last, cap 500) — powers "This device" analytics.
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

## Required `data-testid`s (E2E tests depend on these)

Landing (done): `signin-card`, `demo-name`, `demo-email`, `demo-signin`, `code-card`, `code-input`, `code-submit`, `code-error`, `user-badge`, `sign-out`, `admin-link`, `resume-list`, `resume-<CODE>`; admin gate: `admin-gate`, `admin-code-input`, `admin-unlock`. Shared: `toast`, `brand`.

Runner: `runner`; `progress-bar` (role=progressbar with `aria-valuenow` = answered count, `aria-valuemax` = total), `progress-text` ("3 of 7 answered"), `timer`, `question-card` (attr `data-question-id`, and class `is-active` on the current card in focus mode), within a card: `flag-btn` (aria-pressed), `clear-answer`, `option-<optionId>` (mcq/multi clickable card; `aria-checked`), `numeric-input`, `numeric-preview`, `formula-input`, `formula-preview`, `tf-true`, `tf-false`, `match-<leftId>-<rightId>` (radio input in the matrix); navigation: `prev-btn`, `next-btn`, `review-btn`, `mode-toggle`, `navigator-toggle`, `navigator`, `nav-item-<questionId>` (class `is-answered` / `is-flagged` / `is-current`), `submit-btn`, `submit-modal`, `confirm-submit`, `cancel-submit`, `unanswered-warning`, `preview-banner`, `exit-preview`, `shortcuts-modal`.

Results: `results`, `score-percentage` (e.g. "85.71%"), `score-points` (e.g. "10 / 12"), `score-correct` ("5 of 7 correct"), `completion-time`, `answered-count`, `submission-status` (attr `data-gas`, `data-netlify`, `data-queued`), `review-list`, `review-item-<questionId>` (attr `data-correct="true|false"`), `pass-badge`, `home-btn`, `retry-submit`, `results-hidden` (shown instead of score when `showResults` false).

Admin: `admin`, `tab-library`, `tab-builder`, `tab-analytics`, `tab-settings`, `lock-admin`; library: `library-item-<CODE>`, `edit-<CODE>`, `preview-<CODE>`, `copy-link-<CODE>`; builder: `test-code`, `test-title`, `test-description`, `test-time-limit`, `add-question` (opens type menu) and `add-question-<type>`, `question-editor` (attr `data-index`), within editor: `q-id`, `q-text`, `q-points`, `q-delete`, `q-up`, `q-down`, `q-duplicate`, `option-text-<i>`, `option-correct-<i>`, `add-option`, `numeric-answer`, `numeric-tolerance`, `formula-answers`, `tf-answer`, `match-left-<i>`, `match-right-<i>`, `match-correct-<i>`; `validation-errors` (attr `data-count`), `builder-mode-visual`, `builder-mode-json`, `json-textarea`, `apply-json`, `save-draft`, `preview-test`, `download-json`, `import-json`, `publish-test`, `new-test`; analytics: `analytics-source` (select: 'device'|'sheet'), `analytics-test-filter`, `kpi-submissions`, `kpi-average`, `kpi-median`, `kpi-high`, `kpi-low`, `histogram`, `question-stats`, `results-table`, `results-search`, `export-csv`, `sheet-link`, `analytics-empty`; settings: `admin-key-input`, `save-admin-key`, `ping-backend`, `backend-status`, `setup-checklist`.

## Security notes

- Answer keys ship to the browser (client-side grading is part of the spec). Treat ChemistryWorks as a low/medium-stakes formative assessment tool. See DEPLOYMENT.md "Limitations".
- Never insert test content or student input via `innerHTML`. Use `h()` / `richText()` / `textContent`. `formulaToHTML()` output is the only HTML string allowed (it escapes input).
