# ChemistryWorks v2 — Product & Implementation Specification

> **Status:** Draft / living specification  
> **Audience:** Claude and future contributors  
> **Purpose:** Define the next set of ChemistryWorks capabilities in a way that is actionable, testable, and easy to extend. This document describes intended behavior, not a prescribed implementation. Confirm existing architecture and conventions before changing code.

## 1. How to use this document

- Treat the **Goals**, **Requirements**, and **Acceptance criteria** as the current product scope.
- Treat anything marked **Open questions** as undecided; do not silently make a product decision when the choice affects users or stored data.
- Before implementation, inspect the existing application, identify relevant pages, data models, permissions, and tests, then propose a concise implementation plan.
- Prefer incremental, backward-compatible changes. Preserve existing tests and behavior unless this specification explicitly changes them.
- Keep this document current: update requirement status, decisions, and open questions as work progresses.
- Do not implement every phase at once. Deliver small, reviewable changes and report what changed, how it was tested, and any remaining work.

## 2. Product context

ChemistryWorks supports creating and taking chemistry tests, reviewing student submissions, and managing assessments in a library. Version 2 should improve assessment authoring, testing usability, grading, feedback, and export workflows while keeping the interface clear and dependable in a testing environment.

## 3. Goals

1. Help instructors understand test activity at a glance.
2. Make reference materials available alongside questions without disrupting the assessment flow.
3. Support more useful grading, organization, and student feedback.
4. Add chemistry-focused question types for orbital and Lewis structures.
5. Make reviewed work portable through useful exports.
6. Give ChemistryWorks a distinctive, intentional visual identity while preserving readability and accessibility.
7. Keep the product and this specification straightforward to extend.

## 4. Non-goals

Unless separately approved, this scope does not require:

- A complete redesign of unrelated product areas.
- Automatic grading of every new chemistry question type.
- A specific export file format or direct Google Classroom integration.
- AI-generated questions, answers, grading, or interface content.
- A new permissions model; use and respect the existing authorization model.

## 5. Requirements

Each requirement has a stable ID so it can be referenced in issues, pull requests, and future revisions. Status values: `Proposed`, `Accepted`, `In progress`, `Done`, or `Deferred`.

### V2-01 — Submission counts in the test library

**Priority:** High  
**Status:** Proposed

Show the number of submissions for each test in the instructor's test library/list view.

**Acceptance criteria**
- Each test displays a clearly labeled submission count.
- The count reflects the submissions associated with that test and follows the application's existing definition of a submission.
- A test with no submissions displays `0` (or an equally clear empty state), not a blank or misleading value.
- The count is available only to users authorized to view the relevant test information.
- The count remains usable on narrow layouts and does not obscure existing test actions.

**Open questions**
- Should in-progress, draft, or deleted submissions be included? Follow existing product semantics unless they are unclear; if unclear, ask before choosing.

### V2-02 — Split-screen assessment mode

**Priority:** High  
**Status:** Proposed

Allow an assessment to present questions alongside a reference pane that can contain a periodic table and/or other instructor-provided resources.

**Acceptance criteria**
- On sufficiently wide screens, questions and the reference pane are visible at the same time.
- The reference pane supports the periodic table and the resource types already supported by the product, where applicable.
- Students can continue answering questions while viewing resources; switching panes must not lose entered answers or assessment progress.
- The layout adapts to smaller screens with a usable stacked, collapsible, or otherwise responsive presentation.
- The interface makes it clear which content is the question area and which is the reference area.
- Existing assessment navigation, timing, and submission behavior remain intact.

**Open questions**
- Can instructors choose resources per test, per section, or both?
- Should students be able to resize or collapse the reference pane?

### V2-03 — Partial-credit grading

**Priority:** High  
**Status:** Proposed

Expand grading beyond full-credit and zero-credit outcomes to support partial credit, including a half-credit option.

