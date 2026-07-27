# Contract: SMS Review Draft Repository and Commands

## Ownership

Mobile services own WatermelonDB access. Hooks and components never import raw
database collections or construct queries.

## Repository API

```ts
interface SmsReviewDraftRepository {
  observeQueue(userId: string): Observable<SmsReviewQueueSnapshot | null>;
  getQueue(userId: string): Promise<SmsReviewQueueSnapshot | null>;
  listHandledFingerprints(userId: string): Promise<ReadonlySet<string>>;
  mergeAcceptedResults(input: MergeAcceptedResultsInput): Promise<MergeResult>;
  updateItem(input: UpdateSmsReviewDraftInput): Promise<void>;
  updateSelection(input: UpdateSelectionOverrideInput): Promise<void>;
}
```

## Command API

```ts
interface SmsReviewDraftCommands {
  saveSelected(input: SaveSelectedSmsDraftsInput): Promise<SaveSelectedResult>;
  discardOne(input: DiscardSmsDraftInput): Promise<VolatileSmsReviewUndoItem>;
  undoLatest(input: UndoSmsDraftInput): Promise<void>;
  discardAll(input: DiscardAllSmsDraftsInput): Promise<number>;
  cleanupExpired(input: CleanupExpiredSmsDraftsInput): Promise<number>;
}
```

## Scope Contract

- Every public method receives a non-empty current `userId` or an authenticated
  scope object.
- Queue, item, account, category, transaction, transfer, and dismissed rows are
  verified against that same scope.
- Account changes cancel/ignore stale observations and command completions.
- A stale parser session cannot persist into either old or new user scope.

## Merge Contract

- Merge accepted local/AI successes only after stale-session validation.
- Create at most one active queue per user and one item per fingerprint.
- Append unique items in deterministic parser-result order.
- Existing items and confirmed edits win over repeated parser results.
- One failed item encode/write cannot mark that fingerprint durably handled.
- Return inserted/existing counts and durable fingerprints only; no raw content.
- Checkpoint finalization occurs only after the merge transaction commits.

## Selection and Edit Contract

- Confirmed edits replace the complete encoded payload atomically.
- Selection override is nullable: `null` derives current review behavior.
- A hard validation failure forces `false`; later correction preserves `false`
  until deliberate reselection.
- Unselected hard-invalid and any soft-warning items do not block other selected
  valid items.

## Save Contract

- Re-decode selected items and revalidate account/category accessibility.
- Block the entire operation before writes if a selected item is hard-invalid.
- Prepare existing transaction/transfer writes with canonical fingerprints.
- Commit all selected financial writes and matching draft deletions in one
  WatermelonDB batch.
- Leave unselected items untouched.
- Remove an empty queue in the same batch.
- On failure, commit neither financial records nor draft deletions.
- Return only saved counts/IDs needed for navigation and friendly feedback.

## Discard Contract

- Individual discard atomically inserts dismissed state and deletes one draft.
- Return the complete item only to the calling in-memory Undo controller.
- Undo atomically restores the same item/position/selection and removes dismissed
  state; it never invokes AI.
- Discard all atomically creates dismissed state for every remaining fingerprint,
  deletes all items, and deletes the queue; it has no Undo.
- Repeated discard/undo calls are idempotent and cannot create duplicate state.

## Cleanup Contract

- Delete only current-user items parsed at least 30 days ago.
- Never delete dismissed fingerprints.
- Remove queue only when no items remain.
- Repeated/interrupted cleanup converges on the same result.
- Cancellation or account switching cannot delete another user's rows.

## Sync Exclusion Contract

The following tables must never appear in pull/push table lists:
- `sms_review_queues`
- `sms_review_draft_items`
- `dismissed_sms_fingerprints`

A focused test must fail if any local-only table enters sync configuration.
