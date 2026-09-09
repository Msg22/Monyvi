# Implementation Plan: Atomic Market-Rate Snapshots

**Branch**: `codex/issue302-atomic-market-rate-snapshots` | **Date**: 2026-09-09 | **Spec**: `specs/302-atomic-market-rate-snapshots/spec.md`  
**Input**: Approved issue #302 specification after Clarify completed with no material ambiguities.

## Summary

Deliver one atomic current-market snapshot contract from the metals.dev producer through Supabase persistence, shared pull/sync, WatermelonDB selection, and every current-rate consumer. The implementation will reuse the existing `market_rates.id` UUID as the immutable snapshot identity and bind every matching `market_rate_observations` row with `batch_id = market_rates.id`.

A refresh will build one complete snapshot envelope, validate it, and persist the wide `market_rates` row plus the exact observation set in one privileged Postgres function call. Mobile pull will stop fetching root values and trust observations as independent windows; instead it will pull complete snapshot envelopes and apply each page atomically to WatermelonDB. A single local selected-snapshot read model will then supply both current numeric values and their trust evidence to Live Rates, My Metals, holding detail, Home/net worth, and any other current-rate valuation consumer. Incomplete, invalid, legacy-unbound, duplicate-conflicting, or out-of-order candidates never replace the last complete valid selected snapshot.

The plan intentionally adds no new screen, navigation, formula, supported instrument, or user interaction. Existing historical `market_rates` rows remain available for trend/history queries, while current trust selection becomes snapshot-bound.

## Technical Context

**Language/Version**: TypeScript 5.9.x on Node 22 for the monorepo; TypeScript/Deno Edge Runtime for Supabase functions; PostgreSQL SQL/PLpgSQL for migrations and RPCs.  
**Primary Dependencies**: Expo 55, React Native 0.83.6, React 19.2, WatermelonDB 0.28, `@supabase/supabase-js` 2.106, Zod 4.3, existing `@monyvi/logic` exact-decimal/rate-reference utilities.  
**Storage**: Supabase PostgreSQL (`market_rates`, `market_rate_observations`) as shared producer storage; WatermelonDB as the device-side source of truth/offline cache. No new persisted table is required.  
**Testing**: SQL regression tests in `supabase/tests/`; Deno/shared Edge Function unit tests; Jest/React Native Testing Library for mobile services/hooks; package-level logic tests; repository lint/typecheck.  
**Target Platform**: Expo React Native mobile app on Android/iOS plus Supabase Edge Functions/Postgres backend.  
**Project Type**: Existing Nx/npm-workspace monorepo with mobile app, shared logic/db packages, and Supabase backend.  
**Performance Goals**: Preserve current screen responsiveness: current-rate consumers resolve from local WatermelonDB without a foreground network dependency; one realtime notification triggers one normal sync path rather than per-screen refetches; complete-snapshot selection is bounded to recently cached candidates and does not scan unbounded history.  
**Constraints**: Offline-first; exact decimal financial truth; provider observation time is the only freshness source; no value/evidence mixing; no inferred legacy bindings; local holdings remain visible when market inputs are unavailable; all DDL through numbered migrations; no direct remote DDL.  
**Scale/Scope**: One current snapshot contains exactly 37 trust observations for the current Metals V1 contract: `metal:GOLD`, `metal:SILVER`, and 35 supported ISO fiat currencies (BTC excluded; USD included as exact identity `1`). The wide `market_rates` row continues to carry its existing broader fields (including legacy platinum/palladium/BTC fields) without expanding product scope.

## Constitution Check

### Pre-design gate

| Principle | Result | Plan alignment |
| --- | --- | --- |
| I. Offline-First Architecture | PASS | Current selection remains local WatermelonDB state; refresh/sync is background and failure preserves cached complete state. |
| II. Documented Business Logic | PASS | Implementation includes an explicit update to `docs/business/business-decisions.md` for the finalized atomic snapshot contract and cutover rules. |
| III. Type Safety First | PASS | New TypeScript contracts use explicit types and Zod at external/network boundaries; no `any`; null provider time is modeled explicitly. |
| IV. Service Layer Architecture | PASS | Snapshot selection/pull/write orchestration lives in services; hooks own subscription lifecycle; calculations remain in `packages/logic`; screens remain presentation-only. |
| V. Accessibility / UI | PASS | No intentional UI redesign; existing accessible presentation is preserved. |
| VI. Package Dependency Direction | PASS | `apps/mobile` may consume `packages/logic` and `packages/db`; shared packages do not import app code. |
| VII. Local-First Schema Migrations | PASS | Postgres changes will be a numbered migration; generated Supabase types/local schema artifacts are refreshed through repo scripts. No direct MCP/dashboard DDL. |
| VIII. Sync Architecture | PASS | Shared rate tables remain pull-only; snapshot page/cursor advances only after successful complete-page application; pull failures remain fatal to that sync attempt. |

