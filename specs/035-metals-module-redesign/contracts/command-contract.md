# Command Contract

All commands are validated objects created before the Watermelon writer. IDs, clock,
and hashing are injected. Each command persists through the generic owner-scoped
financial-action root/outbox; the envelope below is Metals domain evidence linked by
the same `actionId`, not a second Metals-only account outbox.

```ts
/**
 * `0` or a non-zero ASCII digit followed by ASCII digits, maximum 50 digits.
 * All command, RPC, stored-outcome, and recovery boundaries carry this as a
 * string; it is never a JavaScript number.
 */
type CanonicalUnsignedIntegerString = string;

interface CommandEnvelope<TKind extends string, TPayload> {
  actionId: string; kind: TKind; userId: string; holdingId: string;
  expectedHoldingRevision: CanonicalUnsignedIntegerString | null;
  accountGuard: {
    accountId: string;
    expectedRevision: CanonicalUnsignedIntegerString;
  } | null;
  occurredAt: number; payload: TPayload; payloadHash: string;
}
type MetalCommand =
  | CommandEnvelope<"add", AddPayload>
  | CommandEnvelope<"correct", CorrectPayload>
  | CommandEnvelope<"sell", SellPayload>
  | CommandEnvelope<"dispose", DisposePayload>
  | CommandEnvelope<"delete", DeletePayload>
  | CommandEnvelope<"undo", UndoPayload>;
```

The generic root owns owner, domain/type, payload hash, durable state/outcome, optional
account guard, and replay identity. Metals evidence owns holding target, expected holding
revision, lifecycle/rate facts, and presentation/reporting links.

Canonical payload uses stable key ordering, UTF-8, canonical decimals, and no exponent
form. Hash covers schema version, kind, owner, holding, revisions, account guard,
event time, and payload. Same ID must reuse the exact hash. Name/notes-only edits use
the metadata contract. Sell is whole-holding; account guard is required iff same-
currency account credit is enabled. Dispose requires a category and creates no sale
P/L. Undo references the effective event/action and account effect. Ownership is
validated before and inside the local writer and RPC. `local_complete` means the
complete local projection/evidence/effect committed in one transaction.


## Internal Reconciliation Recovery

`compensate` and `rollback` are not part of client-submittable `MetalCommand`.
Only reconciliation may construct either after it validates a durable, owned RPC
outcome against the local action ID and payload hash. Stable `stale` identifies a
server winner; server `rejected` identifies a validation, ownership, link, state,
account-eligibility, or incomplete-group failure. Neither is a locally successful
financial action.

```ts
interface InternalRecoveryEnvelope {
  actionId: string;
  kind: "compensate" | "rollback";
  userId: string;
  holdingId: string;
  source: "server_stale_outcome" | "server_rejected_outcome";
  payload: {
    losingActionId: string;
    losingPayloadHash: string;
    canonicalHoldingActionId: string | null;
    canonicalAccountActionId: string | null;
    canonicalHoldingRevision: CanonicalUnsignedIntegerString | null;
    canonicalAccountRevision: CanonicalUnsignedIntegerString | null;
    canonicalHoldingEvidenceHash: string | null;
    canonicalAccountEvidenceHash: string | null;
    inverseAccountEffectId: string | null;
    inverseAmountMinorUnits: string | null;
  };
  payloadHash: string;
}
```

All expected and canonical holding/account revisions use
`CanonicalUnsignedIntegerString`: `"0"` or a non-zero ASCII digit followed by ASCII
digits, at most 50 digits, never a JavaScript number. PostgreSQL validates and casts
that wire/storage boundary to its `bigint` revision columns.

The recovery action ID is deterministically derived from owner, losing action ID,
outcome kind, both resource revisions, and both resource winner IDs when present. Its
hash uses the same canonical serialization rules. A unique losing-action recovery key
plus `compensated_at` makes restart/replay a no-op after success; same ID with another
hash is a recovery error. For a stale outcome, holding revision/hash are required;
account revision/hash are required iff the command had an account guard. A
stale-causing resource at revision greater than zero requires its matching action ID;
the unaffected resource's winner ID remains null. Rejected recovery may keep these
fields null only until verified prior/canonical evidence is fetched.

After any server `rejected` outcome for a locally complete action, reconciliation
immediately marks the action recovery-visible but locks financial actions in
`reconciliation_incomplete` while it fetches canonical evidence. It then uses one
writer to either: atomically make local rejected evidence/effects ineffective and
restore the authoritative projection with an exact inverse effect; or perform an
atomic safe rollback to the last verified projection when no winner exists. Missing
or mismatched evidence writes no partial repair and remains locked for retry. No
optimistic ownership, reporting, or account effect may remain effective indefinitely.
`PAYLOAD_HASH_MISMATCH` is never retried as the same action: its immutable action ID
and hash remain diagnostic evidence; a later user intent must use a new action ID.

For stale outcomes, one dedicated reconciliation writer atomically marks losing Metals
evidence ineffective, restores the canonical holding projection, applies the exact
inverse generic account effect when present, records recovery against the generic
root, and marks the losing action reconciled. UI/form code, public command factories,
and the RPC reject client-supplied `kind: "compensate"` or `kind: "rollback"`.

For account-only stale, `canonicalHoldingActionId` is null even when the verified
pre-action holding projection records an older effective action. The writer restores
that projection by its holding revision/hash and creates no holding winner or
replacement event. It marks the losing account effect ineffective and records an
inverse amount equal to the arithmetic negation of that immutable effect only when the
effect was locally applied. The resulting account projection is the verified canonical
balance/revision/effect chain; compensation evidence does not apply another delta or
advance the canonical revision. Any unrelated unverified local account effect keeps
reconciliation locked rather than being overwritten.
