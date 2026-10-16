# US8 Undo manual test plan

Source: US8, FR-023, FR-024, FR-039–FR-045, FR-047, FR-061–FR-071,
FR-076–FR-082, FR-087, FR-091, FR-092, FR-094, FR-097, FR-098, SC-002, SC-003,
SC-007, SC-010, SC-011, SC-013, SC-015, SC-023, SC-024, and SC-027–SC-030.

Preconditions: use an authenticated current-user profile with one uncredited
Sold holding and one Disposed holding whose current terminal events and action
roots are complete, effective, and linked. Run offline English/light and
Arabic/dark profiles where listed. Never use another user's local rows as
fixtures. Account-credit Undo scenarios U17–U19 stay blocked until the complete
issue #242 gate in T033 is merged and verified.

| ID  | Scenario                                                                                                                                                          | Expected evidence                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U01 | Open Restore from a current uncredited Sold holding                                                                                                               | Undo is the primary recovery action; the focused consequential sheet identifies the same holding and current Sale. Edit remains secondary and Delete is absent.                                                                                   |
| U02 | Review the uncredited Sale consequences                                                                                                                           | The sheet says the same holding becomes Active, the Sale remains permanent History marked reversed, and its effective sale result is removed. No account, balance, proceeds-credit, ordinary-income, or replacement-terminal consequence appears. |
| U03 | Open Restore from a current Disposed holding                                                                                                                      | The sheet identifies the current Dispose, says the same holding becomes Active, preserves the Dispose as reversed History, and removes its effective disposal treatment. No Sale P/L or account consequence appears.                              |
| U04 | Attempt confirmation before acknowledging the consequences                                                                                                        | Restore remains unavailable, focus stays within the confirmation, background actions are isolated, and no local row changes.                                                                                                                      |
| U05 | Cancel before submission, then reopen                                                                                                                             | The sheet dismisses safely and restores focus to its trigger; no action, evidence, event, state, account, income, or reporting effect is written.                                                                                                 |
| U06 | Confirm an eligible Sale or Dispose while offline                                                                                                                 | One atomic local Undo root, evidence row, reversal event, and Active state projection commit. The reversal predecessor and `reversesEventId` both equal the current terminal event; its holding and action links remain exact.                    |
| U07 | Inspect History immediately after U06                                                                                                                             | The original Sale or Dispose is unchanged and permanent, visibly marked reversed; one later immutable reversal is present; tied timestamps order the causal reversal first.                                                                       |
| U08 | Inspect current results after U06                                                                                                                                 | The same holding contributes as Active again. Sale results or disposal treatment are no longer effective, and no account/balance/income effect or historical daily-snapshot rewrite exists.                                                       |
| U09 | Tap Restore repeatedly while pending or try back, gesture dismiss, Cancel, and acknowledgment changes                                                             | Visible progress is announced; all dismissal and repeat paths are locked; exactly one command with stable IDs reaches persistence.                                                                                                                |
| U10 | Force the local batch to fail, remove the fault, and retry                                                                                                        | No partial root/evidence/event/state change remains. Reviewed facts stay visible, recovery is announced in plain language, retry reuses the same IDs and commits once.                                                                            |
| U11 | Replay the completed action, then reuse its action ID with changed input                                                                                          | Identical ID/hash replay returns the same outcome without a second reversal; changed-hash reuse fails closed with no mutation.                                                                                                                    |
| U12 | Restart offline after successful Restore                                                                                                                          | Active state, original reversed terminal event, and one reversal survive restart without network access; a repeat delivery still creates nothing new.                                                                                             |
| U13 | Attempt from Active, missing holding/event/action evidence, Delete, stale/non-current terminal, mismatched links/kind/action, credited Sale, or foreign-user data | Every attempt rejects before mutation and reveals no foreign data. Delete is never Undo; credited Sale remains unavailable until #242.                                                                                                            |
| U14 | Record a later correct Sale or Dispose after the restored Active state is visibly shown                                                                           | The new terminal event is a distinct later action. It can be restored once in a later explicit action; no automatic or atomic replacement hides the intermediate Active state.                                                                    |
| U15 | Compact phone, ordinary phone, tablet/orientation, 200% text, RTL, light/dark, keyboard/switch/screen reader, gesture and 3-button navigation                     | Consequences remain reachable in logical order, text meaning and action priority survive reflow/theme/direction, controls are at least 48×48, focus is contained, and bottom actions include the safe-area inset exactly once.                    |
| U16 | Trigger an auth identity change while the sheet is open                                                                                                           | The stale action cancels or rejects without writing for either identity; the next current-user view is recomputed from scoped local data.                                                                                                         |
| U17 | Credited Sale: exact linked-account inverse                                                                                                                       | **Blocked by T033/T128–T130.** When enabled, one complete Undo must debit exactly the original credited minor units through the original generic account-effect linkage and restore the holding in the same atomic action.                        |
| U18 | Credited Sale: unavailable/foreign account, stale CAS, local failure, retry, replay, restart                                                                      | **Blocked by T033/T128–T130.** Unsafe reversal leaves both holding and balance unchanged, explains recovery, and produces exactly one inverse after safe retry.                                                                                   |
| U19 | Credited Sale: reconciliation and analytics                                                                                                                       | **Blocked by T033/T128–T130.** Losing/incomplete groups remain ineffective; successful inverse changes no ordinary income, budget income, or earned cashflow and never double-counts net worth.                                                   |

