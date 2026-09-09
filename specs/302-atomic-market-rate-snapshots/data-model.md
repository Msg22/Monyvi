# Data Model: Atomic Market-Rate Snapshots

**Feature**: `302-atomic-market-rate-snapshots`  
**Date**: 2026-09-09  
**Revision**: Post-second-Analyze remediation

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

1. Migration 069 removes the legacy `numeric(15,4)` scale caps from root rate columns so PostgreSQL can retain the RPC's exact plain-decimal values; insert/replay acceptance validates those values exactly.
2. `created_at` is immutable ordering metadata only, never freshness evidence.
3. Same-ID semantically conflicting root/observation content is rejected.
4. The wide root remains useful for historical/trend compatibility.
5. After synchronization to WatermelonDB, wide numeric root fields are not authoritative current financial inputs.

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

A new trusted issue #302 producer snapshot requires non-empty trimmed source identity for every required observation. Null, empty, and whitespace-only source make the envelope ineligible. This does not rewrite or retroactively invalidate generic historical records that legitimately have Unknown source.

### Provider time rule

- Gold/Silver use the provider's metal timestamp.
- Fiat uses the provider's currency timestamp.
- valid, parseable, non-future provider timestamp -> preserve it;
- missing, malformed, or future provider timestamp -> persist `null`;
- `null` yields Unknown freshness;
- the immutable request capture timestamp may be used only to detect that a provider timestamp is in the future; it is never stored as a replacement observation time;
- root creation, sync, receipt, and restart time never substitute for provider time.

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

### Numeric normalization

Provider JSON numbers may be ordinary decimals or scientific notation. The provider adapter converts every positive rate token to plain base-10 decimal text by manipulating the coefficient digits and decimal exponent directly.

Examples:

```text
0.10000000000000001 -> 0.10000000000000001
3.73874e-10         -> 0.000000000373874
1.2300e+2           -> 123.00
```

Rules:

- no `Number(...)`, `parseFloat`, `response.json()`, or other binary-float intermediate on the authoritative path;
- no rounding;
- all coefficient digits are retained;
- scientific notation is not persisted past this boundary;
- resulting values satisfy the plain positive decimal contract used by Zod/OpenAPI/RPC.

### Timestamp normalization

Raw provider timestamps are normalized before the envelope is built:

- valid non-future -> ISO/provider observation value;
- missing/malformed/future -> `null`.

The request capture/order instant is the future-time comparison ceiling only, not a substitute freshness source.

The implementation uses a pinned function-local lossless JSON dependency. Zod validates the transformed exact-string/timestamp-normalized object before any persistence request is constructed.

## 4. Snapshot Envelope (wire/service value object)

### Purpose

The atomic remote unit returned by the pull RPC and validated before Watermelon writes.

### Shape

```ts
interface MarketRateSnapshotEnvelope {
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly root: MarketRateRootExact;
  readonly observations: readonly PersistedMarketRateObservation[];
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

interface PersistedMarketRateObservation {
  readonly id: string;
  readonly batchId: string;
  readonly capturedAt: string;
  readonly instrumentCode: string;
  readonly valueDecimal: string;
  readonly unit: string;
  readonly orientation: string;
  readonly providerObservedAt: string | null;
  readonly source: string;
  readonly quality: "valid";
}
```

### Identity rule

`MarketRateSnapshotEnvelope.snapshotId` is the only wire snapshot identity. When persisted, it is `market_rates.id`; every observation's `batchId` must equal it. There is no independent nested `root.id`.

### Closed-object schema rule

`PersistedMarketRateObservation` is modeled explicitly as one closed wire object. The OpenAPI contract must not compose it by extending a closed `RateObservationInput` with `allOf`, because the base object's `additionalProperties: false` would reject persisted-only fields such as `id`, `batchId`, and `capturedAt`.

### Envelope validation

Before local persistence:

