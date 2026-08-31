# Tasks: Metals Module Redesign

**Input**: Canonical documents in `specs/035-metals-module-redesign/`
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, every contract and checklist, `docs/business/business-decisions.md`, constitution, `AGENTS.md`, and approved visual/content handoff

**Tests**: Strict TDD. Each slice and story completes Red, then Green, then refactor/verification. A Red gate is complete only after every listed test fails for the intended missing behavior. Green work never starts before that gate.

**V1 boundary**: Gold and Silver only. Exclude Zakat, partial sales, gift/inheritance/dowry acquisition modes, Platinum/Palladium/Other Metals, full Live Rates redesign, Screen 19/manual conflict-choice UI, and app-wide decimal migration.

## Ownership and Conflict Controls

- **Planning owner — Slice 1** owns only feature delivery/evidence documents.
- **Exact-domain owner — Slice 2** owns `packages/logic/src/metals/` and Decimal.js dependency/lockfile changes; this owner does not edit the package root barrel.
- **Generic-foundation owner — Slice 3A** exclusively owns stable action identity/serialization/state/storage interfaces, `financial_action_groups`, `supabase/migrations/067_financial_action_foundation.sql`, and `packages/logic/src/financial-actions/index.ts` through frozen milestone T024.
- **#242 account-integrity owner — Slice 3B** exclusively owns `supabase/migrations/069_account_financial_effects.sql`, `account_financial_effects`, `accounts.financial_revision`, every balance-writer migration/guard, account-effect CAS/RPC behavior, protected sync columns, legacy cutover, mixed-client rejection, compensation, and the single post-T042 shared DB regeneration at T033.
- **Metals-persistence owner — Slice 4** exclusively owns `supabase/migrations/068_metals_domain.sql`, Metals schema/models and the T042 shared generated DB snapshot, Metals sync registration, all Metals translations/schema keys, shared fixture registry, approved production render assets/manifest, and generic-action Metals adapters. If migration prefixes drift, this owner rebases and renumbers before implementation.
- **Package-integration owner — T034** is the sole editor of `packages/logic/src/index.ts` after T017 and T024 and before mobile consumers.
- **Story owners — Slices 5–8** own only listed story tests, isolated services/hooks/components/routes/action descriptors, manual plans, and `coverage/usN.md` fragments. They do not edit migrations, generated files, translations, sync config, shared barrels, shared fixture registry, or `[holdingId]/index.tsx`.
- **Integration owner — Slice 9** is the only owner of `apps/mobile/app/(private)/metals/[holdingId]/index.tsx`, story barrels, cross-story route composition, final `coverage-matrix.md`, and release evidence.
- `[P]` means same prerequisite gate is already complete, files do not overlap, and owners may work concurrently. No Red test and its Green implementation share a parallel window.
- Only tasks explicitly marked **BLOCKED BY FULL #242 GATE T033** are gated: sale account credit, credited Undo, and account compensation/replacement credit. Slice 4 and every unrelated Metals task depend on generic-foundation milestone T024, never transitively on T033.

## Approved Nine-Slice Review Topology

1. Planning and analysis.
2. Exact Metals domain.
3. Generic financial-action foundation plus parallel full #242 account-integrity lane.
4. Metals persistence and reconciliation.
5. Portfolio surfaces.
6. Holding experience.
7. Add/Edit.
8. Terminal lifecycle.
9. Integration and quality.

This topology controls ownership, dependency stacks, and future review size. After Slice 2 reviews, it authorizes isolated local branches/worktrees and one stable local foundation commit; it does not authorize Metals pushes, pull requests, or GitHub changes.

---

## Phase 1: Slice 1 — Planning and Analysis

**Purpose**: Freeze ownership, TDD evidence, traceability, and nine-slice delivery controls.

- [x] T001 Record nine-slice file ownership, dependency bases, no-overlap rules, rebase order, and the no-PR-authorization boundary in `specs/035-metals-module-redesign/delivery-topology.md`
- [x] T002 Create the Red/Green/refactor evidence template, command log, stop conditions, and optional-hook prohibition in `specs/035-metals-module-redesign/implementation-evidence.md`
- [x] T003 [P] Create per-story manual-test and manual-only rationale templates in `specs/035-metals-module-redesign/manual-tests/README.md`
- [x] T004 [P] Create traceability inventory for FR-001–FR-104 and actual SC-001–SC-008, reserved SC-009, and SC-010–SC-030 in `specs/035-metals-module-redesign/coverage/README.md`
- [x] T005 Verify worktree dependency junction, approved canonical asset hashes, current migration prefix, and unchanged source authorities in `specs/035-metals-module-redesign/planning-verification.md` (directory junction and Jest package resolution verified; recovery evidence recorded)

**Checkpoint**: File ownership and evidence contracts are reviewable. Slices 2 and 3 may begin in parallel.

---

## Phase 2: Slice 2 — Exact Metals Domain

**Purpose**: Deliver pure exact Gold/Silver arithmetic before persistence or UI consumers.

### Red

- [x] T006 Add Decimal.js to `packages/logic/package.json` and `package-lock.json` without unrelated dependency changes
- [x] T007 [P] Write failing canonical parse/serialize, exponent rejection, precision-50, half-even, minor-unit, and Arabic-Indic/decimal-comma tests in `packages/logic/src/metals/__tests__/decimal.test.ts`
- [x] T008 [P] Write failing catalog-v1, exact `24K · 999`, stable-code, snapshot, unsupported-metal, ambiguous-purity, pure-gram, and no-intermediate-rounding tests in `packages/logic/src/metals/__tests__/purity-valuation.test.ts`
- [x] T009 [P] Write failing current/realized attribution, same-currency fee, FX orientation, missing cost/rate, immutable snapshot, two-minor-unit explanation, and Decimal.js/PostgreSQL numeric parity fixtures in `packages/logic/src/metals/__tests__/attribution-postgres-parity.test.ts`
- [x] T010 [P] Write failing Active/Sold/Disposed, correction, hidden Delete, reversal-to-Active, tied-time ordering, observation-time freshness, and unavailable-input tests in `packages/logic/src/metals/__tests__/lifecycle-rate-trust.test.ts`
- [x] T011 Run T007–T010 and record expected Red failures before production changes in `specs/035-metals-module-redesign/evidence/slice-2-red.md`

### Green and refactor

