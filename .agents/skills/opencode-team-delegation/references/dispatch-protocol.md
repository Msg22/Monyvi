# OpenCode Dispatch Protocol

Use this reference for session preparation, dispatch, monitoring, follow-up,
cancellation, and result acceptance.

## Availability Gate

Before every dispatch:

1. Confirm OpenCode CLI/server version and authentication without exposing
   credentials.
2. Query current model inventory and record the exact approved provider-prefixed
   model ID: `bai/glm-5.3-flash` or `bai/qwen3.8-flash`.
3. Start or connect only to server bound to `127.0.0.1`. Verify health, project
   path, and VCS base. Every server must use HTTP Basic Auth unless an
   OS/container network namespace prevents access by unrelated processes; inject
   credentials at runtime and never record them in task packet or ledger.
4. Load explicit deny-by-default permission profile for task mode.
5. Through the trusted native Git preflight, confirm assigned worktree is clean
   or its known baseline is recorded, base SHA matches brief, and the complete
   task/worktree responsibility has no competing owner. Do not expose a linked
   worktree's shared Git directory to the external runtime.
6. Confirm explicit user opt-in covers provider/model pool, purpose, and exact
   data-sharing boundary for this task.
7. Confirm the task needs no capability already recorded as unsupported for the
   exact model/path. Current qualification records that `bai/glm-5.3-flash`
   lacks image input through this OpenCode path; image-dependent work must route
   elsewhere until that capability is requalified.

Do not dispatch if any required check is unknown. Availability must be rechecked
after runtime restart, authentication change, model change, or worktree/base
change.

## Task Packet

Each task packet contains:

```text
Task ID and owner:
Objective and why this model is eligible:
Repository and isolated worktree/branch:
Immutable base SHA and target integration branch/PR:
Complete task/worktree responsibility and protected paths/actions:
External-provider opt-in and data-sharing boundary:
Read-only or bounded-write mode and permission-profile ID:
Source of truth and required context:
Acceptance criteria:
Checkpoint plan:
Verification expectations and trusted-native checks:
Forbidden actions:
Timeout budget and cancellation rule:
Stop/escalation conditions:
Expected structured result and evidence:
```

Brief must be self-contained. Never assume external session received lead chat
history. Omit unrelated repository, user, financial, and credential context.
For write work, assign one complete task and exclusive isolated worktree/branch
responsibility. Avoid fragile per-file micromanagement when the task genuinely
needs cohesive in-scope edits; use protected/forbidden boundaries to keep scope
safe.

## Session Lifecycle

Use official server/SDK APIs rather than screen automation:

1. Create one persistent session with stable task title and record session ID.
2. Send task asynchronously when progress monitoring is needed. Request JSON
   schema output for deterministic status/report fields.
3. Inspect the worker's plan/assumptions checkpoint before significant edits.
4. Where TDD or debugging applies, require failing-test/reproduction evidence
   before production implementation.
5. Observe event stream, session status, and interim diff/risk checkpoint before
   work becomes difficult to unwind.
6. Send clarifications and bounded corrections to the same session while base,
   scope, and ownership remain valid so the worker can incorporate feedback.
7. Inspect verification evidence and the final complete diff before acceptance.
8. Abort immediately for sensitive-data exposure, destructive intent/action, or
   unauthorized boundary crossing. Also abort for ownership conflict or unsafe
   permission escalation.
9. Retrieve messages, session diff, file status, and partial artifacts before
   cleanup or reassignment.

Observe messages, status, tool results, and diffs only. Do not claim access to,
request, or retain hidden chain-of-thought. A silence or polling timeout is
unknown, not completion or failure; recheck the same session before deciding.
Never create a replacement session solely because observation expired.

## Result Inspection

Lead or trusted native owner must:

- re-read current worktree status and base SHA through trusted native Git;
- inspect every changed file, including untracked files and partial diffs, using
  the official session diff when safely available and the trusted native Git
  diff as the acceptance record;
- reject changes outside the complete assigned task/worktree responsibility or
  after stale base;
- verify instructions, business rules, and Monyvi boundaries independently;
- require an independent appropriate specialist for approved financial, schema,
  sync, security, auth/RLS, or migration implementation;
- run exact task gates and any broader integration gates required by risk;
- keep useful partial work only when each retained change is understood and
  verified.

External model never self-approves. Its passing test report does not replace
local output, CI, rendered evidence, specialist review, or lead verification.
OpenCode itself never commits, pushes, opens or merges PRs, resolves review
threads, or performs other Git/GitHub mutations; the trusted native integration
owner handles authorized Git work.

## Correction, Failure, And Timeout Rules

- Interrupt immediately for scope drift, unsafe action, ownership conflict, or a
  materially wrong direction; send the correction in the same persistent
  session when the lane remains safe and recoverable.
- Abort immediately for secrets/private-data exposure, destructive intent or
  action, or unauthorized boundary crossing.
- For ordinary explicit rule drift, allow correction and continuation until the
  same model/task lane reaches three materially identical rule failures. Then
  mark that lane failed, inspect partial work, and reassign.
- One failed task does not permanently disqualify the model from unrelated
  capability. Update capability evidence with what the result actually proved.
- Do not broaden task responsibility, permissions, protected boundaries, or
  objectives merely to rescue a failing task.
- Timeouts guide task size, checkpoint frequency, and timeout budget. They do not
  alone permanently disqualify a model. Recheck the same session and continue
  there when recoverable.

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
a hard failure for that lane. A task-capability failure, unsupported modality,
or timeout is capability evidence, not automatic permanent disqualification
from unrelated work. In particular, lack of image input must not block
source-only work.

Record exact provider-prefixed model and revision, OpenCode/runtime version,
available tools, read-only permission profile, and environment-boundary policy
with each result. If one of these dimensions changes, requalify the capabilities
material to the next task rather than assuming old evidence still applies.

## Bounded-Write Canary Gate

No OpenCode model may perform a real write until the **exact bounded-write
permission profile** has been independently reviewed and qualified in a
disposable synthetic checkout. The canary must prove:

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

Only after that canary may the exact profile perform real bounded writes in an
isolated worktree. A material permission-profile change requires repeating the
canary. Model/runtime/tool changes require rechecking relevant capability
evidence and the canary whenever they can change the enforced write boundary;
they do not automatically require every unrelated read-only benchmark to be
repeated.
