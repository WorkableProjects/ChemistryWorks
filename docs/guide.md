# ChemistryWorks Test Authoring Guide (for AI assistants)

This guide is for an AI assistant (or a person) writing a test for ChemistryWorks. Follow it exactly and the output will import into the app without errors.

**Your job:** produce **one JSON object** describing a test. Output only the JSON: no comments, no trailing commas, no Markdown outside a single ```json code block. The teacher then imports it as described in [Importing into ChemistryWorks](#importing-into-chemistryworks).

---

## Quick rules

1. Output strict JSON: double-quoted keys and strings, no `//` comments, no trailing commas.
2. `code`: 2–32 characters, uppercase letters, digits, `-` or `_` (e.g. `CHEM-U3-QUIZ`). Must be unique among the teacher's tests.
3. Every question needs a unique `id` (letters, digits, `-`, `_`). Use `q1`, `q2`, `q3`, …
4. `type` must be one of: `mcq`, `multi`, `numeric`, `formula`, `truefalse`, `matching`, `short`.
5. `points` must be a number greater than 0.
6. Option ids (`mcq`, `multi`) and item ids (`matching`) must be unique **within that question**. Use `a`, `b`, `c`, `d` for options.
7. `correctAnswer` must refer to ids that exist in the question (see each type below).
8. In JSON, a backslash must be written as `\\`. So the math `$\ce{H2O}$` is written `"$\\ce{H2O}$"`.

---

## Test object

```json
{
  "code": "CHEM-U3",
  "title": "Unit 3: The Mole",
  "description": "Optional text shown to students before they start.",
  "timeLimitMinutes": 30,
  "shuffleQuestions": false,
  "shuffleOptions": true,
  "showResults": true,
  "showCorrectAnswers": true,
  "allowModeToggle": true,
  "defaultMode": null,
  "passingPercent": 70,
  "questions": []
}
```

| Field | Required | Type / allowed values | Default | Meaning |
|---|---|---|---|---|
| `code` | yes | string, `A–Z 0–9 - _`, 2–32 chars | — | What students type to open the test. Lowercase is uppercased automatically. |
| `title` | yes | non-empty string | — | Test name. |
| `description` | no | string | `""` | Shown to students before they start. |
| `timeLimitMinutes` | no | positive number or `null` | `null` (untimed) | Auto-submits when time runs out. |
| `shuffleQuestions` | no | boolean | `false` | Random question order per student. |
| `shuffleOptions` | no | boolean | `false` | Random option order (`mcq` / `multi` only). |
| `showResults` | no | boolean | `true` | `false` = student sees only "Submission received" (no score). The teacher grades privately in the admin **Grading** tab. |
| `showCorrectAnswers` | no | boolean | `true` | Per-question review with correct answers and explanations (only when the score is shown). |
| `allowModeToggle` | no | boolean | `true` | Student may switch between one-at-a-time and all-on-one-page. |
| `defaultMode` | no | `"focus"`, `"scroll"` or `null` | `null` (site default) | Starting layout. |
| `passingPercent` | no | number 0–100 or `null` | `null` | Shows a Passed / Not yet badge. |
| `questions` | yes | array, at least 1 | — | See below. |

**Hidden-score tests:** if the teacher wants students *not* to see their score (for example, to grade privately and enter grades into Aeries or Google Classroom), set `"showResults": false`.

---

