# US7: Delete an Incorrect Active Record

Owner: Slice 8C Delete lane

Date/build/base: 2026-09-05 / isolated local test build / stable Slice 7
checkpoint `a190d8f`

Requirements: FR-037–040, FR-060–071, FR-076–080, FR-087–092, FR-102

Success criteria: SC-003–004, SC-007, SC-010–015, SC-023, SC-030

Delete is exceptional cleanup for a mistaken effective Active holding. It is not
Sell, No Longer, or Undo and must create no financial outcome.

| ID      | Preconditions and fixture                                                       | User journey                                                                   | Expected observable result                                                                                                          | Automated? | Evidence                                     |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------- |
| US7-M01 | Effective Active Gold holding with creation and correction evidence             | Open Delete and confirm once                                                   | Focused Screen 14 confirmation shows exact identity, purity, weight, and value; holding leaves portfolio/detail/History             | Partial    | Service/UI Green; Maestro route blocked      |
| US7-M02 | Same holding, device offline                                                    | Confirm Delete, close app, restart, inspect portfolio and History              | Local grouped action survives restart; holding and creation/correction/Delete timeline stay absent from normal surfaces             | Partial    | SQLite restart Green; offline E2E missing    |
| US7-M03 | Same holding and existing account                                               | Confirm Delete                                                                 | Account, transactions, transfers, proceeds, P/L, write-off, disposal, and sale effects stay unchanged                               | Yes        | SQLite integration Red                       |
| US7-M04 | Same action identity delivered twice                                            | Confirm, replay exact command, then alter the payload under the same action ID | Exact replay remains one grouped action; hash mismatch is rejected                                                                  | Yes        | SQLite integration Red                       |
| US7-M05 | Injected local batch failure                                                    | Confirm, observe failure, retry                                                | No partial state/evidence/history change remains; retry reuses action identity and succeeds                                         | Yes        | SQLite/hook Red                              |
| US7-M06 | Foreign-owned holding ID                                                        | Attempt Delete as current user                                                 | Ownership check rejects before any local write                                                                                      | Yes        | SQLite integration Red                       |
| US7-M07 | Sold or Disposed holding                                                        | Inspect actions and attempt direct command                                     | Delete is unavailable; command rejects with zero writes and directs recovery to Undo                                                | Partial    | Service Green; terminal E2E missing/blocked  |
| US7-M08 | Hidden, incomplete, or otherwise non-effective Active projection                | Attempt Delete                                                                 | Delete rejects because only an effective visible Active projection is eligible                                                      | Yes        | SQLite integration Red                       |
| US7-M09 | Confirmation is pending                                                         | Double tap confirm, press Cancel/backdrop/hardware back                        | One command runs; all dismissal and competing actions stay locked until completion                                                  | Partial    | Hook/UI Red; device back/gesture manual-only |
| US7-M10 | Local write fails                                                               | Read error and choose retry                                                    | Exact facts remain visible, recovery receives focus, and retry remains available                                                    | Partial    | Hook/UI Red; spoken focus manual-only        |
| US7-M11 | Compact/ordinary/tablet widths, light/dark, Arabic RTL, 200% text, bottom inset | Review focused confirmation                                                    | Logical order, 44px targets, responsive reflow, contrast classes, and safe bottom spacing remain intact                             | Partial    | UI Red; device fidelity manual-only          |
| US7-M12 | Screen reader, keyboard, and switch control                                     | Traverse title, consequence, facts, Delete, Cancel, and recovery               | Modal background is unreachable; initial and error focus are coherent; destructive action is named `Delete holding {{holdingName}}` | Partial    | UI Red; assistive-device pass manual-only    |

## Manual-only: US7-M11-device-fidelity

Compare ordinary-phone English/light rendering with approved Screen 14, then
repeat compact, tablet/landscape, dark, Arabic/RTL, and 200% text variants. RNTL
can prove layout contracts but not typography, clipping, contrast, or pixel
fidelity. Visual QA must capture side-by-side device screenshots before T119 can
be fully complete.

## Manual-only: US7-M12-assistive-device

Complete Delete with TalkBack/VoiceOver, hardware keyboard, switch control,
hardware back, backdrop dismissal, and the pending dismissal lock. Automated
tests retain deterministic roles, names, modal isolation, and focus requests;
real speech, scan order, focus rings, and gestures remain a physical-device
gate.

## Shared-integration dependency

The isolated Delete implementation must not add a dead Expo route. Runtime and
Maestro execution resume only after the shared action adapter and registry can
create both ordinary and predecessor-less revision-zero `metals.delete/v1`
envelopes, and the integration owner supplies shared approved copy, an offline
profile/connectivity control, and deterministic Active and terminal fixtures.