- [x] T012 Implement immutable Decimal.js configuration, canonical decimal parsing/serialization, exact comparison, and final-boundary rounding in `packages/logic/src/metals/decimal.ts`
- [x] T013 Implement versioned Gold/Silver purity catalog, pure-gram math, valuation, FX orientation, and availability results in `packages/logic/src/metals/purity-catalog.ts` and `packages/logic/src/metals/valuation.ts`
- [x] T014 Implement combined P/L, additive attribution, fee handling, display conversion, and rounding-explanation state in `packages/logic/src/metals/attribution.ts`
- [x] T015 Implement deterministic lifecycle reduction and provider-observation-time rate trust without DB or presentation imports in `packages/logic/src/metals/lifecycle-reducer.ts` and `packages/logic/src/metals/rate-trust.ts`
- [x] T016 Export only stable pure Metals APIs through `packages/logic/src/metals/index.ts` and record the local public surface in `specs/035-metals-module-redesign/evidence/metals-logic-api.md`
- [x] T017 Run Slice 2 tests/typecheck, refactor while green, and record SC-004/005/006/017/018/021/026 evidence in `specs/035-metals-module-redesign/evidence/slice-2-green.md`

---

## Phase 3: Slice 3 — Generic Financial-Action Foundation and #242 Account Integrity

**Purpose**: Freeze shared non-account action interfaces first, then finish account effects and writer cutover behind a separate full #242 gate. Slice 3A starts after T005 beside Slice 2. Slice 3B continues independently after T024.

**Execution rule**: Task numbering is traceability, not a hidden dependency. Once T017 and T024 pass, start T034–T049 even when T025–T033 remain incomplete; only T101–T103, T128–T130, and T140–T141 wait for T033.

### Milestone 3A — Generic foundation Red

- [ ] T018 [P] Write failing owner/action identity, domain type/reference, canonical serialization/hash identity, durable state/outcome/replay, same-ID/same-hash replay, and same-ID/different-hash rejection tests in `packages/logic/src/financial-actions/__tests__/action-contracts.test.ts`
- [ ] T019 [P] Write failing generic root/outbox identity, lifecycle state, current-user scope, retry, restart, and storage-interface tests without account balance/effect assumptions in `apps/mobile/__tests__/services/financial-action-foundation.integration.test.ts`
- [ ] T020 Run T018–T019 and record intended generic-foundation Red failures in `specs/035-metals-module-redesign/evidence/slice-3a-red.md`

### Milestone 3A — Generic foundation Green and freeze

- [ ] T021 Implement generic owner/action identity, domain type/reference, canonical payload hashing, durable state/outcome/replay envelopes, and a nullable expected-account-revision extension that is valid only for later linked account effects in `packages/logic/src/financial-actions/action-contracts.ts` and `packages/logic/src/financial-actions/index.ts`
- [ ] T022 Create `supabase/migrations/067_financial_action_foundation.sql` with owner-scoped `financial_action_groups` identity, domain type/reference, state/outbox storage, RLS, immutable payload hash/outcome/replay fields, and nullable expected account revision reserved for actions that later link account effects
- [ ] T023 Run `npm run db:migrate` and implement persisted-field-only `FinancialActionGroup` plus stable local storage interfaces in `packages/db/src/models/FinancialActionGroup.ts`, `packages/db/src/schema.ts`, `packages/db/src/migrations.ts`, `packages/db/src/supabase-types.ts`, `packages/db/src/database.ts`, `packages/db/src/index.ts`, and `apps/mobile/services/financial-action-foundation-repository.ts`
- [ ] T024 Run generic serialization/storage/restart/user-scope suites, refactor while green, freeze interface/schema hashes and the stacked-development base without creating a commit, and record milestone evidence in `specs/035-metals-module-redesign/dependencies/financial-action-foundation.md`

### Milestone 3B — Full #242 Red

- [ ] T025 Inventory account, transaction, transfer, recurring, SMS foreground/background/headless, debt, fixture/repair, sync, and direct DB balance writers; add a failing completeness guard in `specs/035-metals-module-redesign/dependencies/issue-242-writer-inventory.md` and `apps/mobile/__tests__/architecture/account-balance-writer-guard.test.ts`
- [ ] T026 [P] After T025, write failing `accounts.financial_revision` revision-0 backfill, `account_financial_effects`, nullable root expected-account-revision staying null without effects and becoming required with effects, atomic root/effect/outbox/balance/revision, protected-column, legacy drain/migrate/quarantine, and mixed-client fixtures in `apps/mobile/__tests__/migrations/account-financial-effects-cutover.test.ts`
- [ ] T027 [P] After T025, write failing local/RPC/sync tests for expected account revision, owner-scoped idempotent CAS, fixed lock order, identical replay, hash mismatch, separate nullable holding/account canonical winner IDs and per-resource revision/evidence hashes, account-only stale without a fabricated holding winner, rollback, dedicated sync, failure propagation, and exact-once compensation in `apps/mobile/__tests__/services/account-financial-action-protocol.integration.test.ts` and `supabase/tests/account_financial_effects_test.sql`
- [ ] T028 Run T025–T027 and record every intended full-#242 Red failure in `specs/035-metals-module-redesign/evidence/slice-3b-red.md`

### Milestone 3B — Full #242 Green and gate

- [ ] T029 Create reserved post-Metals migration `supabase/migrations/069_account_financial_effects.sql` with revision-0 backfill, `account_financial_effects`, enforcement that root expected account revision is null without effects and required/validated with effects, account-effect CAS/RPC behavior, RLS, protected balance/revision columns, metadata whitelist, immutable outcomes, and fail-closed mixed-client enforcement
- [ ] T030 Implement account-effect model fields and atomic local root/effect/outbox/balance/revision commands without editing shared generated registries yet in `packages/db/src/models/Account.ts`, `packages/db/src/models/AccountFinancialEffect.ts`, and `apps/mobile/services/account-balance-command-service.ts`
- [ ] T031 Implement dedicated account-effect synchronization, protected account metadata handling, and exact-once compensation/recovery in `apps/mobile/services/financial-action-sync-service.ts`, `apps/mobile/services/financial-action-reconciliation-service.ts`, and `apps/mobile/services/sync/account-protected-fields.ts`
- [ ] T032 Route every inventoried writer through guarded commands, drain/migrate/quarantine legacy unsynced rows, reject legacy protected-field writes, and add deterministic cutover fixtures in `apps/mobile/services/account-balance-writer-registry.ts` and `apps/mobile/scripts/seed-fixtures/financial-action-cutover-fixtures.js`
- [ ] T033 After T042 lands, rebase the reserved `069` migration, run `npm run db:migrate`, update shared `packages/db/src/schema.ts`, `packages/db/src/migrations.ts`, `packages/db/src/supabase-types.ts`, `packages/db/src/database.ts`, and `packages/db/src/index.ts` once under the #242 owner, then run writer-guard/SQLite/SQL/sync/compensation/replay/restart/multi-device/cutover/typecheck/generated-drift suites and record full #242 completion in `specs/035-metals-module-redesign/dependencies/issue-242.md`

**Checkpoint**: T024 is stable base for unrelated Metals. T033 alone enables credited Sale, credited Undo, and account compensation/replacement credit. No Metals-only action root, account effect, or synchronizer exists.

