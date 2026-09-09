# Research: Atomic Market-Rate Snapshots

**Feature**: `302-atomic-market-rate-snapshots`  
**Date**: 2026-09-09  
**Revision**: Post-third-Analyze I1 remediation

This research resolves implementation decisions deferred by the approved specification and incorporates findings from the first three Speckit Analyze passes. It does not change approved user/business requirements.

## Decision 1: Reuse `market_rates.id` as the immutable snapshot identity

**Decision**: Use the existing UUID primary key `market_rates.id` as the canonical persisted snapshot identity. Bound current observations use `market_rate_observations.batch_id = market_rates.id`.

The wire contract carries the identity once as top-level `snapshotId`; the persistence RPC materializes that value into `market_rates.id` and requires every observation to bind to it. The nested logical root payload does not carry a second independent ID.

**Rejected alternatives**: a third durable snapshot table; provider timestamps as identity; local receipt/capture time as identity.

## Decision 2: Persist root + observations through one privileged Postgres RPC

**Decision**: Add `persist_market_rate_snapshot_v1` and invoke it with `.rpc()` from `fetch-metal-rates`. The function owns validation, idempotency/conflict detection, and the multi-table transaction.

**Rationale**: The database function is the durable all-or-nothing boundary for the wide root and its evidence set. Sequential Edge client inserts can expose partial state.

## Decision 3: A complete V1 snapshot contains exactly 37 trust observations

**Decision**: Require exactly one observation for Gold, Silver, and all 35 currencies exported by `SUPPORTED_CURRENCIES`, including `currency:USD` and excluding BTC.

The root mapping is Gold/Silver to USD-per-gram numeric columns, every supported non-USD fiat to its `<code>_usd` numeric column, and USD to implicit exact identity `1`. Platinum, palladium, BTC, and CNH remain compatibility/provider fields only.

## Decision 4: Current financial truth comes from exact observation decimals

For the selected current snapshot, `market_rate_observations.value_decimal` is authoritative. The selected-snapshot service exposes exact canonical decimal strings / normalized exact references to current calculations and current displayed financial rates.

The wide `market_rates` row remains identity/order/history compatibility. After pull, Watermelon `MarketRate` numeric fields MUST NOT be authoritative current valuation/conversion inputs because they cross JavaScript/SQLite numeric representation.

The existing PostgreSQL wide columns use legacy `numeric(15,4)` scale caps. Migration 069 widens those columns to unconstrained `numeric` so exact producer values are not rounded before replay or pull validation; it adds no columns and does not change the Watermelon field shape.

## Decision 5: Parse provider numeric tokens losslessly and normalize exponent notation exactly

`fetch-metal-rates` reads `response.text()` and parses it with pinned `lossless-json@4.3.1`. Authoritative rate tokens never pass through `response.json()`, `Number`, or `parseFloat` before the exact persistence payload is built.

Metals.Dev may encode valid JSON rates using ordinary decimal or scientific notation. Therefore the provider adapter accepts the full JSON-number notation exposed by the lossless parser and converts each positive rate token to the feature's plain-decimal grammar with base-10 string/exponent manipulation only.

Examples:

- `0.10000000000000001` -> `0.10000000000000001`
- `3.73874e-10` -> `0.000000000373874`
- `1.2300e+2` -> `123.00`

Normalization is exact: no rounding, no binary-float conversion, and all coefficient digits are retained. Trailing coefficient precision is retained when expanded into plain notation. The resulting string is then validated as a positive plain decimal and passed to the RPC.

**Rejected alternative**: reject scientific notation because the downstream contract wants plain decimals. That would reject valid provider JSON notation rather than normalizing it safely.

## Decision 6: Normalize missing/malformed/future provider times to Unknown at the producer boundary

Provider observation timestamps are separate from the numeric precision contract.

For each provider timestamp:

- valid parseable non-future timestamp -> preserve as provider observation time;
- missing value -> `null`;
- malformed/unparseable value -> `null`;
- timestamp later than the immutable request capture/order instant -> `null`.

