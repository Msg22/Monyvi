# Feature Specification: Resumable SMS Review Drafts

**Feature Branch**: `384-sms-review-drafts`  
**Created**: 2026-07-25  
**Status**: Approved  
**Tracking Issue**: GitHub issue #770  
**Input**: Persist successful SMS parsing results as one resumable,
device-local review queue per authenticated user so leaving review or restarting
the app does not lose parsed work or cause repeat paid AI parsing.

## Clarifications

### Session 2026-07-25

- Q: How can Discard support immediate Undo while removing persisted raw SMS
  immediately? A: Remove the durable draft and create dismissed state
  immediately. Keep the edited item only in volatile memory for the short Undo
  opportunity. Undo restores the item and removes dismissed state. Closing the
  app or allowing the Undo opportunity to expire makes the discard final.
- Q: How long is a dismissed fingerprint retained? A: Retain it for the
  lifetime of that user's local app data so the same SMS is not offered or sent
  for paid parsing again on that device. Remove it only when the corresponding
  local user data is explicitly deleted or reset.
- Q: Is Discard all retained? A: Yes. It remains a separate quiet destructive
  action with explicit confirmation and applies the same dismissed-fingerprint
  behavior to every remaining item.

### Session 2026-07-26

- Q: How should unresolved and warning-bearing drafts affect batch saving? A:
  Preserve the existing review behavior. Soft warnings and unselected drafts do
  not block saving. Drafts with hard validation failures are not auto-selected;
  if the user selects one, its unresolved hard failure blocks the entire atomic
  selected batch until corrected. Deliberately selecting a structurally valid
  soft-warning draft counts as confirmation without requiring an edit.
- Q: Where should the user go after a selected batch saves while unselected
  drafts remain? A: Preserve current behavior by navigating to Transactions.
  Keep every unselected draft durable for later review and show brief success
  feedback containing only the saved transaction count.
- Q: Should manual selection and deselection survive leaving review? A: Persist
  only explicit user selection overrides. Untouched drafts continue deriving
  selection from current review metadata, while a deliberate selection or
  deselection survives navigation and app restart.
- Q: What happens when a previously selected draft later develops a hard
  validation failure? A: Hard validation overrides the stale selection. Persist
  the draft as explicitly unselected, require correction, and do not select it
  again until the user deliberately reselects it.
- Q: Should confirmed Discard all be undoable, and how should users exit review
  without discarding? A: Confirmed Discard all is final and cannot be undone.
  Its confirmation must state that every suggestion will be permanently removed
  and those SMS messages will not be suggested again on this device. Provide a
  separate one-tap Review later exit that preserves the queue and leaves the full
  scan flow without repeated Back actions.

### Session 2026-07-27

- Q: How should the SMS suggestion edit sheet change? A: Preserve the approved
  compact bottom-sheet styling and bounded height so the review header and
  filters remain visible. Preserve the provider identity block above the fields
  and the approved colorful field icons. Add Currency, remove individual
  discard from the sheet, and make parsed SMS transaction direction/type
  read-only by omitting the Expense and Income tabs. Amount and Merchant edit
  inline in their existing rows with one focused field at a time and
  keyboard-aware internal scrolling; Category, Account, and editable Currency
  continue opening their selector sheets.
- Q: Where should individual discard live and how should repeated Undo behave?
  A: Provide one compact circular X action at the top-right of each SMS
  suggestion card. It has a full accessible touch target, remains visually
  secondary to selection and editing, and discards in one tap without an
   individual confirmation. Discard removes the item immediately and shows one
   inline banner fixed in the review layout above the transaction rows, naming
   the latest discarded suggestion with Undo and a trailing close action. The
   banner MUST remain visible until the user acts, another item replaces it, or
   the review process ends; it MUST NOT auto-dismiss on a timer. Undo restores
   the same edited item, position, and selection state. Closing the banner,
   closing the process, or discarding another item finalizes the previous
   discard; a later discard replaces the banner and becomes the only undoable
   item.
- Q: How should individual discard and Undo move? A: Use restrained product
  motion. A successfully discarded card fades and collapses once while adjacent
  cards settle once without bounce or layout jitter. Undo expands and fades the
  same card back into its prior position without overshoot. Motion MUST respect
  the platform reduced-motion preference and MUST NOT delay or obscure durable
  transition failures.
