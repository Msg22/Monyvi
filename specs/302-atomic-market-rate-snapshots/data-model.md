# Data Model: Atomic Market-Rate Snapshots

**Feature**: `302-atomic-market-rate-snapshots`  
**Date**: 2026-09-09  
**Revision**: Post-Analyze corrections

Issue #302 reuses the existing `market_rates` and `market_rate_observations` tables. No new durable table is required. The key change is to make the existing UUID relationship authoritative for new current-market snapshots while making exact observation decimals—not JavaScript wide-row numbers—the source of current financial truth.

## 1. Persisted Market-Rate Snapshot Root (`market_rates`)

### Purpose

Represents one immutable producer refresh event and provides the durable snapshot identity plus producer ordering/history compatibility.

### Identity

- `id: uuid` — persisted snapshot ID and primary key.

The service/wire contract carries this once as top-level `snapshotId`. `persist_market_rate_snapshot_v1` writes `snapshotId` into `market_rates.id`; the nested logical root payload does not carry a second independent ID.

### Existing attributes

- metal numeric columns such as `gold_usd_per_gram`, `silver_usd_per_gram`, `platinum_usd_per_gram`, `palladium_usd_per_gram`;
- fiat numeric columns such as `egp_usd`, `eur_usd`, etc., plus legacy `btc_usd` and no `usd_usd`;
- `timestamp_metal` and `timestamp_currency` provider timestamps;
- `created_at` producer capture/order timestamp;
- `updated_at` bookkeeping.

### Authority rules

1. PostgreSQL root numerics are validated exactly against the RPC's decimal-string payload before insert/replay acceptance.
2. `created_at` is immutable ordering metadata only, never freshness evidence.
3. Same-ID semantically conflicting root/observation content is rejected.
4. The wide root remains useful for historical/trend compatibility.
5. **After synchronization to WatermelonDB, wide numeric root fields are not authoritative current financial inputs.** They pass through JavaScript/SQLite numeric representation and may not preserve supplied decimal lexemes.

Current calculations therefore use the bound exact observation values described below.

## 2. Rate Observation (`market_rate_observations`)

### Purpose

Stores one exact current rate plus the exact trust evidence that certifies it inside a snapshot.

### Existing attributes

- `id: uuid`
- `batch_id: uuid`
- `instrument_code: text`
- `value_decimal: numeric` remotely / exact text in generated local model
- `unit: text`
- `orientation: text`
- `provider_observed_at: timestamptz | null`
- `source: text | null`
- `quality: text`
- `created_at: timestamptz` capture/order metadata

### New relationship for future writes

```text
market_rates.id 1 ─────── 37 market_rate_observations.batch_id
```

Migration relationship:

```sql
FOREIGN KEY (batch_id)
REFERENCES public.market_rates(id)
ON DELETE CASCADE
NOT VALID
```

`NOT VALID` enforces future inserted/updated rows without claiming that legacy evidence is already correctly bound.

### V1 trusted child-set invariant

A complete trusted current snapshot has exactly 37 observations: exactly one each for Gold, Silver, and all 35 product-supported fiat currencies.

#### Metals

| Instrument | Unit | Orientation | Producer source |
| --- | --- | --- | --- |
| `metal:GOLD` | `usd_per_pure_gram` | `quote_per_base` | `metals.dev` |
| `metal:SILVER` | `usd_per_pure_gram` | `quote_per_base` | `metals.dev` |

#### Currencies

For every code in `SUPPORTED_CURRENCIES`:

```text
currency:<CODE>
```

Producer form:

- unit: `usd_per_currency_unit`
- orientation: `quote_per_base`
- quality: `valid`
- source: non-empty trimmed `metals.dev`

For non-USD currencies, the exact canonical value corresponds to the existing `<code>_usd` root numeric. `currency:USD` is exact decimal `1` because the wide root has no `usd_usd` column. BTC is not in the 37-observation Metals current contract.

### Source rule

A **new trusted issue #302 producer snapshot** requires non-empty trimmed source identity for every required observation. Null, empty, and whitespace-only source make the envelope ineligible. This does not rewrite or retroactively invalidate generic historical rate-reference records that legitimately have Unknown source.

### Provider time rule

