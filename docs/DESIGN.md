# ChemistryWorks design system: "Lab notebook" (V2-09)

Warm paper surfaces, ink-blue text, faint graph-paper accents, monospace for formulas, numbers and scores,
and a highly legible body face. Everything is driven by custom properties in `css/base.css`; view CSS only
references tokens. `css/print.css` is intentionally excluded (print stays black on white).

## Intensity levels

`js/lib/theme.js` sets `<html data-role="student|admin">` on every view change (and `index.html` sets it
before first paint).

| Level | Applies to | `--texture-strength` | Treatment |
|---|---|---|---|
| Full | `data-role="student"`: landing, results, feedback | `1` | Graph paper on the page background and landing hero, notebook margin rule under the header, paper cards. |
| Toned (runner) | `.runner` (student test screen) | `0.5` | Same paper, grid at half strength in the gutters only; static, no animation. |
| Toned down | `data-role="admin"` (library, builder, grading, settings, previews) | `0` | No grid anywhere, flat solid surfaces, lighter card shadows. At most the decorative margin rule in the header. |
| High contrast | `prefers-contrast: more` | `0` | Texture off, borders use the text colours. |

## Tokens

Light values are the `:root` defaults; dark ("notebook at night") values come from `:root[data-theme="dark"]`.
Contrast of the text tokens and the blue accent is asserted by `test/unit/v2-contrast.test.mjs`.

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--bg` (`--paper`) | `#F6F2E8` | `#1A1713` | Page background (paper) |
| `--bg-elev` | `#FFFDF7` | `#231F19` | Cards, inputs, question cards, reference-pane panels (always solid) |
| `--bg-sunken` | `#EEE8DA` | `#15120F` | Wells, reference pane, table headers, chips |
| `--border` | `#DCD3C0` | `#3A342A` | Hairlines, card edges |
| `--border-strong` | `#C3B79F` | `#50483A` | Hover edges, separators |
| `--border-control` | `#8A8372` | `#7C7565` | Form-control and interactive-diagram boundaries (>= 3:1, WCAG 1.4.11) |
| `--text` (`--ink`) | `#1B2A4A` | `#E6EAF5` | Body text (ink blue) |
| `--text-muted` | `#3F4B66` | `#B4BCD0` | Secondary text |
| `--text-faint` | `#596381` | `#939CB5` | Hints, labels (still >= 4.5:1) |
| `--grid-ink` | `27 42 74` | `230 234 245` | RGB triplet used for grid lines |
| `--grid-line` | ink at 5% x strength | same ink triplet | Minor graph-paper lines |
| `--grid-major` | ink at 10% x strength | same | Every 5th line |
| `--grid-size` | `24px` | `24px` | Graph-paper cell |
| `--margin-rule` | `#C9707A` | `#8F4B53` | Decorative notebook margin line (header bottom edge) |
| `--texture` | composed gradients | composed gradients | Use as `background: var(--texture), var(--bg)` |
| `--texture-strength` | `1` / `0.5` / `0` | same | Intensity multiplier (see levels) |
| `--primary` | `#2348A4` (ink blue) | `#7B9AF5` | Accent: buttons, links, focus, selection |
| `--primary-hover`, `-soft`, `-line`, `-ink`, `-ring` | derived | derived | Accent family |
| `--on-primary` | `#FFFFFF` | `#0E1422` | Text on accent / success / danger fills |
| `--success`, `--danger`, `--warning` (+ `-soft`, `-ink`, `-line`) | AA on paper | lighter | Status fills and text |
| `--toast-bg/-fg/-ok/-err/-warn` | ink / white | paper / ink | Toasts |
| `--font-body` (`--font`) | Atkinson Hyperlegible | same | Body text |
| `--font-display` | Atkinson Hyperlegible (700) | same | Headings, brand name |
| `--font-mono` (`--mono`) | IBM Plex Mono | same | Formulas, numbers, scores, codes |
| `--space-1 … --space-8` | 4, 8, 12, 16, 24, 32, 48, 64 px | same | Spacing scale |
| `--radius-sm/-/-lg/-xl` | 8 / 12 / 18 / 24 px | same | Corners |
| `--shadow-sm/-/-lg` | ink-tinted | black-tinted | Elevation |