## Coverage mapping and current limits

Tests were authored before the corresponding corrections. No tests, lint, types,
format, builds or device gates were executed in this worker lane; Mohamed
reserved all execution for the lead's final pre-push batch. Red/Green and
runtime results are unverified. Approved Restore binding:
`design/mockups/nile-current-v1-flow/18-undo-consequence-confirmation.binding.md`.
Rendered ordinary/compact/tablet/landscape/dark/RTL/200%-text comparisons remain
pending. Details now opens the real Restore confirmation, with localized
English/Arabic copy, current scoped token and existing holding artwork.

| Scenarios | Authored deterministic coverage                                                                                                                                                                                                                                          | E2E / manual boundary                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U01–U05   | `metals-restore.test.tsx`: sold/disposed copy, required review, retry retention, identity reset; `metals-detail-restore.test.tsx`: real Details composition, cancel, failure/retry, user change                                                                          | `restore-holding.yaml` authored cancel/reopen journey; blocked by terminal fixture. Focus restoration/native navigation require manual/device proof.     |
| U06–U08   | Command integration: uncredited Sale/Dispose commit; baseline read-model and reducer: first Undo active projection, immutable timeline, repeated cycles                                                                                                                  | Maestro journey authored; offline control missing. Current value, result treatment, snapshots and income analytics need integration review/device proof. |
| U09–U10   | Hook: concurrent taps, stable retry IDs; sheet: pending lock; command integration: failed batch rollback and identical retry                                                                                                                                             | Native pending announcements/dismissal and injected local failure require manual/device harness.                                                         |
| U11–U12   | Integration: identical replay, changed hash rejection, cold database restart, unsuccessful replay rejection; reducer: shuffled restart order                                                                                                                             | Maestro restart authored, blocked by seed. Actual interruption during commit remains manual-only without interruption harness.                           |
| U13       | Integration: stale revision, refs, credited Sale, auth scope, missing/foreign asset/event/root/evidence, Delete/Active/hidden/incomplete state, wrong kind/action/revision, malformed guards, rejected terminal root; reducer/read-model: rejected/foreign root excluded | Authored matrix remains unexecuted until final gate. Credited effects stay disabled.                                                                     |
| U14       | Reducer/read-model: D1/U1/D2/U2 preserves original owned legacy root, latest Active projection and full timeline; route test: success remains in existing Details and header Back dismisses to My Metals                                                                 | Real second terminal journey needs a seeded material/rate fixture; Android Back and header Back still need device proof.                                 |
| U15       | Sheet: ordinary row, compact/font-scale reflow, bottom inset                                                                                                                                                                                                             | Rendered theme/RTL/accessibility/navigation-bar variants remain manual/device-only; no fidelity claim.                                                   |
| U16       | Hook: user/holding/terminal/revision changes and stale completion suppression; command: auth reassertion before batch                                                                                                                                                    | Real auth switch while modal open remains manual-only without controlled auth runner.                                                                    |
| U17–U19   | Credited Sale rejection guard only                                                                                                                                                                                                                                       | Blocked by issue #242; no account inverse implemented or claimed.                                                                                        |

