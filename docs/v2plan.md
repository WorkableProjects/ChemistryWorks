# ChemistryWorks v2 — Product & Implementation Specification

> **Status:** Final scope; no open product questions  
> **Audience:** Contributors  
> **Purpose:** Define actionable, testable behavior for ChemistryWorks v2.

## Product context

ChemistryWorks supports creating and taking chemistry tests, reviewing submissions, and managing assessments. V2 improves authoring, assessment usability, grading, feedback, exports, and visual design.

## Requirements

Status values: `Proposed`, `Accepted`, `In progress`, `Done`, or `Deferred`.

### V2-01 — Submission counts in the test library
**Priority:** High · **Status:** Done

Show completed submission counts in the instructor's test library. Exclude in-progress, draft, and deleted submissions.

**Acceptance criteria**
- [ ] Each test has a clearly labeled count; tests with none show `0`.
- [ ] Counts reflect completed submissions and are visible only to authorized users.
- [ ] Counts fit narrow layouts without obscuring test actions.

### V2-02 — Split-screen assessment mode
**Priority:** High · **Status:** Done

Show questions alongside a per-test reference pane for the periodic table and other supported instructor-provided resources. Students can resize and collapse the pane.

**Acceptance criteria**
- [ ] On wide screens, questions and references are visible together; smaller screens use a usable stacked or collapsible layout.
- [ ] The pane supports available reference resources and clearly distinguishes them from questions.
- [ ] Resize, collapse, and pane switching preserve answers and progress.
- [ ] Controls work with keyboard and touch; assessment navigation, timing, and submission remain intact.

### V2-03 — Partial-credit grading
**Priority:** High · **Status:** Done

Support full-, half-, zero-credit buttons and direct numeric score entry up to the question maximum. Store scores numerically. For auto-graded questions, retain the automatic score as the default and allow instructor overrides.

**Acceptance criteria**
- [ ] Authorized graders can award full, half, or zero credit with one click, or enter any valid score from zero to the maximum.
- [ ] Negative, above-maximum, and non-numeric entries are rejected with a clear message.
- [ ] Scores are consistent in totals and grade views, persist when reopened, and remain compatible with existing grades.
- [ ] Auto-grade overrides are saved and distinguishable from automatic scores.
- [ ] Score changes follow existing save, audit, and permission behavior.

### V2-04 — Assessment sections
**Priority:** High · **Status:** Done

Allow optional named sections with instructions and a point total. Assessments may also retain unsectioned questions. No Google Classroom integration is in scope.

**Acceptance criteria**
- [ ] Instructors can create sections and assign questions.
- [ ] Section point totals match their questions; document whether totals are calculated or manually set. *(Calculated — see docs/ARCHITECTURE.md "V2 contracts".)*
- [ ] Section and question order is stable in authoring, assessment-taking, and review.
- [ ] Associations persist through editing and reopening. Existing unsectioned assessments remain intact.
- [ ] The model can support future section-level scoring or export mapping.

### V2-05 — Energy orbital diagram question type
**Priority:** High · **Status:** Done

Add instructor-graded orbital-diagram questions. Students place electrons in an empty diagram; instructors choose the orbital range (s, p, d, f) per question. Automatic grading is out of scope for v1.

**Acceptance criteria**
- [ ] Instructors configure the orbital range through the existing authoring workflow.
- [ ] Students can place up/down electron arrows using keyboard- and touch-usable controls; spin is clear without relying on color.
- [ ] Prompts, diagrams, and responses persist and display legibly in submission review.
- [ ] Responses support grading with V2-03 controls.

### V2-06 — Lewis structures with brackets and charge
**Priority:** High · **Status:** Done

Extend the existing Lewis editor to support brackets, an overall bracket charge, and per-atom formal charges. Responses are instructor-graded only in v1.

**Acceptance criteria**
- [ ] Authoring and answer entry support brackets and overall and per-atom charges.
- [ ] Charges are visually distinct and unambiguous in saved, submitted, and reviewed work.
- [ ] Existing Lewis behavior remains compatible; editing works on desktop and narrow screens.
- [ ] Submitted structures render correctly in review and the V2-08 PDF export.
- [ ] Responses support grading with V2-03 controls.

### V2-07 — Instructor comments on submitted questions
**Priority:** High · **Status:** Done

