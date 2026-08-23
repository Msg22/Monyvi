# Implementation Plan: Budget Management UI & Spending Progress Tracking

**Branch**: `019-budget-management` | **Date**: 2026-03-19 | **Spec**:
[spec.md](file:///e:/Work/My%20Projects/Monyvi/specs/019-budget-management/spec.md)
**Input**: Feature specification from `/specs/019-budget-management/spec.md`

## Summary

Implement a complete budget management feature for Monyvi: a card-based
dashboard with circular progress rings, budget CRUD (create/edit/pause/delete),
a detail screen with spending trend charts and subcategory breakdowns, in-app
alert modals triggered by transaction creation, and period filtering. The
implementation follows offline-first principles using WatermelonDB for local
data and Supabase for sync.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) **Primary Dependencies**:
React Native + Expo (managed), NativeWind v4, WatermelonDB,
react-native-gifted-charts, react-native-svg, react-native-reanimated
**Storage**: WatermelonDB (local) → Supabase PostgreSQL (cloud sync)
**Testing**: Jest + React Native Testing Library (existing `__tests__/`
convention) **Target Platform**: iOS & Android via Expo **Project Type**: Mobile
(monorepo: `packages/db`, `packages/logic`, `apps/mobile`) **Performance
Goals**: Dashboard loads in <2s (SC-002), spending reflects in <1s (SC-003)
**Constraints**: Offline-capable, premium UI (dark/light mode), no new heavy
dependencies **Scale/Scope**: Personal finance app, ~15 components + 3 routes +
3 hooks + 2 services, ~30 new files

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                     | Status  | Notes                                                                             |
| ----------------------------- | ------- | --------------------------------------------------------------------------------- |
| I. Offline-First Data         | ✅ PASS | All reads/writes via WatermelonDB. Spending aggregation is local queries.         |
| II. Documented Business Logic | ✅ PASS | All rules in spec.md. `business-decisions.md` to be updated on completion.        |
| III. Type Safety              | ✅ PASS | Budget types already exist in `@monyvi/db`. All new code strictly typed.          |
| IV. Service-Layer Separation  | ✅ PASS | `budget-service.ts` for DB ops, hooks for subscriptions, components for UI.       |
| V. Premium UI                 | ✅ PASS | Circular progress rings, dark mode, NativeWind, reanimated animations.            |
| VI. Monorepo Boundaries       | ✅ PASS | Model in `packages/db`, service in `apps/mobile/services/`, UI in `apps/mobile/`. |
| VII. Local-First Migrations   | ✅ PASS | SQL migration files in `supabase/migrations/`, then `db:push` + `db:migrate`.     |

**No violations. No Complexity Tracking entries needed.**

## Project Structure

### Documentation (this feature)

