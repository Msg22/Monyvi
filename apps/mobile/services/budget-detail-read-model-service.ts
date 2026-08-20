import {
  database,
  type Budget,
  type Category,
  type CurrencyType,
  type Transaction,
} from "@monyvi/db";
import { Q, type Query } from "@nozbe/watermelondb";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  calculateWeeklyBudgetPace,
  classifyBudgetPace,
  computeSpendingMetrics,
  filterExcludedTransactions,
  getCurrentPeriodBounds,
  getDaysElapsed,
  getDaysLeft,
  getWeeklyBuckets,
  isPeriodExpired,
  parsePauseIntervals,
  parsePausedAtMs,
  type PauseInterval,
  type WeeklyBucket,
} from "@monyvi/logic";

import type {
  BudgetDetailBreakdownItem,
  BudgetDetailIcon,
  BudgetDetailIconLibrary,
  BudgetDetailIconTone,
  BudgetDetailLifecycle,
  BudgetDetailReadModel,
  BudgetDetailTransactionItem,
  BudgetDetailWeek,
} from "@/contracts/budget-detail-presentation";
import { palette } from "@/constants/colors";
import {
  getCurrentUserDataScope,
  type CurrentUserDataScope,
} from "@/services/user-data-access";
import { DEFAULT_CURRENCY } from "@/utils/currency-detection";
import { getSafeCategoryIconConfig } from "@/utils/category-icon-config";

export type { BudgetDetailReadModel } from "@/contracts/budget-detail-presentation";

export interface BudgetDetailInputSnapshot {
  readonly budget: Budget;
  readonly categories: readonly Category[];
  readonly transactions: readonly Transaction[];
  readonly fallbackCurrency: CurrencyType;
}

interface BudgetPauseState {
  readonly pauseIntervals: readonly PauseInterval[];
  readonly pausedAtMs: number | undefined;
}

const RECENT_TRANSACTIONS_LIMIT = 6;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;
const RGB_CHANNEL_RANGE = 256;
const RGB_RED_DIVISOR = RGB_CHANNEL_RANGE * RGB_CHANNEL_RANGE;
const HEX_COLOR_PATTERN = /^#([0-9a-f]{6})$/i;
const ICON_TONE_ANCHORS: ReadonlyArray<
  Readonly<{
    tone: BudgetDetailIconTone;
    color: string;
  }>
> = [
  { tone: "GREEN", color: palette.nileGreen[500] },
  { tone: "GOLD", color: palette.gold[500] },
  { tone: "RED", color: palette.red[500] },
  { tone: "BLUE", color: palette.blue[500] },
  { tone: "VIOLET", color: palette.violet[500] },
  { tone: "SLATE", color: palette.slate[400] },
];

export async function getBudgetDetailReadModel(
  budget: Budget,
  now: Date = new Date(),
  fallbackCurrency: CurrencyType = DEFAULT_CURRENCY
): Promise<BudgetDetailReadModel> {
  const scope = await getCurrentUserDataScope();
  scope.assertOwned(budget);
  const categories = await createBudgetDetailCategoryQuery(scope).fetch();
  const transactions = await createBudgetDetailTransactionQuery(
    scope,
    budget,
    categories,
    now
  ).fetch();
  return buildBudgetDetailReadModel(
    { budget, categories, transactions, fallbackCurrency },
    now
  );
}

export function createBudgetDetailCategoryQuery(
  scope: CurrentUserDataScope
): Query<Category> {
  return scope.queryAccessibleCategories(
    database.get<Category>("categories"),
    Q.where("deleted", false)
  );
}

export function createBudgetDetailTransactionQuery(
  scope: CurrentUserDataScope,
  budget: Budget,
  categories: readonly Category[],
  now: Date
): Query<Transaction> {
  const bounds = getCurrentPeriodBounds(
    budget.period,
    budget.periodStart,
    budget.periodEnd,
    now
  );
  const conditions = [
    Q.where("deleted", false),
    Q.where("type", "EXPENSE"),
    Q.where("date", Q.gte(bounds.start.getTime())),
    Q.where("date", Q.lte(bounds.end.getTime())),
  ];
  if (budget.isCategoryBudget && budget.categoryId) {
    conditions.push(
      Q.where(
        "category_id",
        Q.oneOf(getDescendantCategoryIds(categories, budget.categoryId))
      )
    );
  }
  return scope.queryOwned(
    database.get<Transaction>("transactions"),
    Q.and(...conditions)
  );
}

