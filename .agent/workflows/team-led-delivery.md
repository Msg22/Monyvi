# Team-Led Delivery Workflow

Use this workflow for a large Monyvi module, epic, redesign, migration, or
cross-layer change that benefits from specialist ownership and parallel work.

OpenCode is an approved execution pool only after explicit user opt-in and only
when every dispatch loads
[`opencode-team-delegation.md`](./opencode-team-delegation.md), which owns
OpenCode runtime and usage policy, model selection, limits, fallback, and
session rules. When Mohamed explicitly requests a Codex-planned implementation
handoff, use
[`opencode-implementation-handoff.md`](./opencode-implementation-handoff.md) and
still load the delegation workflow.

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
- PR comment follow-up: use [`pr-comment-followup.md`](./pr-comment-followup.md)
  for thread discovery, classification, fix/reply/resolve behavior, and
  completion reporting. Keep that review behavior canonical there; Normal
  ChatGPT handoffs reference the workflow instead of copying its rules.
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

The lead optimizes total delivery cost: elapsed time, token use, duplicated
work, review effort, and defect risk. Saving tokens never waives tests, safety
gates, independent review, or acceptance criteria. Prefer concise briefs that
reference authoritative sources, bounded tasks, small necessary context,
milestone reports, and the lowest-cost capable worker. Do not repeatedly ask
workers to rediscover the same facts or run broad searches after the source of
truth is known. Do not spend more coordination tokens than a small task saves;
use the single-worker scaling path when appropriate.

Lead does not implement feature code, tests, specs, copy, mockups, migrations,
review fixes, or conflict patches. Workers own repository edits. Lead may do
read-only inspection and maintain conversation plan, task state, ledgers, and
final synthesis. If no eligible worker lane exists, pause rather than implement.

Assign implementation conflicts to the relevant worker. Lead retains the task
graph, product/business/security/architecture decisions, independent
verification, cross-lane conflict integration, final PR review, and merge
authority. Commits, pushes, PRs, merges, and issue mutations remain subject to
Section 2.

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
9. Estimate elapsed work for discovery, implementation, review, verification,
   integration, and likely rework. Record an estimate or range, its assumptions,
   wall-clock start time, next checkpoint, and the evidence that will change it.
   Count worker time and waiting time when they affect delivery; parallel time
   is elapsed time, not the sum of worker hours.
10. Classify each task by remote versus local/device requirements. Check the
    relevant pools' runtime, authentication, tools, and ability to start the
    task; record unavailable pools. Apply the quota policy in Section 6.

If the credible total elapsed estimate exceeds four hours, tell Mohamed before
starting substantive work. Give the task breakdown, main uncertainty, reason for
the duration, proposed smaller first slice, and the decision needed to continue.
Wait for his direction. Read-only intake needed to make this estimate is
allowed. Do not silently split a greater-than-four-hour task into smaller labels
to evade this gate.

At every checkpoint and at least every 30 minutes of active work, compare
elapsed time, remaining work, and latest forecast with the estimate. If the
forecast first exceeds four hours on a task not cleared for that duration, or
exceeds the communicated/approved estimate by more than 25% or 30 minutes
(whichever happens first), stop dispatching and stop affected work promptly.
Tell Mohamed elapsed time, completed work and links/evidence, remaining work,
new estimate, cause of overrun, and a concrete continuation or reduced-scope
choice. Resume only after direction. A worker blocked in a long tool call may
need a safe stop; preserve its state and report the delay rather than claiming
it stopped instantly.

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
- assign one external writer one complete bounded slice and one isolated
  worktree/branch; a successor may own the remaining local verification or
  implementation after explicit handoff; avoid fragile per-file micromanagement
  inside that worker's exclusively owned artifact set, but never use this
  flexibility to permit concurrent writers on the same artifact or reads/writes
  outside the enforced boundaries;
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

Keep role, workflow, and runtime separate:

