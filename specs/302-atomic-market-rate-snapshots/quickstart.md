# Quickstart: Atomic Market-Rate Snapshot Implementation & Verification

**Feature**: `302-atomic-market-rate-snapshots` **Branch**:
`codex/issue302-atomic-market-rate-snapshots` **Revision**: Post-third-Analyze
I1 remediation

This is the implementation-time guide. None of the commands below were executed
during planning because this connected environment has no repository shell
runner.

## 1. Non-negotiable first gate

Before any production-code task, update and commit:

```text
docs/business/business-decisions.md
```

Record the finalized issue #302 rules:

- top-level/persisted snapshot identity is `market_rates.id`;
- observations bind through `batch_id = market_rates.id`;
- a complete current snapshot has exactly 37 observations;
- current authoritative financial values are exact bound observation decimals,
  not Watermelon `MarketRate` numbers;
- provider JSON decimal/scientific notation is normalized losslessly before
  persistence;
- missing/malformed/future provider timestamps normalize to `null`/Unknown and
  are never replaced by capture time;
- producer persistence, pull, and local application are atomic/fail-closed;
- provider observation time is the only freshness authority;
- trusted producer source identity is required;
- legacy unbound data is never inferred into a trusted snapshot;
- current snapshots never rewrite acquisition/terminal rate evidence.

Do not start a production implementation task until this documentation commit
exists.

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

Use strict TDD: establish only the dependency/test-runner scaffolding needed for
a test to execute, write the failing boundary test, run it and confirm the
intended behavioral failure, then implement the smallest correct change.

## 3. Exact provider-ingestion boundary

The current Edge Function uses `response.json()`, which would parse provider
rate tokens through JavaScript binary numbers. Issue #302 replaces that
authoritative path.

Exact test files:

```text
supabase/functions/_shared/market-rate-snapshot-contract.test.ts
supabase/functions/fetch-metal-rates/handler.test.ts
```

Exact production extraction:

```text
supabase/functions/_shared/market-rate-snapshot-contract.ts
supabase/functions/fetch-metal-rates/handler.ts
supabase/functions/fetch-metal-rates/index.ts
supabase/functions/fetch-metal-rates/deno.json
```

`index.ts` should become only the `Deno.serve` wrapper around the extracted
handler so handler behavior is runnable in the root Node/tsx test gate.

Before first execution of the shared/handler tests, make dependency resolution
deterministic for **both** runtimes. Root Node/`tsx` owns exact devDependencies
and the root lockfile:

```bash
npm install --save-dev --save-exact lossless-json@4.3.1 zod@4.4.3
```

This must result in root `package.json` entries equivalent to:

```json
"lossless-json": "4.3.1",
"zod": "4.4.3"
```

and a committed `package-lock.json` update.

The function-local Deno import map must resolve the same bare specifiers to the
same exact versions:

```json
{
  "imports": {
    "edge-runtime": "jsr:@supabase/functions-js/edge-runtime.d.ts",
    "@supabase/supabase-js": "npm:@supabase/supabase-js@^2.49.1",
    "lossless-json": "npm:lossless-json@4.3.1",
    "zod": "npm:zod@4.4.3"
  }
}
```

Shared parser/handler source must import `lossless-json` and `zod` by those bare
specifiers. Do not rely on `@monyvi/mobile`'s Zod dependency being hoisted into
root resolution, and do not expect Node/`tsx` to read `deno.json`. Conversely,
do not make the Edge runtime depend on root Node resolution. The exact package
versions must match across both resolver configurations.

Required red cases:

- provider token `0.10000000000000001` reaches the RPC payload unchanged;
- another high-precision decimal reaches the RPC payload unchanged;
- exponent token `3.73874e-10` reaches the RPC as exact plain
  `0.000000000373874`;
- exponent token with retained coefficient precision such as `1.2300e+2` becomes
  `123.00`;
