# Command Contract

All commands are validated objects created before the Watermelon writer. IDs, clock,
and hashing are injected. Each command persists through the generic owner-scoped
financial-action root/outbox; the envelope below is Metals domain evidence linked by
the same `actionId`, not a second Metals-only account outbox.

```ts
interface CommandEnvelope<TKind extends string, TPayload> {
  actionId: string; kind: TKind; userId: string; holdingId: string;
  expectedHoldingRevision: number | null;
  accountGuard: { accountId: string; expectedRevision: number } | null;
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


## Internal Reconciliation Compensation

`compensate` is not part of the client-submittable `MetalCommand` union. Only the
reconciliation service may construct it after validating a signed/owned RPC stale
outcome against the durable losing action.

```ts
interface InternalCompensationEnvelope {
  actionId: string;
  kind: "compensate";
  userId: string;
  holdingId: string;
  source: "server_stale_outcome";
  payload: {
    losingActionId: string;
    losingPayloadHash: string;
    canonicalActionId: string;
    canonicalHoldingRevision: number;
    canonicalAccountRevision: number | null;
    canonicalEvidenceHash: string;
    inverseAccountEffectId: string | null;
    inverseAmountMinorUnits: string | null;
  };
  payloadHash: string;
}
```

The compensation action ID is deterministically derived from owner, losing action ID,
and canonical action/revision. Its hash uses the same canonical serialization rules.
A unique losing-action compensation key plus `compensated_at` makes replay/restart a
no-op after success; same ID with another hash is a recovery error.

One dedicated reconciliation writer boundary atomically marks losing Metals evidence
ineffective, restores the canonical holding projection, applies the exact inverse
generic account effect when present, records the internal envelope against the generic
root, and marks the losing action
reconciled. Missing or mismatched canonical evidence writes nothing and enters
`reconciliation_incomplete`. UI/form code, public command factories, and the RPC reject
client-supplied `kind: "compensate"`.
