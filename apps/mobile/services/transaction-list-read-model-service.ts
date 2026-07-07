import {
  formatDate,
  getEndOfDay,
  getEndOfMonth,
  getEndOfWeek,
  getStartOfDay,
  getStartOfMonth,
  getStartOfWeek,
  isSameDay,
} from "@/utils/dateHelpers";
import { buildAccountDisplayNames } from "@/utils/account-display";
import {
  queryAccessibleCategories,
  queryOwned,
} from "@/services/user-data-access";
import {
  Account,
  Category,
  database,
  Transaction,
  Transfer,
  type CurrencyType,
  type MarketRate,
} from "@monyvi/db";
import { convertCurrency } from "@monyvi/logic";
import { Q, type Query } from "@nozbe/watermelondb";

export type TransactionTypeFilter = "All" | "Income" | "Expense" | "Transfer";
export type GroupingPeriod =
  | "today"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "six_months"
  | "this_year"
  | "all_time";

interface TransactionDisplayItem {
  readonly _type: "transaction";
  readonly record: Transaction;
  readonly id: string;
  readonly userId: string;
  readonly accountId: string;
  readonly categoryId: string;
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly type: Transaction["type"];
  readonly date: Date;
  readonly dateInMs: number;
  readonly isIncome: boolean;
  readonly isExpense: boolean;
  readonly counterparty?: string;
  readonly note?: string;
  readonly source: Transaction["source"];
  readonly linkedRecurringId?: string;
  readonly accountName: string;
  readonly categoryName: string;
  readonly categoryIconName: string;
  readonly categoryIconLibrary: string;
  readonly displayNetWorth?: number;
}

interface TransferDisplayItem {
  readonly _type: "transfer";
  readonly record: Transfer;
  readonly id: string;
  readonly userId: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amount: number;
  readonly convertedAmount?: number;
  readonly currency: CurrencyType;
  readonly date: Date;
  readonly dateInMs: number;
  readonly notes?: string;
  readonly fromAccountName: string;
  readonly toAccountName: string;
  readonly displayNetWorth?: number;
}

export type DisplayListItem = TransactionDisplayItem | TransferDisplayItem;

export type DisplayTransaction =
  | (TransactionDisplayItem & { readonly displayNetWorth: number })
  | (TransferDisplayItem & { readonly displayNetWorth: number });

export interface GroupedTransaction {
  readonly title: string;
  readonly transactions: readonly DisplayTransaction[];
  readonly groupNetWorth?: number;
  readonly groupTotalIncome: number;
  readonly groupTotalExpense: number;
}

export interface TransactionListReadModel {
  readonly futureTransactions: readonly Transaction[];
  readonly displayedItems: readonly DisplayListItem[];
}

export interface GetTransactionListReadModelInput {
  readonly userId: string;
  readonly period: GroupingPeriod;
  readonly selectedTypes: readonly TransactionTypeFilter[];
}

export interface BuildTransactionGroupsInput extends TransactionListReadModel {
  readonly totalNetWorth: number | null;
  readonly latestRates: MarketRate | null;
  readonly preferredCurrency: CurrencyType;
  readonly period: GroupingPeriod;
  readonly searchQuery: string;
}

export interface TransactionListInvalidationInput {
  readonly userId: string;
  readonly period: GroupingPeriod;
}

export interface TransactionListInvalidationQueries {
  readonly transactionsQuery: Query<Transaction>;
  readonly transfersQuery: Query<Transfer>;
}

export const TRANSACTION_LIST_TRANSACTION_COLUMNS = [
  "category_id",
  "amount",
  "type",
  "note",
  "counterparty",
  "account_id",
  "date",
  "deleted",
] as const;

export const TRANSACTION_LIST_TRANSFER_COLUMNS = [
  "amount",
  "from_account_id",
  "to_account_id",
  "notes",
  "date",
  "deleted",
] as const;

export function observeTransactionListInvalidationSources(
  input: TransactionListInvalidationInput
): TransactionListInvalidationQueries {
  const { startDate, endDate } = getPeriodDateRange(input.period);

  return {
    transactionsQuery: queryOwned(
      transactionsCollection(),
      input.userId,
      Q.where("deleted", false),
      Q.where("date", Q.gte(startDate))
    ),
    transfersQuery: queryOwned(
      transfersCollection(),
      input.userId,
      Q.where("deleted", false),
      Q.where("date", Q.gte(startDate)),
      Q.where("date", Q.lte(endDate))
    ),
  };
}

