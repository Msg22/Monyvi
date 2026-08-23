# Tasks: Premium Budget Detail

**Input**: Design documents from `specs/034-budget-detail-redesign/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/budget-detail-ui-contract.md`, `quickstart.md`

**Tests**: Strict TDD is mandatory. Every test task must run and fail for the
intended missing behavior before its paired implementation task begins.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it owns different files and has no
  dependency on incomplete work.
- **[Story]**: Maps work to a user story from `spec.md`.

## Phase 1: Setup and baselines

**Purpose**: Freeze business/test baselines before production changes.

- [x] T001 Document finalized detail pace, daily-average copy, lifecycle,
      empty-section, icon, and navigation rules in
      `docs/business/business-decisions.md`
- [x] T002 Inspect `manual-qa@monyvi.test` local Supabase categories, budgets,
      transactions, and pause intervals against
      `specs/034-budget-detail-redesign/quickstart.md` and record only the
      missing fixture scenarios in
      `specs/034-budget-detail-redesign/quickstart.md`
- [x] T003 Run and record the pre-change focused Budget Detail, logic, seed,
      i18n, lint, and typecheck baselines in
      `specs/034-budget-detail-redesign/quickstart.md`

---

## Phase 2: Foundational contracts, calculations, and lifecycle state

**Purpose**: Build shared typed foundations that block all screen stories.

- [x] T004 [P] Add failing injected-reference-time period-bound tests plus
      elapsed-allowance, displayed-precision classification, inclusive-boundary,
      partial-week, zero-limit, and invalid-period tests in
      `packages/logic/src/budget/__tests__/budget-period-utils.test.ts` and
      `packages/logic/src/budget/__tests__/budget-pace.test.ts`
- [x] T005 Implement injected reference time in
      `packages/logic/src/budget/budget-period-utils.ts` plus pure pace helpers
      and exports in `packages/logic/src/budget/budget-pace.ts` and
      `packages/logic/src/budget/index.ts` to satisfy T004
- [x] T006 [P] Define immutable identity, icon, lifecycle, week, breakdown,
      transaction, error, and command contracts in
      `apps/mobile/contracts/budget-detail-presentation.ts`
- [x] T007 Add failing semantic identity-icon, lifecycle-action, empty
      applicability, and immutable-output assertions in
      `apps/mobile/__tests__/services/budget-detail-read-model-service.test.ts`
- [x] T008 [P] Extend failing bounded-query/read-shaping tests for injected
      time, proportional weekly pace, pace state, transaction counts, icon
      fallbacks, completed-pause exclusion, empty applicability, and newest-six
      DTOs in
      `apps/mobile/__tests__/services/budget-detail-read-model-service.test.ts`
- [x] T009 Refactor bounded aggregation and shaped DTO output in
      `apps/mobile/services/budget-detail-read-model-service.ts` to satisfy T008
      without per-row/per-week reads or a second fetch after an observed input
      snapshot
- [x] T010 [P] Add failing scoped dependency-observation tests for budget,
      transaction, category, ownership, session change, cleanup, one-query-per-
      input, and no observe-then-refetch behavior in
      `apps/mobile/__tests__/services/budget-detail-observation-service.test.ts`
- [x] T011 Implement the service-owned bounded dependency observer in
      `apps/mobile/services/budget-detail-observation-service.ts` to satisfy
      T010
- [x] T012 [P] Extend failing hook tests for initial/refresh errors, last-valid
      retention, Retry, dependency revisions, focus/foreground/day refresh,
      stale generations, sign-out, user change, and unmount in
      `apps/mobile/__tests__/hooks/useBudgetDetail.test.ts`
- [x] T013 Refactor `apps/mobile/hooks/useBudgetDetail.ts` to satisfy T012 while
      keeping all raw queries in services

**Checkpoint**: Pure math, immutable contracts, bounded reads, and resilient
detail lifecycle state are independently green.

---

