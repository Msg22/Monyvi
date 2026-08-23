# Phase 1 Data Model: Premium Budget Detail

## Persistence impact

No schema, model, migration, backfill, Supabase, or sync contract changes.
All entities below are immutable read/presentation contracts derived from
current-user-owned WatermelonDB rows.

## Existing inputs

- **Budget**: ID, owner, type, category ID, period, dates, amount, currency,
  lifecycle state, alert threshold, pause intervals, paused timestamp.
- **Transaction**: ID, owner, category ID, type, amount, currency, date,
  counterparty, deletion state.
- **Category**: accessible system/current-user identity, hierarchy, display name,
  and icon metadata.
- **Pause history**: completed intervals plus an optional open pause.

## Pure pace contracts

```ts
type BudgetPaceState = "BELOW" | "ON" | "ABOVE";

interface BudgetPaceInput {
  readonly limit: number;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly now: Date;
  readonly spent: number;
  readonly currencyFractionDigits: number;
}

interface WeeklyBudgetPace {
  readonly start: Date;
  readonly end: Date;
  readonly allowance: number;
}
```

Rules:

- Calendar-day bounds are inclusive and local.
- Elapsed allowance is clamped between zero and the full limit.
- Partial weekly buckets receive allowance proportional to inclusive bucket days.
- Pace equality is evaluated after rounding both amounts to displayed currency
  precision.
- Invalid/non-positive limit or period length produces zero allowance without
  `NaN` or infinity.

## Presentation contracts

```ts
type BudgetDetailLifecycle = "ACTIVE" | "PAUSED" | "EXPIRED";

type BudgetDetailIcon =
  | { readonly kind: "CATEGORY"; readonly iconName: CategoryIconName; readonly iconLibrary: CategoryIconLibrary; readonly tone: "GREEN" | "GOLD" | "RED" | "BLUE" | "VIOLET" | "SLATE" }
  | { readonly kind: "GLOBAL" }
  | { readonly kind: "DELETED_CATEGORY" }
  | { readonly kind: "TRANSACTION_FALLBACK" };

interface BudgetDetailIdentity {
  readonly budgetId: string;
  readonly name: string;
  readonly type: "GLOBAL" | "CATEGORY";
  readonly lifecycle: BudgetDetailLifecycle;
  readonly period: "WEEKLY" | "MONTHLY" | "CUSTOM";
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly icon: BudgetDetailIcon;
  readonly availableLifecycleAction: "PAUSE" | "RESUME" | null;
}

interface BudgetDetailWeek {
  readonly id: string;
  readonly start: Date;
  readonly end: Date;
  readonly actualAmount: number;
  readonly paceAmount: number;
}

interface BudgetDetailBreakdownItem {
  readonly categoryId: string;
  readonly name: string;
  readonly icon: BudgetDetailIcon;
  readonly transactionCount: number;
  readonly amount: number;
  readonly percentage: number;
}

interface BudgetDetailTransactionItem {
  readonly transactionId: string;
  readonly label: string;
  readonly date: Date;
  readonly amount: number;
  readonly currency: string;
  readonly icon: BudgetDetailIcon;
}

interface BudgetDetailReadModel {
  readonly identity: BudgetDetailIdentity;
  readonly metrics: SpendingMetrics;
  readonly daysLeft: number;
  readonly daysElapsed: number;
  readonly paceState: BudgetPaceState | null;
  readonly weeklySpending: readonly BudgetDetailWeek[];
  readonly categoryBreakdown: readonly BudgetDetailBreakdownItem[] | null;
  readonly recentTransactions: readonly BudgetDetailTransactionItem[];
  readonly hasCompletedPauseExclusion: boolean;
}
```

`categoryBreakdown === null` means not applicable for a global budget; an empty
array means applicable but no matching breakdown data.

## Hook state

```ts
type BudgetDetailErrorKey =
  | "budget_detail_load_failed"
  | "budget_detail_refresh_failed";

interface BudgetDetailHookState {
  readonly readModel: BudgetDetailReadModel | null;
  readonly isInitialLoading: boolean;
  readonly isRefreshing: boolean;
  readonly hasValidData: boolean;
  readonly isNotFound: boolean;
  readonly errorKey: BudgetDetailErrorKey | null;
  readonly retry: () => void;
}

type BudgetDetailCommand = "PAUSE" | "RESUME" | "DELETE";
type BudgetDetailCommandResult = "SUCCEEDED" | "FAILED" | "IGNORED";
```

Transitions:

- Resolving user: initial skeleton, no foreign data.
- Signed out/user changed: cancel generations and clear all prior-user data.
- First success: replace read model and mark valid.
- Dependency/focus/day revision: retain current model while refreshing.
- Stale result: ignore.
- Later failure: keep last valid model and expose recoverable error.
- Missing/deleted/inaccessible: friendly not-found state, never foreign data.
- Pending command: disable confirmation and ignore duplicate submission.
- Successful Delete: leave route; historical transactions remain untouched.

## Query and aggregation invariants

- One owned period transaction query and one accessible category query per
  emitted input snapshot or one-shot build.
- Observed input snapshots are reused for in-memory shaping and MUST NOT be
  followed by duplicate recomputation fetches.
- Category budget includes its root and all descendants.
- Pause-filtered transactions drive every metric, week, breakdown, and recent row.
- Completed-pause explanation appears only if a completed interval removed at
  least one otherwise eligible transaction.
- Breakdown items sort by amount descending with stable name/ID tie-breaks.
- Recent items sort newest first and stop at six.
