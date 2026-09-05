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
  concurrency.

This skill routes orchestration only. Do not duplicate or replace
`sprint-issue.md`, Speckit, `$source-command-module-audit`, TDD, design,
database, security, E2E, or review instructions. Compose only workflows relevant
to current task.

When lead selects an OpenCode execution pool, load
[`$opencode-team-delegation`](../opencode-team-delegation/SKILL.md) for its
detailed security, pilot, session, and evidence procedure. Keep capability and
ownership routing in authoritative workflow above; do not copy external-runtime
mechanics into this entrypoint.

When explicitly invoked for a small task, run scaling check and avoid a swarm.
Delegate to one bounded worker if team-led handling remains requested. Lead
stays coordination-only and does not implement repository changes.
