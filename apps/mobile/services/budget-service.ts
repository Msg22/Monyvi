/**
 * Budget Service
 *
 * CRUD operations and spending calculations for the Budget entity.
 * Uses WatermelonDB for local-first persistence with Supabase sync.
 *
 * @module budget-service
 */

import {
  Budget,
  database,
  Transaction,
  Category,
  type BudgetPeriod,
  type BudgetType,
  type CurrencyType,
  type AlertFiredLevel,
} from "@monyvi/db";
import { Q, type Collection } from "@nozbe/watermelondb";
import {
  getCurrentPeriodBounds,
  isPeriodExpired,
  filterExcludedTransactions,
  buildPauseInterval,
  parsePauseIntervals,
  parsePausedAtMs,
  hasMatchingBudgetCurrency,
} from "@monyvi/logic";
import {
  getCurrentUserDataScope,
  type CurrentUserDataScope,
} from "@/services/user-data-access";

// =============================================================================
// TYPES
// =============================================================================

export interface CreateBudgetInput {
  readonly name: string;
  readonly type: BudgetType;
  readonly categoryId?: string;
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly period: BudgetPeriod;
  readonly periodStart?: Date;
  readonly periodEnd?: Date;
  readonly alertThreshold: number;
}

export interface UpdateBudgetInput {
  readonly name?: string;
  readonly amount?: number;
  readonly period?: BudgetPeriod;
  readonly periodStart?: Date;
  readonly periodEnd?: Date;
  readonly alertThreshold?: number;
  readonly categoryId?: string;
}

export const BUDGET_SERVICE_ERROR_CODES = {
  NOT_FOUND: "BUDGET_NOT_FOUND",
} as const;

export type BudgetServiceErrorCode =
  (typeof BUDGET_SERVICE_ERROR_CODES)[keyof typeof BUDGET_SERVICE_ERROR_CODES];

export class BudgetServiceError extends Error {
  constructor(readonly code: BudgetServiceErrorCode) {
    super(code);
    this.name = "BudgetServiceError";
  }
}

// =============================================================================
// COLLECTIONS
// =============================================================================

function budgetsCollection(): Collection<Budget> {
  return database.get<Budget>("budgets");
}

function isExpiredCustomBudgetEligibleForPause(budget: Budget): boolean {
  return (
    !budget.deleted &&
    budget.status === "ACTIVE" &&
    budget.period === "CUSTOM" &&
    isPeriodExpired(budget.periodEnd)
  );
}

function transactionsCollection(): Collection<Transaction> {
  return database.get<Transaction>("transactions");
}

function categoriesCollection(): Collection<Category> {
  return database.get<Category>("categories");
}

async function getOwnedBudget(
  budgetId: string,
  scope: CurrentUserDataScope
): Promise<Budget> {
  const budgets = await scope
    .queryOwned(budgetsCollection(), Q.where("id", budgetId))
    .fetch();

  const budget = budgets[0];
  if (!budget) {
    throw new BudgetServiceError(BUDGET_SERVICE_ERROR_CODES.NOT_FOUND);
  }

  return budget;
}

async function resolveCategoryBudgetCategoryId(
  categoryId: string | undefined,
  scope: CurrentUserDataScope
): Promise<string> {
  if (!categoryId) {
    throw new Error("Category budgets require a categoryId");
  }

  const category = await scope.findAccessibleCategory(
    categoriesCollection(),
    categoryId
  );
  return category.id;
}

export async function getBudgetById(budgetId: string): Promise<Budget> {
  const scope = await getCurrentUserDataScope();
  return getOwnedBudget(budgetId, scope);
}

export async function getRenewableBudgetById(
  budgetId: string
): Promise<Budget> {
  const scope = await getCurrentUserDataScope();
  const budget = await getOwnedBudget(budgetId, scope);

  if (
    budget.deleted ||
    budget.period !== "CUSTOM" ||
    !isPeriodExpired(budget.periodEnd)
  ) {
    throw new BudgetServiceError(BUDGET_SERVICE_ERROR_CODES.NOT_FOUND);
  }

  return budget;
}

// =============================================================================
// CREATE
// =============================================================================

/**
 * Create a new budget with validation.
 *
 * @throws Error if user is not authenticated
 * @throws Error if validation fails (uniqueness, required fields)
 */