- Q: Which user-facing terms and feedback should be used? A: Use "suggestion",
  not the internal term "draft", in discard copy. Successful batch-save feedback
  shows only the saved transaction count. Rename the full privacy page to
  Privacy details and separate AI processing from temporary device-local SMS
  review storage.

- Q: How should malformed or unsupported durable payloads be handled? A: Fail
  closed, physically remove only the corrupt current-user item through a
  privacy-safe cleanup path, and remove its queue only when no valid items
  remain. Do not create dismissed state because corruption is not a user
  rejection, and do not log the raw payload.

### Approved Mockup Gate

All required focused states in FR-047 were approved by Mohamed before
implementation on 2026-07-27. Approval covers recovery entry, Review later,
bounded edit default and inline keyboard focus, provider identity and colorful
icons, Currency, one-tap per-card X, latest-item Undo with close, restrained
remove/restore motion, Discard all confirmation, stale references, privacy
sections, light/dark structure, and reduced-motion behavior. Theme colors remain
authoritative over mockup colors.

## User Scenarios & Testing

### User Story 1 - Resume Parsed Work After Leaving (Priority: P1)

As an authenticated user reviewing SMS transaction suggestions, I want every
successful result accepted for my signed-in account and every confirmed edit
saved automatically so I can leave, background, or close the app and later
continue from the same review state without parsing the SMS again.

**Why this priority**: Avoiding lost paid parsing work and preserving user edits
is the feature's primary value.

**Independent Test**: Parse several SMS messages, edit at least one suggestion,
manually change another suggestion's selection, leave through back navigation,
terminate and restart the app, then resume and verify that every accepted item,
confirmed edit, and explicit selection override returns without another AI
request while untouched items derive selection normally.

**Acceptance Scenarios**:

1. **Given** a scan produces a successful transaction suggestion and the pinned
   authenticated user is still current, **When** the result passes the scan's
   stale-session checks, **Then** it is added automatically to that user's active
   local review queue before navigation or lifecycle loss can discard it.
2. **Given** the user changes a draft's reviewable values, **When** the edit is
   confirmed, **Then** the updated item becomes the resumable version.
3. **Given** the user deliberately selects or deselects a draft, **When** review
   is left and later resumed, **Then** that explicit override is restored, while
   untouched drafts derive selection from their current review metadata.
4. **Given** an active queue exists, **When** the user leaves review,
   backgrounds the app, terminates it, or restarts the device, **Then** the
   unresolved items remain available.
5. **Given** the app restarts with an active queue, **When** the same user
   returns to SMS import, **Then** the queue restores the same complete edited
   results without another AI request.
6. **Given** another user signs in on the same device, **When** SMS import or
   review opens, **Then** the first user's queue is neither counted nor shown.
7. **Given** a parser result completes after the pinned user is no longer current,
   **When** stale-session validation runs, **Then** the result is not persisted,
   published, or attributed to either user, and the affected message remains
   non-durable under the established scan-checkpoint rules.

---

### User Story 2 - Merge New Results Without Repeat Parsing (Priority: P1)

As a user with an unfinished review queue, I want to check for newer messages
and merge unique successful results into the queue so I can continue one review
workflow without duplicates, lost edits, or repeated AI charges.

**Why this priority**: A resumable queue reduces cost only if every scan checks
durable fingerprints before paid work and merges safely.

**Independent Test**: Create an edited active queue, scan an inbox containing
the same messages plus new ones, and verify that only unique new successes are
added, existing edits remain unchanged, and no completed fingerprint reaches
paid parsing.

**Acceptance Scenarios**:

1. **Given** a saved financial record, active draft, or dismissed fingerprint
   already exists for an SMS, **When** a new scan evaluates that message,
   **Then** it is excluded before any paid AI request.
2. **Given** an active queue contains an edited item, **When** a later scan
   encounters the same fingerprint, **Then** no duplicate is created and the
   edited item is not overwritten.
3. **Given** a later scan produces unique successful results, **When** parsing
   completes, **Then** those items append to the same active queue.
4. **Given** one candidate or chunk fails after other candidates succeed,
   **When** the scan finishes, **Then** successful items remain durable and
   failed or unresolved candidates create no transaction drafts.
5. **Given** an unresolved candidate remains eligible for a permitted retry,
   **When** no successful parse exists, **Then** the feature stores no hidden
   raw-SMS retry copy for that candidate.
6. **Given** a trusted local parse succeeds but category enrichment is unavailable
   or refused, **When** the scan completes, **Then** the direction-correct local
   result still becomes durable with its established fallback category and review
   state rather than being discarded or sent to the full parser solely for
   enrichment.

