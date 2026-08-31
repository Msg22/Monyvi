# RPC Contract

The generic financial-action CAS RPC accepts one authenticated action root plus its
domain evidence and executes one PostgreSQL transaction. Metals may use a typed adapter
such as `apply_metal_action_v1`, but it MUST NOT create a competing Metals-only account
outbox or account-effect protocol.

```ts
/**
 * `0` or a non-zero ASCII digit followed by ASCII digits, maximum 50 digits.
 * RPC JSON never carries a financial revision as a JavaScript number.
 */
type CanonicalUnsignedIntegerString = string;

interface StaleCanonicalEvidence {
  canonicalHoldingRevision: CanonicalUnsignedIntegerString;
  canonicalHoldingActionId: string | null;
  canonicalHoldingEvidenceHash: string;
  canonicalAccountRevision: CanonicalUnsignedIntegerString | null;
  canonicalAccountActionId: string | null;
  canonicalAccountEvidenceHash: string | null;
}

type RpcOutcome =
  | { status: "accepted" | "idempotent"; actionId: string;
      holdingRevision: CanonicalUnsignedIntegerString;
      accountRevision: CanonicalUnsignedIntegerString | null;
      effectiveEventId: string; serverAcceptedAt: string }
  | (StaleCanonicalEvidence & {
      status: "stale"; actionId: string;
      code: "HOLDING_REVISION_STALE" | "ACCOUNT_REVISION_STALE";
    })
  | { status: "rejected"; actionId: string;
      code: "PAYLOAD_HASH_MISMATCH" | "NOT_OWNED" | "INVALID_LINK" |
      "INVALID_STATE" | "ACCOUNT_INELIGIBLE" | "INCOMPLETE_GROUP" };
```

The request is the canonical command plus complete evidence and schema version. Every
expected, accepted, and canonical holding/account revision is a
`CanonicalUnsignedIntegerString`: `"0"` or a non-zero ASCII digit followed by ASCII
digits, at most 50 digits. The RPC rejects numeric JSON values, signs, exponent form,
and leading zeroes; PostgreSQL then validates/casts the string to its `bigint` column.
Server derives owner from `auth.uid()`. It locks replay, holding, and optional account
rows in stable ID order; returns stored outcome for same ID/hash; rejects hash
mismatch; validates ownership, links, state, currency, completeness, and revisions;
then updates holding, optional direct account balance/revision, immutable evidence,
generic account effect, and stored outcome atomically. Issue #242 must also protect
balance/revision from generic sync, reject legacy protected-field writes, and route the
root through dedicated action sync. Failure rolls back everything and never advances
sync metadata.

`stale` is a stable server-winner outcome. `rejected` is a durable non-success
outcome, including validation and incomplete-group rejection; it does not authorize a
client to retain its optimistic local projection/effect. After locally complete work
receives either non-accepted outcome, the client must lock financial actions, fetch
canonical evidence, and finish exact-once compensation/restore or an atomic safe
rollback before reporting resumes. `PAYLOAD_HASH_MISMATCH` is terminal for that action
ID/hash pair and MUST NOT be submitted again as a retry; any subsequent user action
uses a new ID after recovery.

Canonical stale evidence is resource-specific. `canonicalHoldingActionId` identifies
only an action that won the holding-revision race;
`canonicalAccountActionId` identifies only an action that won the guarded
account-revision race. Either is nullable for a revision-zero migrated projection that
has no fabricated action, and the unaffected resource's winner ID is null. A resource
whose revision caused the stale result requires its matching action ID when that
canonical revision is greater than zero. Each evidence hash is SHA-256 over the same
stable canonical serialization used by command/replay hashing. The holding evidence
hash binds owner, holding, revision, status/visibility, effective action/event, and
immutable event/payload fingerprints. When an account guard exists, the account
evidence hash binds owner, account, currency, balance minor units, revision, and
accepted action/effect chain; all three account canonical fields are null when no
account guard exists. The reconciler must fetch evidence matching every carried
revision and hash before writing recovery.

When both guarded revisions are stale, stable server lock/validation order chooses the
single `code`, but both stale-causing resource IDs and both canonical evidence sets are
present. The code never erases the other resource's evidence.

`ACCOUNT_REVISION_STALE` with a matching holding revision is account-only stale. The
server transaction changed neither resource, `canonicalHoldingActionId` MUST be null,
and `canonicalHoldingRevision` MUST equal the request's expected holding revision. The
holding hash still identifies the exact verified pre-action projection to restore; it
does not imply a holding winner. Recovery atomically makes the losing local holding
evidence ineffective, restores that verified holding projection, makes the losing
account effect ineffective, records its deterministic exact inverse when it had been
applied, and installs or verifies the canonical account balance/revision/effect chain.
Recovery does not create a replacement holding event, apply a second independent
account delta, or increment either canonical revision. Missing, mismatched, or
interleaved unverified evidence writes nothing and remains locked for retry.
