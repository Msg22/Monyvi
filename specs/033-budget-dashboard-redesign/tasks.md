---
description:
  "Dependency-ordered implementation tasks for Premium Budgets Dashboard"
---

# Tasks: Premium Budgets Dashboard

**Input**: Design documents from `/specs/033-budget-dashboard-redesign/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`

**Tests**: Required. Project constitution mandates strict TDD plus
unit/integration, Maestro, and manual-device coverage. Each test task must fail
for the intended reason before its paired production task starts.

**Organization**: Tasks grouped by user story. Story phases deliver
independently testable increments after shared foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after listed prerequisites because files do not
  overlap.
- **[Story]**: Maps task to specification user story.
- Every task contains exact repository path.

## Phase 1: Setup (Shared Test Data and E2E Harness)

**Purpose**: Create deterministic budget data and register a truthful budget E2E
suite before feature UI work.

- [x] T001 [P] Add failing assertions for healthy globals, warning/danger
      categories, paused records, expired-active and expired-paused custom
      records, zero spend, deleted category, and long-copy cases in
      `apps/mobile/__tests__/scripts/manual-qa-seed.test.ts`
- [x] T002 [P] Add failing assertions for `dashboard-full`,
      `dashboard-filter-empty`, default-profile compatibility, unknown-profile
      rejection, and deterministic profile contents in
      `apps/mobile/__tests__/scripts/e2e-seed.test.ts`
- [x] T003 [P] Make T001 pass with idempotent manual-QA budget and transaction
      rows in `apps/mobile/scripts/seed-fixtures/manual-qa-fixture.js`
- [x] T004 [P] Make T002 pass with immutable default, `dashboard-full`, and
      no-CUSTOM `dashboard-filter-empty` fixtures plus profile resolution in
      `apps/mobile/scripts/seed-fixtures/e2e-fixture.js` and
      `apps/mobile/scripts/e2e-seed.js`
- [x] T005 [P] Add failing `budgets` suite selection, changed-file mapping,
      per-flow profile mapping, reset/reseed-before-each-flow, ordering, retry,
      and default-suite compatibility assertions in
      `apps/mobile/__tests__/scripts/resolve-ci-e2e-scope.test.ts` and
      `apps/mobile/__tests__/scripts/run-ci-e2e.test.ts`
- [x] T006 Make T005 pass by registering the `budgets` suite and mapping each
      flow to its reset/reseed profile in
      `apps/mobile/scripts/resolve-ci-e2e-scope.js` and
      `apps/mobile/scripts/run-ci-e2e.js`

**Checkpoint**: Seed tests pass; E2E harness recognizes a budget suite without
borrowing manual-QA account state.

---

## Phase 2: Foundational (Blocking Read-Model and Hook Contracts)

**Purpose**: Establish display-ready, user-scoped dashboard data and recoverable
React lifecycle state shared by every story.

**CRITICAL**: No story implementation starts before this phase passes.

- [x] T007 [P] Add failing assertions for every new dashboard, lifecycle,
      carousel, empty-state, confirmation, and recovery translation key in
      `apps/mobile/__tests__/i18n/translation-resources.test.ts`
- [x] T008 Make T007 pass with matching friendly English and Arabic copy in
      `apps/mobile/locales/en/budgets.json` and
      `apps/mobile/locales/ar/budgets.json`
- [x] T009 [P] Add failing contract tests for retaining expired custom budgets,
      immutable display-ready DTOs with every global-card field,
      accessible-category labels, `en`/`ar` locale input, user-scoped
      observation, and unchanged financial metrics in
      `apps/mobile/__tests__/services/budget-list-read-model-service.test.ts`
- [x] T010 Make T009 pass by introducing readonly dashboard item/read-model
      types and base shaping in
      `apps/mobile/services/budget-list-read-model-service.ts` without changing
      `@monyvi/logic` calculations
- [x] T011 [P] Add failing `renderHook` tests for accessible-category readiness,
      initial versus recoverable failure, last-valid-state retention, stale
      async cancellation, retry, signed-out clearing, and unmount cleanup in
      `apps/mobile/__tests__/hooks/useBudgets.test.ts`