---

### User Story 3 - Save Selected Drafts as One Safe Batch (Priority: P1)

As a user reviewing a resumed queue, I want drafts to follow the established
selection, validation, and atomic batch-save behavior so valid selected work can
be saved without unselected work blocking me and no invalid selected draft can
create a partial financial write.

**Why this priority**: Draft recovery cannot weaken financial correctness,
selection expectations, ownership checks, or atomic failure recovery.

**Independent Test**: Resume a queue containing auto-selectable drafts,
structurally valid soft-warning drafts, hard-invalid drafts, and a simulated
batch-write failure. Verify initial selection, explicit confirmation, validation,
atomic saving, draft removal, and retained unselected work.

**Acceptance Scenarios**:

1. **Given** a resumed item references an account and category still accessible
   to the current user, **When** review opens, **Then** its parsed values and
   review reasons remain available for validation and editing.
2. **Given** an SMS suggestion is opened for editing, **When** its compact bounded
   edit sheet appears, **Then** the review header and filters remain visible, the
   provider identity block and colorful field icons remain present, Currency is
   available, Amount and Merchant support one-at-a-time inline editing with
   keyboard-aware scrolling, selector fields retain their sheets, extra fields
   remain internally reachable, individual discard is absent, and transaction
   direction/type is read-only with no Expense or Income tabs.
3. **Given** a draft has a hard validation failure such as a missing, stale,
   inaccessible, deleted, or foreign required reference, **When** review opens,
   **Then** it requires review, any stale selected override becomes an explicit
   unselected override, and correcting the failure does not select it again until
   the user deliberately reselects it.
4. **Given** an unselected draft has a hard validation failure or any draft has
   only a soft warning, **When** other valid selected drafts are saved, **Then**
   neither condition blocks the selected batch.
5. **Given** a structurally valid soft-warning draft is not auto-selected,
   **When** the user reviews and deliberately selects it, **Then** that selection
   counts as confirmation and no edit is required solely because of the warning.
6. **Given** a selected draft still has a hard validation failure, **When** the
   user attempts to save, **Then** the entire selected batch is blocked before
   any financial write and the unresolved item and field are identified.
7. **Given** every selected draft passes hard validation, **When** the established
   batch save succeeds, **Then** all selected drafts are saved atomically with
   their SMS fingerprints, only their corresponding draft payloads are removed,
   and every unselected draft remains in the active queue.
8. **Given** a selected batch saves successfully while unselected drafts remain,
   **When** post-save navigation occurs, **Then** the user is taken to Transactions
   and receives brief feedback containing only the saved transaction count.
9. **Given** the atomic financial batch write fails, **When** the save attempt
   ends, **Then** no selected financial record is committed, every selected and
   unselected draft remains recoverable with its confirmed edits, and the user
   receives friendly retry guidance.
10. **Given** the final remaining drafts are saved successfully, **When** their
    removal completes, **Then** no empty active queue remains.

---

### User Story 4 - Discard With Durable Suppression and Safe Recovery (Priority: P1)

As a user who rejects an SMS suggestion, I want individual discard to offer an
immediate Undo and confirmed Discard all to be final with explicit consequences,
so rejected SMS messages are not offered or billed again while accidental
single-item actions remain recoverable.

**Why this priority**: Discard must be intentional, privacy-safe, and
cost-protective without being confused with ordinary review exit.

**Independent Test**: Discard one edited item, undo it immediately, discard it
again without undo, then exercise confirmed Discard all and verify per-item
suppression, final bulk deletion, queue contents, raw-data removal, and no
financial writes.

**Acceptance Scenarios**:

1. **Given** an active suggestion card, **When** the user taps its compact
   top-right X action, **Then** only that item is removed in one tap from the
   visible queue and durable review storage, no financial record is written,
   and its user-scoped dismissed fingerprint is recorded.
2. **Given** an individual discard succeeds, **When** the card leaves the list,
   **Then** it fades and collapses once, adjacent cards settle once without
   bounce or layout jitter, and the single Undo banner names the discarded
   suggestion and offers Undo plus a trailing close action in normal layout
   flow above the transaction rows without obscuring the review list or footer.
3. **Given** the latest item was just discarded, **When** the user selects Undo,
   **Then** the same edited item expands and fades into its previous list
   position without overshoot, its explicit selection state is restored, and
   its dismissed fingerprint is removed.
