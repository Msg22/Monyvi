# Tasks: Unified Budgets Dashboard

**Input**: [spec.md](./spec.md), [plan.md](./plan.md),
[research.md](./research.md), [data-model.md](./data-model.md), and
[contracts/](./contracts/) **Tests**: Mandatory strict TDD. Each production task
follows its failing test task and must make that test pass without weakening
assertions.

## Phase 1: Setup and deterministic data

- [x] T001 Audit current PR #226 dashboard files against revised Spec 033 and
      record preserved user-authored styling in
      `specs/033-budget-dashboard-redesign/quickstart.md`
- [x] T002 [P] Update manual-QA fixture expectations for all scope/period/status
      states in `apps/mobile/__tests__/scripts/manual-qa-seed.test.ts`
- [x] T003 [P] Update E2E profile expectations and flow mapping in
      `apps/mobile/__tests__/scripts/e2e-seed.test.ts` and
      `apps/mobile/__tests__/scripts/run-ci-e2e.test.ts`
- [x] T004 Add only missing deterministic records to
      `apps/mobile/scripts/seed-fixtures/manual-qa-fixture.js` and
      `apps/mobile/scripts/seed-fixtures/e2e-fixture.js`
- [x] T005 Update the manual QA coverage matrix after inspecting
      `manual-qa@monyvi.test` in
      `specs/033-budget-dashboard-redesign/quickstart.md`

## Phase 2: Foundational read-model and session contracts

- [x] T006 [P] Add failing tests for expiry-first derived status and
      `showsProgress` in
      `apps/mobile/__tests__/services/budget-list-read-model-service.test.ts`
- [x] T007 [P] Add failing exhaustive 3 x 4 x 4 pure filter-predicate tests in
      `apps/mobile/__tests__/services/budget-list-read-model-service.test.ts`
- [x] T008 [P] Add failing priority, EN/AR collation, ID tie-break,
      exactly-once, zero-spend, and deleted-category tests in
      `apps/mobile/__tests__/services/budget-list-read-model-service.test.ts`
- [x] T009 Replace section arrays with immutable unified `items`, derived state,
      AND filtering, and priority ordering in
      `apps/mobile/services/budget-list-read-model-service.ts`
- [x] T010 [P] Add failing fresh-default, write, read, reset, and
      immutable-update tests in
      `apps/mobile/__tests__/hooks/budget-dashboard-filter-session.test.ts`
- [x] T011 Implement memory-only filter session with `All / All / Active`
      defaults in `apps/mobile/hooks/budget-dashboard-filter-session.ts`
- [x] T012 [P] Add failing hook tests for three setters, reset, same-user
      remount restore, user-change default reset, rapid-change cancellation, and
      last-valid retention in `apps/mobile/__tests__/hooks/useBudgets.test.ts`
- [x] T013 Update `useBudgets` to expose unified read model and session-backed
      filters while preserving observation, cancellation, retry, and last-valid
      state in `apps/mobile/hooks/useBudgets.ts`

**Checkpoint**: Service and hook can return correct unified rows for any filter
combination without UI or persistence changes.

## Phase 3: User Story 1 - Browse One Unified Budget List (Priority: P1)

**Goal**: One continuous compact full-width list for all matching budgets.

**Independent test**: Default dashboard displays every active global/category
budget exactly once with one row style and no section/carousel hierarchy.

### Tests

- [x] T014 [P] [US1] Add failing unified-row content and layout tests in
      `apps/mobile/__tests__/components/budget/BudgetDashboardRow.test.tsx`
- [x] T015 [P] [US1] Replace section/carousel dashboard assertions with
      one-list, stable-key, long-list, and no-obsolete-hierarchy assertions in
      `apps/mobile/__tests__/components/budget/BudgetDashboard.test.tsx`
- [x] T016 [P] [US1] Add failing route assertions for shared PageHeader Add and
      no dashboard FAB/footer in
      `apps/mobile/__tests__/app/budget-screens-style.test.tsx`

### Implementation

- [x] T017 [US1] Implement display-only full-width `BudgetDashboardRow` with
      approved compact structure in
      `apps/mobile/components/budget/BudgetDashboardRow.tsx`
