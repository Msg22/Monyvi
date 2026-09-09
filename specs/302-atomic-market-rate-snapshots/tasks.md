# Tasks: Atomic Market-Rate Snapshots

**Input**: Approved `spec.md` plus `plan.md`, `research.md`, `data-model.md`, `contracts/market-rate-snapshots.openapi.yaml`, and `quickstart.md`.  
**Tests**: Mandatory. FR-023 and SC-009 require deterministic acceptance coverage. Tests must be written and observed failing before the corresponding production implementation.

## Format

`- [ ] T### [P?] [US#?] Description with exact file path`

- `[P]` means the task can be worked independently in parallel because it targets different files and has no unmet dependency.
- `[US1]`–`[US4]` map directly to the approved user stories.
- Setup/foundational/cross-cutting tasks intentionally have no user-story tag.

---

## Phase 1: Setup — Shared deterministic fixtures

**Purpose**: Establish one reusable exact snapshot fixture so SQL, Edge, logic, and mobile tests assert the same 37-instrument contract.

- [ ] T001 Create deterministic complete/partial/conflicting V1 snapshot fixture builders in `packages/logic/src/metals/__tests__/current-market-snapshot.fixtures.ts`, including Gold, Silver, all 35 supported fiat currencies, implicit USD=1, separate metal/currency provider times, and exact decimal strings.
- [ ] T002 [P] Create Watermelon-shaped root/observation snapshot fixtures in `apps/mobile/__tests__/fixtures/market-rate-snapshot.ts` with helpers for incomplete, duplicate-instrument, mismatched-value, older/newer, and null-provider-time candidates.
- [ ] T003 [P] Create Edge-provider payload fixtures in `supabase/functions/_shared/market-rate-snapshot-contract.test.ts` that model a valid metals.dev response plus malformed/non-positive/missing-field variants; keep tests red until the shared contract module exists.

**Checkpoint**: All layers can express the same success/failure snapshot cases without inventing independent fixture semantics.

---

## Phase 2: Foundational — Canonical V1 snapshot contract

**Purpose**: Define the shared current-market completeness/value rules before any selector or producer implementation.

- [ ] T004 [P] Add failing tests for the exact 37-instrument set, USD identity, BTC exclusion, accepted metal/currency unit-orientation rules, duplicate/missing/unexpected instrument rejection, and exact root-to-observation equivalence in `packages/logic/src/metals/__tests__/current-market-snapshot.test.ts`.
- [ ] T005 Implement the pure canonical current-market snapshot types/validators/constants in `packages/logic/src/metals/current-market-snapshot.ts` and export them from `packages/logic/src/index.ts`; use exact decimal semantics and existing `rate-reference.ts` validity/freshness rules rather than binary floating-point financial truth.
- [ ] T006 Implement the Zod metals.dev/network snapshot contract and producer mapping helpers in `supabase/functions/_shared/market-rate-snapshot-contract.ts` to satisfy T003, including exactly 37 trust observations, provider-time preservation, source/quality/unit/orientation, and one supplied snapshot/capture identity.
- [ ] T007 Add an architecture regression assertion to `apps/mobile/__tests__/architecture/current-market-snapshot-contract.test.ts` that fixes the canonical rule that current snapshot identity is `market_rates.id` and child `batch_id`, and that current freshness cannot derive from `market_rates.created_at`.

**Checkpoint**: The exact V1 snapshot contract is deterministic in shared logic and the provider adapter can build—but not yet persist—one complete envelope.

---

## Phase 3: User Story 1 — Trust One Complete Rate Snapshot Everywhere (Priority: P1)

**Goal**: Every current displayed value and trust fact is derived from one selected complete local snapshot.

**Independent Test**: Seed complete snapshot A plus a deliberately newer mismatched/incomplete B in WatermelonDB; verify the selected snapshot remains A and Live Rates, My Metals, holding detail, and Home/net-worth current inputs all expose values/trust from A only.

### Tests first