- `snapshotId` is a UUID;
- every observation has `batchId === snapshotId`;
- exactly 37 required observations exist;
- no duplicate/unexpected required instruments exist;
- exact values are positive plain decimals;
- quality/unit/orientation/source satisfy current snapshot rules;
- normalized exact observation values equal corresponding exact root values / implicit USD identity;
- provider timestamps are valid or null Unknown values;
- conflicting same-ID content is invalid.

Only after this exact validation may the adapter convert wide root fields to compatibility `number`s needed by the existing local `market_rates` model. Observation `value_decimal` remains exact text.

## 5. Selected Market Snapshot (derived local read model)

### Purpose

The single local source for current rate value + current trust evidence across every user-facing consumer.

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

The wide Watermelon `MarketRate` model is intentionally absent from the authoritative exported current-rate interface.

### Selection algorithm

1. Observe/cache root candidates ordered by `(created_at DESC, id DESC)`.
2. For each root, load only observations with `batch_id = root.id`.
3. Validate the exact 37-observation local contract, including source, units/orientations, value validity, and provider-time trust semantics.
4. Select the newest complete valid candidate.
5. If newer evidence is incomplete/invalid/duplicated/cross-batch, ignore it and keep the prior complete candidate.
6. If selected evidence later becomes incomplete/corrupt, that candidate becomes ineligible; never borrow another batch's rows to repair it.
7. If no complete candidate remains, selected current snapshot is `null`.

Exact root/value equivalence is proven before local write at the pull boundary; after restart, current financial values come solely from the exact cached observation set.

## 6. Exact Current Calculation Input

Current financial calculations and current displayed financial rates receive exact snapshot values, not `MarketRate` numbers.

```ts
interface CurrentMarketSnapshotRates {
  readonly snapshotId: string;
  readonly getRateDecimal: (
    instrument: CurrentMarketInstrument
  ) => string | null;
}
```

`packages/logic/src/metals/current-market-snapshot.ts` provides Decimal-based helpers for Gold/Silver lookup, currency USD-per-unit lookup, exact current currency conversion, and current metal valuation/display input shaping.

## 7. Historical Market Rate

Existing `market_rates` rows may remain available for explicitly historical/trend queries such as previous-day comparison. Those rows are not current trust evidence and do not replace exact observation-based current valuation inputs.

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

Historical acquisition/terminal `metal_rate_references` remain a separate immutable domain.

## 9. Producer State Model

```text
Raw response text
       │
       ▼
Lossless JSON parse
       │
       ▼
Exact exponent -> plain decimal normalization
       │
       ▼
Provider timestamp normalization to valid/null
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

Same snapshot ID + semantically identical exact root/observation content is idempotent. Same ID + changed value/provider time/source/quality/unit/orientation/membership/root mapping is rejected without mutating the accepted snapshot.

## 11. Legacy State

Legacy data may include root-only, child-only, partial, duplicate, source-less, or mismatched batches. None are newly certified by inference.

## 12. Retention / Corruption Integrity

Issue #302 adds no retention duration. Remote root deletion cascades bound observations. Missing required local evidence makes a candidate ineligible immediately. A partial surviving candidate is never repaired from another batch. Selection falls back to an earlier complete candidate or becomes unavailable.

## 13. Edge Handler Verification Boundary

The HTTP handler is extracted into:

```text
supabase/functions/fetch-metal-rates/handler.ts
```

and tested exactly at:

```text
supabase/functions/fetch-metal-rates/handler.test.ts
```

alongside shared parser tests at:

```text
supabase/functions/_shared/market-rate-snapshot-contract.test.ts
```

The root `package.json` script `test:market-rate-edge` executes both through `tsx --test`, and the CI `quality` job adds a `Market Rate Edge Contract` step running that script.

## 14. Generated Schema Impact

The SQL migration adds constraints/indexes/RPCs but no table columns.

Expected generated effects:

- `packages/db/src/supabase-types.ts`: new RPC signatures;
- `packages/db/src/schema.ts`: no semantic table-column change expected;
- `packages/db/src/migrations.ts`: no Watermelon schema version bump expected.

Generated files must be produced through repository scripts and reviewed, not manually edited to match this expectation.