## Phase 3: User Story 1 - Understand budget health at a glance (Priority: P1)

**Goal**: Render identity and overview for every lifecycle and health state in
the approved hierarchy.

**Independent Test**: Open active, near-limit, over-budget, paused, expired, and
zero-spend fixtures; identity, totals, daily average, dates, lifecycle, and
progress remain correct and accessible.

### Tests for User Story 1

- [x] T014 [P] [US1] Add failing identity tests for category/global/deleted
      icons, lifecycle/period/date text, eligible action, wrapping, RTL, and
      accessible labels in
      `apps/mobile/__tests__/components/budget/BudgetDetailIdentity.test.tsx`
- [x] T015 [P] [US1] Add failing overview tests for amount/limit, actual
      percentage over 100, clamped visual progress, progress semantics,
      Remaining, Daily average spent, Days left, long amounts, light/dark, and
      RTL in
      `apps/mobile/__tests__/components/budget/BudgetDetailOverview.test.tsx`
- [x] T016 [P] [US1] Add failing route composition tests for the approved
      header, identity-before-overview order, lifecycle/health states, and
      removed overflow/actions sheet/footer actions in
      `apps/mobile/__tests__/app/budget-detail.test.tsx`

### Implementation for User Story 1

- [x] T017 [P] [US1] Implement approved responsive identity rendering in
      `apps/mobile/components/budget/BudgetDetailIdentity.tsx`
- [x] T018 [P] [US1] Rewrite the overview as the approved linear progress and
      divided-stat surface in
      `apps/mobile/components/budget/BudgetDetailOverview.tsx`
- [x] T019 [US1] Integrate PageHeader, identity, and overview into
      `apps/mobile/app/(private)/budget-detail.tsx`, removing the overflow sheet
      and footer actions to satisfy T016

**Checkpoint**: User Story 1 is independently usable with read-only detail data.

---

## Phase 4: User Story 2 - Edit or change lifecycle directly (Priority: P1)

**Goal**: Provide direct Edit and confirmed Pause/Resume actions with safe async
behavior.

**Independent Test**: Edit opens the existing form; Pause and Resume cancel,
succeed, fail, and reject duplicates without an action sheet or raw error.

### Tests for User Story 2

- [x] T020 [P] [US2] Add failing backwards-compatibility tests for
      icon-plus-label action rendering, green icon override, 44dp labelled Back,
      existing icon-only/label-only callers, confirmation modal semantics, modal
      accessibility, and blocked backdrop/Back dismissal while confirming in
      `apps/mobile/__tests__/components/navigation/PageHeader.test.tsx` and
      `apps/mobile/__tests__/components/modals/ConfirmationModal.test.tsx`
- [x] T021 [P] [US2] Add failing action-hook tests for scoped Pause/Resume,
      duplicate suppression, stable error keys, structured logging, result
      states, and unmount safety plus a service-level Delete regression proving
      no transaction mutation in
      `apps/mobile/__tests__/hooks/useBudgetDetailActions.test.ts` and
      `apps/mobile/__tests__/services/budget-service.test.ts`
- [x] T022 [US2] Extend failing route tests for Edit navigation, Pause/Resume
      confirmation cancel/success/failure, pending disabled state, duplicate
      taps, expired omission, and observation-driven refresh in
      `apps/mobile/__tests__/app/budget-detail.test.tsx`

### Implementation for User Story 2

- [x] T023 [P] [US2] Extend `apps/mobile/components/navigation/PageHeader.tsx`
      and `apps/mobile/components/modals/ConfirmationModal.tsx` compatibly for
      approved Edit, Back/modal accessibility, and pending dismissal safety to
      satisfy T020
- [x] T024 [P] [US2] Implement lifecycle command state in
      `apps/mobile/hooks/useBudgetDetailActions.ts` using existing
      `apps/mobile/services/budget-service.ts` commands to satisfy T021
