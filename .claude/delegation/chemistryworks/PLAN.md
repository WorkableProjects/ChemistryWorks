# ChemistryWorks — Delegation Plan

Goal: build ChemistryWorks per `chemistryworks_specification.md` (repo root): a static, no-build chemistry testing
platform with Google sign-in, five+ question types, client-side auto-grading, dual submission (Apps Script → Google Sheet,
Netlify Forms backup), an admin builder/analytics panel, and a strong automated test suite.

Priorities from the user: functionality first; polished UI/animation; "world-class testing features"
(rich test-taking features for students AND thorough automated tests).

## Decisions (made by Opus — do not revisit)
- No build step, no npm dependencies. ES modules + plain CSS. Tests use `node --test`; E2E uses the pre-installed `playwright`.
- All contracts are in `docs/ARCHITECTURE.md`. Read it fully before any task.
- Shared shell already exists and is read-only for executors: index.html, css/base.css, js/app.js, js/ui.js, js/config.js,
  js/lib/storage.js, js/lib/auth.js, js/lib/tests.js, js/views/landing.js, scripts/serve.mjs, data/tests/CHEM101.json.
- Design tokens are CSS variables in css/base.css (`--primary`, `--success`, `--radius`, `--ease`, `--dur` …). Use them; do not hardcode new colors unless necessary.
- Question transitions: `transform: translateX()` with `transition: 280ms cubic-bezier(0.4, 0, 0.2, 1)`; option selection `scale(1.01)` + soft glow; progress bar fills smoothly; KaTeX fades in (`.rich` → `.math-ready`, already in base.css). Respect `prefers-reduced-motion`.

## Waves
- Wave 1 (parallel): T01 core engine (schema/formula/grading + unit tests) · T02 student runner + results UI · T03 admin panel · T04 backend client, submission pipeline, Apps Script, deployment guide
- Wave 2: T05 question bank + test validator script + Playwright E2E suite
- Opus: integration, full verification, fixes.

## Risks
- T02/T03 import T01/T04 modules that are written concurrently: they must code strictly against the interfaces in ARCHITECTURE.md.
- KaTeX/GIS come from CDNs; the app must still work (raw text) if they fail.
