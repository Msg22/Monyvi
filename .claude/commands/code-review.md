---
description: Perform a comprehensive code review on a branch/PR, add comments
---

# Code Review & Fix Workflow

This workflow guides the agent to perform an expert-level code review on the
user's active branch or Pull Request, provide specific feedback, and then
automatically create a new PR containing the proposed fixes targeting the user's
original work.

## Approved Mockup Binding Gate

When this workflow consumes an approved mockup or sidecar, run
`node scripts/verify-mockup-binding.js <path/to/mockup.binding.md>` before using
binding facts, rendered evidence, or approval status. Require exit status zero:
current image bytes, exact UTF-8/LF Binding Facts bytes, both approved
revisions, and approval evidence for the approved combined
`Binding approval revision` must all verify. A failed verifier blocks governed
UI work; follow `.agent/workflows/mockup-implementation.md` to renew approval.

> [!CAUTION] **EVERY SECTION IN THIS WORKFLOW IS MANDATORY. SKIPPING ANY SECTION
> IS A CRITICAL FAILURE. The agent MUST execute EVERY numbered step, EVERY
> sub-step, and EVERY check listed below. If a section does not apply, the agent
> MUST explicitly state "N/A — [reason]" in the output. Silence is NOT
> acceptable.**
>
> **FAILURE TO FOLLOW THIS WORKFLOW EXACTLY WILL RESULT IN AN INCOMPLETE
> REVIEW.**

---

## 1. Context Gathering (MANDATORY — DO NOT SKIP)

**BEFORE looking at ANY code**, the agent MUST load and internalize ALL of the
following context. The agent MUST NOT proceed to Step 2 until ALL context files
have been read.

### 🔹 1.1 Project Constitution (HIGHEST AUTHORITY)

- **READ** `e:\Work\My Projects\Monyvi\.specify\memory\constitution.md`
- Treat it as the **absolute highest authority** — overrides everything else
- All principles are **non-negotiable and MUST be enforced strictly**
- **FAILURE TO READ THIS FILE = REVIEW IS INVALID**

### 🔹 1.2 Project Rules (MANDATORY — ALL FILES)

