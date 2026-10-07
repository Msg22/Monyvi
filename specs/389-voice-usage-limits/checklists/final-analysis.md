# Specification Analysis Report

Read-only speckit.analyze completed locally on 7 October 2026, before
implementation or worker assignment. Scope: spec, plan, existing tasks,
research, data model, quickstart, all four contract files, approved sidecars and
governing constitution. No files were modified during analysis.

Prerequisites exited 0 using Git Bash with both explicit feature overrides and
selected specs/389-voice-usage-limits. Optional before/after speckit.git.commit
hooks were inspected and not run.

| ID  | Category           | Severity | Locations                                                                                          | Summary                                                                                                                                                                                         | Recommendation                                                                                                                                                                                                                         |
| --- | ------------------ | -------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Execution evidence | MEDIUM   | tasks.md:79-95; tasks.md local continuation T004/T005; reconciliation.md runtime evidence boundary | No verified Android target or Voice audio/provider-double/server-clock controls. Existing baseline has eight suites/76 passing tests, but Maestro and feature behavioral Red remain unexecuted. | Keep T004/T005 and affected runtime/production gates open. Establish a verified local runner and doubles, then execute honest behavioral Red before corresponding implementation; retain manual-only native/provider cases explicitly. |

No blocking spec/plan/contract contradictions remain. Former binding and
unbounded-replay/35-day-deletion conflicts are resolved by explicit owner
approvals. E1 is a separate operational gate, not a missing planning decision.

## Coverage summary

