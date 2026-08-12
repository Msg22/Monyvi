# Data Model: Resumable SMS Review Drafts

## Storage Boundary

All entities in this document are installation-local WatermelonDB state. They
MUST be excluded from Supabase pull, push, generated cloud types, and remote DDL.
Every operation requires the authenticated user's explicit data scope.

## Entity: SMS Review Queue

**Table**: `sms_review_queues`

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Watermelon UUID |
| `user_id` | string | Required, indexed, one active queue per user |
| `created_at` | number | Epoch milliseconds |
| `updated_at` | number | Epoch milliseconds, monotonic per mutation |

**Constraints**:
- Repository-enforced single active row for `user_id`; Watermelon writes are
  serialized and create-or-reuse rechecks inside one writer.
- Physically removed when its final item is saved, discarded, or expired.
- Contains no raw SMS or parsed financial data.

## Entity: SMS Review Draft Item

**Table**: `sms_review_draft_items`

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Watermelon UUID |
| `queue_id` | string | Required, indexed, belongs to owned queue |
| `user_id` | string | Required, indexed, must equal queue owner |
| `sms_fingerprint` | string | Required, indexed, stable canonical identity |
| `payload_version` | number | Required, starts at `1` |
| `payload_json` | string | Required, complete codec output; sensitive |
| `selection_override` | boolean/null | `null` means derive current selection |
| `position` | number | Stable non-negative list order |
| `parsed_at` | number | Epoch milliseconds; retention anchor |
| `created_at` | number | Epoch milliseconds |
| `updated_at` | number | Epoch milliseconds |

**Constraints**:
- Repository-enforced single `(user_id, sms_fingerprint)` item; merge rechecks
  within one Watermelon writer before preparing an insert.
- `queue_id` must resolve to the same `user_id`.
- `payload_json` fingerprint must equal `sms_fingerprint` after decoding.
- Existing item wins during repeated parser merges; parser output never overwrites
  confirmed edits or selection override.
- Physically deleted after authoritative save, discard, or expiry.
- Original SMS exists only inside the encoded payload.

## Entity: Dismissed SMS Fingerprint

**Table**: `dismissed_sms_fingerprints`

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Watermelon UUID |
| `user_id` | string | Required, indexed |
| `sms_fingerprint` | string | Required, indexed |
| `created_at` | number | Epoch milliseconds |
| `updated_at` | number | Epoch milliseconds |

**Constraints**:
- Unique `(user_id, sms_fingerprint)`.
- Contains no raw SMS or parsed financial payload.
- Retained for the lifetime of the user's local app data.
- Removed only by immediate Undo for the latest individual discard or explicit
  reset/deletion of that user's local app data.

## Value Object: Versioned Review Payload V1

```ts
interface SmsReviewDraftPayloadV1 {
  readonly version: 1;
  readonly transaction: SerializedParsedSmsTransaction;
}
```

The serialized transaction contains every current `ParsedSmsTransaction` review
field. Runtime `Date` values serialize as ISO-8601 strings and must restore to
valid `Date` instances. The codec rejects unsupported versions, missing fields,
invalid dates, non-finite amounts/confidence, and fingerprint disagreement.

## Value Object: Volatile Undo Item

```ts
interface VolatileSmsReviewUndoItem {
  readonly draftId: string;
  readonly userId: string;
  readonly queueId: string;
  readonly smsFingerprint: string;
  readonly transaction: ParsedSmsTransaction;
  readonly selectionOverride: boolean | null;
  readonly position: number;
  readonly parsedAt: number;
}
```

This object exists in process memory only. Replacing or closing the Undo banner,
or ending the review process, erases it. It never appears in logs or persisted
state. The visible Undo opportunity has no timer cutoff.

## Read Model: SMS Review Queue Snapshot

```ts
interface SmsReviewQueueSnapshot {
  readonly queueId: string;
  readonly userId: string;
  readonly items: readonly SmsReviewDraftReadItem[];
  readonly itemCount: number;
  readonly earliestParsedAt: Date;
  readonly latestUpdatedAt: Date;
}
```

Items are ordered by `position`, then `created_at`, then `id`. Invalid payloads
are excluded from UI and physically removed through current-user privacy-safe
cleanup; repository errors expose only stable reason codes.

## State Transitions

### Parser success to active draft

1. Validate pinned user and stale scan session.
2. Encode accepted result.
3. Create/reuse the current user's queue.
4. Insert only absent `(user, fingerprint)` items at the next stable position.
5. Commit queue/items atomically.
6. Only then finalize checkpoint outcomes as durable review suggestions.

### Edit or selection override

1. Revalidate current ownership.
2. Encode the complete edited transaction.
3. Update item payload or explicit `selection_override` atomically.
4. Preserve fingerprint, parser provenance, position, and parsing time.

### Save selected

1. Decode and validate selected items.
2. Revalidate current-user account/category references.
3. Prepare existing financial transaction/transfer writes.
4. In one WatermelonDB batch, commit all financial writes, delete selected draft
   rows, and delete the queue if no items remain.
5. Unselected items remain unchanged.

### Individual discard

1. Capture a volatile Undo object.
2. In one WatermelonDB batch, insert/reuse the dismissed fingerprint, delete the
   draft, and delete an empty queue.
3. On success, animate removal and expose the latest Undo banner.
4. On failure, keep/restore the card and expose friendly retry feedback.

### Undo latest discard

1. Confirm the volatile item still belongs to the current user and is unexpired.
2. In one WatermelonDB batch, recreate/reuse the user's queue, restore the item at
   its original position, and remove the dismissed fingerprint.
3. On success, animate restoration and erase the volatile copy.

### Discard all

1. Confirm final destructive action.
2. In one batch, create/reuse dismissed fingerprints for every remaining item,
   delete all item rows, and delete the queue.
3. Erase any volatile Undo item; bulk discard has no Undo.

### Expiry cleanup

1. Query only current-user items where `parsed_at <= now - 30 days`.
2. Delete expired item payloads in a cancellable batch.
3. Delete queue only if no current-user items remain.
4. Never remove dismissed fingerprints.

## Invariants

- No raw SMS reaches cloud sync, final records, logs, diagnostics, notifications,
  enrichment, or telemetry.
- No cross-user queue/item/dismissed read or mutation.
- No checkpoint advances past a successful result until its draft is durable.
- No duplicate active item for one user/fingerprint.
- No parser merge overwrites confirmed edits.
- No selected hard-invalid item reaches a financial write.
- No financial write and draft deletion can commit independently.
- No empty active queue remains after an authoritative transition.
