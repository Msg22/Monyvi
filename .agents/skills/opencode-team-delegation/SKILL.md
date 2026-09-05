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
Before dispatch, record both the exact provider-prefixed model ID and the
immutable provider model revision/build exposed for that invocation. A display
name or moving alias is not sufficient identity. If the provider/runtime cannot
identify an immutable revision/build, do not reuse capability evidence or a
canary waiver for write work; route the write lane elsewhere until immutable
identity is available.

Do not statically confine either model to narrow categories. Route adaptively,
let each model attempt varied source, test, documentation, review, and
implementation work, including substantial tasks when its demonstrated
capability and the task contract support them.

Every assigned task requires **positive capability evidence** for each material
capability it will use, such as source reading, repository editing, test
execution, image input, or a required tool surface. Capability evidence is bound
to the exact provider, provider-prefixed model ID, immutable model
revision/build, OpenCode/runtime version, tool surface/version set, and every
permission or environment dimension material to that capability. The absence of
a recorded unsupported capability is not evidence that the model supports it.
Invalidate affected evidence when any bound dimension changes.

The recorded GLM image-input limitation is evidence only for the immutable
revision/build and path that produced it. Do not generalize it to a different
revision. Until the active revision has positive image-input evidence, do not
assign it image-dependent visual comparison; this does not block unrelated
source work.

External models may implement already-approved financial, schema, sync,
security, architecture, authentication/RLS, or migration work when the task
packet contains the authoritative decision and an independent appropriate
specialist verifies the result. They must never invent, choose, approve, or
silently alter those decisions.

Read-only qualification produces **capability evidence**, not an all-or-nothing
model certification. Use representative read-only benchmarks to learn what the
exact immutable configuration can reliably do, record supported and unsupported
capabilities, and route future tasks accordingly. One failed benchmark does not
permanently disqualify unrelated capabilities.

The bounded-write canary is the recommended default before real OpenCode writes:
independently qualify the exact permission profile in a disposable synthetic
checkout, proving an in-scope edit succeeds while outside-scope write, shell,
network, secret access, Git/remote mutation, dependency installation, and
destructive action probes are denied.

The user may explicitly waive that canary. The waiver must be recorded for the
**exact task** and the full enforcement configuration: provider,
provider-prefixed model ID, immutable model revision/build, OpenCode/runtime
version, exact tool surface/version set, permission-profile identifier or hash,
environment/sandbox boundary, and writable-allowlist fingerprint. Any
enforcement-relevant change invalidates that waiver before another write; obtain
a fresh explicit waiver or run the canary for the changed configuration.

A waiver does not weaken the remaining controls: use one isolated exclusive
task/worktree, non-overlapping artifact ownership, a concrete writable path or
directory allowlist derived from those artifacts, an explicit deny-by-default
profile, no secrets or private financial data, no dependency installs,
Git/remote mutations, destructive actions, releases, or deployments, the
required mentoring pause gates, and independent trusted-native inspection of the
complete diff plus required tests/verification before acceptance.

If repository-edit capability is the only material capability that lacks prior
positive evidence, a user-authorized waiver may bootstrap it through a
**provisional first-write checkpoint**. All other material capabilities must
already have positive evidence. The worker makes one small representative edit
inside the derived writable allowlist, then pauses before any additional edit.
The trusted native owner verifies the changed paths, permission enforcement, and
diff. Only an accepted checkpoint becomes positive repository-edit evidence for
that immutable configuration and permits the same task/session to continue. A
failed checkpoint is not evidence; any boundary breach triggers incident
quarantine. This provisional path never supplies evidence for unrelated
capabilities such as test execution or image input.

Sensitive-data exposure, unauthorized scope access/write, or another security
boundary breach immediately aborts the lane and quarantines the implicated
provider/model revision/runtime/tool combination across read and write modes and
all permission profiles. A new task, session, worktree, or permission profile
must not bypass quarantine. Restore eligibility only after incident review and
requalification. Incident review may narrow quarantine to a profile-local cause
only when evidence proves that narrower cause and requalification for the
intended configuration succeeds. User or canary waiver cannot override
quarantine.

## Prepare And Dispatch

