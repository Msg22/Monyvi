# US6 Dispose manual test plan

Source: US6, FR-025, FR-033–FR-036, FR-039–FR-043, FR-047, FR-061–FR-080,
FR-086–FR-098, SC-002, SC-003, SC-007, SC-010, SC-011, SC-013, SC-015, SC-016,
SC-020, SC-022–SC-024, and SC-027–SC-030.

## Evidence boundary

Recorded implementation head:
`f02945993e8a67d6920cb7cd4ea2ab19547b0401`.

- Hosted Code Quality & Tests, Financial Action pgTAP, and Android Build
  Verification passed on that head. Android E2E was skipped.
- Recorded Dispose evidence is 7 focused mobile suites / 98 tests after the hook
  split; the two hook suites are 20/20. Adjacent main-contract suites are 2/39,
  logic suites are 3/109, and migration 077 pgTAP is 23/23.
- No runnable Dispose Maestro flow or physical-device result is claimed. This
  documentation update does not claim a new local verification run.

Preconditions: use an authenticated current-user profile with one Active Gold or
Silver holding, deterministic Cairo date `2026-09-05`, and the approved
`metals.dispose/v1` contract. Run light/dark and English/Arabic profiles where
listed. Never use another user's local rows as fixtures. For D14, seed a
synthetic holding with a distinct foreign owner ID directly in the isolated test
database; it is a test fixture only and never a real user's local row.

| ID  | Scenario                                                                                                       | Expected evidence                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | Open No Longer from an Active holding                                                                          | Direct form opens for the whole holding; exactly Lost or stolen, Destroyed or damaged, Given away, Donated, Other; no partial quantity, Review route, or second confirmation.                                                                         |
| D02 | Submit without a reason                                                                                        | Submission is blocked, the reason group is announced/focused, and no local action row changes.                                                                                                                                                        |
| D03 | Choose Lost or stolen                                                                                          | Treatment auto-maps to write-off; live summary shows cost-basis loss, active-ownership removal, permanent History, no sale money/account effect, and no realized sale P/L; persisted category is `lost_or_stolen`.                                    |
| D04 | Choose Destroyed or damaged                                                                                    | Same write-off contract as D03, persisted as canonical `destroyed_or_damaged`.                                                                                                                                                                        |
| D05 | Choose Given away                                                                                              | Treatment auto-maps to external transfer; live summary shows moved-out ownership, permanent History, no proceeds/account/ordinary-income effect, and no realized sale P/L.                                                                            |
| D06 | Choose Donated                                                                                                 | Same external-transfer contract as D05, persisted as canonical `donated`.                                                                                                                                                                             |
| D07 | Choose Other without a treatment                                                                               | Only Other reveals Record a loss / Record it as moved out; submit remains blocked and announced until one is chosen.                                                                                                                                  |
| D08 | Complete both Other treatments                                                                                 | Write-off persists `other_write_off`; moved-out persists `other_external_transfer`; changing away from Other hides and clears its treatment.                                                                                                          |
| D09 | Leave Notes empty, then repeat with Arabic/emoji notes                                                         | Both commit; empty input persists as `null`, Unicode remains exact, and notes never become required.                                                                                                                                                  |
| D10 | Submit once while offline                                                                                      | One atomic local action, metal evidence row, Dispose lifecycle event, terminal Disposed projection, incremented holding revision, and sync-pending state commit without network or account writes.                                                    |
| D11 | Tap Record change repeatedly while pending                                                                     | Inputs and navigation are locked; only one stable action ID is submitted; focus remains on the pending surface.                                                                                                                                       |
| D12 | Force an ambiguous operational failure after acknowledging stale/unknown rates; make a replacement rate pair available; retry | No partial terminal/evidence/history effect remains. The form keeps the originally displayed and acknowledged pair, the loader is not rerun, and retry submits the same command object, action/evidence/reference IDs, values, and captured freshness exactly once. |
| D13 | Replay the completed action, restart offline, then reopen                                                      | Replay is idempotent, changed payload reuse is rejected, Disposed status/history survive restart, and the holding is absent from active contribution.                                                                                                 |
| D14 | Attempt from Sold, Disposed, stale-revision, or foreign-user data                                              | Every attempt fails closed with no local mutation or information from the foreign row.                                                                                                                                                                |
| D15 | Compact phone, ordinary phone, tablet/orientation, 200% text, RTL, light/dark, gesture and 3-button navigation | Layout reflows at shared breakpoints, controls remain at least 44×44, logical order/selected state/errors are announced, theme is equivalent, and Record change stays above the bottom inset exactly once.                                            |
| D16 | Leave after editing but before submit                                                                          | Existing dirty-exit safety asks before discarding; pending state cannot be dismissed; no draft recovery is claimed.                                                                                                                                   |
| D17 | Inspect portfolio, detail, History, net worth, and reporting after each treatment                              | Disposed remains accessible in permanent History, no longer contributes active value/unrealized P/L/net worth, write-off/external-transfer reporting is separate, and no sale proceeds, account credit, ordinary income, or realized sale P/L exists. |
| D18 | Edit the disposal date one character at a time, then leave the form open past rate freshness expiry            | The date field keeps focus, partial dates do not request rates, submission waits for the selected date's evidence, and freshly expired rates show their new trust state without requiring a submit.                                                   |
| D19 | Enter notes longer than the UTF-8 byte limit, including Arabic and emoji                                       | Record change stays blocked; the notes field and error summary explain that the notes must be shortened.                                                                                                                                              |
| D20 | A second device changes the holding before Record change; receive a revision conflict, reload, acknowledge, and retry | The old command is discarded. The latest holding revision and terminal-rate pair are loaded and displayed, acknowledgment resets when evidence changes, and the new action commits exactly the refreshed pair currently shown. |

## Retry evidence pinning QA

### Operational retry

1. Load stale/unknown terminal metal and purchase-currency references and record
   their displayed values, source/freshness, and acknowledgment state.
2. Acknowledge the pair, submit, and inject an ambiguous operational failure
   such as local storage unavailability after the command is retained.
3. Make a different loader result available, then choose Retry.
4. Confirm the displayed pair and acknowledgment remain unchanged and the loader
   is not called again.
5. Confirm the successful retry commits the same action, evidence, event, rate
   reference IDs, values, provider timestamps, quality, and captured freshness
   that were displayed and acknowledged on the first attempt.

### Revision-conflict reload

1. Load and acknowledge one stale pair, then cause another device to advance the
   holding revision before submission.
2. Submit and confirm the revision-conflict state does not reuse the rejected
   command.
3. Retry the load. Confirm the latest holding revision and the replacement
   terminal-rate pair are displayed.
4. Confirm acknowledgment resets when the pair changes.
5. Acknowledge again and submit. Confirm the new action uses the refreshed
   revision/predecessor and commits exactly the pair currently displayed.

## Open production integration gates

Device-only fidelity for D15 and shared-shell dirty-exit integration for D16
remain required. The shared production Dispose route, terminal-rate snapshot
loader injection, translation resources, current-user fixture, runner-controlled
offline profile, and runnable Maestro journey remain open; this isolated lane
does not claim end-to-end success.

The revision-zero registry contract is satisfied: a predecessor-less
revision-zero Dispose payload is accepted only for revision `0`. Production
route/integration and device evidence are still required before release.
