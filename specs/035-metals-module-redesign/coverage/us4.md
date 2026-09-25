# US4 Coverage Matrix

Status (2026-09-23): Edit service, form, facade, and isolated route are
implemented. Combined Slice 7 Jest run passed 11 suites / 53 tests; mobile
typecheck, focused lint, and i18n parity passed. `edit-holding.yaml` is authored
but has not run. Device/manual QA remains pending; T092 stays unchecked.

| Manual scenario | Unit/integration | UI | Maestro | Manual-only gap |
| --- | --- | --- | --- | --- |
| US4-M01 | edit command metadata LWW | metals-edit metadata state | edit-holding metadata | Maestro/device pending |
| US4-M02 | atomic correction/evidence/History | cues/reason/summary | edit-holding material | CAS/rollback/restart and server reconciliation proof pending |
| US4-M03 | preview command | metals-edit physical summary | edit-holding reverted delta | visual copy/native render |
| US4-M04 | preview command | metals-edit reverted state | edit-holding reverted delta | Maestro/device pending |
| US4-M05 | terminal immutability | metals-edit terminal state | deferred fixture | terminal native route |
| US4-M06 | rollback/restart | focus/pending/dirty exit | offline profile | device accessibility/network |
| US4-M07 | CAS/replay/restart | n/a | deferred deterministic conflict fixture | multi-device sync |
| US4-M08 | n/a | RTL/theme/compact/200%/safe-area | deferred profile | native assistive tech/layout matrix |

## Deterministic checkpoint

- `metals-edit.test.tsx`: 18/18 on 2026-09-25 for shared order, locked Metal, direct Save, metadata/material state, physical-form-only copy, terminal immutability, RTL/reflow, pending lock, focus, and bottom inset.
- `edit-metal-holding-preview-service.test.ts`: 4/4 for metadata separation, affected-only material comparison, restored deltas, physical-form-only consequences, and terminal policy.
- The Edit SQLite command suite is 11/11 on 2026-09-25 against the real WatermelonDB test schema, including metadata LWW, mixed correction clocks, legacy metadata, replay, and terminal policy.
- Facade SQLite tests are 7/7 for replay hashes, pending roots, selected-rate evidence, and stale-rate acknowledgment/replay.
- Add/Edit UI regression: Preview, validation, rate provenance, and EN/AR resource contracts aligned with canonical selected snapshot.
- T085/T086 remain unchecked: the named preview-command test file is absent and the Edit SQLite suite still needs explicit whole-fact CAS, rollback, and restart cases. T089 lacks complete Red evidence for T085. Maestro and native QA have not run.
