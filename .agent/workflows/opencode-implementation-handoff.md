# Codex To OpenCode Implementation Handoff

Use this workflow only when Mohamed explicitly asks Codex to plan a task and
delegate the approved implementation to Qwen or GLM in OpenCode.

Do not auto-trigger it. Small and low-reasoning tasks may be assigned directly
to an OpenCode model without Codex involvement.

## 1. Responsibility Split

- **Codex owns:** live discovery, root-cause analysis, architecture and product
  reasoning, the implementation plan, required mockups, and the approval gate.
- **Mohamed owns:** plan and mockup approval, model choice when specified, and
  the decision to request a later Codex review.
- **The OpenCode model owns:** tests, implementation, verification, commit,
  push, and creation of a ready pull request.

After handoff, Codex does not implement, supervise ordinary coding choices, or
review the diff unless Mohamed explicitly asks it to review the PR.

## 2. When To Use It

Use it for a medium-to-large task when:

- the difficult reasoning can be completed before coding;
- the desired behavior and boundaries can be expressed in an approved plan;
- implementation can proceed independently from that plan; and
- Qwen or GLM has the tools and repository access required to finish the task.

Do not hand off while a product, business, schema, sync, security, or visual
decision remains unresolved. Resolve it with Mohamed during planning first.

## 3. Codex Planning Phase

Before proposing implementation, Codex must:

1. Read the current issue or request, relevant specs, `AGENTS.md`, business
   decisions, code, tests, callers, and dependents.
2. Validate the request against current `origin/main` and identify the correct
   branch base.
3. Confirm the expected behavior, root cause, affected boundaries, regression
   risks, and required verification.
4. Follow applicable project workflows. For a GitHub issue, compose this with
   [`sprint-issue.md`](./sprint-issue.md).
5. Produce a self-contained implementation plan containing:
   - objective and source of truth;
   - approved decisions and assumptions;
   - scope and non-goals;
   - affected modules and expected files;
   - ordered implementation steps;
   - TDD, integration, E2E, and manual QA expectations;
   - PR acceptance criteria; and
   - known risks or genuine blockers.
6. For meaningful visible UI or flow changes, create the required mockup and
   obtain Mohamed's approval before handoff.

Codex must stop at this gate and wait for Mohamed to approve the plan and any
required mockup. Approval authorizes the planned implementation and ready PR,
but never authorizes merge, release, or deployment.

## 4. Prepare The Handoff

After approval:

1. Create an isolated sibling worktree and `codex/` branch from the recorded
   base. Preserve unrelated checkouts and link the existing dependency tree as
   required by `AGENTS.md`; never install a second dependency tree.
2. Use the model Mohamed named. If no model was named, select Qwen or GLM based
   on current availability and task fit, and state the selection.
3. Create one persistent OpenCode session bound to that worktree, branch, and
   model. Prefer OpenCode's server/session interface with status polling over a
   single long-running CLI request.
4. Give the model one concise, self-contained implementation message. Reference
   the approved plan artifact and source-of-truth files when they exist. If the
   approved plan lives only in the Codex conversation, include that plan
   directly in the message without copying unrelated conversation history.

Use this handoff message shape:

> Implement the approved plan for `<task>` in this worktree. Read `AGENTS.md`,
> the linked issue/spec, and `<approved-plan-path-or-plan>`. Own the task
> through a ready pull request: write the required tests first, implement the
> complete approved scope, run the relevant verification, commit, push, and
> create the PR. Follow the approved decisions and mockup exactly. Make normal
> implementation choices yourself. Stop only for a real blocker or a conflict or
> missing decision that changes approved behavior. Report the PR URL, changed
> files, tests and results, manual-only gaps, and remaining risks.

Do not add qualification exercises, canaries, artificial checkpoints, per-file
permissions, or a second planning turn. The approved plan is the worker's
implementation contract.

## 5. Autonomous OpenCode Phase

The OpenCode model proceeds without routine Codex intervention:

1. verify its worktree, branch, issue, and approved plan;
2. prove the required regression test fails for the expected reason;
3. implement the approved scope and make the tests pass;
4. run focused and affected validation honestly;
5. commit and push the branch;
6. create a ready, non-draft PR following `sprint-issue.md`; and
7. report the PR URL and completion evidence.

Codex may poll session status and relay completion or a genuine blocker. It must
not turn the handoff into a back-and-forth review loop.

Use one controller per OpenCode session. While Codex owns the handoff, the
OpenCode desktop app may be used to observe progress but should not send
additional messages. If Mohamed sends a message or takes control, Codex yields
that session and does not issue another prompt until ownership is clear.

If a command times out, inspect the persistent session before retrying. Reuse
the same session when work is still present; do not create duplicate workers.
Stopping from one interface is not assumed to stop every launcher process, so
confirm the session is no longer active before declaring it stopped.

## 6. Completion

When the model finishes, Codex may confirm only that the branch and ready PR
exist and relay the model's reported validation. That confirmation is transport
and delivery bookkeeping, not a code review or approval.

Codex must not inspect the PR diff, request changes, modify the branch, approve,
merge, release, or deploy unless Mohamed explicitly requests the corresponding
action.

## 7. Optional Codex Review

A Codex review is a separate, opt-in phase. Start it only after an explicit
request such as "review this PR". Then follow the repository's code-review and
PR-comment workflows, evaluate the current PR against its approved plan and
source of truth, and report or address only validated findings within the new
authorization.
