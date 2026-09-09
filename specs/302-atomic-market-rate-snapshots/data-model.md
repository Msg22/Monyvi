# Data Model: Atomic Market-Rate Snapshots

**Feature**: `302-atomic-market-rate-snapshots`  
**Date**: 2026-09-09

The feature reuses the existing `market_rates` and `market_rate_observations` tables. No new durable table is required. The primary change is to make the existing UUID relationship authoritative for new current-market snapshots and to define a deterministic local selected-snapshot read model.

## 1. Market-Rate Snapshot (existing `market_rates` root)

### Purpose

Represents one immutable producer refresh event containing the wide set of market values currently stored by Monyvi.

### Authoritative identity

- `id: uuid` — immutable snapshot ID and root primary key.

### Relevant existing attributes

- metal values such as `gold_usd_per_gram`, `silver_usd_per_gram`, `platinum_usd_per_gram`, `palladium_usd_per_gram`;
- fiat values such as `egp_usd`, `eur_usd`, etc., including existing `btc_usd` but no `usd_usd` column;
- `timestamp_metal` — provider's metal observation timestamp;
- `timestamp_currency` — provider's currency observation timestamp;
- `created_at` — immutable producer capture/order timestamp for this snapshot;
- `updated_at` — database bookkeeping only, not financial freshness evidence.

### New invariants

1. For a **new trusted V1 snapshot**, the root ID is also the observation batch ID.
2. Root values are immutable for a given ID. Same-ID replay with semantically different content is a conflict.
3. `created_at` is selection ordering metadata only. It MUST NOT be used to classify financial freshness.
4. The existing broad row shape is preserved; issue #302 does not remove platinum/palladium/BTC columns or expand those fields into supported UI scope.

## 2. Rate Observation (existing `market_rate_observations` child)

### Purpose

Stores the exact trust evidence for one current rate input inside a snapshot.

### Existing attributes

- `id: uuid` — observation row identity;
- `batch_id: uuid` — snapshot/root identity;
- `instrument_code: text` — canonical instrument key;
- `value_decimal: numeric` — exact observed rate value;
- `unit: text`;
- `orientation: text`;
- `provider_observed_at: timestamptz | null`;
- `source: text | null`;
- `quality: text`;
- `created_at: timestamptz` — capture/order metadata used as local `capturedAt`, not provider freshness.

### Relationship

For new data:

```text
market_rates.id 1 ─────── 37 market_rate_observations.batch_id
```

Migration-level relationship:

```sql
FOREIGN KEY (batch_id)
REFERENCES public.market_rates(id)
ON DELETE CASCADE
NOT VALID
```

`NOT VALID` is a cutover mechanism: it enforces the relationship for future inserted/updated rows without asserting that all legacy rows are already provably bound.

### New V1 child-set invariant

A complete trusted snapshot contains **exactly 37** observations: exactly one for each required instrument.

#### Required metals

| Instrument | Unit | Orientation | Root value |
| --- | --- | --- | --- |
| `metal:GOLD` | `usd_per_pure_gram` | `quote_per_base` | `gold_usd_per_gram` |
| `metal:SILVER` | `usd_per_pure_gram` | `quote_per_base` | `silver_usd_per_gram` |

#### Required currencies

For every code in the product's 35-currency `SUPPORTED_CURRENCIES` list:

```text
currency:<CODE>
```

Producer representation:

- unit: `usd_per_currency_unit`
- orientation: `quote_per_base`
- quality: `valid`

For non-USD currencies, the canonical value equals the corresponding existing `<lowercase_code>_usd` root column. For USD, canonical value is exact `1` because the wide root has no `usd_usd` column.

BTC is not in `SUPPORTED_CURRENCIES` for this Metals trust contract and therefore does not count toward the 37 observations, even though the wide root stores `btc_usd`.

### Provider time invariant

- Metal observations use the provider's metal timestamp.
- Currency observations use the provider's currency timestamp.
- `provider_observed_at = null` is allowed only as explicit Unknown freshness evidence.
- `created_at`, root `created_at`, sync time, receipt time, and restart time can never substitute for `provider_observed_at`.

## 3. Snapshot Envelope (wire/service value object)

### Purpose

The atomic unit returned by the new pull RPC and written to WatermelonDB.

### Shape

```ts
interface MarketRateSnapshotEnvelope {
  readonly snapshotId: string;
  readonly root: MarketRateWireRow;
  readonly observations: readonly MarketRateObservationWireRow[];
}
```

### Validation rules

- `snapshotId === root.id`;
- every observation has `batchId === snapshotId`;
- exactly 37 required observations;
- no duplicate or unexpected current instruments;
- exact values are valid positive decimals;
- units/orientations/quality satisfy existing rate-reference rules;
- normalized observation value equals the corresponding root value/implicit USD identity;
- root/provider timestamps follow the approved null/parseability rules;
- conflicting duplicate content under the same `snapshotId` is invalid.

