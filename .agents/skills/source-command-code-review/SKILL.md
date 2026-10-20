---
name: source-command-code-review
description:
  Comprehensive Monyvi branch or PR code review and remediation workflow. Use
  when the user asks to run the migrated source command `code-review`, review a
  current branch or pull request, audit changes against the Monyvi constitution,
  `.agent/rules`, feature specs, mockups, automated review comments, and then
  implement fixes on a follow-up branch or PR.
---

Apply the
[first-release scope filter](../../../docs/development-workflow.md#first-release-scope-and-rare-cases)
before turning a rare edge case or review suggestion into implementation work.
Major impact requires minimal protection; uncertain impact returns to Mohamed;
no major impact means defer. Preserve approved core behavior and existing
safeguards.

# source-command-code-review

Use this skill when the user asks to run the migrated source command
`code-review`.

This workflow reviews the user's active branch or pull request, produces
specific blocking and non-blocking feedback, then applies the necessary fixes on
a follow-up branch targeting the user's original work.

Every numbered section is mandatory. If a section does not apply, explicitly
write `N/A - <reason>` in the report.

## 1. Context Gathering

Before reviewing code, load all required project context.

### 1.1 Constitution

Read `.specify/memory/constitution.md`.

Treat it as the highest authority. It supersedes ad-hoc instructions and must be
enforced strictly.

### 1.2 Project Rules

Read every Markdown file under `.agent/rules/`.

List the rule files read in the review report as proof of compliance. Treat
these files as implementation standards for all changed files.

### 1.3 Feature Specs and Linked Issues

Identify the current branch name, then locate the matching folder under
`specs/`.

Preferred mapping: `specs/<branch-name>/`.

If there is no exact match, search for the closest active spec folder and state
the fallback clearly. Read every Markdown file in the selected folder, including
`spec.md` or `spc.md`, `plan.md`, `tasks.md`, and any additional `.md` files.

If no applicable spec folder exists, fetch the issue linked to the pull request
before reviewing code. Use GitHub metadata, PR body closing keywords, explicit
issue links, or available GitHub tools to identify the linked issue. Read the
issue title, body, acceptance criteria, task list, relevant labels, and any
maintainer comments that clarify scope.

Source-of-truth rules:

- Spec folder only: treat the spec folder as the source of truth for feature
  requirements.
- Linked issue only: treat the linked issue as the source of truth for feature
  requirements and business logic during the review, subject to the constitution
  and `docs/business/business-decisions.md`.
- Both spec folder and linked issue: treat both artifacts together as the source
  of truth. The implementation must satisfy every requirement in both.

If both a spec folder and linked issue exist, compare them before reviewing
code. Report any gap, contradiction, missing acceptance criterion, or mismatched
business rule between them as a review finding. Do not approve until the gap is
resolved or explicitly accepted by Mohamed.

## 2. Code Analysis

Identify the target branch or pull request and extract the full changed-file
list and diff before opening implementation files.

Every subsection below must produce output in the report. If no issue is found
for a subsection, write `No violations found`.

### 2.1 Constitution Compliance

For every changed file, identify which constitution principles apply and
validate strict compliance.

Produce a PASS/FAIL checklist for these eight checks:

1. Architecture and data flow
   - Offline-first behavior uses WatermelonDB first and network second.
   - Core calculations do not depend on API availability.
   - Required sync fields exist where applicable.
2. Business logic
   - Behavior matches `docs/business/business-decisions.md`.
   - No undocumented or assumed financial rules are introduced.
3. Type safety
   - No `any`.
   - All functions have explicit return types.
   - No unsafe non-null assertions.
   - External data is validated with Zod where applicable.
4. Layer separation
   - No business logic in components or lifecycle hooks.
   - Database writes live in services or repositories.
   - Shared logic stays in `packages/logic`.
5. UI and styling
   - NativeWind classes are used correctly.
   - No hardcoded colors.
   - No invalid `isDark` styling ternaries.
   - UI fields match the actual schema.
   - For changed UI, follow `AGENTS.md`, `docs/design/design-system.md`, and
     `.agent/rules/styling-rules.md`: intrinsic scaled-text fit, 44/48 dp
     targets, readable semantic dark/RTL, appropriate keyboard/inset layout, and
     persistent page/modal notices rather than new feedback toasts.
6. Monorepo boundaries
   - Dependency direction remains `apps -> packages/logic -> packages/db`.
   - Package imports do not reverse boundaries.
7. Database and migrations
   - Schema changes use local SQL migrations in `supabase/migrations/`.
   - Generated schema and migration outputs are committed when required.
8. Code quality
   - No magic numbers or hardcoded business strings.
   - Tech debt is marked with `// TODO:`.
   - Naming conventions are followed.
   - No production `console.log`.

Any constitution violation makes the reviewed work not approvable until fixed.

### 2.2 Requirements Compliance

Verify code against the applicable source-of-truth artifacts:

- `spec.md` or `spc.md`, `plan.md`, and `tasks.md` when a spec folder exists.
- The linked GitHub issue when no spec folder exists.
- Both the spec folder and the linked GitHub issue when both exist.

When `tasks.md` exists, go through every task line by line and mark it:

```markdown
- [x] Task description - IMPLEMENTED in <file>
- [ ] Task description - NOT IMPLEMENTED - <reason>
- [~] Task description - PARTIALLY IMPLEMENTED - <what is missing>
```

When the linked issue is part of the source of truth, verify every stated
requirement, acceptance criterion, checklist item, and clarified business rule
from the issue. Use the same implemented / not implemented / partially
implemented format and cite the issue reference.

Check for missing functionality, incomplete tasks, deviations from the plan, and
changes under the wrong spec folder. Also check for code paths that implement
behavior not requested by either the spec folder or linked issue.

If any task, issue requirement, acceptance criterion, or clarified business rule
is not implemented and not explicitly justified, the reviewed work is not
approvable.

### 2.3 Rules Compliance

For every changed file, identify the relevant `.agent/rules/*.md` files and
validate compliance.

Each rules finding must cite the specific rule file, for example:
`.agent/rules/tailwindcss-best-practices.md`.

Check for rule violations, missing required patterns, incorrect implementations,
inconsistencies, and bypassed project standards.

### 2.4 Spec Quality and Completeness

Review the specs themselves, not only the implementation.

Detect missing requirements, undocumented edge cases, implicit behavior that
appears in code but not in the applicable spec or linked issue, UX gaps,
validation gaps, error-handling gaps, data constraints, and performance
requirements that should have been specified.

Also compare the spec folder and linked issue, when both exist, plus spec, plan,
and tasks for:

1. Spec to plan gaps.
2. Plan to tasks gaps.
3. Spec to tasks gaps.
4. Spec to issue gaps.
5. Issue to tasks gaps.
6. Conflicting names, data structures, flows, acceptance criteria, business
   rules, or definitions.

Use this format for spec-level issues:

```markdown
- Spec Gap: <title>
  - Files: `spec.md` / `plan.md` / `tasks.md`
  - Issue: <inconsistency or missing linkage>
  - Fix: <required alignment>

- Spec/Issue Gap: <title>
  - Files: `specs/<feature>/*` / `GitHub issue #<number>`
  - Issue: <gap or contradiction between the spec folder and issue>
  - Fix: <required alignment or owner decision>

- Missing Requirement: <title>
  - File: `spec.md`
  - Gap: <what is missing>
  - Suggestion: <what should be added>
```

Critical spec gaps that can lead to incorrect or incomplete implementation make
the reviewed work not approvable.

### 2.5 Approved Design Compliance

Apply this gate only to visual UI **changed by the reviewed diff** and governed
by an approved design. For unrelated/non-visual changes report
`N/A — no governed visual UI change`; do not demand mockup checks for other
feature surfaces. Map references through the approved spec/issue/feature README
rather than branch naming guesses.

For **future interactive designs**, open the actual **once-approved runnable
entry/version** and short README under `specs/<feature>/mockups/`. The runnable
design owns its own visual styling, spacing, state and responsive layout; the
README covers version, how to run, scenarios and native-only adaptations/limits.
Exercise relevant width/container fit, long labels, font scaling, interactions,
states, light/dark and EN/AR RTL. **No new HTML binding sidecar, separately
approved text description, SHA-256 bundle manifest, metadata/combined revision
approval, or legacy verifier run is required.** Confirm the same reviewed design
version actually governs the changed UI; if approval/version is unknown, mark
design authority unverified.

For **historically approved static/images only**, load the original approved
reference, matching historical `*.binding.md` and immutable approval evidence
for its original governed surface. Run the unchanged
`scripts/verify-mockup-binding.js` before consuming historical Binding Facts. If
the reviewed diff changes the verifier itself, do not trust a weakened
target-branch verifier; use the trusted original contract or independently
validate the historical reference/sidecar. The legacy migration procedure still
applies only to those historical references. Preserve all existing historical
artifact bytes.

Check only approved product UI, excluding preview controls, device framing,
browser chrome and export padding unless intentionally approved as product UI.
Compare these seven areas for each relevant surface:

1. Layout/component structure and hierarchy;
2. Spacing/alignment;
3. Typography/scale;
4. Colors/theming;
5. Components/icons;
6. Applicable visible states;
7. Interactions and transitions, including native-only differences.

**Native visual evidence:** compare actual RN/Expo **rendered screenshots**
against the **rendered approved runnable reference** (or historical image) at a
comparable reviewed context, plus relevant scoped variants. Verify required
screen-reader/accessibility semantics separately from screenshots. Source
inspections, mockup/browser screenshots, HTML controls and passing tests alone
do not prove native visual completion. Unperformed device/render checks stay
**NOT RUN / visually unverified**; Mohamed owns manual/device QA unless
explicitly authorized. Do not invent a visual pass.

For every mapped governed surface, report:

```text
Reference/version: <approved interactive revision or historical image>
UI surface/component: <path>
Layout/Spacing/Typography/Theme/Components/States/Interactions: PASS/FAIL/UNVERIFIED
Native rendered comparison: PASS/FAIL/NOT RUN
Scoped variants: PASS/FAIL/NOT RUN
Accessibility evidence: PASS/FAIL/NOT RUN/N/A
Functional readiness: <separate status>
Visual fidelity: COMPLETE/INCOMPLETE
Evidence/findings: <exact screen, state, discrepancy, fix>
```

A missing approved design/version, invalid historical binding, a material visual
mismatch or missing required native evidence makes the governed visual UI not
visually approvable. Preserve all other requirements/PR review, financial,
privacy, security and safety checks unchanged.

### 2.6 General Best Practices

Review beyond the constitution and rules for:

- React Native and Expo best practices.
- TypeScript strict-mode correctness.
- SOLID and clean-code violations.
- Duplication that creates real maintenance risk.
- Performance issues such as avoidable re-renders, missing cleanup, or N+1
  queries.
- Accessibility gaps.

### 2.7 Automated Review Comments

If reviewing a PR, fetch existing review comments and bot comments from tools
such as CodeRabbit, SonarCloud, ESLint bots, or CI annotations.

For each bot finding, explicitly categorize it:

- `Accept` - include it in the fix plan.
- `Defer` - add or preserve a `// TODO:` with justification.
- `Reject` - explain why it is incorrect or out of scope.

Avoid duplicate fixes.

## 3. Review Report Format

Lead with findings, ordered by severity. Use file and line references whenever
possible. In Codex app reviews, emit `::code-comment{...}` directives for
actionable inline findings when the user asked for comments or PR-style review.

Use these report sections:

```markdown
## Context Loaded

- Constitution: `.specify/memory/constitution.md`
- Rules read: <list>
- Spec folder: `specs/<branch-name>` or N/A
- Linked issue: `#<number>` or N/A
- Target diff: <branch or PR>

## Constitution Checklist

| Check                      | Status    | Notes |
| -------------------------- | --------- | ----- |
| Architecture and Data Flow | PASS/FAIL | ...   |
| Business Logic             | PASS/FAIL | ...   |
| Type Safety                | PASS/FAIL | ...   |
| Layer Separation           | PASS/FAIL | ...   |
| UI and Styling             | PASS/FAIL | ...   |
| Monorepo Boundaries        | PASS/FAIL | ...   |
| Database and Migrations    | PASS/FAIL | ...   |
| Code Quality               | PASS/FAIL | ...   |

## Findings

### Constitution Violations

- Violation: <title>
  - Principle: <constitution principle>
  - Location: <file + line>
  - Issue: <explanation>
  - Fix: <concrete solution>

### Rules Violations

- Violation: <title>
  - Rule: `.agent/rules/<file>.md`
  - Location: <file + line>
  - Issue: <explanation>
  - Fix: <suggestion>

### Specs Violations

- Violation: <title>
  - Spec: `spec.md` / `plan.md` / `tasks.md` / GitHub issue `#<number>`
  - Location: <file + line>
  - Issue: <missing or incorrect implementation>
  - Fix: <required implementation>

### Mockup Violations

- Mockup Violation: <title>
  - Mockup: `<mockup file name>`
  - Location: <file + line>
  - Issue: <difference from mockup>
  - Fix: <exact change required>

### Improvements

- Improvement:
  - Reference: <rule or principle if applicable>
  - Suggestion: <actionable suggestion>

## Task Verification

<line-by-line task status from `tasks.md` and linked issue acceptance criteria,
or N/A with reason>

## Automated Comments

<Accept/Defer/Reject list, or N/A>

## Functional Readiness

READY or NOT READY, with supporting test and behavior evidence.

## Visual Fidelity

COMPLETE, INCOMPLETE, or N/A, with the declared binding UI context and reason.

## Visual Evidence

- Approved reference: <path or N/A>
- Baseline rendered comparison: <side-by-side or overlay evidence path, or N/A>
- Scoped variants: <responsive, dark-mode, RTL/Arabic, and enlarged-text
  evidence paths, or N/A with reason>
- Accessibility: <accessibility-tree, screen-reader, or automated accessibility
  evidence, or N/A with reason>

## Approval Verdict

APPROVABLE or NOT APPROVABLE, with the blocking reasons.
```

## 4. Implement Fixes

After reporting findings, create a fix branch from the user's branch:

```bash
git switch -c agent-fixes/<original-branch-name>
```

Apply all required fixes for:

- Constitution violations.
- Spec gaps and incomplete tasks.
- Rules violations.
- Mockup violations.
- Accepted automated findings.

Keep fixes surgical. Do not refactor unrelated code. Preserve user changes you
did not make.

Verify with focused tests and checks that would have caught the original issues.
For approved-mockup UI fixes, capture the required side-by-side or overlay and
scoped-variant rendered evidence at the declared UI context.

## 5. Create Fix Pull Request

When the repository and credentials allow it, push the fix branch and create a
pull request with the base set to the user's original branch, or `main` if the
original branch was already merged.

The PR description must include:

- Checklist of fixes.
- Summary of violations resolved.
- Notes on deferred or rejected automated comments.
- Verification commands run and their results.

If push or PR creation is blocked by environment, permissions, missing remote,
or missing GitHub authentication, state the blocker and leave the branch and
working tree ready for the user.

## Final Approval Criteria

The reviewed work is not approvable if any of these remain:

- Constitution or applicable project-rule violations.
- Missing/incomplete tasks, linked issue requirements or spec coverage.
- Unresolved discrepancies between spec and linked issue.
- Type-safety, architecture, package boundaries, schema, migrations or
  data-safety failures.
- Governed changed UI lacks its once-approved runnable design revision, or a
  historical image surface lacks its originally valid sidecar/approval evidence.
- Material deviation from the approved design, or missing required native
  rendered comparison/scoped-variant/accessibility evidence.

Success requires the code and scope to match the constitution, project rules,
spec/linked issue and **approved interactive design itself** (or original
historical image binding). Future interactive designs require **no** separate
binding sidecar, hash tuple, metadata approval or second design approval.
Historical approved image/sidecar byte-verification rules remain unchanged for
their original surfaces. Report functional readiness, native visual fidelity and
accessibility statuses separately; do not claim evidence not run.