export async function createBudget(input: CreateBudgetInput): Promise<Budget> {
  const scope = await getCurrentUserDataScope();

  // Type-specific validation
  if (input.type === "CATEGORY" && !input.categoryId) {
    throw new Error("Category budgets require a categoryId");
  }
  if (input.period === "CUSTOM" && (!input.periodStart || !input.periodEnd)) {
    throw new Error(
      "Custom period budgets require both periodStart and periodEnd"
    );
  }

  // F7 fix: Validate uniqueness inside database.write for atomicity
  return database.write(async () => {
    const categoryId =
      input.type === "CATEGORY"
        ? await resolveCategoryBudgetCategoryId(input.categoryId, scope)
        : undefined;

    await validateBudgetUniqueness(input.type, input.period, {
      categoryId,
      candidatePeriodEnd: input.periodEnd,
      scope,
    });

    const budget = await budgetsCollection().create((b) => {
      b.userId = scope.userId;
      b.name = input.name;
      b.type = input.type;
      b.categoryId = categoryId;
      b.amount = input.amount;
      b.currency = input.currency;
      b.period = input.period;
      b.periodStart = input.periodStart ?? undefined;
      b.periodEnd = input.periodEnd ?? undefined;
      b.alertThreshold = input.alertThreshold;
      b.status = "ACTIVE";
      b.deleted = false;
    });
    return budget;
  });
}

// =============================================================================
// UPDATE
// =============================================================================

/**
 * Update an existing budget. Type (GLOBAL/CATEGORY) is immutable.
 */
export async function updateBudget(
  budgetId: string,
  input: UpdateBudgetInput
): Promise<Budget> {
  const scope = await getCurrentUserDataScope();
  const budget = await getOwnedBudget(budgetId, scope);

  // Type-specific validation for period changes (C1 fix: correct operator precedence)
  const effectivePeriod = input.period ?? budget.period;
  if (
    effectivePeriod === "CUSTOM" &&
    (!(input.periodStart ?? budget.periodStart) ||
      !(input.periodEnd ?? budget.periodEnd))
  ) {
    throw new Error(
      "Custom period budgets require both periodStart and periodEnd"
    );
  }

  // F6 fix: Prevent clearing categoryId on CATEGORY budgets
  if (budget.type === "CATEGORY" && input.categoryId === "") {
    throw new Error("Category budgets require a categoryId");
  }

  // F7 fix: Validate uniqueness and apply update inside the same write for atomicity
  return database.write(async () => {
    const categoryId =
      budget.type === "CATEGORY"
        ? await resolveCategoryBudgetCategoryId(
            input.categoryId ?? budget.categoryId,
            scope
          )
        : undefined;

    // Re-validate uniqueness if period or categoryId changed (C2 fix)
    if (input.period !== undefined || input.categoryId !== undefined) {
      await validateBudgetUniqueness(
        budget.type,
        input.period ?? budget.period,
        {
          categoryId,
          excludeBudgetId: budgetId,
          candidatePeriodEnd: input.periodEnd ?? budget.periodEnd,
          scope,
        }
      );
    }

    await budget.update((b) => {
      if (input.name !== undefined) b.name = input.name;
      if (input.amount !== undefined) b.amount = input.amount;
      if (input.period !== undefined) b.period = input.period;
      if (input.periodStart !== undefined) b.periodStart = input.periodStart;
      if (input.periodEnd !== undefined) b.periodEnd = input.periodEnd;
      if (input.alertThreshold !== undefined)
        b.alertThreshold = input.alertThreshold;
      if (input.categoryId !== undefined) b.categoryId = categoryId;
    });
    return budget;
  });
}

// =============================================================================
// DELETE (soft-delete via deleted = true)
// =============================================================================

/**
 * Soft-delete a budget by setting `deleted = true`.
 * Consistent with the existing project pattern (transaction-service, edit-account-service).
 */
export async function deleteBudget(budgetId: string): Promise<void> {
  const scope = await getCurrentUserDataScope();
  const budget = await getOwnedBudget(budgetId, scope);

  await database.write(async () => {
    await budget.update((b) => {
      b.deleted = true;
    });
  });
}

// =============================================================================
// PAUSE / RESUME
// =============================================================================

/**
 * Pause a budget — spending is frozen at this moment.
 * Records `paused_at` timestamp for interval tracking.
 */
export async function pauseBudget(budgetId: string): Promise<void> {
  const scope = await getCurrentUserDataScope();
  const budget = await getOwnedBudget(budgetId, scope);

  // M2 fix: Guard against pausing an already-paused budget
  if (budget.status === "PAUSED") {
    throw new Error("Budget is already paused");
  }

  await database.write(async () => {
    await budget.update((b) => {
      b.status = "PAUSED";
      b.pausedAt = new Date().toISOString();
    });
  });
}

/**
 * Resume a paused budget.
 * Pushes the completed pause interval {from: paused_at, to: now}
 * into `pause_intervals` and clears `paused_at`.
 */
