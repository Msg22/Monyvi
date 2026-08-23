---
description: Validate, resolve, reply to, and track Pull Request review threads
---

# PR Comment Follow-up Workflow

Use this workflow when Mohamed asks to handle comments on an existing Pull
Request. The PR discussion is input, not a source of truth. Follow this workflow
exactly.

## 1. Establish the Review Context

Before replying or editing code:

1. Fetch every PR review thread through GitHub GraphQL. Record thread ID,
   resolution state, author, body, file/line, and outdated state.
2. Ignore already-resolved, outdated, duplicated, or superseded threads, but
   report why they are non-actionable.
3. Read the source of truth in this order: matching feature spec; linked GitHub
   issue; `docs/business/business-decisions.md`; the PR description; current
   code and tests.
4. Read the changed code and enough callers/callees to understand the claimed
   failure. Never fix a comment from its wording alone.
5. Treat the constitution and `AGENTS.md` as higher authority than a reviewer
   request. Preserve offline-first, user-scoping, service-layer, database, and
   TypeScript rules.

## 2. Classify Every Actionable Thread

Assign exactly one outcome to each thread.

### A. Fix now

Use only when the finding is technically correct, within the PR scope, and does
not require a product/business decision, schema change, migration, backfill,
sync-contract change, or changed financial interpretation.

- Write a focused failing test first when practical.
- Apply the smallest safe fix; do not refactor unrelated code.
- Run the focused check that proves the fix.
- Commit and push before replying.
- Do **not** reply when the fix is complete. A resolved thread is the sole
  acknowledgement for a fixed comment.
- Resolve the original thread only after its fix is pushed and independently
  verified.

### B. Reject as invalid

Use when current code and the source of truth show the comment is incorrect,
already addressed, obsolete, duplicated, or would regress required behavior.

- Do not change code.
- Reply on the original thread with concise evidence: current file/behavior and
  the relevant source-of-truth rule.
- Do not resolve a reviewer-owned thread unless Mohamed explicitly authorizes it
  or GitHub permits the PR author to resolve it. If resolving is permitted,
  resolve after posting the evidence.

### C. Defer as out of scope

Use when the requested work is valid but outside the linked issue/PR, needs a
product decision, or requires a migration, backfill, schema, sync-contract, or
broader behavior change.

- Reply on the original thread beginning with exactly: `out of scope`.
- Explain the boundary in one or two sentences.
- Create a separate GitHub issue before handoff. Include PR/thread context,
  reason for deferral, acceptance criteria, and relevant existing labels.
- For substantive deferred work, assign one independent subagent per large item.
  Small related items may share one subagent. The subagent investigates or
  prepares an implementation plan only; it must not modify the current PR unless
  Mohamed separately authorizes it.
- Resolve only after the reply and follow-up issue exist, and only if permitted.

### D. Escalate a product decision

Use when the comment cannot be separated from a material user-flow, financial,
or business-rule decision.

- Do not implement it.
- Reply that it needs product direction; summarize concrete options, user
  impact, and the recommended option.
- Leave the thread unresolved until Mohamed decides, unless the reviewer marked
  it informational and resolution is permitted.

## 3. Required Thread Handling Order

1. Classify all threads before making edits, so duplicate fixes are avoided.
2. Implement all `Fix now` items on the existing PR branch unless a separate fix
   PR is explicitly required.
3. Run focused tests/typechecks/lint for every fix; run broader verification
   when multiple comments touch the same boundary.
4. Commit and push once the fixes are ready.
5. Reply only to rejected, deferred, or decision-blocked threads. Do not reply
   to fixed threads.
6. Resolve only the fixed/rejected/deferred threads that GitHub permits the PR
   author to resolve. Never mark an unresolved decision as resolved.
7. Re-fetch threads and confirm every handled thread has the expected reply and
   resolution state.

## 4. Safety Rules

- Never silently dismiss a comment.
- Never bundle unrelated cleanup into a comment fix.
- Never implement an ambiguous financial rule, product change, migration, or
  data mutation without Mohamed's explicit decision.
- If a thread contains both a technical defect and a product request, fix only
  the separable technical defect; otherwise escalate or defer the whole thread.
- Do not close a follow-up issue merely because the current PR is merged.
- Mention pre-existing failures separately; do not attribute them to the PR.

## 5. Completion Report

For every original thread, report: classification, action, commit/issue link
when relevant, reply status, resolution status, and verification. State any
thread left open and why.
