# #391 Structured Speckit Cross-Artifact Analysis — Updated Retirement Review

**Date:** 2026-10-12<br> **Scope:** Updated `spec.md`, `plan.md`, `tasks.md`,
`contracts/audio-validation-contract.md` and `checklists/manual-plan.md` in
`specs/391-voice-empty-audio-guard/`.<br> **Status:** US1 cleanup slice EXECUTED
(RED → GREEN); server detector design explicitly ABANDONED and SUPERSEDED; 10
prototype and research files deleted; conservative on-device metering approved
as cost optimization (threshold -70.0 dBFS, exact deterministic coverage
constants, fail-open sentinels <= -160.0 dBFS, Android normal
mediaServicesDidReset omission; implementation and deterministic checks
COMPLETE); Gemini 2.5 Flash Lite cache-hit telemetry IMPLEMENTED with
typechecked tests (T033–T036); server contracts preserved unchanged; server
duration follow-up out of scope and not addressed. Root formal cross-artifact
analysis **ACCEPTED** on 2026-10-12 (0 critical, 0 high, 0 medium, 1 LOW finding
I1 addressed, 100% mapping; evidenced by publicly committed
`checklists/analysis.md` and dated formal root analysis result; internal `.tmp`
coordination artifacts excluded from git tree).

## Structured Inventories and Coverage

| Inventory                  |                   Count | Cross-check                                                                                                 |
| -------------------------- | ----------------------: | ----------------------------------------------------------------------------------------------------------- |
| User stories               |                   **3** | US1 cleanup EXECUTED; US2 detector RETIRED, metering IMPLEMENTED; US3 integration/cache COMPLETE            |
| Functional requirements    |  **21** (FR-001–FR-021) | Sequential unique IDs preserved; server detector superseded; client metering & cache defined                |
| Nonfunctional requirements | **6** (NFR-001–NFR-006) | Cost optimization, false-negative safety, privacy, compatibility, cancellation, evidence                    |
| Success criteria           |  **10** (SC-001–SC-010) | Deterministic criteria verified; SC-004 physical calibration NOT RUN; native/live/DB boundaries explicit    |
| Tasks                      |      **36** (T001–T036) | T001–T010 executed, T011–T018 retired, T019–T023 metering, T024–T027 UX, T033–T036 cache, T028–T032 root    |
| Manual/owner cases         |     **19** (M391-01–19) | Track A cleanup NOT RUN (owner-only); Track B updated to client metering (NOT RUN); server detector RETIRED |
| Research spike files       |         **0 remaining** | 10 prototype and legacy research files DELETED                                                              |

### Requirement-to-Task Traceability

| Requirement IDs                                                      | Explicit task coverage           | Status / Disposition                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001–FR-003 (SDK55 cleanup, idempotence, native/generation safety) | T004–T010; T028–T031             | **EXECUTED**: RED accepted (`392a26f7…`), import-only legacy (`84696d74…`), focused GREEN PASS                                                                                                                                     |
| FR-004 (Server MIME sniffing & structural checks)                    | T035                             | **PRESERVED / DETERMINISTIC PASS**: Actual-handler MIME and zero-byte regression tests passed; live requests NOT RUN                                                                                                               |
| FR-005–FR-006 (Conservative on-device metering)                      | T019–T023                        | **IMPLEMENTED / DETERMINISTIC PASS**: Exact threshold/coverage constants, sentinel poison, Android status normalization; physical calibration NOT RUN                                                                              |
| FR-007–FR-010 (Server bypass & unchanged accounting)                 | T017–T018, T022–T023, T025, T035 | **IMPLEMENTED / DETERMINISTIC PASS**: Local reject invokes zero parser calls; actual-handler auth/consent/quota regression tests pass with mocked provider/RPC boundaries                                                          |
| FR-011–FR-012 (35-day replay, request-key identity)                  | T035                             | **PRESERVED / MOCKED REGRESSION PASS**: Source contracts unchanged; handler/RPC tests verify shape/error mappings, not actual PostgreSQL retention/concurrency; DB/live-provider integration NOT RUN                               |
| FR-013–FR-014 (30s local active cap; mobile <1500ms guard)           | T022, T023                       | **PRESERVED / DETERMINISTIC PASS**: Recorder cap, snapshot freeze, pause and existing minimum-duration regressions pass                                                                                                            |
| FR-015 (Approved copy & UX)                                          | T024–T025                        | **IMPLEMENTED / DETERMINISTIC PASS**: Approved EN/AR copy in existing error region; fresh retry and Manual mode availability tested; physical journey NOT RUN                                                                      |
| FR-016 (Current provider & quota compatibility)                      | T035                             | **PRESERVED / DETERMINISTIC PASS**: Actual-handler parsing, four-attempt retries and quota envelopes tested; live Gemini NOT RUN                                                                                                   |
| FR-017 (Server feasibility benchmarking)                             | T011–T016                        | **SUPERSEDED & RETIRED**: Prototype files deleted; benchmarks superseded                                                                                                                                                           |
| FR-018 (Privacy & data minimization)                                 | T026, T033–T036                  | **PRESERVED**: No raw audio, PCM, or metering logs persisted; sanitized Gemini cache telemetry only                                                                                                                                |
| FR-019 (TDD discipline)                                              | T005–T009, T019–T023             | Cleanup historical RED→GREEN EXECUTED; new tests authored first and final GREEN verified; T021 pre-implementation RED NOT RUN under user exception                                                                                 |
| FR-020 (Isolation & no unauthorized mutation)                        | T001–T004, T028–T032             | **BOUNDED**: Authorized mobile metering + server telemetry source/tests/docs only; no hosted deploy/db migrations/emulator                                                                                                         |
| FR-021 (Gemini cache-hit telemetry)                                  | T033–T036                        | **IMPLEMENTED / DETERMINISTIC PASS**: Non-throwing returned-attempt telemetry, safe nullable counts and valid pairs; coverage denominator = observed structured events; sink drops remain unknowable; live log measurement NOT RUN |

