# Research: Atomic Market-Rate Snapshots

**Feature**: `302-atomic-market-rate-snapshots`  
**Date**: 2026-09-09

This research resolves the implementation decisions intentionally deferred by the approved specification. It does not change the feature's user/business requirements.

## Decision 1: Reuse `market_rates.id` as the immutable snapshot identity

**Decision**: Use the existing UUID primary key `market_rates.id` as the canonical snapshot identity. Bind current observations with `market_rate_observations.batch_id = market_rates.id`.

**Rationale**:

- Migration 015 already converted `market_rates` from the original singleton cache into a multi-row history table.
- Migration 016 already converted `market_rates.id` from integer to UUID.
- The Metals domain already models `market_rate_observations.batch_id` as UUID.
- Reusing the root ID avoids another durable snapshot table and gives every root/observation envelope a stable identity that can survive sync/restart.

**Alternatives considered**:

- Add a new `market_rate_snapshots` table: rejected because the existing `market_rates` row already represents one producer refresh and has a suitable UUID identity; a third table would duplicate lifecycle/order state.
- Derive identity from provider timestamps: rejected because metal and currency provider timestamps can differ within one fetch, and timestamps are not collision-safe immutable identities.
- Infer identity from local capture/sync times: rejected because it would violate provider-time freshness semantics and fail across devices/replays.

## Decision 2: Persist the root and all trust observations through one Postgres function

**Decision**: Add `persist_market_rate_snapshot_v1` and invoke it with `.rpc()` from the Edge Function. The RPC owns validation, idempotency/conflict detection, and the multi-table transaction.

**Rationale**:

- The current Edge Function performs a single `market_rates` insert and does not create the matching observation set atomically.
- Supabase's JavaScript client does not provide a client-side multi-query transaction wrapper for this use case; Supabase recommends database functions/RPC for transactional multi-statement work.
- A Postgres function naturally guarantees all-or-nothing root/children persistence and centralizes replay rules close to the constraints.

**Supabase references**:

- Database Functions: https://supabase.com/docs/guides/database/functions
- JavaScript `rpc()`: https://supabase.com/docs/reference/javascript/rpc
- Supabase troubleshooting guidance on multi-query transactions/rollback: https://supabase.com/docs/guides/troubleshooting/seeing-different-data-between-the-sql-editor-and-api-ETn0wF

**Alternatives considered**:

- Two sequential `.insert()` calls from the Edge Function: rejected because a crash/network/runtime error between inserts can expose partial state.
- Wrap writes only in a mobile Watermelon transaction: rejected because the server producer would still have inconsistent durable truth before sync.
- New server application/API service: rejected as unnecessary; the existing Edge Function plus Postgres RPC is sufficient.

## Decision 3: A complete V1 snapshot contains exactly 37 trust observations

**Decision**: Require exactly one current observation for two metal instruments plus all 35 supported fiat currencies.

Required instruments:

- `metal:GOLD`
- `metal:SILVER`
- `currency:EGP`, `currency:SAR`, `currency:AED`, `currency:KWD`, `currency:QAR`, `currency:BHD`, `currency:OMR`, `currency:JOD`, `currency:IQD`, `currency:LYD`, `currency:TND`, `currency:MAD`, `currency:DZD`, `currency:USD`, `currency:EUR`, `currency:GBP`, `currency:JPY`, `currency:CHF`, `currency:CNY`, `currency:INR`, `currency:KRW`, `currency:KPW`, `currency:SGD`, `currency:HKD`, `currency:MYR`, `currency:AUD`, `currency:NZD`, `currency:CAD`, `currency:SEK`, `currency:NOK`, `currency:DKK`, `currency:ISK`, `currency:TRY`, `currency:RUB`, `currency:ZAR`.

**Rationale**:

- `packages/logic/src/utils/currency-data.ts` defines 35 supported currencies for the product.
- `packages/logic/src/metals/rate-reference.ts` explicitly excludes BTC from Metals ISO rate references.
- Existing current Metals valuation supports Gold/Silver only.
- A whole-snapshot contract is easiest to reason about and test when completeness is deterministic rather than consumer-dependent.

**Root mapping**:

- `gold_usd_per_gram` ↔ `metal:GOLD`
- `silver_usd_per_gram` ↔ `metal:SILVER`
- each supported non-USD currency `<code>_usd` ↔ `currency:<CODE>`
- `currency:USD` ↔ implicit exact decimal `1`

The existing wide row's `platinum_usd_per_gram`, `palladium_usd_per_gram`, and `btc_usd` remain stored/validated by existing producer rules but are outside the V1 trusted Metals observation contract.

