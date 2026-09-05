---
name: opencode-team-delegation
description:
  Safely delegate complete bounded Monyvi tasks to approved OpenCode models
  through a loopback server and persistent sessions. Use after team lead selects
  an OpenCode lane; models may implement already-approved high-risk work but may
  not invent or approve product, financial, auth/RLS, sync, migration, security,
  or architecture decisions, and may not perform Git/GitHub mutations.
---

# OpenCode Team Delegation

Use this procedure only inside authorization and ownership established by
`$team-led-delivery`. It defines delegation controls; it does not install
OpenCode, implement an adapter, or expand permission.

## Route Work

The approved OpenCode models are `bai/glm-5.3-flash` and
`bai/qwen3.8-flash`. Verify the exact provider-prefixed identifier with the
current OpenCode model inventory before every dispatch after a model/runtime
change. If the requested model, authentication, or required tools are
unavailable, stop that lane; do not silently substitute another model.

Do not statically confine either model to narrow categories. Route adaptively,
let each model attempt varied source, test, documentation, review, and
implementation work, including substantial tasks when its demonstrated
capability and the task contract support them, and update capability evidence
from actual results. A clear unsupported capability excludes only tasks that
need that capability. Current qualification shows `bai/glm-5.3-flash` lacks
image input through this OpenCode path, so do not assign it image-dependent
visual comparison until that capability is requalified; this does not block its
unrelated source work.

External models may implement already-approved financial, schema, sync,
security, authentication/RLS, or migration work when the task packet contains
the authoritative decision and an independent appropriate specialist verifies
the result. They must never invent, choose, approve, or silently alter those
decisions.

Read-only qualification produces **capability evidence**, not an all-or-nothing
model certification. Use representative read-only benchmarks to learn what the
exact model/runtime/tool/profile combination can reliably do, record unsupported
capabilities, and route future tasks accordingly. One failed benchmark does not
permanently disqualify unrelated capabilities, and inability to consume images
must not block source-only work.

The bounded-write canary is the recommended default before real OpenCode writes:
independently qualify the exact permission profile in a disposable synthetic
checkout, proving an in-scope edit succeeds while outside-scope write, shell,
network, secret access, Git/remote mutation, dependency installation, and
destructive action probes are denied.

The user may explicitly waive that canary for a specific model/task/profile.
Record the user-authorized exception before dispatch. A waiver does not weaken
the remaining controls: use one isolated exclusive task/worktree, an explicit
deny-by-default profile, no secrets or private financial data, no dependency
installs, Git/remote mutations, destructive actions, releases, or deployments,
the normal mentoring checkpoints, and independent trusted-native inspection of
the complete diff plus required tests/verification before acceptance. Abort
immediately on any boundary breach. When that exception and those safeguards are
recorded, lack of a canary alone must not block the authorized real write. Every
real result still requires independent Monyvi verification; model confidence is
not evidence.

## Prepare And Dispatch

Always read [security and audit controls](references/security-and-audit.md).
Read [dispatch protocol](references/dispatch-protocol.md) when preparing,
starting, monitoring, following up, cancelling, or accepting a session.

Required dispatch contract:

1. Verify OpenCode runtime, authentication, exact model, loopback server health,
   explicit permission profile, relevant capability evidence, and current
   user-approved data-sharing boundary.
2. Allocate one complete task/session/worktree/owner with immutable base SHA and
   exclusive worktree/branch responsibility. Define task/worktree scope and
   protected paths; avoid brittle per-file micromanagement when cohesive in-scope
   edits are genuinely required.
3. Send a self-contained brief containing source of truth, acceptance criteria,
   forbidden actions, verification expectations, checkpoint plan, timeout
   budget, and stop conditions.
4. Mentor through the same persistent session: inspect plan/assumptions,
   failing-test evidence where applicable, interim diff/risk, verification, and
   final diff checkpoints. Send bounded corrections in that same session when
   recoverable.
5. Observe structured status/events and diffs. Do not claim access to hidden
   chain-of-thought. Interrupt immediately only for unsafe action, ownership
   conflict, unauthorized boundary crossing, or materially wrong direction.
6. Abort immediately for secrets/private-data exposure, destructive intent or
   action, or unauthorized boundary crossing. Otherwise correct explicit rule
   drift and allow up to three materially identical rule failures before marking
   that model/task lane failed and reassigning.
7. Inspect complete diff and partial work before accepting or reassigning.
   Reject stale-base or out-of-scope changes; never land unverified output.
8. Trusted native owner runs project gates and performs authorized integration,
   commits, pushes, and PR mutations. Lead coordinates and independently
   verifies. Escalate any unapproved decision through the applicable user and
   authoritative-documentation gate; never resolve it inside the external lane.

Timeouts guide task size, checkpoint frequency, and timeout budget; they do not
alone permanently disqualify a model. Treat an observation timeout as unknown,
recheck the same session, and continue there when the task remains recoverable.

Use official OpenCode [server](https://opencode.ai/docs/server/),
[SDK](https://opencode.ai/docs/sdk/), and
[permission](https://opencode.ai/docs/permissions/) interfaces. Bind to
`127.0.0.1`, use persistent sessions, request structured results, monitor
events/status, send follow-ups, inspect session diffs, and abort through the
official API. Do not use unrestricted `--auto`.

[`delegate-skills`](https://github.com/amElnagdy/delegate-skills) may inform
brief and review patterns, but is not a dependency. Do not install or execute it
without a separate source review and authorization. Official APIs are preferred
because they expose persistent sessions, structured output, events, permission
responses, cancellation, and diff inspection directly.

## Completion Evidence

Record task ID, exact provider/model identifier, session ID, worktree/branch,
base SHA, complete task scope, protected paths, permission profile, canary status
or recorded user-authorized waiver, start/end state, checkpoint outcomes,
corrections, verification commands/results, changed paths, diff disposition,
retry/rule-failure count, final result, and remaining risks. Completion requires:

- no forbidden or out-of-scope action;
- current base and exclusive ownership still valid;
- expected artifact and structured result present;
- independent gates pass at required scope;
- sanitized bounded-retention ledger updated without hidden reasoning, secrets,
  raw unnecessary logs, or private data;
- server, session artifacts, injected credentials, permission profile, and
  isolated checkout are torn down; a reusable lane may instead record a short
  expiration, owner, and mandatory teardown deadline while authorization and
  data-sharing scope remain valid;
- lead accepts or rejects every changed path and retains merge control.
