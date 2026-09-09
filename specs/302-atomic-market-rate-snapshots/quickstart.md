# Quickstart: Atomic Market-Rate Snapshot Implementation & Verification

**Feature**: `302-atomic-market-rate-snapshots`  
**Branch**: `codex/issue302-atomic-market-rate-snapshots`  
**Revision**: Post-Analyze corrections

This is the implementation-time guide. None of the commands below were executed during planning because this connected environment has no repository shell runner.

## 1. Non-negotiable first gate

Before any production-code task, update and commit:

```text
docs/business/business-decisions.md
```

Record the finalized issue #302 rules:

- top-level/persisted snapshot identity is `market_rates.id`;
- observations bind through `batch_id = market_rates.id`;
- a complete current snapshot has exactly 37 observations;
- current authoritative financial values are exact bound observation decimals, not Watermelon `MarketRate` numbers;
- producer persistence, pull, and local application are atomic/fail-closed;
- provider observation time is the only freshness authority;
- trusted producer source identity is required;
- legacy unbound data is never inferred into a trusted snapshot;
- current snapshots never rewrite acquisition/terminal rate evidence.

Do not start a production implementation task until this documentation commit exists.

## 2. Read the approved contract

Read:

```text
specs/302-atomic-market-rate-snapshots/spec.md
specs/302-atomic-market-rate-snapshots/plan.md
specs/302-atomic-market-rate-snapshots/research.md
specs/302-atomic-market-rate-snapshots/data-model.md
specs/302-atomic-market-rate-snapshots/contracts/market-rate-snapshots.openapi.yaml
docs/business/business-decisions.md
.agent/workflows/sprint-issue.md
.agent/workflows/pr-comment-followup.md
.specify/memory/constitution.md
AGENTS.md
```

Use strict TDD: write the failing boundary test, run it and confirm the intended failure, then implement the smallest correct change.

## 3. Exact provider-ingestion boundary

The current Edge Function uses `response.json()`, which would parse provider rate tokens through JavaScript binary numbers. Issue #302 must replace that authoritative path.

Tests first in/around:

```text
supabase/functions/_shared/market-rate-snapshot-contract.test.ts
```

Required cases:

- provider token `0.10000000000000001` reaches the RPC payload unchanged;
- another high-precision decimal reaches the RPC payload unchanged;
- malformed/non-positive required rate rejected;
- exactly 37 observations;
- USD exact `1`, BTC excluded;
- Gold/Silver use provider metal time;
- fiat uses provider currency time;
- null provider time remains null;
- source is non-empty `metals.dev`;
- no authoritative `Number(...)` / `response.json()` round-trip precedes RPC payload creation.

Update:

```text
supabase/functions/fetch-metal-rates/deno.json
supabase/functions/_shared/market-rate-snapshot-contract.ts
supabase/functions/fetch-metal-rates/index.ts
```

Use a pinned function-local `lossless-json@4.3.1` dependency. Read `response.text()`, parse losslessly, convert numeric tokens directly to canonical decimal text, then validate the exact-string shape with Zod.

## 4. Database/RPC contract

Create:

```text
supabase/migrations/069_atomic_market_rate_snapshots.sql
supabase/tests/atomic_market_rate_snapshots_test.sql
```

Migration responsibilities:

- `NOT VALID` FK `market_rate_observations.batch_id -> market_rates.id ON DELETE CASCADE`;
- `(batch_id, instrument_code)` lookup index;
- service-role-only `persist_market_rate_snapshot_v1`;
- read-only `pull_market_rate_snapshots_page_v1`;
- exact decimal-string request boundary;
- explicit grants/revokes.

SQL red-test matrix:

- valid exact 37-observation insert;
- missing/duplicate/unexpected observation rejection;
- invalid quality/unit/orientation/value rejection;
- null, empty, and whitespace-only source rejection;
- root/observation exact value mismatch rejection;
- null provider time accepted as Unknown-capable evidence;
- identical replay idempotency;
- conflicting replay rollback;
- incomplete/legacy/duplicate/source-invalid envelope omitted by pull;
- cursor ordering / older-delivery non-regression;
- normal clients cannot execute persistence;
- deleting a root cascades all bound observations.

Do not apply DDL through remote MCP/dashboard. Use the repository local migration workflow.

## 5. Regenerate database contracts

After local migration/RPC tests:

```bash
npm run db:sync-local
npm run test:scripts
```

Expected review result:

- `packages/db/src/supabase-types.ts` gains RPC signatures;
- no local table column was added, so `schema.ts`/`migrations.ts` should remain semantically table-shape equivalent unless generation legitimately changes metadata.

Review generated diffs; never hand-edit generated output to force the expectation.

## 6. Complete-snapshot pull and local apply

Tests first:

```text
apps/mobile/__tests__/services/sync/pull-market-rate-snapshots.test.ts
apps/mobile/__tests__/services/live-rates-refresh-service.test.ts
```

The pull RPC must return exact root decimal text + exact observations. The mobile adapter must:

1. validate one top-level `snapshotId`;
2. require all observation `batchId`s to match it;
3. validate exact 37 membership/source/quality/unit/orientation/value semantics;
4. compare exact root text to exact observation text before local conversion;
5. only then convert wide root fields for Watermelon compatibility storage;
6. preserve observation `value_decimal` exact text;
7. write root + children in one Watermelon writer/page unit;
8. advance cursor only after successful full-page apply.

Failure/replay assertions:

- malformed/partial page fails;
- cursor is not advanced;
- cached complete A stays intact;
- duplicate replay is idempotent.

