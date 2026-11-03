# V2.5 plan (docs/v2.5plan.md)
- Comments not saving: Opus fixed directly. Backend code is correct; an outdated Apps Script deployment silently drops comments. js/lib/api.js saveGrade now errors when reply lacks grade.comments. Stale apps-script unit tests fixed (23 cols).
- T01 (Sonnet): student runner fixes (sticky Questions drawer, ordering view) + image answer choices.
- T02 (Sonnet): Game mode (kahoot/blooket/gimkit-style single-player) vs Study mode (normal runner).
Parallel, disjoint files. Verify: npm test, npm run test:e2e.
