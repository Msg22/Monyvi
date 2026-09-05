---
name: opencode-team-delegation
description:
  Safely delegate bounded Monyvi research, visual, test, documentation,
  localization, or low-risk mechanical tasks to approved OpenCode models through
  a loopback server and persistent sessions. Use after team lead selects an
  OpenCode lane; not for autonomous financial, auth/RLS, sync, migration,
  security, architecture, commit, push, or merge decisions.
---

# OpenCode Team Delegation

Use this procedure only inside authorization and ownership established by
`$team-led-delivery`. It defines delegation controls; it does not install
OpenCode, implement an adapter, or expand permission.

## Route Work

- Prefer `glm-5.3-flash` for bounded visual inspection, tests, and mechanical
  implementation.
- Prefer `qwen3.8-flash` for inventories, documentation, localization audits,
  test enumeration, and low-risk mechanical work.
- Verify exact provider-prefixed identifier with current OpenCode model
  inventory before dispatch. If model, authentication, or required tools are
  unavailable, stop that lane; do not silently substitute another model.
- Never delegate autonomous ownership of financial rules, authentication, RLS,
  synchronization contracts, migrations, security decisions, or architecture.

Start with five read-only benchmark tasks. Bind pilot result to exact model and
revision, OpenCode/runtime version, tool surface, and permission profile tested.
After they pass, independently review the exact bounded-write profile and
qualify it with denied-action probes plus a canary edit in a disposable
synthetic checkout. Permit real test-only or mechanical writes only after both
stages pass for the recorded configuration. Every result requires independent
Monyvi verification; model confidence is not evidence.

## Prepare And Dispatch

Always read [security and audit controls](references/security-and-audit.md).
Read [dispatch protocol](references/dispatch-protocol.md) when preparing,
starting, monitoring, following up, cancelling, or accepting a session.

Required dispatch contract:

1. Verify OpenCode runtime, authentication, exact model, loopback server health,
   explicit permission profile, and current user-approved data-sharing boundary.
2. Allocate one task/session/worktree/owner with immutable base SHA and
   non-overlapping path allowlist.
3. Send self-contained brief containing source of truth, acceptance criteria,
   forbidden actions, exact verification, timeout, and stop conditions.
4. Monitor structured session status/events. Follow up in same session when
   context remains valid; abort on timeout, scope drift, ownership overlap,
   unsafe permission request, or repeated unchanged failure.
5. Inspect complete diff and partial work before retrying. Reject stale-base or
   out-of-scope changes; never land unverified output.
6. Trusted native worker runs project gates and performs authorized integration,
   commits, pushes, and PR mutations. Lead coordinates and verifies. Escalate
   sensitive decisions through applicable user and business approval gate; never
   resolve them inside external lane.

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

Record task ID, model identifier, session ID, worktree, base SHA, path
allowlist, permission profile, start/end state, verification commands/results,
changed paths, diff disposition, retries, and remaining risks. Completion
requires:

- no forbidden or out-of-scope action;
- current base and ownership still valid;
- expected artifact and structured result present;
- independent gates pass at required scope;
- sanitized bounded-retention ledger updated;
- server, session artifacts, injected credentials, permission profile, and
  isolated checkout are torn down; a reusable lane may instead record a short
  expiration, owner, and mandatory teardown deadline while authorization and
  data-sharing scope remain valid;
- lead accepts or rejects every changed path.
