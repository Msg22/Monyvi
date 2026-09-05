# US4 Coverage Matrix

| Manual scenario | Unit/integration | UI | Maestro | Manual-only gap |
| --- | --- | --- | --- | --- |
| US4-M01 | edit command metadata LWW | metals-edit metadata state | edit-holding metadata | none after Green |
| US4-M02 | atomic correction/CAS/evidence/History | cues/reason/summary | edit-holding material | server reconciliation inspection |
| US4-M03 | preview command | metals-edit physical summary | edit-holding reverted delta | visual copy/native render |
| US4-M04 | preview command | metals-edit reverted state | edit-holding reverted delta | none after Green |
| US4-M05 | terminal immutability | metals-edit terminal state | deferred fixture | terminal native route |
| US4-M06 | rollback/restart | focus/pending/dirty exit | offline profile | device accessibility/network |
| US4-M07 | CAS/replay/restart | n/a | deferred deterministic conflict fixture | multi-device sync |
| US4-M08 | n/a | RTL/theme/compact/200%/safe-area | deferred profile | native assistive tech/layout matrix |

## Deterministic checkpoint — 2026-09-05

- `metals-edit.test.tsx`: 5/5 Green for shared order, locked Metal, direct Save, metadata/material state, physical-form-only copy, terminal immutability, RTL/reflow, pending lock, focus, and bottom inset.
- `edit-metal-holding-preview-service.test.ts`: 4/4 Green for metadata separation, affected-only material comparison, restored deltas, physical-form-only consequences, and terminal policy.
- The Edit SQLite command suite is 5/5 Green against the real WatermelonDB test schema after the merged foundation validation-context fix.
- Add/Edit UI regression: 12/12 Green. Preview, validation, rate provenance, and EN/AR resource contracts are Green on the Slice 7 stack.
- Full focused Add/Edit aggregate: 12 suites, 63/63 Green. Mobile TypeScript and full mobile ESLint with project rules are Green on base `be7ce054`.
- Runtime route-to-command activation still depends on unfinished Slice 4 coordinator T043. T092 remains open with Maestro/device verification pending.
- Maestro/native device execution remains pending under the active physical-device QA lock. T092 stays open; no native, visual, timing, or assistive-technology result is claimed.
