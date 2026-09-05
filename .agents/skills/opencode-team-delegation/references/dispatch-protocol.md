# OpenCode Dispatch Protocol

Use this reference for session preparation, dispatch, monitoring, follow-up,
cancellation, and result acceptance.

## Availability Gate

Before every dispatch:

1. Confirm OpenCode CLI/server version and authentication without exposing
   credentials.
2. Query current model inventory and record exact provider-prefixed model ID.
3. Start or connect only to server bound to `127.0.0.1`. Verify health, project
   path, and VCS base. Every server must use HTTP Basic Auth unless an
   OS/container network namespace prevents access by unrelated processes; inject
   credentials at runtime and never record them in task packet or ledger.
4. Load explicit deny-by-default permission profile for task mode.
5. Through the trusted native Git preflight, confirm assigned worktree is clean
   or its known baseline is recorded, base SHA matches brief, and allowed paths
   have no competing owner. Do not expose a linked worktree's shared Git
   directory to the external runtime.
6. Confirm explicit user opt-in covers provider/model pool, purpose, and exact
   data-sharing boundary for this task.

Do not dispatch if any check is unknown. Availability must be rechecked after
runtime restart, authentication change, model change, or worktree/base change.

## Task Packet

Each task packet contains:

```text
Task ID and owner:
Objective and why this model fits:
Repository and worktree:
Immutable base SHA and target branch/PR:
Allowed paths:
External-provider opt-in and data-sharing boundary:
Read-only or bounded-write mode:
Source of truth and required context:
Acceptance criteria:
Exact verification commands:
Forbidden actions:
Timeout and cancellation rule:
Stop/escalation conditions:
Expected structured result and evidence:
```

Brief must be self-contained. Never assume external session received lead chat
history. Omit unrelated repository, user, financial, and credential context.

## Session Lifecycle

Use official server/SDK APIs rather than screen automation:

1. Create session with stable task title and record session ID.
2. Send task asynchronously when progress monitoring is needed. Request JSON
   schema output for deterministic status/report fields.
3. Observe event stream and session status. Treat silence or polling timeout as
   unknown, not completion or failure; recheck same session before deciding.
4. Send clarifications and bounded corrections to same session while base,
   scope, and ownership remain valid.
5. Abort session on timeout, unauthorized permission request, scope drift,
   conflicting writer, leaked sensitive input, or no-progress retry limit.
6. Retrieve messages, session diff, file status, and partial artifacts before
   cleanup or retry.

Never create a replacement session solely because observation expired.

## Result Inspection

Lead or trusted native owner must:

- re-read current worktree status and base SHA through trusted native Git;
- inspect every changed file, including untracked files and partial diffs, using
  the official session diff when safely available and the trusted native Git
  diff as the acceptance record;
- reject changes outside allowlist or after stale base;
- verify instructions, business rules, and Monyvi boundaries independently;
- run exact task gates and any broader integration gates required by risk;
- keep useful partial work only when each retained change is understood and
  verified.

External model never self-approves. Its passing test report does not replace
local output, CI, rendered evidence, or review.

## Retry And Stop Rules

- One follow-up for a correctable bounded miss; one retry only after inspecting
  diff and updating brief with new evidence.
- Stop repeated unchanged failure, unsupported tool/model, stale base, ownership
  overlap, permission escalation, or unclear sensitive decision.
- Do not broaden paths, permissions, or objectives to rescue a failing task.
- Reassign to native specialist when judgment exceeds model's approved lane.

## Pilot Gate

Run five representative read-only tasks before any write access:

1. focused code inventory;
2. EN/AR localization audit;
3. deterministic test-scenario enumeration;
4. approved-reference visual comparison from provided artifacts;
5. bounded documentation or low-risk code-review task.

For each, score factual accuracy, source traceability, scope compliance,
forbidden-action compliance, completeness, rework, elapsed time, and token/cost
when available. Pilot passes only when all five avoid unauthorized changes and
the lead accepts accuracy, rework, and cost as useful. Record failures; do not
average away a security or scope violation.

Record exact provider-prefixed model and revision, OpenCode/runtime version,
available tools, read-only permission profile, and environment-boundary policy
with pilot result. A change to any of these dimensions invalidates write
eligibility until all five benchmarks pass again against the changed baseline.

After the read-only pilot passes, create and independently review the exact
bounded-write profile. Qualify it only in a disposable synthetic checkout: prove
one canary edit inside its allowlist succeeds, and probes for out-of-allowlist
write, forbidden command, network, secret path, and Git/remote mutation are
denied. Only then may that exact profile perform a real test-only or low-risk
mechanical task. Any profile change revokes write eligibility until this canary
qualification is repeated; expanding model, runtime, tools, or environment also
requires the five-task read-only pilot again.