Accent palettes (`data-accent`): `blue` (student default, ink blue), `violet` (admin default), `teal`, `green`,
`orange`, `rose`. Light accents are tuned so white text on them is >= 4.5:1; dark accents are lighter and use
dark `--on-primary`.

## Typography scale

Google Fonts: Atkinson Hyperlegible 400/700 + italic 400, IBM Plex Mono 400/500/600 (`display=swap`, system fallbacks).

| Use | Size / weight |
|---|---|
| Body | 16px / 400, line-height 1.55 |
| Question text | 20px / 400 (17px on phones) |
| Page titles (results, feedback) | 26-28px / 700 display |
| Card titles | 22px / 700 |
| Labels, hints, pills | 12-14px / 600-700 |
| Monospace | formulas, formula inputs, numeric inputs, scores/points (`score-points`, `score-percentage`, `results-item__pts`, grading points, `feedback-score`, `submission-count-*`), the timer, periodic-table numbers/masses, orbital sublevel labels, test codes |

## Spacing scale

Use `--space-1 … --space-8` (4, 8, 12, 16, 24, 32, 48, 64 px) in new or edited rules. Admin density must not
increase: padding and row heights in admin tables and lists stay at or below the existing values.

## Texture rules

- Graph paper only on the page background and decorative areas: landing hero, page gutters around the runner,
  empty states.
- Never behind question text, answers, inputs, tables or form fields. Question cards, inputs, reference-pane
  panels and tables are solid `--bg-elev` / `--bg-sunken`. (`.card--glass` is solid on purpose.)
- In the runner the grid is faint (effective alpha <= 0.05) and static: no animation.
- Admin: no texture at all.
- `prefers-reduced-motion` disables animation globally; `prefers-contrast: more` removes texture and
  strengthens borders.
- Because custom properties resolve where they are declared, `--grid-line`, `--grid-major` and `--texture` are
  declared on `:root, .runner`; a new container that sets its own `--texture-strength` must be added to that selector.

## Components

- **Cards** (`.card`, `.q-card`, `.adm-section`): solid `--bg-elev`, 1px `--border`, `--shadow`; admin uses `--shadow-sm`.
- **Buttons**: pill shape; `.btn--primary` (accent fill, `--on-primary` text), `--ghost`, `--subtle`, `--success`, `--danger`. Disabled = 50% opacity.
- **Pills / chips**: soft fill + ink text; status pills always carry text (and an icon where the view provides one).
- **Inputs**: `--bg-elev`, 1.5px `--border-control`, hover darkens, focus adds the accent border and ring plus the global outline. Invalid inputs use a dashed border and are paired with error text.
- **Tables** (`.adm-table`): solid, hairline rows, sticky header on `--bg-elev`.
- **Reference pane**: `--bg-sunken` panel, `--border-strong` 1.5px edge, tabs on `--bg-elev`; periodic table tints are secondary to the symbol, number and legend text.
- **Diagrams**: orbital boxes, Lewis dot buttons and answer-board elements use `--border-control` edges; bonds and atoms get a 2px primary outline/stroke on `:focus-visible`.
- **Navigator tiles**: answered = check glyph, flagged = dashed border + dot, current = filled + underlined number.

## Accessibility rules

- Text contrast >= 4.5:1 for all text tokens on all three surfaces in both themes; interactive boundaries >= 3:1.
- One focus style: `:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px }`, never removed. Hidden-input patterns (radio dots, switches) draw it on the visible sibling.
- No information by colour alone: correct/incorrect/partial/pending have an icon and text label; overrides, released state and validation errors have text; flagged/answered navigator tiles have glyph or border cues; the Lewis electron count shows a check when it matches.
- Responsive from 320px; nothing hides or overlaps clickable controls.
- Nothing animated or decorative competes with the question during a test.

## Adding a new view

1. Use only tokens from `css/base.css`; no hex or rgb literals.
2. Put page surfaces on `--bg`, content surfaces on `--bg-elev` / `--bg-sunken` (never leave text directly on the grid except page titles in student screens).
3. Use `--font-mono` for any formula, number or score; `--font-display` for headings.
4. Rely on the global `:focus-visible`; do not set `outline: none` on focusable elements.
5. Pair every status colour with an icon or text.
6. Admin-only views get no texture (role handles it); student views inherit it from `body`.
7. Check light and dark, 390px and 1280px, and `prefers-contrast: more`.
