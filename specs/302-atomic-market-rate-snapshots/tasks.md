# Tasks: Atomic Market-Rate Snapshots

**Input**: Approved `spec.md` plus revised `plan.md`, `research.md`, `data-model.md`, `contracts/market-rate-snapshots.openapi.yaml`, and `quickstart.md`.  
**Tests**: Mandatory. FR-023 / SC-009 require deterministic acceptance coverage. Every production boundary has a preceding red-test task.

## Format

`- [ ] T### [P?] [US#?] Description with exact file path`

- `[P]`: safe to prepare in parallel after dependencies are satisfied.
- `[US1]`–`[US4]`: maps directly to approved user stories.
- Governance/foundation/release tasks intentionally have no story tag.

---

## Phase 1: Constitution Gate & Shared Fixtures

**Purpose**: Satisfy Constitution II before any code implementation, then establish shared deterministic exact fixtures.

- [X] **T001** Update and commit `docs/business/business-decisions.md` **before any other code/test task** with finalized issue #302 rules: `market_rates.id` snapshot identity; `batch_id` binding; exactly 37 required observations; exact observation decimals as authoritative current financial truth; wide Watermelon root numbers as identity/order/history compatibility only; lossless ordinary/scientific provider decimal normalization; missing/malformed/future provider timestamps -> null/Unknown without capture substitution; atomic producer/pull/local apply; non-empty trusted producer source; fail-closed legacy cutover; retention/corruption no-cross-batch-repair rule; strict separation from acquisition/terminal references. No T002+ work begins until T001 is committed.
- [ ] **T002** Create deterministic exact complete/partial/conflicting snapshot fixtures in `packages/logic/src/metals/__tests__/current-market-snapshot.fixtures.ts`, including Gold, Silver, all 35 supported fiat currencies, implicit USD=`1`, distinct metal/currency provider times, non-empty source, and canonical plain decimal strings.
- [ ] **T003** [P] Create Watermelon-shaped fixtures in `apps/mobile/__tests__/fixtures/market-rate-snapshot.ts` for complete/incomplete/duplicate/cross-batch/source-invalid/older-newer candidates, removable required evidence, null/future provider time, and a deliberately divergent wide-root numeric compatibility value.
- [ ] **T004** [P] Create raw Metals.Dev JSON-text fixtures in `supabase/functions/_shared/market-rate-snapshot-contract.test.ts` containing ordinary high-precision decimals, `0.10000000000000001`, scientific values including `3.73874e-10` and `1.2300e+2`, malformed/non-positive rates, valid timestamp strings, missing timestamp fields, malformed timestamp strings, future timestamp strings, and provider status/shape failures. Before the first T006 execution, establish **test/runtime dependency scaffolding only**: add exact root `devDependencies` `lossless-json: "4.3.1"` and `zod: "4.3.6"`, commit the resulting `package-lock.json`, and map the same bare specifiers in `supabase/functions/fetch-metal-rates/deno.json` to `npm:lossless-json@4.3.1` and `npm:zod@4.3.6`. This setup changes resolution metadata only; it must not implement producer behavior.

**Checkpoint**: Business source of truth is committed first; every layer can express the same exact snapshot/failure cases, and the Node/`tsx` red tests plus Deno runtime resolve the same exact parser/validator package versions.

---

## Phase 2: Foundational Exact Snapshot Contract

**Purpose**: Lock exact-value, membership, identity, lossless-ingestion, notation-normalization, provider-time, and dual-runtime package-resolution rules before current selectors/producers are implemented.

### Tests first