Allow authorized instructors and administrators to add comments to individual questions in a submission. Students see comments only after grades are released. Support basic formatting and links.

**Acceptance criteria**
- [ ] Graders can add, edit, and save comments associated with the correct submission and question, including in sectioned assessments.
- [ ] Comments appear immediately in instructor review and only after grade release for students.
- [ ] PDF exports include comments only when visibility rules allow.
- [ ] Supported formatting (such as bold, italic, and lists) and links are defined; content is sanitized and links are safe to open.
- [ ] Empty comments are not saved as feedback. Existing authorization and privacy rules apply.
- [ ] Comment changes do not alter answers or scores.

### V2-08 — Export reviewed submissions
**Priority:** High · **Status:** Done

Allow authorized staff to export one student's reviewed submission as print/PDF. Include student name, assessment name, and total score. Per-section totals, timestamps, extra metadata, and rubrics are out of scope for v1.

**Acceptance criteria**
- [ ] Export is available from an instructor workflow and includes prompts, answers, comments, and per-question scores when available.
- [ ] Section names and question order are preserved.
- [ ] Orbital diagrams and Lewis structures, including brackets and charges, are legible.
- [ ] Comment visibility and access permissions are respected.
- [ ] The filename meaningfully identifies the student and assessment.

### V2-09 — Distinctive, readable UI
**Priority:** High · **Status:** In progress

Apply a whole-app **Lab notebook** visual direction: warm off-white surfaces, ink-blue text, subtle graph-paper accents, and monospace for formulas and numbers. Use the full treatment on student-facing screens and a toned-down treatment in instructor/admin views. Define reusable design tokens and components; no existing brand guide is available.

**Acceptance criteria**
- [ ] Documented tokens cover color, typography, spacing, and texture, with full and toned-down intensity levels.
- [ ] Assessment screens prioritize readable questions, answers, progress, and controls.
- [ ] Admin views have no texture behind text, tables, or fields and maintain at least the existing layout density.
- [ ] Use monospace for formulas, numbers, and scores where helpful; use a readable body face.
- [ ] Color alone does not communicate status or correctness.
- [ ] Contrast, focus, keyboard navigation, and interactive diagrams target WCAG AA.
- [ ] Layouts remain responsive and legible at supported zoom and viewport sizes.
- [ ] Decoration does not distract during timed or high-stakes assessments; existing workflows are preserved.

## Shared implementation requirements

- **Authorization and privacy:** Follow existing access-control patterns; never expose submissions, grades, or comments to unauthorized users.
- **Data integrity:** Preserve tests, submissions, answers, and scores. Schema changes require migrations and safe defaults.
- **Accessibility and responsiveness:** Follow existing conventions; support keyboard use, visible focus, and supported screen sizes.
- **Consistency:** Reuse components and business logic where appropriate.
- **Testing:** Cover behavior, permissions, persistence, edge cases, and backward compatibility. Run available relevant tests, lint, and build checks.
- **Documentation:** Update user or developer documentation when workflows, data formats, or configuration change.

## Suggested delivery order

1. Foundation: V2-01 submission counts and V2-03 partial credit.
2. Assessment organization and experience: V2-04 sections and V2-02 split-screen references.
3. Feedback and portability: V2-07 comments and V2-08 PDF export.
4. Chemistry authoring: V2-05 orbital diagrams and V2-06 Lewis brackets/charges.
5. Visual refinement: V2-09 design tokens and app-wide styling.

This order may change after architecture review; document the reason. Deliver and verify small increments, and update requirement statuses as work progresses.

## Deferred backlog

| ID | Idea | Priority | Status | Notes |
|----|------|----------|--------|-------|
| V2-10 | Auto-grading orbital-diagram and Lewis questions | Medium | Deferred | Requires equivalent-answer rules (e.g., orbital ordering, resonance). |
| V2-11 | Export formats beyond PDF and bulk export | Medium | Deferred | Add section totals and timestamps if requested. |
| V2-12 | Section-level reference resources | Low | Deferred | V2-02 is per test only. |
| V2-13 | Google Classroom export mapping | Low | Deferred | No integration is in scope; keep section data compatible. |
| V2-14 | Additional grading scales (e.g., quarter-credit buttons) | Low | Deferred | Numeric scores should avoid a migration. |
