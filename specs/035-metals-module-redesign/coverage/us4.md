# US4 Coverage: Edit holding and material correction

Status at implementation head
`c6a371974662ef60cd44eccd9ad53e03f1ffcf1b`: Edit service, form, facade, and
isolated route are implemented. Hosted Code Quality & Tests, Financial Action
pgTAP, and Android Build Verification passed; Android E2E was skipped.

Recorded focused counts: Edit route 18/18, Edit command 11/11, Edit preview 4/4,
facade integration 9/9, and legacy Edit 2/2. `edit-holding.yaml` is authored
but has not run. Device/manual QA remains pending; T092 stays unchecked. No new
local verification is claimed by this documentation update.

| Manual scenario | Unit/integration | UI | Maestro | Remaining gap |
| --- | --- | --- | --- | --- |
| US4-M01 metadata-only edit | Edit command metadata LWW | Edit metadata state | Authored metadata flow | Maestro/device pending |
| US4-M02 atomic material correction/evidence/History | Edit command, facade, legacy, and preview suites | Cues, purity labels, reason, summary | Authored material flow | Full server reconciliation/device proof |
| US4-M03 physical-form-only exact-fact preservation | Hook, facade, preview, and command suites | Previous/current form and unchanged valuation | Covered by authored flow | Device reopen check |
| US4-M04 restored material delta becomes metadata-only | Preview and hook suites | Reverted state | Authored reverted-delta flow | Maestro/device pending |
| US4-M05 terminal and hidden holding guards | Command, facade, and legacy suites | Terminal state plus load/retry error | Deferred fixture | Seeded native route |
| US4-M06 incomplete reconciliation and failure recovery | Command/facade guards | Recovery-before-edit, focus, pending, dirty exit | Offline profile authored | Device accessibility/network |
| US4-M07 CAS/replay/restart | Replay coverage; explicit whole-fact CAS/rollback/restart incomplete | n/a | Deterministic conflict fixture absent | Multi-device sync and restart |
| US4-M08 responsive/RTL/a11y/navigation | Active 320px RTL 200% reflow and safe-area route tests | RTL/theme/compact/200%/safe area | Authored but unrun | Native assistive tech/layout/navigation matrix |

## Deterministic checkpoint

- `metals-edit.test.tsx`: 18/18 for shared order, locked Metal, direct Save,
  metadata/material state, physical-only copy, terminal policy, recovery state,
  load/retry, purity labels, RTL/reflow, pending lock, focus, and insets.
- `edit-metal-holding-command-service.integration.test.ts`: 11/11 against the
  WatermelonDB test schema, including metadata LWW, mixed correction clocks,
  legacy metadata, replay, terminal policy, and hidden-deleted rejection.
- `metal-holding-facades.integration.test.ts`: 9/9 for replay hashes, pending
  roots, selected-rate evidence, stale-rate acknowledgment, and replay.
- `metal-holding-legacy-edit.integration.test.ts`: 2/2 for preserved legacy
  exact/null fact behavior.
- `edit-metal-holding-preview-service.test.ts`: 4/4 for metadata separation,
  affected-only comparison, restored deltas, physical-form-only consequences,
  and terminal policy.
- T085/T086 remain unchecked: explicit whole-fact CAS, rollback, and restart
  cases are still absent. T089 lacks complete Red evidence for T085. Maestro and
  native QA have not run.