- `.agents/personas/*.md` are tracked, portable **role contracts**. This is a
  project convention, not an automatically discovered Codex agent directory.
- `.agents/skills/*/SKILL.md` are discoverable Codex **workflows**; load only
  the skills relevant to the task. `.agent/skills/` is a legacy collection and
  is not a Codex skill-discovery path. A role name does not auto-load a skill.
- `.codex/agents/*.toml` are Codex custom-agent definitions when present and
  available in the current host. `.claude/agents/*.md` are Claude-specific
  adapters. Neither path defines a portable role for Normal ChatGPT, OpenCode,
  or Antigravity. Do not copy their model choices, tool lists, or permissions
  into another runtime.

This repository is configured to track an audited set of Codex adapters:
`frontend-developer`, `senior-graphic-designer`, `database-reviewer`,
`typescript-reviewer`, `code-logic-reviewer`, `code-style-reviewer`,
`security-reviewer`, `devops-engineer`, and `visual-reviewer`. Other `.codex/`
content remains ignored local state and may not exist in a fresh worktree or
remote chat. Some older local definitions contain stale instructions that
conflict with `AGENTS.md` (including tests-first and migration commands). Do not
route by `agent_type` merely because a name appears in the current tool list.
Inspect its live definition and tracked status first; if stale or unavailable,
use a generic worker with a scoped role brief. Track and audit any future Codex
adapter before depending on it across checkouts.

| Lane                             | Portable role contract                                   | Relevant workflow/skill                                |
| -------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Frontend implementation          | `.agents/personas/frontend-developer.md`                 | Approved spec/mockup, TDD, and UI workflow             |
| Product/graphic design           | `.agents/personas/product-designer.md`                   | Sprint visual gate and applicable design skill         |
| Independent database review      | `.agents/personas/database-reviewer.md`                  | Migration/sync rules and review workflow               |
| Exact Metals logic               | `.agents/personas/financial-domain-engineer.md`          | `.agents/skills/financial-domain-engineering/SKILL.md` |
| Offline financial infrastructure | `.agents/personas/offline-financial-systems-engineer.md` | `.agents/skills/offline-financial-systems/SKILL.md`    |
| Shared integration               | `.agents/personas/integration-maintainer.md`             | `.agents/skills/integration-maintenance/SKILL.md`      |

### Available Specialist Personas

The lead may assign these seven personas when the task graph has a matching
owned deliverable or independent review. They are options, not a required
roster. The Codex name identifies the verified adapter; for other pools, use the
published portable contract where listed or a scoped role brief grounded in
`AGENTS.md`, the spec, and the assigned acceptance criteria.

| Persona / Codex agent     | Assign for                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `senior-graphic-designer` | Approved screen concepts, mockups, visual states, and design critique before implementation.                 |
| `typescript-reviewer`     | First independent pass on types, React hooks, async behavior, and offline boundaries.                        |
| `code-logic-reviewer`     | Behavior, failure paths, financial correctness, and spec coverage after TypeScript review.                   |
| `code-style-reviewer`     | Architecture, project conventions, and maintainability after logic review.                                   |
| `security-reviewer`       | Authentication, user scoping, RLS, sync trust boundaries, input handling, and secrets when touched.          |
| `devops-engineer`         | Owned CI, EAS, migration-pipeline, and release-configuration work within approved scope.                     |
| `visual-reviewer`         | Independent comparison of rendered screens and states with approved mockups; require actual visual evidence. |

Reviewers are read-only and independent of the implementer. The designer and
DevOps engineer may edit only their explicitly owned artifacts. Apply the review
order and quality gates in Section 10; do not assign every persona solely
because it is available.

For the six Codex-only reviewer/DevOps roles above, the tracked adapter is the
Codex role contract; give other execution pools a short task-specific role brief
instead of referring them to Codex runtime settings. For another role, use an
audited tracked source and make a short portable role brief before dispatch.
Keep one canonical contract per recurring role; runtime adapters may point to it
but must not mirror the full prompt.