- [ ] **T005** Add failing pure-logic tests in `packages/logic/src/metals/__tests__/current-market-snapshot.test.ts` for exact 37 membership, USD identity, BTC exclusion, positive canonical plain decimals, accepted units/orientations, null/blank/whitespace source rejection for trusted current snapshots, duplicate/missing/unexpected instruments, and exact current conversion/lookup using Decimal strings.
- [ ] **T006** [P] Extend red tests in `supabase/functions/_shared/market-rate-snapshot-contract.test.ts` to prove: raw provider JSON is parsed losslessly; ordinary precision canaries are unchanged; `3.73874e-10` becomes exact plain `0.000000000373874`; `1.2300e+2` becomes `123.00`; normalization uses no authoritative `Number`/`parseFloat`; exactly 37 observations are emitted; source/quality/unit/orientation are correct; USD is exact `1`; BTC excluded; valid non-future timestamps preserved; missing/malformed/future timestamps normalize to `null`; capture/order time is never substituted; authoritative payload construction does not require `response.json()`. The test imports shared dependencies through the same bare `lossless-json` / `zod` specifiers used by Deno, with T004's exact root dependency setup already present so failure is behavioral rather than module-resolution setup failure.
- [ ] **T007** [P] Add a source/architecture regression in `apps/mobile/__tests__/architecture/current-market-snapshot-contract.test.ts` fixing these rules: one top-level snapshot ID materializes as `market_rates.id`; children bind by `batch_id`; current financial calculations use observation `value_decimal`/exact selected helpers rather than wide `MarketRate` numeric fields; root `created_at` cannot be current freshness. Also document/assert that the OpenAPI `PersistedObservation` is one explicit closed object rather than `allOf` extension of closed `RateObservationInput`.

### Implementation after red tests

- [ ] **T008** Implement `packages/logic/src/metals/current-market-snapshot.ts` and exports in `packages/logic/src/metals/index.ts` / `packages/logic/src/index.ts` to satisfy T005: canonical current instrument set, strict trusted-source validation, exact observation normalization, and Decimal-based current metal/currency lookup/conversion helpers over plain exact-string interfaces.
- [ ] **T009** Implement `supabase/functions/_shared/market-rate-snapshot-contract.ts` using the exact dual-runtime dependencies already pinned in T004 to satisfy T004/T006: parse response text losslessly through bare `lossless-json`; expand JSON scientific notation to equivalent plain decimal text by coefficient/exponent string manipulation with no rounding/binary-float intermediate; Zod-validate through bare `zod`; normalize missing/malformed/future provider timestamps to `null` using the single capture instant only as a future-time comparison ceiling; build one exact logical root + 37 observations under supplied snapshot/capture identity. Do not introduce a second version range, URL import, or runtime-specific source import.
- [ ] **T010** Re-run T005–T007 after T008/T009 and keep the architecture/source contract red if implementation exposes a wide-root JS number as authoritative current financial truth, accepts the invalid composed persisted-observation schema, substitutes non-provider time for freshness, or bypasses the approved exact bare dependency specifiers.

**Checkpoint**: Exact current-rate contract and lossless provider adapter exist under tests before selector/database persistence implementation.

---

## Phase 3: User Story 1 — Trust One Complete Exact Snapshot Everywhere (P1)

**Goal**: Every current displayed financial rate, trust fact, and rate-based valuation derives from one exact selected local snapshot.

**Independent Test**: Cache complete A plus newer incomplete/mismatched B; all current consumers use A's exact observation values/trust. Deliberately change A's wide numeric compatibility value while leaving its exact observations unchanged; current financial outputs remain driven by exact observations.

### Tests first

- [ ] **T011** [US1] Add failing selector tests in `apps/mobile/__tests__/services/market-rate-snapshot-read-model-service.test.ts` for no snapshot, complete A, newer incomplete B, cross-batch rows, duplicate instrument, invalid/blank source, invalid value/unit/quality, same-ID conflict fixture, delayed older candidate, provider-time Unknown, removable required evidence, no cross-batch repair, fallback-to-A/null, and wide-root numeric divergence not altering exported exact current rates.
- [ ] **T012** [P] [US1] Add failing trust-mapper tests in `apps/mobile/__tests__/services/live-rates-trust-read-model-service.test.ts` proving summaries accept observations from one selected snapshot only and never independently query newest observations.
- [ ] **T013** [P] [US1] Add failing cross-consumer tests in `apps/mobile/__tests__/hooks/current-market-snapshot-consumers.test.tsx` asserting one `snapshotId`, exact `valueDecimal`, source, quality, and provider time across `useMarketRates`, Live Rates, My Metals, holding detail, and Home/net-worth current inputs.
- [ ] **T014** [P] [US1] Add failing exact-current net-worth tests in `apps/mobile/__tests__/services/net-worth-read-model-current-rates.test.ts` proving current account currency and metal valuation receive exact selected rate strings/Decimal helpers and cannot use wide `MarketRate` number fields as financial truth.
- [ ] **T015** [P] [US1] Add a failing architecture bypass test in `apps/mobile/__tests__/architecture/current-market-snapshot-consumers.test.ts` forbidding independent current newest-root/newest-observation joins and direct authoritative current calculations from wide `market_rates` numeric fields.

