# ChemistryWorks v2 — Product & Implementation Specification

> **Status:** Final scope (no open product questions)  
> **Audience:** Claude and future contributors  
> **Purpose:** Define the next set of ChemistryWorks capabilities in a way that is actionable, testable, and easy to extend. This document describes intended behavior, not a prescribed implementation. Confirm existing architecture and conventions before changing code.

## 1. How to use this document

- Treat the **Goals**, **Requirements**, **Decisions**, and **Acceptance criteria** as the current product scope.
- Treat anything under **Open questions** as undecided; do not silently make a product decision when the choice affects users or stored data.
- Before implementation, inspect the existing application, identify relevant pages, data models, permissions, and tests, then propose a concise implementation plan.
- Prefer incremental, backward-compatible changes. Preserve existing tests and behavior unless this specification explicitly changes them.
- Keep this document current: update requirement status, decisions, and open questions as work progresses.
- Do not implement every phase at once. Deliver small, reviewable changes and report what changed, how it was tested, and any remaining work.

## 2. Product context

ChemistryWorks supports creating and taking chemistry tests, reviewing student submissions, and managing assessments in a library. Version 2 improves assessment authoring, testing usability, grading, feedback, and export workflows while keeping the interface clear and dependable in a testing environment.

## 3. Goals

1. Help instructors understand test activity at a glance.
2. Make reference materials available alongside questions without disrupting the assessment flow.
3. Support more useful grading, organization, and student feedback.
4. Add chemistry-focused question types for orbital diagrams and Lewis structures.
5. Make reviewed work portable through useful exports.
6. Give ChemistryWorks a distinctive, intentional visual identity while preserving readability and accessibility.
7. Keep the product and this specification straightforward to extend.

## 4. Non-goals

Unless separately approved, this scope does not require:

- A redesign that changes existing workflows (the visual refresh covers the whole app but is styling only).
- Automatic grading of the new orbital-diagram and Lewis-structure question types.
- Export formats other than print/PDF, or direct Google Classroom integration.
- AI-generated questions, answers, grading, or interface content.
- A new permissions model; use and respect the existing authorization model.

## 5. Requirements

Each requirement has a stable ID for use in issues, pull requests, and revisions. Status values: `Proposed`, `Accepted`, `In progress`, `Done`, or `Deferred`.

### V2-01 — Submission counts in the test library

**Priority:** High  
**Status:** Accepted

Show the number of submissions for each test in the instructor's test library/list view.

**Decisions**
- Count only completed/submitted submissions. In-progress, draft, and deleted submissions are excluded.

**Acceptance criteria**
- [ ] Each test displays a clearly labeled submission count.
- [ ] The count reflects completed submissions associated with that test.
- [ ] A test with no submissions displays `0`, not a blank or misleading value.
- [ ] The count is visible only to users authorized to view the relevant test information.
- [ ] The count remains usable on narrow layouts and does not obscure existing test actions.

### V2-02 — Split-screen assessment mode

**Priority:** High  
**Status:** Accepted

Allow an assessment to present questions alongside a reference pane that can contain a periodic table and/or other instructor-provided resources.

**Decisions**
- Reference resources are attached **per test** only (not per section).
- Students can **resize and collapse** the reference pane.

**Acceptance criteria**
- [ ] On sufficiently wide screens, questions and the reference pane are visible at the same time.
- [ ] The reference pane supports the periodic table and the resource types already supported by the product, where applicable.
- [ ] Students can resize and collapse the pane; resizing, collapsing, or switching panes does not lose entered answers or assessment progress.
- [ ] The layout adapts to smaller screens with a usable stacked or collapsible presentation.
- [ ] The interface makes clear which content is the question area and which is the reference area.
- [ ] Resize and collapse controls are keyboard- and touch-usable.
- [ ] Existing assessment navigation, timing, and submission behavior remain intact.

### V2-03 — Partial-credit grading

**Priority:** High  
**Status:** Accepted

Expand grading beyond full-credit and zero-credit outcomes to support partial credit, including a half-credit option.

