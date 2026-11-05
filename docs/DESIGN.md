# ChemistryWorks design system: "ChemWorks Lab" (V4-00)

One look, built from the logo: navy `#00224F` and teal `#01A9AE` on cool off-white (light) or deep navy (dark).
It replaces the v2 "Lab notebook" theme (warm paper, ink blue, graph paper). Everything is driven by custom
properties in `css/base.css`; view CSS only references tokens (a unit test fails on hex colours in any CSS file
except `base.css` and `print.css`). Print stays black on white (`css/print.css`).

## Name

| Use | Name | Where |
|---|---|---|
| Full name | **ChemistryWorks** | `<title>`, landing intro, sign-in prompts, PDF title/footer, docs, `package.json`, CSV filenames |
| Short name | **ChemWorks** | the wordmark, the compact header, toasts where space is tight |

Never mix both in one string (asserted by `test/unit/v4-brand.test.mjs`). Storage prefix (`cw:`) and backend names
are unchanged.

## Logo

- Source: `assets/brand/source/chemworks-mark.svg` — plain paths (no filters, no embedded rasters), colours as CSS
  variables with hex fallbacks. The older `main-*.svg` files are PNG exports wrapped in SVG; keep them only as
  reference.
- In the app: `brandLogo('wordmark' | 'mark', { mono })` (`js/ui.js`) renders the mark as inline SVG plus
  "Chem"/"Works" set in the display face. Colours come from `--brand-navy`, `--brand-teal` and `--brand-mark-gap`
  (the bubbles and the rim of the liquid), so the logo follows the theme, the navy header (where it turns white +
  light teal) and print (all black).
- Variants: wordmark, mark only (header under 480 px), mono (`{ mono: true }`: one colour, `currentColor`), and the
  animated flask loader (`flaskLoader()`) as the one app-wide loading indicator.
- PNGs (`assets/brand/*.png`) stay for the favicon, touch icon and social preview.
- Placement: wordmark on the landing hero and admin sign-in; mark + "ChemWorks" in the app header; mark only under
  480 px. Height drives the size (never stretched). Minimum clear space = one bubble diameter (≈ 8% of the mark height).

## Tokens

Light values are the `:root` defaults; dark values come from `:root[data-theme="dark"]`. Contrast is asserted by
`test/unit/v2-contrast.test.mjs` for every text/surface pair, every accent, status inks, toasts, header and game tiles.

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--brand-navy` | `#00224F` | `#E7EDF7` | Logo glass, headings accent |
| `--brand-teal` | `#01A9AE` | `#2CC5C9` | Fills, highlights, progress, score ring, game accents. **Never text on light surfaces** (2.9:1) |
| `--brand-teal-ink` | `#00797D` | `#2CC5C9` | Teal text, links, control edges (≥ 4.5:1) |
| `--brand-teal-soft` | teal 14% | teal 16% | Tinted icon circles, decorative bubbles |
| `--bg` | `#F5F8FB` | `#0B1424` | Page |
| `--bg-elev` | `#FFFFFF` | `#14213A` | Cards, inputs, question cards (always solid) |
| `--bg-sunken` | `#EAF0F6` | `#08101D` | Wells, table headers, chips, ring track |
| `--border` / `--border-strong` | `#D8E1EB` / `#B9C6D6` | `#22314D` / `#31446A` | Hairlines / hover edges |
| `--border-control` | `#718299` | `#6F82A3` | Form controls and interactive diagrams (≥ 3:1) |
| `--text` / `--text-muted` / `--text-faint` | `#0B1F3A` / `#3A4D68` / `#53647D` | `#E7EDF7` / `#B3C0D6` / `#91A1BB` | Text (all ≥ 4.5:1 on every surface) |
| `--primary` (+ `-hover`, `-soft`, `-line`, `-ink`, `-ring`) | navy | teal | Buttons, links, focus ring, selection |
| `--on-primary` | `#FFFFFF` | `#04121F` | Text on primary/success/danger fills |
| `--success` / `--danger` / `--warning` (+ `-soft`, `-ink`, `-line`) | `#08704F` / `#C42B2B` / `#97460C` | `#34D399` / `#F87171` / `#F5A524` | Status; always with an icon or text |
| `--header-bg` / `--header-fg` | `#00224F` / white | `#08101D` / `#E7EDF7` | Slim navy app bar (admin: a darker navy) |
| `--toast-*`, `--overlay`, `--glass*`, `--skeleton-hi`, `--img-mat` | | | Toasts, modal backdrop, skeletons, picture mat |
| `--game-tile-0…3`, `--game-tile-fg` | red / blue / amber / green, white | same | Game answer tiles (≥ 4.5:1) |
| `--font-display` | Plus Jakarta Sans 600–800 | | Headings, buttons, scores, wordmark |
| `--font-body` | Atkinson Hyperlegible | | Body text |
| `--font-mono` | IBM Plex Mono | | Formulas, numbers, codes, timer |
| `--space-1 … --space-8` | 4, 8, 12, 16, 24, 32, 48, 64 px | | Spacing |
| `--radius-sm/-/-lg/-xl` | 8 / 12 / 16 / 22 px | | Corners |
| `--shadow-sm/-/-lg` | navy-tinted | black-tinted | Elevation |
| `--dur-fast` / `--dur-base` / `--dur-slow` | 120 / 200 / 320 ms | | Motion durations |
| `--ease`, `--ease-out`, `--ease-enter`, `--ease-spring` | | | Standard / enter / playful easing |
| `--header-h`, `--touch` | 60 px, 44 px | | Header height, minimum touch target |

