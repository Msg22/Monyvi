# Implementation Plan: Atomic Market-Rate Snapshots

**Branch**: `codex/issue302-atomic-market-rate-snapshots` | **Date**: 2026-09-09
| **Spec**: `specs/302-atomic-market-rate-snapshots/spec.md` **Input**: Approved
issue #302 specification after Clarify; revised after three Speckit Analyze
passes.

## Summary

Deliver one atomic current-market snapshot guarantee from Metals.Dev ingestion
through Supabase persistence, complete-envelope pull, WatermelonDB offline
cache, deterministic selection, and every current-rate consumer.

The persisted snapshot identity remains the existing `market_rates.id` UUID. The
wire/service identity is carried once as top-level `snapshotId`;
`persist_market_rate_snapshot_v1` materializes it as `market_rates.id`, and all
37 required `market_rate_observations` use `batch_id = snapshotId`.

The exact-value authority is explicit: **current financial rates come from bound
`market_rate_observations.value_decimal` exact decimals, not from the wide
Watermelon `MarketRate` JavaScript-number fields**. The wide root remains the
snapshot identity/order/history compatibility record and is checked against the
exact observations while both are still represented exactly at the
producer/Postgres/pull-envelope boundaries.

The producer reads provider response text and uses a pinned lossless JSON-number
parser before Zod validation. Provider JSON numeric tokens may use ordinary or
scientific notation. The adapter expands scientific notation into equivalent
plain base-10 decimal text using string/decimal-exponent manipulation only,
preserving all coefficient digits and never rounding or crossing a JavaScript
`number` boundary. For example, `3.73874e-10` becomes `0.000000000373874` and
`1.2300e+2` becomes `123.00`.

Provider timestamps are normalized independently of financial values: valid
non-future timestamps are preserved; missing, malformed, or future timestamps
become `null`, which is the producer representation of Unknown freshness. The
request capture/order timestamp may be used only as the comparison ceiling for
detecting a future provider timestamp; it is never substituted as provider
observation time.

The mobile pull RPC returns exact-string root values plus exact observations in
one envelope; the adapter validates exact equivalence before converting wide
root fields to legacy Watermelon numeric storage. All current consumers then use
one exact selected-snapshot read model. Historical trend queries may continue
using legacy wide rows as explicitly historical inputs.

No screen, navigation, supported-instrument scope, historical
acquisition/terminal evidence, or product formula is intentionally redesigned.

## Technical Context

**Language/Version**: TypeScript 5.9.x on Node 22; TypeScript/Deno Edge Runtime;
PostgreSQL SQL/PLpgSQL. **Primary Dependencies**: Expo 55, React Native 0.83.6,
React 19.2, WatermelonDB 0.28, `@supabase/supabase-js` 2.106 in mobile, exact
`zod@4.4.3` + `lossless-json@4.3.1` declared at the root for Node/`tsx` test
resolution and mapped to the same exact `npm:` versions in
`supabase/functions/fetch-metal-rates/deno.json`, Decimal.js through existing
`@monyvi/logic`, and root `tsx` for deterministic Node test execution.
**Storage**: Supabase `market_rates` + `market_rate_observations`; WatermelonDB
remains the device-side source of truth/offline cache. No new durable
table/column is planned. **Testing**: SQL regression tests; exact shared/Edge
tests run by an explicit root script; logic Jest; mobile Jest/React Native
Testing Library; architecture/source-contract tests; typecheck/lint; local
Supabase verification. **Target Platform**: Expo Android/iOS plus Supabase Edge
Functions/Postgres. **Performance**: Current screens resolve from local
Watermelon state without foreground network dependency; realtime only triggers
normal sync; selection scans bounded recent cached roots/children.
**Constraints**: offline-first; exact decimal financial truth;
provider-time-only freshness; one snapshot identity; no cross-batch repair; no
inferred legacy binding; holdings survive missing rates; all DDL through
numbered local migrations; no direct remote DDL. **Scale/Scope**: exactly 37
current trust observations: Gold, Silver, 35 supported fiat currencies. BTC is
excluded from the trusted Metals current set; USD is exact identity `1`.

## Constitution Check

### Pre-implementation gate