- Gold/Silver use the provider's metal timestamp.
- Fiat uses the provider's currency timestamp.
- null/missing/unparseable/future provider time is represented/classified as Unknown according to the existing rate-trust rules.
- capture/root/sync/receipt/restart time never substitutes for provider time.

## 3. Lossless Provider Value Object

### Purpose

Represents the Metals.Dev response after raw JSON text has been parsed without converting rate tokens through JavaScript binary `number`.

Conceptual shape:

```ts
interface LosslessMetalsDevRates {
  readonly metals: Readonly<Record<string, string>>;
  readonly currencies: Readonly<Record<string, string>>;
  readonly metalObservedAt: string | null;
  readonly currencyObservedAt: string | null;
}
```

Rate strings are canonical positive decimal text derived directly from lossless JSON numeric tokens. Zod validates the transformed exact-string object before any persistence request is constructed.

The implementation uses a pinned function-local lossless JSON dependency. Converting an authoritative provider rate to `number` before the RPC is forbidden.

## 4. Snapshot Envelope (wire/service value object)

### Purpose

The atomic remote unit returned by the pull RPC and validated before Watermelon writes.

### Shape

```ts
interface MarketRateSnapshotEnvelope {
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly root: MarketRateRootExact;
  readonly observations: readonly MarketRateObservationWireRow[];
}

interface MarketRateRootExact {
  readonly goldUsdPerGram: string;
  readonly silverUsdPerGram: string;
  readonly platinumUsdPerGram: string;
  readonly palladiumUsdPerGram: string;
  readonly fiatUsdPerUnit: Readonly<Record<string, string>>;
  readonly providerMetalObservedAt: string | null;
  readonly providerCurrencyObservedAt: string | null;
}
```

### Identity rule

`MarketRateSnapshotEnvelope.snapshotId` is the only wire snapshot identity. When persisted, it is `market_rates.id`; every observation's `batchId` must equal it.

There is deliberately no independent nested `root.id` field.

### Envelope validation

Before local persistence:

- `snapshotId` is a UUID;
- every observation has `batchId === snapshotId`;
- exactly 37 required observations exist;
- no duplicate/unexpected required instruments exist;
- exact values are positive canonical decimals;
- quality/unit/orientation/source satisfy the current snapshot rules;
- normalized exact observation values equal the corresponding exact root values / implicit USD identity;
- provider timestamps preserve null/parseability semantics;
- conflicting same-ID content is invalid.

Only after this exact validation may the adapter convert wide root fields to compatibility `number`s needed by the existing local `market_rates` model. Observation `value_decimal` remains exact text.

## 5. Selected Market Snapshot (derived local read model)

### Purpose

The single local source for **current** rate value + current trust evidence across every user-facing consumer.

### Persistence

Not stored as a new pointer/table. It is reconstructed from Watermelon root identity/order rows plus their bound exact observations.

### Proposed exported shape

```ts
interface SelectedMarketRateSnapshot {
  readonly snapshotId: string;
  readonly capturedAt: Date;
  readonly ratesByInstrument: ReadonlyMap<
    CurrentMarketInstrument,
    SelectedCurrentMarketRate
  >;
  readonly trust: LiveRatesTrustReadModel;
}

interface SelectedCurrentMarketRate {
  readonly instrumentCode: CurrentMarketInstrument;
  readonly valueDecimal: string;
  readonly normalizedUsdPerBaseDecimal: string;
  readonly unit: "usd_per_pure_gram" | "usd_per_currency_unit";
  readonly orientation: "quote_per_base";
  readonly providerObservedAt: Date | null;
  readonly source: string;
  readonly quality: "valid";
  readonly freshness: "fresh" | "stale" | "unknown";
}
```

The wide Watermelon `MarketRate` model is intentionally absent from the authoritative exported current-rate interface. A service may internally retain the root model for identity/order, but consumers do not receive its numeric rate columns as financial truth.

### Selection algorithm