Additional correction cases: change holding/user while prior Undo is pending;
return to Active before retry; dispose again and Restore at a new revision;
reject/corrupt original legacy root; reject descendant Undo; inject competing
successors. Old completion must not close or report success for the new target;
each later cycle must preserve original History.

## Implemented integration contract

- Existing registry already returns primary `undo` for retained terminal states
  (`actions.undo_sale` / `actions.undo_disposal`), and omits it while financial
  actions are locked. Details `onAction("undo")` now opens the actual native
  Modal confirmation only after scoped complete evidence is read; credited Sale
  remains hidden/blocked until #242.
- Instantiate `createUndoMetalHoldingProductionService(database)` inside the
  owning facade/container; invoke it through `useUndoMetalHolding`. Supply the
  scoped holding/user, current terminal event and financial revision, UUID IDs
  and occurred-at source. Both event references target that terminal.
- Presentational sheet takes localized copy (`title`, `back`,
  `consequencesHeading`, `reviewLabel`, `confirmLabel`, `pendingLabel`,
  `cancelLabel`, `retryLabel`), shaped summary, bottom inset, width/font scale,
  RTL, pending/error and callbacks. `holdingVisual` receives the existing
  `MetalHoldingRender`; integration must supply it to satisfy the approved
  identity image. `attemptIdentity` must include holding/user/terminal/revision
  so a later cycle requires fresh acknowledgment.
- Connect confirm/retry to hook submit/retry, pending to isSubmitting, and map
  internal error codes into friendly localized recovery copy. Cancel/Back before
  submit writes nothing. Await true only for the same current attempt;
  stale/unmounted completion returns false. On success use existing toast and
  reveal refreshed existing Details. No new route is pushed. After Restore,
  header and Android Back dismiss to My Metals. Actual focus restoration, native
  navigation and rendered copy still require device validation.
- Summary consequences: `active`, `sale-result` for uncredited Sale or
  `disposal-treatment` for Dispose, then `history`. No account debit, device
  footer or ordinary-income consequence. Dispose terminal copy uses approved No
  longer owned / لم يعد لدي terminology.
- Public UI selectors: `restore-holding-modal`, `restore-holding-content`,
  `restore-holding-summary`, `restore-consequence-card`,
  `restore-consequence-{active,sale-result,disposal-treatment,history}`,
  `restore-holding-reviewed`, `restore-holding-confirm`,
  `restore-holding-cancel`, `restore-holding-retry`, `restore-holding-status`.
- New tests expect one stable concurrent promise, same IDs on same-attempt
  retry, new IDs after holding/user/terminal/revision change, no stale error or
  completion after target switch/unmount, and no resurrected completion on user
  A/B/A. UI expects review reset, explicit Retry, 48-pixel controls, bottom
  inset, ordinary row and compact/enlarged reflow.

Context reads share the command's owned asset/state/event/root/evidence and
account-guard validation. `useUndoMetalHoldingContext.test.ts` covers auth
resolution, current-user/terminal changes, failed read/retry and stale response
suppression. `useRestoreMetalHolding` creates the production service and stable
UUID command only through the existing submission facade. The confirmation
captures its selected current context: a successful local Active subscription
must not invalidate its own completion; changing user or holding unmounts it.
Revision conflict retry closes stale confirmation and reloads the current
context so the user reviews fresh facts before another attempt. Operational
retry retains reviewed facts and command IDs.