| Principle                          | Result    | Plan alignment                                                                                                                                     |
| ---------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Offline-First Architecture      | PASS      | Selection is reconstructed from WatermelonDB; provider/network failure preserves cached complete snapshots.                                        |
| II. Documented Business Logic      | **GATED** | The first implementation task updates `docs/business/business-decisions.md`; no production-code task may start until that task is committed.       |
| III. Type Safety First             | PASS      | Explicit interfaces, Zod at provider/RPC boundaries, `unknown` for untrusted values, exact decimal strings for authoritative financial values.     |
| IV. Service Layer Architecture     | PASS      | Pure exact rate logic in `packages/logic`; DB joins/selectors in mobile services; hooks own lifecycle only.                                        |
| V. Accessibility / UI              | PASS      | No UI redesign. Existing presentation/accessibility remains regression scope.                                                                      |
| VI. Package Dependency Direction   | PASS      | App consumes logic/db; no reverse import added.                                                                                                    |
| VII. Local-First Schema Migrations | PASS      | One numbered SQL migration; generated contracts refreshed through repo scripts; no MCP/dashboard DDL.                                              |
| VIII. Sync Correctness             | PASS      | Shared market data remains pull-only; complete envelope validated before local apply; cursor advances only after full successful page application. |

The Constitution II gate is intentional. Planning may finish with the gate
pending, but implementation begins with the business-documentation task and
cannot skip/reorder it.

### Post-design gate

PASS subject to the Constitution II execution gate above. The design introduces
no server-only user-facing source of truth, direct component DB query, reverse
dependency, inferred missing financial evidence, or UI/product scope expansion.

## Architecture Decisions

### 1. One immutable identity

- Persisted identity: `market_rates.id` UUID.
- Wire/service identity: top-level `snapshotId` only.
- Persistence maps `snapshotId -> market_rates.id`.
- Every required observation has `batch_id = snapshotId`.
- The nested logical root payload has no independent ID.
- Future-write FK:
  `market_rate_observations.batch_id -> market_rates.id ON DELETE CASCADE NOT VALID`.
- Add non-unique `(batch_id, instrument_code)` index; new-write
  uniqueness/completeness is enforced by RPC + validators so legacy duplicates
  are not destructively rewritten.

### 2. Exact required current set

Exactly one observation for:

- `metal:GOLD`
- `metal:SILVER`
- `currency:<CODE>` for all 35 `SUPPORTED_CURRENCIES` entries

Producer form:

- Metals: `usd_per_pure_gram / quote_per_base`.
- Fiat: `usd_per_currency_unit / quote_per_base`.
- `quality = valid`.
- `source` must be non-empty after trim (`metals.dev` for this producer).
- USD is exact `1`.
- BTC is not a trusted current observation.

Provider metal/currency timestamps may differ. Missing, malformed, or future
provider timestamps are normalized to `null` and therefore Unknown freshness; no
capture/fetch/storage/sync/restart time is substituted.

### 3. Lossless producer ingestion and scientific-notation normalization

`fetch-metal-rates` must not call `response.json()` for authoritative rate
values.

Dependency/runtime ownership is explicit before these tests execute:

- root `package.json` owns exact devDependencies `lossless-json@4.3.1` and
  `zod@4.4.3` for Node/`tsx` execution, with the resulting `package-lock.json`
  committed;
- `supabase/functions/fetch-metal-rates/deno.json` maps the same bare specifiers
  to exact `npm:lossless-json@4.3.1` and `npm:zod@4.4.3` for the Deno Edge
  runtime;
- shared parser/handler code imports only the bare `lossless-json` and `zod`
  specifiers so Node and Deno execute the same package identities/versions;
- no test relies on workspace hoisting, and Node is never expected to consume
  the Deno import map.

Implementation boundary:

1. fetch response;
2. read `response.text()`;
3. parse with the exact `lossless-json@4.3.1` dependency resolved by the active
   runtime as specified above;
4. obtain each JSON numeric token as lossless decimal/exponent text;
5. normalize ordinary/scientific notation to the feature's plain decimal-string
   grammar with exact string/exponent manipulation only—never `Number`,
   `parseFloat`, or any binary-float intermediate;
6. preserve all coefficient digits and trailing coefficient precision where
   representable in plain form; examples: `3.73874e-10 -> 0.000000000373874`,
   `1.2300e+2 -> 123.00`;