**Acceptance criteria**
- An authorized grader can assign full credit, partial credit, or zero credit to a gradable response.
- The half-credit option is explicit and easy to apply when appropriate.
- The awarded score cannot exceed the question's maximum score and is represented consistently in totals and grade views.
- The selected score is saved and remains correct when the submission is reopened.
- Existing full/zero grading and existing stored grades remain compatible.
- Any score changes follow the application's existing save, audit, and permission behavior.

**Open questions**
- Is half credit a fixed choice, or should graders be able to enter any valid score? Prefer a model that can accommodate additional grading scales later, without expanding the initial UI unnecessarily.
- How should partial credit work for automatically graded questions?

### V2-04 — Assessment sections

**Priority:** High  
**Status:** Proposed

Allow instructors to group questions into named sections, improving assessment organization and preparing for clearer grade exports and potential classroom-platform workflows.

**Acceptance criteria**
- Instructors can create and name sections and assign questions to them.
- Section and question order is clear and stable in authoring, assessment-taking, review, and export experiences where those views apply.
- Questions remain associated with the correct section after editing, saving, and reopening an assessment.
- Existing assessments without sections continue to work; migration or default behavior does not lose questions.
- The data model can support future section-level scoring or export mapping without requiring sections to be re-created.

**Open questions**
- Are sections optional, and can an assessment contain unsectioned questions?
- Should sections have descriptions, instructions, or their own point totals in the first version?
- What exact Google Classroom workflow is intended? Do not claim direct integration unless it is implemented and approved.

### V2-05 — Energy orbital diagram question type

**Priority:** High  
**Status:** Proposed

Add a question type for energy-orbital diagrams, including orbitals and electron arrows (spin).

**Acceptance criteria**
- An instructor can create and configure an orbital-diagram question using the application's established question-authoring workflow.
- A student can provide an answer using a clear, keyboard- and touch-usable interaction, or an equivalent accessible input method.
- The diagram represents orbital groups and electron arrows in a way appropriate to the question; arrows communicate spin direction.
- The authored prompt and expected answer can be saved, reopened, and reviewed without losing diagram structure.
- The submission review view can display the student's answer legibly.
- If automatic grading is supported, its rules are explicit and tested; otherwise, the response is available for instructor grading.

**Open questions**
- Which orbital ranges and diagram conventions are required initially?
- Should students place electrons, select a completed diagram, or use both modes?
- What constitutes equivalent answers for grading (for example, equivalent orbital ordering)?

### V2-06 — Lewis dot structures with brackets and charge

**Priority:** High  
**Status:** Proposed

Add or extend a Lewis-structure question type so an answer can include a structure enclosed in brackets with an indicated charge, as needed for ions.

**Acceptance criteria**
- The authoring and answer-entry experiences support brackets and a charge associated with the structure.
- The charge is visually associated with the bracketed structure and remains unambiguous in saved, submitted, and reviewed work.
- Existing Lewis-structure behavior remains available and compatible.
- The answer can be created with the supported input method on desktop and narrow screens.
- If automatic grading is supported, compare the relevant chemical structure and charge according to documented rules; otherwise, make the submitted structure available for instructor grading.

**Open questions**
- Which existing Lewis-structure editor or answer representation should be extended?
- Are formal charges on individual atoms in scope, in addition to the overall bracket charge?
- What formats must be supported for printing and export?

### V2-07 — Instructor comments on individual submitted questions

**Priority:** High  
**Status:** Proposed

Allow an authorized instructor or administrator to attach a comment to an individual question in a student's submission.

**Acceptance criteria**
- A grader can add, edit, and save a comment in the context of a specific submitted question.
- The comment is associated with the correct submission and question, including when a test contains sections.
- Comments are visible in instructor review and included in applicable student-facing or export views only when permitted by the existing release/visibility rules.
- Empty comments are not saved as meaningful feedback.
- Comments are protected by existing authorization and privacy rules.
- Saving or editing a comment does not change the student's answer or score unless the grader separately changes the grade.

**Open questions**
- Can students see comments immediately, only after grades are released, or only in an exported review?
- Are comments plain text only, or are formatting and links needed?

### V2-08 — Export reviewed submissions