- [ ] T008 [US1] Add failing selection tests for no snapshot, complete A, newer incomplete B, cross-batch child rows, duplicate instrument rows, root/value mismatch, same-ID identical replay, same-ID conflict, and older delayed snapshot ordering in `apps/mobile/__tests__/services/market-rate-snapshot-read-model-service.test.ts`.
- [ ] T009 [P] [US1] Add failing tests proving trust summaries are built only from observations supplied for one snapshot and never by independently querying newest observations in `apps/mobile/__tests__/services/live-rates-trust-read-model-service.test.ts`.
- [ ] T010 [P] [US1] Add failing consumer-integration tests that assert a shared `snapshotId`/value/trust boundary across `useMarketRates`, Live Rates, My Metals, holding detail, and net-worth metal valuation in `apps/mobile/__tests__/hooks/current-market-snapshot-consumers.test.tsx`.
- [ ] T011 [P] [US1] Add a source-architecture test preventing current hooks/services from directly combining independent latest `market_rates` and `market_rate_observations` selectors in `apps/mobile/__tests__/architecture/current-market-snapshot-consumers.test.ts`.

### Implementation

- [ ] T012 [US1] Implement `SelectedMarketRateSnapshot` construction/validation/selection in `apps/mobile/services/market-rate-snapshot-read-model-service.ts`: order roots by immutable `(created_at,id)`, join children only by matching `batch_id`, require the exact 37-observation contract, retain the prior valid candidate when a newer candidate is incomplete/invalid, and expose one immutable root+trust read model.
- [ ] T013 [US1] Refactor `apps/mobile/services/live-rates-trust-read-model-service.ts` so current trust mapping/summarization accepts one selected snapshot's observations instead of running independent newest-observation queries; preserve existing provider-time freshness classification and trust-display semantics.
- [ ] T014 [US1] Refactor `apps/mobile/hooks/useMarketRates.ts` so current `latestRates` comes from the selected snapshot service while previous-day/trend lookup remains a separate historical query; expose current snapshot identity/provider-time status without using `createdAt` as freshness.
- [ ] T015 [US1] Refactor `apps/mobile/hooks/useLiveRatesScreen.ts` so current numeric rates and their source/quality/provider-time/freshness are read from one selected snapshot; keep previous-day trend inputs historical and non-certifying.
- [ ] T016 [US1] Refactor `apps/mobile/hooks/useMetalPortfolio.ts` so all current Gold/Silver/preferred/purchase-currency rate inputs and `PortfolioRateStatus` derive from one selected snapshot while immutable sale/acquisition references remain separate.
- [ ] T017 [US1] Refactor `apps/mobile/hooks/useMetalHoldingDetail.ts` so current valuation inputs derive from the same selected snapshot and the hook no longer owns an independent live-trust subscription; preserve acquisition/terminal evidence observers unchanged.
- [ ] T018 [US1] Refactor `apps/mobile/hooks/useNetWorth.ts` and the current-rate input boundary in `apps/mobile/services/net-worth-read-model-service.ts` so Home/net-worth metal/current currency valuation consumes the selected current snapshot and never an independently selected latest root.
- [ ] T019 [US1] Remove or deprecate current-trust use of `MarketRate.isStale()` / `MarketRate.getAge()` in `packages/db/src/models/MarketRate.ts`; if historical callers still require root-age helpers, rename/scope them so they cannot be mistaken for provider freshness and update their focused tests in `packages/db/src/__tests__/`.
- [ ] T020 [US1] Run the current-rate consumer source search from `quickstart.md`, classify every hit, and update any remaining direct current selector in its exact owning hook/service; extend `apps/mobile/__tests__/architecture/current-market-snapshot-consumers.test.ts` for each bypass found so the cutover cannot regress.

**Checkpoint**: US1 passes entirely from deterministic local fixtures. It is independently testable but **not releasable alone** because FR-002 requires producer ingestion and consumer binding to ship together with US2.

---

## Phase 4: User Story 2 — Refresh Safely Through Failure, Replay, and Partial Updates (Priority: P1)

**Goal**: The producer, server pull, sync, and realtime paths can only introduce complete valid replacement snapshots.