7. validate the transformed exact-string provider shape with exact `zod@4.4.3`;
8. generate one `snapshotId` + one capture/order timestamp;
9. normalize provider timestamps: missing/malformed/future relative to the
   capture instant -> `null`; valid non-future provider timestamps preserved
   exactly/semantically;
10. build exact root payload + exactly 37 exact observations;
11. call only `persist_market_rate_snapshot_v1` for authoritative persistence.

Tests must include `0.10000000000000001`, another long-precision decimal, and
exponent-form values including `3.73874e-10`. They must prove the RPC payload
contains the exact equivalent plain decimal with no rounding. Timestamp tests
must separately cover missing, malformed, valid, and future raw provider values
and prove `null`/Unknown normalization without capture-time substitution.

A conversion to JS `number` is allowed only after authoritative
validation/persistence for legacy informational response fields or compatibility
storage.

### 4. Atomic producer persistence

Add service-role-only `public.persist_market_rate_snapshot_v1(...)`.

The RPC receives:

- top-level snapshot UUID;
- capture/order timestamp;
- logical wide root payload where all rate fields are plain decimal strings;
- exactly 37 observation objects with exact plain decimal strings.

It validates transactionally:

- exact required membership and count;
- no duplicate/unexpected instruments;
- positive canonical decimals;
- exact USD identity;
- allowed unit/orientation;
- `quality = valid`;
- non-empty trimmed source;
- provider timestamp syntax/null semantics;
- exact root-to-observation numeric equivalence using PostgreSQL numeric
  semantics;
- same-ID identical replay versus conflict.

Then it inserts the wide root (casting decimal text to PostgreSQL `numeric`)
plus all observations atomically. Identical replay returns `replayed` with no
semantic mutation; conflict raises a deterministic error and commits nothing.
Execution is revoked from PUBLIC/anon/authenticated and granted only to the
trusted producer role.

### 5. Complete-snapshot pull RPC

Add `public.pull_market_rate_snapshots_page_v1(...)`.

It pages by `(market_rates.created_at, market_rates.id)` under a fixed upper
watermark and returns only complete eligible envelopes. Each envelope contains:

- `snapshotId`;
- capture/order timestamp;
- logical root rate values cast to exact plain text;
- all 37 bound observations with exact `value_decimal` text and provenance.

Legacy/unbound/partial/duplicate/source-invalid candidates are omitted. The
mobile adapter validates the exact envelope before writing anything locally.
This replaces independent current root + observation network windows in both
normal sync and manual refresh.

The OpenAPI `PersistedObservation` schema is a single explicit closed object. It
must not extend a closed `RateObservationInput` using `allOf`, because
`additionalProperties: false` in the base subschema would reject the
persisted-only `id`, `batchId`, and `capturedAt` fields.

### 6. Exact local application boundary

The pull adapter validates exact root/observation equivalence while both are
still exact strings. Only then does it transform:

- root exact values -> existing Watermelon `market_rates` compatibility numeric
  fields;
- observation exact values -> existing local exact `value_decimal` text.

Root + observations are applied inside one Watermelon writer/page unit. The
market snapshot cursor/watermark advances only after the complete page succeeds.

Because the wide local root is a JS/SQLite compatibility representation, its
numeric rate fields are never authoritative current inputs after this point.

### 7. Selected current snapshot read model

Add `apps/mobile/services/market-rate-snapshot-read-model-service.ts`.

