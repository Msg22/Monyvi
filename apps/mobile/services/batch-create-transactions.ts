/**
 * Batch SMS Transaction Creator
 *
 * Saves confirmed SMS transactions to WatermelonDB in a single
 * atomic batch write. Resolves category system names to category IDs,
 * sets source to "SMS", and updates account balances.
 *
 * ATM withdrawals are automatically processed as transfers (bank → cash)
 * rather than expenses, keeping both account balances accurate.
 *
 * Architecture & Design Rationale:
 * - Pattern: Service Function (stateless, pure I/O)
 * - Why: Keeps DB write logic out of components (SRP).
 *   Single atomic batch write using prepareCreate/prepareUpdate
 *   ensures all-or-nothing semantics — no partial saves on error.
 * - SOLID: Open/Closed — new transaction sources can use the
 *   same createTransaction pattern without modifying this function.
 * - Performance: O(1) database write actions instead of O(n).
 *   All records are prepared in-memory then flushed in a single
 *   database.batch() call, reducing lock acquire/release overhead
 *   from N times to exactly 1.
 *
 * @module batch-create-transactions
 */

import {
  Account,
  Category,
  database,
  Transaction,
  Transfer,
  type CurrencyType,
} from "@monyvi/db";
import {
  isValidTransactionAmount,
  type ParsedSmsTransaction,
  type ReviewableTransaction,
} from "@monyvi/logic";
import { Q, type Model } from "@nozbe/watermelondb";
import { ensureCashAccount } from "./account-service";
import { getCurrentUserId } from "./supabase";
import { queryAccessibleCategories, queryOwned } from "./user-data-access";
import { hasExistingSmsFingerprint } from "./sms-dedup-service";
import { commitPreparedBatch } from "./watermelon-atomic-batch";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
  type CachedModelSnapshot,
} from "./watermelon-cache-snapshot";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchSaveResult {
  readonly savedCount: number;
  readonly failedCount: number;
  readonly errors: readonly string[];
}

export interface PreparedBatchSave extends BatchSaveResult {
  readonly operations: readonly Model[];
  readonly alreadySavedSmsFingerprints: ReadonlySet<string>;
  readonly restoreCachedAccounts: () => void;
}

export interface PrepareBatchCreateOptions {
  readonly expectedUserId?: string;
  readonly preparedAccountCurrencies?: ReadonlyMap<string, CurrencyType>;
}

// ---------------------------------------------------------------------------
// Balance delta accumulator
// ---------------------------------------------------------------------------

/**
 * Accumulate a signed balance delta for a given account ID.
 * If the account already has a delta, the new value is added.
 */
// TODO: Move this to a utility file.
function accumulateBalanceDelta(
  deltas: Map<string, number>,
  accountId: string,
  delta: number
): void {
  const existing = deltas.get(accountId) ?? 0;
  deltas.set(accountId, existing + delta);
}

function isAtmWithdrawalTransaction(tx: ReviewableTransaction): boolean {
  return (
    "isAtmWithdrawal" in tx &&
    (tx as { readonly isAtmWithdrawal?: boolean }).isAtmWithdrawal === true
  );
}

