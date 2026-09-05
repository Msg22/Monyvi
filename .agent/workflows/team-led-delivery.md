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
4. monitor, mentor, resolve overlaps, and reassign ready work;
5. review evidence and specialist findings;
6. coordinate integration, verification, and handoff.

Lead does not implement feature code, tests, specs, copy, mockups, migrations,
review fixes, or conflict patches. Workers own repository edits. Lead may do
read-only inspection, maintain conversation plan, task state, ledgers, and final
synthesis, and perform trusted Git integration for OpenCode output when that Git
mutation is explicitly authorized. If no eligible worker lane exists, pause
rather than implement.

Assign implementation conflicts to the relevant worker. Lead retains the task
graph, product/business/security/architecture decisions, independent
verification, cross-lane conflict integration, final PR review, and merge
authority. Commits, pushes, PRs, merges, and issue mutations remain subject to
Section 2; OpenCode Git integration is performed by the lead or another trusted
native integration owner, never by OpenCode itself.

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
  dependency, exclusive task ownership, and non-overlapping artifact/file
  ownership;
- one writer owns each artifact/file per wave, including shared indexes,
  schemas, migrations, translations, specs, and generated outputs;
- stop the affected lanes immediately if artifact/file ownership overlaps;
- link main `node_modules` in secondary worktrees; never install another tree;
- assign one external writer one complete task and one isolated worktree/branch;
  avoid fragile per-file micromanagement inside that worker's exclusively owned
  artifact set, but never use this flexibility to permit concurrent writers on
  the same artifact;
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

### Execution Pools

The approved execution pools are:

- Native Codex subagents;
- Normal ChatGPT;
- OpenCode `bai/glm-5.3-flash`;
- OpenCode `bai/qwen3.8-flash`.

Select the worker by required context, demonstrated capability, risk, cost, and
current availability. Verify runtime, authentication, exact model identifier,
tools, and required permissions before dispatch; a configured name does not
prove availability.

Target **at least 80% of eligible execution workload** across Normal ChatGPT,
`bai/glm-5.3-flash`, and `bai/qwen3.8-flash` combined. Eligible workload
includes substantial and large tasks when the worker has the required context,
tools, permissions, and capability evidence. This is an allocation target, not a
delegation mandate: never route final authority, unpublished-local-dependent
work, or a task a worker demonstrably cannot perform merely to hit the target.
Track the target over meaningful execution work rather than file count or number
of dispatches.

Do not statically confine GLM or Qwen to narrow task categories. Route
adaptively and update capability evidence from actual results. Every assignment
requires **positive capability evidence** for each material capability the task
will use. The absence of a recorded unsupported capability is not evidence of
support. Clear unsupported capability excludes tasks that require it; current
qualification shows `bai/glm-5.3-flash` lacks image input through this OpenCode
path, so image-dependent work must route elsewhere until that capability is
requalified. Unsupported visual input must not block unrelated source, test,
documentation, or implementation work.

External models may implement already-approved financial, schema, sync,
security, architecture, authentication/RLS, or migration work when the task
contract contains the authoritative decision and an independent appropriate
specialist verifies the result. They must never invent, choose, approve, or
silently change those decisions.

Normal ChatGPT may own complex remote coding, tests, documentation, GitHub
issues, branches, and PRs when explicit user authorization covers the mutation,
the immutable remote base and complete context are supplied, and the task has no
unpublished local dependency. Lead monitors through the task/thread and PR diff,
independently verifies the result, and retains merge control. Never ask Normal
ChatGPT to review or change local work that has not been pushed.

Before first dispatch to each external provider/model pool in a task, obtain
explicit user opt-in and record the approved data-sharing boundary.
Authorization may cover later bounded dispatches only while provider, model
pool, data class, and purpose remain inside that recorded boundary.
Auto-triggering team-led workflow never grants third-party disclosure.

Before any OpenCode write dispatch, confirm the exact
provider/model/runtime/tool/permission-profile combination is currently
write-eligible and not under incident revocation. A new task or worktree does
not reset configuration-wide revocation.

External lanes do not consume native subagent slots. They still consume lead
review and integration capacity. Cap concurrency by ready independent work with
safe ownership, not available runtimes. One external worker owns one complete
task, one persistent session or thread, and one exclusive isolated
worktree/branch responsibility. Artifact/file ownership across concurrent
writers remains non-overlapping, with one writer per artifact per wave. Define
task/worktree scope and protected paths; do not force a brittle per-file
allowlist inside the artifact set the worker exclusively owns. Stop on ownership
overlap.

Lead retains control of integration and merges under Section 2. OpenCode never
commits, pushes, opens or merges PRs, or performs other Git/GitHub mutations; a
trusted native integration owner performs authorized Git work. Normal ChatGPT
may perform explicitly authorized remote GitHub mutations.

When OpenCode is selected, load
[`$opencode-team-delegation`](../../.agents/skills/opencode-team-delegation/SKILL.md)
and follow its qualification, security, dispatch, monitoring, and evidence
contract. Treat third-party delegation packages as references only unless
separately reviewed and approved; they are not workflow dependencies.

### External Worker Checkpoints And Learning

Mentor external workers through persistent-session checkpoints rather than
restarting on every miss. These are pause gates when specified below, not merely
asynchronous status reports:

1. The worker pauses after plan/assumptions and intended scope. The lead must
   explicitly accept this checkpoint before implementation edits begin.
2. Where TDD or debugging applies, the worker presents failing-test or
   reproduction evidence, pauses, and waits for explicit lead acceptance before
   production implementation begins.