- [x] T025 [US2] Compose localized Edit/Pause/Resume actions and shared
      `ConfirmationModal` behavior in
      `apps/mobile/app/(private)/budget-detail.tsx` to satisfy T022
- [x] T026 [US2] Remove obsolete action-sheet exports, implementation, and tests
      from `apps/mobile/components/budget/index.ts`,
      `apps/mobile/components/budget/BudgetActionsSheet.tsx`, and
      `apps/mobile/__tests__/components/budget/BudgetActionsSheet.test.tsx`

**Checkpoint**: User Stories 1 and 2 work without hidden action surfaces.

---

## Phase 5: User Story 3 - Review spending evidence (Priority: P2)

**Goal**: Render accurate weekly pace, category breakdown, recent transactions,
and pause-exclusion evidence.

**Independent Test**: Global/category budgets with multi-week, descendant,
empty, paused, expired, and recent data show exact existing totals and approved
section behavior.

### Tests for User Story 3

- [x] T027 [P] [US3] Add failing chart tests for fixed axis, proportional dashed
      pace, every chronological bucket, horizontal overflow, localized labels,
      active insight, paused/expired omission, RTL, accessibility summaries,
      reduced motion, and cleanup in
      `apps/mobile/__tests__/components/budget/BudgetSpendingTrendChart.test.tsx`
- [x] T028 [P] [US3] Add failing breakdown tests for compact icons, names,
      transaction counts, amounts, percentages, separators, empty category
      state, global omission contract, no chevrons, RTL, and accessibility in
      `apps/mobile/__tests__/components/budget/SubcategoryBreakdown.test.tsx`
- [x] T029 [P] [US3] Add failing recent-row tests for newest-six shaped DTOs,
      compact/empty rendering, entire-row press target, edit-intent
      accessibility, RTL chevron, no View all, and callback identity in
      `apps/mobile/__tests__/components/budget/BudgetRecentTransactions.test.tsx`
- [x] T030 [US3] Extend failing route tests for approved section order,
      transaction Edit navigation/return refresh, conditional pause-exclusion
      copy, applicable empty sections, and global breakdown omission in
      `apps/mobile/__tests__/app/budget-detail.test.tsx`

### Implementation for User Story 3

- [x] T031 [P] [US3] Rewrite the fixed-axis horizontally scrollable weekly
      actual-versus-pace surface in
      `apps/mobile/components/budget/BudgetSpendingTrendChart.tsx`
- [x] T032 [P] [US3] Rewrite compact noninteractive category rows and empty
      state in `apps/mobile/components/budget/SubcategoryBreakdown.tsx`
- [x] T033 [P] [US3] Rewrite recent transactions to render shaped pressable rows
      in `apps/mobile/components/budget/BudgetRecentTransactions.tsx`
- [x] T034 [US3] Integrate supporting sections, Edit Transaction navigation, and
      conditional pause-exclusion explanation in
      `apps/mobile/app/(private)/budget-detail.tsx`

**Checkpoint**: Spending evidence is accurate, bounded, reachable, and
independently testable.

---

## Phase 6: User Story 4 - Delete deliberately and safely (Priority: P2)

**Goal**: Provide an isolated, confirmed destructive flow that preserves
transactions.

**Independent Test**: Delete cancel writes nothing; success removes only the
budget and exits detail; failure keeps detail and enables recovery.

### Tests for User Story 4

- [x] T035 [P] [US4] Add failing Danger zone visual, copy, outline,
      touch-target, RTL, accessibility, and callback tests in
      `apps/mobile/__tests__/components/budget/BudgetDetailDangerZone.test.tsx`
- [x] T036 [US4] Extend failing route tests for Delete cancel/success/failure,
      duplicate pending confirm, retained transactions contract, navigation, and
      bottom-inset clearance in
      `apps/mobile/__tests__/app/budget-detail.test.tsx`

### Implementation for User Story 4