**Decisions**
- The grading UI provides three **buttons**: full credit, half credit, and zero credit.
- The grader can also **type a score** directly, including partial values, up to the question's maximum.
- For auto-graded questions, the automatic score is the default and an instructor can **override** it using the buttons or a typed score.
- The stored score model should be a number (not an enumerated choice), so additional grading scales can be added later without migration.

**Acceptance criteria**
- [ ] An authorized grader can assign full, half, or zero credit with one click.
- [ ] An authorized grader can type any valid score between 0 and the question maximum.
- [ ] Invalid entries (negative, above maximum, non-numeric) are rejected with a clear message.
- [ ] Scores are represented consistently in totals and grade views.
- [ ] The selected score is saved and remains correct when the submission is reopened.
- [ ] Instructor overrides on auto-graded questions are saved, and the override is distinguishable from the automatic score.
- [ ] Existing full/zero grading and existing stored grades remain compatible.
- [ ] Score changes follow the application's existing save, audit, and permission behavior.

### V2-04 — Assessment sections

**Priority:** High  
**Status:** Accepted

Allow instructors to group questions into named sections, improving assessment organization and preparing for clearer grade exports and potential classroom-platform workflows.

**Decisions**
- Sections are **optional**; an assessment may contain unsectioned questions.
- Each section has a **name, instructions, and a point total**.
- No direct Google Classroom integration is in scope. The data model should simply not block a future export mapping.

**Acceptance criteria**
- [ ] Instructors can create sections, set a name, instructions, and assign questions to them.
- [ ] A section's point total is shown and is consistent with the questions it contains (define in implementation whether it is calculated or manually set, and document it).
- [ ] Section and question order is clear and stable in authoring, assessment-taking, and review.
- [ ] Questions remain associated with the correct section after editing, saving, and reopening an assessment.
- [ ] Existing assessments without sections continue to work; migration or default behavior does not lose questions.
- [ ] The data model can support future section-level scoring or export mapping without sections being re-created.

### V2-05 — Energy orbital diagram question type

**Priority:** High  
**Status:** Accepted

Add a question type for energy-orbital diagrams, including orbitals and electron arrows (spin).

**Decisions**
- Students **place electrons** in an empty diagram (no pick-from-options mode in v1).
- The instructor chooses the **orbital range per question** (s, p, d, f as needed).
- Responses are **instructor-graded only**; no automatic grading in v1.

**Acceptance criteria**
- [ ] An instructor can create and configure an orbital-diagram question, including which orbitals appear, using the established question-authoring workflow.
- [ ] A student can place up and down electron arrows in orbitals using a keyboard- and touch-usable interaction.
- [ ] Arrows communicate spin direction clearly and do not rely on color alone.
- [ ] The authored prompt and diagram structure can be saved, reopened, and reviewed without loss.
- [ ] The submission review view displays the student's answer legibly.
- [ ] The response is available for instructor grading with the V2-03 controls.

### V2-06 — Lewis dot structures with brackets and charge

**Priority:** High  
**Status:** Accepted

Extend the Lewis-structure question type so an answer can include a structure enclosed in brackets with an indicated charge, as needed for ions.

**Decisions**
- **Extend the existing Lewis editor** rather than building a new one.
- Both the **overall bracket charge** and **per-atom formal charges** are in scope.
- Responses are **instructor-graded only**; no automatic grading in v1.

**Acceptance criteria**
- [ ] Authoring and answer entry support brackets and an overall charge associated with the structure.
- [ ] Formal charges can be placed on individual atoms.
- [ ] Bracket charge and formal charges are visually distinct and unambiguous in saved, submitted, and reviewed work.
- [ ] Existing Lewis-structure behavior remains available and compatible.
- [ ] The answer can be created on desktop and narrow screens.
- [ ] The submitted structure renders correctly in review and in the PDF export (V2-08).
- [ ] The response is available for instructor grading with the V2-03 controls.

### V2-07 — Instructor comments on individual submitted questions

**Priority:** High  
**Status:** Accepted

Allow an authorized instructor or administrator to attach a comment to an individual question in a student's submission.

**Decisions**
- Students see comments **only after grades are released**.
- Comments support **basic formatting and links**.