The v2 texture variables (`--texture`, `--texture-strength`, `--grid-*`, `--margin-rule`) still exist so older
rules keep working, but resolve to nothing: there is no graph paper in v4.

**Display font choice.** Plus Jakarta Sans, Outfit and Lexend were compared with the wordmark; Plus Jakarta Sans
800 is closest to its round "C", open "W" and short-armed "k".

## Accent palettes

`data-accent` on `<html>` (`js/lib/theme.js`): `navy` (default for students and admins), `blue`, `violet`, `teal`,
`green`, `orange`, `rose`. In dark mode navy becomes teal. Choices saved by v3 users still apply. Each light accent
keeps white text ≥ 4.5:1; dark accents are lighter and use dark `--on-primary`.

## Components

- **App header** (`appHeader()`): slim navy bar, mark + "ChemWorks", the page title, any extra controls, and one
  **Settings** popover (theme, reduce motion, accent). Widgets on the bar re-point their tokens to the header colours.
- **Icons**: one sprite (`icon(name)` in `js/ui.js`), Lucide-style 2 px strokes on a 24 px grid.
- **Buttons**: pill shape, sizes `--sm` / default / `--lg`, ≥ 44 px touch area on phones; `--primary`, `--ghost`,
  `--subtle`, `--success`, `--danger`. Press = scale 0.97.
- **Cards**: solid `--bg-elev`, 1 px `--border`, `--shadow`; hover lift 1–2 px where the card is clickable.
- **Pills / chips**: soft fill + ink text, always with text.
- **Inputs**: `--bg-elev`, 1.5 px `--border-control`, focus ring in the accent.
- **Loader**: the animated flask (`flaskLoader`) for full-page waits; skeleton shimmer for lists.

## Motion

Calm and quick: only `transform` and `opacity`, nothing longer than about 400 ms, durations and easings from the
tokens. `prefers-reduced-motion` and the in-app switch (`:root[data-motion="reduce"]`) zero the duration tokens and
all animations globally; JS-driven animation checks `prefersReducedMotion()`. Nothing flashes more than 3 times per
second and no animation blocks input.

## Accessibility rules

- Text ≥ 4.5:1 on all surfaces in both themes; interactive boundaries ≥ 3:1. Teal is decoration on light surfaces.
- One focus style: `:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px }`, never removed.
- No information by colour alone: status has an icon and text.
- `prefers-contrast: more`: stronger borders, logo teal turns navy, decorative patterns off.
- Works from 360 px with no horizontal scroll.

## Adding a new view

1. Use only tokens from `css/base.css`; no hex or rgb colour literals.
2. Page on `--bg`; content on `--bg-elev` / `--bg-sunken`.
3. `--font-display` for headings, `--font-mono` for formulas, numbers and scores.
4. Rely on the global `:focus-visible`.
5. Pair every status colour with an icon or text.
6. Check light and dark at 360, 768 and 1366 px, plus `prefers-contrast: more` and reduced motion.