The service internally observes root identity/order plus bound observations and
exports an immutable object shaped around exact observation values:

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
```

`SelectedCurrentMarketRate.valueDecimal` / `normalizedUsdPerBaseDecimal` are
canonical decimal strings from the bound observation row. The exported current
interface does not expose wide `MarketRate` numeric columns as financial truth.

Selection:

1. order root candidates by immutable `(created_at DESC,id DESC)`;
2. load children only by exact `batch_id`;
3. validate exact required set, binding, source, value, quality,
   unit/orientation, and provider-time semantics;
4. select newest complete valid candidate;
5. ignore newer invalid/incomplete/cross-batch candidates;
6. if required evidence later disappears/corrupts, mark that snapshot ineligible
   and fall back to an earlier complete candidate or `null`;
7. never borrow another batch's observation to repair a candidate.

No selected-ID pointer is persisted; restart/offline reconstruction is
deterministic from cached data.

### 8. Exact current calculation helpers

`packages/logic/src/metals/current-market-snapshot.ts` defines pure exact
interfaces/helpers over canonical decimal strings and the existing Decimal
primitive. It owns current:

- metal USD-per-pure-gram lookup;
- fiat USD-per-unit lookup;
- exact current currency conversion;
- current metal valuation rate input shaping;
- exact current rate formatting inputs where financial values are displayed.

No authoritative current calculation may first convert a snapshot rate to JS
`number`.

### 9. Consumer cutover

Refactor current consumers so they consume `SelectedMarketRateSnapshot` / exact
current helpers:

- `useMarketRates.ts`: expose selected current snapshot/exact rates; keep
  previous-day wide `MarketRate` query explicitly historical. Do not use root
  `createdAt` as current freshness.
- `live-rates-trust-read-model-service.ts`: pure mapper/summary over selected
  observations, no independent newest-observation query.
- `useLiveRatesScreen.ts`: current displayed rate values + trust come from exact
  selected rates. Historical trend inputs may remain separate and
  non-certifying.
- `useMetalPortfolio.ts`: current Gold/Silver/preferred/purchase-currency
  valuation inputs use exact selected rates.
- `useMetalHoldingDetail.ts`: current valuation uses exact selected rates;
  acquisition/terminal immutable references stay separate.
- `useNetWorth.ts` + net-worth read-model boundary: account currency and current
  metal valuation use exact snapshot inputs; missing rates fail closed rather
  than coercing to zero.
- `MarketRatesRealtimeProvider.tsx`: insert notification triggers normal sync
  only.

Perform a final source search for direct current `market_rates` numeric use,
`observeLiveRatesTrust`, `latestRates`, `isStale()`/`getAge()`, and independent
current observation queries. Every remaining hit must be
historical/test/unrelated or fixed with regression coverage.

### 10. Failure/replay/order

- failed provider fetch/parse/RPC -> no new snapshot;
- partial remote data -> pull omits candidate;
- failed local page -> no cursor advancement and cached complete snapshot
  remains;
- identical same-ID replay -> idempotent;
- conflicting same-ID replay -> rejected without mutation;
- delayed older complete snapshot -> cannot displace a newer complete selected
  snapshot solely by receipt time;
- no complete snapshot -> dependent current value unavailable, holdings/recorded
  facts remain.

### 11. Retention and local corruption integrity

Issue #302 adds no retention duration or pruning job.

Required evidence:

- SQL test proves deleting an eligible root cascades all bound observations;
- selector test removes one required observation from selected B and proves B
  becomes ineligible;
- selector never repairs B from A's child rows;
- if complete A remains, selection falls back to A;
- if no complete snapshot remains, selected current rates become
  `null`/unavailable.

Any future cleanup path must treat root+observations as one unit and must not
leave a current value whose required evidence was removed.

### 12. Legacy cutover

Do not infer/backfill legacy binding by timestamp/value matching. The
`NOT VALID` FK protects future writes without certifying history. Pull + local
selection independently fail closed on legacy root-only, child-only, partial,
duplicate, or source-less candidates.

### 13. Local/manual QA importer

`scripts/import-market-rates-to-local.js` currently imports only root rows.
Update it to import only complete root + matching observation envelopes,
preserving snapshot-unit integrity. Root-only import must never be presented as
trusted current QA data.

### 14. Exact Edge test and CI gate

Use one exact handler extraction/testing shape:

```text
supabase/functions/fetch-metal-rates/handler.ts
supabase/functions/fetch-metal-rates/handler.test.ts
supabase/functions/fetch-metal-rates/index.ts
supabase/functions/_shared/market-rate-snapshot-contract.test.ts
```

`index.ts` becomes the minimal `Deno.serve` wrapper over the extracted handler;
handler behavior is testable without starting the Edge runtime.

Before the first Node/`tsx` execution of the Edge/shared tests, implementation
must establish deterministic dual-runtime package ownership:

```json
// root package.json devDependencies
"lossless-json": "4.3.1",
"zod": "4.4.3"
```

and commit the generated `package-lock.json` update. The function-local Deno map
must resolve the same bare imports to the same exact packages:

```json
// supabase/functions/fetch-metal-rates/deno.json imports
"lossless-json": "npm:lossless-json@4.3.1",
"zod": "npm:zod@4.4.3"
```

This is deliberate duplication of **resolution metadata**, not two dependency
authorities: root npm metadata owns Node/`tsx` resolution; the Deno import map
owns Edge resolution; the exact versions must match. The shared/handler source
imports `lossless-json` and `zod` by those bare specifiers in both runtimes.

Implementation then adds this root script to `package.json`:

```json
"test:market-rate-edge": "tsx --test supabase/functions/_shared/market-rate-snapshot-contract.test.ts supabase/functions/fetch-metal-rates/handler.test.ts"
```

and adds a `Market Rate Edge Contract` step to `.github/workflows/ci.yml`'s
`quality` job that runs:

```bash
npm run test:market-rate-edge
```

This is a required issue #302 verification gate, not an assumption about
pre-existing CI coverage. Verification must confirm the root package/lock and
Deno import map carry the matching exact versions before treating the Node/`tsx`
gate as reproducible.

### 15. Observability/security

Structured non-sensitive events:

- `marketRates.snapshot.persist.created`
- `marketRates.snapshot.persist.replayed`
- `marketRates.snapshot.persist.conflict`
- `marketRates.snapshot.pull.invalidEnvelope`
- `marketRates.snapshot.selection.changed`
- `marketRates.snapshot.selection.rejectedCandidate`

Log snapshot IDs/reason codes only; never provider secrets or unrelated user
finance data.

## Project Structure

### Feature docs

```text
specs/302-atomic-market-rate-snapshots/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── market-rate-snapshots.openapi.yaml
└── tasks.md
```

### Expected source changes

```text
docs/business/business-decisions.md        # first implementation gate
package.json                               # exact Edge test deps + script
package-lock.json                          # exact root dependency lock update
.github/workflows/ci.yml                   # Market Rate Edge Contract step

