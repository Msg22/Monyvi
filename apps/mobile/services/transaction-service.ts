import {
  Account,
  CurrencyType,
  database,
  Transaction,
  TransactionSource,
  TransactionType,
} from "@monyvi/db";
import type { Model } from "@nozbe/watermelondb";
import type { DisplayTransaction } from "@/hooks/useTransactionsGrouping";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
  type CurrentUserDataScope,
} from "@/services/user-data-access";
import { isValidTransactionAmount } from "@monyvi/logic";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "@/services/watermelon-cache-snapshot";
import { createGuardedTransaction } from "@/services/transaction-financial-action-production";
import {
  batchDeleteGuardedTransactions,
  convertGuardedTransactionToTransfer,
  deleteGuardedTransaction,
  updateGuardedTransaction,
} from "@/services/transaction-core-writer-production";

export const INVALID_ACCOUNT_BALANCE_ERROR_CODE = "INVALID_ACCOUNT_BALANCE";
export const BALANCE_REVERSAL_ACCOUNT_NOT_FOUND_ERROR_CODE =
  "BALANCE_REVERSAL_ACCOUNT_NOT_FOUND";
export const INVALID_TRANSACTION_AMOUNT_ERROR_CODE =
  "INVALID_TRANSACTION_AMOUNT";
export const TRANSACTION_ACCOUNT_UNAVAILABLE_ERROR_CODE =
  "TRANSACTION_ACCOUNT_UNAVAILABLE";
export const TRANSACTION_ACCOUNT_CURRENCY_MISMATCH_ERROR_CODE =
  "TRANSACTION_ACCOUNT_CURRENCY_MISMATCH";

function accountsCollection(): ReturnType<typeof database.get<Account>> {
  return database.get<Account>("accounts");
}

function transactionsCollection(): ReturnType<
  typeof database.get<Transaction>
> {
  return database.get<Transaction>("transactions");
}

async function getOwnedAccount(
  accountId: string,
  scope: CurrentUserDataScope
): Promise<Account> {
  return scope.findOwned(accountsCollection(), accountId);
}

async function getOwnedTransaction(
  transactionId: string,
  scope: CurrentUserDataScope
): Promise<Transaction> {
  return scope.findOwned(transactionsCollection(), transactionId);
}

export interface CreateTransactionData {
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly categoryId: string;
  readonly counterparty?: string;
  readonly accountId: string;
  readonly note?: string;
  readonly type: TransactionType;
  readonly date?: Date;
  readonly linkedRecurringId?: string;
  readonly source: TransactionSource;
  readonly smsFingerprint?: string;
}

export interface PreparedTransactionCreate {
  readonly transaction: Transaction;
  readonly operations: Model[];
  readonly restoreCachedAccount: () => void;
}

export function assertValidTransactionAmount(amount: number): void {
  if (!isValidTransactionAmount(amount)) {
    throw new Error(INVALID_TRANSACTION_AMOUNT_ERROR_CODE);
  }
}

export async function prepareTransactionCreateWithBalance(
  data: CreateTransactionData,
  scope: CurrentUserDataScope,
  expectedUserId?: string
): Promise<PreparedTransactionCreate> {
  const account = await getOwnedAccount(data.accountId, scope);
  if (account.deleted) {
    throw new Error(TRANSACTION_ACCOUNT_UNAVAILABLE_ERROR_CODE);
  }
  if (account.currency !== data.currency) {
    throw new Error(TRANSACTION_ACCOUNT_CURRENCY_MISMATCH_ERROR_CODE);
  }
  if (expectedUserId !== undefined) {
    await assertExpectedCurrentUser(expectedUserId);
  }

  const accountSnapshot = captureCachedModelSnapshot(account);

  const transaction = transactionsCollection().prepareCreate((record) => {
    record.userId = scope.userId;
    record.accountId = data.accountId;
    record.amount = data.amount;
    record.currency = data.currency;
    record.type = data.type;
    record.categoryId = data.categoryId;
    record.counterparty = data.counterparty || undefined;
    record.note = data.note || undefined;
    record.date = data.date || new Date();
    record.source = data.source;
    record.linkedRecurringId = data.linkedRecurringId || undefined;
    record.smsFingerprint = data.smsFingerprint || undefined;
    record.isDraft = false;
    record.deleted = false;
  });

  const accountUpdate = account.prepareUpdate((record) => {
    if (data.type === "EXPENSE") {
      record.balance -= data.amount;
    } else {
      record.balance += data.amount;
    }
  });

  return {
    transaction,
    operations: [transaction, accountUpdate],
    restoreCachedAccount: (): void => {
      restoreCachedModelSnapshot(accountSnapshot);
    },
  };
}