- **READ EVERY FILE** under: `e:\Work\My Projects\Monyvi\.agent\rules\`
- Treat these rule files as the **source of truth for implementation standards**
- The agent MUST list which rule files it read as proof of compliance
- **FAILURE TO READ ALL RULE FILES = REVIEW IS INCOMPLETE**

### 🔹 1.3 Specs (CRITICAL — DO NOT SKIP)

- Identify the current branch name
- Locate the matching folder under `specs/`
  - The folder name MUST **exactly match the branch name**

  **Example:**
  - Branch: `017-dashboard-ui-polish`
  - Folder: `specs/017-dashboard-ui-polish`

- **READ ALL Markdown files** inside that folder:
  - `spec.md` (or `spc.md`)
  - `plan.md`
  - `tasks.md`
  - Any other `.md` files present

- Treat these files as the **source of truth for feature requirements**
- **FAILURE TO READ SPEC FILES = REVIEW CANNOT ASSESS COMPLETENESS**

---

## 2. Code Analysis (ALL SUB-SECTIONS ARE MANDATORY)

> [!IMPORTANT] **EVERY sub-section (2.1 through 2.7) MUST be completed. Each
> sub-section MUST produce output in the review report. If a sub-section finds
> no issues, the agent MUST explicitly state "✅ No violations found" for that
> section. EMPTY SECTIONS ARE NOT ACCEPTABLE — they indicate the agent skipped
> the check.**

- Identify the target branch or Pull Request to be reviewed
- Extract all changed files (PR diff)

### 🔍 2.1 Constitution Compliance (MANDATORY — ZERO TOLERANCE)

For **EVERY** change in the PR, the agent MUST:

- Identify which principles from `constitution.md` apply
- Validate strict compliance
- **ANY violation = PR is NOT APPROVABLE**

#### Required Checks (MUST CHECK ALL 8):

1. **Architecture & Data Flow**
   - Offline-first enforced (WatermelonDB first, network second)
   - No API-dependent core calculations
   - Required sync fields exist

2. **Business Logic**
   - Matches `docs/business/business-decisions.md`
   - No assumptions or undocumented logic

3. **Type Safety (NON-NEGOTIABLE — ZERO EXCEPTIONS)**
   - No `any`
   - Explicit return types on ALL functions
   - Safe null handling (NO `!` operator)
   - `zod` validation for external data

4. **Layer Separation**
   - NO business logic in components or hooks
   - Services handle ALL DB writes
   - `packages/logic` contains shared logic ONLY

5. **UI & Styling**
   - NativeWind (Tailwind) used correctly
   - No hardcoded colors (use palette constants)
   - No `isDark` misuse
   - UI strictly matches schema

6. **Monorepo Boundaries**
   - No invalid cross-package imports
   - Dependency direction respected

7. **Database & Migrations**
   - ALL schema changes via local SQL migration files
   - No direct DB modifications outside migrations
   - Generated files committed

8. **Code Quality**
   - No magic numbers (use named constants)
   - No missing TODOs for tech debt
   - Proper naming conventions (PascalCase types, camelCase vars)
   - No `console.log` in production code

> [!WARNING] **The agent MUST produce a checklist in the report showing
> PASS/FAIL for each of the 8 checks above. Skipping any check is a REVIEW
> FAILURE.**

---

### 📂 2.2 Specs Compliance (MANDATORY — TASK-BY-TASK VERIFICATION)

> [!CAUTION] **The agent MUST go through EVERY task in `tasks.md` line by line
> and verify that it was implemented. This is NOT optional. A high-level "looks
> good" is NOT ACCEPTABLE.**

- Review changed files under the `specs/` folder
- Ensure the correct folder is used (matches branch name)

For all code changes:

- Verify full alignment with:
  - `spec.md` (specification) — every requirement implemented
  - `plan.md` (implementation approach) — architecture followed
  - `tasks.md` (execution checklist) — **EVERY task verified**

#### Check for:

- Missing functionality
- Incomplete tasks
- Deviations from plan or spec

#### Output Format:

For EACH task in `tasks.md`, the agent MUST output:

```
- [x] Task description — IMPLEMENTED in <file>
- [ ] Task description — NOT IMPLEMENTED — <reason>
- [~] Task description — PARTIALLY IMPLEMENTED — <what's missing>
```

🚨 **Blocking Rule:**

- If ANY task in `tasks.md` is not implemented or justified → PR is **NOT
  APPROVABLE**

---

### 📏 2.3 Rules Compliance (MANDATORY — PER-FILE CHECK)

> [!IMPORTANT] **For EVERY changed file in the PR, the agent MUST identify which
> rule files apply and validate compliance. The agent MUST cite the specific
> rule file (e.g., `CLAUDE.md (rules section) — tailwindcss-best-practices.md`)
> for each finding.**

For every changed file:

- Identify relevant rules from `CLAUDE.md`
- Validate that implementation follows them

#### Check for:

- Violations of defined rules
- Missing required patterns
- Incorrect implementations
- Inconsistencies across the codebase
- Code bypassing rules

---

### 🧩 2.4 Spec Quality & Completeness Analysis (MANDATORY)

> [!CAUTION] **The agent MUST NOT just validate code against specs. The agent
> MUST ALSO critically evaluate the specs themselves. Skipping this section
> means the review failed to catch spec-level issues that could lead to bugs.**

The agent MUST not only validate implementation against specs, but also
**critically evaluate the quality and completeness of the specs themselves**.

---

#### 🔍 2.4.1 Detect Missing Requirements / Features

Based on:

- The agent's understanding of the project
- The feature/issue being implemented
- Existing patterns in the codebase

The agent MUST:

- Identify **missing requirements or edge cases** not defined in `spec.md`
- Detect **implicit behaviors** implemented in code but not documented
- Highlight **UX gaps** (states, errors, loading, empty states, etc.)
- Identify **technical requirements** that should exist but are not specified:
  - Validation rules
  - Error handling
  - Data constraints
  - Performance considerations

📌 Output as:

- ⚠️ Missing Requirement:
  - 📄 File: `spec.md`
  - 🧨 Gap: What is missing
  - 💡 Suggestion: What should be added

---

#### 🔗 2.4.2 Detect Gaps Between Spec, Plan, and Tasks

The agent MUST ensure consistency across:

- `spec.md` (what to build)
- `plan.md` (how to build)
- `tasks.md` (execution steps)

#### Check for ALL 4:

1. **Spec → Plan Gaps**
   - Requirements in `spec.md` not reflected in `plan.md`
   - Plan includes logic not defined in spec

2. **Plan → Tasks Gaps**
   - Planned steps not broken down into tasks
   - Tasks missing for critical parts of implementation

3. **Spec → Tasks Gaps**
   - Features defined in spec but missing in tasks
   - Tasks that implement undefined or unclear requirements

4. **Inconsistencies**
   - Conflicting definitions between files
   - Different naming for same concepts
   - Mismatched data structures or flows

---

### 🚨 Blocking Rule

- If there are **critical gaps** between `spec.md`, `plan.md`, and `tasks.md`
  that can lead to incorrect or incomplete implementation:

  → Mark the PR as **NOT APPROVABLE**

---

### 📌 Output Format

- ❌ Spec Gap:
  - 📄 Files: `spec.md` / `plan.md` / `tasks.md`
  - 🧨 Issue: Description of inconsistency or missing linkage
  - ✅ Fix: What needs to be aligned or added

- ⚠️ Improvement:
  - 💡 Suggestion: Enhancement to spec clarity or completeness

---

### 🎨 2.5 Mockups Compliance (MANDATORY — DO NOT SKIP UNDER ANY CIRCUMSTANCES)

> [!CAUTION] **THIS SECTION WAS PREVIOUSLY SKIPPED. THIS IS UNACCEPTABLE. The
> agent MUST load ALL mockup images, compare them against the implementation,
> and produce DETAILED findings. If the `mockups/` folder exists, EVERY mockup
> MUST be analyzed. "I loaded the mockups" without producing findings is a
> FAILURE.**

The agent MUST validate that the implementation **visually and structurally
matches the approved mockups**.

---

#### 📂 2.5.1 Locate Mockups

- Identify the current branch name
- Locate the corresponding spec folder: `specs/<branch-name>/`
- Inside the spec folder, locate: `mockups/`
- **Load ALL mockup images** inside this folder
- If no `mockups/` folder exists, explicitly state: "No mockups found — N/A"

---

#### 🔍 2.5.2 Compare Implementation vs Mockups

For **EACH** mockup image, the agent MUST:

- Identify which component/screen it corresponds to
- Read the component code
- Compare the implementation against the mockup **structurally and visually**

#### Validate ALL 7 (produce a finding for EACH):

1. **Layout & Structure**
   - Component hierarchy matches mockup
   - Sections are present and correctly ordered

2. **Spacing & Alignment**
   - Padding, margins, and spacing are consistent
   - Elements are aligned as in mockup

3. **Typography**
   - Font sizes, weights, and hierarchy match
   - Text placement is correct

4. **Colors & Theming**
   - Colors match exactly (no deviations)
   - No hardcoded or incorrect colors

5. **Components & UI Elements**
   - Buttons, inputs, cards match design
   - Correct sizes, shapes, and positions

6. **States**
   - Loading, empty, error states (if shown in mockups)
   - Disabled/active states

7. **Interactions (if applicable)**
   - Modal behavior, sheets, navigation flows

---

#### 🚨 2.5.3 Detect Gaps

The agent MUST identify:

- Missing UI elements
- Incorrect layouts
- Styling deviations
- Incomplete screens
- Any visual inconsistency with mockups

---

#### 📌 Output Format (MANDATORY — USE THIS EXACT FORMAT)

For EACH mockup:

```
#### Mockup: <filename>
Corresponds to: <component/screen name>