supabase/
├── migrations/069_atomic_market_rate_snapshots.sql
├── functions/
│   ├── _shared/
│   │   ├── market-rate-snapshot-contract.ts
│   │   └── market-rate-snapshot-contract.test.ts
│   └── fetch-metal-rates/
│       ├── deno.json                       # matching exact Deno npm import mappings
│       ├── handler.ts
│       ├── handler.test.ts
│       └── index.ts
└── tests/atomic_market_rate_snapshots_test.sql

packages/logic/src/metals/
├── current-market-snapshot.ts
├── index.ts
└── __tests__/
    ├── current-market-snapshot.fixtures.ts
    └── current-market-snapshot.test.ts

packages/db/src/
├── supabase-types.ts
├── schema.ts
└── migrations.ts

apps/mobile/
├── services/
│   ├── market-rate-snapshot-read-model-service.ts
│   ├── live-rates-refresh-service.ts
│   ├── live-rates-trust-read-model-service.ts
│   ├── net-worth-read-model-service.ts
│   └── sync/pull-strategies.ts
├── hooks/
│   ├── useMarketRates.ts
│   ├── useLiveRatesScreen.ts
│   ├── useMetalPortfolio.ts
│   ├── useMetalHoldingDetail.ts
│   └── useNetWorth.ts
├── providers/MarketRatesRealtimeProvider.tsx
└── __tests__/
    ├── fixtures/market-rate-snapshot.ts
    ├── services/market-rate-snapshot-read-model-service.test.ts
    ├── services/live-rates-refresh-service.test.ts
    ├── services/live-rates-trust-read-model-service.test.ts
    ├── services/net-worth-read-model-current-rates.test.ts
    ├── services/sync/pull-market-rate-snapshots.test.ts
    ├── hooks/current-market-snapshot-consumers.test.tsx
    └── architecture/current-market-snapshot-consumers.test.ts

