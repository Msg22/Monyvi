# OpenCode Dispatch Protocol

Use this reference for session preparation, dispatch, monitoring, follow-up,
cancellation, and result acceptance.

## Availability Gate

Before every dispatch:

1. Confirm OpenCode CLI/server version and authentication without exposing
   credentials.
2. Query current model inventory and record the exact approved provider-prefixed
   model ID: `bai/glm-5.3-flash` or `bai/qwen3.8-flash`.
3. Start or connect only to a server bound to `127.0.0.1`. Verify health,
   project path, and VCS base. Every server must use HTTP Basic Auth unless an
   OS/container network namespace prevents access by unrelated processes; inject
   credentials at runtime and never record them in the task packet or ledger.
4. Load the explicit deny-by-default permission profile for task mode.
5. Through trusted native Git preflight, confirm the assigned worktree is clean
   or its known baseline is recorded, the base SHA matches the brief, and the
   complete task/worktree responsibility has no competing owner.
6. Confirm one writer owns every artifact/file in the task for this wave. Stop
   before dispatch if any concurrent lane overlaps that ownership.
7. Confirm explicit user opt-in covers provider/model pool, purpose, and the
   exact data-sharing boundary for this task.
8. Identify every material capability the task will use and verify positive
   capability evidence for each one on the exact
   provider/model/runtime/tool/profile combination. Absence of a recorded
   unsupported capability is not proof of support. Current evidence records that
   `bai/glm-5.3-flash` lacks image input through this OpenCode path, so
   image-dependent work must route elsewhere until that capability is
   requalified.
9. For bounded writes, confirm either the recommended canary evidence or a
   recorded user-authorized canary waiver for the exact model/task/profile. A
   waiver is valid only with the isolated exclusive worktree, non-overlapping
   artifact ownership, deny-by-default profile, sensitive-data exclusions,
   forbidden-action controls, mentoring pause gates, independent complete
   diff/tests, and immediate boundary-breach rules defined below and in
   `security-and-audit.md`.

Do not dispatch if any required check is unknown. Availability must be rechecked
after runtime restart, authentication change, model change, or worktree/base
change. When a valid waiver is recorded, lack of canary evidence alone is not an
unknown or blocking check.

## Task Packet

Each task packet contains:

```text
Task ID and owner:
Objective and why this model is eligible:
Repository and isolated worktree/branch:
Immutable base SHA and target integration branch/PR:
Complete task/worktree responsibility:
Exclusive artifact/file ownership for this wave:
Protected paths/actions:
External-provider opt-in and data-sharing boundary:
Read-only or bounded-write mode and permission-profile ID:
Positive evidence for every material task capability:
Canary evidence or recorded user-authorized waiver:
Source of truth and required context:
Acceptance criteria:
Checkpoint pause gates:
Verification expectations and trusted-native checks:
Forbidden actions:
Timeout budget and cancellation rule:
Stop/escalation conditions:
Expected structured result and evidence:
```

The brief must be self-contained. Never assume the external session received
lead chat history. Omit unrelated repository, user, financial, and credential
context.

For write work, assign one complete task and one exclusive isolated
worktree/branch, while also preserving non-overlapping artifact/file ownership.
One writer owns each artifact per wave. Avoid fragile per-file micromanagement
inside the artifact set that the worker exclusively owns; never use that rule to
permit concurrent edits to the same artifact. Stop and report any overlap.

For a user-authorized canary waiver, the task packet must record the exception
for the exact model/task/profile and restate these non-waivable safeguards:

- one isolated worktree/branch and one exclusive task owner;
- non-overlapping artifact/file ownership, with one writer per artifact per
  wave;
- explicit deny-by-default permissions;
- no secrets, private financial records, bank/SMS payloads, personal
  identifiers, authentication artifacts, or other private user data in model
  context;
- no dependency installation, Git/remote mutation, destructive action, release,
  or deployment capability;
- explicit lead-accepted pause gates for plan/assumptions and failing Red
  evidence where applicable, plus any task-required interim diff/risk gate;
- independent trusted-native complete diff inspection and required tests before
  acceptance;
- immediate abort and eligibility revocation on unauthorized access/write,
  sensitive-data exposure, or another security boundary breach.

## Session Lifecycle

Use official server/SDK APIs rather than screen automation:

1. Create one persistent session with a stable task title and record the session
   ID.
2. Send the task asynchronously only as a transport mechanism. Asynchronous
   reporting does not satisfy a checkpoint pause gate.
3. The worker pauses after its plan/assumptions checkpoint. The lead reviews it
   and must explicitly accept it before implementation edits begin.
4. Where TDD or debugging applies, the worker produces failing-test or
   reproduction evidence, pauses, and waits for explicit lead acceptance before
   production implementation begins.
5. When the task brief requires an interim diff/risk checkpoint, the worker
   pauses there and waits for explicit lead acceptance before continuing.
6. Observe event stream, session status, messages, tool results, and diffs. Do
   not claim access to, request, or retain hidden chain-of-thought.
7. Send clarifications and bounded corrections to the same session while base,
   scope, ownership, and eligibility remain valid.