At dispatch, name the role contract and exact path at the trusted governing
revision, the applicable skill/workflow, and the task-specific ownership and
acceptance criteria. Ask the worker to read those sources. For Normal ChatGPT,
the paths must be published on GitHub at that revision and the connector must be
able to fetch them. For OpenCode and Antigravity, include the same paths in
their bounded brief. For Codex, select a verified `agent_type` only when its
definition matches the role; otherwise use `worker` and the portable contract.
The persona changes focus, not authority, tools, model availability, effort,
data-sharing scope, or permission.

## 6. Model And Effort

Choose the execution pool by capability and authorization first, then the
lowest-cost model and effort that can meet the acceptance criteria. Estimate
risk, ambiguity, context size, local-tool need, expected iterations, and
verification burden. Prefer inherited defaults unless a supported override
improves the outcome. A cheap worker that repeatedly fails or requires a full
rewrite is not cheaper. Use these effort defaults only when the selected runtime
exposes the corresponding control:

| Work                                                                                              | Starting effort | Raise effort when                                    |
| ------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------- |
| Inventory, copy, narrow docs, mechanical changes                                                  | low             | sources conflict or a decision is needed             |
| Bounded implementation, tests, focused review                                                     | medium          | several modules or failure paths interact            |
| Financial rules, architecture, sync, security, migrations, unclear root cause, final logic review | high            | independently checked reasoning remains inconclusive |

Use xhigh or maximum only for a bounded hard question with a stated reason and
checkpoint. Never invent a model ID, effort flag, quota, price, or capability.
Check the current runtime's model list/help and record exact model, supported
effort setting, and rationale. If effort cannot be selected, record the actual
default rather than claiming an override. Set a token budget only when the user
explicitly requests one.

### Execution Pools

Default execution preference, after authorization, capability, and ownership
checks, is Normal ChatGPT, OpenCode, then Antigravity:

1. **Normal ChatGPT, including several independent user-created chats.** Give it
   the largest safe slice reachable through the GitHub connector: investigation,
   planning, complex reasoning, substantial code and test authoring, remote
   branch/PR work, documentation, and review. Task size or reasoning difficulty
   alone does not disqualify it. It cannot access this machine's checkout,
   device, or unpublished files. A later need for local verification does not
   disqualify it as implementation owner; reserve verification or integration as
   a named successor task.
2. **OpenCode paid or free models.** Use an available paid model for complex,
   medium or large work needing strong reasoning; use a capable free model for
   small to medium bounded work, routine checks, or unit tests. Choose the
   lowest-cost model and supported effort that meets the task criteria through
   [`opencode-team-delegation.md`](./opencode-team-delegation.md). Escalate
   based on observed failure or insufficient capability, not file count alone.
3. **Antigravity CLI (`agy`) with an available Gemini or Claude model.** When
   both requested choices are available and capable, prefer the user's Gemini
   3.8 Flash choice over Claude 4.6 for complex reasoning; Claude can own medium
   or large bounded tasks. These are preferences, not proof of model
   availability or measured superiority. Verify the exact model identifier,
   tools, permissions, and supported effort at dispatch.

Native Codex subagents are a fallback, not a routine fourth pool. Use one for an
assigned task only after checking the three primary pools and recording why none
can start that specific task safely and capably now: unavailable runtime or
authentication, a reported limit during attempted work, missing required
tools/context or permissions, or inability to access needed local/device state.
Do not use native subagents merely to fill slots or because implementation will
need later local checks. Recheck primary pools before each new native
assignment. A native subagent may perform trusted local verification,
integration, or independent review when no primary pool can perform that
specific task; this does not transfer implementation ownership.

