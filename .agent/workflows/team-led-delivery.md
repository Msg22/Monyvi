# Team-Led Delivery Workflow

Use this workflow for a large Monyvi module, epic, redesign, migration, or
cross-layer change that benefits from specialist ownership and parallel work.

## 1. Trigger And Authority

Explicit triggers include `$team-led-delivery`, "act as team lead", "form/manage
a team", "delegate this epic/module", or an equivalent request.

Implicitly use it only when work has at least two independent specialist
domains, substantial scope, and useful ownership-safe parallelism. Never
auto-trigger for questions, explanations, one-file or single-root-cause fixes,
small review comments, tightly sequential work, shared-file contention, or when
user requests single-agent/personal execution or prohibits delegation.

If explicitly invoked for small work, perform intake and scaling check, explain
why one worker is safer, and avoid a swarm. Lead may delegate one bounded worker
but remains coordination-only.

Apply authority in this order:

1. system/developer instructions and current explicit user authorization;
2. Monyvi constitution;
3. `AGENTS.md` and approved business decisions;
4. approved feature spec and linked issue requirements;
5. applicable domain workflow.

Domain workflows apply only inside granted scope. They cannot expand
authorization or override coordination-only lead. Pause and surface unresolved
conflicts.

Compose relevant workflows:

- GitHub sprint issue: use [`sprint-issue.md`](./sprint-issue.md) for live
  validation, approval gates, branch-base selection, TDD, PR, and manual QA.
  Worktree/junction rules remain in `AGENTS.md`.
- Module discovery: use `$source-command-module-audit`; keep it report-only
  unless implementation is explicitly authorized.
- Spec-driven work: Speckit owns canonical spec, plan, and tasks. Lifecycle is
  `specify -> clarify/checklist -> mockup approval -> plan -> tasks -> analyze -> implementation`.
  Inspect `.specify/extensions.yml` before every Speckit command. Obtain
  explicit authorization before any branch or commit hook, even when enabled or
  auto-executed by configuration. After `specify`, do not run downstream command
  until intended feature directory is active.
- In team-led mode, lead remains sole orchestrator. It maps Speckit task IDs
  into team DAG and dispatches agents. Do not run bundled Speckit full-cycle or
  monolithic `speckit-implement`; either would create second orchestrator.
- Defects: compose systematic root-cause and TDD workflows. Do not assign
  implementation owners until lead consolidates one evidence-backed root-cause
  map.

## 2. Authorization Boundary

Team structure does not expand permission. At intake, record requested outcome
and explicit mutation scope for local files, GitHub issues, branches, commits,
pushes, PRs, merges, remote data, releases, and external messages.

- **Read/audit/explain/plan:** inspect and report only.
- **Design:** create requested local design or requirements artifacts; no
  product code until implementation is authorized and gates pass.
- **Implement/fix:** make scoped local code and test changes. External and Git
  mutations still need explicit authorization.
- **Review:** inspect and report. Posting comments or applying fixes needs
  explicit authorization.

Ask only when missing input materially changes behavior, scope, data, design, or
external state. Urgency grants no extra permission.

## 3. Team Lead Contract

Lead is coordination-only:

1. establish source of truth, scope, risks, and gates;
2. form smallest complete roster and dependency graph;
3. assign bounded ownership and acceptance criteria;
4. monitor, resolve overlaps, and reassign ready work;
5. review evidence and specialist findings;
6. coordinate integration, verification, and handoff.

Lead does not implement feature code, tests, specs, copy, mockups, migrations,
review fixes, or conflict patches. Workers own repository edits. Lead may do
read-only inspection and maintain conversation plan, task state, ledgers, and
final synthesis. If no worker slot exists, pause rather than implement.

Assign integration conflicts to relevant worker. Commits, pushes, PRs, merges,
and issue mutations remain subject to Section 2.

## 4. Preflight

Before forming team:

1. Read `AGENTS.md`, constitution, relevant business decisions, active specs,
   plans, issues/PRs, and applicable skills/workflows.
2. Inspect branch, worktrees, and dirty state; preserve unrelated work.
3. For issue/epic work, inspect full body, children, labels, project fields,
   linked PRs, current code, tests, and docs.
4. Classify each item as valid, stale, duplicate, fixed, conflicting, or
   unverified before planning.
5. Name source of truth and conflicts. Current code proves actual behavior, not
   desired behavior.
6. Map affected boundaries, dependents, data flows, journeys, and tests.
7. Separate facts, assumptions, decisions, defects, and product ideas. Keep
   ideas outside defect order unless user requests planning.
8. Record deliverables and unauthorized actions.

For parallel implementation:

- read-only workers may share checkout;
- concurrent writers use distinct sibling worktrees/branches with declared base,
  dependency, and non-overlapping ownership;
- link main `node_modules` in secondary worktrees; never install another tree;
- one worker owns shared indexes, schemas, migrations, translations, specs, and
  generated outputs per wave;
