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

The approved OpenCode models are `bai/glm-5.3-flash` and `bai/qwen3.8-flash`.
Verify the exact provider-prefixed identifier with the current OpenCode model
inventory before every dispatch after a model/runtime change. If the requested
model, authentication, or required tools are unavailable, stop that lane; do not
silently substitute another model.

Do not statically confine either model to narrow categories. Route adaptively,
let each model attempt varied source, test, documentation, review, and
implementation work, including substantial tasks when its demonstrated
capability and the task contract support them.

Every assigned task requires **positive capability evidence** for each material
capability it will use, such as source reading, repository editing, test
execution, image input, or a required tool surface. The absence of a recorded
unsupported capability is not evidence that the model supports it. Update
capability evidence from actual results. Current qualification shows
`bai/glm-5.3-flash` lacks image input through this OpenCode path, so do not
assign it image-dependent visual comparison until that capability is
requalified; this does not block unrelated source work.

External models may implement already-approved financial, schema, sync,
security, architecture, authentication/RLS, or migration work when the task
packet contains the authoritative decision and an independent appropriate
specialist verifies the result. They must never invent, choose, approve, or
silently alter those decisions.

Read-only qualification produces **capability evidence**, not an all-or-nothing
model certification. Use representative read-only benchmarks to learn what the
exact model/runtime/tool/profile combination can reliably do, record supported
and unsupported capabilities, and route future tasks accordingly. One failed
benchmark does not permanently disqualify unrelated capabilities, and inability
to consume images must not block source-only work.

The bounded-write canary is the recommended default before real OpenCode writes:
independently qualify the exact permission profile in a disposable synthetic
checkout, proving an in-scope edit succeeds while outside-scope write, shell,
network, secret access, Git/remote mutation, dependency installation, and
destructive action probes are denied.

The user may explicitly waive that canary for a specific model/task/profile.
Record the user-authorized exception before dispatch. A waiver does not weaken
the remaining controls: use one isolated exclusive task/worktree,
non-overlapping artifact ownership, an explicit deny-by-default profile, no
secrets or private financial data, no dependency installs, Git/remote mutations,
destructive actions, releases, or deployments, the required mentoring pause
gates, and independent trusted-native inspection of the complete diff plus
required tests/verification before acceptance.

Sensitive-data exposure, unauthorized scope access/write, or another security
boundary breach immediately aborts the lane and revokes write eligibility for
the compromised provider/model/runtime/tool/permission-profile combination
across all tasks pending incident review and requalification. Starting a new
task must not bypass that revocation. A user waiver cannot waive or override
this rule. When the canary exception and all safeguards are recorded, lack of a
canary alone must not block the authorized real write. Every real result still
requires independent Monyvi verification; model confidence is not evidence.

## Prepare And Dispatch

Always read [security and audit controls](references/security-and-audit.md).
Read [dispatch protocol](references/dispatch-protocol.md) when preparing,
starting, monitoring, following up, cancelling, or accepting a session.

Required dispatch contract:

1. Verify OpenCode runtime, authentication, exact model, loopback server health,
   explicit permission profile, positive evidence for every material capability,
   and the current user-approved data-sharing boundary. Confirm the exact
   provider/model/runtime/tool/permission-profile combination is currently
   write-eligible and not under incident revocation before any write dispatch.
2. Allocate one complete task/session/worktree/owner with immutable base SHA,
   exclusive worktree/branch responsibility, and non-overlapping artifact/file
   ownership. One writer owns each artifact per wave. Stop on ownership overlap.
   Avoid brittle per-file micromanagement inside the artifact set that this
   worker exclusively owns.
3. Send a self-contained brief containing source of truth, acceptance criteria,
   forbidden actions, verification expectations, explicit checkpoint gates,
   timeout budget, and stop conditions.
4. Require the worker to pause after its plan/assumptions checkpoint. The lead
   must review and explicitly accept it before implementation edits begin.
5. Where TDD or debugging applies, require failing-test or reproduction evidence
   and another explicit lead acceptance before production implementation begins.
6. When the task brief requires an interim diff/risk checkpoint, require the
   worker to pause there and wait for explicit lead acceptance before
   continuing.
7. Observe structured status/events and diffs. Do not claim access to hidden
   chain-of-thought. Send bounded corrections in the same session when the lane
   remains safe and recoverable.
8. On secrets/private-data exposure, unauthorized scope access/write, or another
   security boundary breach, abort immediately and revoke write eligibility for
   the compromised provider/model/runtime/tool/permission-profile combination
   across all tasks pending incident review and requalification. Otherwise,
   correct ordinary rule drift and allow up to three materially identical rule
   failures before marking that model/task lane failed and reassigning.
9. Inspect the complete diff and partial work before accepting or reassigning.
   Reject stale-base, ownership-overlap, or out-of-scope changes; never land
   unverified output.
10. Trusted native owner runs project gates and performs authorized integration,
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

Record task ID, exact provider/model identifier, positive capability evidence,
session ID, worktree/branch, base SHA, complete task scope, artifact/file
ownership, protected paths, permission profile, canary status or recorded
user-authorized waiver, checkpoint acceptances, corrections, verification
commands/results, changed paths, diff disposition, retry/rule-failure count,
final result, and remaining risks.

Completion requires:

- no forbidden, out-of-scope, or overlapping artifact/file change;
- current base, exclusive worktree ownership, and artifact ownership still
  valid;
- expected artifact and structured result present;
- independent gates pass at required scope;
- sanitized bounded-retention ledger updated without hidden reasoning, secrets,
  raw unnecessary logs, or private data;
- lead accepts or rejects every changed path and retains merge control.

At every terminal task outcome—accepted, rejected, cancelled, failed, timed-out,
or security-aborted—always terminate the model session, injected credentials,
and live loopback OpenCode server. These runtime resources are never retained for
reuse. For a security-aborted task, retain only the sanitized incident evidence
needed for incident review and requalification. For other terminal outcomes,
only non-sensitive resources such as the isolated worktree, adapter
configuration, and sanitized task metadata may remain reusable, and only with a
recorded owner, expiration, and mandatory cleanup deadline.