export function buildBudgetDetailReadModel(
  snapshot: BudgetDetailInputSnapshot,
  now: Date = new Date()
): BudgetDetailReadModel {
  const { budget, categories, transactions, fallbackCurrency } = snapshot;
  const bounds = getCurrentPeriodBounds(
    budget.period,
    budget.periodStart,
    budget.periodEnd,
    now
  );
  const pauseState = getBudgetPauseState(budget);
  const activeTransactions = filterExcludedTransactions(
    transactions,
    pauseState.pauseIntervals,
    pauseState.pausedAtMs
  );
  const spent = getTotalSpent(activeTransactions);
  const daysElapsed = getDaysElapsed(bounds.start, now);
  const daysLeft = getDaysLeft(bounds.end, now);
  const metrics = computeSpendingMetrics(
    spent,
    budget.amount,
    daysElapsed,
    budget.alertThreshold
  );
  const categoryMap = new Map(
    categories.map((category) => [category.id, category] as const)
  );
  const lifecycle = getLifecycle(budget, now);
  const currency = budget.currency ?? fallbackCurrency;

  return freezeReadModel({
    identity: createIdentity(budget, bounds, categoryMap, lifecycle),
    currency,
    metrics,
    daysLeft,
    daysElapsed,
    paceState:
      lifecycle === "ACTIVE"
        ? classifyBudgetPace({
            limit: budget.amount,
            periodStart: bounds.start,
            periodEnd: bounds.end,
            now,
            spent,
            currencyFractionDigits:
              CURRENCY_PRECISION[currency] ?? DEFAULT_PRECISION,
          })
        : null,
    weeklySpending: createWeeklySpending(
      activeTransactions,
      budget.amount,
      bounds
    ),
    categoryBreakdown: createCategoryBreakdown(
      budget,
      spent,
      activeTransactions,
      categoryMap
    ),
    recentTransactions: createRecentTransactions(
      activeTransactions,
      categoryMap
    ),
    hasCompletedPauseExclusion: hasCompletedPauseExclusion(
      transactions,
      pauseState.pauseIntervals
    ),
  });
}

function getBudgetPauseState(budget: Budget): BudgetPauseState {
  return {
    pauseIntervals: parsePauseIntervals(String(budget.pauseIntervals ?? "[]")),
    pausedAtMs: parsePausedAtMs(budget.pausedAt),
  };
}

function getLifecycle(budget: Budget, now: Date): BudgetDetailLifecycle {
  if (budget.period === "CUSTOM" && isPeriodExpired(budget.periodEnd, now)) {
    return "EXPIRED";
  }
  return budget.status === "PAUSED" ? "PAUSED" : "ACTIVE";
}