`null` is the persisted producer representation of Unknown freshness. The capture/order instant is used only as a comparison ceiling to identify future provider time; it is never substituted as observation time.

This keeps FR-009/FR-010 deterministic before the Postgres `timestamptz` boundary and prevents a malformed string from becoming a persistence-shape problem.

## Decision 7: Preserve current rate semantics and trusted source identity

Producer observations use:

- Metals: `usd_per_pure_gram / quote_per_base`.
- Fiat: `usd_per_currency_unit / quote_per_base`.
- `quality = valid`.
- non-empty trimmed source identity (`metals.dev`).
- exact `currency:USD = 1`.

Null provider time yields Unknown freshness and does not make a valid rate value unavailable by itself.

## Decision 8: Root `created_at` is ordering metadata only

Selection ordering uses `(market_rates.created_at DESC, market_rates.id DESC)`. Root `created_at` protects against delayed older delivery; it never classifies financial freshness.

## Decision 9: Pull complete envelopes through one RPC

Add `pull_market_rate_snapshots_page_v1`, paging by root ordering under a fixed upper watermark and returning only provably complete, valid, bound envelopes.

The response returns top-level `snapshotId`, exact plain-decimal root values, and all bound observations. The mobile adapter validates root/observation equivalence before converting wide values for Watermelon compatibility storage.

## Decision 10: PersistedObservation is one explicit closed wire object

The OpenAPI `RateObservationInput` is a closed request object. A persisted pull row adds `id`, `batchId`, and `capturedAt`.

Do **not** model `PersistedObservation` as `allOf: [RateObservationInput, closed-extension]`, because `additionalProperties: false` in the base subschema rejects properties introduced only by the extension. Instead, define `PersistedObservation` explicitly as one closed object containing all ten fields.

This makes the contract unambiguous to JSON Schema/OpenAPI validators and code generators.

## Decision 11: One Watermelon selected-snapshot service owns current selection

`market-rate-snapshot-read-model-service.ts` is the only current selector. It derives selection from persisted root identity/order plus exact bound observations and exports current-rate values from observation `value_decimal` strings.

The service requires exactly 37 rows, rejects invalid binding/value/quality/unit/orientation/source, validates freshness from provider time only, never borrows another batch's rows, and reconstructs after restart without a persisted selected pointer.

## Decision 12: Current calculation helpers consume exact snapshot rates

`packages/logic/src/metals/current-market-snapshot.ts` owns pure exact-decimal access/conversion helpers over the selected observation map. Current Live Rates, Metals valuation, holding detail, current net-worth conversions, and other current calculations use these helpers or equivalent exact interfaces.

Historical previous-day/trend queries may continue to read legacy `market_rates` rows as historical inputs only.

## Decision 13: Legacy rows are never backfilled by inference

Add the FK as `NOT VALID`; do not guess historical `batch_id` relationships or rewrite legacy evidence. Only a provable bound complete snapshot is eligible for new current selection.

## Decision 14: New-write uniqueness is enforced without destructive legacy cleanup

Use a non-unique `(batch_id, instrument_code)` lookup index. `persist_market_rate_snapshot_v1` requires exactly one row per required instrument; pull/local selection rejects duplicates.

## Decision 15: Source identity is required for a trusted producer snapshot

A newly trusted issue #302 current producer snapshot requires a non-empty trimmed source for every required observation. Null, empty, or whitespace-only source rejects the candidate at producer, RPC, pull-envelope, and local-selector boundaries.

## Decision 16: No new retention duration; integrity is tested explicitly

Issue #302 introduces no pruning duration or cleanup job. The future-write FK uses `ON DELETE CASCADE`. Tests prove root deletion removes bound observations, removed local evidence invalidates the candidate, no cross-batch repair occurs, and selection falls back to an earlier complete candidate or `null`.

## Decision 17: Realtime is a trigger, never a selector

The app-level realtime subscription may continue listening to `market_rates` inserts, but its callback only triggers the normal complete-snapshot sync. Notification receipt never promotes the notified root directly.

