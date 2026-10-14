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
- remote/local capability and start-readiness of Normal ChatGPT, verified
  OpenCode FREE models, and Antigravity Gemini/Claude, plus a proposed native
  exception only after asking Mohamed for explicit prior task permission;
- selected portable persona or audited Codex adapter path and relevant
  skill/workflow for each lane, with verified runtime support before selecting a
  Codex `agent_type`;
- elapsed-time estimate, four-hour pre-start decision if applicable, and next
  time/worker checkpoint.

This skill routes orchestration only. Do not duplicate or replace
`sprint-issue.md`, Speckit, `$source-command-module-audit`, TDD, design,
database, security, E2E, or review instructions. Compose only workflows relevant
to current task.

For verified free OpenCode and Gemini/Claude Antigravity, follow their execution
pool sections in the authoritative workflow. Do not restore retired OpenCode
paid routes or a second delegation entrypoint. Keep runtime/model/pricing
verification and the native permission gate canonical in that workflow, not
duplicated as operational instructions here.

Apply the authoritative workflow's order to **bounded partial tasks**, reviews,
and local verification, not just end-to-end work: Normal ChatGPT chats with the
GitHub connector → independently verified OpenCode FREE models → Antigravity
Gemini/Claude. Native workers require **Mohamed's explicit prior permission for
each exact task/continuation**, even when primary pools are unavailable; never
resume a completed native lane without it. Determine the required Normal
ChatGPT chats, suggest names, and ask Mohamed to create them before dispatch.
Use the canonical capability, cost, ownership, time, contact-recovery, and
handoff rules. Never treat a wait timeout alone as worker failure.

When explicitly invoked for a small task, run scaling check and avoid a swarm.
Delegate to one bounded worker if team-led handling remains requested. Lead
stays coordination-only and does not implement repository changes.
