# US4: Edit a holding or correct active facts

Requirements: FR-018–FR-024, FR-011–FR-015 Success criteria: SC-003, SC-005,
SC-007, SC-010, SC-011, SC-015–SC-018, SC-021, SC-023, SC-024, SC-026

## Preconditions

- Current-user Active, Sold, and Disposed Gold/Silver fixture holdings,
  including one legacy holding whose exact acquisition facts are unavailable.
- Persisted fact snapshot, catalog-v1 purity tuples, and truthful local current/
  historical-rate availability fixtures. No current rate may replace a missing
  historical reference.
- Approved reference: `08-edit-holding-correction-state.png` and the canonical
  normal-flow README; use the shared form and direct `Save changes` action.

| ID      | Fixture                                                                     | Journey                                                                                               | Expected observable result                                                                                                                                  | Automated mapping     |
| ------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| US4-M01 | Active holding                                                              | Change only name and/or notes, then Save                                                              | Ordinary direct Save; no reason, correction summary, or review route; name/notes use metadata LWW only.                                                     | T085/T086/T087/T088   |
| US4-M02 | Active holding                                                              | Change weight, purity, physical form, total paid price, currency, and date one at a time and together | Exact persisted/current cues and a summary of only affected facts/consequences; reason required; one atomic correction/history outcome.                     | T085/T086/T087/T088   |
| US4-M03 | Active holding                                                              | Make a material edit, then restore every material fact while retaining a name edit                    | Previous/current cues, summary, and reason disappear; ordinary metadata Save remains.                                                                       | T085/T087/T088        |
| US4-M04 | Active Coin with available current value/P&L                                | Change only physical form                                                                             | Summary names previous/current form, keeps current value and since-purchase P/L exact and unchanged, updates render/description, and records History.       | T085/T087/device      |
| US4-M05 | Active holding                                                              | Attempt to change Metal                                                                               | Metal remains visible/locked; guidance is Delete incorrect holding then Add correct holding; no replacement record.                                         | T085/T087/T088        |
| US4-M06 | Sold and Disposed holdings                                                  | Change name/notes, then attempt physical/acquisition/sale/disposal/reversal facts                     | Metadata-only Save stays available; every terminal financial fact is blocked and directs Undo before a new correct terminal action.                         | T085/T086/T087/device |
| US4-M07 | Legacy Active holding missing exact weight, purity tuple, and purchase cost | Edit notes; then attempt partial material repair; then supply complete exact replacement set          | Metadata stays honest and available; no zero/compatibility fallback; partial repair blocks; complete valid exact correction is one atomic material outcome. | T085/T086/T087        |
| US4-M08 | Missing/stale/unknown current or historic rate                              | Correct a financial field and inspect live summary                                                    | Saved facts remain; dependent value/P&L/rate attribution stays explicitly unavailable or stale, never invented or zero.                                     | T085/T086/T087/T088   |
| US4-M09 | Active holding with mixed metadata/material edit                            | Save offline, restart, then retry duplicate/failed local completion                                   | One durable outcome or no partial change; pending blocks duplicate/exit, facts survive recovery/restart, and later sync is pending.                         | T086/T087/T088/device |
| US4-M10 | Add/Edit route                                                              | Verify EN/AR RTL, light/dark, compact/ordinary/tablet, 200% text, keyboard, TalkBack/VoiceOver        | Shared order/reflow, current/previous cues, reason, summary, local status, and safe-area action remain reachable and understandable.                        | T087/device           |

## Manual-only evidence

US4-M04/M06/M10 require visual, native accessibility, keyboard, safe-area, and
device-matrix inspection. Record build, device/OS, locale/direction, theme, text
scale, viewport, fixture/rate state, action duration, and screenshots/video.
Automation may not claim those native conditions until its runner controls them.
