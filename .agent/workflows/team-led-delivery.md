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
- for every external writer, derive an enforced readable-source allowlist from
  the user-approved source/data-sharing boundary or use a sanitized checkout;
- derive a concrete workspace-relative writable file/directory allowlist from
  the assigned exclusive artifact set. Use exact files and minimum owned
  directory prefixes needed for cohesive in-boundary edits or new files; require
  this writable boundary to be contained within the readable-source boundary and
  never grant arbitrary repository-root read or write access;
- link main `node_modules` in secondary worktrees; never install another tree;
- assign one external writer one complete task and one isolated worktree/branch;
  avoid fragile per-file micromanagement inside that worker's exclusively owned
  artifact set, but never use this flexibility to permit concurrent writers on
  the same artifact or reads/writes outside the enforced boundaries;
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

#### Executor Preference And ChatGPT Remote Readiness

Apply this preference to execution ownership after authorization, capability,
and safety checks. It does not replace independent review, trusted-native
verification, integration, or merge control:

1. **Normal ChatGPT first** when the complete task can be executed from
   published remote state and every requested remote mutation is explicitly
   authorized.
2. **Approved OpenCode GLM/Qwen lanes next** for eligible isolated local
   execution under the OpenCode controls in this workflow and its supporting
   skill.
3. **Native Codex subagents only when required** by unpublished local state,
   device/runtime access, trusted-native verification, integration, or merge
   control.

This ordering governs the preferred execution owner. It does not override
capability evidence, ownership safety, the allocation target below, or final
authority. A trusted-native worker may still verify or integrate externally
owned work without becoming that task's implementation owner. All external
output requires independent verification, and the lead retains merge authority.

Before every Normal ChatGPT execution dispatch, classify the remote-readiness
packet as **existing-PR work** or **pre-PR branch creation**.

Both packet forms MUST record:

- exact repository;
- authoritative spec, approved mockup, business-decision, and workflow paths;
- ownership/non-overlap boundary;
- acceptance criteria and explicit non-goals;
- required checks and relevant review-thread IDs when they already exist;
- explicitly authorized remote mutations; and
- expected completion report.

For **existing-PR work**, the packet additionally requires:

- exact PR number and base branch;
- head branch and immutable full head SHA; and
- confirmation that the target head branch has no active writer.

For **pre-PR branch creation**, the packet instead requires:

- immutable base branch and full base SHA;
- intended new branch name; and
- confirmation that the intended branch ownership boundary has no competing
  writer.

A PR number or head SHA is not required before the new branch exists. Once the
branch is created, refresh the packet with the actual head branch and immutable
full head SHA before further branch mutations. Once a PR is opened, add the
exact PR number and base branch and re-read the immutable head SHA before any
follow-up PR work.

Do not dispatch while any field required for the selected topology is unknown,
the recorded immutable base/head SHA no longer matches remote state, or a
competing writer owns the target. Never dispatch Normal ChatGPT to an existing
branch with an active writer.

If required context exists only locally, a trusted local owner must safely
publish the minimum required context to the authorized remote source before
ChatGPT dispatch, then refresh the applicable immutable base or head SHA. If the
context cannot be safely published, use an eligible local executor instead.

Provide ChatGPT only the packet and published authoritative context needed for
the task. Its result remains subject to the same independent verification and
authorization gates as other external output, and the lead retains merge
authority.

Target **at least 80% of eligible execution workload** across Normal ChatGPT,
`bai/glm-5.3-flash`, and `bai/qwen3.8-flash` combined. Eligible workload
includes substantial and large tasks when the worker has the required context,
tools, permissions, and capability evidence. This is an allocation target, not a
delegation mandate: never route final authority, unpublished-local-dependent
work, or a task a worker demonstrably cannot perform merely to hit the target.
Track the target over meaningful execution work rather than file count or number
of dispatches.