| Requirement key | Has task? | Task IDs                                                  | Notes                              |
| --------------- | --------- | --------------------------------------------------------- | ---------------------------------- |
| FR-001          | Yes       | T005, T013, T020, T026, T033, T037, T043, T056            | Planned; runtime evidence separate |
| FR-002          | Yes       | T009–T011, T015, T017, T020, T022                         | Planned; runtime evidence separate |
| FR-003          | Yes       | T011, T017, T051, T053–T054                               | Planned; runtime evidence separate |
| FR-004          | Yes       | T009–T011, T015, T017, T020, T022                         | Planned; runtime evidence separate |
| FR-005          | Yes       | T007, T012, T015, T018–T020, T038–T046                    | Planned; runtime evidence separate |
| FR-006          | Yes       | T024, T037–T041, T043–T047, T052                          | Planned; runtime evidence separate |
| FR-007          | Yes       | T009, T013–T015, T020, T022                               | Planned; runtime evidence separate |
| FR-008          | Yes       | T009–T010, T013–T015, T020, T022                          | Planned; runtime evidence separate |
| FR-009          | Yes       | T009–T010, T015, T039–T040, T057                          | Planned; runtime evidence separate |
| FR-010          | Yes       | T009–T011, T013–T015, T018, T020, T037, T043              | Planned; runtime evidence separate |
| FR-011          | Yes       | T005, T012–T014, T020, T024–T026, T031, T040, T046        | Planned; runtime evidence separate |
| FR-012          | Yes       | T009, T011–T015, T018, T020, T022                         | Planned; runtime evidence separate |
| FR-013          | Yes       | T009–T011, T013–T015, T018, T020, T022, T040              | Planned; runtime evidence separate |
| FR-014          | Yes       | T041–T042, T046–T050                                      | Planned; runtime evidence separate |
| FR-015          | Yes       | T037, T039–T040, T043, T045–T048                          | Planned; runtime evidence separate |
| FR-016          | Yes       | T002, T041, T047, T049, T052                              | Planned; runtime evidence separate |
| FR-017          | Yes       | T002, T009, T015, T039–T042, T045–T050                    | Planned; runtime evidence separate |
| FR-018          | Yes       | T002, T027, T035, T041, T047, T049–T050, T056             | Planned; runtime evidence separate |
| FR-019          | Yes       | T039–T040, T042, T045–T046, T048, T057                    | Planned; runtime evidence separate |
| FR-020          | Yes       | T003, T007, T011, T017, T051–T054                         | Planned; runtime evidence separate |
| FR-021          | Yes       | T013, T017–T020, T051, T053–T054                          | Planned; runtime evidence separate |
| FR-022          | Yes       | T003, T051–T054                                           | Planned; runtime evidence separate |
| FR-023          | Yes       | T003, T017, T041, T047, T051–T055                         | Planned; runtime evidence separate |
| FR-024          | Yes       | T005, T013, T020, T037, T043, T056                        | Planned; runtime evidence separate |
| FR-025          | Yes       | T011, T017, T051–T054                                     | Planned; runtime evidence separate |
| FR-026          | Yes       | T007, T011–T014, T017–T020, T038–T040, T044–T046          | Planned; runtime evidence separate |
| FR-027          | Yes       | T006, T009, T012–T015, T021–T023, T037–T038, T056         | Planned; runtime evidence separate |
| FR-028          | Yes       | T002, T027, T030, T034–T035, T047, T049–T050              | Planned; runtime evidence separate |
| FR-029          | Yes       | T024–T025, T028–T033                                      | Planned; runtime evidence separate |
| FR-030          | Yes       | T026, T028–T029, T033, T057                               | Planned; runtime evidence separate |
| FR-031          | Yes       | T005, T013, T020, T030–T031, T037, T040–T050              | Planned; runtime evidence separate |
| FR-032          | Yes       | T024–T025, T028, T030, T032–T033                          | Planned; runtime evidence separate |
| FR-033          | Yes       | T024–T025, T028–T033                                      | Planned; runtime evidence separate |
| FR-034          | Yes       | T024, T028, T030–T033, T040–T042, T046–T050               | Planned; runtime evidence separate |
| FR-035          | Yes       | T002, T027, T030, T034–T035, T041, T047, T049–T050        | Planned; runtime evidence separate |
| FR-036          | Yes       | T024, T026–T033, T040, T046, T055                         | Planned; runtime evidence separate |
| SC-001          | Yes       | T009, T013–T015, T020, T022                               | Planned; runtime evidence separate |
| SC-002          | Yes       | T009–T010, T013–T015, T020, T022                          | Planned; runtime evidence separate |
| SC-003          | Yes       | T009, T011–T014, T018, T020, T022                         | Planned; runtime evidence separate |
| SC-004          | Yes       | T009–T011, T013–T015, T018, T020, T022, T037, T043        | Planned; runtime evidence separate |
| SC-005          | Yes       | T010, T015, T022–T023, T057                               | Planned; runtime evidence separate |
| SC-006          | Yes       | T037–T040, T043–T048, T057                                | Planned; runtime evidence separate |
| SC-007          | Yes       | T041, T047–T050, T056                                     | Planned; runtime evidence separate |
| SC-008          | Yes       | T005, T013, T020, T026, T033, T037, T043, T048, T056–T057 | Planned; runtime evidence separate |
| SC-009          | Yes       | T051–T054                                                 | Planned; runtime evidence separate |
| SC-010          | Yes       | T011, T017, T051–T054                                     | Planned; runtime evidence separate |
| SC-011          | Yes       | T006, T009, T012–T015, T021–T023, T037–T038, T056         | Planned; runtime evidence separate |
| SC-012          | Yes       | T024–T025, T028, T030, T032–T033                          | Planned; runtime evidence separate |
| SC-013          | Yes       | T024–T026, T028–T033, T040, T046, T048                    | Planned; runtime evidence separate |
| SC-014          | Yes       | T002, T030, T034–T035, T047, T049–T050, T058              | Planned; runtime evidence separate |
| SC-015          | Yes       | T024, T028, T030–T033, T040–T042, T046–T050, T057         | Planned; runtime evidence separate |

Constitution alignment issues: none. Server-only operational metadata remains
outside Watermelon and financial sync; Manual remains local-first. Business
rules are documented, external shapes use runtime validation, scopes/locks
preserve ownership and concurrency, migrations stay local-first, and
binding/rendered/accessibility/TDD gates remain distinct.

