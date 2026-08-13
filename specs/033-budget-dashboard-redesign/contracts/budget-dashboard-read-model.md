# Contract: Budget Dashboard Read Model

## Purpose

Define the deterministic boundary between user-scoped budget/category inputs and
the four dashboard sections. This is an internal mobile service contract, not an
HTTP API.

## Input

```ts
interface BuildBudgetDashboardReadModelInput {
  readonly budgets: readonly BudgetWithMetrics[];
  readonly categoryMap: ReadonlyMap<string, Category>;
  readonly filter: PeriodFilter;
  readonly now: Date;
  readonly activeLocale: "en" | "ar";
}
```

Preconditions:

- budgets originated from the current user's `queryOwned` observation;
- categories came from the current user's accessible category scope;
- spending metrics were calculated by existing budget financial helpers;
- inputs may contain ACTIVE or PAUSED budgets and expired custom budgets.

## Output

```ts
interface BudgetDashboardReadModel {
  readonly overallBudgets: readonly BudgetDashboardItem[];
  readonly needsAttentionBudgets: readonly BudgetDashboardItem[];
  readonly categoryBudgets: readonly BudgetDashboardItem[];
  readonly pausedBudgets: readonly BudgetDashboardItem[];
  readonly totalCount: number;
  readonly matchingCount: number;
}
```

## Guarantees

- Every period-matching budget occurs exactly once across the four arrays.
- Expired custom wins over persisted PAUSED.
- Non-expired PAUSED wins over financial status.
- Warning and danger budgets of either scope belong to Needs attention.
- Only healthy active global budgets belong to Overall.
- Only healthy active category budgets belong to Category budgets.
- Every section sorts trimmed display names with
  `Intl.Collator(activeLocale, { sensitivity: "base", numeric: true, usage: "sort" })`,
  then budget ID by code point when names collate equally.
- Missing categories become a semantic deleted-category label state.
- Zero-spend budgets remain eligible.
- No dashboard query or write occurs during classification.
- Input objects are not mutated.
- Financial metrics are not recalculated or modified.
- Every global item supplies `period`, `currency`, `metrics.spent`,
  `metrics.limit`, `metrics.percentage`, `metrics.remaining`, and remaining-time
  data for visible and accessible card output.

## Failure behavior

- Metric calculation failures reject the computation; the hook retains the prior
  valid read model.
- Missing category presentation data does not reject the whole dashboard.
- Invalid impossible domain combinations fail fast in development/tests and emit
  a safe fallback in production only where an existing boundary requires it.

## Compatibility change

The old `globalBudget` singular field and overlapping `categoryBudgets` /
`pausedBudgets` semantics are removed. All consumers and tests must migrate in
the same change.