## Question fields (all types)

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique in the test. `q1`, `q2`, … |
| `type` | yes | One of the seven types below. |
| `text` | yes | The question. Supports math, see [Writing chemistry and math](#writing-chemistry-and-math). |
| `points` | no | Number > 0. Default `1`. |
| `explanation` | no | Shown in the student review after submitting (if `showCorrectAnswers` is on). Strongly recommended. |

---

## The seven question types

### 1. `mcq`: multiple choice (one answer)

```json
{
  "id": "q1",
  "type": "mcq",
  "text": "Which particle determines the identity of an element?",
  "points": 1,
  "options": [
    { "id": "a", "text": "Neutron" },
    { "id": "b", "text": "Proton" },
    { "id": "c", "text": "Electron" },
    { "id": "d", "text": "Positron" }
  ],
  "correctAnswer": "b",
  "explanation": "The number of protons (atomic number) defines the element."
}
```

- `options`: at least 2, each `{ "id", "text" }`.
- `correctAnswer`: **one option id string**.

### 2. `multi`: multiple select (several answers)

```json
{
  "id": "q2",
  "type": "multi",
  "text": "Select ALL of the noble gases.",
  "points": 2,
  "partialCredit": true,
  "options": [
    { "id": "a", "text": "Helium" },
    { "id": "b", "text": "Nitrogen" },
    { "id": "c", "text": "Argon" },
    { "id": "d", "text": "Chlorine" }
  ],
  "correctAnswer": ["a", "c"],
  "explanation": "He and Ar are in Group 18."
}
```

- `correctAnswer`: **non-empty array of option ids**.
- `partialCredit` (default `false`): if `true`, the score is `(correct picks − wrong picks) / number correct × points`, minimum 0. If `false`, the student must match exactly.
- Tell the student in `text` to "Select ALL that apply".

### 3. `numeric`: number answer

```json
{
  "id": "q3",
  "type": "numeric",
  "text": "What is the molar mass of $\\ce{H2O}$ in g/mol? (H = 1.008, O = 16.00)",
  "points": 2,
  "correctAnswer": 18.016,
  "tolerance": 0.05,
  "toleranceType": "absolute",
  "unit": "g/mol",
  "explanation": "2(1.008) + 16.00 = 18.016 g/mol."
}
```

- `correctAnswer`: a **JSON number**, not a string (`18.016`, `6.022e23`).
- `tolerance` (default `0`): allowed error, ≥ 0. Always give a tolerance for calculated answers so rounding is accepted.
- `toleranceType`: `"absolute"` (± that amount) or `"percent"` (± that % of the answer). Use `"percent"` for very large or very small numbers, e.g. `"tolerance": 1, "toleranceType": "percent"`.
- `unit` (optional): shown next to the input box. If the student types the unit as well, it is ignored.
- Students can type `6.02e23`, `6.02 × 10^23`, `6.02x10^23` or `1,204.5`.
- State the required precision or significant figures in `text` if it matters.

### 4. `formula`: chemical formula

```json
{
  "id": "q4",
  "type": "formula",
  "text": "Write the formula for sulfuric acid.",
  "points": 1,
  "caseSensitive": true,
  "correctAnswer": "H2SO4",
  "explanation": "Two H⁺ and one sulfate ion: H₂SO₄."
}
```

- `correctAnswer`: a formula string, or an **array of accepted formulas** (e.g. `["CH3COOH", "C2H4O2"]`).
- Write formulas in plain text: `H2O`, `Ca(OH)2`, hydrates `CuSO4.5H2O`, ions `SO4^2-`, `Na^+`.
- Matching ignores spacing and accepts equivalent charge and subscript notation (`SO4^2-`, `SO₄²⁻`). Order still matters (`H2O` ≠ `OH2`, `CuSO4.5H2O` ≠ `5H2O.CuSO4`). If several orderings are acceptable, list them all in the array.
- `caseSensitive` (default `true`): keep `true`, because `Co` (cobalt) and `CO` (carbon monoxide) are different.

### 5. `truefalse`: true / false

```json
{
  "id": "q5",
  "type": "truefalse",
  "text": "Isotopes of an element have different numbers of neutrons.",
  "points": 1,
  "correctAnswer": true,
  "explanation": "Same protons, different neutrons."
}
```

- `correctAnswer`: JSON boolean `true` or `false` (not the string `"true"`).

### 6. `matching`: match items in two columns

```json
{
  "id": "q6",
  "type": "matching",
  "text": "Match each element to its most common ion charge.",
  "points": 3,
  "partialCredit": true,
  "left": [
    { "id": "na", "text": "Sodium" },
    { "id": "mg", "text": "Magnesium" },
    { "id": "al", "text": "Aluminum" }
  ],
  "right": [
    { "id": "p1", "text": "+1" },
    { "id": "p2", "text": "+2" },
    { "id": "p3", "text": "+3" },
    { "id": "m1", "text": "−1" }
  ],
  "correctAnswer": { "na": "p1", "mg": "p2", "al": "p3" },
  "explanation": "Group 1 → +1, Group 2 → +2, Group 13 → +3."
}
```

- `left` and `right`: at least 2 items each. `right` may include extra distractors, and a right item may be used by several left items.
- `correctAnswer`: an object mapping **every** left id to one right id.
- `partialCredit` (default `true`): points for each correct pair.

### 7. `short`: short answer / open-ended (teacher graded)

```json
{
  "id": "q7",
  "type": "short",
  "text": "Explain, in terms of particles, why increasing temperature increases reaction rate.",
  "points": 4,
  "sampleAnswer": "Particles move faster, so they collide more often and more collisions have energy ≥ the activation energy. Rubric: 2 pts frequency, 2 pts energy/activation energy.",
  "explanation": ""
}
```

- No `correctAnswer`. This question is **never auto-graded**. It scores 0 until the teacher assigns points in the admin **Grading** tab.
- `sampleAnswer` (optional, recommended): a model answer and/or rubric. The teacher sees it while grading. Students see it in their review only if `showCorrectAnswers` is on, so don't put anything there that must stay private.
- Give it more `points` than a one-step question if the rubric has several parts.

---

## Writing chemistry and math

Question `text`, option `text`, `explanation` and `sampleAnswer` are plain text with optional math between `$…$` (inline) or `$$…$$` (display), rendered with KaTeX and the mhchem extension.

| You want | Write in JSON |
|---|---|
| H₂SO₄ | `"$\\ce{H2SO4}$"` |
| Reaction arrow | `"$\\ce{2H2 + O2 -> 2H2O}$"` |
| Equilibrium | `"$\\ce{N2 + 3H2 <=> 2NH3}$"` |
| Ion | `"$\\ce{SO4^2-}$"` |
| Scientific notation | `"$6.022 \\times 10^{23}$"` |
| Fraction | `"$\\frac{n}{V}$"` |
| Units | `"$\\pu{25 ^\\circ C}$"` or just `"25 °C"` |

Rules:
- Every backslash in JSON is doubled: `\\ce`, `\\times`, `\\frac`.
- Text is never treated as HTML. Don't use `<b>`, `<br>` or other tags.
- Avoid a literal `$` in text (it starts math); write "dollars" instead.
- Formula answers (`formula` type `correctAnswer`) are plain text like `H2SO4`, **not** `$\\ce{…}$`.

---

## Quality checklist for the AI

Before outputting, check:

- [ ] Every `id` is unique; every `correctAnswer` refers to ids that exist.
- [ ] `numeric` answers are numbers with a sensible `tolerance`; constants and given values are stated in the question.
- [ ] `mcq` distractors are plausible and reflect real misconceptions; exactly one option is correct.
- [ ] `multi` questions say "Select ALL that apply".
- [ ] Each auto-graded question has a short `explanation`.
- [ ] `short` questions have a `sampleAnswer` / rubric and appropriate `points`.
- [ ] Chemistry is correct: balanced equations, correct charges, significant figures.
- [ ] Backslashes are doubled and the output is valid JSON.

---

## Complete example

A complete, valid test using all seven types (copy this as a template):

```json
{
  "code": "CHEM-DEMO",
  "title": "Demo: All Question Types",
  "description": "A short demo covering every ChemistryWorks question type.",
  "timeLimitMinutes": 20,
  "shuffleQuestions": false,
  "shuffleOptions": true,
  "showResults": true,
  "showCorrectAnswers": true,
  "passingPercent": 70,
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "text": "Which particle determines the identity of an element?",
      "points": 1,
      "options": [
        { "id": "a", "text": "Neutron" },
        { "id": "b", "text": "Proton" },
        { "id": "c", "text": "Electron" },
        { "id": "d", "text": "Positron" }
      ],
      "correctAnswer": "b",
      "explanation": "The number of protons (atomic number) defines the element."
    },
    {
      "id": "q2",
      "type": "multi",
      "text": "Select ALL of the noble gases.",
      "points": 2,
      "partialCredit": true,
      "options": [
        { "id": "a", "text": "Helium" },
        { "id": "b", "text": "Nitrogen" },
        { "id": "c", "text": "Argon" },
        { "id": "d", "text": "Chlorine" }
      ],
      "correctAnswer": ["a", "c"],
      "explanation": "He and Ar are in Group 18."
    },
    {
      "id": "q3",
      "type": "numeric",
      "text": "What is the molar mass of $\\ce{H2O}$ in g/mol? (H = 1.008, O = 16.00)",
      "points": 2,
      "correctAnswer": 18.016,
      "tolerance": 0.05,
      "toleranceType": "absolute",
      "unit": "g/mol",
      "explanation": "2(1.008) + 16.00 = 18.016 g/mol."
    },
    {
      "id": "q4",
      "type": "formula",
      "text": "Write the formula for sulfuric acid.",
      "points": 1,
      "correctAnswer": "H2SO4",
      "explanation": "Two H⁺ and one sulfate ion."
    },
    {
      "id": "q5",
      "type": "truefalse",
      "text": "Isotopes of an element have different numbers of neutrons.",
      "points": 1,
      "correctAnswer": true,
      "explanation": "Same protons, different neutrons."
    },
    {
      "id": "q6",
      "type": "matching",
      "text": "Match each element to its most common ion charge.",
      "points": 3,
      "partialCredit": true,
      "left": [
        { "id": "na", "text": "Sodium" },
        { "id": "mg", "text": "Magnesium" },
        { "id": "al", "text": "Aluminum" }
      ],
      "right": [
        { "id": "p1", "text": "+1" },
        { "id": "p2", "text": "+2" },
        { "id": "p3", "text": "+3" },
        { "id": "m1", "text": "−1" }
      ],
      "correctAnswer": { "na": "p1", "mg": "p2", "al": "p3" },
      "explanation": "Group 1 → +1, Group 2 → +2, Group 13 → +3."
    },
    {
      "id": "q7",
      "type": "short",
      "text": "Explain why increasing temperature increases the rate of a reaction.",
      "points": 4,
      "sampleAnswer": "Particles move faster, so they collide more often, and a larger fraction of collisions have energy at least equal to the activation energy. Rubric: 2 pts collision frequency, 2 pts activation energy."
    }
  ]
}
```

---

## Importing into ChemistryWorks

This section is for the teacher (or an AI with access to the repository).

### Option A: Admin panel (no code, recommended)

1. Save the JSON as a file named after the code, e.g. `CHEM-DEMO.json`. Alternatively, copy the JSON text.
2. Open the site with `?admin=true` at the end of the address (or click **Teacher / admin** in the bottom-right of the home screen) and enter the admin access code.
3. Go to the **Builder** tab, then either:
   - click **Import JSON** and choose the file, **or**
   - switch the builder to **JSON** mode, paste the JSON, and click **Apply JSON**.
4. Check the validation panel. It must say **Ready to publish ✓**. If it lists issues, fix them. Each message names the question and field, e.g. `Question 3 (q3): correctAnswer must be a number.`
5. Click **Preview** and take the test yourself as a student would.
6. Click **Publish to Sheet**. This needs the Apps Script URL in `js/config.js` and your admin key entered in the **Settings** tab. The test is saved to the **Tests** tab of the Google Sheet.
7. Students sign in, type the test code (e.g. `CHEM-DEMO`) and start. No redeploy is needed. Publishing again with the same code replaces the test.

**Save draft** keeps the test in this browser only (useful while editing). Students can't open drafts.

### Option B: Bundle it with the site (for repository maintainers)

Use this when the test should live in Git and work even if Apps Script is down.

1. Save the JSON as `data/tests/<CODE>.json`. The file name must equal the `code`.
2. Add an entry to `data/tests/index.json`:
   ```json
   { "code": "CHEM-DEMO", "title": "Demo: All Question Types", "description": "A short demo covering every question type." }
   ```
3. Validate every bundled test:
   ```bash
   npm run validate:tests
   ```
4. Commit, push, and let Netlify redeploy.

If a bundled test and a published test share a code, the bundled one is used.

### Grading tests with `short` questions or hidden scores

After students submit, open the admin **Grading** tab (it needs the admin key in **Settings**). Filter by **Needs grading**, open each submission, enter points for open-ended answers (and override any auto-graded points if needed), and click **Save & next**. **Export grades** downloads a CSV of final scores (name, email, score, percent) to copy into Aeries or Google Classroom.

---

Full technical reference (schema, scoring rules, module contracts): [ARCHITECTURE.md](ARCHITECTURE.md).