export async function getTransactionListReadModel(
  input: GetTransactionListReadModelInput
): Promise<TransactionListReadModel> {
  const { startDate, endDate } = getPeriodDateRange(input.period);
  const futureTransactions = await queryOwned(
    transactionsCollection(),
    input.userId,
    Q.where("deleted", false),
    Q.where("date", Q.gt(endDate)),
    Q.sortBy("date", Q.desc)
  ).fetch();
  const displayTransfers = await fetchDisplayTransfers(
    input,
    startDate,
    endDate
  );
  const displayTransactions = await fetchDisplayTransactions(
    input,
    startDate,
    endDate
  );
  const displayedItems = await enrichDisplayItems(
    input.userId,
    combineDisplayItems(displayTransactions, displayTransfers)
  );

  return {
    futureTransactions,
    displayedItems,
  };
}

export function buildTransactionGroups(
  input: BuildTransactionGroupsInput
): GroupedTransaction[] {
  if (input.totalNetWorth === null) {
    return [];
  }

  const toPreferred = (amount: number, currency: CurrencyType): number =>
    convertCurrency(
      amount,
      currency,
      input.preferredCurrency,
      input.latestRates
    );
  const getSignedAmount = (item: DisplayListItem): number => {
    if (item._type !== "transaction") {
      return 0;
    }

    const preferredAmount = toPreferred(item.amount, item.currency);
    if (item.isIncome) return preferredAmount;
    if (item.isExpense) return -preferredAmount;
    return 0;
  };
  let anchorNetWorth = input.totalNetWorth;

  for (const transaction of input.futureTransactions) {
    const preferredAmount = toPreferred(
      transaction.amount,
      transaction.currency
    );
    if (transaction.isIncome) anchorNetWorth -= preferredAmount;
    if (transaction.isExpense) anchorNetWorth += preferredAmount;
  }

  let runningNetWorth = anchorNetWorth;
  const filteredItems = filterDisplayItems(
    input.displayedItems,
    input.searchQuery
  );
  const processedItems = filteredItems.map((item): DisplayTransaction => {
    const itemWithNetWorth: DisplayTransaction = {
      ...item,
      displayNetWorth: runningNetWorth,
    };
    runningNetWorth -= getSignedAmount(item);
    return itemWithNetWorth;
  });

  return groupDisplayItems(processedItems, input);
}

function transactionsCollection(): ReturnType<
  typeof database.get<Transaction>
> {
  return database.get<Transaction>("transactions");
}

function transfersCollection(): ReturnType<typeof database.get<Transfer>> {
  return database.get<Transfer>("transfers");
}

function accountsCollection(): ReturnType<typeof database.get<Account>> {
  return database.get<Account>("accounts");
}

function categoriesCollection(): ReturnType<typeof database.get<Category>> {
  return database.get<Category>("categories");
}

function getPeriodDateRange(period: GroupingPeriod): {
  readonly startDate: number;
  readonly endDate: number;
} {
  const now = new Date();

  switch (period) {
    case "today":
      return { startDate: getStartOfDay(now), endDate: getEndOfDay(now) };
    case "this_week":
      return { startDate: getStartOfWeek(now), endDate: getEndOfWeek(now) };
    case "last_week": {
      const lastWeek = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 7
      );
      return {
        startDate: getStartOfWeek(lastWeek),
        endDate: getEndOfWeek(lastWeek),
      };
    }
    case "this_month":
      return { startDate: getStartOfMonth(now), endDate: getEndOfMonth(now) };
    case "last_month": {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        startDate: getStartOfMonth(lastMonth),
        endDate: getEndOfMonth(lastMonth),
      };
    }
    case "six_months": {
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return {
        startDate: getStartOfMonth(sixMonthsAgo),
        endDate: getEndOfDay(now),
      };
    }
    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: start.getTime(), endDate: getEndOfDay(now) };
    }
    case "all_time":
      return { startDate: 0, endDate: Date.now() };
    default:
      return { startDate: 0, endDate: Date.now() };
  }
}