- [x] T012 Make T011 pass by evolving the facade in
      `apps/mobile/hooks/useBudgets.ts`, passing active `en`/`ar` locale into
      the builder, and consuming the accessible category map from
      `apps/mobile/context/CategoriesContext.tsx` without new database queries

**Checkpoint**: Foundation returns immutable shaped data, retains last valid
state after later failures, and never leaks foreign/local-stale data.

---

## Phase 3: User Story 1 - See Every Global Budget (Priority: P1) MVP

**Goal**: Make every matching global budget reachable exactly once and render
healthy globals as complete responsive page groups.

**Independent Test**: With healthy, attention, paused, and expired global
budgets across all periods, All shows each ID once; healthy globals form
complete equal-size carousel pages at one-card and multi-card widths.

### Tests for User Story 1

- [x] T013 [US1] Add failing service cases for retaining all global budgets,
      expiry-over-pause precedence, exactly-once global section ownership, and
      no singular `globalBudget` truncation in
      `apps/mobile/__tests__/services/budget-list-read-model-service.test.ts`
- [x] T014 [P] [US1] Add failing pure tests for 320 dp minimum/16 dp gap
      constants, non-positive and 319/320/655/656 dp boundaries, maximum whole
      count, equal width, grouping, unstretched final pages, and stable-ID
      recovery in
      `apps/mobile/__tests__/components/budget/budget-dashboard-layout.test.ts`
- [x] T015 [P] [US1] Add failing RNTL tests for complete group snapping, dots,
      stable keys, one/multi-card rendering, and visibly rendered
      period/spent/limit/percentage/remaining/remaining-time fields in
      `apps/mobile/__tests__/components/budget/GlobalBudgetCarousel.test.tsx`
- [x] T016 [P] [US1] Add failing dashboard integration tests for Overall, Needs
      attention, and Paused global placement plus section omission/order in
      `apps/mobile/__tests__/components/budget/BudgetDashboard.test.tsx`

### Implementation for User Story 1

- [x] T017 [US1] Make T013 pass with one expiry-first classifier and all-global
      output arrays in `apps/mobile/services/budget-list-read-model-service.ts`
- [x] T018 [P] [US1] Make T014 pass with the exact 320 dp minimum and 16 dp gap
      constants, immutable page grouping, stable-anchor recovery, and full-width
      row helpers in `apps/mobile/components/budget/budget-dashboard-layout.ts`
- [x] T019 [P] [US1] Create shaped global/lifecycle cards that visibly render
      period, spent, limit, percentage, remaining, and remaining time for
      T015/T016 in `apps/mobile/components/budget/BudgetDashboardCard.tsx`
- [x] T020 [P] [US1] Create approved clean section-heading presentation needed
      by T016 in
      `apps/mobile/components/budget/BudgetDashboardSectionHeader.tsx`
- [x] T021 [US1] Make T015 pass with measured viewport pages, fixed
      `getItemLayout`, full-group snapping, indicators, and stable regrouping in
      `apps/mobile/components/budget/GlobalBudgetCarousel.tsx`
- [x] T022 [US1] Make T016 pass by rendering every global lifecycle section
      through shaped props in
      `apps/mobile/components/budget/BudgetDashboard.tsx` and exporting new
      components from `apps/mobile/components/budget/index.ts`
- [ ] T023 [US1] Add and pass deterministic swipe/reachability coverage with the
      `dashboard-full` profile in
      `apps/mobile/e2e/maestro/budgets/dashboard-carousel.yaml`

**Checkpoint**: US1 independently demoable. No valid global hidden; carousel
never rests on cropped cards.

---

## Phase 4: User Story 2 - Understand Budget Health at a Glance (Priority: P1)

**Goal**: Render all lifecycle and health states in four mutually exclusive
approved sections with readable text status and premium cards.

**Independent Test**: Healthy, warning, danger, paused, expired, zero-spend, and
deleted-category records each appear once in correct ordered section.

### Tests for User Story 2

- [x] T024 [US2] Add failing table-driven classifier tests for all lifecycle
      states, zero spend, deleted categories, no duplicate IDs, and trimmed-name
      `Intl.Collator` ordering in both `en` and `ar` with code-point ID
      tie-breaks in
      `apps/mobile/__tests__/services/budget-list-read-model-service.test.ts`
