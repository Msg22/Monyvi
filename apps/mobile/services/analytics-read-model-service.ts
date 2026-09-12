import {
  database,
  type Category,
  type CurrencyType,
  type Transaction,
  type TransactionType,
} from "@monyvi/db";
import { Q, type Query } from "@nozbe/watermelondb";
import {
  aggregateByCategory,
  calculateComparison,
  calculateMonthlyTotals,
  generateMonthlyChartData,
  getComparisonPeriods,
  getYearMonthBoundaries,
  type CategoryBreakdown,
  type ChartDataPoint,
  type ComparisonResult,
  type MonthlySummary,
} from "@monyvi/logic";

import {
  queryAccessibleCategories,
  queryOwned,
} from "@/services/user-data-access";

interface AccountScopedInput {
  readonly userId: string;
  readonly accountIds?: readonly string[];
}

interface CurrencyScopedInput extends AccountScopedInput {
  readonly currency?: CurrencyType;
}

type WatermelonWhereClause = ReturnType<typeof Q.where>;

export interface StatsCurrencyTransactionsInput {
  readonly userId: string;
}

export interface MonthlyChartTransactionsInput extends CurrencyScopedInput {
  readonly months: number;
  readonly type: TransactionType;
}

export interface MonthlyChartDataInput {
  readonly months: number;
  readonly type: TransactionType;
}

export interface CategoryBreakdownSourcesInput extends CurrencyScopedInput {
  readonly year: number;
  readonly month: number;
}

export interface CategoryDrilldownTransactionsInput extends CurrencyScopedInput {
  readonly year: number;
  readonly month: number;
}

export interface ComparisonTransactionsInput extends CurrencyScopedInput {
  readonly type: "mom" | "yoy";
  readonly year?: number;
  readonly month?: number;
}

export interface ComparisonTransactionQueries {
  readonly currentQuery: Query<Transaction>;
  readonly previousQuery: Query<Transaction>;
}

export interface CategoryBreakdownSourceQueries {
  readonly transactionsQuery: Query<Transaction>;
  readonly categoriesQuery: Query<Category>;
}

export interface MonthlySummaryTransactionsInput extends CurrencyScopedInput {
  readonly months: number;
}

export interface MonthlySummariesInput {
  readonly months: number;
}

export function observeStatsCurrencyTransactions(
  input: StatsCurrencyTransactionsInput
): Query<Transaction> {
  return queryOwned(
    transactionsCollection(),
    input.userId,
    Q.where("deleted", false)
  );
}

export function observeMonthlyChartTransactions(
  input: MonthlyChartTransactionsInput
): Query<Transaction> {
  assertValidMonths(input.months);
  const startDate = getRollingMonthStart(input.months);

  return queryOwned(
    transactionsCollection(),
    input.userId,
    Q.where("deleted", false),
    Q.where("date", Q.gte(startDate)),
    Q.where("type", input.type),
    ...getCurrencyConditions(input.currency),
    ...getAccountConditions(input.accountIds)
  );
}

export function observeCategoryBreakdownSources(
  input: CategoryBreakdownSourcesInput
): CategoryBreakdownSourceQueries {
  const { startDate, endDate } = getYearMonthBoundaries(
    input.year,
    input.month
  );

  return {
    transactionsQuery: queryOwned(
      transactionsCollection(),
      input.userId,
      Q.where("deleted", false),
      Q.where("date", Q.gte(startDate)),
      Q.where("date", Q.lte(endDate)),
      ...getCurrencyConditions(input.currency),
      ...getAccountConditions(input.accountIds)
    ),
    categoriesQuery: queryAccessibleCategories(
      categoriesCollection(),
      input.userId,
      Q.where("deleted", false)
    ),
  };
}

export function observeCategoryDrilldownTransactions(
  input: CategoryDrilldownTransactionsInput
): Query<Transaction> {
  const { startDate, endDate } = getYearMonthBoundaries(
    input.year,
    input.month
  );

  return queryOwned(
    transactionsCollection(),
    input.userId,
    Q.where("deleted", false),
    Q.where("date", Q.gte(startDate)),
    Q.where("date", Q.lte(endDate)),
    Q.where("type", "EXPENSE"),
    ...getCurrencyConditions(input.currency),
    ...getAccountConditions(input.accountIds)
  );
}