No constitution exception is required.

### Post-design gate

PASS. The selected design uses existing tables, one migration, one privileged persistence RPC, one complete-snapshot pull RPC, and a local Watermelon read model. It does not introduce a server-only source of truth, a component-side database query, reverse package dependency, direct remote schema mutation, or silent fallback from missing financial evidence.

## Architecture Decisions

### 1. Immutable identity and binding

- Canonical snapshot identity: existing `market_rates.id` UUID.
- Every current-rate observation in the same producer refresh uses `market_rate_observations.batch_id = market_rates.id`.
- New writes are validated as one envelope. A current value may only be certified by observations with the same snapshot ID.
- Add a safe FK as `NOT VALID` so new/updated rows must reference a root without retroactively certifying or breaking deployment on legacy unbound rows.
- Add a non-unique `(batch_id, instrument_code)` lookup index. Uniqueness/completeness for new snapshots is enforced by the persistence RPC and selection contract; legacy duplicates make that legacy batch ineligible rather than being deduplicated by inference.

### 2. Exact required V1 observation set

A complete selected snapshot requires exactly one observation for each of:

- `metal:GOLD`
- `metal:SILVER`
- all 35 codes exported by `SUPPORTED_CURRENCIES` as `currency:<CODE>`

That is 37 observations total. BTC is excluded from Metals current-rate references even though the wide market row currently stores `btc_usd`. USD is included as `currency:USD` and must normalize exactly to `1` even though the wide row has no `usd_usd` column.

Metal observations use `usd_per_pure_gram / quote_per_base`. Currency observations use the existing accepted direct/inverse currency contract and normalize to USD per currency unit. For producer-generated observations, persist the direct form `usd_per_currency_unit / quote_per_base` for consistency.

The two metal observations use the provider's metal observation timestamp; currency observations use the provider's currency observation timestamp. The two timestamps may differ inside one snapshot. Missing/unparseable provider time is represented as null and yields Unknown freshness; it is never replaced by capture/fetch/sync time.

### 3. Atomic producer persistence

Add `public.persist_market_rate_snapshot_v1(...)` in the numbered migration and call it with the service role from `supabase/functions/fetch-metal-rates/index.ts`.

The function will:

1. accept one explicit snapshot UUID and capture timestamp plus the wide root payload and observation array;
2. validate the exact 37-instrument observation set, no duplicates/unexpected instruments, positive exact numeric values, quality, units/orientations, and root-to-observation value equivalence;
3. compare `currency:USD` against implicit exact identity `1`;
4. insert the `market_rates` root and all 37 observations in the same database transaction;
5. return `created` for a new complete snapshot;
6. return `replayed` without mutation when the same snapshot ID already exists with semantically identical root/observation content;
7. reject a same-ID conflicting replay with a deterministic conflict error and no partial mutation.

`updated_at`/server bookkeeping is not part of immutable semantic content and must not be changed on identical replay. The function is not a general client write endpoint: revoke execution from PUBLIC/anon/authenticated and grant only to `service_role`.

### 4. Producer adapter

Refactor `fetch-metal-rates` so one fetched metals.dev response is validated before persistence, then mapped into:

- the existing wide `market_rates` representation;
- exactly 37 current trust observations under one generated `crypto.randomUUID()` snapshot ID;
- one immutable capture timestamp used for root ordering/observation capture metadata.

External provider payload validation must be schema-based (Zod) and must reject non-finite/non-positive required numeric values before the RPC. Existing response fields are preserved for compatibility; the success response additionally exposes `snapshotId` and `persistenceStatus` for deterministic verification/observability.

### 5. Complete-snapshot pull contract

Add read RPC `public.pull_market_rate_snapshots_page_v1(...)` rather than composing `pullMarketRates()` and `pullMarketRateObservations()` independently.

The RPC pages by root snapshot ordering (`market_rates.created_at`, `market_rates.id`) under a fixed upper watermark and returns only envelopes for which the exact V1 observation set is present and bound to that root ID. Legacy/unbound/incomplete/duplicated batches are omitted. Response contains root data plus all bound observations and the next cursor/watermark.

The mobile sync adapter validates each envelope before local writes. Cursor state is advanced only after the full response page is successfully written.

### 6. Atomic local application and selection

`refreshLiveMarketRates()` and the normal sync path use the same complete-snapshot pull adapter. A page is applied inside one WatermelonDB writer so a root and all child observations become locally visible together from the sync operation.

Add `apps/mobile/services/market-rate-snapshot-read-model-service.ts` as the only current-snapshot selector. It will:

- observe local root candidates and bound observations;
- order candidates by immutable producer capture/root ordering (`created_at DESC`, `id DESC`) for promotion ordering only;
- validate the complete 37-observation contract and root/value equivalence;
- choose the newest complete valid envelope;
- ignore newer incomplete/invalid/legacy-unbound candidates and retain the previous complete selection;
- expose one immutable read model containing the `MarketRate`, `snapshotId`, normalized observations/trust state, and per-input provider timestamps/freshness;
- never combine observations from different batches to repair a candidate.

`created_at` is never a freshness timestamp. It is only an immutable ordering/capture field. Provider timestamps remain the sole freshness authority.

### 7. Consumer cutover

Refactor current consumers to subscribe to the selected snapshot instead of independently selecting values and trust observations:

- `apps/mobile/hooks/useMarketRates.ts`: current `latestRates` comes from the selected snapshot; previous-day/trend history stays a separate historical query. Remove current freshness dependence on `MarketRate.createdAt`/`MarketRate.isStale()`.
- `apps/mobile/services/live-rates-trust-read-model-service.ts`: stop independently querying latest observations; become a pure trust mapper/summary helper over one selected snapshot (or be subsumed by the new snapshot service).
- `apps/mobile/hooks/useLiveRatesScreen.ts`: current displayed rates and trust metadata come from one selected snapshot; historical trend comparison remains read-only history.
- `apps/mobile/hooks/useMetalPortfolio.ts`: all current metal/currency rates and status derive from one selected snapshot.
- `apps/mobile/hooks/useMetalHoldingDetail.ts`: current valuation inputs use the same selected snapshot; immutable acquisition/terminal evidence remains separate.
- `apps/mobile/hooks/useNetWorth.ts` and related Home/wealth read models: current asset/currency valuation receives one selected `MarketRate`/snapshot context and fails closed when unavailable.
- `apps/mobile/providers/MarketRatesRealtimeProvider.tsx`: realtime remains only a trigger for the normal sync path; root insertion notification cannot directly promote a snapshot before complete local pull/validation.

Implementation must perform a final repository search for direct current `market_rates` queries, `observeLiveRatesTrust`, and current-rate valuation entry points so no current consumer bypass remains.

### 8. Failure, replay, ordering, and retention

- Failed provider fetch or persistence: no new snapshot is created; current local selection remains unchanged.
- Partial/invalid remote data: complete-snapshot pull omits it; local selection remains unchanged.
- Identical same-ID persistence replay: no mutation and deterministic `replayed` result.
- Identical pull/local replay: Watermelon upsert is idempotent.
- Conflicting same-ID replay: server rejects; local validator also refuses conflicting duplicate content if encountered.
- Older delayed delivery: immutable root capture ordering prevents it from displacing a newer selected snapshot solely due to receipt order.
- Retention duration is not changed by issue #302. Do not add a new pruning policy. Any existing/future deletion that touches these records must delete a snapshot as a unit and must not remove the last complete local selected snapshot without a complete replacement. The FK uses cascade semantics for child cleanup when an eligible root is intentionally deleted.

### 9. Legacy cutover

Do not backfill `batch_id` relationships by timestamp/value guessing. Existing `market_rates` and observations remain stored, but only rows with a provable shared ID and a complete valid 37-observation envelope are eligible for the new selector.

The new FK is added `NOT VALID`: it enforces the relation for new/updated rows without asserting historical rows are valid. The pull RPC and local selector independently fail closed on legacy data. A later cleanup can validate/remove legacy rows after rollout evidence, but that is not required to make issue #302 correct.

### 10. Observability and security

Use structured, non-sensitive events around producer outcomes and mobile refresh selection:

- `marketRates.snapshot.persist.created`
- `marketRates.snapshot.persist.replayed`
- `marketRates.snapshot.persist.conflict`
- `marketRates.snapshot.pull.invalidEnvelope`
- `marketRates.snapshot.selection.changed`
- `marketRates.snapshot.selection.rejectedCandidate`

Log snapshot IDs and reason codes, not API keys or unrelated user financial data. Persistence RPC execution is service-role only; pull remains read-only shared market data under existing app authentication/RLS conventions.

## Project Structure

### Documentation for this feature

```text
specs/302-atomic-market-rate-snapshots/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── market-rate-snapshots.openapi.yaml
└── tasks.md                 # generated in the next workflow
```

### Source code affected by implementation