**Acceptance criteria**
- [ ] A grader can add, edit, and save a comment on a specific submitted question.
- [ ] The comment is associated with the correct submission and question, including when sections are used.
- [ ] Comments are visible in instructor review immediately, and to students only after grades are released.
- [ ] Comments are included in the PDF export only where visibility rules allow.
- [ ] Basic formatting (define the supported set, e.g. bold, italic, lists) and links are supported; input is sanitized to prevent unsafe content, and links are safe to open.
- [ ] Empty comments are not saved as meaningful feedback.
- [ ] Comments are protected by existing authorization and privacy rules.
- [ ] Saving or editing a comment does not change the student's answer or score.

### V2-08 — Export reviewed submissions

**Priority:** High  
**Status:** Accepted

Allow authorized staff to export a student's submitted questions and answers together with instructor comments and grading information.

**Decisions**
- Format: **print/PDF** only.
- Scope: **one student at a time**.
- Header information: **student name, test/assessment name, and total score**.
- Not included in v1: per-section totals, timestamps, extra assessment metadata, grading rubric.

**Acceptance criteria**
- [ ] An authorized user can export one student's reviewed submission as a PDF from an instructor workflow.
- [ ] The PDF shows student name, assessment name, and total score.
- [ ] It includes question prompts, the student's answers, instructor comments, and per-question scores when available.
- [ ] Section names and question order are preserved when sections are used.
- [ ] Orbital diagrams and Lewis structures (including brackets, charges, and formal charges) are legible in the PDF.
- [ ] Comment visibility and access permissions are respected.
- [ ] The file has a meaningful filename (for example, student and assessment name).

### V2-09 — Distinctive, readable assessment UI

**Priority:** High  
**Status:** Accepted

Reduce generic, template-like visual styling and establish an intentional ChemistryWorks visual identity without compromising the clarity, neutrality, or usability needed for testing.

**Decisions**
- Scope: the **whole app**.
- Visual direction: **Lab notebook** — warm off-white surfaces, ink-blue text, subtle graph-paper accents, and monospace for formulas and numbers.
- **Intensity varies by area.** Student-facing screens (assessment-taking, results) get the full notebook treatment. The **admin/instructor views** (test library, grading, review, export, settings) use a **toned-down** version: plain surfaces, minimal or no graph-paper texture, standard-weight type, and the notebook palette used only for accents (headings, active states, key actions). Dense data such as tables, grading controls, and score fields must prioritize readability over theme.
- There is no existing brand guide. Define one as reusable design tokens/components.

**Acceptance criteria**
- [ ] The direction is implemented as documented design tokens (color, type, spacing, texture) and reusable components, not one-off styling.
- [ ] Tokens support two intensity levels (full and toned-down) so the same components render appropriately in student and admin contexts.
- [ ] Assessment-taking screens prioritize readable questions, answers, progress, and relevant controls.
- [ ] Admin views have no background texture behind text, tables, or form fields, and use the same layout density as before or better.
- [ ] Monospace is used for formulas, numbers, and scores where it aids reading; body text stays in a highly readable face.
- [ ] Color is not the sole means of communicating status or correctness.
- [ ] Text contrast, focus states, and interactive diagrams meet the project's accessibility standards (target WCAG AA) and work with keyboard navigation.
- [ ] The interface is responsive and legible at supported zoom levels and viewport sizes.
- [ ] Decorative treatment does not distract during timed or high-stakes assessment tasks.
- [ ] Existing user workflows are preserved.

## 6. Cross-cutting requirements

- **Authorization and privacy:** Use existing access-control patterns. Never expose student submissions, grades, or comments to unauthorized users.
- **Data integrity:** Preserve existing tests, submissions, answers, and scores. Any schema change must include an appropriate migration and safe default behavior.
- **Accessibility:** Follow the repository's existing accessibility conventions; support keyboard use and clear focus for interactive controls.
- **Responsive behavior:** New layouts and question types must work at the application's supported screen sizes.
- **Consistency:** Reuse existing components and visual conventions when appropriate. Avoid duplicating business logic.
- **Testing:** Add or update tests for behavior, permissions, persistence, edge cases, and backward compatibility. Run the relevant test and lint/build commands available in the repository.
- **Documentation:** Update user-facing or developer documentation when a change introduces a workflow, data format, or configuration that needs explanation.

