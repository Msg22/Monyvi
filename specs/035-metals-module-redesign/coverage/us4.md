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

## Green checkpoint — 2026-09-01

- `metals-edit.test.tsx`: 5/5 Green for shared order, locked Metal, direct Save, metadata/material state, physical-form-only copy, terminal immutability, RTL/reflow, pending lock, focus, and bottom inset.
- `edit-metal-holding-preview-service.test.ts`: 4/4 Green for metadata separation, affected-only material comparison, restored deltas, physical-form-only consequences, and terminal policy.
- `edit-metal-holding-command-service.integration.test.ts`: 5/5 Green against SQLite for atomic projections/evidence/History/revision, predecessor deactivation, metadata LWW, required reason, replay/hash mismatch, and terminal immutability.
- Add regression plus metals i18n contract: 13/13 Green. Combined focused gate: 5 suites, 27 tests.
- Mobile TypeScript and changed-file ESLint with project rules: Green. Full mobile lint reaches one unrelated pre-existing unused import in `metal-financial-action-foundation.integration.test.ts`; no US4 lint finding remains.
- Maestro/native device execution remains pending under the active physical-device QA lock. T092 stays open; no native, visual, timing, or assistive-technology result is claimed.