---

## Phase 4: Slice 4 — Metals Persistence and Reconciliation

**Purpose**: Persist exact Metals facts and append-only holding evidence against frozen generic-foundation milestone T024. Depends on T017 and T024 only; full #242 may continue in parallel and is not a transitive prerequisite.

### Package integration milestone

- [ ] T034 After T017 and T024, integrate stable Metals and generic-action package APIs exactly once before mobile consumers in `packages/logic/src/index.ts`; no parallel slice may edit this root barrel

### Red
- [ ] T035 [P] Write failing deterministic Gold/Silver exact backfill, schema, persisted-model, current acquisition-action linkage to independent `acquisition_metal` and `acquisition_purchase_currency` references, no invented legacy acquisition action/reference set, replaceable current purity projection with immutable before/after/catalog evidence, valid/missing/ambiguous provenance, rerun idempotency, compatibility-column, inherited ownership, sync-column, index, and Metals-event expected-holding-revision ownership tests in `apps/mobile/__tests__/migrations/metals-domain-backfill-model.test.ts`
- [ ] T036 [P] Write failing real-SQLite and generic-interface tests proving Add/correction/Sell-without-credit/Dispose/Delete/Undo-without-credit store expected holding revision only in Metals event/evidence linked by action ID, then enforce replay, one winner, rollback, and user scope in `apps/mobile/__tests__/services/metal-financial-action-foundation.integration.test.ts`
- [ ] T037 [P] Write failing reconciliation/sync/rate/metadata tests for stale versus validation/incomplete server rejection, separate holding/account winner identity and canonical revision/evidence validation, account-only stale restoring the pre-action holding without inventing a holding winner, hash-mismatch non-retry, incomplete/foreign/missing canonical evidence, restart, action lock, exact-once holding/account restore or safe rollback, metadata LWW, pull/push failure, protected fragments, and no watermark advance in `apps/mobile/__tests__/services/metals-reconciliation-sync-rate.integration.test.ts`
- [ ] T038 [P] Write failing EN/AR key parity, approved content, interpolation, stable language-neutral key, forbidden retired-copy, and translation-schema tests in `apps/mobile/__tests__/i18n/metals-content-contract.test.ts`
- [ ] T039 [P] Write failing deterministic fixture-registry/schema tests for fresh/stale/unknown/missing rates, local/restart/conflict states, account eligibility, locale/theme/text scale, reset, and inspection controls in `apps/mobile/__tests__/scripts/metals-e2e-fixture-registry.test.ts`
- [ ] T040 [P] Write failing FR-103 production render-library tests for deterministic Gold/Silver × bar/coin/jewelry mapping, typed manifest completeness, approved SHA-256 provenance, neutral unsupported-form fallback, and accessible non-color text identity in `apps/mobile/__tests__/components/metals/metal-render-manifest.test.ts`
- [ ] T041 Run T035–T040 and record every intended Red failure before migration, translations, fixtures, asset promotion, or services in `specs/035-metals-module-redesign/evidence/slice-4-red.md`

### Green and refactor

- [ ] T042 Create `supabase/migrations/068_metals_domain.sql` with exact guarded backfill, states/events/role-unique references/observations, nullable current acquisition-action linkage with no invented legacy action, RLS, constraints, indexes, action-ID links, and expected holding revision stored/enforced only on Metals event/evidence for owner-scoped CAS that rejects account effects; run `npm run db:migrate` and update only Metals schema/migrations/generated types/persisted-field models/registrations under `packages/db/src/`
- [ ] T043 Implement scoped one-writer Metals evidence and expected-holding-revision persistence/CAS on linked event/evidence while adapting only generic identity/hash/state/outcome interfaces and decoding canonical outcomes in `apps/mobile/services/metal-financial-action-repository.ts`, `apps/mobile/services/metal-holding-command-service.ts`, and `apps/mobile/services/metal-financial-action-adapter.ts`
- [ ] T044 Implement exact-once per-resource stale-winner compensation, including account-only stale with no holding winner and verified canonical holding/account evidence, plus server-rejection recovery, incomplete retry/locking, immutable role-specific rate references, and name/notes-only LWW in `apps/mobile/services/metal-reconciliation-service.ts`, `apps/mobile/services/metal-rate-reference-service.ts`, and `apps/mobile/services/metal-metadata-service.ts`
- [ ] T045 Centralize Metals table ownership, pull/push strategy, action-fragment guards, and generic-root exclusions in `apps/mobile/services/sync/config.ts`, `apps/mobile/services/sync/ownership-guards.ts`, `apps/mobile/services/sync/pull-strategies.ts`, and `apps/mobile/services/sync/push-service.ts`
- [ ] T046 Populate approved EN/AR Metals content only after T038 is Red, then update translation schema once in `apps/mobile/locales/en/metals.json`, `apps/mobile/locales/ar/metals.json`, and `apps/mobile/i18n/translation-schemas.ts`
- [ ] T047 Implement deterministic Metals profiles only after T039 is Red, then register them once in `apps/mobile/scripts/seed-fixtures/metals-e2e-fixtures.js` and `apps/mobile/scripts/seed-fixtures/e2e-fixture.js`
- [ ] T048 Copy every existing approved Monyvi-supplied Gold/Silver bar/coin/jewelry object file from `specs/035-metals-module-redesign/design/mockups/nile-current-v1-flow/objects/` into `apps/mobile/assets/images/metals/`, verify recorded hashes/provenance, map any unsupported or absent exact key to the documented neutral fallback in `apps/mobile/assets/images/metals/manifest.ts`, and perform no new design or image generation
- [ ] T049 Run migration/backfill/model/SQLite/sync/reconciliation/i18n/fixture/render-manifest suites, refactor while green, freeze persistence/foundation compatibility, and prove every Slice 4 prerequisite terminates at T017 or T024 in `specs/035-metals-module-redesign/evidence/slice-4-green.md`

---

## Phase 5: Slice 5 — Portfolio Surfaces

### User Story 1 — Understand Metals and Rates at a Glance (Priority: P1) MVP

**Independent Test**: Home and My Metals preserve exact Accounts/Metals/Gold/Silver contributions, separate owned wealth from rates, default to All, and remain truthful for fresh/stale/missing/empty/single-metal/mixed fixtures.

#### Red