**Independent Test**: Starting from complete A, exercise successful B, persistence interruption/rejection, partial B, identical replay, conflicting replay, out-of-order older Z, and duplicate delivery; selection changes only for a complete valid newer snapshot.

### Tests first

- [ ] T021 [US2] Create failing SQL regression coverage in `supabase/tests/atomic_market_rate_snapshots_test.sql` for complete 37-observation persistence, missing/duplicate/unexpected instruments, invalid quality/unit/orientation/non-positive value, root/value mismatch, null provider time, identical replay, conflicting replay rollback, permissions, complete-envelope pull, legacy/unbound omission, cursor pagination, and older-delivery ordering.
- [ ] T022 [P] [US2] Extend `supabase/functions/_shared/market-rate-snapshot-contract.test.ts` with failing assertions that one provider payload maps to one UUID/capture time, 37 correct observations, Gold/Silver metal timestamp, all fiat currency timestamp, USD identity, BTC exclusion, and deterministic persistence payload.
- [ ] T023 [P] [US2] Add failing complete-envelope RPC/paging adapter tests in `apps/mobile/__tests__/services/sync/pull-market-rate-snapshots.test.ts`, including malformed envelope rejection and no cursor advancement contract on page failure.
- [ ] T024 [P] [US2] Add failing refresh tests in `apps/mobile/__tests__/services/live-rates-refresh-service.test.ts` proving root+observations are applied in one Watermelon writer/batch and a failed/partial pull leaves cached A unchanged.
- [ ] T025 [P] [US2] Add failing realtime tests in `apps/mobile/__tests__/providers/MarketRatesRealtimeProvider.test.tsx` proving a root INSERT is only a sync trigger and never directly promotes the notified row.
- [ ] T026 [P] [US2] Add failing importer tests in `scripts/import-market-rates-to-local.test.js` proving local QA import copies only complete root+bound-observation snapshot units and never creates root-only trusted candidates.

### Database and generated contracts

- [ ] T027 [US2] Add `supabase/migrations/069_atomic_market_rate_snapshots.sql` with the `NOT VALID` `market_rate_observations.batch_id -> market_rates.id ON DELETE CASCADE` FK, safe `(batch_id,instrument_code)` index, service-role-only `persist_market_rate_snapshot_v1`, exact 37-observation/root-value validation, idempotent replay, conflict rejection, and explicit grants/revokes; satisfy the persistence/security half of T021 without altering legacy bindings.
- [ ] T028 [US2] Extend `supabase/migrations/069_atomic_market_rate_snapshots.sql` with `pull_market_rate_snapshots_page_v1`, fixed upper-watermark/root cursor paging, and fail-closed complete-envelope filtering; satisfy the pull/order/legacy half of T021 without deleting or inferring legacy rows.
- [ ] T029 [US2] Regenerate database contracts with the repository workflow and commit the generated RPC signatures in `packages/db/src/supabase-types.ts`; verify `packages/db/src/schema.ts` and `packages/db/src/migrations.ts` remain semantically unchanged because no local table columns were added, and commit generator output only if it legitimately changes.

### Producer, pull, sync, realtime

- [ ] T030 [US2] Complete `supabase/functions/_shared/market-rate-snapshot-contract.ts` producer payload mapping to satisfy T022, preserving exact decimal strings and explicit null provider time rather than substituting local timestamps.
- [ ] T031 [US2] Refactor `supabase/functions/fetch-metal-rates/index.ts` to validate the external response with the shared Zod contract, generate one snapshot UUID/capture time, call only `persist_market_rate_snapshot_v1` for root+children persistence, preserve existing response compatibility, and add `snapshotId`/`persistenceStatus` structured evidence.
- [ ] T032 [US2] Replace independent current `pullMarketRates()` + `pullMarketRateObservations()` composition with complete `pull_market_rate_snapshots_page_v1` envelope pulling/validation in `apps/mobile/services/sync/pull-strategies.ts`; preserve separate historical market-rate reads only where explicitly historical.
- [ ] T033 [US2] Refactor `apps/mobile/services/live-rates-refresh-service.ts` so complete snapshot pages are prepared and committed via one Watermelon `database.write`/batch unit and the market snapshot cursor advances only after successful full-page application; preserve cached A on any failure.
- [ ] T034 [US2] Update `apps/mobile/providers/MarketRatesRealtimeProvider.tsx` so realtime INSERT continues to invoke the normal sync path only, and remove any assumption that the notified root is independently current before the complete pull/selection service accepts it.
- [ ] T035 [US2] Update `scripts/import-market-rates-to-local.js` to query/import the remote root rows **and their matching `market_rate_observations`** as complete snapshot units, delete/replace the two local shared tables in dependency-safe order, reject or skip incomplete legacy units, and keep `--best-effort` behavior explicit; satisfy T026.

