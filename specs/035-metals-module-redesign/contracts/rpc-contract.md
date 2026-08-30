# RPC Contract

The generic financial-action CAS RPC accepts one authenticated action root plus its
domain evidence and executes one PostgreSQL transaction. Metals may use a typed adapter
such as `apply_metal_action_v1`, but it MUST NOT create a competing Metals-only account
outbox or account-effect protocol.

```ts
type RpcOutcome =
  | { status: "accepted" | "idempotent"; actionId: string;
      holdingRevision: number; accountRevision: number | null;
      effectiveEventId: string; serverAcceptedAt: string }
  | { status: "stale"; actionId: string;
      code: "HOLDING_REVISION_STALE" | "ACCOUNT_REVISION_STALE";
      holdingRevision: number; accountRevision: number | null;
      canonicalActionId: string }
  | { status: "rejected"; actionId: string;
      code: "PAYLOAD_HASH_MISMATCH" | "NOT_OWNED" | "INVALID_LINK" |
      "INVALID_STATE" | "ACCOUNT_INELIGIBLE" | "INCOMPLETE_GROUP" };
```

The request is the canonical command plus complete evidence and schema version.
Server derives owner from `auth.uid()`. It locks replay, holding, and optional account
rows in stable ID order; returns stored outcome for same ID/hash; rejects hash
mismatch; validates ownership, links, state, currency, completeness, and revisions;
then updates holding, optional direct account balance/revision, immutable evidence,
generic account effect, and stored outcome atomically. Issue #242 must also protect
balance/revision from generic sync, reject legacy protected-field writes, and route the
root through dedicated action sync. Failure
rolls back everything and never advances sync metadata.