```text
specs/019-budget-management/
├── spec.md              # Feature specification (completed)
├── plan.md              # This file
├── research.md          # Phase 0 output (completed)
├── data-model.md        # Phase 1 output (completed)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
# Schema Migration
supabase/migrations/
└── 035_budget_schema_updates.sql          # alert_fired_level column; currency remains required

# Package: @monyvi/db (packages/db/)
packages/db/src/models/base/base-budget.ts  # AUTO-GENERATED — will update via db:migrate
packages/db/src/schema.ts                   # AUTO-GENERATED — will update via db:migrate
packages/db/src/types.ts                    # Verify BudgetType, BudgetPeriod, BudgetStatus types

# Package: @monyvi/logic (packages/logic/)
packages/logic/src/budget/
├── budget-period-utils.ts                  # Period boundary calculations (start/end dates)
├── budget-spending.ts                      # Spending percentage, remaining, daily average
└── index.ts                                # Barrel export

# App: Mobile (apps/mobile/)
apps/mobile/services/
├── budget-service.ts                       # CRUD: create, update, delete, pause, resume
└── budget-alert-service.ts                 # Alert threshold checking after transaction creation

apps/mobile/hooks/
├── useBudgets.ts                           # Observe all budgets + spending aggregation
├── useBudgetDetail.ts                      # Single budget detail with transactions + subcategories
└── useBudgetAlert.ts                       # Alert state management for transaction-triggered alerts

apps/mobile/components/budget/
├── BudgetDashboard.tsx                     # Main dashboard layout (hero + grid)
├── BudgetHeroCard.tsx                      # Global budget hero card with large progress ring
├── BudgetCategoryCard.tsx                  # Category budget card for 2-column grid
├── CircularProgress.tsx                    # Reusable SVG circular progress ring
├── BudgetDetailOverview.tsx                # Detail screen overview card
├── BudgetSpendingTrendChart.tsx            # Weekly spending bar chart (gifted-charts)
├── SubcategoryBreakdown.tsx                # Ranked subcategory list with progress bars
├── BudgetRecentTransactions.tsx            # Last 6 matching transactions
├── BudgetActionsSheet.tsx                  # Three-dot menu bottom sheet (Edit/Pause/Delete)
├── BudgetAlertModal.tsx                    # In-app alert modal (warning/danger)
├── BudgetForm.tsx                          # Create/Edit form (shared)
├── BudgetEmptyState.tsx                    # Empty state illustration + CTA
├── PeriodFilterChips.tsx                   # All/Weekly/Monthly/Custom filter
├── DateRangePicker.tsx                     # Custom period date range picker
└── AlertThresholdSlider.tsx                # Slider for 50-100% threshold

apps/mobile/app/
├── budgets.tsx                             # Budget Dashboard (drawer route, not a tab)
├── budget-detail.tsx                       # Budget detail route
└── create-budget.tsx                       # Create/Edit budget form route

# Tests (optional — not explicitly requested in spec)
apps/mobile/__tests__/services/
├── budget-service.test.ts                  # CRUD operations (deferred)
└── budget-alert-service.test.ts            # Alert threshold logic (deferred)

packages/logic/src/budget/__tests__/
├── budget-period-utils.test.ts             # Period boundary calculations (deferred)
└── budget-spending.test.ts                 # Spending calculations (deferred)
```

**Structure Decision**: Mobile + monorepo pattern (Option 3). Budget logic split
between `packages/logic` (pure calculations) and `apps/mobile/services`
(WatermelonDB operations), following the existing `transaction-service.ts` and
`@monyvi/logic` patterns.

## Implementation Phases

### Phase 1: Schema & Data Layer

1. Create SQL migration `035_budget_schema_updates.sql`:
   - `ALTER TABLE budgets ADD COLUMN alert_fired_level TEXT;`
   - Keep `currency` required; every budget persists one supported currency.
2. Run `npm run db:push` to apply to Supabase
3. Run `npm run db:migrate` to regenerate WatermelonDB schema + types
4. Verify `BaseBudget` model auto-regenerates with new fields
5. Update `Budget.ts` model if needed (add `alertFiredLevel` helper methods)

### Phase 2: Logic Layer (`packages/logic`)

1. Create `packages/logic/src/budget/budget-period-utils.ts`:
   - `getCurrentPeriodBounds(period, periodStart?, periodEnd?)` → `{start, end}`
   - `getDaysLeft(periodEnd)` → number
   - `getDaysElapsed(periodStart)` → number
   - `isWithinPeriod(date, start, end)` → boolean
   - `getWeeklyBuckets(periodStart, periodEnd)` → date ranges for chart
2. Create `packages/logic/src/budget/budget-spending.ts`:
   - `calculateSpentPercentage(spent, limit)` → number
   - `calculateRemaining(spent, limit)` → number
   - `calculateDailyAverage(spent, daysElapsed)` → number
   - `getProgressStatus(percentage, threshold)` → 'normal' | 'warning' |
     'danger'
3. Write unit tests for both modules

### Phase 3: Service Layer (`apps/mobile/services`)

1. Create `budget-service.ts`:
   - `createBudget(data)` → creates budget in WatermelonDB
   - `updateBudget(id, updates)` → updates budget fields
   - `deleteBudget(id)` → soft-delete via `tx.deleted = true`
   - `pauseBudget(id)` → set status to PAUSED
   - `resumeBudget(id)` → set status to ACTIVE
   - `getSpendingForBudget(budget)` → aggregate EXPENSE transactions by
     category + period
   - `validateBudgetUniqueness(type, categoryId?, period)` → check duplicates
     (FR-014)
2. Create `budget-alert-service.ts`:
   - `checkBudgetAlerts(transaction)` → after create, find matching budgets,
     check thresholds
   - `resetAlertLevel(budgetId)` → clear `alert_fired_level` on period reset
