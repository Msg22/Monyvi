---
description:
  Generate an actionable, dependency-ordered tasks.md for the feature based on
  available design artifacts.
handoffs:
  - label: Analyze For Consistency
    agent: speckit.analyze
    prompt: Run a project analysis for consistency
    send: true
  - label: Implement Project
    agent: speckit.implement
    prompt: Start the implementation in phases
    send: true
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

1. **Setup**: Run `.specify/scripts/bash/check-prerequisites.sh --json` from
   repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be
   absolute. For single quotes in args like "I'm Groot", use escape syntax: e.g
   'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Load design documents**: Read from FEATURE_DIR:
   - **Required**: plan.md (tech stack, libraries, structure), spec.md (user
     stories with priorities)
   - **Optional**: data-model.md (entities), contracts/ (API endpoints),
     research.md (decisions), quickstart.md (test scenarios)
   - **If mockup-backed UI is in scope**: locate every approved reference through
     paths declared by the selected spec/design artifacts and, when necessary,
     recursively within FEATURE_DIR. Load each matching
     `<mockup-basename>.binding.md` sidecar defined by
     `.agent/workflows/mockup-implementation.md` so task generation knows the
     declared binding context, scoped variants, and fidelity-affecting unknowns.
     If an approved reference predates the sidecar rule and the sidecar is
     missing, follow that workflow's **Legacy Approved Mockup Metadata
     Migration** procedure. If task-generation scope cannot create the sidecar,
     generate a prerequisite metadata-migration task and block governed UI
     implementation until it is completed; never infer the missing facts.
   - Note: Not all projects have all documents. Generate tasks based on what's
     available.

3. **Execute task generation workflow**:
   - Load plan.md and extract tech stack, libraries, project structure
   - Load spec.md and extract user stories with their priorities (P1, P2, P3,
     etc.)
   - If data-model.md exists: Extract entities and map to user stories
   - If contracts/ exists: Map endpoints to user stories
   - If research.md exists: Extract decisions for setup tasks
   - For mockup-backed UI, map each approved reference and binding sidecar to the
     user story/UI implementation it governs. A fidelity-affecting `UNKNOWN` is a
     pre-implementation blocker, not a value to infer in the task text.
   - Generate tasks organized by user story (see Task Generation Rules below)
   - Generate required rendered visual-evidence tasks for every mockup-backed UI
     story as defined below
   - Generate separate accessibility-evidence tasks when a governed story
     requires accessibility labels or semantics
   - Generate dependency graph showing user story completion order
   - Create parallel execution examples per user story
   - Validate task completeness (each user story has all needed tasks,
     independently testable)

4. **Generate tasks.md**: Use `.specify/templates/tasks-template.md` as
   structure, fill with:
   - Correct feature name from plan.md
   - Phase 1: Setup tasks (project initialization)
   - Phase 2: Foundational tasks (blocking prerequisites for all user stories)
   - Phase 3+: One phase per user story (in priority order from spec.md)
   - Each phase includes: story goal, independent test criteria, tests (if
     requested), implementation tasks, required mockup visual-evidence tasks when
     that story changes UI governed by an approved mockup, and separate
     accessibility-evidence tasks when governed labels/semantics are in scope
   - Final Phase: Polish & cross-cutting concerns
   - All tasks must follow the strict checklist format (see Task Generation
     Rules below)
   - Clear file paths for each task
   - Dependencies section showing story completion order
   - Parallel execution examples per story
   - Implementation strategy section (MVP first, incremental delivery)

5. **Persist to agent tracking**: Copy the generated `tasks.md` into the agent's
   brain artifacts directory as `task.md` so the task checklist is tracked
   across conversations. Use the artifact metadata type `task`.

6. **Create reviewable artifact**: Create a reviewable copy of `tasks.md` in the
   agent's brain artifacts directory as `tasks-{BRANCH_NAME}.md` so the user can
   leave inline comments. Use `IsArtifact: true` with `ArtifactType: other`.
   When calling `notify_user`, include this artifact path in `PathsToReview`.

7. **Report**: Output path to generated tasks.md and summary:
   - Total task count
   - Task count per user story
   - Parallel opportunities identified
   - Independent test criteria for each story
   - Mockup-backed UI stories and their required visual-evidence tasks
   - Governed stories requiring separate accessibility-evidence tasks
   - Suggested MVP scope (typically just User Story 1)
   - Format validation: Confirm ALL tasks follow the checklist format (checkbox,
     ID, labels, file paths)

Context for task generation: $ARGUMENTS

The tasks.md should be immediately executable - each task must be specific
enough that an LLM can complete it without additional context.

## Task Generation Rules

**CRITICAL**: Tasks MUST be organized by user story to enable independent
implementation and testing.

**Tests are OPTIONAL**: Only generate test tasks if explicitly requested in the
feature specification or if user requests TDD approach.

