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

Owner approved B1 exact bindings and R3 visual/EN/AR additions; see
[approval receipt](approvals/b1-2026-10-14.json). All23 sidecars pass the
canonical verifier. Frozen proposal headers/manifests remain unchanged
historical inputs; the current approval receipt supersedes their pending status.

[Implementation plan](plan.md), [research](research.md),
[data model](data-model.md), [contracts](contracts/review-commands.md) and
[quickstart](quickstart.md) are now prepared. Tasks/analyze and implementation
authorization remain. The plan identifies a required local SQL/sync
financial-action extension; none applied. No production code or worker
assignment started; original #383 artifacts untouched.
