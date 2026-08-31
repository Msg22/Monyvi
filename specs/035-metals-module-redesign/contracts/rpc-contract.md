# RPC Contract

The generic financial-action CAS RPC accepts one authenticated action root plus its
domain evidence and executes one PostgreSQL transaction. Metals may use a typed adapter
such as `apply_metal_action_v1`, but it MUST NOT create a competing Metals-only account
outbox or account-effect protocol.

```ts
/**
 * `0` or a positive no-leading-zero ASCII integer whose numeric value is at most
 * PostgreSQL signed-bigint max `9223372036854775807`. RPC JSON never carries a
 * financial revision as a JavaScript number.
 */
type CanonicalUnsignedIntegerString = string;

interface AccountRevisionResult {
  accountId: string;
  revision: CanonicalUnsignedIntegerString;
}

interface CanonicalAccountEvidence {
  accountId: string;
  canonicalRevision: CanonicalUnsignedIntegerString;
  canonicalActionId: string | null;
  canonicalEvidenceHash: string;
}

interface StaleCanonicalEvidence {
  canonicalHoldingRevision: CanonicalUnsignedIntegerString;
  canonicalHoldingActionId: string | null;
  canonicalHoldingEvidenceHash: string;
  canonicalAccounts: readonly CanonicalAccountEvidence[];
  staleAccountIds: readonly string[];
}

type RpcOutcome =
  | { status: "accepted" | "idempotent"; actionId: string;
      holdingRevision: CanonicalUnsignedIntegerString;
      accountRevisions: readonly AccountRevisionResult[];
      effectiveEventId: string; serverAcceptedAt: string }
  | (StaleCanonicalEvidence & {
      status: "stale"; actionId: string;
      code: "HOLDING_REVISION_STALE" | "ACCOUNT_REVISION_STALE";
    })
  | { status: "rejected"; actionId: string;
      code: "PAYLOAD_HASH_MISMATCH" | "NOT_OWNED" | "INVALID_LINK" |
      "INVALID_STATE" | "ACCOUNT_INELIGIBLE" | "INCOMPLETE_GROUP" |
      "INVALID_REVISION" | "REVISION_EXHAUSTED" };
```

The request is the canonical command plus complete evidence and schema version. Every
expected, accepted, and canonical holding/account revision is a
`CanonicalUnsignedIntegerString`: `"0"` or a positive no-leading-zero ASCII integer no
greater than `9223372036854775807`. The RPC returns `INVALID_REVISION` for numeric JSON
values, signs, exponent form, leading zeroes, or values outside that range. It returns
`REVISION_EXHAUSTED` rather than overflowing when an otherwise-valid accepted action
would increment a revision already at the maximum. Server derives owner from
`auth.uid()`. Account guards are unique by account ID and canonically sorted by
ascending canonical account ID using ASCII code-unit order. Server locks replay, then
the holding when applicable, then every guarded account in that same order; returns
the stored outcome for same ID/hash; rejects hash mismatch; validates ownership,
links, state, currency, group completeness, and every revision; then updates holding,
every direct account balance/revision, immutable evidence, generic account effects,
and stored outcome atomically. Issue #242 must also protect
balance/revision from generic sync, reject legacy protected-field writes, and route the
root through dedicated action sync. Failure rolls back everything and never advances
sync metadata.

Every account effect has exactly one guard for the same account and every guard has an
effect. A transfer therefore guards both source and destination accounts, while a
credited Metals action has exactly one account guard and an uncredited Metals action
has none. Accepted/idempotent `accountRevisions`, stale `canonicalAccounts`, and
`staleAccountIds` use the same canonical ordering; duplicate or missing account entries
are `INCOMPLETE_GROUP`.

`stale` is a stable server-winner outcome. `rejected` is a durable non-success
outcome, including validation and incomplete-group rejection; it does not authorize a
client to retain its optimistic local projection/effect. After locally complete work
receives either non-accepted outcome, the client must lock financial actions, fetch
canonical evidence, and finish exact-once compensation/restore or an atomic safe
rollback before reporting resumes. `PAYLOAD_HASH_MISMATCH` is terminal for that action
ID/hash pair and MUST NOT be submitted again as a retry; any subsequent user action
uses a new ID after recovery.

Canonical stale evidence is resource-specific. `canonicalHoldingActionId` identifies
only an action that won the holding-revision race. Each `canonicalAccounts` entry
identifies one guarded account and its account-revision winner only. An action ID is
nullable for a revision-zero migrated projection that has no fabricated action, and an
unaffected resource's winner ID is null. A resource whose revision caused the stale
result requires its matching action ID when that canonical revision is greater than
zero. Each evidence hash is SHA-256 over the same
stable canonical serialization used by command/replay hashing. The holding evidence
hash binds owner, holding, revision, status/visibility, effective action/event, and
immutable event/payload fingerprints. Each account evidence hash binds owner, account,
currency, balance minor units, revision, and accepted action/effect chain. The account
arrays are empty when no account guard exists. The reconciler must fetch evidence
matching every carried revision and hash before writing recovery.

Stable validation order checks the holding first when present, then accounts in
canonical account-ID order. That order chooses the single stale `code`; all guarded
canonical evidence remains present, and `staleAccountIds` names every mismatched
account in canonical order. The code never erases another resource's evidence.

`ACCOUNT_REVISION_STALE` with a matching holding revision is account-only stale. The
server transaction changed no resource, `canonicalHoldingActionId` MUST be null,
and `canonicalHoldingRevision` MUST equal the request's expected holding revision. The
holding hash still identifies the exact verified pre-action projection to restore; it
does not imply a holding winner. A Metals result has one canonical account entry; a
generic transfer result may have two. Recovery atomically makes the losing local
holding evidence ineffective when applicable, restores that verified holding
projection, makes every losing account effect ineffective, records each deterministic
exact inverse when it had been applied, and installs or verifies every canonical
account balance/revision/effect chain in canonical account-ID order.
Recovery does not create a replacement holding event, apply a second independent
account delta, or increment any canonical revision. Missing, mismatched, or
interleaved unverified evidence writes nothing and remains locked for retry.