scripts/import-market-rates-to-local.js
scripts/import-market-rates-to-local.test.js
```

Additional files are changed only if the mandatory bypass search proves they
directly own current-rate selection/calculation.

## Test Strategy

Tests are mandatory (FR-023 / SC-009) and precede corresponding production
changes.

### Provider / exact-decimal boundary

- raw JSON decimal `0.10000000000000001` survives to RPC payload unchanged;
- another long-precision decimal survives unchanged;
- exponent input such as `3.73874e-10` becomes exact plain `0.000000000373874`
  with no rounding or binary-number conversion;
- coefficient precision is preserved when exponent notation is expanded;
- authoritative path does not use `response.json()` or `Number(...)` before RPC
  payload construction;
- malformed/non-positive required rate rejected;
- valid provider timestamps preserved;
- missing/malformed/future provider timestamps normalize to `null` and Unknown
  with no capture-time substitution;
- 37 observations, USD=1, BTC excluded, non-empty source.

### Database boundary

SQL tests cover:

- complete 37-row creation;
- missing/duplicate/unexpected instruments;
- invalid quality/unit/orientation/non-positive values;
- null/empty/whitespace-only source rejection;
- exact root/value mismatch rejection;
- null provider time accepted as Unknown-capable evidence;
- identical replay;
- conflicting replay rollback;
- pull returns complete envelopes only;
- legacy/unbound/partial/duplicate/source-invalid batches omitted;
- paging/order/no stale regression;
- service-role-only persistence permissions;
- root delete cascades bound observations.

### Pull/local apply

- exact root text and observation text compared before local root number
  conversion;
- malformed/cross-ID envelope rejected;
- `PersistedObservation` wire schema validates its persisted fields as one
  closed object;
- failed page leaves cursor unchanged;
- root+children applied in one writer;
- duplicate replay idempotent;
- cached prior complete snapshot remains on failure.

### Local selector

- no complete -> null;
- complete A -> A;
- newer incomplete/invalid B -> A;
- cross-batch rows never borrowed;
- complete B -> B;
- older delayed Z -> no regression;
- null/future provider time -> Unknown;
- missing/blank source -> ineligible;
- remove required evidence from B -> B ineligible, fall back to A or null;
- restart/offline rebuilds from cached exact observations;
- wide root numeric divergence cannot alter current financial values because
  consumers use exact observation values.

### Consumer contract

- Live Rates current value + source/quality/provider time share one snapshot ID
  and exact value;
- My Metals current valuation/rate status share exact selected snapshot inputs;
- holding current valuation uses exact selected rates while historical
  references stay immutable;
- net worth account/current-metal conversions use exact current snapshot inputs;
- missing current inputs produce unavailable dependent outputs, not zero;
- no current freshness uses root/fetch/sync/receipt/restart time.

### Required Edge verification command

The implementation must make this command executable and CI-enforced after exact
npm/Deno dependency parity is established:

```bash
npm run test:market-rate-edge
```

Its exact script body is:

```text
tsx --test supabase/functions/_shared/market-rate-snapshot-contract.test.ts supabase/functions/fetch-metal-rates/handler.test.ts
```

### Manual regression

Regression-only: existing Home, Live Rates, My Metals, holding detail
layouts/journeys in EN/AR and online/offline states. No visual redesign evidence
gate is introduced because issue #302 is not mockup-backed UI work.

## Rollout / Execution Sequence

1. Complete and commit the business-decision documentation task. No production
   implementation before this.
2. Establish exact dual-runtime dependency resolution for the Edge/shared test
   boundary, then write shared exact/lossless red tests and implement the
   canonical exact contract.
3. Add exact handler test script/CI gate before treating Edge verification as
   available.
4. Write SQL red tests; add migration/RPCs; regenerate DB contracts locally.
5. Cut producer to lossless parse + atomic RPC.
6. Implement complete-snapshot pull and atomic local apply.
7. Implement selected exact snapshot service and current exact logic helpers.
8. Cut all current consumers to exact selected rates.
9. Add offline/fail-closed/retention-corruption hardening.
10. Run full deterministic verification and regression-only manual QA.
11. Deploy migration + producer + consumer contract as one issue #302 release
    guarantee; do not ship producer-only or consumer-only completion.

## Planning Environment Note

The connected planning environment has no repository shell runner, so Speckit
scripts, SQL tests, Jest, lint, typecheck, dependency checks, and the planned
Edge test command were not executed during planning. No passing command claim is
made here.

## Complexity Tracking

No constitution exception is accepted. The additional lossless JSON parser is a
focused producer-boundary dependency required by FR-015. Its runtime resolution
is pinned twice only because the same source is executed by two package
resolvers: root npm metadata/lock for Node/`tsx` tests and the function-local
Deno import map for Edge execution; both must resolve the same exact package
versions. No new durable table, local selected-pointer table, or UI flow is
introduced.