Do not inspect, estimate, or route by remaining model quota before assignment.
Verify the chosen runtime, authentication, exact model, required tools, and
permissions, then require the first non-error response before treating the
worker as live. If a worker reports a quota or rate limit during work, stop that
writer, preserve its session and partial artifacts, and promptly hand unfinished
work to another capable model. Carry forward the task brief, branch/head,
completed changes, verification, remaining work, and limit error. Confirm the
former writer is stopped before another writer uses its worktree; keep writers
isolated when concurrent. Update the ownership ledger and verify the successor's
first response. Do not repeatedly retry the limited model, discard its work, or
print credentials or tokens.

For each candidate, make a short capability card before assignment: accessible
source (published GitHub versus local/dirty files), read/write tools, branch/PR
ability, shell/test/device access, model and effort controls, data boundary, and
observed reliability. Distinguish "connector is configured" from "this chat can
use it." Probe the exact required tools or inspect their contracts before
committing a lane. Match the task to demonstrated capability.

Several Normal ChatGPT chats may run concurrently when they own different
branches, files/artifacts, issue mutations, and dependency-safe slices. The lead
names one integration owner for shared outputs. Do not have parallel chats edit
the same branch or shared index/schema/translation file. Preserve review
capacity and account for concurrent usage, time, and integration cost. Multiple
sessions across or within other pools also require isolated branches/worktrees
and exclusive artifacts.

Before assigning Normal ChatGPT work, ask Mohamed to create the needed **N**
normal chats himself. Propose N concise chat names, each lane's objective and
owned artifact set, the reason parallel work is safe, and which GitHub connector
access each needs. Wait for the names/identities he returns; do not create those
chats on his behalf. Reuse an already supplied suitable chat when available and
ask only for additional chats if the plan changes. Record exact chat IDs and
ownership before sending any work. Resolve returned names with `list_threads` or
another supported listing; if titles are ambiguous, ask for a chat link or ID
instead of guessing. User-created chats and an ongoing authorized coordination
workflow permit messages within the agreed scope; do not infer permission to
message unrelated chats.

OpenCode is enabled only by explicit user opt-in, never by configuration alone.
Every OpenCode dispatch must load
[`opencode-team-delegation.md`](./opencode-team-delegation.md); that workflow
owns model selection, limit-response fallback, and session discipline without
re-stating team ownership, DAG, gates, or review rules from this file.

Antigravity (`agy`) is the third primary execution pool for available Gemini and
Claude models, subject to external-provider opt-in and the approved data-sharing
boundary. Per task, reuse one visible persistent conversation; verify the `agy`
path, authentication, exact model with `agy models`, supported effort with
`agy --help`, and permissions before dispatch. Distinguish an effort flag from
an effort label embedded in a model ID. When full repository permissions are
authorized, run with `--dangerously-skip-permissions --mode accept-edits`. On a
reported limit, preserve work and promptly hand off unfinished work under the
limit-response rule above. Never create a concurrent replacement writer in the
same worktree, and independently verify all output.

#### ChatGPT Remote Readiness

Prefer Normal ChatGPT for remote implementation when published state and
authorization support it. Separate later local verification or integration into
dependent tasks rather than moving the implementation to a native subagent. When
Normal ChatGPT cannot safely start, consider ready OpenCode, then Antigravity,
before the native fallback. For unpublished local state, device/runtime access,
or local verification, consider capable OpenCode and Antigravity local sessions
first. A local worker may verify or integrate externally owned work without
taking over its implementation. Keep independent review, trusted verification,
integration, and merge control with the lead; verify all external output before
acceptance.

##### Remote Context References And Volatile Handoff Facts

For Normal ChatGPT, authoritative remote repository context must be referenced
at an immutable **trusted governing revision**, not copied into every handoff or
read implicitly from a mutable branch. Default that revision to an immutable
full base commit independently selected as trusted, normally the target PR's
merge base or a freshly reviewed base-branch commit; a branch name alone is not
a governing revision. Another separately reviewed and explicitly approved
revision may be used instead. Reference the exact repository target, trusted
governing SHA, applicable workflow/rule/constitution/`AGENTS.md` paths,
applicable spec and business-decision paths, and the PR/issue context that the
worker must read. For PR-comment follow-ups, reference
[`pr-comment-followup.md`](./pr-comment-followup.md); its thread classification,
fix/reply/resolve order, safety rules, and completion report remain canonical
there.

