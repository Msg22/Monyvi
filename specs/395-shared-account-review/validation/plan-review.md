# Planning validation and requirement coverage

2026-10-14. Design documentation only, production implementation not started.

## Input and workflow checks

- Spec receipt matches unchanged approved spec bytes.
- B1 receipt matches exact approved manifest, each combined revision and pinned
  common contract/copy/adjustments. All23 canonical sidecars pass; images and
  Binding Facts bytes unchanged.
- Setup script selected `codex/395-shared-account-review` and this spec/plan
  path. Before/after-plan optional commits consolidated per authorized batch
  preference.
- Constitution1.7 checked before research and after design. Existing unguarded
  batch/direct balances and v1 payload limitations explicitly identified; new
  contracts address them without a waiver. No new unresolved product choice.
- Research, data model, four contracts, quickstart and agent context prepared.
  Main base current at7838df64. No tasks/analyze/implementation/worker claim.

## Coverage map for task generation

| Requirements | Design coverage                                                             | Scenario source                          |
| ------------ | --------------------------------------------------------------------------- | ---------------------------------------- |
| FR-001–003   | Evidence-first resolver, eligible defaults, source type/ownership           | M01,M02                                  |
| FR-004       | Currency provenance and explicit confirmation, no arbitrary fallback        | M03,M09,M20                              |
| FR-005–007   | Grounded same-currency identity, independent group confirmation             | M04,M06,M20                              |
| FR-008       | Disclosed direct selection, group confirmation distinct from checkbox       | M05                                      |
| FR-009       | Retained rows, tombstone/Undo generations, durable SMS removal              | M08,M15                                  |
| FR-010–012   | Row/group scope, candidate checks, existing picker and one-row regroup      | M06,M07,M09                              |
| FR-013–015   | Compact state projection, full group list, truthful filters/bulk/counts     | M10,M11                                  |
| FR-016–017   | Existing default control, zero/nonzero create intent and rollback           | M12,M18,M19                              |
| FR-018       | Complete selected action, exact effects, selected-only accounts, CAS/replay | M13,M14,M19                              |
| FR-019       | SMS v1/v2 recovery/selection/cleanup, Voice session boundary                | M14,M15,M19,M20                          |
| FR-020–021   | Original-request evidence, grounding/ref/owner checks, no extra call        | M03,M06,M16,M19,M20                      |
| FR-022–023   | B1 variants/shared fields, runtime inset, source/financial regressions      | M17,M18                                  |
| FR-024       | Main-based separate PR, immutable receipts, future tasks/analyze gates      | Workflow ledger and package verification |

Tasks must map every deterministic branch to unit/integration coverage and every
controllable complete journey to authored Maestro coverage. Provider semantics,
keyboard/audio/rendered/assistive-device observations remain separately manual.

## Check boundary

Executed outcomes: all23 canonical binding CLI checks PASS; approved spec/image/
Binding Facts/companion hashes PASS; nine plan/design artifact
title/link/template checks PASS; M01–M20 matrix and active feature selector
PASS; whitespace PASS. Mobile `npm run typecheck -w @monyvi/mobile` PASS. Its
first batched invocation hit the60-second shell limit without compiler errors;
only that check was repeated with a300-second limit after confirming no
lingering TypeScript process.

One documentation/integrity/typecheck batch before commit; actual commit hooks
and privacy push remain enabled. SQL/pgTAP/provider/mobile feature tests are
planned, not authored/executed in this step. No emulator/device runs,
seed/reset, provider call, hosted DDL or deployment. Canonical verifier failure
after any future fact/image change invalidates authority until renewed explicit
approval.

## Approval scope to carry into implementation

The plan proposes local SQL registrations for complete review batch save and
atomic default-intent creation, zero-effect handling, protected sync collection
and reconciliation. Owner approval of mockups/spec does not authorize hosted
migration/deployment. Obtain concrete implementation-scope approval before SQL
production edits. Plan-only readiness is distinct from implementation readiness.