- [x] T018 [US1] Replace section-row builder and global list header with one
      virtualized item list in
      `apps/mobile/components/budget/BudgetDashboard.tsx`
- [x] T019 [US1] Remove obsolete carousel/section exports and references from
      `apps/mobile/components/budget/index.ts` and
      `apps/mobile/components/budget/budget-dashboard-layout.ts`
- [x] T020 [US1] Delete superseded
      `apps/mobile/components/budget/GlobalBudgetCarousel.tsx` and
      `apps/mobile/__tests__/components/budget/GlobalBudgetCarousel.test.tsx`
      only after unified-list coverage passes
- [x] T021 [US1] Preserve PageHeader Add action and remove remaining obsolete
      dashboard create/footer surfaces in
      `apps/mobile/app/(private)/budgets.tsx` and
      `apps/mobile/components/budget/BudgetDashboard.tsx`

**Checkpoint**: US1 independently delivers one reachable unified list.

## Phase 4: User Story 2 - Combine Scope, Period, and Status Filters (Priority: P1)

**Goal**: Visible scope tabs plus visible Period and Status values with AND
semantics and approved session behavior.

**Independent test**: Every representative combination produces only matching
rows; navigation back restores selection; reset returns defaults.

### Tests

- [x] T022 [P] [US2] Add failing scope-tab order/default/selection accessibility
      tests in
      `apps/mobile/__tests__/components/budget/BudgetDashboardFilters.test.tsx`
- [x] T023 [P] [US2] Add failing Period/Status visible-value, option, reset, and
      RTL tests in
      `apps/mobile/__tests__/components/budget/BudgetDashboardFilters.test.tsx`
- [x] T024 [P] [US2] Add failing dashboard integration tests for combined
      filters and filtered-empty reset in
      `apps/mobile/__tests__/components/budget/BudgetDashboard.test.tsx`
- [x] T025 [P] [US2] Add failing in-session navigation-return and fresh-session
      initialization integration tests in
      `apps/mobile/__tests__/app/budget-dashboard-filter-session.test.tsx`

### Implementation

- [x] T026 [US2] Implement `BudgetDashboardFilters` with All/Category/Global
      tabs and visible Period/Status selectors in
      `apps/mobile/components/budget/BudgetDashboardFilters.tsx`
- [x] T027 [US2] Connect filter controls, reset, selected values, and unified
      results in `apps/mobile/components/budget/BudgetDashboard.tsx`
- [x] T028 [US2] Add EN/AR filter and reset copy in
      `apps/mobile/locales/en/budgets.json` and
      `apps/mobile/locales/ar/budgets.json`
- [x] T029 [US2] Remove obsolete `PeriodFilterChips` usage and lifecycle-section
      copy from `apps/mobile/components/budget/PeriodFilterChips.tsx` and budget
      locale files after replacement coverage passes

**Checkpoint**: US2 independently proves primary dashboard navigation model.

## Phase 5: User Story 3 - Understand State and Take Safe Action (Priority: P1)

**Goal**: State remains obvious inside each row; paused/expired omit progress
and keep safe direct actions.

**Independent test**: Healthy, near-limit, over-budget, paused, expired, and
deleted-category rows expose correct content/action and ordering.

### Tests

- [x] T030 [P] [US3] Add failing active-state tests for icon, health label,
      amount, percentage, and progress in
      `apps/mobile/__tests__/components/budget/BudgetDashboardRow.test.tsx`
- [x] T031 [P] [US3] Add failing paused/expired tests proving
      percentage/progress absence and Resume/Renew presence in
      `apps/mobile/__tests__/components/budget/BudgetDashboardRow.test.tsx`
- [x] T032 [P] [US3] Preserve/add Resume cancel, confirm-once, failure, retry,
      and service rejection tests in
      `apps/mobile/__tests__/hooks/useBudgetDashboardActions.test.ts` and
      `apps/mobile/__tests__/services/budget-service.test.ts`
- [x] T033 [P] [US3] Preserve/add Renew prefill and immutable-history tests in
      `apps/mobile/__tests__/app/budget-renew-integration.test.tsx`