- [ ] T050 [US1] Define US1 manual scenarios, SC-001 moderated conditions, and FR/SC mappings in `specs/035-metals-module-redesign/manual-tests/us1-connected-portfolio.md` and `specs/035-metals-module-redesign/coverage/us1.md`
- [ ] T051 [P] [US1] Write failing net-worth contribution, exact share, no-double-count, sale-proceeds, missing-rate, snapshot-immutability, and bounded-query tests in `apps/mobile/__tests__/services/net-worth-read-model-service.metals.test.ts`
- [ ] T052 [P] [US1] Write failing All/Gold/Silver, active totals, sold result, allocation, recent History, unavailable values, user-scope, and list-state tests in `apps/mobile/__tests__/services/metal-portfolio-read-model-service.test.ts`
- [ ] T053 [P] [US1] Write failing Home Concept C and My Metals Skeleton/empty/filter-empty/offline/stale/error/RTL/theme/compact/ordinary/200%-text/a11y tests in `apps/mobile/__tests__/components/metals/portfolio-surfaces.test.tsx`
- [ ] T054 [P] [US1] Create failing Home-to-Metals/filter/rates-separation Maestro coverage in `apps/mobile/e2e/maestro/metals/home-and-portfolio.yaml`
- [ ] T055 [US1] Run T051–T054 and record intended Red failures in `specs/035-metals-module-redesign/evidence/us1-red.md`

#### Green, refactor, verify

- [ ] T056 [US1] Implement scoped bounded net-worth and portfolio read models in `apps/mobile/services/net-worth-read-model-service.ts` and `apps/mobile/services/metal-portfolio-read-model-service.ts`
- [ ] T057 [US1] Implement cancellation-safe portfolio facade, approved Concept C, My Metals states/list, and owned Home/tab integration in `apps/mobile/hooks/useMetalPortfolio.ts`, `apps/mobile/components/dashboard/WealthBreakdownSection.tsx`, `apps/mobile/components/metals/MetalPortfolioScreen.tsx`, `apps/mobile/app/(private)/(tabs)/index.tsx`, and `apps/mobile/app/(private)/(tabs)/metals.tsx`
- [ ] T058 [US1] Run US1 suites and Maestro, refactor while green, and record automated/manual evidence only in `specs/035-metals-module-redesign/coverage/us1.md`

### User Story 9 — Keep Trust When Rates or Historical Data Are Incomplete (Priority: P1)

**Independent Test**: Fresh, stale, unknown, missing, offline-cached, refreshing, and refresh-error states derive from provider facts while existing Live Rates layout remains unchanged.

#### Red

- [ ] T059 [US9] Define rate-trust manual scenarios and FR/SC mappings in `specs/035-metals-module-redesign/manual-tests/us9-rate-trust.md` and `specs/035-metals-module-redesign/coverage/us9.md`
- [ ] T060 [P] [US9] Write failing observation-time, independent metal/FX status, invalid/unknown timestamp, stale threshold, acknowledgment, provenance, and historical/current separation tests in `packages/logic/src/metals/__tests__/rate-reference-contract.test.ts`
- [ ] T061 [P] [US9] Write failing retained-layout Gold/Silver/currency scope, real refresh, cached failure, offline, Skeleton, focus, RTL/theme/reflow tests in `apps/mobile/__tests__/components/live-rates/LiveRatesScreen.metals-v1.test.tsx`
- [ ] T062 [P] [US9] Create failing fresh-to-stale/offline-cache/refresh-failure/missing-rate Maestro coverage in `apps/mobile/e2e/maestro/metals/live-rates-trust.yaml`
- [ ] T063 [US9] Run T060–T062 and record intended Red failures in `specs/035-metals-module-redesign/evidence/us9-red.md`

#### Green, refactor, verify

- [ ] T064 [US9] Implement provider-derived refresh/trust state through stable persistence APIs in `apps/mobile/hooks/useLiveRatesScreen.ts` and `apps/mobile/services/live-rates-trust-read-model-service.ts`
- [ ] T065 [US9] Preserve existing `/live-rates` composition while limiting content to Gold/Silver/currency and rendering truthful states in `apps/mobile/components/live-rates/LiveRatesScreen.tsx`, then run US9 tests/Maestro and record evidence in `specs/035-metals-module-redesign/coverage/us9.md`

---

## Phase 6: Slice 6 — Holding Experience

### User Story 3 — Inspect a Holding and Its History (Priority: P1)

**Independent Test**: Active, Sold, Disposed, and restored-Active holdings show correct shaped facts, attribution, permanent ordered History, action availability, and no terminal contribution to active ownership.

#### Red

- [ ] T066 [US3] Define detail/history manual scenarios and FR/SC mappings in `specs/035-metals-module-redesign/manual-tests/us3-detail-history.md` and `specs/035-metals-module-redesign/coverage/us3.md`
- [ ] T067 [P] [US3] Write failing scoped detail/history read-model tests for effective state, attribution, tied-time ordering, reversed events, missing facts, bounded queries, and user isolation in `apps/mobile/__tests__/services/metal-detail-history-read-model.test.ts`
- [ ] T068 [P] [US3] Write failing active/sold/disposed/restored detail, History filters, Skeleton/empty/error/offline, imagery/text identity, action descriptor, RTL/theme/reflow/a11y tests in `apps/mobile/__tests__/components/metals/holding-experience.test.tsx`
- [ ] T069 [P] [US3] Create failing detail-to-History/filter/terminal-detail Maestro coverage in `apps/mobile/e2e/maestro/metals/holding-detail-history.yaml`
- [ ] T070 [US3] Run T067–T069 and record intended Red failures in `specs/035-metals-module-redesign/evidence/us3-red.md`

#### Green, refactor, verify

- [ ] T071 [US3] Implement bounded scoped detail and History read models plus cancellation-safe facades in `apps/mobile/services/metal-detail-read-model-service.ts`, `apps/mobile/services/metal-history-read-model-service.ts`, `apps/mobile/hooks/useMetalHoldingDetail.ts`, and `apps/mobile/hooks/useMetalHistory.ts`
- [ ] T072 [US3] Implement shaped-prop `MetalHoldingRender` against the T048 typed manifest/neutral fallback plus detail/history/timeline components and isolated action registry in `apps/mobile/components/metals/MetalHoldingRender.tsx`, `apps/mobile/components/metals/MetalHoldingDetailScreen.tsx`, `apps/mobile/components/metals/MetalHistoryScreen.tsx`, and `apps/mobile/components/metals/holding-actions/registry.ts`
- [ ] T073 [US3] Integrate the isolated History route in `apps/mobile/app/(private)/metals/history.tsx`
- [ ] T074 [US3] Run US3 suites and Maestro, refactor while green, and record evidence in `specs/035-metals-module-redesign/coverage/us3.md`

---

## Phase 7: Slice 7 — Add and Edit

### User Story 2 — Add a Gold or Silver Holding (Priority: P1)

**Independent Test**: One complete form accepts supported locale formats online/offline, provides exact live preview and warnings, commits locally once, survives restart, and preserves holdings when rates are unavailable.

#### Red