## 7. Suggested delivery phases

Phases are a planning aid, not a strict dependency graph. Confirm dependencies after inspecting the codebase.

1. **Foundation:** Confirm existing data semantics, permissions, test conventions, and design patterns; add submission counts (V2-01) and partial-credit support (V2-03).
2. **Assessment organization and experience:** Add sections (V2-04) and the responsive split-screen reference experience (V2-02).
3. **Feedback and portability:** Add per-question comments (V2-07) and PDF export (V2-08).
4. **Chemistry authoring:** Add orbital-diagram (V2-05) and bracketed/charged Lewis-structure (V2-06) question types.
5. **Visual refinement:** Apply and validate the chosen UI direction across the app (V2-09).

For each phase, deliver working, tested increments. Reorder phases when repository architecture or user needs justify it, and record the reason.

## 8. Implementation workflow for Claude

For each implementation task (delegation roles are in Section 9):

1. Identify the requirement IDs in scope and inspect the relevant code, tests, and existing product behavior.
2. Summarize the current architecture and any assumptions that affect the implementation.
3. Propose a short plan, including data changes, UI changes, permission considerations, and tests.
4. If a product decision is unresolved and materially changes user experience, data, or compatibility, ask before making that decision. Otherwise choose the least surprising backward-compatible behavior and document it.
5. Implement only the agreed scope. Keep changes focused and follow repository conventions.
6. Add/update tests, run relevant checks, and report exact results. If a check cannot be run, say why.
7. Update this specification: mark requirement status, record decisions, and add newly discovered follow-up work to the backlog.

Do not invent support for external integrations or claim a feature is complete when only part of its workflow is implemented.

## 9. Delegation model

**Roles**
- **Planner (Claude Opus 5.5):** inspects the codebase, writes the per-task plan, owns data-model, migration, and permission decisions, delegates, reviews diffs, and integrates and verifies the result. Does not hand off any decision listed in Section 8, step 4.
- **Coders (Claude Sonnet 5.5 and Haiku 5.5 agents):** implement a single, narrowly scoped task from the planner's brief, add the tests it specifies, and report results. Coders do not change scope, schemas, or permissions beyond the brief.

**Rules for every delegated task**
1. The planner writes a brief containing: requirement ID, files/modules in scope, acceptance criteria copied from this spec, decisions from the Decision log, constraints (backward compatibility, accessibility), and the exact tests/commands to run.
2. One task per agent, one reviewable change per task. Parallelize only tasks that touch different files; run dependent tasks in sequence.
3. Schema changes, migrations, and anything affecting authorization or student data are written or reviewed line-by-line by the planner before merge, even when a coder drafted them.
4. Coders report: what changed, tests added, exact command output, and any assumption or blocker. The planner verifies against the acceptance criteria before marking a requirement `Done`.
5. Escalate rather than guess: if a coder hits an unspecified product decision, it stops and returns the question to the planner.
6. Use the cheaper model when the task is mechanical and well specified; step up to Sonnet when judgment or interactive logic is involved.

**Suggested assignment per task**

| Task | Planner (Opus) | Coder | Notes |
|------|----------------|-------|-------|
| Codebase audit, data semantics, test conventions (Phase 1) | Owns | None | Output is the plan and briefs for later tasks |
| V2-01 Submission counts | Review query and permissions | **Haiku** | Small query plus UI label; add count and empty-state tests |
| V2-03 Partial credit | Design score model (numeric) and override rules | **Sonnet** | Buttons, typed validation, auto-grade override, totals; Haiku can add edge-case tests afterward |
| V2-04 Sections | Design schema, migration, and default behavior | **Sonnet** (schema and logic), **Haiku** (list/ordering UI) | Highest data-integrity risk; planner reviews migration |
| V2-02 Split-screen | Define layout contract and state-preservation requirement | **Sonnet** | Resize/collapse, responsive stacking, keyboard and touch |
| V2-07 Comments | Define visibility rule, sanitization approach, data model | **Sonnet** | Rich text plus link handling; planner reviews sanitization and release-visibility logic |
| V2-08 PDF export | Define layout and content contract | **Sonnet** | Rendering of diagrams and Lewis structures is the hard part; Haiku can handle filename and header |
| V2-05 Orbital diagram | Define data representation and authoring workflow | **Sonnet** | Interactive editor, accessibility, review rendering |
| V2-06 Lewis brackets/charge | Review how the existing editor stores structures | **Sonnet** | Extends existing editor; planner checks backward compatibility |
| V2-09 Tokens and theme | Define two-intensity token set and per-screen mapping | **Sonnet** (tokens, components), **Haiku** (applying tokens across screens) | Planner checks admin views for readability and contrast |
| Tests, docs, spec updates | Final review | **Haiku** | Regression tests, documentation, decision-log and status updates |

