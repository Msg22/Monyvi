import {
  database,
  type Budget,
  type Category,
  type Transaction,
} from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import {
  computeSpendingMetrics,
  filterExcludedTransactions,
  getCurrentPeriodBounds,
  getDaysElapsed,
  getDaysLeft,
  getWeeklyBuckets,
  parsePauseIntervals,
  parsePausedAtMs,
  type PauseInterval,
  type SpendingMetrics,
  type WeeklyBucket,
} from "@monyvi/logic";

import {
  getCurrentUserDataScope,
  type CurrentUserDataScope,
} from "@/services/user-data-access";

export interface SubcategorySpending {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly amount: number;
  readonly percentage: number;
}

export interface WeeklySpendingData {
  readonly bucket: WeeklyBucket;
  readonly amount: number;
}

export interface BudgetDetailReadModel {
  readonly metrics: SpendingMetrics;
  readonly daysLeft: number;
  readonly daysElapsed: number;
  readonly weeklySpending: readonly WeeklySpendingData[];
  readonly subcategoryBreakdown: readonly SubcategorySpending[];
  readonly recentTransactions: readonly Transaction[];
}

interface BudgetPauseState {
  readonly pauseIntervals: readonly PauseInterval[];
  readonly pausedAtMs: number | undefined;
}

const RECENT_TRANSACTIONS_LIMIT = 6;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;

export async function getBudgetDetailReadModel(
  budget: Budget
): Promise<BudgetDetailReadModel> {
  const scope = await getCurrentUserDataScope();
  scope.assertOwned(budget);
  const bounds = getCurrentPeriodBounds(
    budget.period,
    budget.periodStart,
    budget.periodEnd
  );
  const categoryHierarchy = await getCategoryHierarchy(budget, scope);
  const activeTransactions = await getActiveTransactions(
    scope,
    bounds,
    categoryHierarchy.categoryIds,
    getBudgetPauseState(budget)
  );
  const spent = getTotalSpent(activeTransactions);
  const daysElapsed = getDaysElapsed(bounds.start);
  const daysLeft = getDaysLeft(bounds.end);
  const metrics = computeSpendingMetrics(
    spent,
    budget.amount,
    daysElapsed,
    budget.alertThreshold
  );

  return {
    metrics,
    daysLeft,
    daysElapsed,
    weeklySpending: getWeeklySpending(activeTransactions, bounds),
    subcategoryBreakdown: getSubcategoryBreakdown(
      budget,
      spent,
      activeTransactions,
      categoryHierarchy.categories
    ),
    recentTransactions: getRecentTransactions(activeTransactions),
  };
}

function getBudgetPauseState(budget: Budget): BudgetPauseState {
  return {
    pauseIntervals: parsePauseIntervals(String(budget.pauseIntervals ?? "[]")),
    pausedAtMs: parsePausedAtMs(budget.pausedAt),
  };
}

interface CategoryHierarchy {
  readonly categories: readonly Category[];
  readonly categoryIds: readonly string[] | null;
}

async function getCategoryHierarchy(
  budget: Budget,
  scope: CurrentUserDataScope
): Promise<CategoryHierarchy> {
  if (!budget.isCategoryBudget || !budget.categoryId) {
    return { categories: [], categoryIds: null };
  }

  // A historical budget keeps its category ID after Watermelon removes the
  // deleted category record. Accessible metadata remains scoped below, while
  // the persisted root ID still lets us read the user's historical spending.
  const categories = await scope
    .queryAccessibleCategories(
      database.get<Category>("categories"),
      Q.where("deleted", false)
    )
    .fetch();

  return {
    categories,
    categoryIds: getDescendantCategoryIds(categories, budget.categoryId),
  };
}

function getDescendantCategoryIds(
  categories: readonly Category[],
  rootCategoryId: string
): string[] {
  const childIdsByParentId = new Map<string, string[]>();

  for (const category of categories) {
    if (!category.parentId) continue;
    const childIds = childIdsByParentId.get(category.parentId) ?? [];
    childIdsByParentId.set(category.parentId, [...childIds, category.id]);
  }

  const categoryIds = [rootCategoryId];
  const knownCategoryIds = new Set(categoryIds);
  for (const currentCategoryId of categoryIds) {
    for (const childCategoryId of childIdsByParentId.get(currentCategoryId) ??
      []) {
      if (knownCategoryIds.has(childCategoryId)) continue;
      knownCategoryIds.add(childCategoryId);
      categoryIds.push(childCategoryId);
    }
  }

  return categoryIds;
}

