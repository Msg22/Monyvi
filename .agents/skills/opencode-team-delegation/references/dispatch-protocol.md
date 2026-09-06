# OpenCode Dispatch Protocol

Use this reference for session preparation, dispatch, monitoring, follow-up,
cancellation, and result acceptance.

## Availability Gate

Before every dispatch:

1. Confirm OpenCode CLI/server version and authentication without exposing
   credentials.
2. Query current model inventory and record the exact provider-prefixed model ID
   **and immutable provider model revision/build**. A moving display alias is
   not sufficient identity. If immutable revision/build cannot be established,
   do not reuse capability evidence or a canary waiver for write work.
3. Prefer a dedicated loopback server for this task, bound to `127.0.0.1`, with
   a recorded server ID and task-scoped credentials. If a shared server is
   necessary, record its server ID, the reason, active-session registry, and
   which credentials are task-scoped versus server-global.
4. Load the explicit deny-by-default permission profile and record its stable
   identifier or hash, OpenCode/runtime version, exact tool surface/version set,
   and enforcement-relevant sandbox/network boundary.
5. Through trusted native Git preflight, confirm the assigned worktree is clean
   or its known baseline is recorded, the base SHA matches the brief, and the
   complete task/worktree responsibility has no competing owner.
6. Confirm one writer owns every artifact/file in the task for this wave. Derive
   a concrete workspace-relative readable-source allowlist from the
   user-approved source/data-sharing boundary, or use a sanitized checkout
   containing only approved sources. Derive the writable file/directory
   allowlist from the exclusive artifacts, require it to be contained within the
   readable boundary, record both fingerprints, and enforce both boundaries in
   the permission profile. Never grant arbitrary repository-root read or write
   access.
7. Confirm explicit user opt-in covers provider/model pool, purpose, and the
   exact data-sharing boundary for this task.
8. For an **ordinary production dispatch**, identify every material capability
   the task will use and verify positive capability evidence for each one
   against the immutable provider/model revision/build and every
   runtime/tool/permission/environment dimension material to that capability.
   Missing negative evidence is not positive evidence.
9. For a **qualification dispatch**, record the single capability under
   qualification and the sandboxed qualification procedure. The dispatch may
   omit prior positive evidence only for that capability. Every other material
   capability used by the qualification must already have positive evidence or
   be supplied by a trusted-native owner. Qualification uses only
   synthetic/sanitized fixtures or the enforced user-approved readable-source
   allowlist and must not perform production implementation.
10. Confirm the implicated provider/model revision/runtime/tool combination is
    not under incident quarantine across any mode/profile. A new task, session,
    worktree, or permission profile cannot bypass quarantine.
11. For bounded writes, confirm either canary evidence for the exact enforcement
    configuration or a recorded user-authorized waiver bound to the **exact
    task** plus provider, model ID, immutable revision/build, OpenCode/runtime,
    exact tool surface/version set, permission-profile identifier/hash,
    sandbox/network boundary, readable-source-allowlist fingerprint, and
    writable-allowlist fingerprint. Any enforcement-relevant change invalidates
    that waiver.
12. If repository-edit capability is the only material capability lacking prior
    positive evidence and the exact waiver is valid, mark the production task
    for the provisional first-write checkpoint below. All other material
    capabilities used by the external worker must already have positive
    evidence.

Do not dispatch if any required check is unknown, except that a valid
qualification dispatch may intentionally lack evidence for the one capability it
is designed to qualify. Recheck identity, evidence, waiver binding, quarantine,
ownership, readable sources, and writable boundaries after any relevant
configuration change. Lack of canary evidence alone is not a blocker when the
fully bound waiver and all safeguards are valid.

## Task Packet

Each task packet contains:

