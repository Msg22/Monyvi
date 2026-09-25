# US7: Delete an Incorrect Active Record

Owner: Slice 8C Delete lane

Implementation head:
`8720ce7cee3872c1be4e5a910c3d846b7c0a7a9e`

Requirements: FR-037–040, FR-060–071, FR-076–080, FR-087–092, FR-102

Success criteria: SC-003–004, SC-007, SC-010–015, SC-023, SC-030

## Evidence boundary

- Hosted Code Quality & Tests, Financial Action pgTAP, and Android Build
  Verification passed on the implementation head. The hosted mobile step reports
  423 suites / 3,722 tests; the current Delete route suite contributes 15 cases.
- Android E2E was skipped. The authored Delete Maestro contract, deterministic
  offline/terminal fixtures, physical-device, live-sync, and assistive results
  remain open.
- GitHub reports seven review threads on this replacement PR, all resolved.
- This documentation update does not claim a new local verification run.

Delete is exceptional cleanup for a mistaken effective Active holding. It is not
Sell, No Longer, or Undo and must create no financial outcome.

| ID      | Preconditions and fixture                                                       | User journey                                                                   | Expected observable result                                                                                                                                                      | Automated? | Evidence                                              |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------- |
| US7-M01 | Effective Active Gold holding with creation and correction evidence             | Open Delete and confirm once                                                   | Focused Screen 14 confirmation shows exact identity, purity, weight, and value; holding leaves portfolio/detail/History                                                         | Partial    | Service/UI/route Green; Maestro fixtures blocked      |
| US7-M02 | Same holding, device offline                                                    | Confirm Delete, close app, restart, inspect portfolio and History              | Local grouped action survives restart; holding and creation/correction/Delete timeline stay absent from normal surfaces                                                         | Partial    | SQLite restart Green; offline E2E missing             |
| US7-M03 | Same holding and existing account                                               | Confirm Delete                                                                 | Account, transactions, transfers, proceeds, P/L, write-off, disposal, and sale effects stay unchanged                                                                           | Yes        | SQLite integration Green                              |
| US7-M04 | Same action identity delivered twice | Confirm, inspect the local group, replay exact command, then alter the payload under the same action ID | Root, Delete evidence, and lifecycle event use the same action ID; pending evidence has no canonical revision until acceptance; exact replay stays single and hash mismatch is rejected | Yes | SQLite integration Green |
| US7-M05 | Injected local batch failure                                                    | Confirm, observe failure, retry                                                | No partial state/evidence/history change remains; uncertain-commit retry reuses action identity and succeeds; revision-conflict retry rebuilds with fresh identity and succeeds | Yes        | SQLite/hook/route Green                               |
| US7-M06 | Foreign-owned holding ID                                                        | Attempt Delete as current user                                                 | Ownership check rejects before any local write                                                                                                                                  | Yes        | SQLite integration Green                              |
| US7-M07 | Sold or Disposed holding                                                        | Inspect actions, deep-link the Delete route, and attempt direct command        | Delete is unavailable everywhere; the route shows the undo-first gate, the command rejects with zero writes and directs recovery to Undo                                        | Partial    | Service/route Green; terminal E2E missing/blocked     |
| US7-M08 | Hidden, incomplete, or otherwise non-effective Active projection                | Attempt Delete                                                                 | Delete rejects because only an effective visible Active projection is eligible                                                                                                  | Yes        | SQLite integration Green                              |
| US7-M09 | Confirmation is pending                                                         | Double tap confirm, press Cancel/backdrop/hardware back                        | One command runs; all dismissal and competing actions stay locked until completion                                                                                              | Partial    | Hook/UI Green; device back/gesture manual-only        |
| US7-M10 | Local write fails                                                               | Read error and choose retry                                                    | Exact facts remain visible, recovery receives focus, and retry remains available                                                                                                | Partial    | Hook/UI Green; spoken focus manual-only               |
| US7-M11 | Compact/ordinary/tablet widths, light/dark, Arabic RTL, 200% text, bottom inset | Review focused confirmation                                                    | Logical order, 44px targets, responsive reflow, contrast classes, and safe bottom spacing remain intact                                                                         | Partial    | UI/source-contract Green; device fidelity manual-only |
| US7-M12 | Screen reader, keyboard, and switch control                                     | Traverse title, consequence, facts, Delete, Cancel, and recovery               | Modal background is unreachable; initial and error focus are coherent; destructive action is named `Delete holding {{holdingName}}`                                             | Partial    | UI Green; assistive-device pass manual-only           |
| US7-M13 | Effective Active holding deleted via detail → Delete                            | Confirm Delete, land on portfolio, press system back                           | Back never returns to the deleted holding detail; portfolio shows no holding and History stays clean                                                                            | Partial    | Route journey Green; device back manual-only          |
| US7-M14 | Delete submitted, then server rejects it | Sync the rejection twice, restart, inspect portfolio/detail/History and local evidence | Prior Active visibility plus predecessor effective/history flags return; the original action identity is preserved; Delete evidence remains ineffective; repeated compensation is idempotent | Partial | SQLite rejection/restart Green; multi-device QA open |
| US7-M15 | Stale metal price and unknown-age FX price contribute to displayed values       | Open Delete, inspect each rate, try confirm, acknowledge one then both inputs  | Each input has its own age/source/quality warning; Delete stays disabled until both acknowledgments are given                                                                   | Partial    | Presentation/sheet Green; device QA open              |
| US7-M16 | Active holding enters incomplete reconciliation while Delete route is open      | Attempt confirmation, then request sync recovery                               | Confirmation closes into Checking changes; Delete is unavailable and Try sync again remains reachable                                                                           | Partial    | Route journey Green; live sync QA open                |
| US7-M17 | Local Delete succeeds                                                           | Land on portfolio with screen reader enabled                                   | Holding deleted. is visibly shown and announced; back cannot return to deleted detail                                                                                           | Partial    | Route/toast contract Green; assistive QA open         |