/**
 * Create a transaction from manual input.
 * Atomically creates the Transaction record and updates the account balance.
 */
export async function createTransaction(
  data: CreateTransactionData,
  expectedUserId?: string
): Promise<Transaction> {
  assertValidTransactionAmount(data.amount);
  return createGuardedTransaction(data, expectedUserId);
}

/**
 * Update an existing transaction.
 *
 * Supports editing: amount, categoryId, note, date, counterparty,
 * type (EXPENSE ↔ INCOME), and accountId (cross-currency allowed).
 *
 * Balance adjustment strategies:
 * - **Amount change**: delta = newAmount − oldAmount, applied directionally
 * - **Type change**: revert old effect + apply new effect = ±2 × amount
 * - **Account swap**: revert effect on old account, apply on new account
 * - **Combined**: all three can change simultaneously in a single atomic write
 */
export async function updateTransaction(
  transactionId: string,
  updates: {
    readonly amount?: number;
    readonly categoryId?: string;
    readonly note?: string;
    readonly date?: Date;
    readonly counterparty?: string;
    readonly type?: TransactionType;
    readonly accountId?: string;
  }
): Promise<void> {
  if (updates.amount !== undefined) {
    assertValidTransactionAmount(updates.amount);
  }

  if (
    updates.amount !== undefined ||
    updates.type !== undefined ||
    updates.accountId !== undefined
  ) {
    await updateGuardedTransaction(transactionId, updates);
    return;
  }

  const scope = await getCurrentUserDataScope();
  await database.write(async () => {
    const transaction = await getOwnedTransaction(transactionId, scope);
    await transaction.update((tx) => {
      if (updates.categoryId !== undefined) tx.categoryId = updates.categoryId;
      if (updates.note !== undefined) tx.note = updates.note;
      if (updates.date !== undefined) tx.date = updates.date;
      if (updates.counterparty !== undefined) {
        tx.counterparty = updates.counterparty;
      }
    });
  });
}

/**
 * Mark a transaction as deleted (soft delete).
 * Atomically reverses the account balance change and soft-deletes the record.
 */
export async function deleteTransaction(transactionId: string): Promise<void> {
  await deleteGuardedTransaction(transactionId);
}

// =============================================================================
// Conversion: Transaction → Transfer
// =============================================================================

interface ConvertToTransferPayload {
  readonly transactionId: string;
  readonly toAccountId: string;
  readonly notes?: string;
}

/**
 * Converts a Transaction into a Transfer.
 *
 * Atomic operation:
 * 1. Soft-delete the transaction and revert its balance effect
 * 2. Create a new transfer using the transaction's data
 * 3. Debit fromAccount (transaction's account), credit toAccount
 *
 * The transaction's accountId becomes the transfer's fromAccountId.
 */
export async function convertTransactionToTransfer(
  payload: ConvertToTransferPayload
): Promise<void> {
  await convertGuardedTransactionToTransfer(payload);
}

// =============================================================================
// Batch Delete (Transactions + Transfers)
// =============================================================================

/**
 * Batch soft-deletes an array of transactions/transfers and atomically
 * reverts all affected account balances.
 *
 * Performance: Uses backing record scalar fields to collect affected account IDs,
 * then fetches all accounts in a single
 * query — avoiding the N+1 `.fetch()` anti-pattern.
 *
 * @throws Error if the database write fails (caller handles UI feedback)
 */
export async function batchDeleteDisplayTransactions(
  items: readonly DisplayTransaction[]
): Promise<void> {
  await batchDeleteGuardedTransactions(
    items.map((item) =>
      item._type === "transaction"
        ? { kind: "transaction" as const, record: item.record }
        : { kind: "transfer" as const, record: item.record }
    )
  );
}