### Implementation

- [ ] **T016** [US1] Implement `SelectedMarketRateSnapshot` selection in `apps/mobile/services/market-rate-snapshot-read-model-service.ts` to satisfy T011: root identity/order + same-batch exact observations, exact 37 validation, source/quality/unit/value/provider-time validation, previous-valid fallback, removed-evidence invalidation, no cross-batch repair, and exported exact rate map/trust without authoritative wide-root numeric values.
- [ ] **T017** [US1] Refactor `apps/mobile/services/live-rates-trust-read-model-service.ts` into pure mapping/summarization over selected exact observations; remove independent newest-observation subscriptions while preserving trust semantics.
- [ ] **T018** [US1] Refactor `apps/mobile/hooks/useMarketRates.ts` so current state exposes selected exact snapshot/rates while previous-day/trend `MarketRate` remains explicitly historical. Remove current freshness dependence on `MarketRate.createdAt` / `isStale()`.
- [ ] **T019** [US1] Refactor `apps/mobile/hooks/useLiveRatesScreen.ts` so current displayed financial rates/conversions and source/quality/provider-time/freshness use exact selected snapshot helpers; historical trend comparison remains separate/non-certifying.
- [ ] **T020** [US1] Refactor `apps/mobile/hooks/useMetalPortfolio.ts` so all current Gold/Silver/preferred/purchase-currency valuation inputs and portfolio rate status use exact selected rates; immutable sale/acquisition references remain separate.
- [ ] **T021** [US1] Refactor `apps/mobile/hooks/useMetalHoldingDetail.ts` so current valuation uses exact selected rates and the hook no longer owns an independent live-trust selector; preserve acquisition/terminal evidence observers unchanged.
- [ ] **T022** [US1] Refactor `apps/mobile/hooks/useNetWorth.ts` and `apps/mobile/services/net-worth-read-model-service.ts` to satisfy T014: current account/metal currency conversion consumes exact selected rate strings/Decimal helpers; historical snapshot/trend data remains separate.
- [ ] **T023** [US1] Remove/deprecate current-trust semantics from `packages/db/src/models/MarketRate.ts`; if root-age helpers are still required for explicit historical UI, rename/scope them as historical/capture age and update focused tests in `packages/db/src/__tests__/`.
- [ ] **T024** [US1] Run current-rate bypass search from `quickstart.md`; fix every remaining current consumer that independently selects wide root/evidence or uses wide numeric root rates for authoritative current calculations, and extend `apps/mobile/__tests__/architecture/current-market-snapshot-consumers.test.ts` for each bypass.

**Checkpoint**: US1 is locally deterministic with exact selected values but is not releasable alone; FR-002 couples it to US2 producer/sync atomicity.

---

## Phase 4: User Story 2 — Refresh Safely Through Failure, Replay & Partial Updates (P1)

**Goal**: Only a complete exact new producer snapshot can become locally eligible/current.

**Independent Test**: From complete A, exercise valid B, ordinary/scientific exact precision, missing/malformed/future provider time, partial/invalid B, identical/conflicting replay, source failure, delayed older Z, pull/local apply failure, and realtime timing; selection changes only for complete valid newer evidence.

### Tests first