**Alternatives considered**:

- Only require observations for currently visible/default currencies: rejected because preferred/searchable currency can change without a refresh, creating consumer-dependent completeness.
- Include BTC, platinum, and palladium: rejected because issue #302 explicitly preserves the current Gold/Silver + fiat product scope rather than expanding it.

## Decision 4: Preserve exact rate semantics and allow null provider time as Unknown

**Decision**:

- Metal observations produced by this path use `usd_per_pure_gram / quote_per_base`.
- Currency observations produced by this path use `usd_per_currency_unit / quote_per_base`.
- `quality` must be `valid` for a producer snapshot to be eligible.
- `currency:USD` must equal exact canonical decimal `1`.
- Provider observation time may be null only as an explicit Unknown-trust state; it must never be filled from capture/fetch/sync/restart time.

**Rationale**: These are the existing `rate-reference.ts` invariants. Issue #302 fixes identity/atomicity, not the meaning of validity/freshness.

**Alternative considered**: Reject the entire snapshot whenever provider timestamp is absent. Rejected because the approved existing business rule allows an otherwise valid rate with Unknown freshness; issue #302 must not redefine that rule.

## Decision 5: Use root `created_at` only for immutable ordering, never freshness

**Decision**: A single producer capture timestamp is stored as root/observation capture ordering metadata. Selection ordering uses `(market_rates.created_at DESC, market_rates.id DESC)`; freshness remains per observation from provider time.

**Rationale**:

- The current `MarketRate.isStale()` and `useMarketRates.lastUpdated` derive recency from `created_at`, which is precisely the local/server timestamp substitution the approved spec forbids for trust freshness.
- Ordering still needs a deterministic producer event time so an older snapshot delivered later cannot beat a newer one merely because of receipt order.

**Alternatives considered**:

- Select by local insertion/receipt time: rejected; it makes delayed older deliveries look newer.
- Select by a single provider timestamp: rejected; metal and currency timestamps can differ and a missing provider timestamp must remain Unknown, not destroy ordering.

## Decision 6: Add a fail-closed complete-snapshot pull RPC

**Decision**: Add `pull_market_rate_snapshots_page_v1` that returns root + bound observations as one envelope and filters out any candidate that is not demonstrably complete/valid under the V1 identity contract.

**Rationale**:

- Current mobile refresh pulls `market_rates` and observations independently, so even a local transaction cannot prove the two remote result windows describe the same snapshot.
- The mobile selector needs an atomic wire unit it can validate before Watermelon writes.
- Paging by roots simplifies cursor semantics and ensures observations are subordinate to a known root.

**Alternative considered**: Keep the two existing pull functions and join by ID in mobile. Rejected because the two network snapshots can observe different server states and still race despite client-side joining.

## Decision 7: Use one Watermelon selected-snapshot service for all current consumers

**Decision**: Introduce a service-level local read model that selects the newest complete valid snapshot envelope and exposes both the wide `MarketRate` root and normalized trust observations together.

**Rationale**:

- `useMarketRates()` currently selects newest `market_rates` independently.
- `observeLiveRatesTrust()` currently selects newest observations independently per instrument.
- Live Rates combines those streams; Metals hooks also subscribe to trust separately.
- A single selector eliminates cross-batch certification by construction while preserving the constitution's WatermelonDB source-of-truth rule.

**Alternatives considered**:

- Store a global selected snapshot ID in React context: rejected because selection must survive app restart/offline and be reconstructed from durable local data; context is lifecycle state, not durable truth.
- Add a local-only selected-snapshot table: rejected as unnecessary. Selection is deterministic from complete cached envelopes; a persisted pointer introduces stale-pointer repair complexity.
- Let every hook perform its own keyed join: rejected because duplicated selection logic can drift and reintroduce inconsistent promotion timing.

## Decision 8: Historical trend rows remain separate from current trust selection

**Decision**: Preserve historical `market_rates` queries (for example previous-day trend comparisons) as historical inputs, but never let them certify the current snapshot's trust metadata.

**Rationale**: The feature concerns current-rate identity. Historical trend calculation needs prior wide values and can remain a separate query as long as the displayed current value/trust pair is snapshot-bound.

**Alternative considered**: Require 37 observations for all historical trend rows before they can be read. Rejected because it would unnecessarily invalidate legacy historical trend data and expand issue #302 beyond current-rate trust.

## Decision 9: Legacy rows are not backfilled by inference

**Decision**:

- Add the new FK as `NOT VALID` so it enforces future writes without asserting old rows were correctly bound.
- Do not rewrite legacy `batch_id` values based on timestamps or matching decimals.
- Pull/selection requires a provable root ID + exact complete child set; legacy unmatched data is simply ineligible.

**Rationale**: This directly implements FR-020 and avoids deployment failure if historical observations contain arbitrary/unmatched batch IDs.

**Alternatives considered**:

- Validate the FK immediately: rejected because historical data shape is not guaranteed and a migration failure would block the safe producer cutover.
- Guess historical bindings then validate: rejected because it would falsely certify provenance.
- Delete all legacy market data during migration: rejected because historical trends/offline cache should not be destroyed merely to simplify cutover.

## Decision 10: Enforce new-write uniqueness in the RPC, not by destructive legacy cleanup

**Decision**: Add a non-unique `(batch_id, instrument_code)` index and have the persistence RPC require exactly one of each instrument. Do not add a unique constraint that could fail on unknown legacy duplicates unless implementation-time local/production inspection proves it is safe without modifying evidence.

**Rationale**: PostgreSQL cannot add a normal unique constraint as `NOT VALID`. For issue #302 correctness, all new writes go through the privileged RPC and all selectors fail closed on duplicate child rows. That provides the guarantee without deduplicating old evidence.

**Future option**: Once legacy data is audited/cleaned, a follow-up migration can add `UNIQUE(batch_id, instrument_code)` and validate the FK.

## Decision 11: No new retention duration or cleanup job

**Decision**: Issue #302 does not introduce a new market-rate retention period. Existing cached/history behavior remains. Any deletion path that already exists or is added later must delete root + observations as one unit and cannot remove the last complete local selected snapshot without a replacement.

**Rationale**: The spec requires integrity under retention but does not require storage-policy redesign. Not adding pruning is safest for offline last-known-good behavior.

**Alternative considered**: Reuse the general 90-day snapshot retention constant. Rejected because that constant governs other daily snapshot tables and applying it here would be an unrelated business-policy change.

## Decision 12: Child cleanup uses root-level cascade semantics

**Decision**: The future-write FK uses `ON DELETE CASCADE` so intentional server root retention cannot leave orphan trust observations.

**Rationale**: The snapshot is an integrity unit. A root without children or children without a root cannot be selected.

**Alternative considered**: `RESTRICT`. Rejected because retention would then require fragile manual child-first deletion and could leave partial state if a cleanup implementation is incorrect.

## Decision 13: Realtime is a trigger, never a selector

**Decision**: Keep the app-level realtime subscription to `market_rates` inserts, but its callback only invokes the normal sync/pull path. It never marks the inserted root current by itself.

**Rationale**: Realtime notifications can arrive before related rows are visible locally/remotely. The complete pull RPC is the correctness boundary.

## Decision 14: Security boundary

**Decision**:

- `persist_market_rate_snapshot_v1`: service role only; explicit revoke from PUBLIC/anon/authenticated.
- `pull_market_rate_snapshots_page_v1`: read-only shared-market path following existing authentication/RLS conventions.
- No API keys/provider secrets in logs or returned client payloads.
- Structured reason codes accompany rejected/conflicting snapshots for operational diagnosis.

**Rationale**: Current-market data is shared/read-only for clients; only trusted backend producer code should create atomic snapshots.

## Decision 15: Schema generation impact

**Decision**: Use next numbered migration `069_atomic_market_rate_snapshots.sql`. After adding functions/constraints/indexes, run the repository DB generation workflow. `packages/db/src/supabase-types.ts` is expected to gain RPC signatures; Watermelon table columns are not expected to change, so `schema.ts`/`migrations.ts` should remain semantically unchanged unless the generator produces a required metadata update.

**Rationale**: This honors Constitution VII without inventing a local schema version bump for a server-only constraint/function change.

## Decision 16: Verification must be failure-first and cross-boundary

**Decision**: Implement tests before production changes and explicitly cover server transactionality, pull envelope completeness, local selection, restart/offline reconstruction, and cross-consumer identity consistency.

**Rationale**: A unit test for only the producer or only the hook would not prove issue #302's end-to-end guarantee. FR-023/SC-009 require the full deterministic matrix.

## Environment limitation during research

The connected environment does not expose a shell runner, so Speckit helper scripts, Supabase CLI, SQL tests, Jest, lint, and typecheck were not executed during research. Repository files and current official Supabase documentation were inspected directly; implementation-time verification commands are recorded in `quickstart.md`.