3. When the task brief requires an interim diff/risk checkpoint, the worker
   pauses there and waits for explicit lead acceptance before continuing.
4. Verification evidence is inspected before acceptance.
5. The final full diff and completion report are inspected before acceptance.

Observe structured status, messages, tool results, and diffs. Do not claim
access to or request hidden chain-of-thought. Send bounded corrections in the
same session/thread when the lane remains safe and recoverable.

Sensitive-data exposure, unauthorized scope access/write, or another security
boundary breach immediately aborts the lane and revokes write eligibility for
the compromised provider/model/runtime/tool/permission-profile combination
across all tasks pending incident review and requalification. Starting another
task must not bypass this revocation. A user-authorized canary waiver cannot
waive or override this rule.

For ordinary rule drift or a materially wrong but safe direction, correct
explicitly and continue the same session when recoverable. After three
materially identical rule failures on the same model/task lane, mark that lane
failed and reassign. One failed task does not permanently disqualify a model
from unrelated capability.

Timeouts guide task size, checkpoint frequency, and timeout budget; they do not
alone permanently disqualify a model. A recoverable timed-out observation should
continue in the same session after status is rechecked.

## 7. Ownership Brief And Context

Every task brief states:

- persona, objective, and reason;
- complete task/worktree responsibility, source of truth, and protected or
  forbidden paths/actions;
- exclusive artifact/file ownership for the wave and any shared-artifact owner;
- inputs, dependencies, and applicable workflows;
- positive evidence for every material capability used by the task;
- acceptance criteria, evidence, and verification;
- external-provider data-sharing boundary when applicable;
- explicit checkpoint pause gates;
- escalation/stop conditions and expected completion report.

For write work include:

> You are not alone in the codebase. Own the complete assigned task inside your
> isolated worktree/branch and only the artifacts assigned to you for this wave.
> Make whatever cohesive in-scope edits those exclusively owned artifacts
> genuinely require, but do not cross protected paths, another owner's
> responsibility, or another writer's artifact/file ownership. Stop and report
> any ownership overlap.

One task/worktree has one write owner at a time, and one writer owns each
artifact/file per wave. Reviewers stay read-only. Complete-task ownership never
permits overlapping concurrent edits to the same artifact. Briefs must be
self-contained. Use smallest inherited context that preserves correctness:

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

Native slot capacity is not the execution target because external lanes do not
consume native subagent slots. Fill only ready ownership-safe work, use external
lanes aggressively enough to pursue the Section 6 allocation target, and keep
independent review capacity for high-risk work. Multiple writers are allowed
only when task/worktree ownership, artifact/file ownership, state, and merge
dependencies are genuinely independent. One writer owns each artifact per wave;
stop affected lanes immediately when overlap is discovered.

Reuse a completed worker through follow-up when context and skills fit the next
task. Continue a recoverable external task in its same persistent session. Spawn
replacement only for material role change or failed lane; retire finished native
worker when slot is needed. Never start downstream work merely because capacity
is free.

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
none overrides constitution. Material coding drift returns to approval. Preserve
existing visual-gate ownership, but do not mark visual completion without
side-by-side or overlay rendered screenshot evidence against the approved
reference. Report functional readiness and visual fidelity as separate statuses.

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

For external workers, the Section 6 pause gates also apply: plan/assumptions
must receive explicit lead acceptance before implementation edits, and
applicable Red/reproduction evidence must receive explicit lead acceptance
before production implementation. A task-required interim diff/risk checkpoint
also requires explicit lead acceptance before work continues.

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

External implementation of approved financial, schema, sync, security,
architecture, authentication/RLS, or migration work requires an independent
appropriate specialist before acceptance.

### Handoff Gate

Focused tests, affected Nx targets, lint/type checks, integration tests, honest
E2E/manual coverage, documentation, and atomic traceability must pass or carry
clear blocker. Never claim unrun validation.

## 11. Operations And Handoff

Lead updates user at kickoff, wave transition, blocker, review, and completion.
During active tool work, update at least every 60 seconds. Workers report
milestones, not command narration.

For external workers, record provider/model, immutable base, worktree/branch,
task scope, artifact/file ownership, positive material-capability evidence,
checkpoint acceptances, corrections, final result, independent verification,
permission-profile eligibility state, and any canary or waiver status. Retain
operational evidence only; never retain hidden reasoning, secrets, raw
unnecessary logs, or private data.

At every terminal OpenCode task outcome—accepted, rejected, cancelled, failed,
timed-out, or security-aborted—always tear down the model session, injected
credentials, and live loopback OpenCode server. These runtime resources are
never reusable. For a security-aborted task, retain only sanitized incident
evidence needed for incident review and requalification. For other terminal
outcomes, only non-sensitive resources such as the isolated worktree, adapter
configuration, and sanitized task metadata may remain reusable, with a recorded
owner, expiration, and mandatory cleanup deadline.

Worker report includes result, changed files/artifacts, tests and evidence,
assumptions, blockers, overlap/integration risks, and recommended next ready
task. At each wave end, lead checks evidence, ownership, tests, dependencies,
and ledgers before assigning more work.

Sensitive-data exposure, unauthorized scope access/write, or another security
boundary breach immediately aborts the affected external lane and revokes write
eligibility for the compromised provider/model/runtime/tool/permission-profile
combination across all tasks pending incident review and requalification. A new
task must not bypass this revocation, and user waiver cannot waive this rule.

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