Always read [security and audit controls](references/security-and-audit.md).
Read [dispatch protocol](references/dispatch-protocol.md) when preparing,
starting, monitoring, following up, cancelling, or accepting a session.

Required dispatch contract:

1. Verify OpenCode/runtime identity, authentication, exact provider/model,
   immutable model revision/build, tool surface/version set, permission profile,
   positive evidence for every material capability, current user-approved
   data-sharing boundary, and quarantine status.
2. Allocate one complete task/session/worktree/owner with immutable base SHA,
   exclusive worktree/branch responsibility, and non-overlapping artifact/file
   ownership. One writer owns each artifact per wave. Stop on ownership overlap.
3. Derive a concrete workspace-relative writable file/directory allowlist from
   the assigned exclusive artifact set and enforce it in the permission profile.
   Cohesive edits and new files are allowed only inside those owned boundaries;
   never use an unbounded repository-root write grant.
4. Prefer one dedicated loopback OpenCode server per task with task-scoped
   credentials. If a shared server is necessary, record its server ID and active
   session registry and follow the shared-server teardown rules below.
5. Send a self-contained brief containing source of truth, acceptance criteria,
   forbidden actions, verification expectations, exact identity/waiver binding,
   writable allowlist, explicit checkpoint gates, timeout budget, and stop
   conditions.
6. Require the worker to pause after its plan/assumptions checkpoint. The lead
   must review and explicitly accept it before implementation edits begin.
7. Where TDD or debugging applies, require failing-test or reproduction evidence
   and another explicit lead acceptance before production implementation begins.
8. When a provisional first-write checkpoint is required, permit one small
   allowlisted edit, then require an immediate pause and trusted-native diff and
   permission review before any further edit.
9. When the task brief requires an interim diff/risk checkpoint, require the
   worker to pause there and wait for explicit lead acceptance before
   continuing.
10. Observe structured status/events and diffs. Do not claim access to hidden
    chain-of-thought. Send bounded corrections in the same session when the lane
    remains safe and recoverable.
11. On a security/sensitive-data/scope breach, abort immediately and apply the
    cross-profile quarantine above. Otherwise, correct ordinary rule drift and
    allow up to three materially identical rule failures before marking that
    model/task lane failed and reassigning.
12. Inspect the complete diff and partial work before accepting or reassigning.
    Reject stale-base, ownership-overlap, out-of-allowlist, or out-of-scope
    changes; never land unverified output.
13. Trusted native owner runs project gates and performs authorized integration,
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

Record task ID, provider/model ID, immutable model revision/build,
OpenCode/runtime version, tool surface/version set, positive capability
evidence, session ID, server ID/mode, worktree/branch, base SHA, complete task
scope, artifact/file ownership, derived writable allowlist, protected paths,
permission profile, canary status or fully bound user-authorized waiver,
provisional first-write result when used, checkpoint acceptances, corrections,
verification commands/results, changed paths, diff disposition,
retry/rule-failure count, quarantine/eligibility state, final result, and
remaining risks.

Completion requires:

- no forbidden, out-of-scope, out-of-allowlist, or overlapping artifact/file
  change;
- current base, exclusive worktree ownership, and artifact ownership still
  valid;
- expected artifact and structured result present;
- independent gates pass at required scope;
- sanitized bounded-retention ledger updated without hidden reasoning, secrets,
  raw unnecessary logs, or private data;
- lead accepts or rejects every changed path and retains merge control.

At every terminal task outcome—accepted, rejected, cancelled, failed, timed-out,
or security-aborted—terminate that task's model session and task-scoped injected
credentials immediately. A dedicated per-task loopback server is also terminated
immediately. For an intentionally shared server, remove the terminal session and
its task-scoped credentials immediately but keep the server only while another
recorded active session still needs it; shut the shared server after the final
active session terminates. If the incident implicates the shared server or its
runtime/security boundary, abort affected sessions and terminate that server
immediately.

For a security-aborted task, retain only sanitized incident evidence needed for
incident review and requalification. For other terminal outcomes, only
non-sensitive resources such as the isolated worktree, adapter configuration,
and sanitized task metadata may remain reusable, and only with a recorded owner,
expiration, and mandatory cleanup deadline.