## Review-fix QA

1. **Success feedback:** Confirm Delete with a screen reader enabled. Verify the
   localized `Holding deleted.` outcome is shown and announced before/while the
   route dismisses to My Metals; system Back must not reopen the deleted detail.
2. **Reconciliation lock:** Open Delete, transition the holding to
   `reconciliation_incomplete`, and refresh. Verify confirmation is replaced by
   `Checking changes` with `Try sync again`; no Delete command is built.
3. **Action-ID parity:** Before sync, inspect the local action root, Delete
   evidence, and lifecycle event. Their IDs/action IDs must match the same
   stable Delete action ID, and the holding state must point to that event.
4. **Pending canonical revision:** Before server acceptance, verify Delete
   evidence leaves `canonical_holding_revision` unset. After verified
   acceptance, confirm the server revision is installed.
5. **Prior timeline isolation:** On a holding with creation/correction history,
   perform local Delete and inspect dirty rows. Older lifecycle actions must not
   be rewritten or dirtied by the new Delete.
6. **Compensation:** Reject the Delete from the server, reconcile, restart, and
   reconcile the same outcome again. Confirm the prior Active event regains its
   effective/history flags, the holding is visible once, and Delete evidence
   remains ineffective without duplicate transitions.
7. **Rate warning decision:** Supply stale metal and unknown-age FX inputs.
   Verify each displayed derived-value input has its own source/age/quality
   warning and checkbox; Delete stays disabled until both are acknowledged.

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

The Delete Expo route and detail Delete action composition are live on this
branch and must not be duplicated. Remaining integration work is the
deterministic offline/terminal fixture and connectivity control needed to run
Maestro, plus physical-device visual, navigation, live-sync, and assistive QA.
Android E2E was skipped on the current hosted run; no device/E2E completion is
claimed.