The expected target head SHA identifies content to inspect or mutate; it does
not make that head authoritative governance. When the target PR or branch
changes a referenced governing file, the worker MUST apply the trusted-revision
version as instruction and inspect the head version only as content under
review. A newer governing revision may replace the base only when its immutable
SHA and approval are recorded explicitly in the handoff.

The handoff adds only facts that are unavailable or unsafe to infer from remote
state:

- exact expected immutable head/base SHA when required by the selected topology;
- exact immutable trusted governing SHA and any separately approved governing
  revision exception;
- current writer ownership and conflict state for mutable refs involved;
- local-only evidence that cannot safely be published remotely;
- explicitly authorized mutations;
- task-specific exceptions to the referenced remote rules; and
- task-specific stop conditions.

Do not restate remote workflow, rule, spec, business-decision, issue, or PR text
merely to make the prompt self-contained. Restate a remote rule only when it is
missing, stale, contradictory, or insufficient for the task, and identify that
reason explicitly. If required local-only context can be safely published,
publish only the minimum necessary context to the authorized remote source and
then reference it; otherwise use an eligible local executor.

##### Remote Task Topologies

Classify each Normal ChatGPT dispatch as **existing-PR work**,
**existing-branch-without-PR work**, **pre-PR branch creation**, or a
**non-branch remote task**.

Every handoff references the exact repository and relevant remote target
(PR/issue/ref), the immutable trusted governing revision, and the authoritative
paths at that revision needed for execution. The volatile additions above are
supplied only when applicable to that topology.

For **existing-PR work**, add:

- exact expected immutable full remote PR head SHA; and
- exact immutable trusted governing SHA selected under the rule above, plus any
  separately approved governing revision exception; and
- current head-branch ownership/conflict state.

The PR number, base/head branch names, review threads, source paths, acceptance
criteria, checks, and completion-report rules should be read from the referenced
remote PR and canonical repository sources instead of copied into the handoff,
unless one of the explicit restatement exceptions above applies.

For **existing-branch-without-PR work**, add:

- the immutable full current remote head SHA of the referenced branch;
- current branch ownership/conflict state; and
- the explicitly authorized branch mutations.

For **pre-PR branch creation**, add:

- immutable full base SHA;
- intended new branch name;
- confirmation that the intended branch name is absent remotely immediately
  before dispatch;
- intended branch ownership/conflict state; and
- the explicitly authorized branch/PR mutations.

Never use the pre-PR branch-creation topology when the intended remote ref
already exists. If the branch exists, use the existing-branch-without-PR packet
and pin its immutable full remote head SHA before any mutation. Once a new
branch is created, refresh into the existing-branch-without-PR topology before
further branch mutations. Once a PR is opened, switch to existing-PR work and
refresh the expected immutable PR head SHA.

For a **non-branch remote task** such as a read-only remote audit or issue-only
mutation, do not invent branch-creation or branch-ownership fields. Reference
the remote issue/PR/repository context that is actually in scope. If repository
or PR content is part of the decision, add the expected immutable full SHA for
the mutable ref whose state must remain stable; if no mutable repository ref
matters, no branch SHA is required. Explicitly authorize any issue/comment
mutation, or state that the task is read-only.

For any issue mutation, the handoff must also reserve each target issue to one
exclusive remote writer for that mutation wave and record its current
ownership/conflict state. Immediately before the first mutation to each reserved
issue, re-fetch the issue and compare the mutation-relevant fields against the
state used to plan the write. Use an available conditional/revision guard when
the connector exposes one; otherwise treat any intervening material change as a
conflict that requires reconciliation before mutation. Do not let a stale body,
label, assignee, milestone, state, or other fetched issue field silently
overwrite newer remote state.