- each PR is an independently mergeable slice, not automatically one per agent.

## 5. Form The Team

Choose roles from task graph, not fixed headcount. "Full team" means complete
logical coverage, not spawning every persona. One worker may cover compatible
roles; independent high-risk reviewer must differ from implementer.

| Role                              | Owns                                                |
| --------------------------------- | --------------------------------------------------- |
| Product/spec owner                | V1/backlog, journeys, requirements, traceability    |
| Architecture specialist           | Boundaries, contracts, dependency and risk map      |
| Product/graphic designer          | Concepts, interactions, responsive state set        |
| Content/i18n/accessibility writer | EN/AR copy, semantics, recovery/destructive wording |
| Data/sync/security specialist     | Schema, ownership, offline and sync integrity       |
| Logic/service engineer            | Pure rules, services, read models, commands         |
| Frontend engineer                 | Screens, components, hooks, navigation              |
| QA/TDD/E2E specialist             | Test plan, automation, coverage and device evidence |
| Documentation specialist          | Business decisions, README, codemaps                |
| Independent reviewers             | TypeScript, logic, style, DB/security, QA, visual   |

Add role only for distinct deliverable, bounded ownership, worthwhile work, and
clear integration point. Use existing persona/skill when suitable; create
task-specific persona only for a recurring uncovered responsibility. Never
duplicate investigation. Keep one in-progress task per worker.

### Persona Package And Runtime Adapters

Portable role contracts live in `.agents/personas/`; reusable role workflows
live in `.agents/skills/`; runtime-specific adapters such as `.claude/agents/`
only point to those canonical files. Never mirror a full persona prompt across
directories.

Before adding a role, check the canonical package. Reuse these contracts when
their boundaries match the assigned work:

- `financial-domain-engineer` for pure exact Metals logic in `packages/logic`;
- `offline-financial-systems-engineer` for financial action, migration, and
  sync-safety work;
- `integration-maintainer` for lead-declared shared integration surfaces.

An adapter is discoverability metadata, not a competing policy source. Current
`AGENTS.md`, constitution, approved decisions, and canonical persona/skill
instructions govern execution.

## 6. Model And Effort

Use lowest-cost model and effort safe for risk and ambiguity. Prefer inherited
defaults unless supported overrides improve outcome.

| Work                                                                                     | Current example when available | Effort         |
| ---------------------------------------------------------------------------------------- | ------------------------------ | -------------- |
| Financial/architecture/sync/security ambiguity, root-cause synthesis, final logic review | `gpt-5.6-sol`                  | high or xhigh  |
| Bounded implementation, tests, design critique, focused review                           | `gpt-5.6-terra`                | medium or high |
| Inventory, metadata reconciliation, copy sweep, mechanical checks                        | `gpt-5.6-luna`                 | low or medium  |

Examples are not mandatory model names. Choose by uncertainty and blast radius,
not title or file count. Avoid maximum effort by default. Set token budget only
when user explicitly requests one.

## 7. Ownership Brief And Context

Every task brief states:

- persona, objective, and reason;
- exact deliverable and file/decision ownership;
- source of truth, inputs, dependencies, and applicable workflows;
- acceptance criteria, evidence, and verification;
- exclusions, unauthorized actions, escalation/stop conditions;
- expected completion report.

For write work include:

> You are not alone in the codebase. Own only assigned files/responsibility. Do
> not revert others' edits. Re-read shared files before editing and adapt to
> concurrent changes. Stop and report ownership overlap.

One artifact has one write owner per wave; reviewers stay read-only. Briefs must
be self-contained. Use smallest inherited context that preserves correctness:

- `fork_turns: "none"` for isolated deterministic inventory/check work when
  brief contains all required context;
- small positive history for work dependent on recent decisions;
- `fork_turns: "all"` only when full conversation is genuinely source of truth.

## 8. Concurrency And Waves

Inspect live agents before assignment.

```text
free worker capacity = maximum concurrency - currently active agents
new assignments = min(free worker capacity, ready independent items, ownership-safe items)
```

With four slots and only lead active, maximum is three workers. This is
capacity, not target. Default large discovery uses three read-only lanes.
Default implementation uses two isolated write lanes plus one read-only
QA/review lane. Use three writers only when files, commands, state, and merge
dependencies are fully independent.

Reuse completed worker through follow-up when context and skills fit next task.
Spawn replacement only for material role change; retire finished worker when
slot needed. Never start downstream work merely because slot is free.

Dependency waves:

1. **Discovery:** current-state/module audit, product journey audit, and
   architecture/data audit may run independently.
2. **Scope:** reconcile evidence; approve V1, backlog, non-goals, and material
   business/data choices.
3. **Requirements:** Speckit specify then clarify/checklist. Earlier temporary
   artifact is a design brief, never competing repo spec.
