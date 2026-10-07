---
name: team-led-delivery
description:
  "Lead and coordinate specialist agents for a large Monyvi module, epic,
  redesign, migration, or cross-layer delivery with parallel ownership and
  approval gates. Use when the user asks to act as team lead, form or manage a
  team, delegate substantial work, or when a task has multiple independent
  specialist domains. Do not auto-trigger for small/tightly sequential work or
  explicit single-agent/no-delegation requests."
---

# team-led-delivery

Read
[the authoritative team-led delivery workflow](../../../.agent/workflows/team-led-delivery.md)
completely, then follow it.

Start by stating:

- why team-led delivery applies or why a single-worker path is safer;
- which specialized workflows also govern the task;
- current authorization boundary;
- roster, ownership, dependencies, model/effort rationale, and active
  concurrency;
- remote/local capability and start-readiness of Normal ChatGPT, OpenCode, and
  Antigravity, plus the reason for any native-subagent fallback;
- selected portable persona or audited Codex adapter path and relevant
  skill/workflow for each lane, with verified runtime support before selecting a
  Codex `agent_type`;
- elapsed-time estimate, four-hour pre-start decision if applicable, and next
  time/worker checkpoint.

This skill routes orchestration only. Do not duplicate or replace
`sprint-issue.md`, Speckit, `$source-command-module-audit`, TDD, design,
database, security, E2E, or review instructions. Compose only workflows relevant
to current task.

When lead selects an OpenCode execution pool, load
[`$opencode-team-delegation`](../opencode-team-delegation/SKILL.md) for its
detailed runtime, usage, model-selection, fallback, and session procedure. When
lead selects the Gemini/Antigravity CLI pool, apply its execution-pool rules
from the authoritative workflow (no separate delegation skill). Keep capability
and ownership routing in authoritative workflow above; do not copy
external-runtime mechanics into this entrypoint.

Apply the authoritative workflow's execution order to **bounded partial tasks**,
not only end-to-end tasks: user-created Normal ChatGPT chats with GitHub
connector first, then suitable OpenCode paid/free models, Antigravity, and
native workers when their capabilities are needed. Determine the required number
of Normal ChatGPT chats, suggest names, and ask Mohamed to create them before
dispatch; he returns their identities. Use the workflow's capability check, time
ledger, remote-to-local handoff, and timeout/contact recovery before changing
workers or ownership. Never treat a wait timeout alone as worker failure.

When explicitly invoked for a small task, run scaling check and avoid a swarm.
Delegate to one bounded worker if team-led handling remains requested. Lead
stays coordination-only and does not implement repository changes.