- [ ] **T025** [US2] Create failing SQL coverage in `supabase/tests/atomic_market_rate_snapshots_test.sql` for valid 37-observation persistence; missing/duplicate/unexpected instruments; invalid quality/unit/orientation/non-positive decimal; null/empty/whitespace-only source rejection; exact root/value mismatch; null provider time; identical replay; conflicting replay rollback; service-role permissions; complete-envelope pull; legacy/unbound/partial/duplicate/source-invalid omission; cursor ordering; older-delivery non-regression; and root deletion cascading every bound observation.
- [ ] **T026** [P] [US2] Add failing handler-level tests **exactly at** `supabase/functions/fetch-metal-rates/handler.test.ts`, targeting the extracted `supabase/functions/fetch-metal-rates/handler.ts`. Prove response text goes through the lossless shared parser; one UUID/capture time is used; one exact RPC payload is sent; ordinary precision canaries remain exact; exponent inputs normalize exactly to plain decimal; valid provider time preserved; missing/malformed/future provider time becomes `null` without capture substitution; no direct root-only insert remains; JS-number conversion, if retained for response compatibility, occurs only after authoritative RPC success.
- [ ] **T027** [P] [US2] Add failing pull-envelope tests in `apps/mobile/__tests__/services/sync/pull-market-rate-snapshots.test.ts` for top-level identity, exact root strings, exact root/observation comparison before local conversion, invalid/blank source, malformed/cross-ID/partial envelope rejection, fixed watermark/cursor behavior, and no cursor advancement on page failure.
- [ ] **T028** [P] [US2] Add failing refresh/local-apply tests in `apps/mobile/__tests__/services/live-rates-refresh-service.test.ts` proving root+37 observations are applied in one Watermelon writer/page unit, exact observation strings remain exact, compatibility root numbers are non-authoritative, and failure leaves cached A unchanged.
- [ ] **T029** [P] [US2] Add failing realtime tests in `apps/mobile/__tests__/providers/MarketRatesRealtimeProvider.test.tsx` proving root INSERT only triggers normal sync and cannot directly promote the notified root.
- [ ] **T030** [P] [US2] Add failing importer tests in `scripts/import-market-rates-to-local.test.js` proving local QA import copies only complete bound snapshot units and rejects/skips root-only/incomplete/source-invalid legacy candidates.

### Database / generated contracts

- [ ] **T031** [US2] Add `supabase/migrations/069_atomic_market_rate_snapshots.sql` persistence half to satisfy T025: `NOT VALID` FK with `ON DELETE CASCADE`, safe lookup index, service-role-only `persist_market_rate_snapshot_v1`, exact-string input casting to PostgreSQL numeric, exact 37/root-equivalence/source validation, idempotent replay, conflict rejection, explicit grants/revokes. Do not infer legacy bindings.
- [ ] **T032** [US2] Extend the same migration with `pull_market_rate_snapshots_page_v1` returning exact root decimal text + exact bound observations, fixed upper-watermark/root cursor paging, and fail-closed filtering for incomplete/duplicate/source-invalid/legacy envelopes; satisfy pull/cascade/order portions of T025.
- [ ] **T033** [US2] Run repository DB generation workflow and commit generated RPC signatures in `packages/db/src/supabase-types.ts`; review `packages/db/src/schema.ts` / `packages/db/src/migrations.ts` and commit only legitimate generated changes because no table columns were added.

### Producer / pull / sync / realtime

- [ ] **T034** [US2] Extract `supabase/functions/fetch-metal-rates/handler.ts`, make `supabase/functions/fetch-metal-rates/index.ts` the minimal `Deno.serve` wrapper, and refactor the handler to satisfy T026: `response.text()` -> bare `lossless-json` shared parser -> exact ordinary/scientific normalization -> provider-time valid/null normalization -> bare `zod` exact envelope -> one `persist_market_rate_snapshot_v1` RPC. Preserve the exact root/Deno dependency parity established in T004; do not rely on workspace hoisting or Deno import-map resolution from Node. After T026 is green, add root `package.json` script `"test:market-rate-edge": "tsx --test supabase/functions/_shared/market-rate-snapshot-contract.test.ts supabase/functions/fetch-metal-rates/handler.test.ts"` and add `.github/workflows/ci.yml` quality step `Market Rate Edge Contract` running `npm run test:market-rate-edge`. Preserve response compatibility only after exact persistence; expose `snapshotId`/`persistenceStatus`; do not leak secrets.
- [ ] **T035** [US2] Replace independent current `pullMarketRates()` + `pullMarketRateObservations()` composition in `apps/mobile/services/sync/pull-strategies.ts` with `pull_market_rate_snapshots_page_v1` validation/transform. Normal app sync and manual refresh share this complete-envelope contract; retain wide-root reads only for explicit historical use.
- [ ] **T036** [US2] Refactor `apps/mobile/services/live-rates-refresh-service.ts` so validated complete pages are committed in one Watermelon `database.write`/batch unit and snapshot cursor advances only after successful full-page apply; preserve cached A on failure.
- [ ] **T037** [US2] Update `apps/mobile/providers/MarketRatesRealtimeProvider.tsx` to keep realtime as sync trigger only; remove any assumption a notified root is current before complete pull/local selection accepts it.
- [ ] **T038** [US2] Update `scripts/import-market-rates-to-local.js` to query/import complete remote root + matching observation units, compare/validate exact envelope before compatibility insert, delete/replace local shared tables in dependency-safe order, and retain explicit `--best-effort` behavior.

