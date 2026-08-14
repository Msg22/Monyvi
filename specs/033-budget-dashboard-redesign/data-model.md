# Phase 1 Data Model: Unified Budgets Dashboard

## Persistence impact

No database schema, model, migration, backfill, sync payload, or Supabase change
is permitted. `EXPIRED` remains derived and is not added to persisted
`BudgetStatus`.

## Existing persisted inputs

Budget fields remain unchanged: ID, user ownership, optional name, scope
(`GLOBAL`/`CATEGORY`), period (`WEEKLY`/`MONTHLY`/`CUSTOM`), persisted status
(`ACTIVE`/`PAUSED`), amount, currency, category ID, period dates, pause state,
and deletion metadata.

Existing invariants remain:

- GLOBAL has no category; CATEGORY has accessible category at creation.
- CUSTOM has start and end dates.
- Category spending includes descendants.
- Pause windows are excluded from spending.
- User-owned reads and commands remain current-user scoped.

Accessible category input is one read-only map. Missing historical reference
becomes semantic deleted-category label; rows never query or import services.

## Derived contracts

```ts
type BudgetDashboardScopeFilter = "ALL" | "CATEGORY" | "GLOBAL";
type BudgetDashboardPeriodFilter = "ALL" | "WEEKLY" | "MONTHLY" | "CUSTOM";
type BudgetDashboardStatusFilter = "ALL" | "ACTIVE" | "PAUSED" | "EXPIRED";

interface BudgetDashboardFilters {
  readonly scope: BudgetDashboardScopeFilter;
  readonly period: BudgetDashboardPeriodFilter;
  readonly status: BudgetDashboardStatusFilter;
}

const DEFAULT_BUDGET_DASHBOARD_FILTERS = {
  scope: "ALL",
  period: "ALL",
  status: "ACTIVE",
} as const;

type BudgetDashboardPresentationState =
  | "HEALTHY"
  | "NEAR_LIMIT"
  | "OVER_BUDGET"
  | "PAUSED"
  | "EXPIRED";

type CategoryLabelState =
  | { readonly kind: "not-applicable" }
  | {
      readonly kind: "resolved";
      readonly categoryId: string;
      readonly name: string;
    }
  | { readonly kind: "deleted"; readonly categoryId: string };

interface BudgetDashboardItem {
  readonly id: string;
  readonly displayName: string;
  readonly scope: BudgetType;
  readonly period: BudgetPeriod;
  readonly currency: string;
  readonly presentationState: BudgetDashboardPresentationState;
  readonly metrics: SpendingMetrics;
  readonly expiresAt: Date | null;
  readonly daysLeft: number;
  readonly categoryLabel: CategoryLabelState;
  readonly availableAction: "RESUME" | "RENEW" | null;
  readonly showsProgress: boolean;
}

interface BudgetDashboardReadModel {
  readonly filters: BudgetDashboardFilters;
  readonly items: readonly BudgetDashboardItem[];
  readonly matchingCount: number;
  readonly totalCount: number;
}
```

## State derivation

Use one supplied clock value per build.

| Expired custom | Persisted status | Metric status | Presentation | Status membership | Action | Progress |
| -------------- | ---------------- | ------------- | ------------ | ----------------- | ------ | -------- |
| yes            | ACTIVE or PAUSED | any           | EXPIRED      | EXPIRED, ALL      | RENEW  | hidden   |
| no             | PAUSED           | any           | PAUSED       | PAUSED, ALL       | RESUME | hidden   |
| no             | ACTIVE           | danger        | OVER_BUDGET  | ACTIVE, ALL       | none   | shown    |
| no             | ACTIVE           | warning       | NEAR_LIMIT   | ACTIVE, ALL       | none   | shown    |
| no             | ACTIVE           | safe          | HEALTHY      | ACTIVE, ALL       | none   | shown    |

`showsProgress` is true only for active presentation states. UI does not infer
this from label strings.

## Filter predicates

- Scope `ALL` accepts both scopes; others require exact scope.
- Period `ALL` accepts every period; others require exact period.
- Status `ALL` accepts every presentation state.
- Status `ACTIVE` accepts HEALTHY, NEAR_LIMIT, OVER_BUDGET.
- Status `PAUSED` accepts PAUSED only.
- Status `EXPIRED` accepts EXPIRED only.
- Item is included only when all three predicates return true.

## Ordering

Priority ranks:

1. EXPIRED
2. OVER_BUDGET
3. NEAR_LIMIT
4. PAUSED
5. HEALTHY

Only ranks present after filtering participate. Within rank, compare trimmed
display names with
`Intl.Collator(activeLocale, { sensitivity: "base", numeric: true, usage: "sort" })`,
then stable budget ID by code point. Metrics and timestamps never break ties.

## Naming and category history

Display identity resolution:

1. nonblank custom budget name;
2. resolved category name for category budget;
3. translated global fallback key;
4. translated deleted-category fallback key.

DTO emits semantic label state where translation belongs to UI. Missing category
does not reject dashboard or detail aggregation.

## Session state

```ts
interface BudgetDashboardFilterSession {
  readonly read: () => BudgetDashboardFilters;
  readonly write: (filters: BudgetDashboardFilters) => void;
  readonly reset: () => BudgetDashboardFilters;
}

interface BudgetDashboardHookState {
  readonly readModel: BudgetDashboardReadModel;
  readonly filters: BudgetDashboardFilters;
  readonly isInitialLoading: boolean;
  readonly isRefreshing: boolean;
  readonly errorKey: string | null;
  readonly hasValidData: boolean;
  readonly setScopeFilter: (value: BudgetDashboardScopeFilter) => void;
  readonly setPeriodFilter: (value: BudgetDashboardPeriodFilter) => void;
  readonly setStatusFilter: (value: BudgetDashboardStatusFilter) => void;
  readonly resetFilters: () => void;
  readonly refresh: () => void;
}
```

Session storage is memory-only and bound to current authenticated user. Fresh JS
runtime or user change initializes defaults. It stores no user financial data
and performs no persistence or sync.

Hook transitions:

- resolving/signed out: empty scoped state, no foreign data;
- first success: replace read model and mark valid;
- selection change: write session state and start new generation;
- stale generation completion: ignore;
- later success: atomically replace rows;
- later failure: retain last valid rows and current filters;
- reset: restore defaults and start new generation;
- user change: invalidate outstanding work, clear prior rows, reset filters;
- unmount: invalidate outstanding work while keeping same-user session filters.

## Layout and action state

Layout model contains only flat list items; no section heading, page, card
count, carousel offset, or dot state remains.

Resume confirmation and action state remain separate. Renew carries
`renewFrom: string` and performs no write until Create submission. Stable item
ID drives detail navigation and lifecycle actions.