3. Write unit tests for both services

### Phase 4: Hooks Layer (`apps/mobile/hooks`)

1. Create `useBudgets.ts`:
   - Observe all ACTIVE budgets via WatermelonDB
   - Compute spending for each budget using service layer
   - Support period filter (All/Weekly/Monthly/Custom)
2. Create `useBudgetDetail.ts`:
   - Observe single budget + related transactions
   - Compute subcategory breakdown
   - Compute weekly spending buckets for chart
3. Create `useBudgetAlert.ts`:
   - Manage alert modal visibility state
   - Integrate with `budget-alert-service.ts`

### Phase 5: UI Components

1. Build foundational components:
   - `CircularProgress.tsx` (SVG-based, color-coded)
   - `PeriodFilterChips.tsx`
   - `BudgetEmptyState.tsx`
2. Build dashboard components:
   - `BudgetHeroCard.tsx`
   - `BudgetCategoryCard.tsx`
   - `BudgetDashboard.tsx` (composition)
3. Build detail components:
   - `BudgetDetailOverview.tsx`
   - `BudgetSpendingTrendChart.tsx`
   - `SubcategoryBreakdown.tsx`
   - `BudgetRecentTransactions.tsx`
4. Build action components:
   - `BudgetActionsSheet.tsx`
   - `BudgetAlertModal.tsx`
5. Build form components:
   - `BudgetForm.tsx` (create + edit, shared)
   - `AlertThresholdSlider.tsx`
   - `DateRangePicker.tsx`

### Phase 6: Routes & Navigation

1. Add `apps/mobile/app/budgets.tsx` route (standalone page, accessed via
   drawer)
2. Add `apps/mobile/app/budget-detail.tsx` route
3. Add `apps/mobile/app/create-budget.tsx` route
4. No drawer changes needed — `AppDrawer.tsx` already has Budgets entry at
   `/budgets`
5. Integrate alert modal trigger into transaction creation flow

### Phase 7: Integration & Alert Wiring

1. Modify `createTransaction()` in `transaction-service.ts`:
   - After successful transaction creation, call `checkBudgetAlerts()`
   - Return alert metadata alongside the transaction
2. Wire alert modal display in `add-transaction.tsx` post-creation callback
3. Test full create-transaction → alert flow

## Verification Plan

### Automated Tests

**Logic layer tests** (pure functions, no mocking needed):

```bash
cd packages/logic && npx jest src/budget/__tests__/ --coverage
```

**Service layer tests** (mock WatermelonDB):

```bash
cd apps/mobile && npx jest __tests__/services/budget-service.test.ts
cd apps/mobile && npx jest __tests__/services/budget-alert-service.test.ts
```

**TypeScript compilation check**:

```bash
npx tsc --noEmit
```

### Manual Verification

> [!IMPORTANT] The following manual tests require the app running on a
> device/emulator. Run `npm run start:android` (or iOS equivalent) before
> testing.

1. **Empty state**: Navigate to Budgets screen (via drawer) with no budgets →
   verify illustration + CTA shown
2. **Create budget**: Tap "+ New Budget" → fill form → verify budget appears on
   dashboard
3. **Global budget**: Create a Global Monthly budget → verify hero card renders
   with progress ring
4. **Category budget**: Create a Category budget → verify it appears in the
   2-column grid
5. **Budget detail**: Tap a category budget card → verify detail screen shows
   overview, chart, subcategories, transactions
6. **Edit budget**: Three-dot menu → Edit → change amount → Save → verify
   updated on dashboard
7. **Pause/Resume**: Three-dot menu → Pause → verify greyed out → Resume →
   verify active
8. **Delete budget**: Three-dot menu → Delete → confirm → verify removed from
   dashboard
9. **Alert trigger**: Create budget at 80% threshold → add transactions until
   80% crossed → verify warning modal
10. **Over budget alert**: Continue adding → cross 100% → verify danger modal
11. **Filter chips**: Tap Weekly/Monthly/Custom/All → verify filtered results
12. **Dark mode**: Toggle dark mode → verify all budget screens render correctly
13. **Offline**: Enable airplane mode → create/edit budget → verify local
    persistence → disable → verify sync