**Checkpoint**: US1 + US2 are the minimum releasable trust guarantee. Producer-only or consumer-only completion must not be deployed/merged as issue #302 completion.

---

## Phase 5: User Story 3 — Keep the Last Trusted Snapshot Offline (P1)

**Goal**: A complete exact selected snapshot survives offline/restart and failed refresh without artificial freshness or in-memory pointers.

### Tests first

- [ ] **T039** [US3] Extend `apps/mobile/__tests__/services/market-rate-snapshot-read-model-service.test.ts` with failing restart/resubscribe/offline reconstruction cases proving selection comes from persisted root identity/order + exact observation text and requires no in-memory selected pointer.
- [ ] **T040** [P] [US3] Extend `apps/mobile/__tests__/services/live-rates-refresh-service.test.ts` with cached-A/offline/provider-failure/RPC-failure/pull-failure cases proving no path clears or partially replaces A or changes provider timestamps.
- [ ] **T041** [P] [US3] Add focused local-integrity cases to `apps/mobile/__tests__/services/market-rate-snapshot-read-model-service.test.ts`: remove one required selected observation, verify fallback to earlier complete A; remove all complete candidates, verify null; add matching-instrument row from another batch, verify no repair.
- [ ] **T042** [P] [US3] Extend `scripts/import-market-rates-to-local.test.js` with a complete imported snapshot reconstruction case used by local/manual QA after Supabase reset.

### Implementation

- [ ] **T043** [US3] Harden `apps/mobile/services/market-rate-snapshot-read-model-service.ts` subscription/reconstruction lifecycle to satisfy T039/T041 and never promote by receipt time.
- [ ] **T044** [US3] Harden `apps/mobile/services/live-rates-refresh-service.ts` error/loading paths to satisfy T040: failed attempts report failure without deleting cached complete evidence or mutating provider timestamps.
- [ ] **T045** [US3] Verify/update `apps/mobile/scripts/manual-qa-seed.js` only if necessary so reset/seed workflows do not create a false root-only trusted state; keep no new retention/pruning duration.
- [ ] **T046** [US3] Add/finish offline consumer regression in `apps/mobile/__tests__/hooks/current-market-snapshot-consumers.test.tsx` proving Live Rates/My Metals/holding/net-worth current values use cached exact A while freshness stays based on A's provider time.

**Checkpoint**: Last known complete exact snapshot reconstructs offline and incomplete/corrupt evidence is never cross-batch repaired.

---

## Phase 6: User Story 4 — Fail Closed for Missing/Invalid Market Inputs (P2)

**Goal**: Withhold only unprovable rate-dependent values while preserving recorded holdings/account facts.

### Tests first

- [ ] **T047** [US4] Add failing portfolio/detail cases in `apps/mobile/__tests__/hooks/current-market-snapshot-consumers.test.tsx` proving recorded holdings/facts remain available when selected current snapshot is null while current valuation/performance becomes unavailable, not zero.
- [ ] **T048** [P] [US4] Extend selector tests for null provider time and any locally malformed/future legacy/corrupt provider time; assert root creation, fetch, storage, sync, receipt, and restart times are never substituted and freshness is Unknown.
- [ ] **T049** [P] [US4] Extend `apps/mobile/__tests__/services/net-worth-read-model-current-rates.test.ts` proving missing/invalid exact current currency/metal inputs make only dependent net-worth outputs unavailable and never coerce to zero or borrow unrelated rates.

