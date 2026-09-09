# Quickstart: Atomic Market-Rate Snapshot Implementation & Verification

**Feature**: `302-atomic-market-rate-snapshots`  
**Branch**: `codex/issue302-atomic-market-rate-snapshots`

This document is an implementation-time verification guide. None of the shell commands below were executed during Plan generation because the connected planning environment has no shell runner.

## 1. Prerequisites

- Node 22.x (`package.json` requires `>=22 <23`).
- Repository dependencies installed.
- Supabase CLI available through the repo dev dependency.
- Local Supabase runtime available for SQL/RPC tests.
- Mobile Jest/typecheck/lint dependencies installed.

## 2. Start from the approved contract

Before editing production code, read:

```text
specs/302-atomic-market-rate-snapshots/spec.md
specs/302-atomic-market-rate-snapshots/plan.md
specs/302-atomic-market-rate-snapshots/research.md
specs/302-atomic-market-rate-snapshots/data-model.md
specs/302-atomic-market-rate-snapshots/contracts/market-rate-snapshots.openapi.yaml
.agent/workflows/sprint-issue.md
.agent/workflows/pr-comment-followup.md
.specify/memory/constitution.md
AGENTS.md
```

Use strict TDD: add the failing acceptance test at the boundary being changed, demonstrate the failure, then implement the smallest correct change.

## 3. Database/RPC first

Create the next numbered migration:

```text
supabase/migrations/069_atomic_market_rate_snapshots.sql
```

It should add:

- safe `NOT VALID` FK from `market_rate_observations.batch_id` to `market_rates.id` with `ON DELETE CASCADE`;
- `(batch_id, instrument_code)` lookup index;
- service-role-only `persist_market_rate_snapshot_v1`;
- read-only `pull_market_rate_snapshots_page_v1`;
- explicit grants/revokes.

Add tests first:

```text
supabase/tests/atomic_market_rate_snapshots_test.sql
```

Target matrix:

- complete 37-instrument insert;
- missing/duplicate/unexpected observation rejection;
- root/observation value mismatch rejection;
- wrong quality/unit/orientation rejection;
- null provider time preserved as Unknown-capable evidence;
- identical replay idempotency;
- conflicting replay rollback;
- incomplete/legacy batch omitted by pull RPC;
- cursor ordering and no out-of-order regression;
- persistence RPC cannot be executed by normal clients.

Run the repository's local Supabase test/reset workflow appropriate to this repo. At minimum, reset/apply the migration locally and execute the SQL tests. Do not apply DDL directly through a remote dashboard/MCP.

## 4. Regenerate DB contracts

After the migration passes locally, regenerate repo DB artifacts through the existing scripts. The migration adds functions/constraints but no local table columns, so the expected semantic result is:

- `packages/db/src/supabase-types.ts` gains RPC signatures;
- `packages/db/src/schema.ts` remains table-shape equivalent;
- `packages/db/src/migrations.ts` requires no Watermelon schema bump unless the generator explicitly produces one.

Useful repo commands include:

```bash
npm run db:sync-local
npm run test:scripts
```

Review generated diffs. Do not hand-edit generated Supabase/Watermelon schema output to force the expected result.

## 5. Producer adapter

Add failing shared/Edge Function tests for the metals.dev response adapter. Then update:

```text
supabase/functions/_shared/market-rate-snapshot-contract.ts
supabase/functions/fetch-metal-rates/index.ts
```

Producer assertions:

- one `snapshotId` generated once per fetched response;
- exactly 37 trust observations;
- Gold/Silver use provider metal timestamp;
- all 35 supported fiat currencies use provider currency timestamp;
- USD is exact `1`, BTC excluded from trust observations;
- values are canonical positive decimals;
- one `.rpc("persist_market_rate_snapshot_v1", ...)` persistence call replaces direct root-only insert;
- no fallback timestamp repairs missing provider observation time;
- success response exposes snapshot ID/persistence status without leaking secrets.

## 6. Complete-snapshot pull and local write

Add failing tests around:

```text
apps/mobile/services/sync/pull-strategies.ts
apps/mobile/services/live-rates-refresh-service.ts
```

Replace independent current root/observation pulls with the complete-snapshot RPC. Validate the response before Watermelon writes and write root + all child observations in one local writer/page application.

Failure assertions:

- failed pull does not advance the market snapshot cursor;
- partial envelope is rejected before promotion;
- existing cached complete snapshot remains untouched;
- duplicate replay is idempotent.

## 7. Selected snapshot read model

Create tests first for:

```text
apps/mobile/services/market-rate-snapshot-read-model-service.ts
packages/logic/src/metals/current-market-snapshot.ts
```

Minimum local selection cases:

1. no snapshot -> null selected snapshot;
2. complete A -> select A;
3. newer root B without all children -> remain A;
4. children for unrelated batch -> remain A;
5. complete valid B -> promote B;
6. invalid B -> remain A;
7. duplicate same-ID/same-content -> unchanged;
8. same-ID conflict -> rejected;
9. older Z arrives after A -> remain A;
10. app restart/offline with A cached -> reconstruct A;
11. legacy root without provable binding -> not selected.

Verify freshness is derived only from each observation's `providerObservedAt`; root `createdAt` is used only for ordering.

## 8. Cut over all current consumers

Update known consumers:

```text
apps/mobile/hooks/useMarketRates.ts
apps/mobile/hooks/useLiveRatesScreen.ts
apps/mobile/hooks/useMetalPortfolio.ts
apps/mobile/hooks/useMetalHoldingDetail.ts
apps/mobile/hooks/useNetWorth.ts
apps/mobile/services/live-rates-trust-read-model-service.ts
apps/mobile/providers/MarketRatesRealtimeProvider.tsx
```

Then perform repository searches for bypasses before declaring the cutover complete. Search at least for:

```text
observeLiveRatesTrust
market_rates
market_rate_observations
useMarketRates
latestRates
isStale()
getAge()
```

Classify each result as current snapshot use, historical/trend use, test/fixture, or unrelated. No current value/trust consumer may independently select newest root/evidence after the cutover.

## 9. Business documentation

Update:

```text
docs/business/business-decisions.md
```

Record:

- `market_rates.id` is the current snapshot identity;
- bound current observations use `batch_id = root.id`;
- one complete V1 snapshot has 37 observations;
- producer/pull/local selection are atomic/fail-closed;
- legacy unbound data is not inferred into trusted snapshots;
- provider observation time remains the only freshness source;
- historical acquisition/terminal references remain separate.

## 10. Automated verification

Run focused suites first, then broader checks. Exact test names may evolve during implementation, but the expected verification surface is:

```bash
# SQL/local Supabase regression
npm run db:reset
# execute supabase/tests/atomic_market_rate_snapshots_test.sql using the repo's established SQL test method

# Shared logic
npm test -w @monyvi/logic -- --runInBand current-market-snapshot

# Mobile focused Jest
npm test -w @monyvi/mobile -- --runInBand market-rate-snapshot live-rates-refresh useMarketRates useLiveRatesScreen useMetalPortfolio useMetalHoldingDetail useNetWorth

# Mobile static checks
npm run typecheck -w @monyvi/mobile
npm run lint -w @monyvi/mobile

# Repository lint where required by CI
npm run lint
```

If a command name differs from current CI/repo conventions, use the repository's actual script and record the exact command/result in PR evidence. Never claim a check passed if it was not executed.

## 11. Deterministic acceptance matrix

Before PR review, ensure automated evidence exists for every approved behavior:

| Scenario | Expected result |
| --- | --- |
| successful refresh | one complete new snapshot becomes current |
| partial producer failure | no partial root/evidence visible |
| failed refresh with cached A | A remains current |
| identical same-ID replay | no duplicate truth/change |
| conflicting same-ID replay | reject; previous snapshot unchanged |
| observation/root mismatch | candidate not current |
| newer incomplete B over A | A remains current |
| delayed older Z after A | A remains current |
| offline restart | cached selected snapshot reconstructs |
| missing current snapshot | dependent financial output unavailable, holdings remain |
| missing provider time | freshness Unknown, no local timestamp substitute |
| cross-consumer read | current value + trust share one snapshot identity |
| historical acquisition/terminal refs | unchanged and never rewritten from current snapshot |

## 12. Manual regression

Because the feature has no intended visual redesign, manual QA is regression-only:

- Home opens and existing layout is unchanged.
- Live Rates opens/searches/expands/refreshes as before.
- My Metals and holding detail retain existing layout/navigation.
- EN and AR continue to render existing copy/layout correctly.
- With connectivity disabled after a valid snapshot is cached, the same values remain usable with truthful provider-time freshness.
- A failed refresh does not blank or zero previously valid cached values.

Do not treat manual visual checks as substitutes for the deterministic atomicity tests.

## 13. Rollout sanity

Before deployment/merge:

1. migration/RPC tests pass locally;
2. generated types are committed;
3. producer writes via atomic RPC only;
4. mobile pulls complete envelopes only;
5. all current consumers use the one selected snapshot service;
6. no legacy inference/backfill was introduced;
7. no new retention deletion policy was introduced;
8. business decisions documentation is updated;
9. focused tests, mobile typecheck/lint, and required CI are green;
10. PR evidence names any manual-only gaps explicitly.