- no authoritative rounding or `Number(...)` / `parseFloat(...)` conversion;
- malformed/non-positive required rate rejected;
- exactly 37 observations;
- USD exact `1`, BTC excluded;
- Gold/Silver use provider metal time;
- fiat uses provider currency time;
- valid non-future provider time is preserved;
- missing provider time becomes `null`;
- malformed provider time becomes `null`;
- future provider time relative to the one capture/order instant becomes `null`;
- capture/order time is never substituted as provider time;
- source is non-empty `metals.dev`;
- no authoritative `response.json()` round-trip precedes RPC payload creation.

Read `response.text()`, parse with exact `lossless-json@4.3.1`, expand JSON
scientific notation to equivalent plain decimal text through string/exponent
manipulation only, then validate the transformed exact-string shape with exact
`zod@4.4.3`.

## 4. Exact Edge test + CI gate

Implementation must add this exact root `package.json` script after the
dependency scaffolding above exists and handler/shared tests are green:

```json
"test:market-rate-edge": "tsx --test supabase/functions/_shared/market-rate-snapshot-contract.test.ts supabase/functions/fetch-metal-rates/handler.test.ts"
```

and add a `Market Rate Edge Contract` step to `.github/workflows/ci.yml`'s
`quality` job:

```yaml
- name: Market Rate Edge Contract
  run: npm run test:market-rate-edge
```

The exact local/CI verification command is therefore:

```bash
npm run test:market-rate-edge
```

Before treating this gate as reproducible, also verify the root dependency
metadata and Deno import map agree:

```bash
npm pkg get devDependencies.lossless-json devDependencies.zod
```

Expected root values are exact `4.3.1` and `4.4.3`;
`supabase/functions/fetch-metal-rates/deno.json` must map those same bare
imports to `npm:lossless-json@4.3.1` and `npm:zod@4.4.3`.

Do not describe Edge tests as “covered by CI” until the exact dependencies/lock,
script, and CI step exist and the command has passed.

## 5. Database/RPC contract

Create:

```text
supabase/migrations/069_atomic_market_rate_snapshots.sql
supabase/tests/atomic_market_rate_snapshots_test.sql
```

Migration responsibilities:

- `NOT VALID` FK
  `market_rate_observations.batch_id -> market_rates.id ON DELETE CASCADE`;
- `(batch_id, instrument_code)` lookup index;
- service-role-only `persist_market_rate_snapshot_v1`;
- read-only `pull_market_rate_snapshots_page_v1`;
- exact plain-decimal-string request boundary;
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

Do not apply DDL through remote MCP/dashboard. Use the repository local
migration workflow.

## 6. OpenAPI contract sanity

`PersistedObservation` in `contracts/market-rate-snapshots.openapi.yaml` is one
explicit closed object containing:

```text
id, batchId, capturedAt,
instrumentCode, valueDecimal, unit, orientation,
providerObservedAt, source, quality
```

Do not implement it as `allOf` extending closed `RateObservationInput`; the base
object's `additionalProperties: false` would make persisted-only fields invalid.

All RPC/pull financial values use plain decimal text with no exponent.
Scientific notation is normalized only at the external-provider parsing boundary
before the contract is constructed.

## 7. Regenerate database contracts

After local migration/RPC tests:

```bash
npm run db:sync-local
npm run test:scripts
```

Expected review result:

- `packages/db/src/supabase-types.ts` gains RPC signatures;
- no local table column was added, so `schema.ts`/`migrations.ts` remain
  table-shape equivalent unless generation legitimately changes metadata.

Review generated diffs; never hand-edit generated output to force the
expectation.

## 8. Complete-snapshot pull and local apply

Tests first:

```text
apps/mobile/__tests__/services/sync/pull-market-rate-snapshots.test.ts
apps/mobile/__tests__/services/live-rates-refresh-service.test.ts
```

The pull RPC returns exact root decimal text + exact observations. The mobile
adapter must:

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

## 9. Exact selected snapshot service

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
9. remove one required B observation -> B becomes ineligible; fall back to A if
   present;
10. if no complete candidate remains -> null/unavailable;
11. restart/offline reconstructs from exact cached observations;
12. deliberately divergent wide-root numeric compatibility value cannot alter
    current financial output because current output uses observation
    `value_decimal`.

The exported selected snapshot exposes exact decimals / exact rate references,
not wide Watermelon numeric columns as current financial truth.