**Priority:** High  
**Status:** Proposed

Allow authorized staff to export a student's submitted questions and answers together with instructor comments, and the relevant grading information.

**Acceptance criteria**
- An authorized user can export a reviewed submission from an appropriate instructor workflow.
- The export includes question prompts, the student's submitted answers, instructor comments, and scores when available.
- Section names and question order are preserved when sections are used.
- Exported content is legible for supported question types, including orbital diagrams and Lewis structures, or clearly identifies any unsupported representation.
- The export identifies the assessment and student using the product's existing data and privacy conventions.
- Export contents respect comment visibility and access permissions.
- The exported file can be opened or viewed using the selected format and has a meaningful filename.

**Open questions**
- Which formats are required first (for example, print/PDF, document, or structured data)?
- Should exports be for one student at a time, multiple selected submissions, or both?
- Should an export include assessment metadata, total score, per-section totals, timestamps, or a grading rubric?

### V2-09 — Distinctive, readable assessment UI

**Priority:** High  
**Status:** Proposed

Reduce generic, template-like visual styling and establish an intentional ChemistryWorks visual identity without compromising the clarity, neutrality, or usability needed for testing.

**Acceptance criteria**
- Assessment-taking screens prioritize readable questions, answers, progress, and relevant controls.
- Visual styling is consistent with the product's existing design system, or introduces documented reusable tokens/components rather than one-off styling.
- Color is not the sole means of communicating status or correctness.
- Text, controls, focus states, and interactive diagrams meet the project's accessibility standards and remain usable with keyboard navigation.
- The interface is responsive and remains legible at supported zoom levels and viewport sizes.
- Decorative visual treatment does not distract from timed or high-stakes assessment tasks.
- Existing user workflows are preserved unless an approved design change explicitly updates them.

**Open questions**
- Is there an existing brand guide, preferred palette, or design system to follow?
- Which screens are included in the visual refresh beyond assessment-taking?

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

1. **Foundation:** Confirm existing data semantics, permissions, test conventions, and design patterns; add submission counts and partial-credit support.
2. **Assessment organization and experience:** Add sections and the responsive split-screen reference experience.
3. **Feedback and portability:** Add per-question comments and reviewed-submission export.
4. **Chemistry authoring:** Add orbital-diagram and bracketed/charged Lewis-structure question types.
5. **Visual refinement:** Apply and validate the distinctive, readable UI direction across the agreed screens.

For each phase, deliver working, tested increments. Reorder phases when repository architecture or user needs justify it, and record the reason.

## 8. Implementation workflow for Claude

For each implementation task:

1. Identify the requirement IDs in scope and inspect the relevant code, tests, and existing product behavior.
2. Summarize the current architecture and any assumptions that affect the implementation.
3. Propose a short plan, including data changes, UI changes, permission considerations, and tests.
4. If a product decision is unresolved and materially changes user experience, data, or compatibility, ask before making that decision. Otherwise choose the least surprising backward-compatible behavior and document it.
5. Implement only the agreed scope. Keep changes focused and follow repository conventions.
6. Add/update tests, run relevant checks, and report exact results. If a check cannot be run, say why.
7. Update this specification: mark requirement status, record decisions, and add newly discovered follow-up work to the backlog.

Do not invent support for external integrations or claim a feature is complete when only part of its workflow is implemented.

## 9. Decision log

Record decisions here so later contributors do not have to infer intent.

| Date | Requirement(s) | Decision | Rationale / follow-up |
|---|---|---|---|
| TBD | TBD | TBD | TBD |

## 10. Extensible backlog

Add future work here before expanding the requirements. Promote an item into Section 5 when its intended behavior and acceptance criteria are understood.

| ID | Idea | Priority | Status | Notes |
|---|---|---|---|---|
| V2-10 | TBD | TBD | Proposed | Add a concise description, then define acceptance criteria before implementation. |

### Future requirement template

Copy this template when adding a substantial feature. Assign a new stable ID; do not reuse retired IDs.

```markdown
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