```text
supabase/
├── migrations/
│   └── 069_atomic_market_rate_snapshots.sql
├── functions/
│   ├── _shared/
│   │   └── market-rate-snapshot-contract.ts
│   └── fetch-metal-rates/
│       └── index.ts
└── tests/
    └── atomic_market_rate_snapshots_test.sql

packages/
├── logic/src/metals/
│   ├── current-market-snapshot.ts
│   ├── index.ts
│   └── __tests__/current-market-snapshot.test.ts
└── db/src/
    ├── supabase-types.ts             # regenerated for RPC signatures
    ├── schema.ts                     # verify unchanged unless generator requires output
    └── migrations.ts                 # verify unchanged unless generator requires output

apps/mobile/
├── services/
│   ├── market-rate-snapshot-read-model-service.ts
│   ├── live-rates-refresh-service.ts
│   ├── live-rates-trust-read-model-service.ts
│   └── sync/pull-strategies.ts
├── hooks/
│   ├── useMarketRates.ts
│   ├── useLiveRatesScreen.ts
│   ├── useMetalPortfolio.ts
│   ├── useMetalHoldingDetail.ts
│   └── useNetWorth.ts
├── providers/
│   └── MarketRatesRealtimeProvider.tsx
└── __tests__/
    ├── services/market-rate-snapshot-read-model-service.test.ts
    ├── services/live-rates-refresh-service.test.ts
    ├── services/live-rates-trust-read-model-service.test.ts
    └── hooks/current-market-snapshot-consumers.test.tsx

docs/business/business-decisions.md
```

`apps/mobile/hooks/useAssetBreakdown.ts`, `apps/mobile/services/net-worth-read-model-service.ts`, and any additional files found by the mandatory consumer search are included only if they directly read/derive current market rates; the implementation must not broaden into unrelated net-worth redesign.

## Test Strategy

Tests are mandatory because FR-023/SC-009 explicitly require deterministic verification.

### Database boundary

`supabase/tests/atomic_market_rate_snapshots_test.sql` must cover:

- complete 37-observation creation in one snapshot;
- missing, duplicated, unexpected, invalid-quality, invalid-unit/orientation, non-positive, and root/value-mismatch rejection;
- null provider timestamps accepted as Unknown-capable evidence without local replacement;
- identical same-ID replay idempotency;
- conflicting same-ID replay rejection with no mutation;
- pull RPC returns complete envelopes only;
- legacy/unbound/partial batches are omitted;
- ordering/cursor behavior and no stale regression;
- execution grants: persistence unavailable to anon/authenticated, available to service-role path.

### Shared logic / producer

- Exact V1 instrument set is 37 and includes USD/excludes BTC.
- metals.dev adapter produces one shared snapshot ID and correct provider timestamps/source/quality/unit/orientation.
- malformed provider payload fails before persistence.
- exact decimal strings/normalization remain canonical.

### Mobile local selection / sync

- root arrives without observations -> previous complete snapshot remains selected;
- observations arrive without root -> cannot select;
- complete bound envelope -> promotes exactly once;
- multiple batches -> no cross-batch mixing;
- invalid newest -> prior complete remains;
- same-ID identical replay -> no second truth;
- same-ID conflict -> rejected;
- older delayed complete envelope -> no regression;
- restart/offline reconstruction selects the same complete cached snapshot;
- no complete snapshot -> dependent current values unavailable while holdings facts persist;
- page apply/cursor failure does not advance state.

### Consumer contract

- Live Rates value/source/quality/provider time share one snapshot ID.
- My Metals valuation/rate status share one snapshot ID.
- Holding detail current valuation shares one snapshot ID while acquisition/terminal references remain immutable and separate.
- Home/net-worth metal valuation uses the selected snapshot and returns unavailable rather than zero when required current rates are unavailable.
- no current freshness display uses root `created_at`, fetch, sync, receipt, or restart time.

### Regression / manual

No visual redesign is expected. Manual regression is limited to confirming existing Home, Live Rates, My Metals, and holding-detail layouts/journeys remain unchanged in EN/AR and online/offline states. Financial correctness/failure behavior should be automated wherever controllable.

## Rollout Sequence

1. Land migration/RPC contracts and database tests locally.
2. Regenerate Supabase types; verify Watermelon schema has no new columns and therefore does not need a semantic local schema migration.
3. Update Edge Function producer to write only complete atomic snapshots.
4. Add complete-snapshot pull adapter and local read model while preserving legacy readers behind tests during transition.
5. Cut all current-rate consumers to the selected snapshot service.
6. Remove/deprecate independent latest-observation/current-root selection paths after repository search proves no bypass remains.
7. Run full local database, logic, mobile Jest, mobile typecheck/lint, and targeted manual regression.
8. Deploy migration before or together with the producer/consumer release so new atomic writes exist before clients rely on them. Do not validate historical FK or delete legacy data as part of initial rollout.

## Planning Environment Note

The repository's `.specify/scripts/bash/setup-plan.sh` and agent-context update script could not be executed in this connected GitHub-only environment because no shell runner is available. This plan reproduces the required Speckit outputs directly under the approved feature directory and records implementation-time commands in `quickstart.md`; no command/test execution is claimed during Plan generation.

## Complexity Tracking

No constitution violation or exceptional complexity is accepted. The design deliberately reuses the existing root/observation tables and introduces no new durable entity or UI flow.