4. **Given** an Undo banner is active, **When** the user leaves it untouched,
   **Then** it remains visible and undoable without a timer cutoff; when the user
   closes it, the process ends, or another item is discarded, the current
   discard becomes final, its volatile payload is erased, and any later discard
   replaces the banner as the only undoable item.
5. **Given** an item was discarded and not undone, **When** a later scan sees
   that fingerprint, **Then** it is not offered or sent for paid parsing again
   while that user's local data remains.
6. **Given** multiple items remain, **When** the user chooses Discard all,
   **Then** confirmation uses the user-facing term suggestions, states the number
   that will be permanently removed, states that the action cannot be undone,
   and states that those SMS messages will not be suggested again on this device.
7. **Given** the user confirms Discard all, **When** deletion completes, **Then**
   every remaining item is removed, each receives its own dismissed fingerprint,
   and no Undo opportunity is offered.
8. **Given** Discard all confirmation is shown, **When** the user cancels,
   **Then** the queue and dismissed state remain unchanged.
9. **Given** the final item is discarded, **When** removal completes, **Then**
   no empty active queue remains.

---

### User Story 5 - Recover and Scan From a Clear Entry State (Priority: P2)

As a returning user with unfinished SMS suggestions, I want recovery to be the
primary choice while retaining a separate option to check for new messages so I
understand what is pending and can choose when to continue.

**Why this priority**: Durable drafts need a discoverable, non-blocking return
journey; otherwise recovery exists but users still rescan or abandon it.

**Independent Test**: Open SMS import with and without an active queue, enter
review, use Review later, and verify the available actions, counts, one-tap exit,
destructive confirmation, scan boundary, and offline behavior.

**Acceptance Scenarios**:

1. **Given** an active queue contains N items, **When** the user opens SMS
   import, **Then** Continue reviewing N transactions is the primary action.
2. **Given** an active queue exists, **When** the entry state is displayed,
   **Then** Check for new messages is a separate secondary action.
3. **Given** the user checks for new messages, **When** the scan starts, **Then**
   it uses the established safe incremental checkpoint and merges only unique
   successful results.
4. **Given** the user is reviewing drafts, **When** Review later is selected,
   **Then** the app exits the complete scan/review flow in one action without
   deleting drafts, creating dismissed state, or requiring repeated Back actions.
5. **Given** an active queue exists, **When** the user leaves the entry or review
   state without choosing a destructive action, **Then** the queue remains unchanged.
6. **Given** no network is available, **When** the user resumes an existing
   queue, edits it, saves through local financial validation, or discards an
   item, **Then** those local workflows remain usable without cloud access.
7. **Given** subscription status changes, **When** the user resumes or resolves
   a queue, **Then** draft availability and lifecycle behavior remain unchanged.

---

### User Story 6 - Limit Sensitive Draft Data (Priority: P1)

As a privacy-conscious user, I want original SMS text retained only while a
review item is active and never copied into unrelated destinations so recovery
does not broaden exposure of financial message content.

**Why this priority**: Raw SMS persistence is a narrow approved exception and
must not become general financial, synchronization, notification, or telemetry
data.

**Independent Test**: Exercise parse, edit, resume, save, discard, Undo, expiry,
account switching, diagnostics, notifications, and synchronization, then verify
that raw SMS exists only in active local drafts or the short volatile Undo
opportunity.

**Acceptance Scenarios**:

1. **Given** a successful active draft exists, **When** local draft data is
   inspected, **Then** the complete review payload includes the original SMS
   required by the review experience.
2. **Given** a draft is saved or discarded, **When** the transition completes,
   **Then** its durable complete payload and original SMS are removed
   immediately.
3. **Given** a discard is temporarily undoable, **When** the Undo opportunity
   is active, **Then** the edited item may exist only in volatile memory and is
   erased when Undo expires or the process ends.
4. **Given** an active draft exceeds 30 days from parsing, **When** cleanup runs,
   **Then** the draft payload and original SMS are removed without affecting
   another user or a newer item.
5. **Given** any draft lifecycle runs, **When** synchronization,
   notifications, logs, diagnostics, analytics, crash reporting, or category
   enrichment are inspected, **Then** no original SMS or complete draft payload
   appears there.

### Edge Cases

- Two scans produce the same successful fingerprint concurrently.
- A new result races with an edit to an existing item.
- The app terminates between successful parsing and navigation to review.
- The app terminates during an item edit, save, discard, Undo, Discard all, or
  cleanup operation.