**Mockup evidence is NOT optional testing**: When a user story changes UI governed
by an approved mockup, generate required visual-evidence task(s) regardless of
whether automated tests were requested. The constitution's **Visual completion
evidence** principle and `.agent/workflows/sprint-issue.md` are authoritative for
the evidence gate.

For each mockup-backed UI story, the required visual-evidence task set MUST:

- depend on the governed UI implementation being complete;
- capture a rendered baseline side-by-side or overlay comparison against the
  approved reference at its declared viewport/component context;
- capture rendered evidence for every responsive, theme, RTL/Arabic, and
  enlarged-text variant that the binding sidecar or story scope requires;
- record references to the evidence and report **functional status** separately
  from **visual fidelity status**; and
- remain incomplete when a required rendering cannot be produced, with the
  blocker stated explicitly rather than treating source inspection as visual
  proof.

When the governed mockup/story requires accessibility labels or semantics,
generate a **separate accessibility-evidence task**. That task MUST:

- depend on the governed UI implementation being complete;
- inspect the relevant accessibility tree and use screen-reader verification or
  an appropriate automated accessibility check where available;
- record the exact evidence/reference and the accessibility-evidence status;
- remain incomplete when required accessibility behavior cannot be verified; and
- never treat screenshots or visual comparison as proof of accessibility labels,
  roles, names, states, relationships, or screen-reader behavior.

The generated checklist descriptions MUST name the concrete governed UI file
path or paths and the feature `tasks.md` path where evidence references/status
will be recorded. Do not invent a new product behavior or reinterpret
presentation-only mockup framing while writing the evidence tasks.

### Checklist Format (REQUIRED)

Every task MUST strictly follow this format:

```text
- [ ] [TaskID] [P?] [Story?] Description with file path
```

**Format Components**:

1. **Checkbox**: ALWAYS start with `- [ ]` (markdown checkbox)
2. **Task ID**: Sequential number (T001, T002, T003...) in execution order
3. **[P] marker**: Include ONLY if task is parallelizable (different files, no
   dependencies on incomplete tasks)
4. **[Story] label**: REQUIRED for user story phase tasks only
   - Format: [US1], [US2], [US3], etc. (maps to user stories from spec.md)
   - Setup phase: NO story label
   - Foundational phase: NO story label
   - User Story phases: MUST have story label
   - Polish phase: NO story label
5. **Description**: Clear action with exact file path

**Examples**:

- ✅ CORRECT: `- [ ] T001 Create project structure per implementation plan`
- ✅ CORRECT:
  `- [ ] T005 [P] Implement authentication middleware in src/middleware/auth.py`
- ✅ CORRECT: `- [ ] T012 [P] [US1] Create User model in src/models/user.py`
- ✅ CORRECT:
  `- [ ] T014 [US1] Implement UserService in src/services/user_service.py`
- ❌ WRONG: `- [ ] Create User model` (missing ID and Story label)
- ❌ WRONG: `T001 [US1] Create model` (missing checkbox)
- ❌ WRONG: `- [ ] [US1] Create User model` (missing Task ID)
- ❌ WRONG: `- [ ] T001 [US1] Create model` (missing file path)

### Task Organization

1. **From User Stories (spec.md)** - PRIMARY ORGANIZATION:
   - Each user story (P1, P2, P3...) gets its own phase
   - Map all related components to their story:
     - Models needed for that story
     - Services needed for that story
     - Endpoints/UI needed for that story
     - If tests requested: Tests specific to that story
     - If approved mockups govern changed UI: required rendered visual-evidence
       task(s) after the corresponding UI implementation
     - If governed accessibility labels/semantics are in scope: separate
       accessibility-evidence task(s) after the corresponding UI implementation
   - Mark story dependencies (most stories should be independent)

2. **From Contracts**:
   - Map each contract/endpoint → to the user story it serves
   - If tests requested: Each contract → contract test task [P] before
     implementation in that story's phase

3. **From Data Model**:
   - Map each entity to the user story(ies) that need it
   - If entity serves multiple stories: Put in earliest story or Setup phase
   - Relationships → service layer tasks in appropriate story phase

4. **From Setup/Infrastructure**:
   - Shared infrastructure → Setup phase (Phase 1)
   - Foundational/blocking tasks → Foundational phase (Phase 2)
   - Story-specific setup → within that story's phase

### Phase Structure

- **Phase 1**: Setup (project initialization)
- **Phase 2**: Foundational (blocking prerequisites - MUST complete before user
  stories)
- **Phase 3+**: User Stories in priority order (P1, P2, P3...)
  - Within each story: Tests (if requested) → Models → Services → Endpoints →
    Integration → required mockup visual evidence → required accessibility
    evidence when applicable
  - Each phase should be a complete, independently testable increment
- **Final Phase**: Polish & Cross-Cutting Concerns
