# Tasks: Budget Management UI & Spending Progress Tracking

**Input**: Design documents from `/specs/019-budget-management/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅

**Organization**: Tasks grouped by user story for independent implementation and
testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Schema)

**Purpose**: Database schema updates and project structure initialization

- [ ] T001 Create SQL migration
      `supabase/migrations/035_budget_schema_updates.sql` — ADD alert_fired_level
      TEXT column; keep `currency` required
- [ ] T002 Run `npm run db:push` to apply migration to Supabase
- [ ] T003 Run `npm run db:migrate` to regenerate WatermelonDB schema, types,
      and local migrations
- [ ] T004 Update `packages/db/src/models/Budget.ts` — add `alertFiredLevel`
      getter and `resetAlertLevel()` helper method

**Checkpoint**: Schema updated, Budget model has new fields, `npx tsc --noEmit`
passes

---

## Phase 2: Foundational (Shared Logic & Services)

**Purpose**: Core calculations and service layer that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 [P] Create `packages/logic/src/budget/budget-period-utils.ts` —
      `getCurrentPeriodBounds()`, `getDaysLeft()`, `getDaysElapsed()`,
      `isWithinPeriod()`, `getWeeklyBuckets()`
- [ ] T006 [P] Create `packages/logic/src/budget/budget-spending.ts` —
      `calculateSpentPercentage()`, `calculateRemaining()`,
      `calculateDailyAverage()`, `getProgressStatus()`
- [ ] T007 Create `packages/logic/src/budget/index.ts` — barrel export for
      budget logic module
- [ ] T008 Create `apps/mobile/services/budget-service.ts` — `createBudget()`,
      `updateBudget()`, `deleteBudget()`, `pauseBudget()`, `resumeBudget()`,
      `getSpendingForBudget()`, `validateBudgetUniqueness()`
- [ ] T009 [P] Create `apps/mobile/components/budget/CircularProgress.tsx` —
      reusable SVG circular progress ring with color-coded thresholds
      (green/amber/red), animated transitions, and inner percentage text
- [ ] T010 [P] Create `apps/mobile/components/budget/PeriodFilterChips.tsx` —
      All/Weekly/Monthly/Custom filter chips with "All" selected by default
- [ ] T011 [P] Create `apps/mobile/components/budget/BudgetEmptyState.tsx` —
      empty state illustration, "Start Budgeting Smarter" heading, description,
      "Create First Budget" CTA button

**Checkpoint**: Foundation ready — logic utilities, CRUD service, and shared UI
components available. `npx tsc --noEmit` passes

---

## Phase 3: User Story 1 — View Budgets Dashboard (Priority: P1) 🎯 MVP

**Goal**: Users see all active budgets at a glance with circular progress rings
showing spending health

**Independent Test**: Navigate to Budgets screen via drawer → verify hero card
(global) and 2-column grid (category) render with accurate spending data

### Implementation for User Story 1

- [ ] T012 [US1] Create `apps/mobile/hooks/useBudgets.ts` — observe all ACTIVE
      budgets via WatermelonDB, compute spending per budget using
      `getSpendingForBudget()`, support period filter state. Include: detect
      period rollover and reset `alert_fired_level` to null; auto-pause custom
      budgets whose `period_end` has passed
- [ ] T013 [P] [US1] Create `apps/mobile/components/budget/BudgetHeroCard.tsx` —
      global budget hero card: large CircularProgress ring, spent vs. limit
      text, percentage, remaining days
- [ ] T014 [P] [US1] Create
      `apps/mobile/components/budget/BudgetCategoryCard.tsx` — category budget
      card: small CircularProgress ring, category name with icon (fallback to
      "[Deleted Category]" if category is null/deleted), spent/limit amounts,
      status indicator (⚠️ Near limit / Over budget!)
- [ ] T015 [US1] Create `apps/mobile/components/budget/BudgetDashboard.tsx` —
      compose BudgetHeroCard + 2-column FlatList grid of BudgetCategoryCards +
      PeriodFilterChips + empty state fallback
- [ ] T016 [US1] Create `apps/mobile/app/budgets.tsx` — budget dashboard route
      page with PageHeader ("Budgets", "+ New Budget" pill button),
      BudgetDashboard component, accessible via drawer

**Checkpoint**: US1 complete — budgets dashboard renders from drawer with hero
card, category grid, filter chips, and empty state

---

## Phase 4: User Story 2 — Create a New Budget (Priority: P1) 🎯 MVP

**Goal**: Users create budgets with name, type, amount, period, and alert
threshold

**Independent Test**: Tap "+ New Budget" → fill form → verify budget appears on
dashboard

### Implementation for User Story 2

- [ ] T017 [P] [US2] Create
      `apps/mobile/components/budget/AlertThresholdSlider.tsx` — slider for
      50-100% threshold range with real-time amber percentage text
- [ ] T018 [P] [US2] Create `apps/mobile/components/budget/DateRangePicker.tsx`
      — custom period calendar modal with start/end date inputs and quick
      presets (2 Weeks, 1 Month, 3 Months, 6 Months)
- [ ] T019 [US2] Create `apps/mobile/components/budget/BudgetForm.tsx` — shared
      create/edit form: name input, type toggle (Global/Category) with info
      tooltip on Global, category picker (conditional), amount input, period
      selector, custom date range picker (conditional), threshold slider,
      validation errors
- [ ] T020 [US2] Create `apps/mobile/app/create-budget.tsx` — form route page,
      receives optional `budgetId` param for edit mode, reuses BudgetForm, calls
      `createBudget()` or `updateBudget()` from service, navigates back on
      success

**Checkpoint**: US2 complete — full budget creation flow works, validation
enforced, budgets appear on dashboard

---

## Phase 5: User Story 3 — View Budget Detail (Priority: P2)

**Goal**: Users see detailed spending breakdown for a specific budget

**Independent Test**: Tap a category budget card → verify detail screen shows
overview, spending trend chart, subcategory breakdown, and last 6 transactions

### Implementation for User Story 3

- [ ] T021 [US3] Create `apps/mobile/hooks/useBudgetDetail.ts` — observe single
      budget + recent transactions + subcategory spending breakdown + weekly
      spending buckets for chart
- [ ] T022 [P] [US3] Create
      `apps/mobile/components/budget/BudgetDetailOverview.tsx` — overview card:
      CircularProgress ring, "spent" vs. "of budget" text, three key stats
      (Remaining, Daily Average, Days Left) with vertical dividers
- [ ] T023 [P] [US3] Create
      `apps/mobile/components/budget/BudgetSpendingTrendChart.tsx` — weekly
      spending bar chart using `react-native-gifted-charts` BarChart, horizontal
      dashed line for weekly average
- [ ] T024 [P] [US3] Create
      `apps/mobile/components/budget/SubcategoryBreakdown.tsx` — ranked
      subcategory list with color-coded dots, amounts, percentages, and thin
      progress bars
- [ ] T025 [P] [US3] Create
      `apps/mobile/components/budget/BudgetRecentTransactions.tsx` — last 6
      matching transactions with category icon, merchant name, timestamp,
      negative amount in red
- [ ] T026 [US3] Create `apps/mobile/app/budget-detail.tsx` — detail route page,
      receives `budgetId` param, composes BudgetDetailOverview +
      BudgetSpendingTrendChart + SubcategoryBreakdown + BudgetRecentTransactions
- [ ] T027 [US3] Wire navigation from `BudgetCategoryCard.tsx` (and
      `BudgetHeroCard.tsx`) tap → `budget-detail` route

**Checkpoint**: US3 complete — tapping any budget card shows full detail screen
with all sections

---

## Phase 6: User Story 4 — Edit an Existing Budget (Priority: P2)

**Goal**: Users modify budget name, amount, period, or threshold

**Independent Test**: Three-dot menu → Edit → change amount → Save → verify
updated on dashboard

### Implementation for User Story 4

- [ ] T028 [US4] Create `apps/mobile/components/budget/BudgetActionsSheet.tsx` —
      modal bottom sheet with three options: "Edit Budget", "Pause Budget" (or
      "Resume Budget"), "Delete Budget", triggered by "⋮" icon on detail screen
      header
- [ ] T029 [US4] Wire "Edit Budget" action → navigate to `create-budget.tsx`
      with `budgetId` param for pre-filled edit mode
- [ ] T030 [US4] Ensure `BudgetForm.tsx` hides type selector (read-only) when in
      edit mode (FR-018)

**Checkpoint**: US4 complete — edit flow works end-to-end, type is immutable

---

## Phase 7: User Story 5 — Pause and Resume a Budget (Priority: P3)

**Goal**: Users temporarily stop budget tracking without deleting

**Independent Test**: Pause a budget → verify grayed out on dashboard, spending
frozen → Resume → verify active, spending resumes

### Implementation for User Story 5

- [ ] T031 [US5] Wire "Pause Budget" action in `BudgetActionsSheet.tsx` → call
      `pauseBudget()` service, update status to PAUSED
- [ ] T032 [US5] Wire "Resume Budget" action (shown when budget is PAUSED) →
      call `resumeBudget()` service, update status to ACTIVE
- [ ] T033 [US5] Update `BudgetCategoryCard.tsx` and `BudgetHeroCard.tsx` — add
      grayed-out visual styling for PAUSED budgets (reduced opacity, "Paused"
      label)
- [ ] T034 [US5] Update `useBudgets.ts` — exclude PAUSED budgets from spending
      calculations, or display them in separate section

**Checkpoint**: US5 complete — pause/resume lifecycle works, paused budgets
visually distinguished

---

## Phase 8: User Story 6 — Delete a Budget (Priority: P3)

**Goal**: Users permanently remove budgets

**Independent Test**: Delete a budget → confirm → verify removed from dashboard

### Implementation for User Story 6

- [ ] T035 [US6] Wire "Delete Budget" action in `BudgetActionsSheet.tsx` → show
      existing `ConfirmationModal` (or equivalent delete confirmation pattern),
      on confirm call `deleteBudget()` service, navigate back to dashboard

**Checkpoint**: US6 complete — delete flow with confirmation works

---

## Phase 9: User Story 7 — Receive Budget Alert Notifications (Priority: P3)

**Goal**: Users get in-app alerts when spending crosses thresholds

**Independent Test**: Create budget with 80% threshold → add transactions until
80% crossed → verify warning modal → cross 100% → verify danger modal

### Implementation for User Story 7

- [ ] T036 [US7] Create `apps/mobile/services/budget-alert-service.ts` —
      `checkBudgetAlerts(transaction)`: find matching budgets, compute spending,
      check if threshold crossed for first time (compare with
      `alert_fired_level`), return alert metadata
- [ ] T037 [US7] Create `apps/mobile/components/budget/BudgetAlertModal.tsx` —
      warning (amber) and danger (red) alert modals: budget name, progress bar,
      "View Budget" and "Got It"/"Dismiss" buttons
- [ ] T038 [US7] Create `apps/mobile/hooks/useBudgetAlert.ts` — manage alert
      modal visibility state and alert data
- [ ] T039 [US7] Integrate alert check into
      `apps/mobile/app/add-transaction.tsx` — after successful
      `createTransaction()`, call `checkBudgetAlerts()`, show `BudgetAlertModal`
      if threshold crossed
- [ ] T040 [US7] Wire "View Budget" button in alert modal → navigate to
      `budget-detail` route

**Checkpoint**: US7 complete — alerts fire correctly on threshold crossing, only
once per crossing per period

---

## Phase 10: User Story 8 — Filter Budgets by Period (Priority: P3)

**Goal**: Users filter dashboard by period type

**Independent Test**: Tap Weekly/Monthly/Custom/All filter chips → verify
filtered results

### Implementation for User Story 8

- [ ] T041 [US8] Wire `PeriodFilterChips` in `BudgetDashboard.tsx` — connect
      filter state to `useBudgets.ts` hook, filter budgets by period type

**Checkpoint**: US8 complete — period filtering works on dashboard

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final polish, dark mode verification, and documentation

- [ ] T042 Verify all budget screens render correctly in dark mode — test
      `BudgetDashboard`, `budget-detail`, `create-budget`, all modals
- [ ] T043 Add micro-animations using `react-native-reanimated` — progress ring
      animation on load, card press feedback, smooth transitions
- [ ] T044 Run `npx tsc --noEmit` — verify zero TypeScript errors across entire
      monorepo
- [ ] T045 Test offline flow — airplane mode → create/edit budget → verify local
      persistence → reconnect → verify sync to Supabase
- [ ] T046 Update `docs/business/business-decisions.md` with budget-related
      business rules
- [ ] T047 Verify custom budget auto-expiry — create a custom budget with past
      `period_end`, confirm it auto-pauses on next load
- [ ] T048 Verify alert deduplication reset — simulate period rollover, confirm
      `alert_fired_level` resets to null and alerts can re-fire
- [ ] T049 Verify deleted category fallback — delete a category linked to a
      budget, confirm card shows "[Deleted Category]" label

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1 Dashboard)**: Depends on Phase 2
- **Phase 4 (US2 Create)**: Depends on Phase 2 (independent of US1 but makes
  more sense after)
- **Phase 5 (US3 Detail)**: Depends on Phase 3 (needs dashboard cards to
  navigate from)
- **Phase 6 (US4 Edit)**: Depends on Phase 4 + Phase 5 (needs form + detail
  screen)
- **Phase 7 (US5 Pause)**: Depends on Phase 6 (needs actions sheet)
- **Phase 8 (US6 Delete)**: Depends on Phase 6 (needs actions sheet)
- **Phase 9 (US7 Alerts)**: Depends on Phase 2 (can start once services exist)
- **Phase 10 (US8 Filter)**: Depends on Phase 3 (needs dashboard)
- **Phase 11 (Polish)**: Depends on all desired stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
    └── Phase 2 (Foundational)
          ├── Phase 3 (US1: Dashboard) ──▶ Phase 5 (US3: Detail)
          │     └── Phase 10 (US8: Filter)    └── Phase 6 (US4: Edit) ──┬── Phase 7 (US5: Pause)
          │                                                              └── Phase 8 (US6: Delete)
          ├── Phase 4 (US2: Create) ─────────────────────────────────────────┘
          └── Phase 9 (US7: Alerts) [can start after Phase 2]
```

