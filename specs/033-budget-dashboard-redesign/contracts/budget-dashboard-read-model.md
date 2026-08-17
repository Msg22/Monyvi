# Contract: Unified Budget Dashboard Read Model

## Input

```ts
interface BuildBudgetDashboardReadModelInput {
  readonly budgets: readonly BudgetWithMetrics[];
  readonly categoryMap: ReadonlyMap<string, Category>;
  readonly filters: BudgetDashboardFilters;
  readonly now: Date;
  readonly activeLocale: "en" | "ar";
}
```

Budgets originate from current-user owned observation. Categories originate from
accessible scope. Inputs may include persisted ACTIVE/PAUSED and expired custom
records.

## Output

```ts
interface BudgetDashboardReadModel {
  readonly filters: BudgetDashboardFilters;
  readonly items: readonly BudgetDashboardItem[];
  readonly totalCount: number;
  readonly matchingCount: number;
}
```

## Guarantees

- Each result satisfies scope, period, and derived-status predicates.
- Every matching input ID occurs once in `items`.
- Expired custom wins over persisted PAUSED; paused wins over financial health.
- Active contains HEALTHY, NEAR_LIMIT, and OVER_BUDGET only.
- Priority order is EXPIRED, OVER_BUDGET, NEAR_LIMIT, PAUSED, HEALTHY.
- Names sort by approved active-locale collation and stable ID tie-break inside
  each priority.
- Missing category data becomes semantic deleted-category state.
- `showsProgress` is true only for active presentation states.
- Zero-spend budgets remain eligible.
- Inputs and financial metrics are not mutated or recalculated.
- Classification/filtering performs no database query or write.

## Failure behavior

- Metric failure rejects current generation; hook retains last valid model.
- Missing historical category does not reject dashboard.
- Stale results are rejected by hook generation ownership, not service cache.

## Compatibility change

Remove `overallBudgets`, `needsAttentionBudgets`, `categoryBudgets`, and
`pausedBudgets`. Consumers migrate to one `items` array in same change.
