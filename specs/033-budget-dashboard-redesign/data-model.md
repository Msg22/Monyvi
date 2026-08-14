# Phase 1 Data Model: Premium Budgets Dashboard

## Persistence impact

No database schema, model, migration, sync payload, or Supabase change is
permitted. The feature consumes existing `Budget`, `Category`, `Transaction`,
and pause-interval records. `EXPIRED` is not a persisted budget status.

## Existing persisted inputs

### Budget

Relevant existing fields:

- `id: string`
- `userId: string`
- `name: string | null`
- `type: "GLOBAL" | "CATEGORY"`
- `period: "WEEKLY" | "MONTHLY" | "CUSTOM"`
- `status: "ACTIVE" | "PAUSED"`
- `amount: number`
- `currency: string`
- `categoryId: string | null`
- `periodStart: Date`
- `periodEnd: Date`
- `pausedAt: Date | null`
- `pauseIntervals`
- `deleted: boolean`
- `userId` ownership scope

Validation invariants remain unchanged:

- GLOBAL requires no category.
- CATEGORY requires a valid accessible category at creation time.
- CUSTOM requires start and end dates.
- Spending includes category descendants and excludes pause windows.
- User-facing reads and commands remain current-user scoped.

### Category lookup input

The authenticated Categories provider supplies one accessible
`ReadonlyMap<string, Category>`, including system categories and the current
user's non-deleted categories. A missing referenced category becomes an explicit
`"deleted"` label state; cards do not access context or the database.

## Derived read-model types

These are illustrative contracts; final TypeScript interfaces should preserve
these semantics and readonly fields.

```ts
type BudgetDashboardPeriodFilter = "ALL" | "WEEKLY" | "MONTHLY" | "CUSTOM";

type BudgetDashboardLifecycle =
  | "HEALTHY"
  | "NEAR_LIMIT"
  | "OVER_BUDGET"
  | "PAUSED"
  | "EXPIRED";

type BudgetDashboardSectionId =
  | "OVERALL"
  | "NEEDS_ATTENTION"
  | "CATEGORY"
  | "PAUSED";

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
  readonly period: BudgetPeriod;
  readonly currency: string;
  readonly scope: BudgetType;
  readonly lifecycle: BudgetDashboardLifecycle;
  readonly sectionId: BudgetDashboardSectionId;
  readonly metrics: SpendingMetrics;
  readonly daysLeft: number;
  readonly daysElapsed: number;
  readonly expiresAt: Date | null;
  readonly categoryLabel: CategoryLabelState;
  readonly availableAction: "RESUME" | "RENEW" | null;
}

interface BudgetDashboardReadModel {
  readonly filter: BudgetDashboardPeriodFilter;
  readonly overallBudgets: readonly BudgetDashboardItem[];
  readonly needsAttentionBudgets: readonly BudgetDashboardItem[];
  readonly categoryBudgets: readonly BudgetDashboardItem[];
  readonly pausedBudgets: readonly BudgetDashboardItem[];
  readonly matchingCount: number;
  readonly totalCount: number;
}
```

The read model does not expose WatermelonDB models to cards. Presentational
components receive scalar, already-localized-or-translatable values and
callbacks; commands and navigation use the stable item ID.

## Lifecycle derivation

### Expiry

A budget is expired when all are true:

- period is CUSTOM;
- `periodEnd` is present;
- the approved date-boundary helper says the end has passed at the supplied
  clock.

The classifier receives an injected `now` or date helper in tests. It must not
call `new Date()` in multiple branches and produce boundary disagreement.

### Spending health

Use existing `SpendingMetrics.status`:

- `safe` -> HEALTHY;
- `warning` -> NEAR_LIMIT;
- `danger` -> OVER_BUDGET.

Do not recalculate thresholds in dashboard code.

### Exclusive state transition table

| Derived expiry | Persisted status | Metric status   | Section         | Lifecycle   | Action |
| -------------- | ---------------- | --------------- | --------------- | ----------- | ------ |
| yes            | ACTIVE or PAUSED | any             | NEEDS_ATTENTION | EXPIRED     | RENEW  |
| no             | PAUSED           | any             | PAUSED          | PAUSED      | RESUME |
| no             | ACTIVE           | warning         | NEEDS_ATTENTION | NEAR_LIMIT  | none   |
| no             | ACTIVE           | danger          | NEEDS_ATTENTION | OVER_BUDGET | none   |
| no             | ACTIVE           | safe + GLOBAL   | OVERALL         | HEALTHY     | none   |
| no             | ACTIVE           | safe + CATEGORY | CATEGORY        | HEALTHY     | none   |

