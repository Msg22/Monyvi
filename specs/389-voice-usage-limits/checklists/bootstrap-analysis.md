# Specification Analysis Report — bootstrap refinement

Read-only semantic analysis refreshed 7 October 2026 at 15:30 UTC, before
production release. The report is saved afterward as a coordination record.
Governing main: 2095ec061d531854603e8415122231f1cbf4c1a0. Execution base:
ac1ef5583656190d04f3d068a742d98f742085cf plus reviewed local planning
refinement. Prerequisite check exited 0 using exact Git Bash and both 389
feature overrides. Optional before_analyze/after_analyze Git commit hooks
inspected, not executed.

| ID  | Category           | Severity | Location                                                                                              | Finding                                                                                                                                                                                                | Next action                                                                                                |
| --- | ------------------ | -------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| E1  | Execution evidence | MEDIUM   | tasks.md T005/T006–T014/T024–T028; runtime-readiness.md; mobile-initial-red.md; server-initial-red.md | Feasibility is documented and initial exclusions/route/parser Red executed. Complete quota/RPC/race/Edge integration, corrected mobile batch, dedicated native target and visual evidence remain open. | Execute each scoped gate before its corresponding production release; retain manual-only cases explicitly. |

## Coverage summary

All 36 FR and 15 buildable SC remain covered. Intake/review/evidence tasks map
to workflow/constitution gates; there are no orphan product tasks. Task IDs and
stories US0–US3 are preserved; no task regeneration occurred.

| Requirement | Task IDs                                                  | Coverage |
| ----------- | --------------------------------------------------------- | -------- |
| FR-001      | T005, T013, T020, T026, T033, T037, T043, T056            | Covered  |
| FR-002      | T009–T011, T015, T017, T020, T022                         | Covered  |
| FR-003      | T011, T017, T051, T053–T054                               | Covered  |
| FR-004      | T009–T011, T015, T017, T020, T022                         | Covered  |
| FR-005      | T007, T012, T015, T018–T020, T038–T046                    | Covered  |
| FR-006      | T024, T037–T041, T043–T047, T052                          | Covered  |
| FR-007      | T009, T013–T015, T020, T022                               | Covered  |
| FR-008      | T009–T010, T013–T015, T020, T022                          | Covered  |
| FR-009      | T009–T010, T015, T039–T040, T057                          | Covered  |
| FR-010      | T009–T011, T013–T015, T018, T020, T037, T043              | Covered  |
| FR-011      | T005, T012–T014, T020, T024–T026, T031, T040, T046        | Covered  |
| FR-012      | T009, T011–T015, T018, T020, T022                         | Covered  |
| FR-013      | T009–T011, T013–T015, T018, T020, T022, T040              | Covered  |
| FR-014      | T041–T042, T046–T050                                      | Covered  |
| FR-015      | T037, T039–T040, T043, T045–T048                          | Covered  |
| FR-016      | T002, T041, T047, T049, T052                              | Covered  |
| FR-017      | T002, T009, T015, T039–T042, T045–T050                    | Covered  |
| FR-018      | T002, T027, T035, T041, T047, T049–T050, T056             | Covered  |
| FR-019      | T039–T040, T042, T045–T046, T048, T057                    | Covered  |
| FR-020      | T003, T007, T011, T017, T051–T054                         | Covered  |
| FR-021      | T013, T017–T020, T051, T053–T054                          | Covered  |
| FR-022      | T003, T051–T054                                           | Covered  |
| FR-023      | T003, T017, T041, T047, T051–T055                         | Covered  |
| FR-024      | T005, T013, T020, T037, T043, T056                        | Covered  |
| FR-025      | T011, T017, T051–T054                                     | Covered  |
| FR-026      | T007, T011–T014, T017–T020, T038–T040, T044–T046          | Covered  |
| FR-027      | T006, T009, T012–T015, T021–T023, T037–T038, T056         | Covered  |
| FR-028      | T002, T027, T030, T034–T035, T047, T049–T050              | Covered  |
| FR-029      | T024–T025, T028–T033                                      | Covered  |
| FR-030      | T026, T028–T029, T033, T057                               | Covered  |
| FR-031      | T005, T013, T020, T030–T031, T037, T040–T050              | Covered  |
| FR-032      | T024–T025, T028, T030, T032–T033                          | Covered  |
| FR-033      | T024–T025, T028–T033                                      | Covered  |
| FR-034      | T024, T028, T030–T033, T040–T042, T046–T050               | Covered  |
| FR-035      | T002, T027, T030, T034–T035, T041, T047, T049–T050        | Covered  |
| FR-036      | T024, T026–T033, T040, T046, T055                         | Covered  |
| SC-001      | T009, T013–T015, T020, T022                               | Covered  |
| SC-002      | T009–T010, T013–T015, T020, T022                          | Covered  |
| SC-003      | T009, T011–T014, T018, T020, T022                         | Covered  |
| SC-004      | T009–T011, T013–T015, T018, T020, T022, T037, T043        | Covered  |
| SC-005      | T010, T015, T022–T023, T057                               | Covered  |
| SC-006      | T037–T040, T043–T048, T057                                | Covered  |
| SC-007      | T041, T047–T050, T056                                     | Covered  |
| SC-008      | T005, T013, T020, T026, T033, T037, T043, T048, T056–T057 | Covered  |
| SC-009      | T051–T054                                                 | Covered  |
| SC-010      | T011, T017, T051–T054                                     | Covered  |
| SC-011      | T006, T009, T012–T015, T021–T023, T037–T038, T056         | Covered  |
| SC-012      | T024–T025, T028, T030, T032–T033                          | Covered  |
| SC-013      | T024–T026, T028–T033, T040, T046, T048                    | Covered  |
| SC-014      | T002, T030, T034–T035, T047, T049–T050, T058              | Covered  |
| SC-015      | T024, T028, T030–T033, T040–T042, T046–T050, T057         | Covered  |