| Check | Status | Notes |
|---|---|---|
| Layout & Structure | ✅/❌ | ... |
| Spacing & Alignment | ✅/❌ | ... |
| Typography | ✅/❌ | ... |
| Colors & Theming | ✅/❌ | ... |
| Components & UI | ✅/❌ | ... |
| States | ✅/❌ | ... |
| Interactions | ✅/❌ | ... |
```

Violations:

- ❌ Mockup Violation:
  - 🖼️ Mockup: `<mockup file name>`
  - 📍 Location: `<file + line>`
  - 🧨 Issue: What differs from the mockup
  - ✅ Fix: Exact change required to match the mockup

- ⚠️ Improvement:
  - 💡 Suggestion: Visual or UX enhancement aligned with mockups

---

#### 🚨 Blocking Rule

- If implementation does NOT match mockups: → PR is **NOT APPROVABLE**

---

#### 🔧 Fix Requirements

When creating the Fix PR:

- Update the UI to match the mockups **pixel-perfect**
- Do NOT introduce new design decisions
- Do NOT "improve" the design unless explicitly instructed
- Treat mockups as the **single source of truth for UI**

---

#### ✅ Success Criteria

- Implementation visually matches mockups with **no noticeable differences**
- All mockup screens are fully implemented
- UI is ready for pixel-perfect validation

---

### 🧠 2.6 General Best Practices (MANDATORY)

> [!IMPORTANT] **The agent MUST check for general best practice violations
> BEYOND what the constitution and rules cover. This includes React Native
> performance, accessibility, memory leaks, and common anti-patterns.**

Strictly enforce:

- **React Native & Expo best practices**
- **TypeScript strict mode**
- **SOLID principles**
- **Clean code & DRY**
- **Performance** (unnecessary re-renders, memory leaks, missing cleanup)
- **Accessibility** (missing a11y props, missing semantic roles)

---

## 2.7 Review Existing Bot/Automated Comments (MANDATORY)

> [!IMPORTANT] **The agent MUST fetch PR comments and explicitly categorize EACH
> bot finding as Accept/Defer/Reject with justification. "I checked the
> comments" without listing findings is NOT ACCEPTABLE.**

If the PR has existing review comments from automated tools (e.g.,
**CodeRabbit**, **SonarCloud**, **ESLint bot**), the agent MUST:

- Fetch all PR comments
- Filter bot comments (e.g., `coderabbitai[bot]`)

For EACH bot finding, explicitly state:

- **Accept** → include in fix plan (cite the finding)
- **Defer** → add `// TODO:` with explanation (justify why)
- **Reject** → document reason in PR description (explain why)

