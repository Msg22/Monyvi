# OpenCode Dispatch Protocol

Use this reference for session preparation, dispatch, monitoring, follow-up,
cancellation, and result acceptance.

## Availability Gate

Before every dispatch:

1. Confirm OpenCode CLI/server version and authentication without exposing
   credentials.
2. Query current model inventory and record the exact provider-prefixed model ID
   **and immutable provider model revision/build**. A moving display alias is not
   sufficient identity. If immutable revision/build cannot be established, do not
   reuse capability evidence or a canary waiver for write work.
3. Prefer a dedicated loopback server for this task, bound to `127.0.0.1`, with a
   recorded server ID and task-scoped credentials. If a shared server is
   necessary, record its server ID, the reason, active-session registry, and
   which credentials are task-scoped versus server-global.
4. Load the explicit deny-by-default permission profile and record its stable
   identifier or hash, OpenCode/runtime version, exact tool surface/version set,
   and enforcement-relevant sandbox/network boundary.
5. Through trusted native Git preflight, confirm the assigned worktree is clean
   or its known baseline is recorded, the base SHA matches the brief, and the
   complete task/worktree responsibility has no competing owner.
6. Confirm one writer owns every artifact/file in the task for this wave. Derive
   a concrete workspace-relative writable file/directory allowlist from those
   exclusive artifacts, record its fingerprint, and enforce it in the permission
   profile. Never grant arbitrary repository-root writes.
7. Confirm explicit user opt-in covers provider/model pool, purpose, and the
   exact data-sharing boundary for this task.
8. Identify every material capability the task will use and verify positive
   capability evidence for each one against the immutable provider/model
   revision/build and every runtime/tool/permission/environment dimension
   material to that capability. Missing negative evidence is not positive
   evidence.
9. Confirm the implicated provider/model revision/runtime/tool combination is not
   under incident quarantine across any mode/profile. A new task, session,
   worktree, or permission profile cannot bypass quarantine.
10. For bounded writes, confirm either canary evidence for the exact enforcement
    configuration or a recorded user-authorized waiver bound to the **exact
    task** plus provider, model ID, immutable revision/build, OpenCode/runtime,
    exact tool surface/version set, permission-profile identifier/hash,
    sandbox/network boundary, and writable-allowlist fingerprint. Any
    enforcement-relevant change invalidates that waiver.
11. If repository-edit capability is the only material capability lacking prior
    positive evidence and the exact waiver is valid, mark the task for the
    provisional first-write checkpoint below. All other material capabilities
    must already have positive evidence.

Do not dispatch if any required check is unknown. Recheck identity, evidence,
waiver binding, quarantine, ownership, and writable boundaries after any
relevant configuration change. Lack of canary evidence alone is not a blocker
when the fully bound waiver and all safeguards are valid.

## Task Packet

Each task packet contains:

```text
Task ID and owner:
Objective and why this model is eligible:
Repository and isolated worktree/branch:
Immutable base SHA and target integration branch/PR:
Provider and provider-prefixed model ID:
Immutable provider model revision/build:
OpenCode/runtime version:
Exact tool surface/version set:
Permission-profile identifier/hash:
Environment/sandbox and network boundary:
Loopback server ID and dedicated/shared mode:
Complete task/worktree responsibility:
Exclusive artifact/file ownership for this wave:
Derived writable file/directory allowlist and fingerprint:
Protected paths/actions:
External-provider opt-in and data-sharing boundary:
Positive evidence for every material task capability:
Incident-quarantine status:
Canary evidence or exact fully bound user-authorized waiver:
Provisional first-write required? yes/no:
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
worktree/branch while preserving non-overlapping artifact/file ownership. One
writer owns each artifact per wave. The trusted native owner derives the writable
allowlist from that exclusive artifact set before dispatch. Use exact files and
minimum owned directory prefixes that permit cohesive in-boundary edits or new
files; never use "no per-file micromanagement" to allow writes outside that
concrete boundary. Expanding the writable allowlist is an enforcement-relevant
change that invalidates the existing waiver until reauthorized or canaried.

For a user-authorized canary waiver, the task packet must record the exact task
and every enforcement identity field listed above. A waiver for another task,
model revision/build, runtime, tool set, permission profile, sandbox/network
boundary, or writable allowlist is not valid for this dispatch.

The waiver preserves these non-waivable safeguards:

- one isolated worktree/branch and one exclusive task owner;
- non-overlapping artifact/file ownership, with one writer per artifact per
  wave;
- concrete enforced writable file/directory allowlist;
- explicit deny-by-default permissions;
- no secrets, private financial records, bank/SMS payloads, personal
  identifiers, authentication artifacts, or other private user data in model
  context;
- no dependency installation, Git/remote mutation, destructive action, release,
  or deployment capability;
- explicit lead-accepted pause gates for plan/assumptions and failing Red
  evidence where applicable, plus provisional first-write and any task-required
  interim diff/risk gates;
- independent trusted-native complete diff inspection and required tests before
  acceptance; and
- immediate abort and cross-profile incident quarantine on unauthorized
  access/write, sensitive-data exposure, or another security boundary breach.

## Session Lifecycle

Use official server/SDK APIs rather than screen automation:

1. Create one persistent session with a stable task title and record the session
   ID against the task and server ID.
2. Send the task asynchronously only as a transport mechanism. Asynchronous
   reporting does not satisfy a checkpoint pause gate.
3. The worker pauses after its plan/assumptions checkpoint. The lead reviews it
   and must explicitly accept it before implementation edits begin.
4. Where TDD or debugging applies, the worker produces failing-test or
   reproduction evidence, pauses, and waits for explicit lead acceptance before
   production implementation begins.
5. If the task is on the provisional first-write path, allow one small
   representative edit only inside the derived writable allowlist. The worker
   then pauses before any additional edit. Trusted native owner verifies changed
   paths, permission enforcement, and the provisional diff. Only acceptance of
   this checkpoint creates positive repository-edit evidence for the immutable
   configuration and permits the same task/session to continue.
6. When the task brief requires an interim diff/risk checkpoint, the worker
   pauses there and waits for explicit lead acceptance before continuing.
7. Observe event stream, session status, messages, tool results, and diffs. Do
   not claim access to, request, or retain hidden chain-of-thought.
8. Send clarifications and bounded corrections to the same session while base,
   scope, ownership, waiver/evidence validity, and quarantine status remain
   valid.
9. Inspect verification evidence and the final complete diff before acceptance.
10. On sensitive-data exposure, unauthorized scope access/write, an
    out-of-allowlist write attempt, or another security boundary breach, abort
    immediately and quarantine the implicated provider/model revision/runtime/tool
    combination across read/write modes and all permission profiles pending
    incident review and requalification. A new task/profile cannot bypass this.
11. Retrieve only sanitized operational evidence and partial artifacts needed
    for safe inspection before terminal teardown or reassignment.

A silence or polling timeout is unknown, not completion or failure. Recheck the
same session before deciding. Never create a replacement session solely because
observation expired.

## Result Inspection

Lead or trusted native owner must:

- re-read current worktree status and base SHA through trusted native Git;
- verify artifact/file ownership still has no overlap;
- verify every changed or newly created path is inside the recorded writable
  allowlist and assigned exclusive artifact boundary;
- inspect every changed file, including untracked files and partial diffs, using
  the official session diff when safely available and trusted native Git diff as
  the acceptance record;
- reject changes outside the complete assigned task/worktree responsibility,
  outside exclusive artifact ownership, outside the writable allowlist, or after
  stale base;
- verify instructions, business rules, and Monyvi boundaries independently;
- require an independent appropriate specialist for approved financial, schema,
  sync, security, architecture, authentication/RLS, or migration implementation;
- run exact task gates and any broader integration gates required by risk; and
- keep useful partial work only when each retained change is understood and
  verified.

External model never self-approves. Its passing test report does not replace
local output, CI, rendered evidence, specialist review, or lead verification.
OpenCode itself never commits, pushes, opens or merges PRs, resolves review
threads, or performs other Git/GitHub mutations; the trusted native integration
owner handles authorized Git work.

## Correction, Failure, Incident, And Timeout Rules

- Interrupt immediately for scope drift, unsafe action, ownership conflict,
  invalidated waiver/evidence, or a materially wrong direction. Send the
  correction in the same persistent session only when the lane remains safe and
  recoverable.
- Sensitive-data exposure, unauthorized scope access/write, an out-of-allowlist
  write attempt, or another security boundary breach immediately aborts the lane
  and quarantines the implicated provider/model revision/runtime/tool
  combination across read/write modes and all permission profiles.
- A new task, session, worktree, or permission profile cannot bypass quarantine.
  User-authorized canary waiver cannot waive quarantine.
- Restore eligibility only after incident review and requalification succeed.
  Incident review may narrow quarantine to a permission-profile-local cause only
  when evidence proves that narrower cause and the intended restored
  configuration has passed requalification.
- For ordinary explicit rule drift, allow correction and continuation until the
  same model/task lane reaches three materially identical rule failures. Then
  mark that lane failed, inspect partial work, and reassign.
- One ordinary failed task does not permanently disqualify the model from
  unrelated capability; incident quarantine is the explicit exception described
  above.
- Do not broaden task responsibility, artifact ownership, writable allowlist,
  permissions, protected boundaries, or objectives merely to rescue a failing
  task.
- Timeouts guide task size, checkpoint frequency, and timeout budget. They do
  not alone permanently disqualify a model. Recheck the same session and
  continue there when recoverable.

## Capability Qualification

Read-only qualification records evidence about individual capabilities of the
exact immutable provider/model revision/build plus the OpenCode/runtime,
tool-surface, permission, and environment dimensions material to the capability.
Representative benchmark shapes include:

1. focused code inventory;
2. EN/AR localization audit;
3. deterministic test-scenario enumeration;
4. approved-reference comparison when the immutable revision/runtime actually
   supports the required reference modality;
5. bounded documentation or code-review task.

For each attempted benchmark, record factual accuracy, source traceability,
scope compliance, forbidden-action compliance, completeness, rework, elapsed
time, and token/cost when available. A security or unauthorized-scope failure is
an incident and triggers quarantine. A task-capability failure, unsupported
modality, or timeout is capability evidence, not automatic permanent
disqualification from unrelated work.

Before assignment, map every material task capability to positive evidence bound
to the active immutable revision/build and relevant configuration. A missing
negative result is not positive evidence. If the immutable provider model
revision/build changes, invalidate all prior capability evidence for that model.
If runtime, tool surface, permission profile, or environment boundary changes,
invalidate and requalify every capability whose support could be affected.

Negative capability evidence is revision-bound as well. A known unsupported
capability from an older revision must not be assumed for a new revision; the new
revision is simply unqualified until evidence is collected.

## Bounded-Write Canary Default, Waiver, And First Write

The recommended default is to independently review and qualify the exact
bounded-write permission profile in a disposable synthetic checkout. The canary
should prove:

- one legitimate edit inside the assigned synthetic writable allowlist succeeds;
- outside-allowlist write is denied;
- shell access/probes are denied unless a separately named non-mutating
  verification capability is explicitly part of the reviewed profile;
- network access is denied;
- secret-path access is denied;
- Git and remote mutation are denied;
- dependency installation is denied; and
- destructive action is denied.

The user may instead explicitly waive the canary for one exact task and one full
enforcement configuration. The waiver record must include provider/model ID,
immutable revision/build, OpenCode/runtime, exact tool surface/version set,
permission-profile identifier/hash, sandbox/network boundary, and writable
allowlist fingerprint. Any enforcement-relevant change invalidates the waiver.

When repository-edit capability alone lacks prior positive evidence, the
provisional first-write checkpoint defined above is the only waiver-based path to
bootstrap that evidence. All unrelated material capabilities still require
positive evidence before dispatch. A successful accepted provisional checkpoint
becomes edit-capability evidence only for the exact immutable configuration that
produced it.

No waiver can override incident quarantine, requalification, immutable-revision
binding, unrelated capability-evidence requirements, writable boundaries, or
independent verification.

## Terminal Task Teardown And Server Drain

At every terminal task outcome—accepted, rejected, cancelled, failed, timed-out,
or security-aborted—terminate that task's model session and task-scoped injected
credentials immediately.

Then apply server teardown by mode:

- **Dedicated per-task server:** terminate it immediately with the terminal task.
- **Intentionally shared server:** remove the terminal session and its task-scoped
  credentials immediately, update the active-session registry, and keep the
  server only while another recorded active task/session still needs it. Shut the
  shared server as soon as the final active session becomes terminal.
- **Shared server/runtime implicated in a security incident:** abort every
  affected active session and terminate the shared server immediately instead of
  waiting for the normal drain rule.

For a security-aborted task, retain only sanitized incident evidence needed for
incident review and requalification. For other terminal outcomes, only
non-sensitive resources such as the isolated worktree, adapter configuration,
and sanitized task metadata may remain reusable. Record an owner, expiration,
and mandatory cleanup deadline for every retained reusable resource.