1. Observe/cache root candidates ordered by `(created_at DESC, id DESC)`.
2. For each root, load only observations with `batch_id = root.id`.
3. Validate the exact 37-observation local contract, including source, units/orientations, value validity, and provider-time trust semantics.
4. Select the newest complete valid candidate.
5. If newer evidence is incomplete/invalid/duplicated/cross-batch, ignore it and keep the prior complete candidate.
6. If selected evidence later becomes incomplete/corrupt, that candidate becomes ineligible; never borrow another batch's rows to repair it.
7. If no complete candidate remains, selected current snapshot is `null`.

Exact root/value equivalence is proven before local write at the pull boundary; after restart, current financial values come solely from the exact cached observation set, so a compatibility wide-root numeric discrepancy cannot silently change a current valuation.

## 6. Exact Current Calculation Input

Current financial calculations and current displayed financial rates receive exact snapshot values, not `MarketRate` numbers.

Conceptual pure interface:

```ts
interface CurrentMarketSnapshotRates {
  readonly snapshotId: string;
  readonly getRateDecimal: (
    instrument: CurrentMarketInstrument
  ) => string | null;
}
```

`packages/logic/src/metals/current-market-snapshot.ts` provides Decimal-based helpers for:

- Gold/Silver USD-per-pure-gram lookup;
- currency USD-per-unit lookup;
- exact current currency conversion;
- exact current metal valuation/display input shaping.

No current valuation/conversion helper may reconstruct these values from Watermelon `MarketRate` numeric columns.

## 7. Historical Market Rate

Existing `market_rates` rows may remain available for explicitly historical/trend queries such as previous-day comparison. Those historical rows:

- are not current trust evidence;
- do not certify current source/quality/provider time;
- do not replace exact observation-based current valuation inputs.

## 8. Consumer Dependency

```text
WatermelonDB
  root identity/order + exact bound observations
                     │
                     ▼
market-rate-snapshot-read-model-service
                     │
                     ▼
        exact SelectedMarketRateSnapshot
        ┌────────────┼────────────┬─────────────┐
        ▼            ▼            ▼             ▼
   Live Rates    My Metals   Holding Detail  Home / Net Worth
```

Historical acquisition/terminal `metal_rate_references` remain a separate immutable domain and are never rewritten from the selected current snapshot.

## 9. Producer State Model

```text
Raw response text
       │
       ▼
Lossless JSON parse
       │
       ▼
Zod exact-string validation
       │
       ▼
EnvelopeBuilt(snapshotId, capturedAt, exact root, 37 observations)
       │
       ▼
RPC validation / transaction
       │
       ├── new + valid ─────────────► PersistedComplete(created)
       ├── same ID + same content ──► PersistedComplete(replayed)
       └── invalid/conflicting ──────► Rejected (no partial write)
```

There is no durable partial state for new producer writes.

## 10. Replay Semantics

### Identical replay

Same snapshot ID + semantically identical exact root/observation content:

- no duplicate root;
- no duplicate observation truth;
- no provider/source/value mutation;
- deterministic `replayed` result.

### Conflicting replay

Same snapshot ID + changed exact value, provider time, source, quality, unit/orientation, membership, or root mapping:

- reject the transaction;
- preserve the accepted snapshot;
- expose a deterministic reason code.

Bookkeeping fields are excluded from semantic comparison.

## 11. Legacy State

Legacy data may include root-only, child-only, partial, duplicate, source-less, or mismatched batches. None are newly certified by inference. They remain stored/historical as applicable but are ineligible for the issue #302 current selector unless they independently satisfy the complete provable binding contract.

## 12. Retention / Corruption Integrity

Issue #302 adds no retention duration.

Required integrity behavior:

- remote intentional root deletion cascades to bound observations;
- local snapshot deletion/removal must be root+children atomic if a cleanup path is introduced;
- missing required local evidence immediately makes that candidate ineligible;
- a partial surviving candidate is never repaired from another batch;
- if an earlier complete candidate remains, selection falls back to it;
- otherwise the current snapshot becomes unavailable.

## 13. Generated Schema Impact

The SQL migration adds constraints/indexes/RPCs but no table columns.

Expected generated effects:

- `packages/db/src/supabase-types.ts`: new RPC signatures;
- `packages/db/src/schema.ts`: no semantic table-column change expected;
- `packages/db/src/migrations.ts`: no Watermelon schema version bump expected.

Generated files must be produced through repository scripts and reviewed, not manually edited to match this expectation.