## Severity & Findings Disposition

- **Historical B1/B2/C1 findings (Server speech gates)**: SUPERSEDED & RETIRED.
  Server detector abandoned and existing server contracts preserved unchanged.
- **Cleanup Gates (G391-C1/C2)**: ATTAINED / EXECUTED (72 tests / 3 suites
  PASS).
- **Client Metering Implementation Gates**: IMPLEMENTED / deterministic PASS;
  T021 pre-implementation RED remains NOT RUN under user exception; acoustic
  calibration and owner physical verification remain NOT RUN release gates.
- **Cache-Hit Telemetry Gates**: T033–T036 COMPLETE; non-throwing, privacy-safe,
  actual-handler and telemetry Deno tests typechecked PASS; live provider/log
  measurement NOT RUN.
- **Analysis Review Gate (T003)**: Formal cross-artifact analysis accepted by
  root on 2026-10-12 (0 critical, 0 high, 0 medium, 1 LOW finding I1 in plan.md
  architecture-summary row addressed, 100% mapping; evidenced by publicly
  committed `checklists/analysis.md` and dated formal root analysis result;
  internal `.tmp` coordination artifacts excluded from git tree). Prerequisite
  and 100% inventory mapping verified.

## Gate Ledger / Updated Summary

| Gate   | Scope                             | Status                                                                                 |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------- |
| G391-P | Specification & Architecture Plan | **ACCEPTED**: Root analysis accepted (0/0/0/1 LOW addressed; evidenced by public docs) |
| G391-C | SDK55 Cleanup TDD & Regressions   | **EXECUTED**: Tests green (392a26f7… → 84696d74… → 72/3 PASS)                          |
| G391-S | Server Speech Detector & WASM     | **SUPERSEDED & RETIRED**: Spikes deleted; server contracts unchanged                   |
| G391-M | Conservative On-Device Metering   | **IMPLEMENTED / deterministic PASS**; acoustic calibration and physical gate NOT RUN   |
| G391-T | Gemini Cache-Hit Telemetry        | **IMPLEMENTED / typechecked deterministic PASS**; live observation NOT RUN             |
| G391-F | Owner Native Device Verification  | **NOT RUN / PENDING**: Physical device verification for owner                          |

## Final Deterministic Verification — 2026-10-12

Root final evidence completed at **14:08:09 UTC**: **230 tests / 11 suites
PASS** (mobile 159/8; logic 35/1; typechecked Deno 36/2: actual handler 21 +
telemetry 15). Mobile/logic TypeScript, production Deno check, lint autofix,
formatting, i18n/privacy, source-ID/link/file-budget audit, and diff checks
PASS. The first combined batch identified lint/dependency, test typing, and
file-budget failures; bounded failed/affected reruns passed after minimal
technical fixes. Independent final repair review PASS. These results do not
establish physical audio calibration, live Gemini behavior, real PostgreSQL
retention/concurrency, emulator coverage, or publication. T021 RED, T031
physical verification, and T032 publication remain unchecked.
