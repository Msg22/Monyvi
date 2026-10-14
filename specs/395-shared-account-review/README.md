# Shared account review — issue #395

Separate feature following merged
[PR #383](https://github.com/Msg22/Monyvi/pull/383), targeting latest `main` at
`7838df64eb9b3828c6e8f1a02f590b008d5435fd`. Originally stacked; retargeted by
owner instruction after the merge.

- [Specification](spec.md): agreed behavior, six user stories, 24 requirements
  and edge cases.
- [Spec approval receipt](approvals/spec-2026-10-14.json): owner approved exact
  published bytes. The older status header is superseded by this receipt.
- [Pre-plan review package](pre-plan-review.md): all existing images paired with
  proposed exact bindings, common design-system contract and EN/AR copy review.
- [Requirements/readiness checklist](checklists/requirements.md),
  [clarification pass](clarification-report.md),
  [workflow status](workflow-status.md).
- [Mockup index](mockups/README.md): unchanged approved references plus existing
  R3 proposals.
- [Owner adjustments](mockups/adjustments.md): Add default flag, existing
  currency modal/context and no further image generation.
- [Manual plan / coverage matrix](manual-test-plan.md): scenarios for future
  implementation, with no unrun tests claimed.

Planning/publication only. Final R3 visual/binding approval precedes
plan/contracts/tasks/analyze; production code and implementation assignments
have not started. Original #383 spec/tasks and app code remain unchanged.