function getRuntimeCategoryId(tx: ReviewableTransaction): string | null {
  const value = (tx as { readonly categoryId?: unknown }).categoryId;
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getSmsFingerprint(
  transaction: ReviewableTransaction
): string | undefined {
  if (transaction.source !== "SMS") return undefined;

  const canonicalFingerprint = (
    transaction as ParsedSmsTransaction
  ).smsFingerprint?.trim();
  if (canonicalFingerprint) return canonicalFingerprint;

  const legacyFingerprint = transaction.deduplicationHash?.trim();
  return legacyFingerprint || undefined;
}

async function loadAccessibleCategoryIds(
  categoryIds: ReadonlySet<string>,
  userId: string
): Promise<ReadonlySet<string>> {
  if (categoryIds.size === 0) {
    return new Set();
  }

  const categories = await queryAccessibleCategories(
    database.get<Category>("categories"),
    userId,
    Q.where("id", Q.oneOf([...categoryIds])),
    Q.where("deleted", false)
  ).fetch();

  return new Set(categories.map((category) => category.id));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save confirmed transactions to the database.
 *
 * Each transaction is routed to the correct account via the
 * `transactionAccountMap` (index → accountId), built by the
 * review page's batched resolution.
 *
 * ATM withdrawals (isAtmWithdrawal === true, SMS-specific) are automatically
 * processed as transfers from the bank account to a Cash account.
 *
 * Performance: All records are created and all account balances
 * updated in a single atomic `database.batch()` call, reducing
 * the operation from O(n) write actions to O(1).
 *
 * @param transactions          - Selected, potentially edited transactions
 * @param transactionAccountMap - Mapping from transaction index → account ID (FROM)
 * @param toAccountMap         - Optional mapping from transaction index → cash account ID (TO, ATM only)
 * @returns Summary of saved/failed counts
 */
export async function prepareBatchCreateTransactions<
  T extends ReviewableTransaction,
>(
  transactions: readonly T[],
  transactionAccountMap: ReadonlyMap<number, string>,
  toAccountMap?: ReadonlyMap<number, string>,
  options: PrepareBatchCreateOptions = {}
): Promise<PreparedBatchSave> {
  if (transactions.length === 0) {
    return {
      savedCount: 0,
      failedCount: 0,
      errors: [],
      operations: [],
      alreadySavedSmsFingerprints: new Set(),
      restoreCachedAccounts: () => {},
    };
  }

  const userId = await getCurrentUserId();
  if (
    !userId ||
    (options.expectedUserId !== undefined && userId !== options.expectedUserId)
  ) {
    return {
      savedCount: 0,
      failedCount: transactions.length,
      errors: ["User not authenticated"],
      operations: [],
      alreadySavedSmsFingerprints: new Set(),
      restoreCachedAccounts: () => {},
    };
  }

  const errors: string[] = [];
  const regularCategoryIds = new Set<string>();
  const cashAccountIdByCurrency = new Map<CurrencyType, string>();
  const atmCurrencies = new Set<CurrencyType>();

  transactions.forEach((transaction, index) => {
    if (isAtmWithdrawalTransaction(transaction)) {
      if (!toAccountMap?.has(index)) atmCurrencies.add(transaction.currency);
      return;
    }
    const categoryId = getRuntimeCategoryId(transaction);
    if (categoryId) regularCategoryIds.add(categoryId);
  });

  const accessibleCategoryIds = await loadAccessibleCategoryIds(
    regularCategoryIds,
    userId
  );

  for (const currency of atmCurrencies) {
    const result = await ensureCashAccount(userId, currency);
    if (result.accountId) {
      cashAccountIdByCurrency.set(currency, result.accountId);
    } else {
      errors.push(
        `Failed to ensure cash account for currency ${currency}: ${result.error}`
      );
    }
  }

  const transactionsCollection = database.get<Transaction>("transactions");
  const transfersCollection = database.get<Transfer>("transfers");
  const accountsCollection = database.get<Account>("accounts");
  const preparedAccountCurrencies =
    options.preparedAccountCurrencies ?? new Map<string, CurrencyType>();
  const referencedAccountIds = new Set<string>([
    ...transactionAccountMap.values(),
    ...(toAccountMap?.values() ?? []),
    ...cashAccountIdByCurrency.values(),
  ]);
  const persistedAccountIds = [...referencedAccountIds].filter(
    (accountId) => !preparedAccountCurrencies.has(accountId)
  );
  const persistedAccounts =
    persistedAccountIds.length > 0
      ? await queryOwned(
          accountsCollection,
          userId,
          Q.where("id", Q.oneOf(persistedAccountIds)),
          Q.where("deleted", false)
        ).fetch()
      : [];
  const accountCurrencyById = new Map<string, CurrencyType>([
    ...persistedAccounts.map(
      (account) => [account.id, account.currency] as const
    ),
    ...preparedAccountCurrencies,
  ]);
  const missingAccountIds = [...referencedAccountIds].filter(
    (accountId) => !accountCurrencyById.has(accountId)
  );
  if (missingAccountIds.length > 0) {
    throw new Error(
      `[batch-create-transactions] Missing account rows for mapped IDs: ${missingAccountIds.join(", ")}`
    );
  }
  const operations: Model[] = [];
  const balanceDeltas = new Map<string, number>();
  const seenSmsFingerprints = new Set<string>();
  const alreadySavedSmsFingerprints = new Set<string>();
  const accountSnapshots: CachedModelSnapshot[] = [];
  let savedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < transactions.length; index += 1) {
    const transaction = transactions[index];
    const smsFingerprint = getSmsFingerprint(transaction);

    if (!isValidTransactionAmount(transaction.amount)) {
      errors.push(`Invalid amount for transaction index ${index}`);
      failedCount += 1;
      continue;
    }
    if (transaction.source === "SMS" && !smsFingerprint) {
      errors.push(`Missing SMS fingerprint for transaction index ${index}`);
      failedCount += 1;
      continue;
    }
    if (smsFingerprint && seenSmsFingerprints.has(smsFingerprint)) continue;
    if (smsFingerprint && (await hasExistingSmsFingerprint(smsFingerprint))) {
      seenSmsFingerprints.add(smsFingerprint);
      alreadySavedSmsFingerprints.add(smsFingerprint);
      continue;
    }

    const accountId = transactionAccountMap.get(index);
    if (!accountId) {
      errors.push(
        `No account mapped for transaction index ${index} (${transaction.counterparty})`
      );
      failedCount += 1;
      continue;
    }
    if (accountCurrencyById.get(accountId) !== transaction.currency) {
      errors.push(`Account currency mismatch for transaction index ${index}`);
      failedCount += 1;
      continue;
    }

    if (isAtmWithdrawalTransaction(transaction)) {
      const cashAccountId =
        toAccountMap?.get(index) ??
        cashAccountIdByCurrency.get(transaction.currency);
      if (!cashAccountId) {
        errors.push(
          `Skipped ATM withdrawal index ${index} — failed to resolve Cash account in ${transaction.currency}`
        );
        failedCount += 1;
        continue;
      }
      if (accountCurrencyById.get(cashAccountId) !== transaction.currency) {
        errors.push(
          `Cash account currency mismatch for ATM withdrawal index ${index}`
        );
        failedCount += 1;
        continue;
      }

      operations.push(
        transfersCollection.prepareCreate((transfer) => {
          transfer.userId = userId;
          transfer.fromAccountId = accountId;
          transfer.toAccountId = cashAccountId;
          transfer.amount = Math.abs(transaction.amount);
          transfer.currency = transaction.currency;
          transfer.date = new Date(transaction.date);
          transfer.notes = "ATM Withdrawal";
          transfer.smsFingerprint = smsFingerprint;
          transfer.deleted = false;
        })
      );
      const amount = Math.abs(transaction.amount);
      accumulateBalanceDelta(balanceDeltas, accountId, -amount);
      accumulateBalanceDelta(balanceDeltas, cashAccountId, amount);
      savedCount += 1;
      if (smsFingerprint) seenSmsFingerprints.add(smsFingerprint);
      continue;
    }

    const categoryId = getRuntimeCategoryId(transaction);
    if (!categoryId) {
      errors.push(`Transaction ${index + 1} needs a category`);
      failedCount += 1;
      continue;
    }
    if (!accessibleCategoryIds.has(categoryId)) {
      errors.push(`Transaction ${index + 1} needs a valid category`);
      failedCount += 1;
      continue;
    }

    operations.push(
      transactionsCollection.prepareCreate((record) => {
        record.userId = userId;
        record.accountId = accountId;
        record.amount = Math.abs(transaction.amount);
        record.currency = transaction.currency;
        record.type = transaction.type;
        record.categoryId = categoryId;
        record.counterparty = transaction.counterparty ?? undefined;
        record.note = "";
        record.date = transaction.date;
        record.source = transaction.source;
        record.smsFingerprint = smsFingerprint;
        record.isDraft = false;
        record.deleted = false;
      })
    );

    const amount = Math.abs(transaction.amount);
    accumulateBalanceDelta(
      balanceDeltas,
      accountId,
      transaction.type === "EXPENSE" ? -amount : amount
    );
    savedCount += 1;
    if (smsFingerprint) seenSmsFingerprints.add(smsFingerprint);
  }

  const accountIds = [...balanceDeltas.keys()].filter(
    (accountId) => !preparedAccountCurrencies.has(accountId)
  );
  if ([...balanceDeltas.values()].some((delta) => !Number.isFinite(delta))) {
    return {
      savedCount: 0,
      failedCount: transactions.length,
      errors: ["Account balance delta is not finite"],
      operations: [],
      alreadySavedSmsFingerprints,
      restoreCachedAccounts: () => {},
    };
  }
  if (accountIds.length > 0) {
    let hasInvalidAccountBalance = false;
    persistedAccounts.forEach((account) => {
      const delta = balanceDeltas.get(account.id);
      if (!delta) return;
      const nextBalance = (account.balance ?? 0) + delta;
      if (!Number.isFinite(nextBalance)) {
        errors.push(`Account balance is not finite for account ${account.id}`);
        failedCount += 1;
        hasInvalidAccountBalance = true;
        return;
      }
      accountSnapshots.push(captureCachedModelSnapshot(account));
      operations.push(
        account.prepareUpdate((record) => {
          record.balance = nextBalance;
        })
      );
    });
    if (hasInvalidAccountBalance) {
      accountSnapshots.forEach(restoreCachedModelSnapshot);
      return {
        savedCount: 0,
        failedCount: transactions.length,
        errors,
        operations: [],
        alreadySavedSmsFingerprints,
        restoreCachedAccounts: () => {},
      };
    }
  }

  return {
    savedCount,
    failedCount,
    errors,
    operations,
    alreadySavedSmsFingerprints,
    restoreCachedAccounts: () => {
      accountSnapshots.forEach(restoreCachedModelSnapshot);
    },
  };
}

export async function batchCreateTransactions<T extends ReviewableTransaction>(
  transactions: readonly T[],
  transactionAccountMap: ReadonlyMap<number, string>,
  toAccountMap?: ReadonlyMap<number, string>
): Promise<BatchSaveResult> {
  const prepared = await prepareBatchCreateTransactions(
    transactions,
    transactionAccountMap,
    toAccountMap
  );
  if (prepared.operations.length > 0) {
    try {
      await database.write(async (): Promise<void> => {
        await commitPreparedBatch(prepared.operations);
      });
    } catch (error) {
      prepared.restoreCachedAccounts();
      throw error;
    }
  }
  return {
    savedCount: prepared.savedCount,
    failedCount: prepared.failedCount,
    errors: prepared.errors,
  };
}