### Implementation

- [ ] **T050** [US4] Refine `apps/mobile/hooks/useMetalPortfolio.ts` readiness so holding ownership/facts can complete independently of selected current rates; only rate-dependent sections become unavailable.
- [ ] **T051** [US4] Refine `apps/mobile/hooks/useMetalHoldingDetail.ts` and `apps/mobile/services/metal-detail-read-model-service.ts` so recorded/acquisition/terminal facts remain available when current selected rates are null; no historical/current substitution.
- [ ] **T052** [US4] Refine `apps/mobile/hooks/useNetWorth.ts` and `apps/mobile/services/net-worth-read-model-service.ts` so missing exact current inputs never become zero; preserve unaffected account/holding source facts/read models.
- [ ] **T053** [US4] Finish missing/Unknown handling in `apps/mobile/services/market-rate-snapshot-read-model-service.ts`, `apps/mobile/services/live-rates-trust-read-model-service.ts`, and `apps/mobile/hooks/useLiveRatesScreen.ts`: exact source/provider-time trust only, no root/capture freshness substitution.

**Checkpoint**: Missing/invalid current evidence cannot fabricate financial truth; recorded user facts remain visible.

---

## Phase 7: Verification & Release Evidence

**Purpose**: Prove the complete end-to-end guarantee after implementation; business documentation is already a Phase 1 gate.

- [ ] **T054** Reconcile `specs/302-atomic-market-rate-snapshots/quickstart.md` only if implementation-time file/command names changed; keep verification commands exact/reproducible.
- [ ] **T055** Run local Supabase/migration verification including `supabase/tests/atomic_market_rate_snapshots_test.sql`; record exact command/output proving atomic persistence, source rejection, replay/conflict, pull filtering, permissions, and root-delete cascade.
- [ ] **T056** Run **exactly** `npm run test:market-rate-edge` and focused `@monyvi/logic` tests. Record output proving lossless ordinary/scientific parsing, precision preservation, missing/malformed/future provider-time normalization, exact current helpers, 37-instrument/source contract, and no pre-RPC binary-number authority. Also record `npm pkg get devDependencies.lossless-json devDependencies.zod` and verify it reports exact `4.3.1` / `4.3.6`; inspect `supabase/functions/fetch-metal-rates/deno.json` and confirm its `lossless-json` / `zod` mappings are exact `npm:...` versions matching root metadata. Confirm the `Market Rate Edge Contract` CI step invokes the same root script.
- [ ] **T057** Run focused `@monyvi/mobile` Jest suites for selector, pull, refresh, realtime, importer, `useMarketRates`, Live Rates, My Metals, holding detail, and net worth; include removed-evidence/no-cross-batch-repair and wide-root-divergence cases.
- [ ] **T058** Run `npm run typecheck -w @monyvi/mobile`, `npm run lint -w @monyvi/mobile`, required repository lint/tests, DB generation/script checks, and `npm run test:market-rate-edge`; verify `.github/workflows/ci.yml` includes the matching `Market Rate Edge Contract` quality step. Verify `package-lock.json` is committed/current for the exact root Edge dependencies and no root-vs-Deno package-version drift exists. Fix only issue #302 failures.
- [ ] **T059** Re-run bypass searches for `observeLiveRatesTrust`, direct current `market_rates` / `market_rate_observations` selectors, `latestRates`, `isStale()`, `getAge()`, wide rate fields, and current `convertCurrency`/`getMetalPrice` calls; classify every remaining hit as exact-selected current, explicit historical/test/unrelated, or fix with architecture regression.
- [ ] **T060** Perform regression-only manual QA on existing Home, Live Rates, My Metals, and holding detail in EN/AR and online/offline states; record manual evidence honestly and verify no new screen/navigation/layout was introduced.
- [ ] **T061** Build PR evidence matrix mapping FR-001–FR-023, SC-001–SC-009, and every listed edge case—including ordinary/scientific exact-decimal ingestion, missing/malformed/future provider-time normalization, exact Node/Deno dependency parity, source rejection, persisted-observation schema contract, root-delete cascade, removed/corrupt local evidence, and no cross-batch repair—to deterministic automated evidence or explicit manual-only reason.