- [x] T025 [P] [US2] Add failing RNTL tests for four-section order,
      empty-section omission, text-plus-visual statuses, zero-spend and
      deleted-category cards, layout-matching Skeleton loading, no-budget state,
      recoverable error, no footer, and no FAB in
      `apps/mobile/__tests__/components/budget/BudgetDashboard.test.tsx`
- [x] T026 [P] [US2] Add failing full-width compact-row and stable-order tests
      for Needs attention, Category budgets, and Paused in
      `apps/mobile/__tests__/components/budget/BudgetDashboardRow.test.tsx`
- [x] T027 [P] [US2] Add failing PageHeader and no-budget Create navigation
      assertions plus absent persistent FAB/summary assertions in
      `apps/mobile/__tests__/app/budget-screens-style.test.tsx`

### Implementation for User Story 2

- [x] T028 [US2] Make T024 pass with exclusive classification, deleted-category
      labels, and exact active-locale `Intl.Collator` plus budget-ID ordering in
      `apps/mobile/services/budget-list-read-model-service.ts`
- [x] T029 [P] [US2] Make T026 pass with grouped compact rows that preserve
      service order in `apps/mobile/components/budget/BudgetDashboardRow.tsx`
- [x] T030 [P] [US2] Extend lifecycle/category/zero-spend/deleted-category
      visual states and text labels in
      `apps/mobile/components/budget/BudgetDashboardCard.tsx`
- [x] T031 [P] [US2] Create layout-matching dashboard loading placeholders with
      shared `Skeleton` in
      `apps/mobile/components/budget/BudgetDashboardSkeleton.tsx`
- [x] T032 [US2] Make T025 pass with one vertical virtualized `FlatList`,
      approved sections/cards, no-budget and recoverable-error states, and
      removal of `ActivityIndicator`, fixed summary footer, and FAB in
      `apps/mobile/components/budget/BudgetDashboard.tsx`
- [x] T033 [US2] Make T027 pass by moving Create to `PageHeader.rightAction`,
      wiring the no-budget CTA to the same callback, connecting shaped props,
      and preserving focus-triggered expired auto-pause orchestration in
      `apps/mobile/app/(private)/budgets.tsx`
- [x] T034 [US2] Remove migrated category-context presentation and obsolete
      exports from `apps/mobile/components/budget/BudgetCategoryCard.tsx`,
      `apps/mobile/components/budget/BudgetHeroCard.tsx`, and
      `apps/mobile/components/budget/index.ts` only after all consumers use new
      cards

**Checkpoint**: US2 independently proves every prepared lifecycle state exactly
once with no ambiguous footer or missing paused/expired budget.

---

## Phase 5: User Story 3 - Filter Without Losing Context (Priority: P2)

**Goal**: Apply All/Weekly/Monthly/Custom consistently to every section while
keeping stable context and honest empty states.

**Independent Test**: Every filter limits all four sections; filtered-empty
differs from no-budgets; spend-only updates never reorder a section.

### Tests for User Story 3

- [x] T035 [US3] Add failing all-period/every-section tests, same-locale
      spend-stability tests, active-locale reorder tests, and stale-filter
      completion tests in
      `apps/mobile/__tests__/services/budget-list-read-model-service.test.ts`
      and `apps/mobile/__tests__/hooks/useBudgets.test.ts`
- [x] T036 [P] [US3] Add failing filter-chip, filtered-empty, return-to-All,
      retry, and carousel-anchor-preservation integration tests in
      `apps/mobile/__tests__/components/budget/BudgetDashboard.test.tsx`

### Implementation for User Story 3

- [x] T037 [US3] Make T035 pass by filtering before classification, forwarding
      active locale, applying the exact comparator, and cancelling stale
      computations in `apps/mobile/services/budget-list-read-model-service.ts`
      and `apps/mobile/hooks/useBudgets.ts`
- [x] T038 [US3] Make T036 pass with controlled filters, distinct filtered-empty
      recovery, and anchor-preserving regroup input in
      `apps/mobile/components/budget/PeriodFilterChips.tsx` and
      `apps/mobile/components/budget/BudgetDashboard.tsx`
