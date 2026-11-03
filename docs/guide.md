# ChemistryWorks Test Authoring Guide (for AI assistants)

This guide is for an AI assistant (or a person) writing a test for ChemistryWorks. Follow it exactly and the output will import into the app without errors.

**Your job:** produce **one JSON object** describing a test. Output only the JSON: no comments, no trailing commas, no Markdown outside a single ```json code block. The teacher then imports it as described in [Importing into ChemistryWorks](#importing-into-chemistryworks).

**When you're done:** always tell the user to save the JSON as `<CODE>.json` and add it to `~/data/tests` (the `data/tests/` folder of the ChemistryWorks repository), along with an entry in `data/tests/index.json`. See [Option B](#option-b-bundle-it-with-the-site-for-repository-maintainers).

---

## Quick rules

1. Output strict JSON: double-quoted keys and strings, no `//` comments, no trailing commas.
2. `code`: 2–32 characters, uppercase letters, digits, `-` or `_` (e.g. `CHEM-U3-QUIZ`). Must be unique among the teacher's tests.
3. Every question needs a unique `id` (letters, digits, `-`, `_`). Use `q1`, `q2`, `q3`, …
4. `type` must be one of: `mcq`, `multi`, `numeric`, `formula`, `truefalse`, `matching`, `ordering`, `fillblank`, `lewis`, `structure`, `short`, `open`, `orbital`.
5. `points` must be a number greater than 0.
6. Option ids (`mcq`, `multi`), item ids (`matching`, `ordering`), blank ids (`fillblank`) and atom ids (`structure`) must be unique **within that question**. Use `a`, `b`, `c`, `d` for options.
7. `correctAnswer` must refer to ids that exist in the question (see each type below).
8. In JSON, a backslash must be written as `\\`. So the math `$\ce{H2O}$` is written `"$\\ce{H2O}$"`.
9. Pick the type that fits the skill being tested (see [Choosing a question type](#choosing-a-question-type)). For bonding, use `structure` (full Lewis structure) rather than describing a structure in words.
10. Optional v2 features: group questions into `sections`, give students a `references` pane (periodic table, text, image), use `orbital` for orbital diagrams and `studentCharges` on `structure` for brackets and charges. See [Sections and references](#sections-and-references-v2), [13. `orbital`](#13-orbital-energy-orbital-diagram-teacher-graded) and [Brackets and charges](#brackets-and-charges-studentcharges-teacher-graded).

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
  { "id": "consts", "type": "text", "title": "Constants", "content": "$R = 8.314$ J/(mol·K)" },
  { "id": "sol", "type": "image", "title": "Solubility chart", "url": "https://example.org/solubility.png", "alt": "Table of solubility rules for common ionic compounds" }
]
```

| `type` | Extra fields | Notes |
|---|---|---|
| `periodic-table` | none | Built-in periodic table. **At most one per test.** `title` may be `""` (it then shows "Periodic table"). |
| `text` | `content` (required) | Formulas, constants or notes. Supports math between `$…$` like question text. Use `\n\n` for a new paragraph. |
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
| `section` | no | Id of a section in the test's `sections`. Omit for an unsectioned question. |

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
      "id": "consts",
      "type": "text",
      "title": "Constants",
      "content": "Avogadro's number: $6.022 \\times 10^{23}$ mol$^{-1}$\n\n$R = 8.314$ J/(mol·K)"
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

To give feedback, add a **comment** to any question (supports `**bold**`, `*italic*`, `- ` and `1. ` lists and `[text](https://…)` links; empty comments are not saved). Comments are private until you tick **Release grade & comments to student** and save. After release, students see their score and your comments under **Your submitted tests > View feedback**. **Export PDF** (in an open submission) prints one student's reviewed submission, with comments included only if the grade is released.

---

Full technical reference (schema, scoring rules, module contracts): [ARCHITECTURE.md](ARCHITECTURE.md).

### Constants reference (V2 patch 1)

Use a `constants` reference for the values your class uses (they are shown exactly as written, so give the classroom value, e.g. 6.02 × 10²³ rather than 6.02214076 × 10²³):

```json
{ "id": "consts", "type": "constants", "title": "Constants", "items": [
  { "name": "Avogadro's number", "value": "$6.02 \\times 10^{23}$", "unit": "mol$^{-1}$" },
  { "name": "Ideal gas constant, R", "value": "0.0821", "unit": "L·atm/(mol·K)" }
] }
```

Every row needs a `name` and a `value`; `unit` is optional. The periodic-table reference always shows the California Standards Test reference-sheet values (e.g. O 16.00, Fe 55.85).
