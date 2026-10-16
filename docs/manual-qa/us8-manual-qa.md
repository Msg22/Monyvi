# US8 Manual QA: Metal Holding Undo Lifecycle & Sync Validation

## Scope & Objective

Validate end-to-end functionality of Undo (Restore) for Disposed and Sold metal
holdings:

- Local WatermelonDB state transitions and atomicity
- Lifecycle event reversal linkages (`predecessorEventId`, `reversesEventId`)
- Canonical sync ID deduplication contract matching SQL migration 068
- Attempt identity tracking, idempotent retry, CAS guard, and offline
  restoration

---

## Test Cases

### TC-US8-01: Undo Disposed Holding (Happy Path)

1. **Precondition**: User has a metal holding in `disposed` state with revision
   `R` and effective terminal event `E_term`.
2. **Action**: User navigates to holding details and taps "Undo / Restore".
3. **Expected Behavior**:
   - Holding status transitions from `disposed` to `active`.
   - `financialRevision` increments from `R` to `R+1`.
   - Reversal `metal_lifecycle_events` record is created with `kind: "undo"`,
     `predecessorEventId: E_term`, `reversesEventId: E_term`.
   - Reversal `metal_action_evidence` is created with `kind: "undo"`.
   - Both `metal_action_evidence.id` and `metal_lifecycle_events.id` match
     `actionId` canonically.
   - `metal_holding_states.effectiveEventId` updates to `actionId`.
   - Timeline reflects the restoration immediately without requiring manual
     refresh.

### TC-US8-02: Undo Sold Holding (Non-Credited Sale)

1. **Precondition**: User has a metal holding in `sold` state with zero account
   guards (non-credited / external cash receipt).
2. **Action**: User taps "Undo / Restore".
3. **Expected Behavior**:
   - Holding status transitions from `sold` to `active`.
   - Sale result treatment is removed while terminal history is preserved.
   - Reversal evidence and lifecycle events are linked to the terminal sale
     event.

### TC-US8-03: Blocked Undo on Credited Sale

1. **Precondition**: User has a metal holding sold with credited account guards
   (`accountGuards > 0`).
2. **Action**: User attempts to restore or inspect restore eligibility.
3. **Expected Behavior**:
   - Action is rejected with `metal_undo_credited_sale_blocked`.
   - No partial database records, evidence, or state mutations are committed.

### TC-US8-04: Idempotent Replay & Deduplication on Sync Pull

1. **Precondition**: Holding was restored locally with `actionId: A`.
2. **Action**: Sync pull replays the server action envelope with canonical
   `actionId: A`.
3. **Expected Behavior**:
   - Local command service returns `{ kind: "replay" }`.
   - No duplicate `metal_action_evidence` or `metal_lifecycle_events` rows exist
     for `actionId: A`.
   - Single canonical event is retained in local database.

### TC-US8-05: Attempt Identity & Concurrent Tap Protection

1. **Precondition**: Holding is in `disposed` state.
2. **Action**: User rapidly taps "Restore" multiple times or triggers a retry
   after simulated offline network error.
3. **Expected Behavior**:
   - Concurrent taps share the exact same in-flight command promise.
   - Failed attempt retains stable `command` parameters (including `actionId`)
     for identical idempotent retry.
   - Switching holding, user, or financial revision resets attempt identity and
     generates fresh command parameters.
   - Stale completion callbacks after component unmount are suppressed cleanly.

### TC-US8-06: CAS Conflict / Concurrent Terminal Action

1. **Precondition**: Holding revision is concurrently incremented by another
   sync or action.
2. **Action**: User submits Undo with outdated `expectedFinancialRevision`.
3. **Expected Behavior**:
   - Command fails closed with `holding_revision_conflict`.
   - Terminal state and prior history remain unchanged.