```text
Task ID and owner:
Dispatch mode: ordinary production | qualification
Qualification target capability, if any:
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
Derived readable-source allowlist and fingerprint:
Derived writable file/directory allowlist and fingerprint:
Protected paths/actions:
External-provider opt-in and data-sharing boundary:
Positive evidence for every material task capability:
Qualification-dispatch exception/evidence plan, if any:
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
writer owns each artifact per wave. The trusted native owner derives the
readable-source allowlist from the explicit user-approved source/data-sharing
boundary and derives the writable allowlist from that exclusive artifact set.
Use exact files and minimum owned directory prefixes that permit cohesive
in-boundary edits or new files. Require the writable boundary to be a subset of
the readable boundary. Never use "no per-file micromanagement" to allow reads or
writes outside those concrete boundaries. Expanding either allowlist is an
enforcement-relevant change that invalidates the existing waiver until
reauthorized or canaried.

A qualification dispatch is tightly sandboxed and may create evidence rather
than consume it for exactly one named capability. It must use a sanitized
checkout or enforced readable-source boundary, deny unrelated capabilities, and
terminate after recording the benchmark result. Read-only qualification denies
edits. Write-capability qualification uses the isolated synthetic canary unless
the user-authorized provisional first-write path applies to an actual production
task.

For a user-authorized canary waiver, the task packet must record the exact task
and every enforcement identity field listed above. A waiver for another task,
model revision/build, runtime, tool set, permission profile, sandbox/network
boundary, readable-source boundary, or writable allowlist is not valid for this
dispatch.

The waiver preserves these non-waivable safeguards:

- one isolated worktree/branch and one exclusive task owner;
- non-overlapping artifact/file ownership, with one writer per artifact per
  wave;
- concrete enforced readable-source and writable allowlists;
- explicit deny-by-default permissions;
- no secrets, private financial records, bank/SMS payloads, personal
  identifiers, authentication artifacts, or other private user data in model
  context;
- no dependency installation, Git/remote mutation, destructive action, release,
  or deployment capability;
- explicit lead-accepted pause gates for plan/assumptions, provisional
  first-write when applicable, Red evidence, and any task-required interim
  diff/risk gate;
- independent trusted-native complete diff inspection and required tests before
  acceptance; and
- immediate abort and cross-profile incident quarantine on unexpected
  unauthorized read/access/write, sensitive-data exposure, or another security
  boundary breach.

## Session Lifecycle

Use official server/SDK APIs rather than screen automation:

1. Create one persistent session with a stable task title and record the session
   ID against the task and server ID.
2. Send the task asynchronously only as a transport mechanism. Asynchronous
   reporting does not satisfy a checkpoint pause gate.
3. The worker pauses after its plan/assumptions checkpoint. The lead reviews it
   and must explicitly accept it before non-qualification production work
   begins.
4. If this is a qualification dispatch, execute only the named benchmark inside
   its qualification sandbox, record the result, and terminate the qualification
   task. Do not continue into production implementation.
5. If a canary-waived provisional TDD task is used, the worker authors **only
   the minimal failing test** as the one provisional representative edit inside
   the writable allowlist, then pauses before running it or making another edit.
   The trusted native owner verifies changed paths, readable/writable-boundary
   enforcement, permission behavior, and the provisional diff. Only after that
   edit checkpoint is accepted may the test run to produce Red. A trusted-native
   runner executes the Red check unless the external worker already has positive
   test-execution capability evidence. The lead then reviews and explicitly
   accepts the Red evidence before any production implementation edit.
6. For a non-provisional TDD/debugging task, the worker produces failing-test or
   reproduction evidence, pauses, and waits for explicit lead acceptance before
   production implementation begins.
7. For a provisional non-TDD task, allow one small representative edit only
   inside the writable allowlist. The worker pauses before any additional edit;
   trusted native owner verifies changed paths, readable/writable boundaries,
   permission enforcement, and provisional diff before continuation.
8. When the task brief requires an interim diff/risk checkpoint, the worker
   pauses there and waits for explicit lead acceptance before continuing.
9. Observe event stream, session status, messages, tool results, and diffs. Do
   not claim access to, request, or retain hidden chain-of-thought.
10. Send clarifications and bounded corrections to the same session while base,
    scope, ownership, waiver/evidence validity, readable/writable boundaries,
    and quarantine status remain valid.
11. Inspect verification evidence and the final complete diff before acceptance.
12. On unexpected sensitive-data exposure, unauthorized readable-source access,
    unauthorized scope/write, an unexpectedly successful canary denial probe, or
    another security boundary breach, abort immediately and quarantine the
    implicated provider/model revision/runtime/tool combination across
    read/write modes and all permission profiles pending incident review and
    requalification. A new task/profile cannot bypass this.
13. A correctly denied predeclared synthetic canary probe is a qualification
    event, not an incident. It must be recorded as part of the authorized canary
    procedure and must produce no unauthorized mutation, disclosure, or side
    effect.
14. Retrieve only sanitized operational evidence and partial artifacts needed
    for safe inspection before terminal teardown or reassignment.

A silence or polling timeout is unknown, not completion or failure. Recheck the
same session before deciding. Never create a replacement session solely because
observation expired.

## Result Inspection

Lead or trusted native owner must:

- re-read current worktree status and base SHA through trusted native Git;
- verify artifact/file ownership still has no overlap;
- verify every read/search boundary exposed to the external worker stayed inside
  the recorded readable-source allowlist or sanitized checkout;
- verify every changed or newly created path is inside the recorded writable
  allowlist and assigned exclusive artifact boundary;
- inspect every changed file, including untracked files and partial diffs, using
  the official session diff when safely available and trusted native Git diff as
  the acceptance record;
- reject changes outside the complete assigned task/worktree responsibility,
  outside exclusive artifact ownership, outside the readable-source boundary,
  outside the writable allowlist, or after stale base;
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
  invalidated waiver/evidence, readable/writable-boundary drift, or a materially
  wrong direction. Send the correction in the same persistent session only when
  the lane remains safe and recoverable.
- Unexpected sensitive-data exposure, unauthorized readable-source access,
  unauthorized scope/write, an unexpectedly successful canary denial probe, or
  another security boundary breach immediately aborts the lane and quarantines
  the implicated provider/model revision/runtime/tool combination across
  read/write modes and all permission profiles.
- A correctly denied predeclared synthetic canary probe is expected
  qualification evidence and does **not** trigger quarantine. A probe outside
  the authorized canary procedure, or any probe that unexpectedly succeeds or
  causes a side effect, is an incident.
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
- Do not broaden task responsibility, artifact ownership, readable-source
  boundary, writable allowlist, permissions, protected boundaries, or objectives
  merely to rescue a failing task.
- Timeouts guide task size, checkpoint frequency, and timeout budget. They do
  not alone permanently disqualify a model. Recheck the same session and
  continue there when recoverable.

## Capability Qualification

Qualification dispatches record evidence about individual capabilities of the
exact immutable provider/model revision/build plus the OpenCode/runtime,
tool-surface, permission, and environment dimensions material to the capability.
The qualification-dispatch exception permits missing prior positive evidence
only for the single capability being tested; every other external-worker
capability used by the benchmark must already be evidenced or removed from the
external path.

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

Before ordinary production assignment, map every material task capability to
positive evidence bound to the active immutable revision/build and relevant
configuration. A missing negative result is not positive evidence. If the
immutable provider model revision/build changes, invalidate all prior capability
evidence for that model. If runtime, tool surface, permission profile, or
environment boundary changes, invalidate and requalify every capability whose
support could be affected.

Negative capability evidence is revision-bound as well. A known unsupported
capability from an older revision must not be assumed for a new revision; the
new revision is simply unqualified until evidence is collected.

## Bounded-Write Canary Default, Waiver, And First Write

The recommended default is to independently review and qualify the exact
bounded-write permission profile in a disposable synthetic checkout. The canary
should prove:

- one legitimate edit inside the assigned synthetic writable allowlist succeeds;
- a predeclared outside-readable-source read/search probe is denied;
- a predeclared outside-writable-boundary write probe is denied;
- shell access/probes are denied unless a separately named non-mutating
  verification capability is explicitly part of the reviewed profile;
- network access is denied;
- secret-path access is denied;
- Git and remote mutation are denied;
- dependency installation is denied; and
- destructive action is denied.

The deliberate denial probes above are qualification events when they target
only synthetic fixtures, are declared in the canary packet before execution, and
are denied before any unauthorized mutation, disclosure, or other side effect.
They do not trigger incident quarantine merely because the denied attempt
occurred. Quarantine is required for unexpected success, side effects, real-data
exposure, or any boundary attempt outside the declared synthetic canary
procedure.

The user may instead explicitly waive the canary for one exact task and one full
enforcement configuration. The waiver record must include provider/model ID,
immutable revision/build, OpenCode/runtime, exact tool surface/version set,
permission-profile identifier/hash, sandbox/network boundary,
readable-source-allowlist fingerprint, and writable-allowlist fingerprint. Any
enforcement-relevant change invalidates the waiver.

When repository-edit capability alone lacks prior positive evidence, the
provisional first-write checkpoint defined above is the only waiver-based path
to bootstrap that evidence. For a TDD task, the failing test is the provisional
representative edit; its edit/boundary checkpoint is accepted **before** the Red
run, then Red is run/reviewed and explicitly accepted before production code.
All unrelated material capabilities still require positive evidence before
ordinary production dispatch. A successful accepted provisional checkpoint
becomes edit-capability evidence only for the exact immutable configuration that
produced it.

No waiver can override incident quarantine, requalification, immutable-revision
binding, unrelated capability-evidence requirements, readable/writable
boundaries, or independent verification.

## Terminal Task Teardown And Server Drain

At every terminal task outcome—accepted, rejected, cancelled, failed, timed-out,
or security-aborted—terminate that task's model session and task-scoped injected
credentials immediately.

Then apply server teardown by mode:

- **Dedicated per-task server:** terminate it immediately with the terminal
  task.
- **Intentionally shared server:** remove the terminal session and its
  task-scoped credentials immediately, update the active-session registry, and
  keep the server only while another recorded active task/session still needs
  it. Shut the shared server as soon as the final active session becomes
  terminal.
- **Shared server/runtime implicated in a security incident:** abort every
  affected active session and terminate the shared server immediately instead of
  waiting for the normal drain rule.

For a security-aborted task, retain only sanitized incident evidence needed for
incident review and requalification. For other terminal outcomes, only
non-sensitive resources such as the isolated worktree, adapter configuration,
and sanitized task metadata may remain reusable. Record an owner, expiration,
and mandatory cleanup deadline for every retained reusable resource.
