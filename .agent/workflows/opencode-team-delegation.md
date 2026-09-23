# OpenCode Worker Delegation

Canonical OpenCode worker runtime and usage policy. It covers model selection,
OpenCode Go limits, usage checks, limit fallback, and session discipline only.
Team ownership, the DAG, approval gates, and review rules stay canonical in
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

Select the lowest-cost capable model based on task risk, ambiguity, expected
context, current rolling five-hour/weekly/monthly headroom, and demonstrated
reliability. Reserve small, expensive allowances for bounded difficult work;
prefer Flash/value models for long implementation stretches.

Verify exact installed identifiers with `opencode models` before every new
paid-model dispatch; never infer or autocomplete an ID. Go model IDs follow the
`opencode-go/<model-id>` format, while locally installed free routes use the
local provider prefix (see Limit Fallback).

## 3. Usage Snapshot

Limits, promotions, free models, prices, and the model lineup are volatile.
Official current source: <https://opencode.ai/docs/go>. Recheck that page and
the exact installed IDs before each new paid-model dispatch.

Snapshot verified 2026-09-23:

| Model            | Monthly | Five-hour (20%) | Weekly (50%) |
| ---------------- | ------- | --------------- | ------------ |
| GLM-5.3-Flash    | $60     | $12             | $30          |
| GLM-5.3          | $15     | $3              | $7.50        |
| Qwen3.8-Flash    | $30     | $6              | $15          |
| Qwen3.8-Max      | $15     | $3              | $7.50        |
| DeepSeek V4 Pro  | $15     | $3              | $7.50        |
| DeepSeek V4 Flash| $30     | $6              | $15          |
| MiniMax M3       | $60     | $12             | $30          |
| Kimi K3          | $15     | $3              | $7.50        |
| Grok 4.7         | $15     | $3              | $7.50        |

OpenCode Go limits are per model: five-hour allowance is 20% of that model's
monthly allowance, weekly is 50%, monthly is 100%. DeepSeek V4.1 Flash carried a
temporary four-times promotion ending Sep 27; recheck it instead of assuming it.

## 4. Usage Checks

Run an executable pre-dispatch usage check. First orient with model-level
statistics:

```text
opencode stats --days 1 --models
```

Then query the local rolling five-hour spend, summed by `opencode-go` model
(18000 seconds window):

```text
opencode db "SELECT json_extract(data, '$.modelID') AS model, ROUND(SUM(json_extract(data, '$.cost')), 4) AS cost_usd FROM message WHERE json_extract(data, '$.role') = 'assistant' AND json_extract(data, '$.providerID') = 'opencode-go' AND json_extract(data, '$.time.created') >= (strftime('%s','now') - 18000) * 1000 GROUP BY json_extract(data, '$.modelID') ORDER BY cost_usd DESC;"
```

The local query covers this machine only. The web console
(<https://opencode.ai/console>) is authoritative when usage may exist outside
this machine. Never print API keys or tokens.

`opencode-go/muse-spark-1.3-contributor` is metered Go usage, while the locally
installed `opencode/muse-spark-1.3-contributor-free` is a separate free route.
Verify exact current identifiers with `opencode models` at dispatch.

## 5. Limit Fallback

When a paid model reaches or approaches its active limit, stop and recheck that
session, preserve work, and hand off to an available free model. Preferred
verified fallback order: Muse Spark free, Big Pickle, then Space Bunny Free.
Availability and exact IDs must be checked at dispatch. Never run two writers
concurrently in the same worktree during a fallback.

## 6. Session Discipline

A created session is not proof of communication. Require the first non-error
model response or event before treating the session as live. If a provider
request remains empty or stalled, inspect the persistent session and process,
stop the stalled writer before fallback, then create one bounded handoff
carrying the current state.

Use persistent visible OpenCode sessions, one controller, isolated same-disk
worktrees for writers, the existing node_modules junction, full required
permissions, normal TDD/verification, and milestone monitoring without
micromanagement.