### Parallel Opportunities

Within Phase 2 (Foundational):

- T005 + T006 + T009 + T010 + T011 can all run in parallel (different files, no
  dependencies)

Within Phase 3 (US1):

- T013 + T014 can run in parallel (independent card components)

Within Phase 4 (US2):

- T017 + T018 can run in parallel (independent form sub-components)

Within Phase 5 (US3):

- T022 + T023 + T024 + T025 can all run in parallel (independent detail
  sub-components)

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup (schema work; keep `currency` required)
2. Complete Phase 2: Foundational (logic + service + shared components)
3. Complete Phase 3: US1 (dashboard with progress rings)
4. Complete Phase 4: US2 (budget creation form)
5. **STOP and VALIDATE**: Users can create and view budgets
6. Deploy/demo if ready — this is a viable MVP

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Dashboard) + US2 (Create) → MVP! Users can create/view budgets
3. US3 (Detail) + US4 (Edit) → Full management — users can drill into and modify
   budgets
4. US5 (Pause) + US6 (Delete) → Lifecycle complete
5. US7 (Alerts) → Proactive notifications
6. US8 (Filter) → Usability enhancement
7. Polish → Premium finish

---

## Summary

| Metric                 | Value                            |
| ---------------------- | -------------------------------- |
| Total tasks            | 49                               |
| Phase 1 (Setup)        | 4 tasks                          |
| Phase 2 (Foundational) | 7 tasks                          |
| US1 (Dashboard)        | 5 tasks                          |
| US2 (Create)           | 4 tasks                          |
| US3 (Detail)           | 7 tasks                          |
| US4 (Edit)             | 3 tasks                          |
| US5 (Pause)            | 4 tasks                          |
| US6 (Delete)           | 1 task                           |
| US7 (Alerts)           | 5 tasks                          |
| US8 (Filter)           | 1 task                           |
| Polish                 | 8 tasks                          |
| Parallel opportunities | 14 tasks marked [P]              |
| MVP scope              | Phases 1-4 (US1 + US2): 20 tasks |