- A save creates the financial record but draft cleanup is interrupted.
- Draft cleanup occurs while the same queue is being viewed or modified.
- An item reaches the 30-day boundary exactly while the app is offline.
- The stored payload is malformed, incomplete, or uses an unsupported version.
- A stored date is invalid, outside the supported range, or cannot be restored.
- An account or category becomes inaccessible between display-time and
  save-time validation.
- The user switches accounts while parsing, merging, cleanup, saving, or Undo
  is in progress.
- The same fingerprint appears in a transaction, transfer, active draft,
  dismissed state, and synchronized processing outcome.
- The queue contains a mix of transaction suggestions and ATM withdrawal
  suggestions that use different validated save outcomes.
- Some AI chunks succeed while later chunks fail, time out, are cancelled, or
  reach capacity.
- Discard all is confirmed while another unique result is being merged.
- Dismissed state exists but its former draft payload is absent or corrupt.
- Local storage is unavailable or full when a successful parse must become
  durable.
- The user revokes AI processing consent after drafts were created.

## Requirements

### Functional Requirements

- **FR-001**: Every successful parsed SMS transaction accepted after pinned-user
  and stale-session validation MUST become durable automatically before the
  result is exposed to navigation or lifecycle loss.
- **FR-002**: Failed, cancelled, malformed, quota-deferred, oversized, and
  otherwise unresolved candidates MUST NOT create transaction drafts.
- **FR-003**: Successful items from a partially failed scan MUST remain durable
  even when later candidates or chunks fail, and a trusted local success MUST
  remain draft-eligible when optional category enrichment is unavailable.
- **FR-004**: The feature MUST maintain at most one active SMS review queue for
  each authenticated user within one app installation.
- **FR-005**: A user's active queue and dismissed state MUST remain device-local
  and MUST NOT synchronize across devices.
- **FR-006**: Every draft read, write, merge, transition, and cleanup operation
  MUST be scoped to the authenticated user who owns it.
- **FR-007**: Account switching or logout MUST prevent pending work from one
  user from being displayed, merged, saved, discarded, or attributed to another
  user. Results completing for a stale pinned user MUST fail closed without
  becoming durable for either account.
- **FR-008**: The durable draft representation MUST preserve every value needed
  by the current SMS review experience, including original SMS text, parsed
  financial values, parser source, confidence, review status, review reasons,
  account/category references, SMS fingerprint, confirmed user edits, and an
  optional explicit user selection override.
- **FR-009**: The durable representation MUST have an explicit version starting
  at version 1, serialize timestamps consistently, and restore dates as valid
  review values.
- **FR-010**: Restored payloads MUST be validated before use. Malformed,
  incomplete, invalid-date, and unsupported-version payloads MUST NOT reach
  review or financial writes.
- **FR-011**: Confirmed user edits and explicit selection overrides MUST update
  the resumable item before navigation or app termination can lose them.
  Untouched drafts MUST continue deriving selection from current review metadata.
- **FR-012**: New successful results MUST merge into the user's existing active
  queue rather than create another active queue.
- **FR-013**: Queue merge and concurrent upsert behavior MUST produce at most
  one active item for each user and SMS fingerprint.
- **FR-014**: Encountering an existing fingerprint MUST NOT overwrite a newer
  confirmed user edit with parser output.
- **FR-015**: Before any paid AI request, fingerprint checks MUST include
  non-deleted SMS-created transactions, non-deleted SMS-created transfers,
  active drafts, dismissed fingerprints, and other authoritative durable
  processing states established by the scan safeguards.
- **FR-016**: A safe scan checkpoint MUST treat active drafts and dismissed
  fingerprints as durable handled states without replacing fingerprint checks.
- **FR-017**: Resuming, merging, editing, saving, discarding, undoing, and
  expiry cleanup MUST work without network connectivity.
- **FR-018**: Before displaying a resumed item, every referenced account and
  category MUST be checked for current-user accessibility.
- **FR-019**: Drafts MUST use the established review metadata and initial
  selection rules: auto-selectable untouched drafts begin selected, while drafts
  with hard validation failures and structurally valid soft warnings begin
  unselected. A newly detected hard validation failure MUST replace any stale
  selected override with an explicit unselected override, and correction MUST
  NOT reselect that draft without a new deliberate user selection.
- **FR-020**: Reference revalidation MUST preserve parsed financial values,
  parser provenance, review status, and review reasons and MUST NOT invoke AI.