- [ ] T039 [US3] Add/pass All/Weekly/Monthly/Custom and no-CUSTOM filtered-empty
      journeys with `dashboard-filter-empty` in
      `apps/mobile/e2e/maestro/budgets/dashboard-visibility-filters.yaml`, then
      use removable `performance.now()` press/post-commit probes in
      `apps/mobile/components/budget/PeriodFilterChips.tsx` and
      `apps/mobile/components/budget/BudgetDashboard.tsx` (structured dev
      logger/injected callback, never `console.*`) for five SC-006 transitions
      per filter and record/remove evidence via
      `specs/033-budget-dashboard-redesign/quickstart.md`

**Checkpoint**: US3 independently filters every lifecycle group without losing
budgets or silently changing order.

---

## Phase 6: User Story 4 - Take Safe Lifecycle Actions (Priority: P2)

**Goal**: Confirm Resume safely and route Renew into a distinct create-source
contract without mutating historical expired budgets.

**Independent Test**: Resume cancel writes nothing; confirm calls owned command
once; failure leaves card visible; Renew emits `renewFrom`, never edit `id`.

**External dependency**: Dashboard Renew contract can complete now. Full
prefilled-form journey tasks T043 and T047 wait for child issue #225.

### Tests for User Story 4

- [x] T040 [P] [US4] Add failing owned Resume tests for paused-only guard,
      pause-interval closure, second-call rejection with no second interval, and
      unchanged record on rejection in
      `apps/mobile/__tests__/services/budget-service.test.ts`
- [x] T041 [P] [US4] Add failing `renderHook` tests for async submit-once
      protection, success, cancellation/unmount, retry, and retained failure
      state—without modal target ownership—in
      `apps/mobile/__tests__/hooks/useBudgetDashboardActions.test.ts`
- [x] T042 [P] [US4] Add failing route tests for shared confirmation
      open/cancel/confirm, friendly Toast failure, direct action callbacks, and
      `renewFrom` navigation without `id` in
      `apps/mobile/__tests__/app/budgets-dashboard-actions.test.tsx`
- [ ] T043 [US4] After #225 lands, add failing cross-issue integration coverage
      proving Renew opens a prefilled CREATE form and leaves the source
      unchanged in `apps/mobile/__tests__/app/budget-renew-integration.test.tsx`

### Implementation for User Story 4

- [x] T044 [US4] Make T040 pass while preserving the current user-owned
      paused-only service guard and interval closure in
      `apps/mobile/services/budget-service.ts`; a second/non-paused call must
      reject, not succeed idempotently
- [x] T045 [US4] Make T041 pass with async command/loading/error/cancellation
      state only in `apps/mobile/hooks/useBudgetDashboardActions.ts`; selected
      target and modal visibility remain route-owned
- [x] T046 [US4] Make T042 pass with route-owned selected target and shared
      `ConfirmationModal`, translated Toast recovery, disabled duplicate submit,
      Resume callbacks, and distinct Renew navigation in
      `apps/mobile/app/(private)/budgets.tsx` and
      `apps/mobile/components/budget/BudgetDashboard.tsx`
- [ ] T047 [US4] After #225 consumes `renewFrom`, add/pass visible Resume
      cancel/confirm plus Renew-prefill coverage with `dashboard-full` in
      `apps/mobile/e2e/maestro/budgets/dashboard-lifecycle-actions.yaml`; keep
      injected failure in Jest/RNTL

**Checkpoint**: Dashboard lifecycle actions safe independently; full Renew
journey marked complete only after #225 integration test and Maestro flow pass.

---

## Phase 7: User Story 5 - Use the Dashboard Across Supported Devices (Priority: P3)

**Goal**: Keep content readable, reachable, and announced across themes,
languages, RTL, resizing, accessibility settings, and Android navigation modes.

**Independent Test**: Automated accessibility/layout tests pass; physical
Android 16 gesture and three-button checks show no obscured final
content/action.

### Tests for User Story 5

- [x] T048 [P] [US5] Add failing carousel/card tests for visible and accessible
      period/spent/limit/percentage/remaining/remaining-time fields, page X/Y
      announcements, silent initial layout, RTL order, reduced motion, font
      scaling, and long strings in
      `apps/mobile/__tests__/components/budget/GlobalBudgetCarousel.test.tsx`
      and `apps/mobile/__tests__/components/budget/BudgetDashboardCard.test.tsx`
