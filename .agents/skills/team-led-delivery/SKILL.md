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
`sprint-issue.md`, Speckit, `$source-command-module-audit`, delivery policy,
design, database, security, E2E, or review instructions. Compose only workflows
relevant to current task.

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
resume a completed native lane without it.

Reuse suitable existing Normal ChatGPT chats first. The lead creates and names
additional chats in the verified Codex in-app browser, with external-browser
fallback only for the documented failure/sign-in reason; never ask Mohamed to
create chats or provide their names/links. Follow the workflow's connector
readiness, acknowledged chat identity, one-attempt same-chat recovery, writer
freeze, bounded replacement, concise handoff, standing Extra High/Pro selection
for newly created Normal workers when supported, and ownership rules. **Reject
every in-chat Codex handoff** using **Stay in chat** or the observed decline
control; remain in Normal ChatGPT, verify no unintended Codex task was created,
and preserve drafts/report the blocker if decline cannot be performed or
verified. A wait timeout alone is not worker failure.

When explicitly invoked for a small task, run scaling check and avoid a swarm.
Delegate to one bounded worker if team-led handling remains requested. Lead
stays coordination-only and does not implement repository changes.
