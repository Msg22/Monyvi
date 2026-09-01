# US4 Coverage Fragment: Edit and correction

Status: T084 traceability complete. T085 and T087 are intentionally Red because
the preview/command services, shared form, and Edit route do not exist. T086,
T088, T089, and Green work remain open; this is not a US4 completion claim.

| Requirement                                                        | Automated proof                                                                       | Manual proof        | Status                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------- | --------------------------------- |
| FR-018 same complete active/terminal form                          | T085 direct save intent; T087 shared form/Edit-route layout and terminal limits       | US4-M01/M02/M06/M10 | Red contract; Maestro unexecuted  |
| FR-019 persisted/current, reason, reverted delta, physical summary | T085 service diff; T087 inline cues/reason/revert/summary                             | US4-M01–M04         | Red contract only                 |
| FR-020 direct atomic material save/history/pending                 | T085 direct intent; T087 direct Save/pending/dirty/focus/safe-area; planned T086/T088 | US4-M02/M09         | Command/E2E pending               |
| FR-021/022 locked Metal, Delete then Add                           | T085 locked-metal intent; T087 visible disabled Metal control                         | US4-M05             | Red contract only                 |
| FR-023/024 terminal financial immutability and Undo                | T085 Sold/Disposed blocked intent; T087 terminal metadata-only form                   | US4-M06             | Red contract only                 |
| FR-011 optional physical form; no valuation formula change         | T085 physical-only consequence; T087 shared physical form                             | US4-M04             | Red contract only                 |
| FR-013/014 correction validation and unusual acknowledgement       | Planned T086/T087                                                                     | US4-M02/M07         | Pending                           |
| FR-015 local-first/restart                                         | Planned T086; T088 profile-driven journey authored                                    | US4-M09             | Maestro unexecuted                |
| SC-003/007/015/016/023/024 atomicity, history, CAS, pending        | T087 pending UI; planned T086; T088 restart journey authored                          | US4-M02/M09         | Persistence/E2E pending           |
| SC-005/006/017/018 rate and legacy truth                           | T085 unavailable/legacy cases; planned T086/T087                                      | US4-M07/M08         | Red contract only                 |
| SC-010/011/013/029 responsive, RTL, a11y/theme                     | T087 compact/ordinary, 200%-text, RTL/theme, labels, Skeleton, safe-area              | US4-M10             | Controlled UI Red; device pending |
| SC-021/026 precision/purity                                        | Planned T086/T087                                                                     | US4-M02/M07         | Pending                           |

## Explicit exclusions

- T085 defines a pure preview and save-intent boundary only. It asserts no
  WatermelonDB model, payload, RPC, event-table, or write implementation shape.
- The pure boundary consumes already-truthful value/P&L availability; it neither
  invents rates nor attributes values without supplied trustworthy references.
- Terminal persistence/CAS, restart, synchronization, and Maestro execution
  remain T086/T088 work; T087 supplies only controlled UI Red proof.