**Checkpoint**: US1 + US2 together form the minimum releasable P1 guarantee. Do not deploy one without the other; producer creation and consumer binding are one issue #302 contract.

---

## Phase 5: User Story 3 — Keep the Last Trusted Snapshot Offline (Priority: P1)

**Goal**: The same complete selected snapshot reconstructs after restart/offline and survives failed refresh without artificial freshness.

**Independent Test**: Cache complete A, disconnect/recreate subscribers (simulated restart), fail a refresh, and verify A reconstructs with the same snapshot ID/provider times and remains usable for supported calculations.

### Tests first

- [ ] T036 [US3] Extend `apps/mobile/__tests__/services/market-rate-snapshot-read-model-service.test.ts` with failing restart/resubscribe/offline cases proving selection is derived entirely from persisted Watermelon root+children and does not require an in-memory selected pointer.
- [ ] T037 [P] [US3] Extend `apps/mobile/__tests__/services/live-rates-refresh-service.test.ts` with failing cached-A/offline/failed-refresh cases proving no code path clears or partially replaces A when the provider/network/RPC/pull fails.
- [ ] T038 [P] [US3] Extend `scripts/import-market-rates-to-local.test.js` with a complete imported snapshot reconstruction case used by local/manual QA after Supabase reset.

### Implementation

- [ ] T039 [US3] Harden `apps/mobile/services/market-rate-snapshot-read-model-service.ts` subscription lifecycle so unsubscribe/resubscribe/app restart deterministically rebuilds the same selected snapshot from WatermelonDB and never promotes by receipt time.
- [ ] T040 [US3] Harden `apps/mobile/services/live-rates-refresh-service.ts` loading/error paths so a failed refresh reports failure without deleting the last complete cached snapshot or changing its provider timestamps.
- [ ] T041 [US3] Verify and, only where necessary, update shared market-rate cleanup/import code in `scripts/import-market-rates-to-local.js` and `apps/mobile/scripts/manual-qa-seed.js` so local reset/seed workflows preserve snapshot-unit integrity; no new market-rate retention/pruning duration may be introduced.
- [ ] T042 [US3] Add a focused regression in `apps/mobile/__tests__/hooks/current-market-snapshot-consumers.test.tsx` proving offline Live Rates/My Metals/holding current values use cached A while all displayed/derived freshness remains based on A's original provider observation times.

**Checkpoint**: A previously complete current snapshot remains trustworthy and reconstructible without connectivity or memory state.

---

## Phase 6: User Story 4 — Fail Closed for Missing or Invalid Market Inputs (Priority: P2)

**Goal**: Withhold only rate-dependent outputs that cannot be proven while preserving recorded holdings/unrelated financial facts.

**Independent Test**: Provide no complete selected snapshot, invalid required observations, and null provider time; verify dependent valuations are unavailable rather than zero/guessed, holdings remain visible, and null provider time produces Unknown freshness without local repair.

### Tests first