- [x] T034 [P] [US3] Preserve/add deleted-category row/detail recovery tests in
      `apps/mobile/__tests__/services/budget-detail-read-model-service.test.ts`
      and `apps/mobile/__tests__/app/budget-detail-deleted-category.test.tsx`

### Implementation

- [x] T035 [US3] Render state-specific active versus paused/expired content
      without label-string inference in
      `apps/mobile/components/budget/BudgetDashboardRow.tsx`
- [x] T036 [US3] Connect stable row press, Resume, and Renew callbacks without
      optimistic array mutation in
      `apps/mobile/components/budget/BudgetDashboard.tsx` and
      `apps/mobile/app/(private)/budgets.tsx`
- [x] T037 [US3] Preserve shared Resume confirmation and `renewFrom` navigation
      in `apps/mobile/hooks/useBudgetDashboardActions.ts` and
      `apps/mobile/app/(private)/budgets.tsx`
- [x] T038 [US3] Preserve missing-category tolerant detail aggregation in
      `apps/mobile/services/budget-detail-read-model-service.ts`
- [x] T039 [US3] Update EN/AR row status and accessibility copy without obsolete
      section names in `apps/mobile/locales/en/budgets.json` and
      `apps/mobile/locales/ar/budgets.json`

**Checkpoint**: US3 independently preserves lifecycle clarity and safe actions.

## Phase 6: User Story 4 - Trustworthy Loading and Recovery (Priority: P2)

**Goal**: Skeleton matches final layout; empty and failure states preserve
trust.

**Independent test**: Initial loading, no budgets, filtered empty, post-success
failure, and action failure keep correct structure/data.

### Tests

- [x] T040 [P] [US4] Replace hero/carousel skeleton assertions with tabs, two
      filters, and compact rows in
      `apps/mobile/__tests__/components/budget/BudgetDashboardSkeleton.test.tsx`
- [x] T041 [P] [US4] Add failing no-budget, filtered-empty reset, retained-data
      error, and retry tests in
      `apps/mobile/__tests__/components/budget/BudgetDashboard.test.tsx`
- [x] T042 [P] [US4] Add static guard against `ActivityIndicator` and obsolete
      carousel skeleton regions in
      `apps/mobile/__tests__/components/budget/BudgetDashboardSkeleton.test.tsx`

### Implementation

- [x] T043 [US4] Rebuild `BudgetDashboardSkeleton` to mirror approved
      scope/filter/row geometry in
      `apps/mobile/components/budget/BudgetDashboardSkeleton.tsx`
- [x] T044 [US4] Implement distinct no-budget, filtered-empty reset, and
      retained-error presentation in
      `apps/mobile/components/budget/BudgetDashboard.tsx`
- [x] T045 [US4] Add friendly EN/AR empty/recovery copy in
      `apps/mobile/locales/en/budgets.json` and
      `apps/mobile/locales/ar/budgets.json`

**Checkpoint**: US4 independently proves loading and failure do not mimic data
loss.

## Phase 7: User Story 5 - Supported Devices and Accessibility (Priority: P2)

**Goal**: Filters and rows remain readable, accessible, and safe-area correct.

**Independent test**: EN/AR, RTL, themes, text scaling, orientation,
accessibility roles, and bottom inset retain reachability.

### Tests

- [x] T046 [P] [US5] Add filter roles, selected/value state, row description,
      and hidden-progress accessibility tests in
      `apps/mobile/__tests__/components/budget/BudgetDashboardFilters.test.tsx`
      and `apps/mobile/__tests__/components/budget/BudgetDashboardRow.test.tsx`
- [x] T047 [P] [US5] Add long-name, large-amount, font-scale, and RTL layout
      tests in
      `apps/mobile/__tests__/components/budget/BudgetDashboard.test.tsx`
- [x] T048 [P] [US5] Add light/dark token and prohibited-style assertions in
      `apps/mobile/__tests__/app/budget-screens-style.test.tsx`
- [x] T049 [P] [US5] Add zero/gesture/three-button bottom-inset reachability
      tests in
      `apps/mobile/__tests__/components/budget/BudgetDashboard.test.tsx`