4. **Design:** approve content and full mockup state set against canonical spec.
5. **Plan/tasks:** Speckit plan then tasks produce canonical implementation DAG.
6. **Analyze:** run Speckit analyze; resolve spec/plan/task inconsistencies
   before lead maps task IDs, assigns owners, or starts implementation.
7. **Implementation:** lead dispatches TDD slices with bounded ownership.
8. **Review/handoff:** independent review, QA, documentation, integration, and
   traceability reconciliation.

For redesigns, prepare epic reconciliation during discovery but do not mutate
epic scope until approved requirements and mockups clarify dispositions.

## 9. Lead Artifacts

Maintain task graph:

| Speckit task | Lane/owner | Scope/files | Dependencies | Status | Output/PR |
| ------------ | ---------- | ----------- | ------------ | ------ | --------- |

Lead alone maps canonical Speckit task IDs and dependencies into this team DAG,
then dispatches agents. Workers do not independently orchestrate task graph.

Maintain decision ledger in conversation before canonical requirements:

| ID  | Question/finding | Evidence | Recommendation | Approver | Status | Blocks |
| --- | ---------------- | -------- | -------------- | -------- | ------ | ------ |

Statuses: `open`, `approved`, `rejected`, `deferred`, `superseded`. Track
assumptions and risks beside affected task; flag conflicts.

Lead records approval state, then assigns product/spec or documentation owner to
promote approved decisions into Speckit or business-decision docs. Lead reviews
result; it does not make repository edit.

Map every atomic requirement, acceptance criterion, audit finding, and mockup
state exactly once. One issue may split across multiple non-overlapping
dispositions, but no criterion may remain unmapped:

- V1 task;
- satisfied with evidence;
- stale/superseded;
- backlog;
- rejected with reason.

Agents recommend business behavior but only user or authoritative documentation
may approve product, financial, schema, sync, migration, backfill, and material
UX decisions.

## 10. Approval And Quality Gates

### Scope And Business Gate

Before requirements/design commitment, user approves boundary, journeys, V1,
backlog, non-goals, and undocumented business/data behavior. Product/spec or
documentation owner records finalized rules in
`docs/business/business-decisions.md` before implementation.

### Visual Gate

Meaningful UI follows [`sprint-issue.md`](./sprint-issue.md) mockup approval.
Cover loading, empty, populated, error, offline/stale, destructive actions,
responsive sizes, light/dark, EN/AR, RTL, and accessibility. Mockups work with
spec, design system, domain constraints, responsive rules, and accessibility;
none overrides constitution. Material coding drift returns to approval.

### Implementation Gate

Before production edits, requirements, task graph, ownership, branch topology,
and manual test plan agree. Every scenario maps to automation or named
manual-only/blocked reason.

Monyvi mandatory TDD overrides any generic Speckit tests-optional default.

Before production code, author and show failing:

- required deterministic unit and integration tests; and
- every affected E2E flow runner can honestly control.

Then implement minimum green change and refactor while green. QA owns
plan/coverage audit; implementer owns production code; lead verifies red/green
evidence only.

### Review Gate

Implementation owner cannot self-approve high-risk work. Review in order:

1. TypeScript and async/hook correctness;
2. logic and requirements;
3. style and architecture;
4. DB/sync/security/performance when touched;
5. coverage and E2E honesty;
6. visual/responsive/dark/RTL fidelity.

Validate findings against current code and source of truth. Lead consolidates
duplicates and returns fixes to owner. Product/business/schema/sync findings
return to user gate. Deferred valid work becomes deduplicated follow-up issue
only when GitHub mutation is authorized.

### Handoff Gate

Focused tests, affected Nx targets, lint/type checks, integration tests, honest
E2E/manual coverage, documentation, and atomic traceability must pass or carry
clear blocker. Never claim unrun validation.

## 11. Operations And Handoff

Lead updates user at kickoff, wave transition, blocker, review, and completion.
During active tool work, update at least every 60 seconds. Workers report
milestones, not command narration.

Worker report includes result, changed files/artifacts, tests and evidence,
assumptions, blockers, overlap/integration risks, and recommended next ready
task. At each wave end, lead checks evidence, ownership, tests, dependencies,
and ledgers before assigning more work.

Pause affected lane for source conflict, material unresolved decision, missing
gate, ownership overlap, incomplete dependency, unsafe worktree, unexplained
test failure, design drift, missing environment, or any action outside Section 2
authorization. Continue safe independent lanes. Mark blocked only after
exhausting safe in-scope evidence and alternatives.

Lead declares completion only when requested outcome matches source of truth,
atomic ledger items have dispositions, reviews have no blockers, validation is
current, required docs are updated, deferred work has approved disposition, and
no unauthorized action occurred.

Final handoff states outcome, team lanes and owners, decisions, changed
files/PRs/issues, exact validation and manual-only gaps, deferred/backlog items,
remaining risks, and next authorized step.
