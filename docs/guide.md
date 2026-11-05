# ChemistryWorks Test Authoring Guide (for AI assistants)

This guide is for an AI assistant (or a person) writing a test for ChemistryWorks. Follow it exactly and the output will import into the app without errors.

**Your job** is one of three things. In every case you output **one complete JSON object** for the whole test in a single ```json code block (no comments, no trailing commas):

1. **Write a new test** from the teacher's request (everything below).
2. **Update only the Resources tab** of an existing test (the constants and values students see beside the questions): see [Updating the Resources tab](#a-update-only-the-resources-tab).
3. **Update the whole test** (questions, answers, points, sections, settings, references): see [Updating the whole test](#b-update-the-whole-test).

For updates the teacher gives you the test's current JSON; after the JSON block add a short bullet list of what you changed. The teacher then imports it as described in [Importing into ChemistryWorks](#importing-into-chemistryworks).

**When you're done:** always tell the user to save the JSON as `<CODE>.json` and add it to `~/data/tests` (the `data/tests/` folder of the ChemistryWorks repository), along with an entry in `data/tests/index.json`. See [Option B](#option-b-bundle-it-with-the-site-for-repository-maintainers).

---

## Quick rules

1. Output strict JSON: double-quoted keys and strings, no `//` comments, no trailing commas.
2. `code`: 2–32 characters, uppercase letters, digits, `-` or `_` (e.g. `CHEM-U3-QUIZ`). Must be unique among the teacher's tests.
3. Every question needs a unique `id` (letters, digits, `-`, `_`). Use `q1`, `q2`, `q3`, …
4. `type` must be one of: `mcq`, `multi`, `numeric`, `formula`, `truefalse`, `matching`, `ordering`, `fillblank`, `lewis`, `structure`, `short`, `open`, `orbital`, `balance`, `econfig`, `ptable`, `sigfigs`, `categorize`, `hotspot`, `graph`.
5. `points` must be a number greater than 0.
6. Option ids (`mcq`, `multi`), item ids (`matching`, `ordering`), blank ids (`fillblank`) and atom ids (`structure`) must be unique **within that question**. Use `a`, `b`, `c`, `d` for options.
7. `correctAnswer` must refer to ids that exist in the question (see each type below).
8. In JSON, a backslash must be written as `\\`. So the math `$\ce{H2O}$` is written `"$\\ce{H2O}$"`.
9. Pick the type that fits the skill being tested (see [Choosing a question type](#choosing-a-question-type)). For bonding, use `structure` (full Lewis structure) rather than describing a structure in words.
10. Optional v2 features: group questions into `sections`, give students a `references` pane (periodic table, **Resources** table of constants/values, text, image), use `orbital` for orbital diagrams and `studentCharges` on `structure` for brackets and charges. See [Sections and references](#sections-and-references-v2), [13. `orbital`](#13-orbital-energy-orbital-diagram-teacher-graded) and [Brackets and charges](#brackets-and-charges-studentcharges-teacher-graded).

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
| `shuffleOptions` | no | boolean | `false` | Random option order (`mcq` / `multi`; for `matching`, both the rows and the columns). |
| `showResults` | no | boolean | `true` | `false` = student sees only "Submission received" (no score). The teacher grades privately in the admin **Grading** tab. |
| `showCorrectAnswers` | no | boolean | `true` | Per-question review with correct answers and explanations (only when the score is shown). |
| `allowModeToggle` | no | boolean | `true` | Student may switch between one-at-a-time and all-on-one-page. |
| `defaultMode` | no | `"focus"`, `"scroll"` or `null` | `null` (site default) | Starting layout. |
| `passingPercent` | no | number 0–100 or `null` | `null` | Shows a Passed / Not yet badge. |
| `gameMode` | no | boolean | `false` | Offers a practice **Game mode** (never submitted) next to the normal test. |
| `games` | no | array of game ids | all playable | Limits the game picker: `classic`, `survival`, `lightning`, `elementhunt`, `matchup`, `flashcards`. |
| `singleSubmission` | no | boolean | `false` | **One submission per student** (v3): a student who already submitted (same Google email) cannot start it again. Use **Grading → Allow retake** for exceptions. |
| `requireAllQuestions` | no | boolean | `false` | Every question must be answered before the student can submit. To require only some questions, set `required: true` on those questions. A test that runs out of time still submits automatically. |
| `sections` | no | array of `{ id, title, instructions? }` | `[]` | Named groups of questions. See [Sections and references](#sections-and-references-v2). |
| `references` | no | array of reference items | `[]` | Resources shown in a split-screen pane beside the questions. See [Sections and references](#sections-and-references-v2). |
| `questions` | yes | array, at least 1 | — | See below. |

**Hidden-score tests:** if the teacher wants students *not* to see their score (for example, to grade privately and enter grades into Aeries or Google Classroom), set `"showResults": false`.

---

## Sections and references (v2)

Both are optional. A test without them behaves exactly as before.

### `sections`

```json
"sections": [
  { "id": "secA", "title": "Part A: Electron configuration", "instructions": "Use the periodic table in the reference pane." },
  { "id": "secB", "title": "Part B: Bonding", "instructions": "Draw complete Lewis structures, including **brackets** and charges for ions." }
]
```

- `id`: unique among sections (letters, digits, `-`, `_`). `title`: required, non-empty. `instructions`: optional text shown under the section heading.
- Put a question in a section with `"section": "secA"` on the question. A question without `section` is **unsectioned**. Every `section` value must match a section `id`.
- **Canonical ordering rule:** the app always orders questions as *unsectioned questions first, then each section in the order of the `sections` array; inside each group, questions keep their order in the `questions` array*. Write the `questions` array in that order (the app re-sorts it on import, so the order you see after importing is the order students see). With `shuffleQuestions`, questions shuffle only inside their own group; the groups never move.
- **Section point totals are calculated** from the questions' `points` and shown automatically. Do not write a total anywhere.

### `references`

A reference pane appears beside the questions on wide screens (stacked or collapsible on small screens). Students can switch between items, resize the pane and collapse it; answers are kept.

```json
"references": [
  { "id": "pt", "type": "periodic-table", "title": "" },
  { "id": "res", "type": "resources", "title": "Resources", "items": [
    { "name": "Avogadro's number", "value": "$6.02 \\times 10^{23}$", "unit": "mol$^{-1}$" },
    { "name": "Ideal gas constant, R", "value": "0.0821", "unit": "L·atm/(mol·K)" },
    { "name": "Molar volume of a gas at STP", "value": "22.4", "unit": "L/mol" }
  ] },
  { "id": "sol", "type": "image", "title": "Solubility chart", "url": "https://example.org/solubility.png", "alt": "Table of solubility rules for common ionic compounds" }
]
```

| `type` | Extra fields | Notes |
|---|---|---|
| `periodic-table` | none | Built-in periodic table, identical to the California Standards Test *Chemistry Reference Sheet* (e.g. O 16.00, Fe 55.85, Tc (98)). **At most one per test.** `title` may be `""` (it then shows "Periodic table"). |
| `resources` | `items` (required, ≥ 1): `[{ "name", "value", "unit" }]` | The **Resources** tab: a table of the constants and values students may use, **per test**. Shown exactly as written, so use the values the class uses (e.g. `6.02 × 10²³`, not `6.02214076 × 10²³`). `name` and `value` are required, `unit` may be `""`. **All three columns use the same LaTeX formatting as question text** (see [Writing chemistry and math](#writing-chemistry-and-math)): `$…$` for math, `$\\ce{…}$` for formulas, e.g. `"name": "Molar mass of $\\ce{H2O}$"`, `"unit": "$\\frac{\\text{L atm}}{\\text{mol K}}$"`. A typed `·` works everywhere, including inside `\\text{…}` (e.g. `$\\frac{\\text{L·atm}}{\\text{mol·K}}$`). Use one `resources` reference per test, titled `"Resources"`. |
| `text` | `content` (required) | Free-form notes or formulas. Supports math between `$…$` like question text. Use `\n\n` for a new paragraph. |
| `image` | `url` (required), `alt` (required) | The URL must be **https** (or a site-relative path such as `data/img/chart.png`); other schemes are rejected. **`alt` is required**: describe the image for screen readers. |

- Each reference needs a unique `id` (`ref1`, `pt`, …). References are per test, not per section.
- Only include what students may use during the test: everything in the pane is visible to them.

---

## Choosing a question type

| The student should… | Use |
|---|---|
| pick one answer | `mcq` |
| pick every correct answer | `multi` |
| calculate a number | `numeric` |
| write a formula or ion (H2SO4, SO4^2-) | `formula` |
| judge a statement | `truefalse` |
| pair items (element → charge) | `matching` |
| put items in order (electronegativity, atomic radius, steps of a procedure) | `ordering` |
| complete a sentence (vocabulary, formulas or numbers in context) | `fillblank` |
| draw valence dots around one element | `lewis` |
| draw the full Lewis structure of a molecule or polyatomic ion (bonds + lone pairs) | `structure` |
| draw a structure with brackets, an overall charge and formal charges (teacher graded) | `structure` with `"studentCharges": true` |
| fill in an energy orbital diagram with up/down arrows (teacher graded) | `orbital` |
| balance a chemical equation by typing coefficients | `balance` |
| write an electron configuration (`1s2 2s2 2p6` or `[Ne] 3s1`) | `econfig` |
| click one or more elements on the periodic table | `ptable` |
| give a number with the right number of significant figures | `sigfigs` |
| sort items into labeled groups (ionic / covalent / metallic) | `categorize` |
| place labels on a picture (lab equipment, a diagram) | `hotspot` |
| read a value off a chart, or plot points on a grid (heating curve, titration) | `graph` |
| write a sentence or two (teacher graded) | `short` |
| write an extended explanation graded with a rubric (teacher graded) | `open` |

---

## Question fields (all types)

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique in the test. `q1`, `q2`, … |
| `type` | yes | One of the thirteen types below. |
| `text` | yes | The question. Supports math, see [Writing chemistry and math](#writing-chemistry-and-math). |
| `points` | no | Number > 0. Default `1`. |
| `explanation` | no | Shown in the student review after submitting (if `showCorrectAnswers` is on). Strongly recommended. |
| `required` | no | `true` = the student must answer this question before submitting (shown with a **Required** tag). Default `false`. |
| `section` | no | Id of a section in the test's `sections`. Omit for an unsectioned question. |
| `image` | no | Image shown alongside the question: `{ "url": "https://…" or "images/x.png", "alt": "what it shows", "position": "right" \| "left" \| "below" }`. `alt` is required; `position` defaults to `right`. Phones stack it under the text. Also appears in the review, grading and PDF export. |

---

## The question types

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
- **Exponent help is automatic.** When the answer is 10,000 or more, smaller than 0.001, or the text mentions scientific notation, students see a "How to type powers of ten" box (`6.02e23`, `6.02x10^23`, `1.5e-4`) and a `×10^` insert button, and a live "Interpreted as 6.02 × 10²³" preview. Set `"formatHelp": "always"` to force it or `"never"` to hide it. You do not need to explain the typing format in `text`.

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
- **Charge help is automatic.** When any accepted answer has a charge (`SO4^2-`, `Na+`, `Fe^3+`) or the text mentions an ion/charge, students see a "How to type charges" box with examples (type `^`, then the number, then the sign; no number for a charge of 1: `Na^+`) and `^ + − ( ) ·` insert buttons, plus a live formatted preview (SO₄²⁻). Set `"formatHelp": "always"` to force it, `"never"` to hide it (e.g. on a quiz about notation itself). Always write the charge in the key the conventional way (`SO4^2-`, not `SO4^-2`; both are accepted from students).
- For ions, list the charged form only (`"NO3^-"`). A student who leaves off the charge is marked wrong, which is usually what you want when testing ion formulas.

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

### 7. `ordering`: put items in order

```json
{
  "id": "q9",
  "type": "ordering",
  "text": "Arrange these elements from lowest to highest first ionization energy.",
  "points": 3,
  "partialCredit": true,
  "topLabel": "Lowest",
  "bottomLabel": "Highest",
  "items": [
    { "id": "na", "text": "Na" },
    { "id": "mg", "text": "Mg" },
    { "id": "p", "text": "P" },
    { "id": "ar", "text": "Ar" }
  ],
  "correctAnswer": ["na", "mg", "p", "ar"],
  "explanation": "Ionization energy increases across a period as nuclear charge increases."
}
```

- `items`: at least 2 `{ "id", "text" }`. List them in any order; students always see them scrambled (never already correct).
- `correctAnswer`: **every item id exactly once**, in the correct order (first = top).
- `partialCredit` (default `true`): points for each item in its correct position.
- `topLabel` / `bottomLabel` (optional): shown above and below the list, e.g. "Smallest" / "Largest". Say the direction in `text` too.

### 8. `fillblank`: fill in the blanks

```json
{
  "id": "q10",
  "type": "fillblank",
  "text": "In an ionic bond, electrons are {{b1}} from the metal to the nonmetal. Sodium becomes the ion {{b2}} and one mole of NaCl contains {{b3}} formula units.",
  "points": 3,
  "partialCredit": true,
  "blanks": [
    { "id": "b1", "answers": ["transferred", "given"], "kind": "text" },
    { "id": "b2", "answers": ["Na^+"], "kind": "formula" },
    { "id": "b3", "answers": [6.022e23], "kind": "number", "tolerance": 1, "toleranceType": "percent" }
  ],
  "explanation": "Metals lose electrons to nonmetals; Na → Na⁺ + e⁻."
}
```

- In `text`, put `{{id}}` exactly where each blank goes. Every blank id must appear **exactly once** in `text`, and every `{{id}}` must have a blank.
- `blanks`: at least 1, each `{ "id", "answers", "kind" }`.
  - `answers`: list of accepted answers (at least 1).
  - `kind`: `"text"` (default; ignores case, extra spaces and a trailing period), `"number"` (answers are numbers; optional `tolerance`, `toleranceType`, `unit` exactly like `numeric`), or `"formula"` (compared like `formula` questions, case-sensitive).
- `partialCredit` (default `true`): points for each correct blank.
- `caseSensitive` (default `false`): applies to `text` blanks only.
- `wordBank` (default `false`): students choose each blank from a dropdown of every blank's first answer plus `distractors` (e.g. `"distractors": ["shared", "Cl^-"]`). Good for vocabulary; with a word bank, each blank's **first** answer is the one shown.
- `formula` blanks with charges and `number` blanks needing scientific notation get the same automatic typing help as `formula` / `numeric` questions (`formatHelp` works here too).
- Keep math (`$…$`) out of the sentence parts that touch a blank, and never put a blank inside `$…$`.

### 9. `lewis`: Lewis (electron) dot diagram for an element

```json
{
  "id": "q8",
  "type": "lewis",
  "text": "Draw the Lewis dot diagram for oxygen.",
  "points": 2,
  "element": "O",
  "correctAnswer": 6,
  "checkPlacement": true,
  "explanation": "Oxygen is in group 16, so it has 6 valence electrons: one dot on each side, then two pairs."
}
```

- The student sees the `element` symbol and clicks each side (top, right, bottom, left) to add a dot; a second click makes a pair, a third clears that side.
- `element` (required): an element symbol such as `"O"`, `"Cl"`, `"Mg"`.
- `correctAnswer`: the number of valence electrons (whole number 1–8). It can be left out for main-group elements (groups 1, 2, 13–18, including H and He); it is filled in automatically. For any other element (e.g. transition metals) you must give it.
- `checkPlacement` (default `true`): also require the conventional placement, one dot on each side before any side gets a pair (so O = 2, 2, 1, 1 in any arrangement, but not 2, 2, 2, 0). Helium may be drawn as one pair or two single dots. Set to `false` to grade only the total number of dots.
- All or nothing: no partial credit. A student's answer is stored as `[top, right, bottom, left]`, e.g. `[2, 2, 1, 1]`.
- Don't reveal the valence count in `text`; ask for the diagram.

### 10. `structure`: full Lewis structure (bonding, molecules and polyatomic ions)

The student sees the atoms of a molecule placed on a grid with the skeleton connections drawn as dashed lines. They click each bond to set it to single, double or triple, and click each atom to add lone pairs (0–4). A counter shows how many electrons they have drawn. Ions are drawn in brackets with the charge.

```json
{
  "id": "q11",
  "type": "structure",
  "text": "Draw the Lewis structure of carbon dioxide, $\\ce{CO2}$.",
  "points": 3,
  "atoms": [
    { "id": "o1", "symbol": "O", "x": 0, "y": 0 },
    { "id": "c",  "symbol": "C", "x": 1, "y": 0 },
    { "id": "o2", "symbol": "O", "x": 2, "y": 0 }
  ],
  "bonds": [["o1", "c"], ["c", "o2"]],
  "charge": 0,
  "correctAnswer": { "bonds": [2, 2], "lonePairs": { "o1": 2, "c": 0, "o2": 2 } },
  "partialCredit": false,
  "showElectronCount": false,
  "explanation": "16 valence electrons: two C=O double bonds give carbon an octet; each O keeps two lone pairs."
}
```

- `atoms`: at least 2, each `{ "id", "symbol", "x", "y" }`.
  - `id`: unique within the question (`c`, `o1`, `h2`, …). Number repeated elements (`h1`, `h2`, `h3`).
  - `symbol`: element symbol (`"C"`, `"Cl"`).
  - `x`, `y` (recommended): grid position, x = column (left → right), y = row (top → bottom). Neighbouring atoms are 1 apart; decimals are fine (`1.5`). If **any** atom lacks `x`/`y`, the whole molecule is laid out automatically around the atom with the most bonds (fine for AX₂–AX₄ shapes, but give coordinates for bent or chain molecules).
- `bonds`: the skeleton, as pairs of atom ids `["c", "o1"]`. List every connection once; the student cannot add or remove connections, only set the bond order.
- `charge` (default `0`): overall charge of a polyatomic ion, e.g. `-1` for NO₃⁻, `1` for NH₄⁺, `-2` for SO₄²⁻.
- `correctAnswer`: `{ "bonds": [...], "lonePairs": { ... } }`
  - `bonds`: one bond order (1, 2 or 3) **per entry in `bonds`, in the same order**.
  - `lonePairs`: lone **pairs** (not electrons) per atom id. Atoms you leave out have 0 (so hydrogens can be omitted).
  - **Resonance:** give an array of these objects; a student matching any one gets full credit (see NO₃⁻ below).
- **Electron check:** for main-group atoms the app verifies `2 × (sum of bond orders) + 2 × (sum of lone pairs) = total valence electrons − charge`. If it doesn't match, the test will not import. Count before you write. CO₂: valence 4 + 6 + 6 = 16; drawn = 2 × (2 + 2) for the bonds + 2 × (2 + 0 + 2) for the lone pairs = 8 + 8 = 16 ✓.
- `partialCredit` (default `false`): credit = (correct bond orders + atoms with the correct lone-pair count) ÷ (bonds + atoms), using the closest resonance form.
- `showElectronCount` (default `false`): when `true`, the counter says "14 of 16 valence electrons drawn", which gives the total away. Leave `false` when counting valence electrons is part of the skill.
- By default formal charges are not asked for (see [Brackets and charges](#brackets-and-charges-studentcharges-teacher-graded) to require them). Expanded octets (SF₆, PCl₅, XeF₄) work: up to 4 lone pairs per atom and triple bonds are allowed.

**Water (bent; give coordinates):**
```json
{
  "id": "q12", "type": "structure", "text": "Draw the Lewis structure of water, $\\ce{H2O}$.", "points": 2,
  "atoms": [
    { "id": "h1", "symbol": "H", "x": 0, "y": 1 },
    { "id": "o",  "symbol": "O", "x": 1, "y": 0 },
    { "id": "h2", "symbol": "H", "x": 2, "y": 1 }
  ],
  "bonds": [["h1", "o"], ["o", "h2"]],
  "correctAnswer": { "bonds": [1, 1], "lonePairs": { "o": 2 } }
}
```

**Ammonium ion (charge +1, automatic layout):**
```json
{
  "id": "q13", "type": "structure", "text": "Draw the Lewis structure of the ammonium ion, $\\ce{NH4+}$.", "points": 2, "charge": 1,
  "atoms": [{ "id": "n", "symbol": "N" }, { "id": "h1", "symbol": "H" }, { "id": "h2", "symbol": "H" }, { "id": "h3", "symbol": "H" }, { "id": "h4", "symbol": "H" }],
  "bonds": [["n", "h1"], ["n", "h2"], ["n", "h3"], ["n", "h4"]],
  "correctAnswer": { "bonds": [1, 1, 1, 1], "lonePairs": { "n": 0 } }
}
```

**Nitrate ion (resonance: any of the three forms is accepted):**
```json
{
  "id": "q14", "type": "structure", "text": "Draw one Lewis structure of the nitrate ion, $\\ce{NO3-}$.", "points": 3, "charge": -1, "partialCredit": true,
  "atoms": [
    { "id": "n",  "symbol": "N", "x": 1, "y": 1 },
    { "id": "o1", "symbol": "O", "x": 1, "y": 0 },
    { "id": "o2", "symbol": "O", "x": 0, "y": 1.6 },
    { "id": "o3", "symbol": "O", "x": 2, "y": 1.6 }
  ],
  "bonds": [["n", "o1"], ["n", "o2"], ["n", "o3"]],
  "correctAnswer": [
    { "bonds": [2, 1, 1], "lonePairs": { "o1": 2, "o2": 3, "o3": 3 } },
    { "bonds": [1, 2, 1], "lonePairs": { "o1": 3, "o2": 2, "o3": 3 } },
    { "bonds": [1, 1, 2], "lonePairs": { "o1": 3, "o2": 3, "o3": 2 } }
  ]
}
```

Electron counts for these: H₂O = 1 + 6 + 1 = 8; NH₄⁺ = 5 + 4 − 1 = 8; NO₃⁻ = 5 + 18 + 1 = 24.

#### Brackets and charges (`studentCharges`, teacher graded)

Add `"studentCharges": true` to a `structure` question when students must also draw **brackets**, the **overall charge** and **per-atom formal charges**. Such a question is **teacher graded**: it scores 0 until the teacher grades it, and `correctAnswer` becomes the reference answer the teacher sees. Without `studentCharges` (the default `false`) the question behaves exactly as before and is auto graded.

- With `studentCharges` on, the skeleton's `charge` is not pre-drawn as brackets (the student draws them), but it still sets the valence-electron total, so keep it correct. The electron check above still applies.
- `correctAnswer` gains three fields (single object only, no resonance array):
  - `bracket`: `true` if the structure should be enclosed in brackets (polyatomic ions).
  - `charge`: overall charge, whole number from −4 to 4 (`-1` for NO₃⁻). Use `0` when there is none.
  - `formalCharges`: `{ atomId: charge }` for atoms with a non-zero formal charge, each −4 to 4. Atoms you leave out count as 0.
- Because grading is by the teacher, the answer is not compared automatically; make `explanation` say how formal charges were found.

```json
{
  "id": "no3", "type": "structure", "points": 4, "studentCharges": true, "charge": -1,
  "text": "Draw the Lewis structure of the nitrate ion, $\\ce{NO3-}$, with brackets, the overall charge and formal charges.",
  "atoms": [
    { "id": "n", "symbol": "N", "x": 1, "y": 1 },
    { "id": "o1", "symbol": "O", "x": 1, "y": 0 },
    { "id": "o2", "symbol": "O", "x": 0, "y": 2 },
    { "id": "o3", "symbol": "O", "x": 2, "y": 2 }
  ],
  "bonds": [["n", "o1"], ["n", "o2"], ["n", "o3"]],
  "correctAnswer": {
    "bonds": [2, 1, 1],
    "lonePairs": { "n": 0, "o1": 2, "o2": 3, "o3": 3 },
    "bracket": true,
    "charge": -1,
    "formalCharges": { "n": 1, "o2": -1, "o3": -1 }
  },
  "explanation": "24 valence electrons. N is +1, each single-bonded O is -1; overall 1-."
}
```

### 11. `short`: short answer / open-ended (teacher graded)

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

### 12. `open`: open response with a rubric (teacher graded)

```json
{
  "id": "q15",
  "type": "open",
  "text": "Explain, using particles and forces, why sodium chloride has a much higher melting point than water.",
  "points": 6,
  "minWords": 60,
  "maxWords": 200,
  "showRubric": true,
  "rubric": [
    { "text": "NaCl is held together by ionic bonds (attraction between Na⁺ and Cl⁻ ions) in a lattice", "points": 2 },
    { "text": "Water molecules are held together by intermolecular forces (hydrogen bonds)", "points": 2 },
    { "text": "Ionic bonds are much stronger, so more energy is needed to separate the particles", "points": 2 }
  ],
  "sampleAnswer": "In NaCl, every Na⁺ ion is attracted to the surrounding Cl⁻ ions…"
}
```

- Use `open` for multi-sentence explanations, CER (claim-evidence-reasoning) responses and lab conclusions. Use `short` for a sentence or two.
- Never auto-graded; it scores 0 until the teacher grades it in the **Grading** tab, where each rubric criterion is a checkbox that fills in the points.
- `rubric` (optional, recommended): `[{ "text", "points" }]`. The points **must add up to the question's `points`**.
- `showRubric` (default `true`): students see the criteria above the answer box. Set `false` to hide them.
- `minWords` / `maxWords` (optional whole numbers): shown as a target ("aim for 60–200 words"); not enforced.
- `sampleAnswer` (optional): model answer for the teacher; shown to students in the review only if `showCorrectAnswers` is on.

### 13. `orbital`: energy orbital diagram (teacher graded)

Students get an empty orbital diagram (one box per orbital, grouped by sublevel, lowest energy first) and click or tap each box to place spin-up, spin-down or paired arrows. Spin is shown by arrow direction and the box label, never by colour alone.

```json
{
  "id": "orbN",
  "type": "orbital",
  "text": "Draw the orbital diagram for a ground-state nitrogen atom.",
  "points": 3,
  "maxSublevel": "2p",
  "orbitalTypes": ["s", "p"],
  "sampleAnswer": { "1s": ["ud"], "2s": ["ud"], "2p": ["u", "u", "u"] },
  "explanation": "Nitrogen has 7 electrons: 1s2 2s2 2p3. By Hund's rule the three 2p electrons sit in separate orbitals with parallel spins."
}
```

- **Teacher graded**: no `correctAnswer`; it scores 0 until the teacher grades it in the **Grading** tab.
- `maxSublevel` (default `"2p"`): the highest sublevel shown. Sublevels are listed in **Aufbau order**: `1s 2s 2p 3s 3p 4s 3d 4p 5s 4d 5p 6s 4f 5d 6p 7s 5f 6d 7p`. Everything up to and including `maxSublevel` (in that order) is shown, filtered by `orbitalTypes`.
- `orbitalTypes` (default `["s","p"]`): which sublevel types to include, any subset of `s`, `p`, `d`, `f`. Include every type up to the highest one you need (for iron, `3d` needs `["s","p","d"]`).
- `sampleAnswer` (optional, recommended): the reference diagram the teacher sees while grading. An object keyed by sublevel, each value an array with **one entry per orbital box** (s = 1, p = 3, d = 5, f = 7): `""` empty, `"u"` one up arrow, `"d"` one down arrow, `"ud"` a pair. Example iron 3d: `["ud","u","u","u","u"]`. It is shown to students in the review only if `showCorrectAnswers` is on.
- Set `points` to reflect the work (for example 1 point per correctly filled sublevel).

---

### 14. `balance`: balance the equation

Students type a whole-number coefficient into a box in front of every formula (`_ H2 + _ O2 → _ H2O`). Formulas are shown with subscripts and charges.

```json
{
  "id": "bal1",
  "type": "balance",
  "text": "Balance the equation for the formation of water.",
  "points": 2,
  "reactants": ["H2", "O2"],
  "products": ["H2O"],
  "coefficients": [2, 1, 2],
  "allowMultiples": false,
  "partialCredit": false
}
```

- `reactants` and `products`: non-empty lists of formulas, written like `formula` answers (`Fe^3+`, `Ca(OH)2`).
- `coefficients`: positive whole numbers, one per formula, **reactants first and then products** (so the length is `reactants` + `products`). A coefficient of 1 must still be listed.
- `allowMultiples` (default `false`): when `true`, any whole-number multiple of the lowest ratio is also correct (`[4, 2, 4]` for `[2, 1, 2]`). When `false`, only `coefficients` is correct.
- `partialCredit` (default `false`): credit is the fraction of boxes that match.
- The student's answer is stored as a list of numbers (a blank box is `0`).

### 15. `econfig`: electron configuration

Students type a configuration such as `1s2 2s2 2p6 3s1` or the noble-gas shorthand `[Ne] 3s1`. A live preview shows the electron counts as superscripts.

```json
{
  "id": "ec1",
  "type": "econfig",
  "text": "Write the ground-state electron configuration of sodium.",
  "points": 2,
  "answers": ["1s2 2s2 2p6 3s1", "[Ne] 3s1"]
}
```

- `answers`: one or more accepted configurations. A student's answer is correct if it matches **any** of them.
- Spacing, order of the subshells, `^` or superscript digits (`2p^6`, `2p⁶`), upper or lower-case subshell letters and noble-gas cores (`[He]`, `[Ne]`, `[Ar]`, `[Kr]`, `[Xe]`, `[Rn]`) are all normalized before comparing, so `[Ar] 4s1 3d5` equals `1s2 2s2 2p6 3s2 3p6 3d5 4s1`.
- List exceptions (Cr, Cu and others) simply by giving the accepted configuration(s) in `answers`.
- Separate subshells with spaces when typing without superscripts (`1s2 2s2`).

### 16. `ptable`: pick elements on the periodic table

Students click one or more elements on a periodic table. Every element is a real button with its name as the accessible label.

```json
{
  "id": "pt1",
  "type": "ptable",
  "text": "Click the alkali metals in periods 3 and 4.",
  "points": 2,
  "answers": ["Na", "K"],
  "multiple": true,
  "partialCredit": true
}
```

- `answers`: element symbols (`"Na"`, `"Fe"`), no duplicates.
- `multiple` (default `true`): `false` makes it single select and needs exactly one answer.
- Graded like `multi`: all and only the answers is correct. `partialCredit` (default `false`) gives `(right - wrong) / answers` of the points.

### 17. `sigfigs`: significant figures

Students type a number (scientific notation such as `4.50e-3` or `4.50 × 10^-3` is accepted). It is correct when the **value** is within `tolerance` and the number of **significant figures they wrote** equals `sigFigs`.

```json
{
  "id": "sf1",
  "type": "sigfigs",
  "text": "Write 0.00450 g in scientific notation with the correct number of significant figures.",
  "points": 2,
  "answer": 0.0045,
  "sigFigs": 3,
  "tolerance": 0.000001,
  "partialCredit": true
}
```

- `answer`: the correct number. `sigFigs`: whole number from 1 to 15. `tolerance` (default `0`): absolute (plus or minus).
- `partialCredit` (default `true`): half the points for the right value, half for the right number of significant figures.
- Counting rules: leading zeros never count; zeros after a decimal point count (`0.00450` has 3); trailing zeros of a whole number with no decimal point are **not** significant (`1500` has 2, `1500.` has 4). Use scientific notation to be exact: `1.50e3` has 3.
- The student's raw text is kept as the answer.

### 18. `categorize`: sort into groups

Students put every item into one of the groups. Each item card has a menu (so it works with keyboard, touch and screen readers); mouse users can also drag a card onto a group.

```json
{
  "id": "cat1",
  "type": "categorize",
  "text": "Sort each substance by the type of bonding it has.",
  "points": 3,
  "categories": [
    { "id": "ionic", "label": "Ionic" },
    { "id": "covalent", "label": "Covalent" },
    { "id": "metallic", "label": "Metallic" }
  ],
  "items": [
    { "id": "i1", "text": "NaCl", "category": "ionic" },
    { "id": "i2", "text": "H2O", "category": "covalent" },
    { "id": "i3", "text": "Cu", "category": "metallic" }
  ],
  "partialCredit": true
}
```

- At least 2 `categories` and 1 `items`; each item's `category` must be one of the category ids. Ids must be unique within the question.
- All items correct = full points. `partialCredit` (default `true`) gives the fraction of items in the right group.
- With the test option `shuffleOptions` the item order is shuffled per student.

### 19. `hotspot`: label the diagram

The student selects a label, then clicks or taps where it belongs on the picture. Keyboard: select a label, use the arrow keys to move a crosshair (Shift = bigger steps) and press Enter to place it.

```json
{
  "id": "hot1",
  "type": "hotspot",
  "text": "Place each label on the lab equipment.",
  "points": 3,
  "image": { "url": "data/tests/lab-bench.svg", "alt": "A lab bench with a beaker, a flask and a burner" },
  "labels": [
    { "id": "a", "text": "Beaker", "x": 0.25, "y": 0.58 },
    { "id": "b", "text": "Flask", "x": 0.6, "y": 0.63 }
  ],
  "radius": 0.1,
  "partialCredit": true
}
```

- `image` (required) is the diagram; it must have `alt` text. In the builder this is the question's **Image** field.
- `x` and `y` are fractions of the picture (0 to 1; `x` of the width, `y` of the height). `radius` (default `0.06`) is how far from the target a label may be, as a fraction of the image width; on a non-square picture the accepted area is slightly oval.
- A label is correct when it is within `radius` of its target. `partialCredit` (default `true`) gives the fraction of labels placed correctly.
- Builder: select a label in the list, then click the preview picture to set its spot, or type `x` / `y`.

### 20. `graph`: read or plot a graph

`mode: "read"` draws a chart (inline SVG) and the student types a number. `mode: "plot"` shows an empty grid; the student clicks to add points and clicks a point to remove it. Keyboard: arrow keys move a crosshair, Enter adds or removes a point.

```json
{
  "id": "gr1",
  "type": "graph",
  "mode": "read",
  "text": "What is the temperature after 4 minutes?",
  "points": 2,
  "chart": {
    "xLabel": "Time (min)", "yLabel": "Temperature (°C)",
    "xMin": 0, "xMax": 10, "yMin": 0, "yMax": 100,
    "series": [{ "points": [[0, 20], [2, 40], [4, 60], [6, 80], [8, 100]] }]
  },
  "answer": 60,
  "tolerance": 3,
  "unit": "°C"
}
```

```json
{
  "id": "gr2",
  "type": "graph",
  "mode": "plot",
  "text": "Plot the points (1, 20), (3, 50) and (5, 80).",
  "points": 3,
  "chart": { "xLabel": "Time (min)", "yLabel": "Temperature (°C)", "xMin": 0, "xMax": 6, "yMin": 0, "yMax": 100, "series": [] },
  "targets": [[1, 20], [3, 50], [5, 80]],
  "toleranceX": 0.3,
  "toleranceY": 5,
  "partialCredit": true
}
```

- `chart` needs `xMin < xMax` and `yMin < yMax`. In `read` mode at least one series with points is required; in `plot` mode `series` is not shown to students (use `[]`).
- `read`: `answer` and `tolerance` (absolute, default `0`) are graded like `numeric`; `unit` is optional.
- `plot`: correct when every target has a placed point within the `toleranceX` / `toleranceY` box and the student placed no more points than there are targets. `partialCredit` gives the fraction of targets hit.

---

## Writing chemistry and math

All formatting is **LaTeX rendered with KaTeX** (plus the mhchem extension for chemistry). Questions and the Resources tab use exactly the same rules. There is no Markdown or HTML: `**bold**`, `<b>` and `<br>` show up as literal characters.

### Where formatting works

| Formatted (math between `$…$` is rendered) | Plain text only (math is **not** rendered) |
|---|---|
| Question `text` (including `fillblank` text around the `{{blanks}}`) | `title`, `description` of the test |
| `options[].text` (`mcq`, `multi`) | Section `title` and reference `title` |
| `left[].text` and `right[].text` (`matching`) | `correctAnswer` of `formula`, `numeric`, `truefalse` |
| `items[].text` (`ordering`) | `blanks[].answers` and `distractors` (`fillblank`) |
| `explanation` | `sampleAnswer` of `short` / `open` (shown as written) |
| `rubric[].text` (`open`) | `element`, atom `symbol`s, `unit` of a `numeric` question |
| Section `instructions` | Image `alt` text |
| Resources `items[].name`, `items[].value`, `items[].unit` | |
| `text` reference `content` | |

Line breaks (`\n`) are kept in section `instructions` and `text` reference `content` (`\n\n` = new paragraph). In question text, options and Resources cells a `\n` becomes a space; use `$$…$$` for a displayed equation on its own line.

### Delimiters

| Delimiter | Use |
|---|---|
| `$…$` or `\\(…\\)` | Inline math inside a sentence or table cell |
| `$$…$$` or `\\[…\\]` | Displayed (centered, own line) equation |

### Cookbook

| You want | Write in JSON |
|---|---|
| H₂SO₄ | `"$\\ce{H2SO4}$"` |
| Hydrate CuSO₄·5H₂O | `"$\\ce{CuSO4*5H2O}$"` or `"$\\ce{CuSO4·5H2O}$"` |
| Ion SO₄²⁻ / Na⁺ | `"$\\ce{SO4^2-}$"`, `"$\\ce{Na+}$"` |
| States | `"$\\ce{NaCl(aq)}$"`, `"$\\ce{H2O(l)}$"` |
| Reaction arrow | `"$\\ce{2H2 + O2 -> 2H2O}$"` |
| Equilibrium | `"$\\ce{N2 + 3H2 <=> 2NH3}$"` |
| Arrow with condition | `"$\\ce{A ->[\\Delta] B}$"` |
| Isotope | `"$\\ce{^{14}_{6}C}$"` |
| Scientific notation | `"$6.02 \\times 10^{23}$"` |
| Superscript / subscript | `"$10^{-3}$"`, `"$K_a$"`, `"$K_{sp}$"` |
| Fraction | `"$\\frac{n}{V}$"` |
| Units in math | `"$\\text{J/(mol·K)}$"`, `"$\\frac{\\text{L·atm}}{\\text{mol·K}}$"`, `"mol$^{-1}$"` |
| Physical quantity (mhchem) | `"$\\pu{25 ^\\circ C}$"`, `"$\\pu{8.31 J mol-1 K-1}$"` or just `"25 °C"` |
| Greek / symbols | `"$\\Delta H$"`, `"$\\lambda$"`, `"$\\pm$"`, `"$\\approx$"`, `"$\\rightarrow$"` |
| Square root / log | `"$\\sqrt{K_a C}$"`, `"$\\text{pH} = -\\log[\\ce{H+}]$"` |
| Bold or italic word | `"$\\textbf{not}$"`, `"$\\textit{exactly}$"` (inside math) |
| Displayed equation | `"$$PV = nRT$$"` |

### Rules

- **Every backslash in JSON is doubled:** `\\ce`, `\\times`, `\\frac`, `\\text`. A single `\` breaks the JSON or the math.
- Typed Unicode is fine: `°`, `·`, `×`, `−`, `→`, `²`, Greek letters, both in plain text and inside `$…$` (including inside `\\text{…}`).
- Use `\\text{…}` for words or units inside math (otherwise letters render in italics and spaces are dropped).
- Don't put a literal `$` in text (it starts math); write "dollars" instead.
- Every `$` must be closed; an unclosed `$` shows as raw text. Unknown commands show in red: test in **Preview** before publishing.
- Answers students type are plain text: `formula` keys are `"H2SO4"` (not `"$\\ce{H2SO4}$"`), `numeric` keys are numbers, and `fillblank` answers are plain strings.

### Formatting the Resources tab

Each row of a `resources` reference is one line in the student's table, and **all three cells use the formatting above**:

```json
{ "id": "res", "type": "resources", "title": "Resources", "items": [
  { "name": "Avogadro's number", "value": "$6.02 \\times 10^{23}$", "unit": "mol$^{-1}$" },
  { "name": "Ideal gas constant, $R$", "value": "$0.0821$", "unit": "$\\frac{\\text{L·atm}}{\\text{mol·K}}$" },
  { "name": "Molar mass of $\\ce{H2O}$", "value": "18.02", "unit": "g/mol" },
  { "name": "Ion product of water, $K_w$", "value": "$1.0 \\times 10^{-14}$", "unit": "" },
  { "name": "Specific heat of water", "value": "4.18", "unit": "J/(g·°C)" }
] }
```

- `name`: what the value is; may include a symbol (`$R$`, `$K_w$`) or a formula (`$\\ce{H2O}$`).
- `value`: the number exactly as the class uses it. Plain numbers (`"22.4"`) show in a monospace font; powers of ten need math (`"$6.02 \\times 10^{23}$"`).
- `unit`: plain text (`"L/mol"`, `"J/(g·°C)"`) or math for superscripts and fractions (`"mol$^{-1}$"`). Use `""` when there is no unit.
- For a formula sheet (several equations), use a `text` reference instead: `{ "id": "eq", "type": "text", "title": "Equations", "content": "$$PV = nRT$$\n\n$$M_1V_1 = M_2V_2$$" }`.

### Instructor comments (not written in test JSON)

Comments a teacher adds while grading use a different, small Markdown subset (`**bold**`, `*italic*`, `- ` / `1. ` lists, `[text](https://…)` links) and no math. They are not part of the test JSON.

---

## Quality checklist for the AI

Before outputting, check:

- [ ] Every `id` is unique; every `correctAnswer` refers to ids that exist.
- [ ] `numeric` answers are numbers with a sensible `tolerance`; constants and given values are stated in the question.
- [ ] `mcq` distractors are plausible and reflect real misconceptions; exactly one option is correct.
- [ ] `multi` questions say "Select ALL that apply".
- [ ] Each auto-graded question has a short `explanation`.
- [ ] `lewis` questions use a valid element symbol; non-main-group elements give `correctAnswer` explicitly.
- [ ] `structure` questions: one bond order per skeleton bond in the same order; lone pairs are **pairs**; electrons add up to (valence total − charge); every resonance form is listed when the question accepts more than one.
- [ ] `fillblank` questions: every `{{id}}` appears once in `text` and has a blank; formula blanks use `"kind": "formula"`, number blanks `"kind": "number"`.
- [ ] `ordering` `correctAnswer` lists every item id once, first = top, and the text says which direction.
- [ ] Ion formulas are written with the charge (`SO4^2-`, `NH4^+`); the app tells students how to type charges and exponents automatically, so don't add typing instructions to `text`.
- [ ] `short` questions have a `sampleAnswer` / rubric and appropriate `points`; `open` rubric points add up to the question's `points`.
- [ ] Chemistry is correct: balanced equations, correct charges, significant figures.
- [ ] Backslashes are doubled and the output is valid JSON.

---

## Complete example

A complete, valid test using every type (copy this as a template):

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
      "type": "lewis",
      "text": "Draw the Lewis dot diagram for nitrogen.",
      "points": 2,
      "element": "N",
      "correctAnswer": 5,
      "explanation": "Nitrogen (group 15) has 5 valence electrons: one dot on each side, then one pair."
    },
    {
      "id": "q8",
      "type": "short",
      "text": "Explain why increasing temperature increases the rate of a reaction.",
      "points": 4,
      "sampleAnswer": "Particles move faster, so they collide more often, and a larger fraction of collisions have energy at least equal to the activation energy. Rubric: 2 pts collision frequency, 2 pts activation energy."
    },
    {
      "id": "q9",
      "type": "ordering",
      "text": "Arrange from smallest to largest atomic radius.",
      "points": 3,
      "topLabel": "Smallest",
      "bottomLabel": "Largest",
      "items": [
        { "id": "f", "text": "F" },
        { "id": "c", "text": "C" },
        { "id": "li", "text": "Li" },
        { "id": "k", "text": "K" }
      ],
      "correctAnswer": ["f", "c", "li", "k"],
      "explanation": "Radius decreases across a period and increases down a group."
    },
    {
      "id": "q10",
      "type": "fillblank",
      "text": "Calcium loses two electrons to form the ion {{b1}}. The bond between Ca and O in CaO is {{b2}}.",
      "points": 2,
      "blanks": [
        { "id": "b1", "answers": ["Ca^2+"], "kind": "formula" },
        { "id": "b2", "answers": ["ionic"], "kind": "text" }
      ],
      "explanation": "Group 2 metals form 2+ ions; metal + nonmetal gives an ionic bond."
    },
    {
      "id": "q11",
      "type": "structure",
      "text": "Draw the Lewis structure of carbon dioxide, $\\ce{CO2}$.",
      "points": 3,
      "atoms": [
        { "id": "o1", "symbol": "O", "x": 0, "y": 0 },
        { "id": "c", "symbol": "C", "x": 1, "y": 0 },
        { "id": "o2", "symbol": "O", "x": 2, "y": 0 }
      ],
      "bonds": [["o1", "c"], ["c", "o2"]],
      "correctAnswer": { "bonds": [2, 2], "lonePairs": { "o1": 2, "c": 0, "o2": 2 } },
      "explanation": "16 valence electrons: two C=O double bonds, two lone pairs on each O."
    },
    {
      "id": "q12",
      "type": "open",
      "text": "Use the Lewis structure of CO2 to explain why the molecule is linear.",
      "points": 4,
      "minWords": 30,
      "rubric": [
        { "text": "Carbon has two electron domains (two double bonds)", "points": 2 },
        { "text": "No lone pairs on carbon, so the domains are 180° apart", "points": 2 }
      ]
    }
  ]
}
```

---

## Complete v2 example (sections, references, orbital, charges)

A shorter test using the v2 features. Note the canonical order: the unsectioned question first, then Part A, then Part B.

```json
{
  "code": "CHEM-V2-DEMO",
  "title": "Electrons & Bonding (v2 sample)",
  "description": "Sections, references, orbital diagrams and Lewis structures with charges.",
  "showResults": true,
  "showCorrectAnswers": true,
  "sections": [
    {
      "id": "secA",
      "title": "Part A: Electron configuration",
      "instructions": "Use the periodic table in the reference pane."
    },
    {
      "id": "secB",
      "title": "Part B: Bonding",
      "instructions": "Draw complete Lewis structures, including **brackets** and charges for ions."
    }
  ],
  "references": [
    {
      "id": "pt",
      "type": "periodic-table",
      "title": ""
    },
    {
      "id": "res",
      "type": "resources",
      "title": "Resources",
      "items": [
        { "name": "Avogadro's number", "value": "$6.02 \\times 10^{23}$", "unit": "mol$^{-1}$" },
        { "name": "Ideal gas constant, R", "value": "8.31", "unit": "J/(mol·K)" }
      ]
    }
  ],
  "questions": [
    {
      "id": "warm",
      "type": "mcq",
      "text": "Which particle has a negative charge?",
      "points": 1,
      "options": [
        {
          "id": "a",
          "text": "Proton"
        },
        {
          "id": "b",
          "text": "Electron"
        },
        {
          "id": "c",
          "text": "Neutron"
        }
      ],
      "correctAnswer": "b",
      "explanation": "Electrons carry a negative charge; protons are positive and neutrons are neutral."
    },
    {
      "id": "orbN",
      "section": "secA",
      "type": "orbital",
      "text": "Draw the orbital diagram for a ground-state nitrogen atom.",
      "points": 3,
      "maxSublevel": "2p",
      "orbitalTypes": [
        "s",
        "p"
      ],
      "sampleAnswer": {
        "1s": [
          "ud"
        ],
        "2s": [
          "ud"
        ],
        "2p": [
          "u",
          "u",
          "u"
        ]
      },
      "explanation": "Nitrogen has 7 electrons: 1s² 2s² 2p³. By Hund’s rule the three 2p electrons occupy separate orbitals with parallel spins."
    },
    {
      "id": "config",
      "section": "secA",
      "type": "short",
      "text": "Write the electron configuration of sodium.",
      "points": 1,
      "sampleAnswer": "1s2 2s2 2p6 3s1",
      "explanation": "Sodium has 11 electrons: 1s² 2s² 2p⁶ 3s¹."
    },
    {
      "id": "no3",
      "section": "secB",
      "type": "structure",
      "points": 4,
      "studentCharges": true,
      "text": "Draw the Lewis structure of the nitrate ion, $\\ce{NO3-}$, with brackets, the overall charge and formal charges.",
      "atoms": [
        {
          "id": "n",
          "symbol": "N",
          "x": 1,
          "y": 1
        },
        {
          "id": "o1",
          "symbol": "O",
          "x": 1,
          "y": 0
        },
        {
          "id": "o2",
          "symbol": "O",
          "x": 0,
          "y": 2
        },
        {
          "id": "o3",
          "symbol": "O",
          "x": 2,
          "y": 2
        }
      ],
      "bonds": [
        [
          "n",
          "o1"
        ],
        [
          "n",
          "o2"
        ],
        [
          "n",
          "o3"
        ]
      ],
      "charge": -1,
      "correctAnswer": {
        "bonds": [
          2,
          1,
          1
        ],
        "lonePairs": {
          "n": 0,
          "o1": 2,
          "o2": 3,
          "o3": 3
        },
        "bracket": true,
        "charge": -1,
        "formalCharges": {
          "n": 1,
          "o2": -1,
          "o3": -1
        }
      },
      "explanation": "Nitrate has 24 valence electrons. One N=O double bond and two N–O single bonds give N a formal charge of +1 and each single-bonded O −1; the ion carries an overall 1− charge shown outside brackets. Three resonance forms exist."
    },
    {
      "id": "co2",
      "section": "secB",
      "type": "structure",
      "points": 2,
      "text": "Draw the Lewis structure of carbon dioxide, $\\ce{CO2}$.",
      "atoms": [
        {
          "id": "o1",
          "symbol": "O",
          "x": 0,
          "y": 0
        },
        {
          "id": "c",
          "symbol": "C",
          "x": 1,
          "y": 0
        },
        {
          "id": "o2",
          "symbol": "O",
          "x": 2,
          "y": 0
        }
      ],
      "bonds": [
        [
          "o1",
          "c"
        ],
        [
          "c",
          "o2"
        ]
      ],
      "correctAnswer": {
        "bonds": [
          2,
          2
        ],
        "lonePairs": {
          "o1": 2,
          "c": 0,
          "o2": 2
        }
      },
      "explanation": "CO₂ has 16 valence electrons: two C=O double bonds and two lone pairs on each oxygen give every atom an octet and zero formal charge."
    }
  ]
}
```

---

## Updating an existing test

**Get the current JSON first.** Ask the teacher for it if you don't have it. In the app: admin **Library** → **Edit in builder** on the test → switch the builder to **JSON** mode → copy everything (or click **Download JSON**). For a bundled test it is the file `data/tests/<CODE>.json`.

**Apply the update.** Builder → **JSON** mode → replace everything with your JSON → **Apply JSON** → check **Ready to publish ✓** → **Publish to Sheet**. Publishing with the **same `code` replaces** the published test; students who open it afterwards get the new version. For a bundled test, overwrite `data/tests/<CODE>.json` and run `npm run validate:tests`.

The app always imports a **whole test**, so every update outputs the complete JSON, never a fragment.

### A. Update only the Resources tab

Use this when the teacher asks to add, change or remove constants/values (e.g. "use 6.02 × 10²³ for Avogadro's number", "add the specific heat of water", "remove R in J/(mol·K)").

1. Find the entry in `references` whose `type` is `"resources"`. (Older tests may say `"constants"`: change it to `"resources"`. If the values are in a `"text"` reference titled Constants, convert them to a `resources` entry with one row per value and remove the text entry.) If there is none, add `{ "id": "res", "type": "resources", "title": "Resources", "items": [] }` after the periodic table (or first).
2. Edit only its `items` (and `title` if asked). Each row: `{ "name": "…", "value": "…", "unit": "…" }`. Write the value **exactly** as the teacher wants students to see it; keep their rounding. Use math for powers: `"$6.02 \\times 10^{23}$"`, units like `"mol$^{-1}$"` or plain `"L·atm/(mol·K)"`. Keep the order the teacher gives (otherwise: most-used first). At least one row must remain.
3. **Change nothing else.** Copy every other field (`code`, questions, ids, answers, points, sections, settings, other references) unchanged. The periodic table cannot be edited (it is built in); only add or remove it.
4. Output the whole test JSON, then list the rows you added, changed or removed.

Before/after example (only the `resources` entry changes):

```json
{ "id": "res", "type": "resources", "title": "Resources", "items": [
  { "name": "Avogadro's number", "value": "$6.02 \\times 10^{23}$", "unit": "mol$^{-1}$" },
  { "name": "Specific heat of water", "value": "4.18", "unit": "J/(g·°C)" }
] }
```

### B. Update the whole test

Use this for any other change: rewrite or add questions, fix answer keys, change points, add sections, change settings, or add resources at the same time.

1. **Keep the `code`** unless the teacher asks for a new test. (A new code creates a separate test; the old one stays.)
2. **Keep the `id` of every question you keep**, even if you rewrite its text. Submitted answers and grades are stored by question id; changing an id makes past submissions lose their link to that question. Give new questions new ids that were never used in this test (`q11`, `q12`, …), and never reuse a deleted question's id.
3. Keep option / item / blank / atom ids stable when only wording changes; if you change which option is correct, update `correctAnswer` to match.
4. Keep everything the teacher did not ask to change (settings, sections, references, explanations). When you move questions between sections, change only each question's `"section"`; the app orders questions automatically (unsectioned first, then by section order).
5. Re-check every rule in [Quick rules](#quick-rules) and the [Quality checklist](#quality-checklist-for-the-ai), including that `open` rubric points add up to the question's `points`, `structure` keys use the right number of electrons, and every `section` id exists.
6. Changes apply to new attempts only. Tell the teacher if a change affects students who already submitted (for example a corrected answer key: those submissions keep their old auto score, which the teacher can override in **Grading**).
7. Output the whole test JSON, then a bullet list of changes grouped by question id (`q3: fixed answer key`, `q12: new`, `q5: deleted`, `Resources: …`).

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

### Grading tests with `short` / `open` questions or hidden scores

After students submit, open the admin **Grading** tab (it needs the admin key in **Settings**). Filter by **Needs grading**, open each submission, tick rubric criteria (for `open` questions) or enter points for open-ended answers (and override any auto-graded points if needed), and click **Save & next**. **Export grades** downloads a CSV of final scores (name, email, score, percent) to copy into Aeries or Google Classroom.

v2 additions to the grader: the **Full / Half / Zero** buttons set 100%, 50% or 0% of a question's points in one click, or type any score from 0 up to the question's points (negative, too-high or non-numeric entries are rejected with a message). Scores can be fractional (for example 1.5). Auto-graded questions keep their automatic score as the default; a different score is saved as an **override** and labelled with the automatic score. Orbital diagrams and `structure` questions with `studentCharges` are teacher graded like `short` and `open`.

To give feedback, add a **comment** to any question (supports `**bold**`, `*italic*`, `- ` and `1. ` lists and `[text](https://…)` links; empty comments are not saved). Comments are private until you tick **Release grade & comments to student** and save. After release, students see their score and your comments under **Your submitted tests > View feedback**. **Export PDF** (in an open submission) prints one student's reviewed submission, including correct answers and your comments (released or not), with math typeset. Each question is kept whole on one page, and the PDF has no browser header or footer.

### Released feedback, one submission per student and retakes (v3)

- **Students see released feedback from the test link, on any device.** After you release a grade (tick **Release grade & comments to student**, or **Release all graded** for a whole test), the student opens the same test link, signs in with Google, and sees the full review: score, every question, their answer (with diagrams and images), the correct answer (if *Show correct answers* is on), points per question, your comments and "Graded by". **Download PDF** gives them the same document as your export. Un-release it and it disappears on their next visit.
- **Before release**, the student sees "You submitted this test on … Your teacher hasn't released grades yet." For normal tests there is a **Take again** button; for one-submission tests there isn't.
- **One submission per student:** turn on **One submission per student** in the builder settings (or `"singleSubmission": true`). The library shows a **1 attempt** tag. A blocked student can still practice in **Game mode** if it is on. If a student forces a second submission (for example two tabs), it is saved as **Extra attempt**: kept for your records, not counted, and not shown to the student. See it with the **Extra attempts** status filter.
- **Allow retake:** open the student's submission in **Grading** and click **Allow retake**. That student can submit once more; their earlier feedback stays viewable.
- These features need the v3 Apps Script with the `GOOGLE_CLIENT_ID` script property (see DEPLOYMENT.md, "Upgrading to v3"). Without it, the app keeps the v2.5 behavior.

---

Full technical reference (schema, scoring rules, module contracts): [ARCHITECTURE.md](ARCHITECTURE.md).

## v4 additions

Everything below is new in ChemistryWorks v4. Fields are optional; old tests keep working unchanged.

### multipart
```json
{ "id": "q1", "type": "multipart", "text": "Sodium reacts with water.", "stem": "Sodium is dropped into water.", "points": 3,
  "parts": [
    { "id": "a", "type": "mcq", "text": "Which gas is released?", "points": 1, "options": [{"id":"a","text":"Oxygen"},{"id":"b","text":"Hydrogen"}], "correctAnswer": "b" },
    { "id": "b", "type": "numeric", "text": "Moles of H2 from 4 mol Na?", "points": 2, "correctAnswer": 2, "tolerance": 0, "toleranceType": "absolute", "unit": "mol" } ] }
```
One shared stem followed by parts (a), (b), (c), each a full question of any auto-graded type (not short, open, orbital or multipart). Students answer each part with that type's normal widget. The score is the points earned across the parts divided by the points available, so a student who gets (a) right and (b) wrong keeps credit for (a); the question is "correct" only when every part is. The question's points are always the sum of the parts' points. Hints and confidence belong to the whole question.

### naming
```json
{ "id": "q2", "type": "naming", "text": "Name this compound.", "direction": "toName", "prompt": "CuSO4.5H2O", "points": 2,
  "answers": ["copper(II) sulfate pentahydrate"] }
```
Students are given a formula and write the name (`toName`), or are given a name and write the formula (`toFormula`). Names are compared ignoring capitals, spaces, hyphens, "copper (II)" versus "copper(II)", and an optional leading "mono" on the first element. Old-style endings (-ic / -ous) are not converted, so list them as extra accepted answers. Formulas are compared as chemistry (subscripts, hydrate dots, group order) with a live formatted preview.

### dropdown
```json
{ "id": "q4", "type": "dropdown", "text": "Sodium is a [[b1]] and chlorine is a [[b2]].", "points": 2, "partialCredit": true,
  "blanks": [ {"id":"b1","options":["metal","nonmetal"],"answer":"metal"}, {"id":"b2","options":["metal","nonmetal"],"answer":"nonmetal"} ] }
```
A cloze passage where every `[[id]]` becomes a native drop-down menu, labelled "Blank 1 of 2" for screen readers and fully keyboard operable. Each blank lists its options and the correct one. With partial credit on (the default) every correct blank earns its share of the points.

### Extra: confidence ("How sure are you?")
```json
{ "id": "q5", "type": "mcq", "confidence": true, "...": "..." }
```
After a student answers, a Guessing / Fairly sure / Certain row appears on the card. The choice is stored beside the answer (not inside it), sent with the submission, shown to the student in results (with a nudge when they were certain but wrong), and summarised in Insights as the average confidence per question plus the number of "certain but wrong" students, a quick way to spot misconceptions.

### Extra: hint that costs points
```json
{ "id": "q5", "type": "mcq", "points": 2, "hint": { "text": "It orbits the nucleus.", "cost": 1 }, "...": "..." }
```
The card shows "Show hint (−1 pt)". Once revealed, the hint stays visible (even after a reload) and the cost is subtracted from the points earned on that question, never below zero. The cost cannot exceed the question's points. Results show "Hint used (−1 pt)". A cost of 0 gives a free hint.

### Extra: explanation
Every question type, including the new ones, accepts `"explanation"`; it is shown in the results review once results are released.

### Dimensional analysis (`dimensional`, group Chemistry)
```json
{ "id": "q1", "type": "dimensional", "points": 2, "text": "How many moles are in 117 g of NaCl?",
  "given": { "value": 117, "unit": "g" }, "answer": { "value": 2, "unit": "mol" },
  "tolerance": 1, "toleranceType": "percent", "chainCredit": 0.5,
  "factors": [ { "top": { "value": 1, "unit": "mol" }, "bottom": { "value": 58.5, "unit": "g" } } ] }
```
Students see the given quantity, add conversion-factor tiles (numerator and denominator, each a value and a unit), and watch units that cancel get struck through; then they enter the final value and unit. The value must be within the tolerance (percent or absolute) and the unit must match (symbols are case-sensitive, so mL is not ml; g/mol and g mol^-1 are the same). `factors` is your reference chain and is checked for consistency when you save. With `chainCredit` above 0, a student whose chain cancels to the right unit and multiplies out to the right number earns that fraction of the points even if the final entry is wrong.

### Nuclear notation (`nuclear`, Chemistry)
```json
{ "id": "q2", "type": "nuclear", "points": 2, "mode": "equation", "text": "Complete the alpha decay of uranium-238.",
  "left": [ { "A": 238, "Z": 92, "symbol": "U" } ],
  "right": [ { "A": 234, "Z": 90, "symbol": "Th", "missing": true }, { "name": "alpha" } ] }
```
In `isotope` mode (`"isotope": { "A": 14, "Z": 6, "symbol": "C" }`) students fill in the mass number, atomic number and symbol of the isotope you describe. In `equation` mode each particle is either `{A, Z, symbol}` or a named particle (alpha, beta, positron, gamma, neutron, proton); mark the ones students must supply with `"missing": true`. Credit is per blank (symbols are case-insensitive, names like alpha accept He or α), and the editor refuses equations whose mass numbers or atomic numbers do not balance. Students see a live balanced / not balanced note.

### Predict products (`reaction`, Chemistry)
```json
{ "id": "q3", "type": "reaction", "points": 2, "text": "Predict the products.",
  "reactants": "AgNO3(aq) + NaCl(aq)", "products": ["AgCl(s)", "NaNO3(aq)"],
  "requireStates": true, "requireCoefficients": false, "netIonic": false }
```
Students type the product side ("AgCl(s) + NaNO3(aq)") and see a formatted preview. Order does not matter; formulas are compared with the same rules as formula questions. States and coefficients are only checked when you require them. Partial credit is the share of products right, reduced by any invented extra species. `netIonic` only changes the instructions (write ions with charges) and does not alter grading.

### Molecular shape (`vsepr`, Chemistry)
```json
{ "id": "q4", "type": "vsepr", "points": 3, "text": "Describe the shape of ammonia.", "formula": "NH3",
  "electronGeometry": "tetrahedral", "molecularGeometry": "trigonal pyramidal", "bondAngle": "107",
  "fields": ["electron", "molecular", "angle"] }
```
Students choose from picture cards for electron geometry and molecular geometry and from a list of bond angles (180, 120, <120, 109.5, <109.5, 107, 104.5, 90, <90, 90 & 120, <90 & 120). Each field you ask for is worth an equal share; list only some in `fields` to ask for fewer. Fully keyboard operable.

### Complete the table (`datatable`, Basics)
```json
{ "id": "q5", "type": "datatable", "points": 4, "text": "Complete the table.",
  "columns": [ { "id": "species", "label": "Species", "type": "text" }, { "id": "p", "label": "Protons", "type": "number" },
               { "id": "n", "label": "Neutrons", "type": "number", "tolerance": 0 } ],
  "rows": [ { "id": "r1", "cells": { "species": { "value": "Na", "given": true }, "p": { "value": 11, "given": true }, "n": { "value": 12 } } } ] }
```
Cells marked `"given": true` are shown; every other cell is a blank the student fills in, worth an equal share of the points. Number columns accept values within the column `tolerance` (absolute, default 0); text columns ignore case and extra spaces; a text column with `"formula": true` compares chemical formulas. Good for protons/neutrons/electrons tables and ICE tables. It renders as a real table with labelled inputs.

### molarmass, imagechoice, particles, titration, estimate (S10)
See `data/tests/DEMOV4C.json` for a complete example of each.
- **molarmass**: `{ "formula": "Ca(OH)2", "tolerance": 0.05, "toleranceType": "absolute", "showWork": true }` — the student enters the molar mass (optionally with a work table: symbol × count × atomic mass); graded on the final value; the work is shown to the teacher.
- **imagechoice**: like `mcq` / `multi` (`"multiple": true`) but every option has an `image: { url, alt }`. Alt text is required.
- **particles**: `species` (id, label, shape, tone), `zones` (e.g. liquid / gas) and `targets` (`{ zone: { species: count } }`); students place particles by clicking or with the keyboard; graded per species and zone (`partialCredit`).
- **titration**: `analyte: { type: "acid"|"base", kind: "strong"|"weak", conc, volumeMl, K }`, `titrant: { conc }`, `ask: "volume"|"ph"|"both"`, tolerances. Students add titrant (1.00 / 0.10 mL buttons or a slider), watch the curve and record the endpoint.
- **estimate**: a slider with `min`, `max`, `step`, `answer`, `tolerance`.

### Randomized (algorithmic) questions
Add `variables` and an `answerFormula` to a `numeric`, `sigfigs`, `dimensional` or `multipart` question:
```json
{ "id": "q6", "type": "numeric", "text": "How many moles are in {m} g of {c}?", "points": 1, "correctAnswer": 1, "tolerance": 1, "toleranceType": "percent", "unit": "mol",
  "variables": { "m": { "min": 10, "max": 100, "step": 5 }, "c": { "pick": ["NaCl", "KCl"] } }, "answerFormula": "= m / molarMass(c)" }
```
Each student gets their own numbers, the same on every device (seeded by email + test code), and the seed is stored with the submission. Functions: `molarMass`, `moles`, `convert`, `idealGasP`, `idealGasN`, `dilutionC2`, `pH`, `sqrt`, `log`, `ln`, `round`. The builder's "Randomize with variables" panel shows live sample values; **Preview as student** with a fake email shows that student's numbers.

### Test settings (Builder → Test settings → Schedule, classes and tools)
```json
{ "opensAt": "2026-11-10T08:00:00-08:00", "closesAt": "2026-11-12T15:00:00-08:00",
  "late": { "until": "2026-11-14T15:00:00-08:00", "penalty": { "type": "percentPerDay", "value": 10 } },
  "announcement": "Calculators allowed. Show units.", "classes": ["class-…"], "rosterOnly": true,
  "tools": { "calculator": true, "constants": true, "scratchpad": true, "highlighter": true, "readAloud": false },
  "practice": [{ "game": "survival", "target": 2000, "due": "2026-11-20" }],
  "sections": [{ "id": "s1", "title": "Stoichiometry", "pool": { "draw": 3 } }] }
```
- **Window**: before `opensAt` students see "Opens on …"; after `closesAt` (and any late window) the test is closed — checked by the backend, so it cannot be bypassed. Late submissions are marked **Late** and the penalty is applied to the stored score. Give one student more time with **Grading → Extend / accommodations**.
- **Classes / roster only**: create classes under **Classes** (paste emails or import a Google Classroom / Aeries CSV). A roster-only test refuses students who are not on an assigned class (server-side).
- **Pools**: a section with `pool.draw` gives each student that many of its questions, drawn per student and recorded with the submission.
- **Accommodations** (Admin → Accommodations, or from a class roster): extra time (× 1.25–3), extra attempts, one wrong multiple-choice option removed, read-aloud, and an extended deadline. They follow the student to any device.
- **Answer keys are still public** (grading happens in the browser). Pools and randomized numbers make copying harder, not impossible.

### Teacher tools
Insights, grade by question, comment bank, bulk release / retake, print test (A/B), duplicate / Version B, per-question gradebook CSV, **Regrade** (after fixing a key; overrides kept), **Question bank** (shared by all admins, tags, insert copies), **Import** (plain text, CSV, Google Forms) and **templates** per unit, **Live monitor** (who is working, idle or done; refreshes every 30 s), **Mastery** by topic (from question tags, bank tags or section titles) with student profiles, optional **release emails**, **backup / restore** (Settings → Platform).

### Games
`gameOptions` per test: games offered, number of questions, time, lives, power-ups (50/50, Freeze, Skip, Hint), relaxed (untimed) mode, question types, sound, and the optional class **leaderboard** (`"leaderboard": true`, names `"real"` or `"nicknames"`). New games: Tower, Boss Battle, Mistake Review, Unit Dash, Reaction Lab, Molecule Builder, Periodic Puzzle, Daily Element. XP, levels, badges and cosmetics are saved on the student's device. Game scores are computed in the browser and can be faked: the leaderboard is for fun, never for grades.

### Student tools
Per test (`tools`): scientific calculator, units & constants, scratchpad (saved with progress, never submitted), highlighter / strike-out, read-aloud (also an accommodation), flag a question with a note to the teacher (shown in Grading), offline banner, font size and dyslexia-friendly spacing (Settings popover), "My dashboard" on the landing page, and "Review my mistakes" after release (game-mode tests).