async function fetchDisplayTransactions(
  input: GetTransactionListReadModelInput,
  startDate: number,
  endDate: number
): Promise<Transaction[]> {
  const includesIncome = input.selectedTypes.includes("Income");
  const includesExpense = input.selectedTypes.includes("Expense");
  const includesAll = input.selectedTypes.includes("All");

  if (!includesAll && !includesIncome && !includesExpense) {
    return [];
  }

  const conditions = [
    Q.where("deleted", false),
    Q.where("date", Q.gte(startDate)),
    Q.where("date", Q.lte(endDate)),
    Q.sortBy("date", Q.desc),
  ];

  if (!includesAll && includesIncome !== includesExpense) {
    conditions.push(Q.where("type", includesIncome ? "INCOME" : "EXPENSE"));
  }

  return queryOwned(
    transactionsCollection(),
    input.userId,
    ...conditions
  ).fetch();
}

async function fetchDisplayTransfers(
  input: GetTransactionListReadModelInput,
  startDate: number,
  endDate: number
): Promise<Transfer[]> {
  const includesTransfer = input.selectedTypes.includes("Transfer");
  const includesAll = input.selectedTypes.includes("All");

  if (!includesTransfer && !includesAll) {
    return [];
  }

  return queryOwned(
    transfersCollection(),
    input.userId,
    Q.where("deleted", false),
    Q.where("date", Q.gte(startDate)),
    Q.where("date", Q.lte(endDate)),
    Q.sortBy("date", Q.desc)
  ).fetch();
}

function combineDisplayItems(
  transactions: readonly Transaction[],
  transfers: readonly Transfer[]
): Array<Transaction | Transfer> {
  return [...transactions, ...transfers].sort(
    (a, b) => b.dateInMs - a.dateInMs
  );
}

async function enrichDisplayItems(
  userId: string,
  items: ReadonlyArray<Transaction | Transfer>
): Promise<DisplayListItem[]> {
  const accountIds = collectAccountIds(items);
  const categoryIds = collectCategoryIds(items);
  const [ownedAccounts, accessibleCategories] = await Promise.all([
    accountIds.length > 0
      ? queryOwned(
          accountsCollection(),
          userId,
          Q.where("deleted", Q.notEq(true))
        ).fetch()
      : Promise.resolve([]),
    categoryIds.length > 0
      ? queryAccessibleCategories(
          categoriesCollection(),
          userId,
          Q.where("id", Q.oneOf(categoryIds)),
          Q.where("deleted", Q.notEq(true))
        ).fetch()
      : Promise.resolve([]),
  ]);
  const displayNames = buildAccountDisplayNames(ownedAccounts);
  const accountsById = new Map(
    ownedAccounts.map((account) => [account.id, account])
  );
  const categoriesById = new Map(
    accessibleCategories.map((category) => [category.id, category])
  );

  return items.map((item): DisplayListItem => {
    if (isTransaction(item)) {
      return createTransactionDisplayItem(item, displayNames, categoriesById);
    }

    return createTransferDisplayItem(item, displayNames, accountsById);
  });
}

function filterDisplayItems(
  items: readonly DisplayListItem[],
  searchQuery: string
): DisplayListItem[] {
  if (!searchQuery) {
    return [...items];
  }

  const lowerQuery = searchQuery.toLowerCase();
  return items.filter((item) => {
    if (item._type === "transaction") {
      return (
        (item.note && item.note.toLowerCase().includes(lowerQuery)) ||
        (item.counterparty &&
          item.counterparty.toLowerCase().includes(lowerQuery)) ||
        item.categoryName.toLowerCase().includes(lowerQuery) ||
        item.amount.toString().includes(lowerQuery)
      );
    }

    return (
      (item.notes && item.notes.toLowerCase().includes(lowerQuery)) ||
      item.amount.toString().includes(lowerQuery)
    );
  });
}

function collectAccountIds(
  items: ReadonlyArray<Transaction | Transfer>
): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (isTransaction(item)) {
      ids.add(item.accountId);
    } else {
      ids.add(item.fromAccountId);
      ids.add(item.toAccountId);
    }
  }

  return [...ids];
}

function collectCategoryIds(
  items: ReadonlyArray<Transaction | Transfer>
): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (isTransaction(item)) {
      ids.add(item.categoryId);
    }
  }

  return [...ids];
}