Avoid duplicate fixes.

---

## 3. Submit Review Feedback (MANDATORY)

> [!CAUTION] **The agent MUST use the EXACT output format below. Using a custom
> format (e.g., "Critical/Major/Minor" without the required emoji markers) is a
> WORKFLOW VIOLATION. The format exists so findings are scannable and
> actionable.**

- Provide **clear, structured, actionable feedback**

### 📌 Format for Violations (USE THIS EXACTLY)

#### Constitution Violations

- ❌ Violation: <title>
  - 📄 Principle: <constitution principle>
  - 📍 Location: <file + line>
  - 🧨 Issue: explanation
  - ✅ Fix: concrete solution

#### Rules Violations

- ❌ Violation: <title>
  - 📄 Rule: `CLAUDE.md`
  - 📍 Location: <file + line>
  - 🧨 Issue: explanation
  - ✅ Fix: suggestion

#### Specs Violations

- ❌ Violation: <title>
  - 📄 Spec: `spec.md / plan.md / tasks.md`
  - 📍 Location: <file + line>
  - 🧨 Issue: missing or incorrect implementation
  - ✅ Fix: required implementation

#### Mockup Violations

- ❌ Mockup Violation: <title>
  - 🖼️ Mockup: `<mockup file name>`
  - 📍 Location: <file + line>
  - 🧨 Issue: what differs from the mockup
  - ✅ Fix: exact change required

#### Improvements

- ⚠️ Improvement:
  - 📄 Reference: (rule or principle if applicable)
  - 💡 Suggestion

---

## 4. Implement Fixes (MANDATORY)

> [!IMPORTANT] **The agent MUST create a fix branch and apply ALL identified
> fixes. Stopping at the review report without implementing fixes is INCOMPLETE
> WORK.**

- Create a new branch from the user's branch:
  - `agent-fixes/<original-branch-name>`

- Apply fixes for:
  - Constitution violations
  - Specs gaps
  - Rules violations
  - Mockup violations
  - Accepted bot findings

- Ensure final code:
  - Fully complies with constitution
  - Fully implements specs
  - Follows all rules
  - Matches all mockups

- Commit with clear messages

---

## 5. Create Fix Pull Request (MANDATORY)

- Push branch to remote

- Create PR with:
  - **Base branch = user's original branch** (or `main` if already merged)

- Include:
  - Checklist of fixes
  - Summary of violations resolved
  - Notes on deferred/rejected bot comments

---

## 🚨 Final Approval Criteria

The PR is **NOT APPROVABLE** if ANY of the following exist:

- Constitution violations
- Missing or incomplete tasks from `tasks.md`
- Spec deviations
- Type safety violations
- Incorrect architecture or layering
- Broken monorepo boundaries
- Missing migrations or DB inconsistencies
- **Mockup deviations** (UI does not match approved designs)

---

## ✅ Success Criteria

- Code fully matches:
  - `constitution.md`
  - `CLAUDE.md`
  - `specs/<branch-name>/*`
  - `specs/<branch-name>/mockups/*`

- No missing features
- No architectural violations
- Clean, maintainable, production-ready code
- **UI pixel-perfect match with mockups**