- [ ] T075 [US2] Define Add manual/timed scenarios and FR/SC mappings in `specs/035-metals-module-redesign/manual-tests/us2-add-holding.md` and `specs/035-metals-module-redesign/coverage/us2.md`
- [ ] T076 [P] [US2] Write failing locale parsing, required fields, precision/range/date, Gold/Silver-only, unusual acknowledgment, exact preview, `24K · 999`, and unavailable-rate tests in `apps/mobile/__tests__/validation/metal-holding-form-validation.test.ts`
- [ ] T077 [P] [US2] Write failing SQLite Add atomicity, stable action, duplicate, rollback, restart, ownership, and sync-pending tests in `apps/mobile/__tests__/services/add-metal-holding-command-service.integration.test.ts`
- [ ] T078 [P] [US2] Write failing full-form order, live preview, dirty exit, safe area, error focus, pending lock, EN/AR/RTL/theme/breakpoint/200%-text tests in `apps/mobile/__tests__/app/metals-add.test.tsx`
- [ ] T079 [P] [US2] Create failing Gold/Silver/offline-restart/validation Maestro coverage in `apps/mobile/e2e/maestro/metals/add-holding.yaml`
- [ ] T080 [US2] Run T076–T079 and record intended Red failures in `specs/035-metals-module-redesign/evidence/us2-red.md`

#### Green, refactor, verify

- [ ] T081 [US2] Implement locale-aware validation, exact preview shaping, and scoped Add command in `apps/mobile/validation/metal-holding-form-validation.ts`, `apps/mobile/services/metal-holding-preview-service.ts`, and `apps/mobile/services/add-metal-holding-command-service.ts`
- [ ] T082 [US2] Implement reusable shaped-prop form, Add lifecycle facade, and direct-submit isolated route in `apps/mobile/components/metals/MetalHoldingForm.tsx`, `apps/mobile/hooks/useAddMetalHolding.ts`, and `apps/mobile/app/(private)/metals/add.tsx`
- [ ] T083 [US2] Run US2 suites and Maestro, refactor while green, and record evidence in `specs/035-metals-module-redesign/coverage/us2.md`

### User Story 4 — Edit a Holding or Correct Active Facts (Priority: P1)

**Independent Test**: Same complete form saves metadata directly, requires reason only for material deltas, restores ordinary mode when deltas revert, locks metal type, and commits mixed changes atomically.

#### Red

- [ ] T084 [US4] Define Edit/correction manual scenarios and FR/SC mappings in `specs/035-metals-module-redesign/manual-tests/us4-edit-correction.md` and `specs/035-metals-module-redesign/coverage/us4.md`
- [ ] T085 [P] [US4] Write failing persisted-vs-current diff, reason toggle, physical-form-only summary, locked metal, terminal immutability, exact consequence, and metadata-LWW tests in `apps/mobile/__tests__/services/edit-metal-holding-preview-command.test.ts`
- [ ] T086 [P] [US4] Write failing SQLite mixed metadata/material atomicity, whole-fact-set CAS, duplicate, rollback, restart, and History tests in `apps/mobile/__tests__/services/edit-metal-holding-command-service.integration.test.ts`
- [ ] T087 [P] [US4] Write failing same-form order, previous/current cues, dynamic summary, dirty exit, pending lock, focus, EN/AR/RTL/theme/reflow tests in `apps/mobile/__tests__/app/metals-edit.test.tsx`
- [ ] T088 [P] [US4] Create failing metadata/material/reverted-delta/offline Maestro coverage in `apps/mobile/e2e/maestro/metals/edit-holding.yaml`
- [ ] T089 [US4] Run T085–T088 and record intended Red failures in `specs/035-metals-module-redesign/evidence/us4-red.md`

#### Green, refactor, verify

- [ ] T090 [US4] Implement exact change comparison, consequence shaping, metadata patching, and material-correction command in `apps/mobile/services/edit-metal-holding-preview-service.ts` and `apps/mobile/services/edit-metal-holding-command-service.ts`
- [ ] T091 [US4] Extend shared form without changing Add behavior, implement Edit facade/action descriptor, and add isolated route in `apps/mobile/components/metals/MetalHoldingForm.tsx`, `apps/mobile/hooks/useEditMetalHolding.ts`, `apps/mobile/components/metals/holding-actions/edit-action.ts`, and `apps/mobile/app/(private)/metals/[holdingId]/edit.tsx`
- [ ] T092 [US4] Run US4 plus Add regression suites and Maestro, refactor while green, and record evidence in `specs/035-metals-module-redesign/coverage/us4.md`

---

## Phase 8: Slice 8 — Terminal Lifecycle

### User Story 5 — Sell a Whole Holding (Priority: P1)

**Independent Test**: Whole-holding sale without credit stays available and atomic; optional same-currency credit remains disabled until T033 and never creates ordinary income.

#### Red

- [ ] T093 [US5] Define separate non-credit/credit manual scenarios and FR/SC mappings in `specs/035-metals-module-redesign/manual-tests/us5-sell.md` and `specs/035-metals-module-redesign/coverage/us5.md`
- [ ] T094 [P] [US5] Write failing gross/fee/net/P&L, same-currency fee, fee-greater-than-gross, whole-holding, stale acknowledgment, no-credit, analytics-exclusion, SQLite atomicity, duplicate, rollback, restart, History, and net-worth tests in `apps/mobile/__tests__/services/sell-metal-holding-command-service.integration.test.ts`
- [ ] T095 [P] [US5] Write failing editable form/live summary/direct submit, disabled credit, pending/focus/safe-area/RTL/theme/reflow tests in `apps/mobile/__tests__/app/metals-sell.test.tsx`
- [ ] T096 [P] [US5] Create failing sale-without-credit/offline-restart Maestro coverage in `apps/mobile/e2e/maestro/metals/sell-holding.yaml`
- [ ] T097 [US5] Run T094–T096 and record intended non-credit Red failures in `specs/035-metals-module-redesign/evidence/us5-red.md`

#### Green, refactor, verify

