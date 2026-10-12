# #391 Structured Speckit Cross-Artifact Analysis — Updated Retirement Review

**Date:** 2026-10-12<br> **Scope:** Updated `spec.md`, `plan.md`, `tasks.md`,
`contracts/audio-validation-contract.md` and `checklists/manual-plan.md` in
`specs/391-voice-empty-audio-guard/`.<br> **Status:** US1 cleanup slice EXECUTED
(RED → GREEN); server detector design explicitly ABANDONED and SUPERSEDED; 10
prototype and research files deleted; conservative on-device metering approved
as cost optimization (PENDING future implementation); server contracts preserved
unchanged; server duration follow-up out of scope and not addressed. Review of
revised retirement artifacts remains **pending root acceptance**.

## Structured Inventories and Coverage

| Inventory                  |                   Count | Cross-check                                                                                                 |
| -------------------------- | ----------------------: | ----------------------------------------------------------------------------------------------------------- |
| User stories               |                   **3** | US1 cleanup EXECUTED; US2 server detector RETIRED, client metering PENDING; US3 integration PENDING         |
| Functional requirements    |  **20** (FR-001–FR-020) | Sequential unique IDs preserved; server detector requirements superseded; client metering defined           |
| Nonfunctional requirements | **6** (NFR-001–NFR-006) | Cost optimization, false-negative safety, privacy, compatibility, cancellation, evidence                    |
| Success criteria           |   **9** (SC-001–SC-009) | SC-001/002 cleanup ATTAINED; SC-005/006/007 ATTAINED; SC-003/004/008/009 mapped to pending metering/review  |
| Tasks                      |      **32** (T001–T032) | Sequential IDs preserved: T001–T010 executed, T011–T018 retired, T019–T032 pending (T019 depends on T020)   |
| Manual/owner cases         |     **19** (M391-01–19) | Track A cleanup NOT RUN (owner-only); Track B updated to client metering (NOT RUN); server detector RETIRED |
| Research spike files       |         **0 remaining** | 10 prototype and legacy research files DELETED                                                              |

### Requirement-to-Task Traceability

| Requirement IDs                                                      | Explicit task coverage | Status / Disposition                                                                                                    |
| -------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| FR-001–FR-003 (SDK55 cleanup, idempotence, native/generation safety) | T004–T010; T028–T031   | **EXECUTED**: RED accepted (`392a26f7…`), import-only legacy (`84696d74…`), focused GREEN PASS                          |
| FR-004 (Server MIME sniffing & structural checks)                    | Existing behavior      | **PRESERVED UNCHANGED**: Zero-byte checks and MIME detection in `parse-voice` remain intact; not a new validator        |
| FR-005–FR-006 (Conservative on-device metering)                      | T019–T023              | **SUPERSEDES server VAD**: Approved cost optimization; acknowledges amplitude overlap; validation required; PENDING     |
| FR-007–FR-010 (Server bypass & unchanged accounting)                 | T017–T018, T022–T023   | **SUPERSEDED server contracts**: Zero upload/reservation/provider charges for local reject; normal auth/sync unaffected |
| FR-011–FR-012 (35-day replay, request-key identity)                  | Existing behavior      | **PRESERVED UNCHANGED**: Server identity contracts unmodified                                                           |
| FR-013–FR-014 (30s local active cap; mobile <1500ms guard)           | Existing behavior      | **PRESERVED**: 30s local cap intact; server duration follow-up is out of scope and not addressed                        |
| FR-015 (Approved proposed copy & UX)                                 | T024–T025              | User approved proposed copy `"We couldn’t hear anything. Please try recording again."`; translation/integration PENDING |
| FR-016 (Current provider & quota compatibility)                      | Existing behavior      | **PRESERVED UNCHANGED**: Existing Gemini parsing and quota envelopes intact                                             |
| FR-017 (Server feasibility benchmarking)                             | T011–T016              | **SUPERSEDED & RETIRED**: Prototype files deleted; benchmarks superseded                                                |
| FR-018 (Privacy & data minimization)                                 | T026                   | **PRESERVED**: No raw audio, PCM, or metering logs persisted                                                            |
| FR-019 (TDD discipline)                                              | T005–T009, T019–T023   | Cleanup TDD EXECUTED; client metering calibration (T020) and TDD (T019) PENDING                                         |
| FR-020 (Isolation & no unauthorized mutation)                        | T001–T004, T028–T032   | **PRESERVED**: Documentation retirement only; no unapproved runtime edits                                               |

## Severity & Findings Disposition

- **Historical B1/B2/C1 findings (Server speech gates)**: SUPERSEDED & RETIRED.
  Server detector abandoned and existing server contracts preserved unchanged.
- **Cleanup Gates (G391-C1/C2)**: ATTAINED / EXECUTED (72 tests / 3 suites
  PASS).
- **Client Metering Implementation Gates**: PENDING future implementation under
  strict TDD and owner physical device verification.
- **Analysis Review Gate (T003)**: Historical analysis passed; current review of
  revised retirement artifacts remains **pending root acceptance**.

## Gate Ledger / Updated Summary

| Gate   | Scope                             | Status                                                                    |
| ------ | --------------------------------- | ------------------------------------------------------------------------- |
| G391-P | Specification & Architecture Plan | **UPDATED**: Server detector retired; client metering documented          |
| G391-C | SDK55 Cleanup TDD & Regressions   | **EXECUTED**: Tests green (392a26f7… → 84696d74… → 72/3 PASS)             |
| G391-S | Server Speech Detector & WASM     | **SUPERSEDED & RETIRED**: Spikes deleted; server contracts unchanged      |
| G391-M | Conservative On-Device Metering   | **PENDING**: Threshold calibration, TDD, and device verification deferred |
| G391-F | Owner Native Device Verification  | **NOT RUN / PENDING**: Physical device verification for owner             |