- [x] T049 [P] [US5] Add failing light/dark NativeWind class and EN/AR
      presentation assertions in
      `apps/mobile/__tests__/app/budget-screens-style.test.tsx`
- [x] T050 [P] [US5] Add failing exact-once bottom-inset and final-row
      reachability assertions for zero, gesture, and three-button insets in
      `apps/mobile/__tests__/components/budget/BudgetDashboard.test.tsx`

### Implementation for User Story 5

- [x] T051 [US5] Make T048 pass with translated card/page accessibility
      descriptions, user-only `AccessibilityInfo` announcements, stable RTL
      semantics, and reduced-motion recovery in
      `apps/mobile/components/budget/GlobalBudgetCarousel.tsx` and
      `apps/mobile/components/budget/BudgetDashboardCard.tsx`
- [x] T052 [US5] After T051, make T049 pass with approved NativeWind theme
      tokens, RTL alignment/order, and resilient text constraints in
      `apps/mobile/components/budget/BudgetDashboard.tsx`,
      `apps/mobile/components/budget/BudgetDashboardCard.tsx`, and
      `apps/mobile/components/budget/BudgetDashboardSectionHeader.tsx`
- [x] T053 [US5] After issue #219 PR #222 lands, rebase and make T050 pass with
      one `base + useSafeAreaInsets().bottom` list-content owner and no global
      padding in `apps/mobile/components/budget/BudgetDashboard.tsx`
- [ ] T054 [US5] Execute/record the device matrix plus three fresh no-budget
      SC-010 trials from interactive dashboard to visible Create form, requiring
      each `<= 10 seconds`, in
      `specs/033-budget-dashboard-redesign/quickstart.md`

**Checkpoint**: US5 automated matrix green; manual-only checks carry
device/build evidence.

---

## Phase 8: Polish and Cross-Cutting Verification

**Purpose**: Close regression, architecture, QA-data, E2E, and PR-evidence
obligations.

- [x] T055 Remove only redesign-created dead imports, obsolete budget component
      references, and stale dashboard translation keys in
      `apps/mobile/components/budget/index.ts`,
      `apps/mobile/locales/en/budgets.json`, and
      `apps/mobile/locales/ar/budgets.json`
- [x] T056 Run focused mobile Jest and unchanged financial regression commands
      from `specs/033-budget-dashboard-redesign/quickstart.md`, then record
      exact results in that file
- [x] T057 Run mobile TypeScript and lint gates from
      `specs/033-budget-dashboard-redesign/quickstart.md`, fixing only
      feature-caused failures in `apps/mobile/`
- [x] T058 Run all three budget Maestro flows through the registered suite,
      verify per-flow reset/profile mapping and unchanged default suites, and
      record exact results or honest harness blockers in
      `specs/033-budget-dashboard-redesign/quickstart.md`
- [x] T059 Inspect local Supabase data for `manual-qa@monyvi.test`, compare it
      with the required matrix, seed only missing rows through
      `apps/mobile/scripts/seed-fixtures/manual-qa-fixture.js`, and rerun
      `apps/mobile/__tests__/scripts/manual-qa-seed.test.ts`
- [x] T060 Audit every manual scenario against Jest, Maestro, or manual-only
      evidence and add the final coverage matrix to
      `specs/033-budget-dashboard-redesign/quickstart.md`
- [ ] T061 Re-run Samsung Android 16 gesture/three-button final QA after #222
      and Renew QA after #225, recording build SHA and screenshots in
      `specs/033-budget-dashboard-redesign/quickstart.md`
- [x] T062 Review final diff against
      `specs/033-budget-dashboard-redesign/spec.md`,
      `specs/033-budget-dashboard-redesign/contracts/`,
      `docs/business/business-decisions.md`, architecture boundaries, user
      scoping, offline behavior, and unchanged financial calculations; document
      PR evidence in `specs/033-budget-dashboard-redesign/quickstart.md`
- [x] T063 Apply physical-QA correction: keep Overall compact, place its icon
      beside the title and percentage beside progress, and replace full/grid
      cards in the remaining sections with approved compact rows