**Review gates**
- After each task: planner reviews the diff against acceptance criteria and cross-cutting requirements (Section 6).
- After each phase: planner runs the full test, lint, and build commands, checks backward compatibility with existing data, and updates requirement status.

## 10. Decision log

| Date | Requirement(s) | Decision | Rationale / follow-up |
|------|----------------|----------|-----------------------|
| 2026-11-03 | V2-01 | Count only completed/submitted submissions | Avoids counting drafts or deleted work |
| 2026-11-03 | V2-02 | Resources per test only; students can resize and collapse the pane | Simplest authoring model; flexible for students |
| 2026-11-03 | V2-03 | Full/half/zero buttons plus typed score; instructor override on auto-graded questions | Fast common cases without limiting grader flexibility |
| 2026-11-03 | V2-04 | Sections optional; name, instructions, point total | Backward compatible with unsectioned tests |
| 2026-11-03 | V2-05 | Student places electrons; instructor picks orbital range per question; instructor-graded only | Auto-grading deferred |
| 2026-11-03 | V2-06 | Extend existing Lewis editor; bracket charge and per-atom formal charges; instructor-graded only | Auto-grading deferred |
| 2026-11-03 | V2-07 | Students see comments after grade release; basic formatting and links | Sanitize input |
| 2026-11-03 | V2-08 | PDF only, one student at a time; header with student name, assessment name, total score | Other formats and bulk export deferred |
| 2026-11-03 | V2-09 | Whole-app refresh using the Lab notebook direction; toned down in admin views for readability | Two token intensity levels: full (student) and toned-down (admin) |
| 2026-11-03 | Delegation | Opus 5.5 plans and verifies; Sonnet 5.5 and Haiku 5.5 agents code | See Section 9 |

## 11. Extensible backlog

Add future work here before expanding the requirements. Promote an item into Section 5 when its intended behavior and acceptance criteria are understood.

| ID | Idea | Priority | Status | Notes |
|----|------|----------|--------|-------|
| V2-10 | Auto-grading for orbital-diagram and Lewis questions | Medium | Deferred | Needs equivalent-answer rules (e.g., orbital ordering, resonance) |
| V2-11 | Export formats beyond PDF (document, structured data) and bulk export | Medium | Deferred | Add per-section totals and timestamps if requested |
| V2-12 | Section-level reference resources | Low | Deferred | V2-02 is per test only for now |
| V2-13 | Google Classroom export mapping | Low | Deferred | No integration claimed; keep section data model compatible |
| V2-14 | Additional grading scales (e.g., quarter credit buttons) | Low | Deferred | Stored scores are numeric, so no migration expected |

### Future requirement template

Copy this template when adding a substantial feature. Assign a new stable ID; do not reuse retired IDs.

```
### V2-XX — Short feature name

**Priority:** High / Medium / Low  
**Status:** Proposed

Describe the user problem and intended outcome.

**Acceptance criteria**
- [ ] Observable behavior that can be verified.
- [ ] Persistence, permissions, or compatibility behavior as applicable.
- [ ] Error, empty, and edge-case behavior as applicable.
- [ ] Tests or validation needed for completion.

**Dependencies**
- None / list requirement IDs or systems.

**Open questions**
- Questions that require product decisions.
```