function createIdentity(
  budget: Budget,
  bounds: Readonly<{ start: Date; end: Date }>,
  categoryMap: ReadonlyMap<string, Category>,
  lifecycle: BudgetDetailLifecycle
): BudgetDetailReadModel["identity"] {
  const category = budget.categoryId
    ? categoryMap.get(budget.categoryId)
    : undefined;
  return {
    budgetId: budget.id,
    name: budget.name?.trim() || category?.displayName.trim() || "",
    type: budget.type,
    lifecycle,
    period: budget.period,
    periodStart: new Date(bounds.start),
    periodEnd: new Date(bounds.end),
    icon: budget.isGlobal
      ? { kind: "GLOBAL" }
      : category
        ? createCategoryIcon(category)
        : { kind: "DELETED_CATEGORY" },
    availableLifecycleAction:
      lifecycle === "EXPIRED"
        ? null
        : lifecycle === "PAUSED"
          ? "RESUME"
          : "PAUSE",
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
  const known = new Set(categoryIds);
  for (const categoryId of categoryIds) {
    for (const childId of childIdsByParentId.get(categoryId) ?? []) {
      if (known.has(childId)) continue;
      known.add(childId);
      categoryIds.push(childId);
    }
  }
  return categoryIds;
}

function createWeeklySpending(
  transactions: readonly Transaction[],
  limit: number,
  bounds: Readonly<{ start: Date; end: Date }>
): BudgetDetailWeek[] {
  const buckets = getWeeklyBuckets(bounds);
  const amounts = getWeeklyAmounts(transactions, buckets, bounds.start);
  const pace = calculateWeeklyBudgetPace({
    limit,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    buckets,
  });
  return buckets.map((bucket, index) => ({
    id: bucket.weekStart.toISOString(),
    start: new Date(bucket.weekStart),
    end: new Date(bucket.weekEnd),
    actualAmount: amounts[index] ?? 0,
    paceAmount: pace[index]?.allowance ?? 0,
  }));
}

function getWeeklyAmounts(
  transactions: readonly Transaction[],
  buckets: readonly WeeklyBucket[],
  periodStart: Date
): number[] {
  const amounts = buckets.map(() => 0);
  const periodStartDay = getLocalCalendarDay(periodStart);
  for (const transaction of transactions) {
    const offset =
      (getLocalCalendarDay(transaction.date) - periodStartDay) / MS_PER_DAY;
    const index = Math.floor(offset / DAYS_PER_WEEK);
    if (index >= 0 && index < amounts.length) {
      amounts[index] = (amounts[index] ?? 0) + transaction.amount;
    }
  }
  return amounts;
}

function getLocalCalendarDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function createCategoryBreakdown(
  budget: Budget,
  spent: number,
  transactions: readonly Transaction[],
  categoryMap: ReadonlyMap<string, Category>
): BudgetDetailBreakdownItem[] | null {
  if (!budget.isCategoryBudget || !budget.categoryId) return null;
  if (spent <= 0) return [];
  const summaries = new Map<string, { amount: number; count: number }>();
  for (const transaction of transactions) {
    const childId = getDirectChildCategoryId(
      transaction.categoryId,
      budget.categoryId,
      categoryMap
    );
    if (!childId) continue;
    const current = summaries.get(childId) ?? { amount: 0, count: 0 };
    summaries.set(childId, {
      amount: current.amount + transaction.amount,
      count: current.count + 1,
    });
  }
  return [...summaries.entries()]
    .flatMap(([categoryId, summary]) => {
      const category = categoryMap.get(categoryId);
      return category
        ? [
            {
              categoryId,
              name: category.displayName,
              icon: createCategoryIcon(category),
              transactionCount: summary.count,
              amount: summary.amount,
              percentage: (summary.amount / spent) * 100,
            },
          ]
        : [];
    })
    .sort(
      (left, right) =>
        right.amount - left.amount ||
        left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
        left.categoryId.localeCompare(right.categoryId)
    );
}

function getDirectChildCategoryId(
  categoryId: string | null,
  rootCategoryId: string,
  categoryMap: ReadonlyMap<string, Category>
): string | null {
  let currentId = categoryId;
  while (currentId && currentId !== rootCategoryId) {
    const category = categoryMap.get(currentId);
    if (!category) return null;
    if (category.parentId === rootCategoryId) return category.id;
    currentId = category.parentId ?? null;
  }
  return null;
}

function createRecentTransactions(
  transactions: readonly Transaction[],
  categoryMap: ReadonlyMap<string, Category>
): BudgetDetailTransactionItem[] {
  return [...transactions]
    .sort(
      (left, right) =>
        right.date.getTime() - left.date.getTime() ||
        left.id.localeCompare(right.id)
    )
    .slice(0, RECENT_TRANSACTIONS_LIMIT)
    .map((transaction) => {
      const category = categoryMap.get(transaction.categoryId);
      return {
        transactionId: transaction.id,
        label:
          transaction.counterparty?.trim() ||
          category?.displayName.trim() ||
          null,
        date: new Date(transaction.date),
        amount: transaction.amount,
        currency: transaction.currency,
        icon: category
          ? createCategoryIcon(category)
          : { kind: "TRANSACTION_FALLBACK" },
      };
    });
}

function createCategoryIcon(category: Category): BudgetDetailIcon {
  const iconLibrary = toIconLibrary(category.iconLibrary);
  const tone = toIconTone(category.color);
  const iconColor =
    tone === "GREEN" ? palette.nileGreen[500] : palette.slate[500];
  const safeIcon = getSafeCategoryIconConfig(
    category.icon || "receipt-outline",
    iconLibrary,
    iconColor
  );
  return {
    kind: "CATEGORY",
    iconName: safeIcon.iconName,
    iconLibrary: safeIcon.iconLibrary,
    tone,
  };
}

function toIconLibrary(value: string): BudgetDetailIconLibrary {
  if (
    value === "MaterialCommunityIcons" ||
    value === "FontAwesome5" ||
    value === "MaterialIcons"
  ) {
    return value;
  }
  return "Ionicons";
}

function toIconTone(color: string | null | undefined): BudgetDetailIconTone {
  const value = color?.toLowerCase() ?? "";
  if (value.includes("green")) return "GREEN";
  if (value.includes("gold") || value.includes("amber")) return "GOLD";
  if (value.includes("red")) return "RED";
  if (value.includes("blue")) return "BLUE";
  if (value.includes("violet") || value.includes("purple")) return "VIOLET";
  const parsedColor = parseHexColor(value);
  if (!parsedColor) return "SLATE";

  return ICON_TONE_ANCHORS.reduce(
    (closest, anchor) => {
      const anchorColor = parseHexColor(anchor.color);
      if (!anchorColor) return closest;
      const distance = getColorDistance(parsedColor, anchorColor);
      return distance < closest.distance
        ? { tone: anchor.tone, distance }
        : closest;
    },
    { tone: "SLATE", distance: Number.POSITIVE_INFINITY }
  ).tone;
}

interface RgbColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

function parseHexColor(value: string): RgbColor | null {
  const match = HEX_COLOR_PATTERN.exec(value);
  if (!match?.[1]) return null;
  const numeric = Number.parseInt(match[1], 16);
  return {
    red: Math.floor(numeric / RGB_RED_DIVISOR),
    green: Math.floor(numeric / RGB_CHANNEL_RANGE) % RGB_CHANNEL_RANGE,
    blue: numeric % RGB_CHANNEL_RANGE,
  };
}

function getColorDistance(left: RgbColor, right: RgbColor): number {
  const red = left.red - right.red;
  const green = left.green - right.green;
  const blue = left.blue - right.blue;
  return red * red + green * green + blue * blue;
}

function hasCompletedPauseExclusion(
  transactions: readonly Transaction[],
  pauseIntervals: readonly PauseInterval[]
): boolean {
  if (pauseIntervals.length === 0) return false;
  return (
    filterExcludedTransactions(transactions, pauseIntervals, undefined).length <
    transactions.length
  );
}

function getTotalSpent(transactions: readonly Transaction[]): number {
  return transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
}

function freezeReadModel(model: BudgetDetailReadModel): BudgetDetailReadModel {
  const identity = Object.freeze({
    ...model.identity,
    periodStart: Object.freeze(new Date(model.identity.periodStart)),
    periodEnd: Object.freeze(new Date(model.identity.periodEnd)),
    icon: Object.freeze({ ...model.identity.icon }),
  });
  const weeks = Object.freeze(
    model.weeklySpending.map((week) =>
      Object.freeze({
        ...week,
        start: Object.freeze(new Date(week.start)),
        end: Object.freeze(new Date(week.end)),
      })
    )
  );
  const categoryBreakdown = model.categoryBreakdown
    ? Object.freeze(
        model.categoryBreakdown.map((item) =>
          Object.freeze({ ...item, icon: Object.freeze({ ...item.icon }) })
        )
      )
    : model.categoryBreakdown;
  const recentTransactions = Object.freeze(
    model.recentTransactions.map((item) =>
      Object.freeze({
        ...item,
        date: Object.freeze(new Date(item.date)),
        icon: Object.freeze({ ...item.icon }),
      })
    )
  );
  return Object.freeze({
    ...model,
    identity,
    metrics: Object.freeze({ ...model.metrics }),
    weeklySpending: weeks,
    categoryBreakdown,
    recentTransactions,
  });
}
