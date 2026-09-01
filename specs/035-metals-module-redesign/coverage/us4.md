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

Red gate: T086–T088 intentionally fail until T090–T091 implement Edit command, facade, route, and form mode. Green gate must execute each deterministic suite and report coverage; no Red coverage percentage is meaningful.