Do not statically confine GLM or Qwen to narrow task categories. Route
adaptively and update capability evidence from actual results. Ordinary
production assignments require **positive capability evidence** for each
material capability the task will use. Capability evidence is bound to the exact
provider-prefixed model ID, **immutable provider model revision/build**,
OpenCode/runtime version, tool surface/version set, and every
permission/environment dimension material to that capability. A moving display
alias is not sufficient identity, and the absence of a recorded unsupported
capability is not evidence of support.

A tightly sandboxed **qualification dispatch** is the only exception to that
ordinary evidence gate. It may omit prior positive evidence only for one named
capability that the dispatch is explicitly designed to qualify. Every other
external-worker capability used by the benchmark must already have positive
evidence or be removed from the external path. Qualification dispatches use only
synthetic/sanitized fixtures or an enforced user-approved readable-source
boundary, deny unrelated capabilities, do no production implementation, and
terminate after recording qualification evidence.

If the immutable model revision/build changes, invalidate all capability
evidence for the prior revision. If another bound runtime/tool/permission or
environment dimension changes, invalidate every capability record that could be
affected. Negative evidence is revision-bound too. The recorded GLM image-input
limitation applies only to the immutable revision/build that produced it; until
the active revision has positive image-input evidence, do not assign
image-dependent work.

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

Before any OpenCode dispatch, record the provider/model ID, immutable model
revision/build, OpenCode/runtime, and tool surface/version set. Refuse dispatch
when the implicated provider/model revision/runtime/tool combination is under
incident quarantine. Security quarantine initially applies across read and write
modes and all permission profiles; a new task/profile cannot bypass it. Restore
eligibility only after incident review and requalification. Incident review may
narrow quarantine to a permission-profile-local cause only when evidence proves
that narrower cause and the intended restored configuration has passed
requalification.

The disposable bounded-write canary remains the recommended default. A
predeclared denial probe inside the isolated synthetic canary is expected
qualification evidence when the synthetic target and expected denial are
recorded in advance and enforcement blocks the action before any unauthorized
mutation, disclosure, or side effect. Quarantine applies only if the probe
unexpectedly succeeds, produces an unauthorized side effect, touches real data
outside the procedure, or the worker attempts a boundary crossing that was not
part of the authorized canary.

When the user explicitly waives the canary, bind the waiver to the **exact
task** plus provider, model ID, immutable model revision/build, OpenCode/runtime
version, exact tool surface/version set, permission-profile identifier/hash,
sandbox/network boundary, readable-source-allowlist fingerprint, and
writable-allowlist fingerprint. Any enforcement-relevant change invalidates the
waiver and requires a fresh waiver or canary before more writes.

A canary-waived first real write is still possible when repository-edit
capability is the only material capability lacking positive evidence. All other
material external-worker capabilities must already be proven. For a TDD task,
make the **failing test itself** the provisional representative edit: after
plan/assumptions approval, allow only that test edit inside the writable
allowlist, pause immediately, and have the trusted native owner inspect the
path, readable/writable enforcement, permission behavior, and diff. Only after
the provisional edit checkpoint is accepted may the test run to produce Red. A
trusted-native runner executes Red unless the external worker already has
positive test-execution capability evidence. The Red result then receives
explicit lead acceptance before any production implementation edit. For a
non-TDD task, use one small representative allowlisted edit and the same
provisional edit/boundary acceptance. An accepted provisional checkpoint becomes
positive edit-capability evidence only for that immutable configuration and does
not supply evidence for unrelated capabilities.

External lanes do not consume native subagent slots. They still consume lead
review and integration capacity. Cap concurrency by ready independent work with
safe ownership, not available runtimes. One external worker owns one complete
task, one persistent session or thread, and one exclusive isolated
worktree/branch responsibility. Artifact/file ownership across concurrent
writers remains non-overlapping, with one writer per artifact per wave. Enforce
the readable-source boundary derived from user opt-in and the concrete writable
allowlist derived from exclusive artifacts; do not force brittle per-file
micromanagement inside that boundary, but do not permit arbitrary repository
reads or writes. Stop on ownership or boundary overlap.