- [ ] T098 [US5] Implement exact sale preview and scoped non-credit Sale command in `apps/mobile/services/sell-metal-holding-preview-service.ts` and `apps/mobile/services/sell-metal-holding-command-service.ts`
- [ ] T099 [US5] Implement Sell facade/form/action descriptor and isolated route in `apps/mobile/hooks/useSellMetalHolding.ts`, `apps/mobile/components/metals/SellMetalHoldingScreen.tsx`, `apps/mobile/components/metals/holding-actions/sell-action.ts`, and `apps/mobile/app/(private)/metals/[holdingId]/sell.tsx`
- [ ] T100 [US5] Run non-credit US5 suites/Maestro, refactor while green, verify no account row changed, and record evidence in `specs/035-metals-module-redesign/coverage/us5.md`
- [ ] T101 [US5] **BLOCKED BY FULL #242 GATE T033** Write failing deterministic credited-Sale harness/integration tests for matching/default account selection, currency-change clearing, expected account revision, exact net minor-unit credit, retry, replay, rollback, restart, and analytics exclusion in `apps/mobile/__tests__/services/sell-metal-account-credit-harness.integration.test.ts`
- [ ] T102 [US5] **BLOCKED BY FULL #242 GATE T033** Author a failing runner-controllable credited-Sale Maestro journey for account selection/default, exact displayed credit, retry, and restart in `apps/mobile/e2e/maestro/metals/sell-holding-with-account-credit.yaml`, run T101–T102 to complete the credited-Sale Red gate before T103, and map it in `specs/035-metals-module-redesign/coverage/us5.md`
- [ ] T103 [US5] **BLOCKED BY FULL #242 GATE T033** Implement optional credit through generic `account_financial_effects` in `apps/mobile/services/sell-metal-holding-command-service.ts` and `apps/mobile/components/metals/SellMetalHoldingScreen.tsx`, then run credited harness/Maestro Green evidence and document any honestly uncontrollable case with manual owner/rationale in `specs/035-metals-module-redesign/coverage/us5.md`

### User Story 6 — Dispose of a Whole Holding Without a Sale (Priority: P1)

#### Red

- [ ] T104 [US6] Define every disposal-category/manual scenario and FR/SC mapping in `specs/035-metals-module-redesign/manual-tests/us6-dispose.md` and `specs/035-metals-module-redesign/coverage/us6.md`
- [ ] T105 [P] [US6] Write failing category mapping, Other treatment, write-off/external-transfer, zero proceeds/account/income/sale-P&L, and exact live-summary tests in `apps/mobile/__tests__/services/dispose-metal-holding-command-service.test.ts`
- [ ] T106 [P] [US6] Write failing direct form, conditional Other choice, pending/focus/safe-area/RTL/theme/reflow tests in `apps/mobile/__tests__/app/metals-dispose.test.tsx`
- [ ] T107 [P] [US6] Create failing category/Other/offline-restart Maestro coverage in `apps/mobile/e2e/maestro/metals/dispose-holding.yaml`
- [ ] T108 [US6] Run T105–T107 and record intended Red failures in `specs/035-metals-module-redesign/evidence/us6-red.md`

#### Green, refactor, verify

- [ ] T109 [US6] Implement scoped Dispose command and consequence shaping in `apps/mobile/services/dispose-metal-holding-command-service.ts`
- [ ] T110 [US6] Implement Dispose facade/form/action descriptor and isolated route in `apps/mobile/hooks/useDisposeMetalHolding.ts`, `apps/mobile/components/metals/DisposeMetalHoldingScreen.tsx`, `apps/mobile/components/metals/holding-actions/dispose-action.ts`, and `apps/mobile/app/(private)/metals/[holdingId]/dispose.tsx`
- [ ] T111 [US6] Run US6 suites/Maestro, refactor while green, and record evidence in `specs/035-metals-module-redesign/coverage/us6.md`

### User Story 7 — Delete an Incorrect Active Record (Priority: P1)

#### Red

- [ ] T112 [US7] Define Active-only Delete manual scenarios and FR/SC mappings in `specs/035-metals-module-redesign/manual-tests/us7-delete.md` and `specs/035-metals-module-redesign/coverage/us7.md`
- [ ] T113 [P] [US7] Write failing hidden-evidence, active-only, zero financial/reporting outcome, no-reappearance, restart, sync, and terminal-state rejection tests in `apps/mobile/__tests__/services/delete-metal-holding-command-service.integration.test.ts`
- [ ] T114 [P] [US7] Write failing approved confirmation, exact purity/value facts, destructive semantics, focus, pending lock, safe area, RTL/theme/reflow tests in `apps/mobile/__tests__/app/metals-delete.test.tsx`
- [ ] T115 [P] [US7] Create failing Delete/offline-restart/terminal-prohibition Maestro coverage in `apps/mobile/e2e/maestro/metals/delete-holding.yaml`
- [ ] T116 [US7] Run T113–T115 and record intended Red failures in `specs/035-metals-module-redesign/evidence/us7-red.md`

#### Green, refactor, verify

- [ ] T117 [US7] Implement scoped Active-only Delete command with hidden non-effective evidence in `apps/mobile/services/delete-metal-holding-command-service.ts`
- [ ] T118 [US7] Implement Delete facade/sheet/action descriptor and isolated route in `apps/mobile/hooks/useDeleteMetalHolding.ts`, `apps/mobile/components/metals/DeleteMetalHoldingSheet.tsx`, `apps/mobile/components/metals/holding-actions/delete-action.ts`, and `apps/mobile/app/(private)/metals/[holdingId]/delete.tsx`
- [ ] T119 [US7] Run US7 suites/Maestro, refactor while green, and record evidence in `specs/035-metals-module-redesign/coverage/us7.md`

### User Story 8 — Undo a Sale or Disposal Without Erasing History (Priority: P1)

#### Red

- [ ] T120 [US8] Define separate uncredited/credited Undo manual scenarios and FR/SC mappings in `specs/035-metals-module-redesign/manual-tests/us8-undo.md` and `specs/035-metals-module-redesign/coverage/us8.md`
- [ ] T121 [P] [US8] Write failing uncredited Sale/Dispose reversal, append-only history, same-holding Active restore, duplicate, rollback, restart, and re-record tests in `apps/mobile/__tests__/services/undo-metal-holding-command-service.integration.test.ts`
- [ ] T122 [P] [US8] Write failing Restore consequence, action priority, focus, pending lock, trigger restoration, RTL/theme/reflow tests in `apps/mobile/__tests__/app/metals-restore.test.tsx`
- [ ] T123 [P] [US8] Create failing uncredited Sale/Dispose restore/history/offline Maestro coverage in `apps/mobile/e2e/maestro/metals/restore-holding.yaml`
- [ ] T124 [US8] Run T121–T123 and record intended Red failures in `specs/035-metals-module-redesign/evidence/us8-red.md`

#### Green, refactor, verify