- [ ] T043 [US4] Add failing portfolio/detail cases to `apps/mobile/__tests__/hooks/current-market-snapshot-consumers.test.tsx` proving holdings/recorded facts remain rendered/readable when selected current rates are null while current valuation/performance fields become unavailable rather than zero.
- [ ] T044 [P] [US4] Add failing Unknown-freshness tests in `apps/mobile/__tests__/services/market-rate-snapshot-read-model-service.test.ts` for null/unparseable/future provider time and assert root `createdAt`, fetch time, sync time, receipt time, and restart time are never substituted.
- [ ] T045 [P] [US4] Add failing net-worth tests in `apps/mobile/__tests__/services/net-worth-read-model-current-rates.test.ts` proving missing/invalid current market inputs produce unavailable dependent asset/net-worth values rather than guessed/currently unrelated/zero rates while account/holding source facts are preserved.

### Implementation

- [ ] T046 [US4] Refine `apps/mobile/hooks/useMetalPortfolio.ts` readiness so ownership/holding facts can complete independently of current snapshot availability; use explicit rate readiness/unavailability for only rate-dependent sections and never block the whole recorded portfolio on missing current rates.
- [ ] T047 [US4] Refine `apps/mobile/hooks/useMetalHoldingDetail.ts` and `apps/mobile/services/metal-detail-read-model-service.ts` so recorded holding/acquisition/terminal facts remain available when the selected current snapshot is null, while current-value outputs remain null/unavailable and no historical/current substitution is introduced.
- [ ] T048 [US4] Refine `apps/mobile/hooks/useNetWorth.ts` and `apps/mobile/services/net-worth-read-model-service.ts` so any current-rate-dependent aggregate fails closed without coercing missing rates to zero; preserve independent account/recorded inputs for unaffected presentation/read models.
- [ ] T049 [US4] Ensure `apps/mobile/services/market-rate-snapshot-read-model-service.ts` returns explicit `missing`/`unknown freshness` trust states from the selected envelope and never constructs provider time from capture/root timestamps; satisfy T044.
- [ ] T050 [US4] Remove remaining current freshness formatting based on `MarketRate.createdAt` from `apps/mobile/hooks/useLiveRatesScreen.ts` and related current-rate presentation helpers; use the selected snapshot's exact relevant/conservative provider observation evidence only.

**Checkpoint**: Missing/invalid market evidence can no longer create misleading zero/current substitutions, and user-owned recorded facts remain intact.

---

## Phase 7: Cross-cutting documentation, verification, and release evidence

**Purpose**: Prove the end-to-end guarantee and close constitution/business documentation obligations without expanding scope.

- [ ] T051 Update `docs/business/business-decisions.md` with the final issue #302 rules: `market_rates.id` snapshot identity, 37-observation completeness, `batch_id` binding, atomic producer/pull/local selection, provider-time-only freshness, fail-closed legacy cutover, and separation from immutable acquisition/terminal references.
- [ ] T052 [P] Update `specs/302-atomic-market-rate-snapshots/quickstart.md` only if implementation-time command/file names differ from the plan, keeping every claimed verification command exact and reproducible.
- [ ] T053 Run the SQL/local Supabase verification for `supabase/tests/atomic_market_rate_snapshots_test.sql` after `supabase/migrations/069_atomic_market_rate_snapshots.sql` is applied locally; record the exact command and passing output in PR evidence.
- [ ] T054 Run focused `@monyvi/logic` and `@monyvi/mobile` Jest suites covering current-market snapshot validation, selector, refresh, realtime, importer, Live Rates, Metals, holding detail, and net worth; record exact commands/results.
- [ ] T055 Run `npm run typecheck -w @monyvi/mobile`, `npm run lint -w @monyvi/mobile`, required repository lint/tests, and DB generation/script checks; fix failures within issue #302 scope before review.
- [ ] T056 Re-run the current-rate bypass search for `observeLiveRatesTrust`, direct `market_rates` / `market_rate_observations` current selectors, `useMarketRates`, `isStale()`, and `getAge()`; document each remaining hit as historical/test/unrelated or fix it and add an architecture regression test in `apps/mobile/__tests__/architecture/current-market-snapshot-consumers.test.ts`.
- [ ] T057 Perform regression-only manual QA on existing Home, Live Rates, My Metals, and holding detail in EN/AR and online/offline states; verify no new screen/navigation/layout was introduced and failed refresh does not blank/zero cached valid values. Record manual-only evidence honestly.
- [ ] T058 Build the PR verification matrix mapping FR-001–FR-023, SC-001–SC-009, and every listed edge case to deterministic automated evidence or an explicit manual-only reason; do not mark issue #302 complete with an unmapped requirement.