A non-branch task must not mutate a branch unless it is reclassified under one
of the branch topologies above. Do not dispatch or mutate when issue-target
ownership is not exclusive, the immediate issue-state refresh reveals an
unreconciled intervening change, an applicable expected SHA changed,
ownership/conflict state is unsafe, a pre-PR branch unexpectedly exists, the
selected topology no longer matches remote state, required local-only evidence
is unavailable, or the requested mutation is not explicitly authorized.

Do not impose arbitrary task-count quotas on workers or precheck provider usage
limits. Select the smallest capable team based on the task, available context,
ownership boundaries, and current authorization.

Normal ChatGPT may own complex remote coding, tests, documentation, GitHub
issues, branches, and PRs when explicit user authorization covers the mutation,
the immutable remote base and complete context are supplied, and its assigned
slice has no unpublished local dependency. Lead monitors through the chat and PR
diff, independently verifies the result, and retains merge control. Never ask
Normal ChatGPT to review or change local work that has not been pushed.

### Partial Remote Implementation And Local Continuation

Split a mixed remote/local task at a verifiable boundary. Assign Normal ChatGPT
the remote-capable implementation first, even when local checks, native
behavior, or integration must follow. State both owners and the handoff point
before dispatch. Remote work should leave an authorized branch with a pinned
commit and a reviewable diff; if branch mutation is not authorized, hand off a
read-only design, patch proposal, test plan, or review instead. Never represent
unexecuted tests as passing.

The remote worker's handoff must give the exact branch/PR and full head SHA,
owned files, implemented and unfinished criteria, tests written, tests actually
run (with environment), failures, assumptions, risks, and precise next steps.
The lead compares that report with the remote diff and requirements. Only then
assign a local successor. Its isolated same-disk sibling worktree starts from
the verified remote branch/head under `AGENTS.md` rules; its brief names the
remaining work and ownership transfer. Stop or close the remote writer's edit
lane before the local successor writes. Recheck head and conflict state before
any later remote continuation. Do not merge a partially verified branch merely
to make local work possible.

Before first dispatch to each external provider/model pool in a task, obtain
explicit user opt-in and record the approved data-sharing boundary. A user's
explicit request to form a team from the named pools counts as opt-in for those
pools within the stated task and data boundary; do not infer broader access.
Authorization may cover later bounded dispatches only while provider, model
pool, data class, and purpose remain inside that recorded boundary.
Auto-triggering team-led workflow never grants third-party disclosure.

### External Worker Checkpoints And Learning

Mentor external workers through persistent-session checkpoints rather than
restarting on every miss:

1. The worker reports its plan, assumptions, and intended scope before
   substantial implementation.
2. TDD and debugging work reports Red evidence before production implementation.
3. When the task brief requires an interim diff or risk checkpoint, the worker
   pauses there for lead acceptance.
4. Verification evidence is inspected before acceptance.
5. The final full diff and completion report are inspected before acceptance.

Observe structured status, messages, tool results, and diffs. Do not claim
access to or request hidden chain-of-thought. Send bounded corrections in the
same session/thread when the lane remains safe and recoverable.

For ordinary rule drift or a materially wrong but safe direction, correct
explicitly and continue the same session when recoverable. After three
materially identical rule failures on the same model/task lane, mark that lane
failed and reassign.

Timeouts guide task size, checkpoint frequency, and timeout budget; they do not
alone permanently disqualify a model. A recoverable timed-out observation should
continue in the same session after status is rechecked.

### Contact, Timeout, And Ownership Recovery

Before dispatch, record the worker's exact chat/session ID, supported send,
read/status, and wait mechanisms, expected first acknowledgment, next progress
checkpoint, and branch/worktree owner. A successful dispatch call proves only
message acceptance. Mark the lane running after a visible non-error worker
response, process event, or branch activity tied to that task. Do not use a wait
API for a chat type it does not support; for example, `wait_threads` is for
Codex threads, while a Normal ChatGPT chat may need `read_thread` and its own
supported message path. Verify the tool contract in the current host.