- [ ] T125 [US8] Implement scoped uncredited Undo with immutable reversal in `apps/mobile/services/undo-metal-holding-command-service.ts`
- [ ] T126 [US8] Implement Undo facade/sheet/action descriptor and isolated route in `apps/mobile/hooks/useUndoMetalHolding.ts`, `apps/mobile/components/metals/RestoreMetalHoldingSheet.tsx`, `apps/mobile/components/metals/holding-actions/undo-action.ts`, and `apps/mobile/app/(private)/metals/[holdingId]/restore.tsx`
- [ ] T127 [US8] Run uncredited US8 suites/Maestro, refactor while green, and record evidence in `specs/035-metals-module-redesign/coverage/us8.md`
- [ ] T128 [US8] **BLOCKED BY FULL #242 GATE T033** Write failing deterministic credited-Undo harness/integration tests for exact inverse minor-unit debit, expected account revision, unavailable/foreign account, stale CAS, retry, replay, rollback, restart, reconciliation, and analytics exclusion in `apps/mobile/__tests__/services/undo-metal-account-credit-harness.integration.test.ts`
- [ ] T129 [US8] **BLOCKED BY FULL #242 GATE T033** Author a failing runner-controllable credited-Undo Maestro journey for exact debit/reversal, retry/restart, permanent History, and reconciliation in `apps/mobile/e2e/maestro/metals/restore-credited-sale.yaml`, run T128–T129 to complete the credited-Undo Red gate before T130, and map it in `specs/035-metals-module-redesign/coverage/us8.md`
- [ ] T130 [US8] **BLOCKED BY FULL #242 GATE T033** Implement credited Undo through original generic `account_financial_effects` linkage in `apps/mobile/services/undo-metal-holding-command-service.ts` and `apps/mobile/components/metals/RestoreMetalHoldingSheet.tsx`, then run harness/Maestro Green evidence and document any honestly uncontrollable case with manual owner/rationale in `specs/035-metals-module-redesign/coverage/us8.md`

### User Story 10 — Confirm Actions Once and Recover Safely (Priority: P1)

#### Red

- [ ] T131 [US10] Define submission/recovery/conflict manual scenarios and FR/SC mappings in `specs/035-metals-module-redesign/manual-tests/us10-recovery.md` and `specs/035-metals-module-redesign/coverage/us10.md`
- [ ] T132 [P] [US10] Write failing pending lock, duplicate press, dirty exit, retained input, local-complete versus synchronized, retry, cancellation, and auth-switch hook tests in `apps/mobile/__tests__/hooks/useMetalActionSubmission.test.ts`
- [ ] T133 [P] [US10] Write failing deterministic Sell/Sell, Sell/Dispose, correction/terminal, Delete/terminal, replay, hash mismatch, incomplete, restart, one-winner, and non-account exact-once reconciliation tests in `apps/mobile/__tests__/services/metal-conflict-harness.integration.test.ts`
- [ ] T134 [P] [US10] Write failing checking/locked/retry/reconciled/internal-loser/focus/announcement/RTL/theme/reflow UI tests in `apps/mobile/__tests__/components/metals/MetalReconciliationGuard.test.tsx`
- [ ] T135 [P] [US10] Create failing duplicate/retry/local-complete/sync-failure/incomplete/reconciled Maestro coverage in `apps/mobile/e2e/maestro/metals/action-recovery.yaml`
- [ ] T136 [US10] Run T132–T135 and record intended Red failures in `specs/035-metals-module-redesign/evidence/us10-red.md`

#### Green, refactor, verify

- [ ] T137 [US10] Implement cancellation-safe shared submission lifecycle in `apps/mobile/hooks/useMetalActionSubmission.ts`
- [ ] T138 [US10] Implement shaped-prop action status/retry/reconciliation surfaces and isolated recovery descriptor in `apps/mobile/components/metals/MetalActionStatus.tsx`, `apps/mobile/components/metals/MetalReconciliationGuard.tsx`, and `apps/mobile/components/metals/holding-actions/recovery-action.ts`
- [ ] T139 [US10] Run non-account submission/recovery/conflict suites and Maestro against isolated harness adapters, refactor while green, and record evidence in `specs/035-metals-module-redesign/coverage/us10.md`
- [ ] T140 [US10] **BLOCKED BY FULL #242 GATE T033** Write and run failing exact-once account compensation/replacement-credit, protected revision, missing/foreign evidence, restart, replay, and no-reporting tests to complete the compensation Red gate before T141 in `apps/mobile/__tests__/services/metal-account-compensation.integration.test.ts`
- [ ] T141 [US10] **BLOCKED BY FULL #242 GATE T033** Implement and verify Metals account compensation/replacement-credit mapping through stable generic reconciliation in `apps/mobile/services/metal-account-compensation-adapter.ts` and append evidence to `specs/035-metals-module-redesign/coverage/us10.md`

---

## Phase 9: Slice 9 — Integration and Quality

**Purpose**: One integration owner composes shared touchpoints, assembles evidence, and proves complete quality matrices.

- [ ] T142 Integrate shaped detail, action descriptors, recovery guard, and state-based actions once in `apps/mobile/app/(private)/metals/[holdingId]/index.tsx`
- [ ] T143 Integrate `useMetalActionSubmission` into all story hooks after their Green gates, then update story barrels once in `apps/mobile/hooks/useAddMetalHolding.ts`, `apps/mobile/hooks/useEditMetalHolding.ts`, `apps/mobile/hooks/useSellMetalHolding.ts`, `apps/mobile/hooks/useDisposeMetalHolding.ts`, `apps/mobile/hooks/useDeleteMetalHolding.ts`, `apps/mobile/hooks/useUndoMetalHolding.ts`, `apps/mobile/components/metals/index.ts`, `apps/mobile/hooks/index.ts`, and `apps/mobile/services/index.ts`
- [ ] T144 Assemble all `coverage/us1.md` through `coverage/us10.md` fragments into `specs/035-metals-module-redesign/coverage-matrix.md`, covering FR-001–FR-104 and actual SC-001–SC-008, documenting SC-009 as reserved, and covering SC-010–SC-030 without renumbering or implying automation
- [ ] T145 Require product research to choose and approve SC-001 sampling method, sample-size rationale, confidence/decision rule, recruitment constraints, and analysis plan without inventing a participant count in `specs/035-metals-module-redesign/evidence/sc-001-methodology-decision.md`; SC-001 cannot be executed or claimed before this decision
- [ ] T146 After T145 approval, conduct product-research-owned moderated SC-001 acceptance with first-attempt observations, confusion coding, result calculation, limitations, and raw evidence links in `specs/035-metals-module-redesign/evidence/sc-001-moderated.md`; keep human comprehension manual-only
- [ ] T147 Conduct QA-owned timed SC-002 Add/Sell/Dispose/Delete/Undo journeys, record exclusions and three-run timings, and retain video/timestamp evidence in `specs/035-metals-module-redesign/evidence/sc-002-timed-journeys.md`
- [ ] T148 Seed 20/100/500 holdings and 100/300/1,500 History events; profile release-profile/Hermes compact/ordinary/tablet viewport targets after 5-second warmup for the longer of 30 seconds or five complete scroll passes, across three runs, using React Profiler commits plus platform frame metrics; record median/worst against normal ≤5% slow/zero >700ms frozen and stress ≤10% slow/zero frozen/no blank/crash/no whole-list row-update rerender thresholds in `specs/035-metals-module-redesign/evidence/list-performance.md`
- [ ] T149 Add and run compact/ordinary/tablet/orientation/200%-text/safe-area/reduced-motion plus EN/AR LTR/RTL/bidi, light/dark contrast, 44px target, external-input, screen-reader, focus, Skeleton/loading, empty/error/offline/stale/missing/incomplete/conflicted tests in `apps/mobile/__tests__/components/metals/metals-responsive-accessibility-state-matrix.test.tsx`
- [ ] T150 Execute the full deterministic Maestro suite under `apps/mobile/e2e/maestro/metals/` and document runner-controlled coverage versus honest manual-only gaps in `specs/035-metals-module-redesign/evidence/maestro-results.md`
- [ ] T151 Execute manual compact/ordinary/tablet, portrait/landscape, 200%-text, EN/AR RTL, light/dark, TalkBack/VoiceOver, physical-offline, restart, and real two-device checks with owners/rationale in `specs/035-metals-module-redesign/manual-test-plan.md`
- [ ] T152 Verify exact `24K · 999` math, Home totals/shares, Add preview, sale fee/result, account revision/effects, net-worth reconciliation, analytics exclusion, exact-once compensation, accepted-correction replacement of the current purity projection, and append-only before/after/catalog snapshot immutability in `specs/035-metals-module-redesign/financial-verification.md`
- [ ] T153 Add and run architecture/security tests for package direction, presentational shaped props, hook boundaries, current-user scope, RLS, protected account columns, action identity, and sync failure safety in `apps/mobile/__tests__/architecture/metals-boundaries-security.test.ts`
- [ ] T154 Run targeted Jest/SQLite/SQL/Maestro suites, package typechecks, lint, `npm run db:migrate`, generated-drift checks, and `git diff --check`; record exact commands/results in `specs/035-metals-module-redesign/implementation-evidence.md`
- [ ] T155 Complete TypeScript, database, security, logic, QA coverage, visual, accessibility, and performance reviews; record findings, owners, resolutions, and nine-slice review packet status without creating PRs in `specs/035-metals-module-redesign/review-ledger.md`