## Decision 18: Local/manual QA imports complete snapshot units

The existing local importer must import only complete root + matching observation envelopes under the same rules as production pull; otherwise QA would create intentionally untrusted root-only data.

## Decision 19: Security boundary

- `persist_market_rate_snapshot_v1`: revoke PUBLIC/anon/authenticated; grant trusted producer/service role only.
- `pull_market_rate_snapshots_page_v1`: read-only shared-market contract under existing app access conventions.
- Logs may contain snapshot IDs/reason codes, never provider API keys or unrelated user financial data.

## Decision 20: Schema generation impact

Use `069_atomic_market_rate_snapshots.sql`. The migration adds functions, a future-write FK, and an index but no Watermelon table columns. Expected generated change is primarily RPC signatures in `packages/db/src/supabase-types.ts`; generated output must still be produced through repository scripts.

## Decision 21: Business documentation is a hard gate before code implementation

The finalized issue #302 business rules must be written into `docs/business/business-decisions.md` as the first implementation task. No production-code task may begin before that documentation commit exists.

## Decision 22: Edge handler verification uses one exact test path and root command

The producer HTTP logic is extracted to:

```text
supabase/functions/fetch-metal-rates/handler.ts
```

with its exact handler-level test at:

```text
supabase/functions/fetch-metal-rates/handler.test.ts
```

The shared parser contract remains tested at:

```text
supabase/functions/_shared/market-rate-snapshot-contract.test.ts
```

Implementation adds the root package script:

```text
test:market-rate-edge = tsx --test supabase/functions/_shared/market-rate-snapshot-contract.test.ts supabase/functions/fetch-metal-rates/handler.test.ts
```

and a `Market Rate Edge Contract` step in `.github/workflows/ci.yml`'s `quality` job running `npm run test:market-rate-edge`.

This is a new issue #302 CI obligation; current CI is not assumed to run these tests already.

## Decision 23: Node/tsx and Deno own matching exact dependency resolutions

The shared parser/handler source runs under two resolvers during the issue #302 lifecycle: root Node/`tsx` for deterministic tests and Deno for the deployed Edge function. Neither resolver may implicitly depend on the other's configuration.

**Decision**:

- root `package.json` declares exact devDependencies `lossless-json: "4.3.1"` and `zod: "4.4.3"` and the resulting `package-lock.json` is committed;
- `supabase/functions/fetch-metal-rates/deno.json` maps bare `lossless-json` to `npm:lossless-json@4.3.1` and bare `zod` to `npm:zod@4.4.3`;
- shared parser/handler source imports only those bare specifiers;
- version parity is a release verification item.

**Rationale**: Node/`tsx` resolves npm metadata from the root package/lock and does not consume the function's Deno import map. Deno owns its function-local import map and should not depend on root Node module resolution. Matching exact versions make the same source deterministic in both environments while keeping runtime ownership explicit.

The existing mobile workspace's `zod` dependency is not accepted as implicit root test ownership even if npm happens to hoist it. The issue #302 Edge test contract must remain reproducible without workspace-hoisting assumptions.

**Rejected alternatives**: Deno-only dependency declaration with Node relying on the import map; Node relying on a hoisted workspace Zod; divergent version ranges between npm and Deno; URL/runtime-specific imports in the shared source.

## Decision 24: Verification is failure-first and cross-boundary

The matrix must include Node/Deno dependency parity, lossless ordinary/scientific provider decimals, missing/malformed/future timestamp normalization, source rejection, transactional persistence/replay/conflict, root-delete cascade, complete-envelope paging, local corruption/no-cross-batch repair, offline/restart reconstruction, exact current calculation inputs, and current/historical evidence separation.

## Environment limitation during research

The connected planning environment has no repository shell runner, so Speckit helper scripts, Supabase CLI, SQL tests, Jest, lint, typecheck, dependency installation/checks, `npm run test:market-rate-edge`, and CI were not executed during research. Repository files were inspected directly; implementation-time verification commands are recorded in `quickstart.md`.