When contact or waiting times out:

1. Keep the same owner and session. Check the dispatch result, exact chat ID,
   current status/recent turns, process or persistent-session state, and remote
   branch/PR head. Separate a wait timeout, a failed send, a busy worker, and a
   completed worker whose final message was missed.
2. If supported, read current chat/session state directly. Wait with a bounded
   interval suited to its checkpoint, then recheck; avoid rapid polling. If the
   first dispatch was never accepted, resend the task once. If it was accepted,
   send one short status request to the same chat/session through a supported
   send path, with task ID and no duplicate implementation instruction.
3. If one tool path fails, check a different supported read/contact path or
   visible UI. Do not infer worker unreachability from one timeout or from a
   tool that does not support that chat type. Ask Mohamed to relay only when
   direct supported contact is unavailable; include the exact chat name and one
   concise message. Continue safe independent lanes while awaiting reply.
4. Reconcile any new commit, diff, or response before further dispatch. If still
   silent at the agreed checkpoint, report the state and time cost to Mohamed.
   Do not start a replacement writer on the same branch/worktree or files until
   the old run is confirmed stopped, finished, or its write access and ownership
   are safely transferred. If that cannot be established, pause the lane and
   preserve the branch rather than guessing.

Record every retry and its result in the task ledger. Repeated identical
timeouts with evidence of a live worker call for a communication-path fix, not a
model downgrade. A worker's missing response is not permission to rewrite its
code, bypass a gate, or duplicate its task.

## 7. Ownership Brief And Context

Every task brief states:

- persona name, tracked portable contract or audited Codex adapter path at the
  trusted revision, relevant skill/workflow path, objective, and reason;
- complete task/worktree responsibility, source of truth, and protected or
  forbidden paths/actions;
- exclusive artifact/file ownership for the wave and any shared-artifact owner;
- concrete readable-source allowlist/fingerprint derived from user-approved
  source/data-sharing scope, or sanitized-checkout identity;
- concrete writable file/directory allowlist/fingerprint derived from owned
  artifacts and contained within the readable boundary;
- inputs, dependencies, and applicable workflows;
- acceptance criteria, evidence, and verification;
- external-provider data-sharing boundary when applicable;
- explicit checkpoint pause gates;
- escalation/stop conditions and expected completion report.
- estimated elapsed time, next acknowledgment/progress checkpoint, cost-aware
  model/effort choice, and whether this is a partial handoff to another owner.

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
repository reads/writes. Briefs must be self-contained. For Normal ChatGPT,
"self-contained" means the worker can reach the authoritative remote references
plus the volatile additions required by Section 6; it does not require copying
remote workflow/rule/spec/PR content into the handoff. Use smallest inherited
context that preserves correctness:

- `fork_turns: "none"` for isolated deterministic inventory/check work when
  brief contains all required context;
- small positive history for work dependent on recent decisions;
- `fork_turns: "all"` only when full conversation is genuinely source of truth.

## 8. Concurrency And Waves

Inspect live agents and the remote/local capability and start readiness of the
primary pools before assignment; do not run quota prechecks.

```text
free worker capacity = maximum concurrency - currently active agents
new assignments = min(free worker capacity, ready independent items, ownership-safe items)
```

Native slot capacity is not the execution target. First use ready primary-pool
sessions for ownership-safe work; use a native slot only under the fallback rule
in Section 6. Count each active Normal ChatGPT chat and external session in the
task graph even when it uses no native slot. Respect the selected pool's actual
concurrency and observed limits. Keep independent review capacity for high-risk
work. Parallelism is useful only when expected elapsed time saved exceeds setup,
review, and integration cost.

Multiple writers are allowed only when task/worktree ownership, artifact/file
ownership, readable/writable boundaries, state, and merge dependencies are
genuinely independent. One writer owns each artifact per wave; stop affected
lanes immediately when overlap is discovered.

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