## 10. Cut over current calculations and consumers

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

- current displayed financial rates and valuations consume exact selected
  observation values;
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

Classify every hit as selected exact current use, historical/trend use,
test/fixture, or unrelated.

## 11. Realtime and local QA import

Realtime root INSERT is a sync trigger only; it never promotes the notified
root.

Update local QA import tests/code so `scripts/import-market-rates-to-local.js`
imports only complete root + bound observation snapshot units. A root-only
import is intentionally untrusted.

## 12. Automated verification

Run focused tests first, then static/broader checks. Record exact
commands/results in PR evidence.

```bash
# Dependency parity for Node/tsx test runtime
npm pkg get devDependencies.lossless-json devDependencies.zod
# Inspect supabase/functions/fetch-metal-rates/deno.json and confirm matching exact npm: mappings.

# Exact Edge/shared gate — must also be in CI
npm run test:market-rate-edge

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

Verify `package-lock.json` is committed/current after the exact root dependency
installation. Never claim a check passed without fresh output.

## 13. Deterministic acceptance matrix

| Scenario                                 | Expected result                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Node/Deno dependency parity              | root exact `lossless-json@4.3.1` / `zod@4.4.3`, committed lockfile, and matching Deno `npm:` mappings |
| ordinary high-precision provider decimal | exact rate reaches RPC unchanged                                                                      |
| scientific-notation provider decimal     | exact plain equivalent reaches RPC with no rounding                                                   |
| missing provider time                    | normalized to null / Unknown                                                                          |
| malformed provider time                  | normalized to null / Unknown                                                                          |
| future provider time                     | normalized to null / Unknown; capture time not substituted                                            |
| successful refresh                       | one complete new snapshot becomes current                                                             |
| partial producer failure                 | no partial durable truth                                                                              |
| failed refresh with cached A             | A remains current                                                                                     |
| identical same-ID replay                 | no duplicate truth/change                                                                             |
| conflicting same-ID replay               | reject; prior snapshot unchanged                                                                      |
| missing/blank source                     | candidate rejected/ineligible                                                                         |
| root/observation mismatch                | candidate rejected before local apply                                                                 |
| newer incomplete B                       | A remains current                                                                                     |
| remove selected B evidence               | B ineligible; fallback A or null; no cross-batch repair                                               |
| root delete                              | bound remote observations cascade                                                                     |
| delayed older Z                          | no selection regression                                                                               |
| offline restart                          | cached exact selected snapshot reconstructs                                                           |
| no selected snapshot                     | dependent financial output unavailable; holdings remain                                               |
| wide root numeric divergence             | cannot alter exact current financial result                                                           |
| persisted observation schema             | explicit closed object validates persisted-only fields                                                |
| cross-consumer read                      | exact current value + trust share one snapshot identity                                               |
| historical acquisition/terminal refs     | unchanged and never rewritten from current snapshot                                                   |

## 14. Manual regression

No visual redesign is intended. Verify existing Home, Live Rates, My Metals, and
holding detail navigation/layout in EN/AR and online/offline states. Failed
refresh must not blank/zero a valid cached snapshot. Manual checks do not
replace atomicity/exactness tests.

## 15. Rollout sanity

Before issue completion:

1. business-decisions update was committed before production implementation;
2. root Node/`tsx` dependencies are exact `lossless-json@4.3.1` / `zod@4.4.3`,
   `package-lock.json` is committed, and Deno maps the same bare imports to the
   same exact `npm:` versions;
3. provider parse is lossless/pinned and handles scientific notation exactly;
4. missing/malformed/future provider time normalizes to null/Unknown;
5. `PersistedObservation` contract is an explicit closed object;
6. `npm run test:market-rate-edge` exists and is enforced in CI;
7. migration/RPC tests pass locally;
8. generated types are committed;
9. producer writes through atomic RPC only;
10. pull returns exact complete envelopes only;
11. all current consumers use exact selected observation values;
12. no legacy inference/backfill or new retention policy was introduced;
13. retention/corruption tests pass;
14. focused tests, typecheck/lint, required CI are evidenced;
15. manual-only gaps are named honestly.