export function observeComparisonTransactions(
  input: ComparisonTransactionsInput
): ComparisonTransactionQueries {
  const now = new Date();
  const targetYear = input.year ?? now.getFullYear();
  const targetMonth = input.month ?? now.getMonth() + 1;
  const { current, previous } = getComparisonPeriods(
    input.type,
    targetYear,
    targetMonth
  );
  const baseConditions = [
    Q.where("deleted", false),
    ...getCurrencyConditions(input.currency),
    ...getAccountConditions(input.accountIds),
  ];

  return {
    currentQuery: queryOwned(
      transactionsCollection(),
      input.userId,
      ...baseConditions,
      Q.where("date", Q.gte(current.startDate)),
      Q.where("date", Q.lte(current.endDate))
    ),
    previousQuery: queryOwned(
      transactionsCollection(),
      input.userId,
      ...baseConditions,
      Q.where("date", Q.gte(previous.startDate)),
      Q.where("date", Q.lte(previous.endDate))
    ),
  };
}

export function observeMonthlySummaryTransactions(
  input: MonthlySummaryTransactionsInput
): Query<Transaction> {
  assertValidMonths(input.months);

  return queryOwned(
    transactionsCollection(),
    input.userId,
    Q.where("deleted", false),
    Q.where("date", Q.gte(getRollingMonthStart(input.months))),
    ...getCurrencyConditions(input.currency),
    ...getAccountConditions(input.accountIds)
  );
}

export function buildStatsCurrencies(
  transactions: readonly Transaction[],
  preferredCurrency: CurrencyType
): CurrencyType[] {
  const currencies = Array.from(
    new Set(transactions.map((transaction) => transaction.currency))
  ).sort();

  if (!currencies.includes(preferredCurrency)) {
    return currencies;
  }

  return [
    preferredCurrency,
    ...currencies.filter((currency) => currency !== preferredCurrency),
  ];
}

export function buildMonthlyChartData(
  transactions: readonly Transaction[],
  input: MonthlyChartDataInput
): ChartDataPoint[] {
  assertValidMonths(input.months);

  return generateMonthlyChartData([...transactions], input.months, input.type);
}

export function buildCategoryBreakdown(
  transactions: readonly Transaction[],
  categories: readonly Category[]
): CategoryBreakdown[] {
  return aggregateByCategory([...transactions], [...categories]);
}

export function buildComparison(
  currentTransactions: readonly Transaction[],
  previousTransactions: readonly Transaction[]
): ComparisonResult {
  const currentTotals = calculateMonthlyTotals([...currentTransactions]);
  const previousTotals = calculateMonthlyTotals([...previousTransactions]);

  return calculateComparison(
    currentTotals.totalExpenses,
    previousTotals.totalExpenses
  );
}

export function buildMonthlySummaries(
  transactions: readonly Transaction[],
  input: MonthlySummariesInput
): MonthlySummary[] {
  assertValidMonths(input.months);

  const now = new Date();
  const summaries: MonthlySummary[] = [];

  for (let i = input.months - 1; i >= 0; i--) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    const { startDate, endDate } = getYearMonthBoundaries(year, month);
    const monthTransactions = transactions.filter(
      (transaction) =>
        transaction.date.getTime() >= startDate &&
        transaction.date.getTime() <= endDate
    );
    const totals = calculateMonthlyTotals([...monthTransactions]);

    summaries.push({
      year,
      month,
      ...totals,
      transactionCount: monthTransactions.length,
    });
  }

  return summaries;
}

function transactionsCollection(): ReturnType<
  typeof database.get<Transaction>
> {
  return database.get<Transaction>("transactions");
}

function categoriesCollection(): ReturnType<typeof database.get<Category>> {
  return database.get<Category>("categories");
}

function getRollingMonthStart(months: number): number {
  assertValidMonths(months);

  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - months + 1, 1).getTime();
}

function assertValidMonths(months: number): void {
  if (!Number.isInteger(months) || months < 1) {
    throw new Error("months must be a positive integer");
  }
}

function getCurrencyConditions(
  currency: CurrencyType | undefined
): WatermelonWhereClause[] {
  return currency ? [Q.where("currency", currency)] : [];
}

function getAccountConditions(
  accountIds: readonly string[] | undefined
): WatermelonWhereClause[] {
  const selectedAccountIds = accountIds ?? [];
  if (selectedAccountIds.length === 0) {
    return [];
  }

  return [Q.where("account_id", Q.oneOf([...selectedAccountIds]))];
}