**Final Checkpoint**: Every authoritative current rate/valuation/trust path is one exact snapshot; producer-to-device failure/replay/offline/corruption behavior is deterministic; Edge/shared tests execute against explicitly owned matching Node/Deno dependency versions; required checks are evidenced; no UI/product-scope expansion occurred.

---

## Dependencies & Execution Order

```text
T001 business documentation gate
    ↓
Phase 1 fixtures + dual-runtime test scaffolding
    ↓
Phase 2 exact/lossless foundation
    ↓
┌───────────────────────────────┐
│ Phase 3 US1 exact consumers   │
└──────────────┬────────────────┘
               │
               ├───────────────────────┐
               ▼                       │
┌───────────────────────────────┐       │
│ Phase 4 US2 producer/sync     │  ← US1+US2 one release gate
└──────────────┬────────────────┘
               ▼
┌───────────────────────────────┐
│ Phase 5 US3 offline/integrity │
└──────────────┬────────────────┘
               ▼
┌───────────────────────────────┐
│ Phase 6 US4 fail-closed       │
└──────────────┬────────────────┘
               ▼
Phase 7 verification/evidence
```

- **T001 blocks every other code/test task.**
- T004's exact root/Deno dependency metadata must exist before T006 is first executed; this is test/runtime scaffolding, not producer behavior.
- T008 waits for red T005.
- T009 waits for T004 dependency scaffolding and red T006.
- T016–T023 wait for US1 red tests T011–T015.
- T031/T032 wait for SQL red T025.
- T034 waits for shared red T006/T009 and handler red T026; it preserves the T004 dependency contract and adds the root Edge script/CI step only after handler/shared tests are green.
- T035 waits for red T027 and server pull contract T032.
- T036 waits for red T028 and pull adapter T035.
- T037 waits for red T029.
- T038 waits for red T030.
- US3 depends on selected service + complete refresh path.
- US4 depends on selected exact snapshot semantics.

## Strict TDD Order

1. Complete prerequisite test/runtime resolution scaffolding when a test runner cannot otherwise resolve its declared dependencies; do not implement feature behavior in that setup step.
2. Write listed failing test.
3. Run it and prove failure is intended missing behavior, not fixture/module-resolution/setup failure.
4. Implement minimum production change.
5. Re-run focused tests to green.
6. Refactor only while tests remain green.
7. Commit coherent red/green batch before crossing another boundary.

Detailed provider mapping/scientific/timestamp tests are T006 before shared producer implementation T009; exact handler tests are T026 before handler cutover T034.

## Safe Parallel Opportunities

After T001:

- T003/T004 can be prepared in parallel after T002 fixture semantics are clear.
- T005/T006/T007 target separate test boundaries and can be prepared in parallel after T004 dependency scaffolding exists for T006 execution.
- US1 red tests T012–T015 can be prepared in parallel with T011.
- US2 red tests T026–T030 can be prepared in parallel with SQL T025.
- US3 red tests T040–T042 can be prepared in parallel with T039.
- US4 red tests T048–T049 can be prepared in parallel with T047.

Do not parallel-edit the same migration file: T031 then T032 are sequential.

## Minimum Releasable Increment

The normal “US1-only MVP” is not releasable. Minimum releasable trust slice is Phase 1 + Phase 2 + US1 + US2 + focused end-to-end evidence. US3 and US4 remain required before issue #302 is complete.

## Commit Discipline

Prefer coherent TDD commits/batches:

1. business-decision gate;
2. exact dual-runtime dependency/test scaffolding + lossless red tests + foundational helpers;
3. SQL contract tests + migration;
4. producer atomic persistence + Edge test/CI gate;
5. complete pull/local apply;
6. exact selected service + consumer cutover;
7. offline/corruption/fail-closed hardening;
8. verification evidence.

Do not deploy/merge a producer-only or consumer-only intermediate state as completed issue #302.
