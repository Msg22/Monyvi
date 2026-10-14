# Clarification pass

Date: 2026-10-14. Feature: [spec.md](spec.md).

Prior owner answers are recorded in the spec's Clarifications section. No new
question was necessary for the agreed business scope. No tests or production
code were changed.

| Category                       | Status                                     | Evidence / disposition                                                                                                            |
| ------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Functional scope and behavior  | Clear                                      | FR-001–024 and six stories; explicit exclusions                                                                                   |
| Domain identity and lifecycle  | Clear for requirements                     | Explicit same-currency/evidence grouping, confirmation versus selection, save boundary; technical representation deferred to plan |
| Interaction and UX             | Resolved direction; visual gate pending    | Independent actions, compact conditional states, Add flag, existing currency modal                                                |
| Reliability and recovery       | Clear                                      | Selected batch atomicity, retry idempotency, SMS recovery, Voice session-only                                                     |
| Ownership/security             | Clear                                      | Owned eligible accounts, stale-reference revalidation, no foreign draft reuse                                                     |
| Provider/integration contracts | Deferred to plan                           | Response/evidence/currency-certainty schemas and SMS chunk reconciliation; no extra parsing call                                  |
| Accessibility/localization     | Clear obligation; binding evidence pending | Existing EN/AR/shared patterns, RTL and reachable actions; owner device evidence                                                  |
| Terminology and completion     | Clear                                      | Confirmed group distinct from Selected row; readiness gate checklist                                                              |

Next: approve the existing visual proposals/adjustments and scoped bindings,
then `speckit-plan` → `speckit-tasks` → `speckit-analyze`. Do not invoke
monolithic implement or start implementation assignments.