- **FR-021**: A hard validation failure MUST produce a clear review-required
  state and allow the user to correct the affected field where the existing
  review workflow supports correction.
- **FR-022**: Soft warnings and unselected drafts MUST NOT block saving other
  valid selected drafts. Deliberately selecting a structurally valid soft-warning
  draft MUST count as user confirmation without requiring an unrelated edit.
- **FR-023**: Before saving, every selected draft's required values and references
  MUST be rechecked. If any selected draft has an unresolved hard validation
  failure, the entire selected batch MUST be blocked before any financial write
  and the affected item and field MUST be identified.
- **FR-024**: Saving selected drafts MUST use the established atomic batch
  transaction or transfer workflow, preserve every SMS fingerprint, remove only
  the successfully saved drafts after commit, leave unselected drafts active,
  preserve navigation to Transactions, and report only the saved transaction
  count in brief success feedback.
- **FR-025**: A failed atomic financial batch MUST commit no selected financial
  record, leave every draft recoverable, report no item as resolved, and remain
  idempotent across interruption or restart so no duplicate record or completed
  draft resurrection can occur.
- **FR-026**: Discarding one item from its compact top-right X action MUST remove
  only that item's durable payload, remove it in one tap from the visible queue,
  create no financial record, and record its user-scoped dismissed fingerprint.
  The action MUST have an accessible touch target and label that names the
  affected suggestion.
- **FR-027**: A dismissed fingerprint MUST prevent that SMS from being offered
  or submitted for paid parsing again for the lifetime of the user's local app
  data.
- **FR-028**: Dismissed state from the latest individual discard MUST be removed
  only by immediate Undo or explicit deletion/reset of the corresponding user's
  local app data. Closing or replacing the Undo banner finalizes the discard.
  Confirmed Discard all offers no Undo.
- **FR-029**: Immediate Undo for the latest individual discard MUST restore the
  same edited item to its previous queue position with its explicit selection
  state and remove its dismissed fingerprint without invoking AI.
- **FR-030**: After individual discard, the complete edited item MAY remain only
  in volatile memory during the immediate Undo opportunity and MUST be erased
  when the banner is closed, replaced by another discard, or the process ends.
  The single banner MUST remain visible without timer-based dismissal, name the
  latest item, expose Undo plus a trailing close action, and occupy normal layout
  flow above the transaction rows rather than overlaying review content.
- **FR-031**: Discard all MUST be visually secondary, require explicit
  confirmation, apply dismissed-fingerprint behavior to every remaining item,
  and become final without Undo after confirmation. User-facing confirmation
  MUST use suggestions rather than drafts, state the affected count and
  permanent removal, and state that those SMS messages will not be suggested
  again on that device.
- **FR-032**: Back navigation, backgrounding, route abandonment, app termination,
  device restart, and a dedicated one-tap Review later exit MUST preserve active
  queue items and MUST NOT create dismissed state. Review later MUST leave the
  complete scan/review flow without repeated Back actions.
- **FR-033**: When an active queue contains N items, SMS import entry MUST show
  Continue reviewing N transactions as the primary action and Check for new
  messages as the secondary action.
- **FR-034**: Check for new messages MUST use the established safe incremental
  scan boundary and merge unique successful items into the active queue.
- **FR-035**: No custom date-range control or subscription/paywall behavior may
  be introduced by this feature.
- **FR-036**: Draft lifecycle behavior MUST remain independent of subscription
  status.
- **FR-037**: Revoking AI processing consent MUST block new AI work but MUST NOT
  delete an already-created local queue; existing items MAY still be reviewed,
  corrected, saved, or discarded without another AI request.
- **FR-038**: Original SMS text and the complete draft payload MUST exist only
  for active local draft items or the short volatile Undo opportunity.
- **FR-039**: Original SMS text and complete draft payloads MUST NOT enter final
  transactions or transfers, synchronized data, notifications, logs,
  diagnostics, analytics, crash context, operational reporting, or category
  enrichment.
- **FR-040**: Resolving an item by save or discard MUST remove its durable
  original SMS and complete payload immediately after the authoritative
  transition succeeds.
- **FR-041**: Unresolved active draft items MUST expire 30 days after their
  parsing time.
- **FR-042**: Expiry cleanup MUST be idempotent, user-scoped,
  cancellation-safe, safe across restart and account switching, and unable to
  remove newer items or another user's data.
- **FR-043**: Cleanup MUST NOT remove dismissed fingerprints solely because
  their former drafts expired.
