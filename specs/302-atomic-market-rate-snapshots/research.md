# Research: Atomic Market-Rate Snapshots

**Feature**: `302-atomic-market-rate-snapshots`  
**Date**: 2026-09-09  
**Revision**: Post-Analyze corrections

This research resolves the implementation decisions intentionally deferred by the approved specification and incorporates the findings from the first Speckit Analyze pass. It does not change the approved user/business requirements.

## Decision 1: Reuse `market_rates.id` as the immutable snapshot identity

**Decision**: Use the existing UUID primary key `market_rates.id` as the canonical persisted snapshot identity. Bound current observations use `market_rate_observations.batch_id = market_rates.id`.

The wire contract carries the identity once as top-level `snapshotId`; the persistence RPC materializes that value into `market_rates.id` and requires every observation to bind to it. The nested logical root payload does not carry a second independent ID.

**Rationale**:

- `market_rates` already represents one producer refresh and already has a UUID key.
- `market_rate_observations.batch_id` is already UUID-shaped.
- One top-level identity avoids divergent `snapshotId` versus `root.id` values in service contracts.

**Rejected alternatives**: a third durable snapshot table; provider timestamps as identity; local receipt/capture time as identity.

## Decision 2: Persist root + observations through one privileged Postgres RPC

**Decision**: Add `persist_market_rate_snapshot_v1` and invoke it with `.rpc()` from `fetch-metal-rates`. The function owns validation, idempotency/conflict detection, and the multi-table transaction.

**Rationale**: Supabase JavaScript calls do not provide a client-side multi-statement transaction wrapper that can make two independent inserts atomic. The database function is the durable all-or-nothing boundary.

**References checked during planning**:

- Supabase Database Functions documentation.
- Supabase JavaScript `rpc()` documentation.
- Supabase Edge Function dependency documentation.

## Decision 3: A complete V1 snapshot contains exactly 37 trust observations

**Decision**: Require exactly one observation for:

- `metal:GOLD`
- `metal:SILVER`
- all 35 currencies exported by `SUPPORTED_CURRENCIES`, including `currency:USD` and excluding BTC.

The root mapping is Gold/Silver to their USD-per-gram numeric columns, every supported non-USD fiat to its `<code>_usd` numeric column, and USD to implicit exact identity `1`.

Platinum, palladium, BTC, and CNH remain compatibility/provider fields only and are not current Metals V1 trust observations.

## Decision 4: Current financial truth comes from exact observation decimals, not wide-row JavaScript numbers

**Decision**: For the selected **current** snapshot, `market_rate_observations.value_decimal` is the authoritative financial value. The selected-snapshot service exposes exact canonical decimal strings / normalized exact rate references to all current calculations and current displayed financial rates.

The wide `market_rates` row remains necessary for:

- persisted snapshot identity and immutable ordering;
- existing historical/trend compatibility;
- server-side exact root-to-observation equivalence checks while both sides are PostgreSQL `numeric` / exact request strings.

After pull, Watermelon `MarketRate` numeric fields are compatibility/history data only. They MUST NOT be used as authoritative current valuation/conversion inputs because they cross a JavaScript/SQLite numeric boundary.

**Rationale**:

- Current generated `market_rates` fields are JavaScript `number` values.
- Current `market_rate_observations.value_decimal` is already exact text locally and PostgreSQL numeric remotely.
- FR-015 requires supplied decimal precision to survive through the authoritative financial calculation boundary.
- Reusing the exact child values removes the need to redesign the wide table or add duplicate exact columns.

**Rejected alternative**: continue feeding `MarketRate` numbers into current valuation helpers and treat the observation rows as provenance only. That would preserve the original precision defect.

## Decision 5: Parse the Metals.Dev response losslessly before any authoritative numeric conversion

**Decision**: `fetch-metal-rates` reads `response.text()` and parses the JSON with a pinned lossless-number parser (`lossless-json@4.3.1`, declared in the function-local `deno.json`). Rate number tokens are converted directly to canonical decimal text without first becoming JavaScript `number` values.

The transformed exact-string provider object is then validated with Zod and mapped into the RPC payload. The persistence RPC casts root decimal strings to PostgreSQL `numeric` and stores observation `value_decimal` exactly.

A JavaScript `number` conversion is permitted only after authoritative persistence/validation for legacy informational response fields or non-authoritative compatibility storage; it is never used to create the exact current financial truth.

**Rationale**:

- Metals.Dev documents its rates as JSON number tokens.
- `response.json()` necessarily parses those tokens through JavaScript binary numbers.
- Zod validation performed *after* `response.json()` cannot restore lexical precision already lost.
- `lossless-json` is a focused zero-dependency package intended to preserve JSON numeric information, and Supabase Edge Functions support pinned npm dependencies.

**Required regression**: include a provider rate token such as `0.10000000000000001` (and another high-precision decimal) and prove the exact lexical value reaches the RPC request unchanged.

## Decision 6: Preserve current rate semantics and provider-time-only freshness

Producer observations use:

- Metals: `usd_per_pure_gram / quote_per_base`.
- Fiat: `usd_per_currency_unit / quote_per_base`.
- `quality = valid`.
- non-empty trimmed source identity (`metals.dev` for this producer).
- exact `currency:USD = 1`.

Provider observation time may be null and then yields Unknown freshness. Missing/unparseable/future provider time is never repaired using capture, root creation, sync, receipt, or restart time.

## Decision 7: Root `created_at` is immutable ordering metadata only

Selection ordering uses `(market_rates.created_at DESC, market_rates.id DESC)`. Root `created_at` establishes producer ordering and protects against delayed older delivery; it never classifies financial freshness.