Prefer a dedicated loopback OpenCode server per task with task-scoped
credentials. If a shared loopback server is necessary, record its server ID and
active task/session registry. Terminal teardown must remove the terminal task's
session and task-scoped credentials immediately without stopping a server still
needed by another recorded active session. Shut a shared server after its final
active session terminates. If the shared server/runtime is implicated in a
security incident, abort affected sessions and stop it immediately.

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
   explicitly accept this checkpoint before non-qualification production work
   begins.
2. A qualification dispatch runs only its named benchmark and stops after
   recording evidence; it never silently transitions to production work.
3. For a canary-waived provisional TDD task, the worker writes only the failing
   test as the provisional representative edit and pauses. The trusted native
   owner must accept the edit and readable/writable-boundary enforcement before
   the test is run for Red evidence.
4. The Red result is then reviewed and explicitly accepted before production
   implementation. A non-provisional TDD/debugging task follows the normal Red
   gate before production implementation.
5. For a provisional non-TDD task, the worker pauses immediately after its one
   representative allowlisted edit for trusted-native edit/boundary acceptance
   before any additional edit.
6. When the task brief requires an interim diff/risk checkpoint, the worker
   pauses there and waits for explicit lead acceptance before continuing.
7. Verification evidence is inspected before acceptance.
8. The final full diff and completion report are inspected before acceptance.

Observe structured status, messages, tool results, and diffs. Do not claim
access to or request hidden chain-of-thought. Send bounded corrections in the
same session/thread when the lane remains safe and recoverable.

Unexpected sensitive-data exposure, unauthorized readable-source access,
unauthorized scope/write, an unexpectedly successful synthetic canary denial
probe, or another security boundary breach immediately aborts the lane and
triggers the cross-profile quarantine above. A correctly denied predeclared
synthetic canary probe is qualification evidence and does not trigger
quarantine. User-authorized canary waiver cannot waive or override quarantine.

For ordinary rule drift or a materially wrong but safe direction, correct
explicitly and continue the same session when recoverable. After three
materially identical rule failures on the same model/task lane, mark that lane
failed and reassign. One ordinary failed task does not permanently disqualify a
model from unrelated capability; incident quarantine is the explicit exception.

Timeouts guide task size, checkpoint frequency, and timeout budget; they do not
alone permanently disqualify a model. A recoverable timed-out observation should
continue in the same session after status is rechecked.

## 7. Ownership Brief And Context

Every task brief states:

- persona, objective, and reason;
- dispatch mode: ordinary production or qualification, with the qualification
  target capability when applicable;
- complete task/worktree responsibility, source of truth, and protected or
  forbidden paths/actions;
- exclusive artifact/file ownership for the wave and any shared-artifact owner;
- concrete readable-source allowlist/fingerprint derived from user-approved
  source/data-sharing scope, or sanitized-checkout identity;
- concrete writable file/directory allowlist/fingerprint derived from owned
  artifacts and contained within the readable boundary;
- provider/model ID, immutable model revision/build, OpenCode/runtime version,
  exact tool surface/version set, and permission-profile identifier/hash when an
  OpenCode lane is used;
- inputs, dependencies, and applicable workflows;
- positive evidence for every material capability used by an ordinary task, plus
  qualification/provisional evidence status where applicable;
- exact canary/waiver identity and invalidation conditions when applicable;
- loopback server ID and dedicated/shared mode when applicable;
- acceptance criteria, evidence, and verification;
- external-provider data-sharing boundary when applicable;
- explicit checkpoint pause gates;
- escalation/stop conditions and expected completion report.

For write work include:

> You are not alone in the codebase. Own the complete assigned task inside your
> isolated worktree/branch and only the artifacts assigned to you for this wave.
> Read/search only sources inside the approved readable-source boundary. Make
> whatever cohesive in-scope edits the exclusively owned artifacts and derived
> writable allowlist genuinely permit, but do not cross protected paths, another
> owner's responsibility, another writer's artifact/file ownership, or either
> enforced boundary. Stop and report any overlap or out-of-boundary need.