- [x] T037 [P] [US4] Implement the approved isolated destructive surface in
      `apps/mobile/components/budget/BudgetDetailDangerZone.tsx`
- [x] T038 [US4] Compose Delete confirmation, command result handling, friendly
      feedback, and successful navigation in
      `apps/mobile/app/(private)/budget-detail.tsx`

**Checkpoint**: Destructive behavior is isolated, confirmed, and local-first.

---

## Phase 7: User Story 5 - Reach every state safely (Priority: P2)

**Goal**: Complete loading, error, localization, accessibility, responsive, and
safe-area behavior.

**Independent Test**: Every defined state remains readable and operable across
supported language, theme, direction, motion, text, orientation, and navigation
modes.

### Tests for User Story 5

- [x] T039 [P] [US5] Add failing reduced-motion and animation-cancellation tests
      for the shared shimmer in
      `apps/mobile/__tests__/components/ui/Skeleton.test.tsx`
- [x] T040 [P] [US5] Add failing mockup-parity skeleton-region tests for
      identity, overview, chart, conditional breakdown, recent rows, and Danger
      zone in
      `apps/mobile/__tests__/components/budget/BudgetDetailSkeleton.test.tsx`
- [x] T041 [US5] Extend failing route/style tests for initial error Retry,
      retained refresh error, not-found/deleted/inaccessible, signed-out
      clearing, EN/AR keys, light/dark, RTL, large text, and exactly-once bottom
      inset in `apps/mobile/__tests__/app/budget-detail.test.tsx` and
      `apps/mobile/__tests__/app/budget-screens-style.test.tsx`

### Implementation for User Story 5

- [x] T042 [P] [US5] Add system reduced-motion and cleanup behavior to
      `apps/mobile/components/ui/Skeleton.tsx`
- [x] T043 [P] [US5] Implement the approved responsive loading composition in
      `apps/mobile/components/budget/BudgetDetailSkeleton.tsx`
- [x] T044 [P] [US5] Add complete English and Arabic Budget Detail copy in
      `apps/mobile/locales/en/budgets.json` and
      `apps/mobile/locales/ar/budgets.json`
- [x] T045 [US5] Complete loading/error/not-found/retry/accessibility/safe-area
      route composition in `apps/mobile/app/(private)/budget-detail.tsx`

**Checkpoint**: All five user stories satisfy deterministic component and route
coverage.

---

## Phase 8: Fixtures, end-to-end journeys, and delivery verification

**Purpose**: Convert the final manual plan into deterministic automation and
honest device evidence.

- [x] T046 Add failing manual/E2E seed assertions for only the scenarios found
      missing in T002 in `apps/mobile/__tests__/scripts/manual-qa-seed.test.ts`
      and `apps/mobile/__tests__/scripts/e2e-seed.test.ts`
- [x] T047 Add only missing idempotent detail categories, budgets, transactions,
      pause intervals, and disposable-delete profile in
      `apps/mobile/scripts/seed-fixtures/manual-qa-fixture.js`,
      `apps/mobile/scripts/seed-fixtures/e2e-fixture.js`, and
      `apps/mobile/scripts/seed-fixtures/seed-engine.js`
- [x] T048 Add failing Maestro contract/runner assertions for active, lifecycle,
      expired/empty, transaction Edit, and destructive detail journeys in
      `apps/mobile/__tests__/scripts/budget-maestro-flows.test.ts` and
      `apps/mobile/__tests__/scripts/run-ci-e2e.test.ts` plus Budget Detail
      scope selection in
      `apps/mobile/__tests__/scripts/resolve-ci-e2e-scope.test.ts`
- [x] T049 Implement deterministic Budget Detail Maestro flows and suite mapping
      in `apps/mobile/e2e/maestro/budgets/budget-detail-active.yaml`,
      `apps/mobile/e2e/maestro/budgets/budget-detail-lifecycle.yaml`,
      `apps/mobile/e2e/maestro/budgets/budget-detail-delete.yaml`, and
      `apps/mobile/scripts/run-ci-e2e.js` plus
      `apps/mobile/scripts/resolve-ci-e2e-scope.js`
