# Lifecycle Reduction And Reconciliation Contract

## Pure Lifecycle Reducer

The lifecycle reducer is DB-neutral. It accepts immutable event/fingerprint
evidence with state `effective`, `ineffective`, or `incomplete`; structural
validation always runs, so `is_effective` alone never establishes ownership.

```ts
export type LifecycleRejectionReason =
  | "duplicate_event_id_replay"
  | "duplicate_event_id_conflict"
  | "incomplete_evidence"
  | "ineffective_evidence"
  | "missing_predecessor"
  | "predecessor_not_accepted"
  | "predecessor_not_current"
  | "cycle_detected"
  | "invalid_transition"
  | "invalid_reversal_target"
  | "conflicting_effective_successors";

export interface LifecycleRejectedEvent {
  readonly event: LifecycleEvent;
  readonly fingerprint: string;
  readonly reasonCode: LifecycleRejectionReason;
  readonly relatedEventId: string | null;
}

export interface LifecycleReductionResult {
  readonly projection: LifecycleProjection | null;
  readonly acceptedEvents: readonly LifecycleEvent[];
  readonly rejectedEvents: readonly LifecycleRejectedEvent[];
}
```

`acceptedEvents` retains immutable `LifecycleEvent` values; each rejected entry
retains immutable event/fingerprint evidence, its stable reason, and related event.

Reduction retains one causal chain and its last valid projection; it returns `null`
when no safe root exists. A reversal is valid only when both its references identify
the current Sold/Disposed head. Invalid events and their descendants never affect
ownership, net worth, reporting, analytics, or normal History. Equal-time causal
ordering wins; IDs stabilize unrelated display/diagnostic ordering only and never
select a server CAS winner.

Conflicting effective successors without trustworthy canonical CAS evidence fail
closed. If two or more effective candidates claim the same accepted predecessor and
no authoritative canonical CAS winner is available, the reducer selects no successor
by event time or ID, rejects every conflicting successor with
`conflicting_effective_successors`, rejects their descendants as applicable, and
retains the predecessor's last valid projection. When trustworthy authoritative CAS
evidence identifies the canonical successor, the reducer accepts that successor and
rejects competing successors and descendants. This is distinct from ordering
unrelated display events; time and IDs never choose the conflict winner.

Malformed, rejected, and incomplete evidence remains internally retained for audit,
sync, and recovery. Raw reason codes remain internal; UI exposes the approved
reconciliation-recovery state instead. Slice 2 persists no per-event diagnostic
column: existing effectiveness/visibility fields and action-root rejection suffice.

## Action Reconciliation State Machine

States: `pending_local`, `local_complete`, `sync_pending`, `sync_failed`,
`accepted`, `rejected_compensating`, `reconciled`,
`reconciliation_incomplete`.

### Revision Encoding

Every expected, accepted, and canonical holding/account revision carried by a command,
RPC outcome, durable outcome, or recovery payload is a canonical unsigned integer
string: `"0"` or a positive no-leading-zero ASCII integer no greater than PostgreSQL
signed-bigint max `9223372036854775807`. It is never a JavaScript number. PostgreSQL
validates grammar and range before casting this boundary to its `bigint` revision
columns. Invalid/out-of-range input is rejected as `INVALID_REVISION`; an action that
would increment a maximum revision is rejected as `REVISION_EXHAUSTED`.

States live on the generic owner-scoped financial-action root; Metals holding/lifecycle
evidence and generic account effects link by the same action ID. Restart resumes durable
non-final state by action ID. Accepted/idempotent matches hash and revisions.

A stable server `stale` outcome records per-resource canonical evidence. Account
evidence is an array sorted by canonical account ID; one entry exists for every guarded
account. One Watermelon writer makes loser evidence/effects ineffective, restores the
canonical holding state when applicable, applies every required exact inverse account
effect in that order, and stamps `compensated_at`. Replay cannot compensate twice. A
server `rejected` outcome after local completion is not a stale
winner and is never locally effective: immediately lock financial actions and enter
`reconciliation_incomplete` while canonical evidence is fetched. Once evidence is
complete, the same writer performs exact-once compensation/restore; if no winner exists,
it atomically rolls back to the last verified projection. Missing or mismatched evidence
performs no partial repair and remains locked for retry. No optimistic financial effect
may remain effective indefinitely.

Stale evidence names guarded resources independently. `canonicalHoldingActionId` is
nullable and may identify only the holding CAS winner. Each canonical account entry
carries its account ID, revision, evidence hash, and nullable account CAS winner ID;
`staleAccountIds` names every mismatched account in canonical account-ID order.
Revision-zero migrated projections may have no action ID; a stale-causing resource at
revision greater than zero requires one, while an unaffected resource's winner ID
remains null. The writer verifies the complete owner-scoped holding projection
fingerprint and every guarded account balance/effect chain against those revisions and
hashes before changing local state.

For `ACCOUNT_REVISION_STALE` when holding revision matched, the server applied none of
the group and `canonicalHoldingActionId` is null. Reconciliation restores the exact
verified pre-action holding projection when applicable, makes all losing holding
evidence and account effects ineffective, and records one deterministic inverse for
each locally applied amount while installing or verifying every canonical account
balance/revision/effect chain in canonical account-ID order. It creates no holding
winner/replacement event, no second account delta, and no canonical revision increment.
Missing/mismatched evidence or an unrelated unverified local effect leaves the action in
`reconciliation_incomplete` with no partial repair.

`PAYLOAD_HASH_MISMATCH` is terminal for its action ID/hash pair: retain it as immutable
diagnostic/recovery evidence, do not retry it as the same action, and require a new ID
for later user intent. Rejected candidates never appear in History or analytics. UI shows
plain-language checking/retry and a one-time reconciled notice.
