# ChemistryWorks docs

## Current reference

| File | What it is |
|---|---|
| [guide.md](guide.md) | Test-authoring guide (JSON format, every question type). Hand it to an AI to write tests. **Keep this path:** the builder's "Copy guide" button fetches `docs/guide.md` from the repo. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Data shapes, module contracts, backend actions, storage keys, `data-testid`s. Contracts are grouped by the version that added them. |
| [DESIGN.md](DESIGN.md) | Design system: tokens, logo, components, motion, accessibility rules. |
| [hosting/github-pages.md](hosting/github-pages.md) | How the site is hosted on GitHub Pages. |

Setup and upgrades live in [../DEPLOYMENT.md](../DEPLOYMENT.md). Release notes live in [../changelog/](../changelog/).

## Plans

| Version | Plan | Status |
|---|---|---|
| v6 | [v6/v6plan.md](v6/v6plan.md) · [agent briefs](v6/delegations/README.md) | Ready to build |
| v5 | [archive/v5/v5plan.md](archive/v5/v5plan.md) · [progress](archive/v5/v5-progress.md) · [agent briefs](archive/v5/delegations/README.md) | Shipped 5.0.0 / 5.0.1 |
| v4 | [archive/v4/v4plan.md](archive/v4/v4plan.md) · [progress](archive/v4/v4-progress.md) | Shipped 4.0.0 – 4.1.1 |
| v3 | [archive/v3/v3plan.md](archive/v3/v3plan.md) | Shipped 3.0.0 |

## Archive notes

One-off session notes kept for history. They are not current instructions.

- [archive/notes/2026-10-30-config-changes.md](archive/notes/2026-10-30-config-changes.md): Oct 30 config and backend to-do list (backend 1.1.0 era).
- [archive/notes/netlify-to-pages-brief.md](archive/notes/netlify-to-pages-brief.md): the brief used to move hosting from Netlify to GitHub Pages (done).

## Conventions

- New version plan: `docs/v<N>/v<N>plan.md`, plus `v<N>-progress.md` and any agent briefs in the same folder.
- When a version ships, move its folder to `docs/archive/v<N>/` and update the table above.
- One-off notes go in `docs/archive/notes/YYYY-MM-DD-<topic>.md`, not in the docs root.