async function getActiveTransactions(
  scope: CurrentUserDataScope,
  bounds: ReturnType<typeof getCurrentPeriodBounds>,
  categoryIds: readonly string[] | null,
  pauseState: BudgetPauseState
): Promise<Transaction[]> {
  const conditions = [
    Q.where("deleted", false),
    Q.where("type", "EXPENSE"),
    Q.where("date", Q.gte(bounds.start.getTime())),
    Q.where("date", Q.lte(bounds.end.getTime())),
  ];

  if (categoryIds) {
    conditions.push(Q.where("category_id", Q.oneOf([...categoryIds])));
  }

  const transactions = await scope
    .queryOwned(database.get<Transaction>("transactions"), Q.and(...conditions))
    .fetch();

  return filterExcludedTransactions(
    transactions,
    pauseState.pauseIntervals,
    pauseState.pausedAtMs
  );
}

function getTotalSpent(transactions: readonly Transaction[]): number {
  return transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
}

function getWeeklySpending(
  transactions: readonly Transaction[],
  bounds: ReturnType<typeof getCurrentPeriodBounds>
): WeeklySpendingData[] {
  const buckets = getWeeklyBuckets(bounds);
  const amountsByBucket = buckets.map(() => 0);
  const periodStartDay = getLocalCalendarDay(bounds.start);

  for (const transaction of transactions) {
    const transactionDay = getLocalCalendarDay(transaction.date);
    const dayOffset = (transactionDay - periodStartDay) / MS_PER_DAY;
    const bucketIndex = Math.floor(dayOffset / DAYS_PER_WEEK);

    if (bucketIndex >= 0 && bucketIndex < amountsByBucket.length) {
      amountsByBucket[bucketIndex] =
        (amountsByBucket[bucketIndex] ?? 0) + transaction.amount;
    }
  }

  return buckets.map((bucket, index) => ({
    bucket,
    amount: amountsByBucket[index] ?? 0,
  }));
}

function getLocalCalendarDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function getSubcategoryBreakdown(
  budget: Budget,
  spent: number,
  transactions: readonly Transaction[],
  categories: readonly Category[]
): SubcategorySpending[] {
  if (!budget.isCategoryBudget || !budget.categoryId || spent <= 0) {
    return [];
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category])
  );
  const amountsByChildId = new Map<string, number>();

  for (const transaction of transactions) {
    const childCategoryId = getDirectChildCategoryId(
      transaction.categoryId,
      budget.categoryId,
      categoryById
    );
    if (!childCategoryId) continue;
    amountsByChildId.set(
      childCategoryId,
      (amountsByChildId.get(childCategoryId) ?? 0) + transaction.amount
    );
  }

  return [...amountsByChildId.entries()]
    .map(([categoryId, amount]) => {
      const category = categoryById.get(categoryId);
      if (!category) return null;
      return {
        categoryId,
        categoryName: category.displayName,
        amount,
        percentage: (amount / spent) * 100,
      };
    })
    .filter((item): item is SubcategorySpending => item !== null)
    .sort((left, right) => right.amount - left.amount);
}

function getDirectChildCategoryId(
  categoryId: string | null,
  rootCategoryId: string,
  categoryById: ReadonlyMap<string, Category>
): string | null {
  let currentCategoryId = categoryId;

  while (currentCategoryId && currentCategoryId !== rootCategoryId) {
    const category = categoryById.get(currentCategoryId);
    if (!category) return null;
    if (category.parentId === rootCategoryId) return category.id;
    currentCategoryId = category.parentId ?? null;
  }

  return null;
}

function getRecentTransactions(
  transactions: readonly Transaction[]
): Transaction[] {
  return [...transactions]
    .sort((left, right) => right.date.getTime() - left.date.getTime())
    .slice(0, RECENT_TRANSACTIONS_LIMIT);
}