function isTransaction(item: Transaction | Transfer): item is Transaction {
  return "categoryId" in item;
}

function resolveAccountName(
  accountId: string,
  displayNames: ReadonlyMap<string, string>
): string {
  return displayNames.get(accountId) ?? "Unknown";
}

function createTransactionDisplayItem(
  record: Transaction,
  displayNames: ReadonlyMap<string, string>,
  categoriesById: ReadonlyMap<string, Category>
): TransactionDisplayItem {
  const category = categoriesById.get(record.categoryId);
  const iconConfig = category?.iconConfig;

  return {
    _type: "transaction",
    record,
    id: record.id,
    userId: record.userId,
    accountId: record.accountId,
    categoryId: record.categoryId,
    amount: record.amount,
    currency: record.currency,
    type: record.type,
    date: record.date,
    dateInMs: record.dateInMs,
    isIncome: record.isIncome,
    isExpense: record.isExpense,
    counterparty: record.counterparty,
    note: record.note,
    source: record.source,
    linkedRecurringId: record.linkedRecurringId,
    accountName: resolveAccountName(record.accountId, displayNames),
    categoryName: category?.displayName ?? "Unknown",
    categoryIconName: iconConfig?.iconName ?? "help-circle",
    categoryIconLibrary: iconConfig?.iconLibrary ?? "Ionicons",
  };
}

function createTransferDisplayItem(
  record: Transfer,
  displayNames: ReadonlyMap<string, string>,
  accountsById: ReadonlyMap<string, Account>
): TransferDisplayItem {
  return {
    _type: "transfer",
    record,
    id: record.id,
    userId: record.userId,
    fromAccountId: record.fromAccountId,
    toAccountId: record.toAccountId,
    amount: record.amount,
    convertedAmount: record.convertedAmount,
    currency: record.currency,
    date: record.date,
    dateInMs: record.dateInMs,
    notes: record.notes,
    fromAccountName: accountsById.has(record.fromAccountId)
      ? resolveAccountName(record.fromAccountId, displayNames)
      : "Unknown",
    toAccountName: accountsById.has(record.toAccountId)
      ? resolveAccountName(record.toAccountId, displayNames)
      : "Unknown",
  };
}

function groupDisplayItems(
  items: readonly DisplayTransaction[],
  input: BuildTransactionGroupsInput
): GroupedTransaction[] {
  const groups: GroupedTransaction[] = [];
  let currentGroup: {
    title: string;
    transactions: DisplayTransaction[];
    groupNetWorth?: number;
    groupTotalIncome: number;
    groupTotalExpense: number;
  } | null = null;

  for (const item of items) {
    const groupTitle = getGroupKey(item.date, input);

    if (!currentGroup || currentGroup.title !== groupTitle) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = {
        title: groupTitle,
        transactions: [],
        groupNetWorth: item.displayNetWorth,
        groupTotalIncome: 0,
        groupTotalExpense: 0,
      };
    }

    currentGroup.transactions.push(item);
    if (item._type === "transaction") {
      const preferredAmount = convertCurrency(
        item.amount,
        item.currency,
        input.preferredCurrency,
        input.latestRates
      );
      if (item.isIncome) {
        currentGroup.groupTotalIncome += preferredAmount;
      } else if (item.isExpense) {
        currentGroup.groupTotalExpense += preferredAmount;
      }
    }
  }

  if (currentGroup) groups.push(currentGroup);
  return groups;
}

function getGroupKey(
  date: Date,
  input: Pick<BuildTransactionGroupsInput, "period" | "searchQuery">
): string {
  if (input.searchQuery) return formatDate(date, "MMM d, yyyy");

  if (input.period === "this_week" || input.period === "last_week") {
    if (isSameDay(date, new Date())) return "Today";
    if (isSameDay(date, new Date(Date.now() - 86400000))) return "Yesterday";
    return formatDate(date, "EEEE, MMM d");
  }

  if (input.period === "this_month" || input.period === "last_month") {
    const start = new Date(getStartOfWeek(date));
    const end = new Date(getEndOfWeek(date));
    return `${formatDate(start, "MMM d")} - ${formatDate(end, "MMM d")}`;
  }

  if (input.period === "six_months" || input.period === "this_year") {
    return formatDate(date, "MMMM yyyy");
  }

  return formatDate(date, "MMM d, yyyy");
}