Unmapped requirements: none. Unmapped tasks: none after semantic mapping. Setup,
interface-freeze, documentation and final-review tasks map to cross-cutting
constitutional/verification requirements; remaining tasks map to US0–US3 and the
table above. Planned coverage is not executed coverage.

## Metrics

- Requirements: 51 (36 FR + 15 buildable SC).
- Tasks: 59; T001–T059 preserved.
- Requirement coverage: 100%.
- Ambiguities: 0 unresolved product/contract ambiguities.
- Duplications: 0 actionable contradictions/duplicate definitions.
- Critical issues: 0; high issues: 0; medium execution-evidence gaps: 1.
- YAML contracts: all three parse; all five external/local references resolve.
- Mockup binding verifiers: both exit 0 at the exact approved combined
  revisions; image and Binding Facts bytes unchanged.

## Decision checks

- POST availability; authenticated consent; timezone length 1–128 plus IANA
  validation.
- Required policyVersion; optional/empty callerLocalDate retains existing
  UTC-date parsing fallback, never quota fallback.
- Endpoint-specific canonical contracts; compatibility index only references
  them.
- Launch numeric metered policy; null-triplet future compatibility only through
  controlled entitlement doubles.
- Availability snapshot daily/burst reason is distinct from parse replay reason;
  refresh belongs to unified route lifecycle.
- 35 elapsed days from immutable server-created identity; eligible whole
  terminal row deletion under admission/start lock; active work/current
  accounting preserved; post-deletion key evaluated as new through all current
  gates. SQL cutoff, cleanup-race and HTTP readmission tests are specified
  within existing tasks.
- Next migration candidate 082, recheck before writing.

## Next actions

Planning reconciliation/analyze T003 may close. Complete T001 remaining intake
and T004/T005 runtime readiness before the implementation wave; run
/speckit.implement only with accepted behavioral Red and appropriate runner
gates. This review does not authorize implementation, worker dispatch, hosted
changes, commits or pushes. Preserve Normal ChatGPT → OpenCode → Antigravity →
justified native fallback when implementation is authorized.

## Analyzed input fingerprints

The following SHA-256 values capture inputs before the post-analysis
task/evidence status update. Subsequent ledger-only changes do not change
behavioral requirements.

| Input                                        | SHA-256                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| spec.md                                      | b1205b366778bf8885c9edc718d2ec418fc80bc6c4894e313166cba7771d21d0 |
| plan.md                                      | 843ba8bd4dd3a2af3ceb63a87659d70fb0404a9db5a28ee84e46ef044f7f9df8 |
| tasks.md                                     | 4beeb1942a1cdc43c1bd96acc5b365a6cd141ef139763d3dee8c54a46b0bc526 |
| data-model.md                                | 7dadffce3a34069f11e397d101a1b0f118e6630d6214643c4072801b3bdc9543 |
| research.md                                  | e0ac8f96268d699d7be35f75fda73548ccd92f236af77b46867bcbb1aca197b9 |
| quickstart.md                                | 655474567fe87a1c1ac6d6b9f2241d37d2ca8e6d86b665c73f4576e1e45f0402 |
| reconciliation.md                            | c542b48663d87b785e2e7c63eb224e6238e6c27d723b7add3262db1c761eeecc |
| contracts/add-transaction-ui-contract.md     | 515e25791e632c25f83938aaf541f072083570386c9a626c9809ceeefbc6e3db |
| contracts/parse-voice-quota.openapi.yaml     | 52866dcd4db7e6b1514fa809b2e31b56a9f02b2a00a3a104c4b605e5eaf31688 |
| contracts/voice-ai-availability.openapi.yaml | b0f1e37e93b7f0f3b816154ee5dfc05ae8cf499a153584b61eb4f419f663ecb5 |
| contracts/voice-ai.openapi.yaml              | 099dfbba6aefbcb4abb0cf9805a259462132f69d07b117042fcb7844c60351b1 |