A wire envelope that fails any validation is not locally persisted/promoted as trusted current data.

## 4. Selected Market Snapshot (derived local read model)

### Purpose

The single local source for **current** market value plus current trust evidence across all user-facing consumers.

### Persistence

Not stored as a new table. It is deterministically derived from WatermelonDB root/child rows so it reconstructs after app restart and while offline.

### Proposed TypeScript shape

```ts
interface SelectedMarketRateSnapshot {
  readonly snapshotId: string;
  readonly marketRate: MarketRate;
  readonly observationsByInstrument: ReadonlyMap<
    CurrentMarketInstrument,
    CurrentMarketObservation
  >;
  readonly trust: LiveRatesTrustReadModel;
  readonly capturedAt: Date;
}
```

`trust` is derived only from the observations inside `snapshotId`; it must not run an independent newest-observation query.

### Selection algorithm

1. Observe/cache root candidates ordered by `(created_at DESC, id DESC)`.
2. For each candidate, load only observations where `batch_id = root.id`.
3. Validate the complete 37-observation envelope and root/value equivalence.
4. Select the first complete valid candidate.
5. If a newer candidate is partial/invalid/conflicting/legacy-unbound, ignore it and keep the prior valid candidate.
6. If none is valid, current snapshot is `null` and rate-dependent outputs fail closed.

### Selection state transitions

```text
No Complete Snapshot
        │
        │ complete valid envelope arrives
        ▼
Selected(snapshot A)
        │
        ├── incomplete/invalid B arrives ──► remain A
        ├── identical A replay ────────────► remain A
        ├── older complete Z arrives ──────► remain A
        └── newer complete valid B arrives ► Selected(snapshot B)
```

A selected snapshot is never repaired by borrowing child observations from another batch.

## 5. Historical Market Rate

### Purpose

Existing wide `market_rates` rows may still be used for historical/trend comparisons such as previous-day rates.

### Constraint

Historical trend rows are **not** current trust evidence. A legacy historical row may remain usable for an existing historical comparison without being certified as an atomic current snapshot.

This preserves backward-compatible trend behavior while enforcing strict atomicity at the current-value/trust boundary.

## 6. Current Consumer Dependency

All current-rate user-facing consumers must depend on `SelectedMarketRateSnapshot` (directly or through a hook/service adapter):

```text
WatermelonDB
  market_rates + market_rate_observations
             │
             ▼
market-rate-snapshot-read-model-service
             │
    ┌────────┼─────────┬─────────────┐
    ▼        ▼         ▼             ▼
Live Rates  My Metals Holding Detail Home / Net Worth
```

Historical acquisition/terminal `metal_rate_references` are a separate immutable domain and are never overwritten or replaced by this selected current snapshot.

## 7. Producer State Model

A fetched provider response moves through these logical states inside one request:

```text
Fetched
  │
  ▼
ProviderValidated
  │
  ▼
EnvelopeBuilt(snapshotId, capturedAt, root, 37 observations)
  │
  ▼
RPCValidated
  │
  ├── new + valid ─────────────► PersistedComplete(created)
  ├── same ID + same content ──► PersistedComplete(replayed)
  └── invalid/conflicting ──────► Rejected (no partial write)
```

There is no durable `partial` producer state for new writes because root and children are committed in one database transaction.

## 8. Replay Semantics

### Identical replay

Same `snapshotId` + semantically identical immutable root/observation content:

- no new root;
- no new observation set;
- no update to immutable values/provider timestamps;
- deterministic `replayed` result.

### Conflicting replay

Same `snapshotId` + any different immutable value, provider timestamp, source, quality, unit/orientation, required instrument membership, or root mapping:

- reject transaction;
- leave existing snapshot unchanged;
- emit deterministic conflict reason for observability.

Database bookkeeping fields that are not semantic market truth are excluded from the content comparison.

## 9. Legacy State

Legacy data can exist in one of these states:

- root without matching batch observations;
- observations whose `batch_id` has no root;
- partial batch;
- duplicate instrument rows within a batch;
- value/evidence mismatch.

All are classified as **Legacy Untrusted/Incomplete** for the new current selector. No migration rewrites them into a trusted snapshot by inference.

## 10. Retention Integrity

Issue #302 does not add a retention duration. Integrity rules for any deletion are:

- server root deletion cascades to its observations;
- local deletion/pruning, if present, must remove root + bound observations in one writer;
- the last complete locally selected snapshot cannot be removed unless a complete replacement is already available;
- a surviving partial snapshot is never combined with another batch after retention.

## 11. Generated Schema Impact

The planned SQL migration adds constraints, indexes, and RPCs but no new table columns. Expected generated effects:

- `packages/db/src/supabase-types.ts`: new RPC signatures;
- `packages/db/src/schema.ts`: no semantic table-column change expected;
- `packages/db/src/migrations.ts`: no Watermelon schema version bump expected.

The implementation must still run the repository's schema/type generation workflow and commit exactly what it produces rather than editing generated files manually.