### Implementation

- [x] T050 [US5] Finalize semantic roles, selected/value states, focus order,
      and complete row labels in
      `apps/mobile/components/budget/BudgetDashboardFilters.tsx` and
      `apps/mobile/components/budget/BudgetDashboardRow.tsx`
- [x] T051 [US5] Apply responsive wrapping, RTL alignment, theme tokens, and
      reduced-motion behavior in
      `apps/mobile/components/budget/BudgetDashboard.tsx`,
      `apps/mobile/components/budget/BudgetDashboardRow.tsx`, and
      `apps/mobile/components/budget/BudgetDashboardFilters.tsx`
- [x] T052 [US5] Apply base plus runtime bottom inset exactly once in
      `apps/mobile/components/budget/BudgetDashboard.tsx`

**Checkpoint**: US5 independently passes deterministic accessibility/layout
coverage.

## Phase 8: E2E, verification, and handoff

- [x] T053 [P] Replace carousel/section Maestro assertions with default and
      combined-filter journeys in
      `apps/mobile/e2e/maestro/budgets/dashboard-filtering.yaml`
- [x] T054 [P] Update lifecycle Maestro selectors for unified paused/expired
      rows in `apps/mobile/e2e/maestro/budgets/dashboard-lifecycle-actions.yaml`
- [x] T055 Remove superseded
      `apps/mobile/e2e/maestro/budgets/dashboard-carousel.yaml` and update suite
      mapping in `apps/mobile/scripts/run-ci-e2e.js`
- [x] T056 Run focused mobile Jest and `packages/logic` budget financial
      regressions from `specs/033-budget-dashboard-redesign/quickstart.md`
- [x] T057 Run mobile typecheck, lint, i18n validation, and changed-file static
      rules; document unrelated baseline failures in
      `specs/033-budget-dashboard-redesign/quickstart.md`
- [x] T058 Inspect `manual-qa@monyvi.test` and seed only missing rows using
      `apps/mobile/scripts/seed-fixtures/manual-qa-fixture.js`
- [ ] T059 Run budget Maestro suite with deterministic profiles and record
      results in `specs/033-budget-dashboard-redesign/quickstart.md`
- [ ] T060 Complete physical matrix, SC-006 timing, SC-011 timing, and mockup
      comparison in `specs/033-budget-dashboard-redesign/quickstart.md`
- [x] T061 Run TypeScript, logic, style, correctness, security, and QA coverage
      review against revised `specs/033-budget-dashboard-redesign/spec.md`
- [x] T062 Update PR #226 description and coverage matrix to mark earlier
      section/carousel design superseded

## Dependencies and execution order

- Phase 1 before fixture-dependent service/E2E work.
- Phase 2 blocks all user stories.
- US1 establishes unified list used by US2-US5.
- US2 and US3 may proceed in parallel after US1 if they own separate files, then
  integrate in `BudgetDashboard.tsx` serially.
- US4 depends on US1 and US2 final geometry.
- US5 depends on final controls/rows from US1-US4.
- Phase 8 follows all stories.

## Parallel opportunities

- Fixture, service, session, and component failing tests use separate files.
- Row presentation and filter-control implementation can proceed in parallel
  after their tests fail.
- Resume/Renew regression tests are independent from filter UI.
- Maestro flow updates can proceed in parallel after stable test IDs are agreed.
- Manual data inspection can run while automated package checks execute.

## Implementation strategy

1. **MVP**: Phase 1-3 produces unified active list with no obsolete hierarchy.
2. **Primary navigation**: Add Phase 4 filters and session behavior.
3. **Lifecycle completeness**: Add Phase 5 actions/state.
4. **Trust and support**: Add Phase 6-7.
5. **Release evidence**: Complete Phase 8 before PR handoff.

## Notes

- Never restore carousel, lifecycle sections, large global card, page dots, or
  two-column budget grid without new product approval.
- Keep current user-authored dashboard styling unless final approved mockup
  conflicts.
- No schema, sync, threshold, aggregation, or ownership change.
- Update tests first; fix implementation, not correct tests.