| Speckit task | Lane/owner/chat ID | Scope/files | Dependencies | ETA/checkpoint | Status | Output/PR |
| ------------ | ------------------ | ----------- | ------------ | -------------- | ------ | --------- |

Lead alone maps canonical Speckit task IDs and dependencies into this team DAG,
then dispatches agents. Workers do not independently orchestrate task graph. For
work without Speckit task IDs, use stable lead task IDs in the same table. Track
each lane's start time, elapsed time, remaining estimate, model/effort, latest
contact, branch/head, and next owner in the ledger or linked brief. Where a pool
exposes per-task token/cost usage, record it at each completed wave; distinguish
measured usage from estimates. Do not query remaining account quota before
dispatch. If usage is unavailable, say so and use task count, retries, and
elapsed time as practical signals. Consolidate repeated worker prompts. At an
agreed checkpoint, pause a lane that is spending tokens without verifiable
progress; diagnose the cause before retrying or raising effort.

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

For mockup-backed UI, the dispatch brief references one canonical state-to-
surface manifest with every required state, immutable image/sidecar revisions,
shared components and exact icon identities. Before assigning governed work,
inventory/read each active reference and verify its binding; reconcile missing,
ambiguous and superseded entries. Worker reports consumed manifest and
comparison context at plan checkpoint. Passing source/tests cannot satisfy
rendered proof. When owner explicitly defers device/render/accessibility
execution, author the authorized coverage and hand complete manual plan to
owner; mark those checks NOT RUN and retain separate
fidelity/accessibility/readiness gaps.

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

A task-required interim diff or risk checkpoint requires explicit lead
acceptance before work continues.

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
milestones, not command narration. The lead checks the wall clock at each wave
transition and every 30 minutes, and applies the four-hour and overrun stop
rules in Section 4. A timeout or unexpected rework updates the forecast
immediately; do not wait for the next scheduled checkpoint when the stop
threshold is already clear.

Worker report includes result, changed files/artifacts, tests and evidence,
assumptions, blockers, overlap/integration risks, and recommended next ready
task. At each wave end, lead checks evidence, ownership, tests, dependencies,
and ledgers before assigning more work.

Use this blocker route before selecting a replacement or workaround:

| Blocker                                                           | Lead's next action                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Missing product, financial, schema, sync, or material UX decision | Pause dependent lane; collect options and evidence for Mohamed.                                                               |
| No worker response or wait timeout                                | Use Section 6 contact recovery; keep ownership until state is known.                                                          |
| Reported model quota/rate limit                                   | Stop writer, preserve session and artifacts, then promptly hand off unfinished work to another capable model under Section 6. |
| Authentication or tool failure                                    | Preserve session and output; use the pool's fallback rules, then choose an authorized capable pool if needed.                 |
| Ownership overlap or changed remote head                          | Stop affected writers; refresh state and reassign exclusive ownership before edits.                                           |
| Failed test, CI, or device check                                  | Return evidence to owner and relevant specialist for root cause; do not mark the task done.                                   |
| Missing local verification after remote implementation            | Execute the planned local successor lane from the pinned remote head.                                                         |
| Time forecast crosses Section 4 threshold                         | Stop affected work, report completed and remaining work, and await direction.                                                 |

Pause affected lane for source conflict, material unresolved decision, missing
gate, ownership overlap, readable/writable-boundary change, incomplete
dependency, unsafe worktree, unexplained test failure, design drift, missing
environment, or any action outside Section 2 authorization. Continue safe
independent lanes. Mark blocked only after exhausting safe in-scope evidence and
alternatives.

Lead declares completion only when requested outcome matches source of truth,
atomic ledger items have dispositions, reviews have no blockers, validation is
current, required docs are updated, deferred work has approved disposition, and
no unauthorized action occurred.

Final handoff states outcome, team lanes and owners, decisions, changed
files/PRs/issues, exact validation and manual-only gaps, deferred/backlog items,
remaining risks, and next authorized step.