- **FR-044**: Resolving or expiring the final item MUST remove the empty active
  queue.
- **FR-045**: The feature MUST expose no claim that local draft data is
  encrypted unless that protection is independently verified.
- **FR-046**: The full user-facing page MUST be titled Privacy details and MUST
  distinguish AI processing from temporary device-local SMS review storage. It
  MUST disclose original-SMS storage for resumable review and the 30-day
  unresolved retention limit without implying that local drafts are sent to AI.
- **FR-047**: Resume, new-scan, Review later, one-tap per-card X discard, named
  single-item Undo with close action, discard/restore motion, Discard all,
  destructive confirmation, bounded edit-sheet default and focused-field
  states, stale-reference warning, and privacy-detail states MUST receive
  focused mockup approval before implementation.
- **FR-048**: Individual-discard copy MUST state that the suggestion will not be
  offered again on this device unless immediately undone. Discard-all copy MUST
  use suggestions rather than drafts and state the affected count, permanent
  removal, that the action cannot be undone, and that those SMS messages will
  not be suggested again on this device.
- **FR-049**: Every durable transition MUST produce a clear success or
  recoverable failure outcome without exposing SMS or financial content in
  error details.
- **FR-050**: User scoping, fingerprint deduplication, lifecycle cleanup, and
  item transitions MUST be determinable from privacy-safe item metadata without
  reading every complete sensitive review payload.
- **FR-051**: The SMS suggestion edit experience MUST preserve the approved
  compact bounded bottom-sheet styling, provider identity block, and colorful
  field icons; keep the review header and filters visible; include Currency;
  support one-at-a-time inline Amount and Merchant editing with keyboard-aware
  internal scrolling; retain sheets for selector fields; and omit individual
  discard plus editable Expense and Income transaction-type controls.
- **FR-052**: Each SMS suggestion card MUST provide one compact circular X action
  at its top-right that discards in one tap, remains visually secondary to
  selection and editing, and cannot be confused with the selection checkbox.
- **FR-053**: A successful individual discard MUST use one restrained fade and
  collapse while adjacent cards settle once. Undo MUST expand and fade the same
  card into its prior position without spring bounce, overshoot, or repeated
  layout movement. Both transitions MUST respect the platform reduced-motion
  preference, and a failed durable transition MUST leave or restore the card
  with friendly recovery feedback.
- **FR-054**: A malformed, incomplete, invalid-date, fingerprint-mismatched, or
  unsupported-version current-user payload MUST fail closed and be physically
  removed through a user-scoped privacy-safe cleanup path. It MUST NOT create
  dismissed state, affect another valid item, expose raw payload content in an
  error, or leave an empty queue.

### Key Entities

- **SMS Review Queue**: One active device-local collection for one authenticated
  user, with ownership, lifecycle timestamps, and aggregate item count. It is
  removed when no active items remain.
- **SMS Review Draft Item**: One successful parsed SMS suggestion identified by
  user and stable SMS fingerprint. It contains the complete versioned review
  payload, confirmed edits, an optional explicit selection override, parsing
  time, update time, and an active lifecycle implied by presence in this table.
- **Versioned Review Payload**: The complete restorable suggestion consumed by
  review, including original SMS, parsed values, provenance, confidence,
  reasons, references, and dates.
- **Dismissed SMS Fingerprint**: Lightweight user-scoped local state proving the
  user intentionally rejected one SMS suggestion. It contains no original SMS
  or parsed financial payload and remains for the lifetime of that user's local
  app data unless an eligible individual discard is immediately undone or the
  user's local data is explicitly reset. Bulk-discarded fingerprints are final.
- **Volatile Undo Item**: A short-lived in-memory copy of the just-discarded
  edited item. It is never synchronized or restored after process termination.
- **Reference Validation Result**: Current-user accessibility state for the
  accounts and categories referenced by a resumed item, including any
  review-required correction.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In 100% of navigation, background, app-termination, device-restart,
  and offline recovery tests, every accepted successful draft item, confirmed
  edit, and explicit selection override is restored without another AI request.
- **SC-002**: Repeating scans over saved, active-draft, or dismissed
  fingerprints produces zero duplicate review items, zero duplicate financial
  records, and zero paid AI submissions for those fingerprints.
- **SC-003**: In 100% of mixed partial-failure and enrichment-unavailable tests,
  every accepted successful item remains durable while failed and unresolved
  candidates create zero transaction drafts.