8. Inspect verification evidence and the final complete diff before acceptance.
9. On sensitive-data exposure, unauthorized scope access/write, or another
   security boundary breach, abort immediately and revoke write eligibility for
   the exact model/task/profile pending incident review and requalification.
   This rule is non-waivable, including when the user waived the canary.
10. Retrieve only sanitized operational evidence and partial artifacts needed
    for safe inspection before cleanup or reassignment.

A silence or polling timeout is unknown, not completion or failure. Recheck the
same session before deciding. Never create a replacement session solely because
observation expired.

## Result Inspection

Lead or trusted native owner must:

- re-read current worktree status and base SHA through trusted native Git;
- verify artifact/file ownership still has no overlap;
- inspect every changed file, including untracked files and partial diffs, using
  the official session diff when safely available and trusted native Git diff as
  the acceptance record;
- reject changes outside the complete assigned task/worktree responsibility,
  outside exclusive artifact ownership, or after stale base;
- verify instructions, business rules, and Monyvi boundaries independently;
- require an independent appropriate specialist for approved financial, schema,
  sync, security, architecture, authentication/RLS, or migration implementation;
- run exact task gates and any broader integration gates required by risk;
- keep useful partial work only when each retained change is understood and
  verified.

External model never self-approves. Its passing test report does not replace
local output, CI, rendered evidence, specialist review, or lead verification.
OpenCode itself never commits, pushes, opens or merges PRs, resolves review
threads, or performs other Git/GitHub mutations; the trusted native integration
owner handles authorized Git work.

## Correction, Failure, Incident, And Timeout Rules

- Interrupt immediately for scope drift, unsafe action, ownership conflict, or a
  materially wrong direction. Send the correction in the same persistent
  session when the lane remains safe and recoverable.
- Sensitive-data exposure, unauthorized scope access/write, or another security
  boundary breach immediately aborts the lane and revokes write eligibility for
  the exact model/task/profile pending incident review and requalification. A
  user-authorized canary waiver cannot waive this rule.
- For ordinary explicit rule drift, allow correction and continuation until the
  same model/task lane reaches three materially identical rule failures. Then
  mark that lane failed, inspect partial work, and reassign.
- One failed task does not permanently disqualify the model from unrelated
  capability. Update capability evidence with what the result actually proved.
- Do not broaden task responsibility, artifact ownership, permissions, protected
  boundaries, or objectives merely to rescue a failing task.
- Timeouts guide task size, checkpoint frequency, and timeout budget. They do
  not alone permanently disqualify a model. Recheck the same session and
  continue there when recoverable.

## Capability Qualification

Read-only qualification records evidence about individual capabilities of the
exact provider/model/runtime/tool/profile combination. Representative benchmark
shapes include:

1. focused code inventory;
2. EN/AR localization audit;
3. deterministic test-scenario enumeration;
4. approved-reference comparison when the runtime actually supports the
   required reference modality;
5. bounded documentation or code-review task.

For each attempted benchmark, record factual accuracy, source traceability,
scope compliance, forbidden-action compliance, completeness, rework, elapsed
time, and token/cost when available. A security or unauthorized-scope failure is
an incident and triggers the revocation rule above. A task-capability failure,
unsupported modality, or timeout is capability evidence, not automatic permanent
disqualification from unrelated work.

Before assignment, map every material task capability to positive evidence from
the exact configuration. A missing negative result is not positive evidence.
Known unsupported capabilities remain exclusions until requalified. If model,
runtime, tools, or permission profile changes, requalify every material
capability whose support could be affected.

## Bounded-Write Canary Default And Waiver

The recommended default is to independently review and qualify the exact
bounded-write permission profile in a disposable synthetic checkout. The canary
should prove:

- one legitimate edit inside the assigned synthetic task/worktree scope
  succeeds;
- outside-scope write is denied;
- shell access/probes are denied unless a separately named non-mutating
  verification capability is explicitly part of the reviewed profile;
- network access is denied;
- secret-path access is denied;
- Git and remote mutation are denied;
- dependency installation is denied;
- destructive action is denied.

After that canary, the exact profile may perform real bounded writes in an
isolated worktree. A material permission-profile change should normally repeat
the canary when the changed boundary could affect enforcement.

The user may instead explicitly waive the canary for a specific
model/task/profile. Record that exception before dispatch and apply every waiver
safeguard in the Task Packet section and `security-and-audit.md`. A material
permission-profile expansion requires a fresh canary or a new explicit waiver
covering the expanded profile. When a valid waiver and safeguards are recorded,
real writes may begin without the disposable canary; absence of the canary alone
must not block the lane. No waiver can override incident revocation,
requalification, positive capability evidence, or independent verification.

## Accepted-Task Teardown

After every accepted task, always terminate and tear down:

- the model session;
- injected credentials; and
- the live OpenCode server.

These resources never remain for a reusable lane. Only non-sensitive resources
such as the isolated worktree, adapter configuration, and sanitized task
metadata may remain reusable. Record an owner, expiration, and mandatory cleanup
deadline for every retained reusable resource.