- [x] T050 Run the complete focused logic/mobile Jest matrix from
      `specs/034-budget-detail-redesign/quickstart.md` and fix implementation
      defects without weakening correct tests
- [x] T051 Run logic/mobile typecheck, lint, i18n coverage, and architecture
      boundary checks; record exact results in
      `specs/034-budget-detail-redesign/quickstart.md`
- [x] T052 Run the local Budgets Maestro suite, or record the exact emulator/
      infrastructure blocker without claiming coverage, in
      `specs/034-budget-detail-redesign/quickstart.md`
- [ ] T053 Execute the manual-only device matrix with Mohamed where hardware
      observation is required and record observed versus blocked evidence in
      `specs/034-budget-detail-redesign/quickstart.md`
- [x] T054 Re-query issues #228, #229, #230 and current main CI; record their
      separate PR/green-gate status without adding unrelated auth/SMS/runner
      code to `specs/034-budget-detail-redesign/quickstart.md`
- [x] T055 Audit implementation against every FR/SC, mark only tasks backed by
      completed evidence as `[x]`, leave externally blocked manual/dependency
      gates explicit, and prepare the PR coverage matrix/manual QA plan in
      `specs/034-budget-detail-redesign/quickstart.md`

## Requirement coverage map

| Requirement group                                           | Task coverage                                            |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| FR-001–FR-007, FR-013–FR-015, FR-023, FR-039–FR-041, FR-046 | T014–T019                                                |
| FR-008–FR-012, FR-035–FR-037                                | T020–T026                                                |
| FR-016–FR-022, FR-042–FR-045                                | T004–T013, T027–T034                                     |
| FR-024–FR-029, FR-034                                       | T021, T035–T038                                          |
| FR-030–FR-033, FR-038                                       | T039–T045                                                |
| SC-001–SC-007, SC-009–SC-010                                | T046–T053, T055                                          |
| SC-008 and DD-001–DD-005                                    | T052, T054, T055; linked #228–#230 remain separate gates |

---

## Dependencies and execution order

- Phase 1 has no dependency.
- Phase 2 depends on Phase 1 and blocks every user story.
- US1 depends on the shaped read model and pace foundations.
- US2 can implement hook/header work after Phase 2, then integrates with US1.
- US3 depends on the shaped read model and route shell from US1.
- US4 depends on the action hook from US2 and route shell from US1.
- US5 depends on the final component anatomy from US1–US4.
- Phase 8 depends on all five user stories.

Within each phase, every failing-test task precedes its production task. Tasks
sharing `budget-detail.tsx` or the same test file run sequentially.

## Parallel opportunities

- T004, T006, T010, and T012 own separate files; T007 and T008 run sequentially
  because they share the read-model test file.
- T014 and T015 can run together; T017 and T018 can run after their tests.
- T020 and T021 can run together; T023 and T024 can run after their tests.
- T027, T028, and T029 can run together; T031, T032, and T033 can follow.
- T035 can run while route test T036 is prepared sequentially.
- T039 and T040 can run together; T042, T043, and T044 own separate files.

## Implementation strategy

1. Finish setup and foundation with green pure/service/hook tests.
2. Deliver US1 as the read-only premium detail MVP.
3. Add direct lifecycle actions through US2.
4. Add evidence sections through US3.
5. Add the isolated destructive flow through US4.
6. Complete responsive/error/accessibility behavior through US5.
7. Run fixtures, E2E, manual QA, and delivery dependency gates.

## Notes

- Do not install dependencies in this secondary worktree.
- Do not add schema, migration, Supabase, or sync changes.
- Do not mix #228, #229, or #230 implementation into this branch.
- Do not claim Maestro/device coverage that the available runner cannot execute.
