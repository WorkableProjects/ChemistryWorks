# v5 progress

Decisions used: README defaults (1 shared attempt yes; 2 "Saved" when answers hidden; 3 Attempts sheet yes, 30 s throttle; 4 remove six games; 5 teacher student view + a11y audit, skip S13b/c; 6 teachers see grades/progress/activity, not XP/badges; 7 notifications derived on read).

| ID | Status | Commit | Notes |
|---|---|---|---|
| W0 | done | merged | contracts |
| S01a | done | merged | done; old tests referencing Insights not updated (ASAP) |
| S01b | done | merged | done |
| B1 | done | merged | done |
| B2 | done | merged | merged |
| B3 | done | merged | merged |
| S02 | done | merged | done by orchestrator; no mode-select chooser, switcher in runner bar |
| S03a | done | merged | merged |
| S03b | done | merged | merged |
| S04a | done | merged | merged |
| S04b | done | merged | merged |
| S06a | done | merged | merged |
| S06b | done | merged | merged |
| S07a | done | merged | merged |
| S07b | done | merged | merged |
| S08a | done | merged | merged |
| S08b | done | merged | merged |
| S08c | skipped | | skipped (code splitting) |
| S08d | skipped | | skipped (perf test) |
| S09a | done | merged | merged |
| S09b | done | merged | merged |
| S10 | done | merged | merged |
| S11a | done | merged | merged |
| S11b | done | merged | merged |
| S11c | done | merged | merged |
| S12a | done | merged | merged |
| S12b | done | merged | merged |
| S12c | done | merged | merged |
| S12d | done | merged | merged |
| S12e | done | merged | merged |
| S12f | done | merged | merged |
| S12z | done | merged | merged |
| S13a | done | merged | merged |
| S14a | skipped | | skipped (audit) |
| S14b | done | merged | merged |
| S14c | done | merged | merged |

## Handoff notes

Final (S14c): all agents merged except S08c (code splitting), S08d (perf test), S13b, S13c and S14a (audit), which were skipped. Version 5.0.0, changelog and DEPLOYMENT.md written. Tests were skipped under the ASAP override except changelog.test.mjs. Added `listStream` (Code.gs + js/lib/api.js).
