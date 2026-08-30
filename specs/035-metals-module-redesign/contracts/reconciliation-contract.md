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

States live on the generic owner-scoped financial-action root; Metals holding/lifecycle
evidence and generic account effects link by the same action ID. Restart resumes durable
non-final state by action ID. Accepted/idempotent matches hash
and revisions. Stale records canonical evidence, then one Watermelon writer makes the
loser ineffective, restores canonical holding state, applies one exact inverse account
effect when needed, and stamps `compensated_at`. Replay cannot compensate twice.
Missing canonical evidence performs no partial repair: lock financial actions, enter
`reconciliation_incomplete`, and retry canonical fetch/RPC. Rejected candidates never
appear in History or analytics. UI shows plain-language checking/retry and a one-time
reconciled notice.