export async function resumeBudget(budgetId: string): Promise<void> {
  const scope = await getCurrentUserDataScope();
  const budget = await getOwnedBudget(budgetId, scope);

  // M3 fix: Guard against resuming a non-paused budget
  if (budget.status !== "PAUSED") {
    throw new Error("Cannot resume a budget that is not paused");
  }
  if (budget.period === "CUSTOM" && isPeriodExpired(budget.periodEnd)) {
    throw new Error("Cannot resume an expired budget");
  }

  const pausedAtMs = parsePausedAtMs(budget.pausedAt);
  const nowMs = Date.now();

  await database.write(async () => {
    await budget.update((b) => {
      b.status = "ACTIVE";

      // Build and append the completed pause interval
      if (pausedAtMs !== undefined) {
        const currentIntervals = parsePauseIntervals(
          String(b.pauseIntervals ?? "[]")
        );
        const newInterval = buildPauseInterval(pausedAtMs, nowMs);
        b.pauseIntervals = JSON.stringify([...currentIntervals, newInterval]);
      }

      b.pausedAt = undefined;
    });
  });
}

// =============================================================================
// ALERT LEVEL
// =============================================================================

/**
 * Update the alert fired level for a budget.
 * Used to track which threshold has been shown to prevent duplicate alerts.
 */
export async function setAlertFiredLevel(
  budgetId: string,
  level: AlertFiredLevel
): Promise<void> {
  const scope = await getCurrentUserDataScope();
  const budget = await getOwnedBudget(budgetId, scope);

  await database.write(async () => {
    await budget.update((b) => {
      b.alertFiredLevel = level;
    });
  });
}

/**
 * Reset the alert fired level (on period rollover).
 */
export async function resetAlertFiredLevel(budgetId: string): Promise<void> {
  const scope = await getCurrentUserDataScope();
  const budget = await getOwnedBudget(budgetId, scope);

  await database.write(async () => {
    await budget.update((b) => {
      b.alertFiredLevel = undefined;
    });
  });
}

/**
 * Auto-pause a custom budget whose period has expired.
 */
export async function autoPauseBudget(budgetId: string): Promise<void> {
  const scope = await getCurrentUserDataScope();
  const budget = await getOwnedBudget(budgetId, scope);
  if (budget.status !== "ACTIVE") return;

  await database.write(async () => {
    await budget.update((b) => {
      b.status = "PAUSED";
      b.pausedAt = new Date().toISOString();
    });
  });
}

/**
 * Pause all active custom budgets whose period has expired.
 *
 * This is an explicit lifecycle command. Hooks/read models should call this
 * from a clear orchestration point instead of mutating while computing reads.
 */
export async function pauseExpiredCustomBudgets(): Promise<number> {
  const scope = await getCurrentUserDataScope();
  const candidates = await scope
    .queryOwned(
      budgetsCollection(),
      Q.where("deleted", false),
      Q.where("status", "ACTIVE"),
      Q.where("period", "CUSTOM")
    )
    .fetch();

  const expiredBudgets = candidates.filter((budget) =>
    isPeriodExpired(budget.periodEnd)
  );

  if (expiredBudgets.length === 0) {
    return 0;
  }

  let pausedCount = 0;

  await database.write(async () => {
    const pausedAt = new Date().toISOString();
    for (const budget of expiredBudgets) {
      if (!isExpiredCustomBudgetEligibleForPause(budget)) continue;

      await budget.update((b) => {
        b.status = "PAUSED";
        b.pausedAt = b.pausedAt ?? pausedAt;
      });
      pausedCount += 1;
    }
  });

  return pausedCount;
}

// =============================================================================
// SPENDING AGGREGATION
// =============================================================================

/**
 * Get total EXPENSE spending for a budget within its current period.
 *
 * - Global budgets: sum all EXPENSE transactions in the period
 * - Category budgets: sum EXPENSE transactions matching the budget's category
 *   AND its subcategories (L2 + L3)
 *
 * @returns Total spent amount
 */
export async function getSpendingForBudget(budget: Budget): Promise<number> {
  const scope = await getCurrentUserDataScope();
  scope.assertOwned(budget);

  const bounds = getCurrentPeriodBounds(
    budget.period,
    budget.periodStart,
    budget.periodEnd
  );

  const baseConditions = [
    Q.where("deleted", false),
    Q.where("type", "EXPENSE"),
    Q.where("date", Q.gte(bounds.start.getTime())),
    Q.where("date", Q.lte(bounds.end.getTime())),
  ];

  let transactions: Transaction[];

  if (budget.isGlobal) {
    // Global budget: all expenses in the period
    transactions = await scope
      .queryOwned(transactionsCollection(), Q.and(...baseConditions))
      .fetch();
  } else {
    // Category budget: need to include subcategories
    // Deleted category rows are unavailable for hierarchy expansion, but the
    // owned budget's persisted category ID still identifies historical spend.
    const categoryIds = budget.categoryId
      ? ((await getAccessibleCategoryHierarchyIds(
          budget.categoryId,
          scope
        )) ?? [budget.categoryId])
      : [];

    transactions = await scope
      .queryOwned(
        transactionsCollection(),
        Q.and(...baseConditions, Q.where("category_id", Q.oneOf(categoryIds)))
      )
      .fetch();
  }

  // Exclude transactions that fall within any pause interval
  const pauseIntervals = parsePauseIntervals(
    String(budget.pauseIntervals ?? "[]")
  );
  const pausedAtMs = parsePausedAtMs(budget.pausedAt);
  const filtered = filterExcludedTransactions(
    transactions,
    pauseIntervals,
    pausedAtMs
  ).filter((transaction) =>
    hasMatchingBudgetCurrency(transaction.currency, budget.currency)
  );

  return filtered.reduce((sum, tx) => sum + tx.amount, 0);
}