- **SC-004**: Concurrent scan and edit tests produce exactly one active item per
  user and fingerprint and preserve the latest confirmed user edit.
- **SC-005**: In 100% of account-switch and logout tests, one user's drafts,
  counts, dismissed state, and raw SMS are never rendered or mutated for another
  user, and late stale-session results become durable for neither account.
- **SC-006**: In 100% of malformed, unsupported-version, and invalid-date tests,
  invalid payloads reach neither the review UI nor a financial write.
- **SC-007**: In 100% of stale account/category tests, no inaccessible identifier
  reaches a financial record and no additional AI request occurs.
- **SC-008**: In 100% of selected-batch validation, write-failure, and interrupted
  transition tests, a selected hard-invalid draft produces zero financial
  writes, a failed batch commits no selected record, no successful record is
  duplicated, and every unresolved draft remains recoverable.
- **SC-009**: One-tap per-card X discard, restrained removal motion, latest-item
  Undo with in-place restore motion, banner close and replacement, plus confirmed
  final Discard all produce the expected per-item queue and dismissed state in
  100% of automated lifecycle tests, offer no bulk Undo, create zero financial
  records, and produce no repeated layout movement.
- **SC-010**: Privacy inspection finds zero original SMS bodies or complete
  draft payloads in synchronized data, final financial records, notifications,
  logs, diagnostics, analytics, crash context, operational reporting, and
  category enrichment.
- **SC-011**: Every saved, discarded, or expired item has no durable original
  SMS or complete payload after its authoritative transition completes.
- **SC-012**: Cleanup removes 100% of active draft items older than 30 days from
  parsing, removes no newer item, and produces the same correct result when run
  repeatedly or resumed after interruption.
- **SC-013**: At least 95% of focused usability-test participants can identify
  how to continue an existing queue, check for new messages, leave via Review
  later without data loss, use the visible one-tap X discard and named Undo
  states, and understand individual and bulk discard consequences without
  assistance.
- **SC-014**: Existing queues can be reviewed and resolved with zero network
  connectivity and zero new AI requests.
- **SC-015**: Focused approved mockups cover every visible state listed in
  FR-047 before production implementation begins.

## Assumptions

- The canonical SMS fingerprint definition remains unchanged and is the
  authoritative identity across scans, drafts, dismissed state, transactions,
  transfers, live detection, and scan safeguards.
- Successful draft persistence applies to trusted local and accepted AI parser
  results only after pinned-user and stale-session validation. It does not
  persist failed, unresolved, or stale-user raw candidates. Trusted local
  successes remain eligible when category enrichment is unavailable.
- The current review payload is the source of truth for what must round-trip;
  the feature does not introduce business remapping during resume.
- Existing transaction and transfer validation, balance effects, idempotency,
  and user-scoped ownership rules remain authoritative.
- Existing 30-day scan boundaries and safe incremental checkpoints remain
  authoritative. This feature consumes those boundaries but does not redefine
  them.
- AI consent is required for new provider work. Already-created local drafts
  remain reviewable because resuming them sends no content to the provider.
- The individual-discard Undo duration follows the existing product-wide
  transient action pattern. Only the latest discarded item is undoable; closing
  or replacing its banner finalizes that discard. Confirmed Discard all is final.
- Dismissed fingerprints are local processing preferences, not financial
  records, and contain no original SMS or parsed financial payload.
- Existing authenticated startup and private-runtime gates remain responsible
  for preventing private UI from appearing before the current user is resolved.

## Dependencies

- Existing hybrid local-first SMS parsing, partial-result handling, and parser
  provenance from issues #752 and #763.
- Existing launch scan checkpoint, AI allowance, and durable fingerprint-state
  contracts from issue #769.
- Existing validated SMS transaction and transfer save workflows.
- Existing current-user account and category accessibility rules.
- Existing AI processing disclosures, incorporated as one section of the renamed
  general Privacy details page alongside the approved temporary local-draft
  disclosure.
- Focused product mockup approval for the visible states listed in FR-047.

## Out Of Scope

- Cross-device draft synchronization or reinstall recovery.
- Raw SMS content in final transactions, transfers, notifications, telemetry,
  or cloud data.
- Subscription billing, paywalls, entitlements, or custom date ranges.
- Persistent storage of failed or unresolved raw-SMS retry candidates.
- Trusted-template, full-AI prompt, or category-learning changes.
- Voice transaction drafts.
- Changes to canonical SMS fingerprint generation.