## 7. Exact selected snapshot service

Tests first for:

```text
packages/logic/src/metals/current-market-snapshot.ts
apps/mobile/services/market-rate-snapshot-read-model-service.ts
```

Minimum cases:

1. no complete snapshot -> null;
2. complete A -> A;
3. newer incomplete B -> A;
4. unrelated batch children cannot repair B;
5. complete valid B -> B;
6. invalid quality/unit/value/source B -> A;
7. null/future provider time -> Unknown, no timestamp substitution;
8. older Z arriving later cannot regress selection;
9. remove one required B observation -> B becomes ineligible; fall back to A if present;
10. if no complete candidate remains -> null/unavailable;
11. restart/offline reconstructs from exact cached observations;
12. deliberately divergent wide-root numeric compatibility value cannot alter current financial output because current output uses observation `value_decimal`.

The exported current selected snapshot must expose exact decimal strings / normalized exact rate references, not wide Watermelon `MarketRate` numeric columns as current financial truth.

## 8. Cut over current calculations and consumers

Known current consumers:

```text
apps/mobile/hooks/useMarketRates.ts
apps/mobile/hooks/useLiveRatesScreen.ts
apps/mobile/hooks/useMetalPortfolio.ts
apps/mobile/hooks/useMetalHoldingDetail.ts
apps/mobile/hooks/useNetWorth.ts
apps/mobile/services/net-worth-read-model-service.ts
apps/mobile/services/live-rates-trust-read-model-service.ts
apps/mobile/providers/MarketRatesRealtimeProvider.tsx
```

Rules:

- current displayed financial rates and valuations consume exact selected observation values;
- exact current currency conversion uses the shared Decimal helper;
- current freshness/source/quality come from the same observation map;
- previous-day/trend wide rows remain explicitly historical/non-certifying;
- acquisition/terminal `metal_rate_references` stay immutable/separate;
- missing exact current input makes only dependent output unavailable.

Repository bypass search before completion:

```text
observeLiveRatesTrust
market_rates
market_rate_observations
useMarketRates
latestRates
isStale()
getAge()
gold_usd_per_gram
egp_usd
convertCurrency
getMetalPrice
```

Classify every hit as selected exact current use, historical/trend use, test/fixture, or unrelated. No authoritative current calculation may read wide `MarketRate` numeric fields directly.

## 9. Realtime and local QA import

Realtime root INSERT is a sync trigger only; it never promotes the notified root.

Update local QA import tests/code so `scripts/import-market-rates-to-local.js` imports only complete root + bound observation snapshot units. A root-only import is intentionally untrusted and must not masquerade as current QA truth.

## 10. Automated verification

Run focused tests first, then static/broader checks. Record exact commands/results in PR evidence.

```bash
# Local Supabase / migration
npm run db:reset
# execute supabase/tests/atomic_market_rate_snapshots_test.sql using the repo's established SQL test mechanism

# Shared logic
npm test -w @monyvi/logic -- --runInBand current-market-snapshot

# Mobile focused Jest
npm test -w @monyvi/mobile -- --runInBand market-rate-snapshot live-rates-refresh useMarketRates useLiveRatesScreen useMetalPortfolio useMetalHoldingDetail useNetWorth

# Mobile static checks
npm run typecheck -w @monyvi/mobile
npm run lint -w @monyvi/mobile

# Repository checks required by CI
npm run lint
npm run test:scripts
```

Also run the Edge/shared tests using the repository's established Supabase/Deno test command and record the exact command. Never claim a check passed without fresh output.

## 11. Deterministic acceptance matrix

| Scenario | Expected result |
| --- | --- |
| lossless provider decimal | exact lexical rate reaches RPC unchanged |
| successful refresh | one complete new snapshot becomes current |
| partial producer failure | no partial durable truth |
| failed refresh with cached A | A remains current |
| identical same-ID replay | no duplicate truth/change |
| conflicting same-ID replay | reject; prior snapshot unchanged |
| missing/blank source | candidate rejected/ineligible |
| root/observation mismatch | candidate rejected before local apply |
| newer incomplete B | A remains current |
| remove selected B evidence | B ineligible; fallback A or null; no cross-batch repair |
| root delete | bound remote observations cascade |
| delayed older Z | no selection regression |
| offline restart | cached exact selected snapshot reconstructs |
| no selected snapshot | dependent financial output unavailable; holdings remain |
| missing/future provider time | freshness Unknown; no local substitute |
| wide root numeric divergence | cannot alter exact current financial result |
| cross-consumer read | exact current value + trust share one snapshot identity |
| historical acquisition/terminal refs | unchanged and never rewritten from current snapshot |

## 12. Manual regression

No visual redesign is intended. Verify existing Home, Live Rates, My Metals, and holding detail navigation/layout in EN/AR and online/offline states. Failed refresh must not blank/zero a valid cached snapshot. Manual checks do not replace atomicity/exactness tests.

## 13. Rollout sanity

Before issue completion:

1. business-decisions update was committed before production implementation;
2. provider parse is lossless/pinned;
3. migration/RPC tests pass locally;
4. generated types are committed;
5. producer writes through atomic RPC only;
6. pull returns exact complete envelopes only;
7. all current consumers use exact selected observation values;
8. no legacy inference/backfill was introduced;
9. no new retention policy was introduced;
10. retention/corruption tests pass;
11. focused tests, typecheck/lint, required CI are evidenced;
12. manual-only gaps are named honestly.