**Final Checkpoint**: Every current-rate value/trust path is snapshot-bound, producer-to-device failure/replay/offline behavior is deterministic, all required checks are evidenced, and the implementation contains no UI/product-scope expansion.

---

## Dependencies & Execution Order

### Phase dependencies

```text
Phase 1 Setup
    ↓
Phase 2 Foundational contract
    ↓
┌───────────────────────────────┐
│ Phase 3 US1 local selection   │
└──────────────┬────────────────┘
               │
               ├───────────────┐
               ▼               │
┌───────────────────────────────┐
│ Phase 4 US2 producer/sync     │  ← US1+US2 are one release gate
└──────────────┬────────────────┘
               ▼
┌───────────────────────────────┐
│ Phase 5 US3 offline/restart   │
└──────────────┬────────────────┘
               ▼
┌───────────────────────────────┐
│ Phase 6 US4 fail-closed       │
└──────────────┬────────────────┘
               ▼
Phase 7 verification/release evidence
```

- US1 can be developed/tested from local deterministic fixtures after Foundation.
- US2 can begin after Foundation in a separate workstream, but it shares the final release gate with US1 because FR-002 forbids shipping producer and consumer binding independently.
- US3 depends on the selected-snapshot service and complete refresh path from US1/US2.
- US4 depends on the selected-snapshot semantics established by US1 and focuses on missing/invalid behavior.
- Phase 7 starts only after the desired user-story implementation is complete.

### Within-story TDD order

1. Write the listed tests first.
2. Run them and confirm the intended failure is for missing behavior—not fixture/setup breakage.
3. Implement the smallest production change.
4. Re-run focused tests before moving to the next task.
5. Refactor only while tests remain green.

### Safe parallel opportunities

- T002 and T003 can run independently after T001's fixture semantics are agreed.
- T004 and T003/T006 work on different runtimes; T006 waits on the red T003 test.
- US1 tests T009–T011 can be authored in parallel with T008.
- US2 test tasks T022–T026 target different files and can be authored in parallel with SQL T021.
- US3 tests T037–T038 can be authored in parallel with T036.
- US4 tests T044–T045 can be authored in parallel with T043.
- Documentation T051/T052 can proceed in parallel only after implemented semantics are stable.

## Parallel Examples

### US1

```text
Task A: T008 selector service red tests
Task B: T009 trust mapper red tests
Task C: T010 cross-consumer red tests
Task D: T011 architecture bypass red test
```

All four can be prepared before T012–T019 production edits, then implementation converges on the same selected-snapshot service.

### US2

```text
Task A: T021 SQL transactional/RPC red tests
Task B: T022 Edge producer mapping red tests
Task C: T023 pull adapter red tests
Task D: T024 refresh local-write red tests
Task E: T025 realtime trigger red tests
Task F: T026 local importer red tests
```

Do not parallel-edit `069_atomic_market_rate_snapshots.sql`: T027 then T028 are sequential in one migration file.

## Implementation Strategy

### Minimum releasable increment

For this feature, the normal “US1-only MVP” is **not** releasable. The approved spec defines producer ingestion and consumer binding as one indivisible trust guarantee. The minimum releasable slice is:

1. Phase 1 Setup
2. Phase 2 Foundation
3. Phase 3 US1
4. Phase 4 US2
5. focused end-to-end verification proving producer → pull → Watermelon selector → consumers

US3 and US4 then complete the approved offline/fail-closed behavior before issue #302 is considered done.

### Commit discipline

Prefer logical TDD commits or small coherent batches:

1. red tests/fixtures;
2. database contract;
3. producer atomic persistence;
4. complete pull/local selector;
5. consumer cutover;
6. offline/fail-closed hardening;
7. docs/verification.

Do not merge or deploy intermediate producer-only/consumer-only states as the completed issue #302 guarantee.