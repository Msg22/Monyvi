# OpenCode Worker Delegation

Canonical OpenCode worker runtime policy. It covers model selection,
limit-response handoff, and session discipline only. Team ownership, the DAG,
approval gates, and review rules stay canonical in
[`team-led-delivery.md`](./team-led-delivery.md) and must not be duplicated
here.

Use it for every OpenCode dispatch, including a
[`opencode-implementation-handoff.md`](./opencode-implementation-handoff.md)
handoff, inside and outside team-led delivery.

## 1. Authorization And Scope

OpenCode becomes an approved execution pool only after explicit user opt-in; an
implicit team-led trigger never grants third-party disclosure. Record the
approved data-sharing boundary before first dispatch. OpenCode workers still get
full required permissions and normal repository TDD/verification behavior.

Keep the policy simple: one controller, no second orchestrator, no capability
exam, no artificial checkpoints, and no repeated permission prompts.

## 2. Model Selection

Use a free model for small tasks, routine verification, unit tests, and medium
implementation it can handle. Use a paid model only for a medium or large task
that needs strong reasoning. Select the lowest-cost capable model within that
rule based on task risk, ambiguity, expected context, and demonstrated
reliability. Do not inspect or estimate remaining quota before dispatch.

Verify exact installed identifiers with `opencode models` before every new model
dispatch; never infer or autocomplete an ID. A free route and a paid Go route
may use similar model names but are separate identifiers. Do not assume one has
the other's access or limits.

## 3. Start Readiness And Limit Handoff

Do not run pre-dispatch usage or quota checks. Confirm the chosen model produces
a first non-error response; session creation alone does not prove readiness. If
a model reports a quota or rate limit while working, stop its writer, inspect
and preserve its session and partial changes, then hand unfinished work to
another capable model under `team-led-delivery.md`. Include the task brief,
current branch/head, completed work, verification, and remaining steps. Check
the successor's exact model ID and first response. Never run two writers in the
same worktree at once. Never print API keys or tokens.

## 4. Session Discipline

A created session is not proof of communication. Require the first non-error
model response or event before treating the session as live. If a provider
request remains empty or stalled, inspect the persistent session and process,
stop the stalled writer before fallback, then create one bounded handoff
carrying the current state.

Use persistent visible OpenCode sessions, one controller, isolated same-disk
worktrees for writers, the existing node_modules junction, full required
permissions, normal TDD/verification, and milestone monitoring without
micromanagement.