## Constitution alignment and reconciliation

No constitution alignment issue or exception identified. Local-first Manual and
unchanged financial schemas, canonical generated/runtime types, service
boundaries, user scope, approved binding/i18n/accessibility and local migration
files remain required. Root db:migrate is not local-only; execution must bind
verified isolated local infrastructure and use local generation.

Three execution contradictions found during independent QA are resolved: final
plan guidance now agrees with current-HTTP-first bootstrap; initial foundation
dispatch no longer requires direct T007 before its module exists; real race
evidence requires passing single-request controls and distinct sessions.
All-deny stubs, loader/undefined-relation/function errors and serialized SDK
doubles do not establish concurrency. Already-Green race assertions are retained
without introducing artificial defects or unnecessary code changes.

Minimum callable interfaces are driven by accepted existing HTTP behavior Red,
not a blanket production release. Direct contract/single-session Red precedes
further validation/accounting/cleanup; race-specific Red precedes corresponding
race fixes. Full real PostgreSQL HTTP Red still precedes final wiring. No
intermediate production commit/deployment or hosted fixture bypass is allowed.

All external contracts are unchanged: authenticated POST availability JSON,
validated IANA context, required policyVersion, unchanged optional date
fallback, strict snapshot vs parse-replay reasons, route-owned refresh, metered
launch and controlled future null-triplet compatibility. Approved mockup bytes,
combined binding revisions and EN/AR copy remain unchanged.

## Metrics and next actions

- Requirements: 51; tasks: 59; requirement coverage: 100%.
- Ambiguity: 0; duplication: 0.
- Critical: 0; high: 0; medium: 1; unmapped product tasks: 0.
- Planning reconciliation passes. Execute local test proposals/behavioral Red;
  retain runtime/SQL/native/visual gates as unfinished. Cleanup constants are
  now reconciled: hourly at minute 17, hard maximum 500 eligible rows/run.
  T009/T010 must execute job/batch/backlog and per-user-lock safety assertions.

The fresh prerequisite check exited 0 at 15:27 UTC with the same exact Git Bash
and both feature overrides. Spec, every endpoint/UI contract and constitution
authority are unchanged. Reviewed deltas reconcile bootstrap sequence and
cleanup constants, record T001/T004 assessment completion and retain unfinished
runtime gates. All 59 task IDs remain unique and sequential; all 51 coverage
mappings above remain applicable. No constitution, duplication, coverage or
ordering conflict is introduced by these deltas. C1 is resolved, not deferred.

## Analyzed input fingerprints

- spec.md: b1205b366778bf8885c9edc718d2ec418fc80bc6c4894e313166cba7771d21d0
- plan.md: d1b6d0977803bac5e4660058bcc2db20710f5a24b7230c961bc04c2d13af1db4
- tasks.md: 00e1472082f407cf02822893ea55bcfc5f223c9850915493cf3203264c2df9f6
- data-model.md:
  916fcb84cfef077df629e272a26fbc1998e4db89d80fc47550f76326ebc1ef31
- contracts/voice-ai-availability.openapi.yaml:
  b0f1e37e93b7f0f3b816154ee5dfc05ae8cf499a153584b61eb4f419f663ecb5
- contracts/parse-voice-quota.openapi.yaml:
  52866dcd4db7e6b1514fa809b2e31b56a9f02b2a00a3a104c4b605e5eaf31688
- contracts/voice-ai.openapi.yaml:
  099dfbba6aefbcb4abb0cf9805a259462132f69d07b117042fcb7844c60351b1
- contracts/add-transaction-ui-contract.md:
  515e25791e632c25f83938aaf541f072083570386c9a626c9809ceeefbc6e3db