## Decision 8: Pull complete envelopes through one RPC

**Decision**: Add `pull_market_rate_snapshots_page_v1`, paging by root ordering under a fixed upper watermark and returning only provably complete, valid, bound envelopes.

The response returns top-level `snapshotId`, exact-string logical root rate values, and all bound observations. The mobile adapter validates exact root/observation equivalence **before** converting wide values for Watermelon compatibility storage.

Legacy/unbound/incomplete/duplicate-source candidates are omitted rather than repaired.

## Decision 9: One Watermelon selected-snapshot service owns current selection

**Decision**: Introduce `market-rate-snapshot-read-model-service.ts` as the only current selector.

It derives selection from persisted Watermelon root identity/order plus the exact bound observation set. Its exported current-rate map is built from observation `value_decimal` strings and provider evidence; the wide `MarketRate` model is not exported as authoritative current-rate input.

The service:

- requires exactly 37 bound observations;
- rejects missing/duplicate/unexpected instruments, invalid value/quality/unit/orientation/source, and invalid binding;
- validates provider-time freshness without local substitution;
- never borrows rows from another batch;
- reconstructs after restart without a separately persisted selected pointer.

Exact root/value equivalence is checked server-side and again at the pull-envelope boundary before the root is converted to Watermelon compatibility numbers. On-device restart selection therefore trusts the exact cached observation set, not the wide numeric root.

## Decision 10: Current calculation helpers consume exact snapshot rates

`packages/logic/src/metals/current-market-snapshot.ts` owns pure exact-decimal access/conversion helpers over the selected observation map. Current Live Rates, Metals valuation, holding detail, account-currency conversion used by net worth, and other current-rate calculations consume these helpers or equivalent exact interfaces.

Historical previous-day/trend queries may continue to read legacy `market_rates` rows as historical display inputs, but those rows never certify current trust and never replace exact current valuation inputs.

## Decision 11: Legacy rows are never backfilled by inference

Add the FK as `NOT VALID`; do not guess historical `batch_id` relationships or rewrite legacy evidence. Only a provable bound complete snapshot is eligible for new current selection.

## Decision 12: New-write uniqueness is enforced without destructive legacy cleanup

Use a non-unique `(batch_id, instrument_code)` lookup index. `persist_market_rate_snapshot_v1` requires exactly one row per required instrument, and pull/local selection rejects duplicates. A future audited cleanup may add a database unique constraint, but issue #302 does not deduplicate old evidence.

## Decision 13: Source identity is required for a trusted producer snapshot

The generic historical rate-reference model can represent Unknown source, but a newly trusted issue #302 current producer snapshot must have a non-empty trimmed source for every required observation. Null, empty, or whitespace-only source rejects the candidate at producer, RPC, pull-envelope, and local-selector validation boundaries.

This is stricter only for the new trusted current snapshot envelope and implements FR-004's required source identity without rewriting historical evidence.

## Decision 14: No new retention duration; integrity is tested explicitly

Issue #302 introduces no pruning duration or cleanup job. The future-write FK uses `ON DELETE CASCADE`, and tests must prove root deletion removes bound observations.

Local selector tests must also prove:

- deleting/removing required evidence makes that snapshot ineligible;
- a surviving partial snapshot cannot be repaired with another batch;
- the previously selected complete candidate remains selected when still present;
- if no complete candidate remains, current selection becomes unavailable rather than using partial data.

## Decision 15: Realtime is a trigger, never a selector

The app-level realtime subscription may continue listening to `market_rates` inserts, but its callback only triggers the normal complete-snapshot sync. Notification receipt never promotes the notified root directly.

## Decision 16: Local/manual QA imports complete snapshot units

The existing local importer currently copies only `market_rates`. It must import only complete root + matching observation envelopes under the same rules as production pull; otherwise QA would create roots that are intentionally untrusted under the new contract.

## Decision 17: Security boundary

- `persist_market_rate_snapshot_v1`: revoke PUBLIC/anon/authenticated; grant trusted producer/service role only.
- `pull_market_rate_snapshots_page_v1`: read-only shared-market contract under existing app access conventions.
- Logs may contain snapshot IDs/reason codes, never provider API keys or unrelated user financial data.

## Decision 18: Schema generation impact

Use `069_atomic_market_rate_snapshots.sql`. The migration adds functions, a future-write FK, and an index but no Watermelon table columns. Expected generated change is primarily RPC signatures in `packages/db/src/supabase-types.ts`; generated output must still be produced through repository scripts, never hand-forced.

## Decision 19: Business documentation is a hard gate before code implementation

The finalized issue #302 business rules must be written into `docs/business/business-decisions.md` as the first implementation task. No production-code task may begin before that documentation commit exists. This satisfies Constitution II without treating late release documentation as sufficient.

## Decision 20: Verification is failure-first and cross-boundary

Tests precede each production boundary. The matrix must include:

- lossless provider decimal ingestion;
- source null/empty/whitespace rejection;
- transactional persistence/replay/conflict;
- root-delete cascade;
- complete-envelope paging and malformed-envelope rejection;
- local missing/corrupt evidence and no cross-batch repair;
- offline/restart reconstruction;
- exact current calculation inputs across every consumer;
- current/historical evidence separation.

## Environment limitation during research

The connected planning environment has no repository shell runner, so Speckit helper scripts, Supabase CLI, SQL tests, Jest, lint, and typecheck were not executed during research. Repository files and current provider/Supabase documentation were inspected directly; implementation-time verification commands are recorded in `quickstart.md`.