One task/worktree has one write owner at a time, and one writer owns each
artifact/file per wave. Reviewers stay read-only. Complete-task ownership never
permits overlapping concurrent edits to the same artifact or unbounded
repository reads/writes. Briefs must be self-contained. Use smallest inherited
context that preserves correctness:

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
only when task/worktree ownership, artifact/file ownership, readable/writable
boundaries, state, and merge dependencies are genuinely independent. One writer
owns each artifact per wave; stop affected lanes immediately when overlap is
discovered.

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

For an external worker that already has edit capability evidence, the normal
Section 6 Red gate applies before production implementation. For a canary-waived
**provisional first-time writer** on a TDD task, the failing test is the
provisional representative edit: approve that test edit and boundary enforcement
first, then run/review and explicitly accept Red, and only then allow production
implementation. A task-required interim diff/risk checkpoint also requires
explicit lead acceptance before work continues.

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

For OpenCode workers, record provider/model ID, immutable model revision/build,
OpenCode/runtime version, exact tool surface/version set, immutable base,
worktree/branch, task scope, artifact/file ownership, derived readable-source
allowlist/fingerprint or sanitized-checkout identity, derived writable
allowlist/fingerprint, positive material-capability evidence,
qualification-dispatch target/outcome when used, provisional first-write status
when used, exact canary/waiver binding, loopback server ID/mode, checkpoint
acceptances, corrections, final result, independent verification,
quarantine/eligibility state, and terminal status. Retain operational evidence
only; never retain hidden reasoning, secrets, raw unnecessary logs, or private
data.

At every terminal OpenCode task outcome—accepted, rejected, cancelled, failed,
timed-out, or security-aborted—terminate that task's model session and
**task-scoped** injected credentials immediately. For a dedicated per-task
loopback server, terminate the server immediately too. For an intentionally
shared server, remove the terminal task/session and its credentials immediately,
update the active-session registry, and keep the server only while another
recorded active task/session still needs it; shut it down after the final active
session terminates. If the shared server/runtime is implicated in a security
incident, abort every affected session and terminate that server immediately.

For a security-aborted task, retain only sanitized incident evidence needed for
incident review and requalification. For other terminal outcomes, only
non-sensitive resources such as the isolated worktree, adapter configuration,
and sanitized task metadata may remain reusable, with a recorded owner,
expiration, and mandatory cleanup deadline.

Worker report includes result, changed files/artifacts, tests and evidence,
assumptions, blockers, overlap/integration risks, and recommended next ready
task. At each wave end, lead checks evidence, ownership, tests, dependencies,
and ledgers before assigning more work.

Unexpected sensitive-data exposure, unauthorized readable-source access,
unauthorized scope/write, an unexpectedly successful synthetic canary denial
probe, or another security boundary breach immediately aborts the affected
OpenCode lane and quarantines the implicated provider/model
revision/runtime/tool combination across read/write modes and all permission
profiles pending incident review and requalification. A correctly denied
predeclared synthetic canary probe is qualification evidence and does not
trigger quarantine. A new task, session, worktree, or profile cannot bypass
quarantine. Incident review may narrow the quarantine only after proving a
profile-local cause and successful requalification for the intended restored
configuration. User waiver cannot waive quarantine.

Pause affected lane for source conflict, material unresolved decision, missing
gate, ownership overlap, invalidated waiver/evidence, readable/writable-boundary
change, incomplete dependency, unsafe worktree, unexplained test failure, design
drift, missing environment, or any action outside Section 2 authorization.
Continue safe independent lanes. Mark blocked only after exhausting safe
in-scope evidence and alternatives.

Lead declares completion only when requested outcome matches source of truth,
atomic ledger items have dispositions, reviews have no blockers, validation is
current, required docs are updated, deferred work has approved disposition, and
no unauthorized action occurred.

Final handoff states outcome, team lanes and owners, decisions, changed
files/PRs/issues, exact validation and manual-only gaps, deferred/backlog items,
remaining risks, and next authorized step.