- [x] T064 Add focused layout regressions for compact section rows, readable
      titles, inline lifecycle actions, and Overall title/progress placement

---

## Dependencies and Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately. T003 depends on T001; T004 depends on
  T002; T006 depends on T004 and T005 because the runner maps the profiles
  created by T004.
- **Foundational (Phase 2)**: Starts after Setup. T008 depends on T007; T010
  depends on T009; T012 depends on T011 and T010. Blocks every user story.
- **US1 (Phase 3)**: Starts after Foundation. Strict MVP.
- **US2 (Phase 4)**: Depends on US1 shared classifier, card, section, carousel,
  and dashboard shell.
- **US3 (Phase 5)**: Depends on US1 and US2 section model.
- **US4 (Phase 6)**: Dashboard Resume and Renew route contract depend on US2;
  T043 and T047 additionally depend on child #225.
- **US5 (Phase 7)**: Depends on rendered stories; T053/T054 final safe-area
  acceptance depends on issue #219 PR #222.
- **Polish (Phase 8)**: Depends on selected story scope; full release closure
  depends on all stories plus #222/#225 integration.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 -> US2
                         |      |
                         |      +-> US3
                         |      +-> US4 -- full Renew waits #225
                         +----------> US5 -- final safe-area QA waits #222

US1 strict MVP
US1 + US2 release-quality P1 dashboard
US3 + US4 + US5 complete specification
```

### Within Each Story

1. Write listed tests.
2. Run them and confirm failure matches missing behavior.
3. Implement minimum production behavior.
4. Re-run focused tests.
5. Complete story checkpoint before next dependent story.

## Parallel Opportunities

- Setup: T001/T002/T005; then T003/T004.
- Foundation: T007/T009/T011 can begin in separate test files; production
  follows their paired failures.
- US1: T014/T015/T016 tests; then T018/T019/T020 implementations.
- US2: T025/T026/T027 tests; then T029/T030/T031 implementations.
- US3: T036 can run beside T035; T039 follows implementation.
- US4: T040/T041/T042 use separate files; T043 waits #225.
- US5: T048/T049/T050 use separate test files; T051 completes shared
  carousel/card behavior before T052 edits the same card for theme/RTL/text
  styling.
- Polish: validation commands may run in parallel only when they do not mutate
  shared output; write results to `quickstart.md` serially.

## Parallel Examples

### User Story 1

```text
Task T014: pure carousel/layout tests
Task T015: carousel component tests
Task T016: dashboard global integration tests
```

### User Story 2

```text
Task T025: section/state rendering tests
Task T026: compact section-row layout tests
Task T027: PageHeader/create action tests
```

### User Story 3

```text
Task T035: service/hook filter tests
Task T036: dashboard filtered-empty/anchor tests
```

### User Story 4

```text
Task T040: Resume command tests
Task T041: action hook tests
Task T042: route confirmation/navigation tests
```

### User Story 5

```text
Task T048: accessibility/RTL/motion tests
Task T049: theme/localization style tests
Task T050: safe-area reachability tests
```

## Implementation Strategy

### Strict MVP

1. Complete Setup and Foundation.
2. Complete US1.
3. Stop and validate all global budgets and responsive carousel independently.
4. Demo only if no global is hidden or cropped.

### Release-Quality P1 Increment

1. Add US2 after US1.
2. Validate four exclusive sections, statuses, skeletons, header Create, and
   removed footer/FAB.
3. This is minimum recommended dashboard-redesign PR review point.

### Complete Increment

1. Add US3 consistent filters.
2. Add US4 safe actions; keep Renew integration explicitly blocked until #225.
3. Add US5 accessibility/device behavior; keep final safe-area evidence blocked
   until #222.
4. Complete Polish with deterministic automation, selective manual-QA seeding,
   and physical evidence.

## Notes

- No schema, migration, sync contract, or persisted `EXPIRED` status task
  exists.
- Existing financial calculations remain untouched; tests guard them.
- `[P]` means separate files or safe split after prerequisite tests complete.
- Commit only after logical green groups; never bypass hooks.
- Do not claim full Renew or safe-area acceptance before named dependencies
  land.