---

## Dependencies and Execution Order

### Slice dependency graph

```text
Slice 1 Planning
  ├─> Slice 2 Exact Metals domain ───────────────┐
  └─> Slice 3A Generic foundation T024 ──────────┤
       ├─> Slice 3B Full #242 T033 ──> credited Sale/Undo/account compensation only
       └──────────────────────────────────────────┘
                                                   └─> Slice 4 Metals persistence/reconciliation
                                                         └─> Slice 5 Portfolio surfaces
                                                               └─> Slice 6 Holding experience
                                                                     └─> Slice 7 Add/Edit
                                                                           └─> Slice 8 non-credit lifecycle
                                                                                 └─> Slice 9 Integration/quality
```

- Slice 2 and Slice 3A start after T005 and use disjoint owners/files.
- T024 freezes generic identity/state/serialization/storage interfaces. T034 and Slice 4 depend on T017 plus T024 only; no task from T034 through any unrelated story has a path to T033.
- Slice 3B service/RPC/cutover work continues from T024 in parallel with Slice 4. Migration merge order is T022 `067_financial_action_foundation.sql`, T042 `068_metals_domain.sql`, then T029 `069_account_financial_effects.sql`; T033 alone waits for T042 to perform the final shared DB regeneration, while unrelated Metals never waits for T033.
- After an authorized future merge of T024, unrelated Metals worktrees branch from that stable foundation commit while full #242 continues. This planning task does not create that commit or branch.
- Within Slice 5, US1 and US9 can proceed concurrently after T049 because their story files do not overlap; shared translations/sync/fixtures are already owned by Slice 4.
- Slice 6 provides shaped detail/history/action-registry contracts. Only T142 later composes the shared holding-detail route.
- Within Slice 7, US2 completes before US4 Green work because Edit extends `MetalHoldingForm.tsx`; US4 Red tests may be prepared after T075 without editing Add production files.
- Within Slice 8, US5 non-credit, US6, and US7 can run concurrently in isolated files after Slice 7. US8 waits for US5 non-credit and US6. US10 waits for all command/hook contracts.
- T101–T103, T128–T130, and T140–T141 are the only full-#242-blocked work. Non-credit paths never wait for them.
- Slice 9 waits for every selected non-blocked Green/refactor gate. Account-credit evidence joins only after T033 and its credited Red→Green tasks.

### Truthful parallel examples

```text
After Slice 1:
  Lane A: T006–T017 exact Metals domain
  Lane B: T018–T024 generic foundation

After T024:
  Lane A: T025–T033 full #242 account-integrity completion
  Lane B: T034–T049 Metals persistence against frozen generic interfaces

After Slice 4:
  Lane A: US1 portfolio Red -> Green -> verify
  Lane B: US9 rate-trust Red -> Green -> verify

After Slice 7:
  Lane A: US5 non-credit Red -> Green -> verify
  Lane B: US6 Red -> Green -> verify
  Lane C: US7 Red -> Green -> verify

Never parallel:
  Red gate with its Green tasks
  Add and Edit changes to MetalHoldingForm.tsx
  Any story work with shared translations/schema/sync/generated files
  Any story edit to [holdingId]/index.tsx
```

### Suggested MVP

Slices 1–5 through generic milestone T024: planning controls, exact domain, frozen generic financial-action foundation, Metals persistence/reconciliation, Home Concept C, My Metals, and retained Live Rates trust corrections. This MVP is executable without full #242; optional credit remains disabled until T033 and its blocked story tasks.

## Implementation and Review Slicing Note

- Prefer the approved nine domain/experience slices, not one module-wide change and not one change per visual screen.
- Each future slice branches from its verified prerequisite; unrelated Metals stacks use the future authorized T024 foundation commit, while credited stacks additionally require T033. Parallel story work uses isolated worktrees and listed file ownership.
- Review order: Red evidence, Green diff, refactor/verification evidence, integration owner composition.
- No worker edits shared owner files to resolve a local conflict. They stop and hand the change to the named owner.
- This file plans future review slices only; it does not create or authorize branches, commits, PRs, pushes, or GitHub mutations.

## Notes

- WatermelonDB remains local source of truth. Every read/write is current-user scoped; remote sync is non-blocking and explicit failures advance no watermark.
- Presentational components receive shaped props. Services own DB reads/writes; hooks own lifecycle/subscription state; `packages/logic` owns pure exact calculations.
- Use `Skeleton` for content loading, NativeWind classes, `PageHeader`, centralized responsive helpers, safe-area bottom handling, and `FlatList` for long lists.
- Stop on source-of-truth conflict, non-deterministic backfill, incomplete writer inventory, inability to prove atomic RPC/CAS, ownership overlap, or design work beyond approved handoff.