Each input ID must occur in exactly one output array.

## Naming and stable ordering

`displayName` selection:

1. nonblank custom budget name;
2. resolved category name for category budgets;
3. translated global fallback at the presentation boundary;
4. translated deleted-category fallback for missing historical categories.

The builder receives `activeLocale: "en" | "ar"`. Within each section it
compares trimmed `displayName` values with
`Intl.Collator(activeLocale, { sensitivity: "base", numeric: true, usage: "sort" })`.
When collation returns zero, it compares stable budget IDs by code point. Spend
metrics, remaining amount, creation time, and current page never participate. A
locale change may produce the locale-appropriate order; spend-only changes
within one locale cannot.

If translation is needed for a fallback, the DTO should emit a stable semantic
label key rather than call `t` inside the service.

Each global card visibly renders `period`, `metrics.spent`, `metrics.limit`,
`metrics.percentage`, `metrics.remaining`, and `daysLeft`/custom expiry as
remaining time. Currency formatting uses `currency` at the presentation
boundary; the same field set is included in the accessible description.

## Layout-only data

Layout data is not part of the business read model.

```ts
interface GlobalCarouselLayout {
  readonly containerWidth: number;
  readonly minimumCardWidth: 320;
  readonly gap: 16;
  readonly visibleCardCount: number;
  readonly cardWidth: number;
  readonly pageCount: number;
}

interface GlobalBudgetPage {
  readonly key: string;
  readonly budgets: readonly BudgetDashboardItem[];
}

type DashboardLayoutRow =
  | {
      readonly kind: "section-heading";
      readonly sectionId: BudgetDashboardSectionId;
    }
  | {
      readonly kind: "compact-budget";
      readonly variant: "attention" | "category" | "paused";
      readonly position: "first" | "middle" | "last" | "only";
      readonly budget: BudgetDashboardItem;
    };
```

Rules:

- `GLOBAL_BUDGET_MIN_CARD_WIDTH = 320` dp.
- `GLOBAL_BUDGET_CARD_GAP = 16` dp.
- `visibleCardCount >= 1` and is the maximum whole count whose calculated cards
  remain at least 320 dp wide after 16 dp gaps.
- If `containerWidth < 320`, use one card with `cardWidth = containerWidth`;
  never crop or introduce horizontal overflow.
- `cardWidth` is equal for every card in one viewport.
- `pageCount = ceil(overallBudgets.length / visibleCardCount)`.
- Dots are visible only when `pageCount > 1`.
- A final page may contain fewer cards but must not stretch them wider than
  other pages.
- Needs attention, Category budgets, and Paused use full-width compact rows in
  service order; section position controls shared borders and separators.
- Regrouping selects the page containing the prior first-visible eligible ID,
  else 0.

## Hook state

```ts
interface BudgetDashboardHookState {
  readonly readModel: BudgetDashboardReadModel;
  readonly selectedFilter: BudgetDashboardPeriodFilter;
  readonly isInitialLoading: boolean;
  readonly isRefreshing: boolean;
  readonly errorKey: string | null;
  readonly hasValidData: boolean;
  readonly refresh: () => void;
  readonly setSelectedFilter: (filter: BudgetDashboardPeriodFilter) => void;
}
```

State transitions:

- resolving/signed out -> empty scoped state; no foreign data;
- first successful computation -> replace read model and set `hasValidData`;
- later success -> atomically replace read model;
- later failure -> retain last valid model, expose recovery state;
- stale async completion after user/filter/observation change -> ignored;
- unmount -> cancel/ignore outstanding completion.

## Action state

Resume uses two deliberately separate UI states:

```ts
interface ResumeConfirmationState {
  readonly budgetId: string | null;
  readonly isVisible: boolean;
}

interface BudgetDashboardActionState {
  readonly isSubmitting: boolean;
  readonly errorKey: string | null;
  readonly confirmResume: (budgetId: string) => Promise<void>;
  readonly resetError: () => void;
}
```

The route owns `ResumeConfirmationState`. `useBudgetDashboardActions` owns only
async command state. Transitions:

- tap Resume -> route selects budget and opens confirmation;
- cancel -> route closes, no command;
- confirm -> route passes the selected ID once; hook blocks another submit in
  flight;
- success -> route closes and waits for observation;
- failure -> hook stops loading, retains prior card, exposes friendly error,
  permits retry;
- second/non-paused service call -> existing command rejects and appends no
  interval.

Renew navigation carries `renewFrom: string`; it performs no write. Child #225
creates a separate budget only after the user submits the prefilled form.