/**
 * Get a category ID and all its subcategory IDs (L2 + L3).
 * Used for category budget spending aggregation (FR-015).
 */
export async function getCategoryAndSubcategoryIds(
  categoryId: string | undefined,
  scope?: CurrentUserDataScope
): Promise<string[]> {
  if (!categoryId) return [];

  const currentScope = scope ?? (await getCurrentUserDataScope());
  const hierarchyIds = await getAccessibleCategoryHierarchyIds(
    categoryId,
    currentScope
  );
  if (hierarchyIds) return hierarchyIds;

  await currentScope.findAccessibleCategory(categoriesCollection(), categoryId);
  return [categoryId];
}

async function getAccessibleCategoryHierarchyIds(
  categoryId: string,
  scope: CurrentUserDataScope
): Promise<string[] | null> {
  const roots = await scope
    .queryAccessibleCategories(
      categoriesCollection(),
      Q.where("id", categoryId),
      Q.where("deleted", false)
    )
    .fetch();

  // Descendants may remain accessible after a historical root is deleted.
  const children = await scope
    .queryAccessibleCategories(
      categoriesCollection(),
      Q.where("parent_id", categoryId),
      Q.where("deleted", false)
    )
    .fetch();

  if (roots.length === 0 && children.length === 0) return null;

  const childIds = children.map((c) => c.id);

  // Get grandchildren (L3)
  let grandchildIds: string[] = [];
  if (childIds.length > 0) {
    const grandchildren = await scope
      .queryAccessibleCategories(
        categoriesCollection(),
        Q.where("parent_id", Q.oneOf(childIds)),
        Q.where("deleted", false)
      )
      .fetch();
    grandchildIds = grandchildren.map((c) => c.id);
  }

  return [categoryId, ...childIds, ...grandchildIds];
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate that no duplicate budget exists for the same type+period+category.
 *
 * Rules (from FR-014 + Q1):
 * - Max ONE current Global budget per period type (WEEKLY, MONTHLY, CUSTOM)
 * - Max ONE current Category budget per category per period type
 * - Expired CUSTOM budgets are historical and do not occupy the current slot
 *
 * @throws Error if a duplicate is found
 */
interface ValidateBudgetUniquenessOptions {
  readonly categoryId?: string;
  readonly excludeBudgetId?: string;
  readonly candidatePeriodEnd?: Date;
  readonly scope?: CurrentUserDataScope;
}

export async function validateBudgetUniqueness(
  type: BudgetType,
  period: BudgetPeriod,
  options: ValidateBudgetUniquenessOptions = {}
): Promise<void> {
  const currentScope = options.scope ?? (await getCurrentUserDataScope());
  if (
    period === "CUSTOM" &&
    options.candidatePeriodEnd &&
    isPeriodExpired(options.candidatePeriodEnd)
  ) {
    return;
  }

  const conditions = [
    Q.where("deleted", false),
    Q.where("type", type),
    Q.where("period", period),
  ];

  if (type === "CATEGORY" && options.categoryId) {
    conditions.push(Q.where("category_id", options.categoryId));
  }

  if (options.excludeBudgetId) {
    conditions.push(Q.where("id", Q.notEq(options.excludeBudgetId)));
  }

  const matchingBudgets = currentScope.queryOwned(
    budgetsCollection(),
    Q.and(...conditions)
  );
  const hasExisting =
    period === "CUSTOM"
      ? (await matchingBudgets.fetch()).some(
          (budget) => !isPeriodExpired(budget.periodEnd)
        )
      : (await matchingBudgets.fetchCount()) > 0;

  if (hasExisting) {
    const label =
      type === "GLOBAL"
        ? `A Global ${period.toLowerCase()} budget already exists`
        : `A budget for this category with ${period.toLowerCase()} period already exists`;
    throw new Error(label);
  }
}
