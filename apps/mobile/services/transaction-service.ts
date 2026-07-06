import {
  Account,
  CurrencyType,
  database,
  Transaction,
  Transfer,
  TransactionSource,
  TransactionType,
} from "@monyvi/db";
import { Q, type Model } from "@nozbe/watermelondb";
import type { DisplayTransaction } from "@/hooks/useTransactionsGrouping";
import {
  getCurrentUserDataScope,
  type CurrentUserDataScope,
} from "@/services/user-data-access";
import { isValidTransactionAmount } from "@monyvi/logic";

export const INVALID_ACCOUNT_BALANCE_ERROR_CODE = "INVALID_ACCOUNT_BALANCE";
export const BALANCE_REVERSAL_ACCOUNT_NOT_FOUND_ERROR_CODE =
  "BALANCE_REVERSAL_ACCOUNT_NOT_FOUND";
export const INVALID_TRANSACTION_AMOUNT_ERROR_CODE =
  "INVALID_TRANSACTION_AMOUNT";

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

function assertValidTransactionAmount(amount: number): void {
  if (!isValidTransactionAmount(amount)) {
    throw new Error(INVALID_TRANSACTION_AMOUNT_ERROR_CODE);
  }
}

/**
 * Create a transaction from manual input.
 * Atomically creates the Transaction record and updates the account balance.
 */
export async function createTransaction(data: {
  amount: number;
  currency: CurrencyType;
  categoryId: string;
  counterparty?: string;
  accountId: string;
  note?: string;
  type: TransactionType;
  date?: Date;
  linkedRecurringId?: string;
  source: TransactionSource;
  smsFingerprint?: string;
}): Promise<Transaction> {
  assertValidTransactionAmount(data.amount);
  const scope = await getCurrentUserDataScope();

  const transactionCollection = transactionsCollection();

  // Combine transaction creation and balance update in a single atomic write
  const newTransaction = await database.write(async () => {
    const account = await getOwnedAccount(data.accountId, scope);

    // Create the transaction
    const transaction = await transactionCollection.create((tx) => {
      tx.userId = scope.userId;
      tx.accountId = data.accountId;
      tx.amount = data.amount;
      tx.currency = data.currency;
      tx.type = data.type;
      tx.categoryId = data.categoryId;
      tx.counterparty = data.counterparty || undefined;
      tx.note = data.note || undefined;
      tx.date = data.date || new Date();
      tx.source = data.source;
      tx.linkedRecurringId = data.linkedRecurringId || undefined;
      tx.smsFingerprint = data.smsFingerprint || undefined;
      tx.isDraft = false;
      tx.deleted = false;
    });

    // Update account balance in the same write block
    await account.update((acc) => {
      if (data.type === "EXPENSE") {
        acc.balance -= data.amount;
      } else {
        acc.balance += data.amount;
      }
    });

    return transaction;
  });

  return newTransaction;
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

  const scope = await getCurrentUserDataScope();

  await database.write(async () => {
    const transaction = await getOwnedTransaction(transactionId, scope);

    const oldType = transaction.type;
    const oldAmount = transaction.amount;
    const oldAccountId = transaction.accountId;

    const newType = updates.type ?? oldType;
    const newAmount = updates.amount !== undefined ? updates.amount : oldAmount;
    const newAccountId = updates.accountId ?? oldAccountId;

    const isAccountChanging = newAccountId !== oldAccountId;
    const isTypeChanging = newType !== oldType;
    const isAmountChanging = newAmount !== oldAmount;

    // Only adjust balances when amount, type, or account actually changed
    if (isAccountChanging || isTypeChanging || isAmountChanging) {
      // --- Revert the old effect on the old account ---
      const oldAccount = await getOwnedAccount(oldAccountId, scope);
      await oldAccount.update((acc) => {
        if (oldType === "EXPENSE") {
          acc.balance += oldAmount; // was -oldAmount, revert by +oldAmount
        } else {
          acc.balance -= oldAmount; // was +oldAmount, revert by -oldAmount
        }
      });

      // --- Apply the new effect on the (possibly different) account ---
      const targetAccount = isAccountChanging
        ? await getOwnedAccount(newAccountId, scope)
        : oldAccount;

      await targetAccount.update((acc) => {
        if (newType === "EXPENSE") {
          acc.balance -= newAmount;
        } else {
          acc.balance += newAmount;
        }
      });
    }

    // Update Transaction Record
    await transaction.update((tx) => {
      if (updates.amount !== undefined) tx.amount = updates.amount;
      if (updates.categoryId !== undefined) tx.categoryId = updates.categoryId;
      if (updates.note !== undefined) tx.note = updates.note;
      if (updates.date !== undefined) tx.date = updates.date;
      if (updates.counterparty !== undefined)
        tx.counterparty = updates.counterparty;
      if (updates.type !== undefined) tx.type = updates.type;
      if (updates.accountId !== undefined) tx.accountId = updates.accountId;
    });
  });
}

/**
 * Mark a transaction as deleted (soft delete).
 * Atomically reverses the account balance change and soft-deletes the record.
 */
export async function deleteTransaction(transactionId: string): Promise<void> {
  const scope = await getCurrentUserDataScope();

  await database.write(async () => {
    const transaction = await getOwnedTransaction(transactionId, scope);

    // Reverse the balance change
    const account = await getOwnedAccount(transaction.accountId, scope);

    await account.update((acc) => {
      if (transaction.type === "EXPENSE") {
        acc.balance += transaction.amount; // Restore balance
      } else {
        acc.balance -= transaction.amount;
      }
    });

    // Soft delete
    await transaction.update((tx) => {
      tx.deleted = true;
    });
  });
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
  const scope = await getCurrentUserDataScope();

  const transfersCollection = database.get<Transfer>("transfers");

  await database.write(async () => {
    const transaction = await getOwnedTransaction(payload.transactionId, scope);
    const toAccount = await getOwnedAccount(payload.toAccountId, scope);

    // 1. Revert the transaction's balance effect on its account
    const fromAccount = await getOwnedAccount(transaction.accountId, scope);
    await fromAccount.update((acc) => {
      if (transaction.type === "EXPENSE") {
        acc.balance += transaction.amount; // was -amount, revert
      } else {
        acc.balance -= transaction.amount; // was +amount, revert
      }
    });

    // 2. Soft-delete the transaction
    await transaction.update((tx) => {
      tx.deleted = true;
    });

    // 3. Create the new transfer
    await transfersCollection.create((t: Transfer) => {
      t.userId = scope.userId;
      t.fromAccountId = transaction.accountId;
      t.toAccountId = payload.toAccountId;
      t.amount = transaction.amount;
      t.currency = transaction.currency;
      t.date = transaction.date;
      t.notes = payload.notes ?? transaction.note ?? undefined;
      t.deleted = false;
    });

    // 4. Apply transfer balance effects
    // From-account already had the transaction effect reverted;
    // now debit it for the transfer
    await fromAccount.update((acc) => {
      acc.balance -= transaction.amount;
    });

    // Credit the to-account
    await toAccount.update((acc) => {
      acc.balance += transaction.amount;
    });
  });
}

// =============================================================================
// Batch Delete (Transactions + Transfers)
// =============================================================================

/**
 * Accumulates a balance delta for a given account ID into the Map.
 * If the account ID already exists, adds to the existing delta.
 */
function accumulateBalanceDelta(
  deltas: Map<string, number>,
  accountId: string,
  delta: number
): void {
  const existing = deltas.get(accountId) ?? 0;
  deltas.set(accountId, existing + delta);
}

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
  if (items.length === 0) return;
  const scope = await getCurrentUserDataScope();

  await database.write(async () => {
    // Phase 1: Validate item ownership and collect balance deltas (no DB reads)
    const balanceDeltas = new Map<string, number>();
    const recordsToDelete: Array<Transaction | Transfer> = [];

    for (const item of items) {
      if (item._type === "transaction") {
        const record = scope.assertOwned(item.record);
        recordsToDelete.push(record);

        if (record.isIncome) {
          accumulateBalanceDelta(
            balanceDeltas,
            record.accountId,
            -record.amount
          );
        } else if (record.isExpense) {
          accumulateBalanceDelta(
            balanceDeltas,
            record.accountId,
            record.amount
          );
        }
      } else if (item._type === "transfer") {
        const record = scope.assertOwned(item.record);
        recordsToDelete.push(record);
        accumulateBalanceDelta(
          balanceDeltas,
          record.fromAccountId,
          record.amount
        );
        const amountToDeduct = record.convertedAmount ?? record.amount;
        accumulateBalanceDelta(
          balanceDeltas,
          record.toAccountId,
          -amountToDeduct
        );
      }
    }

    // Phase 2: Batch-fetch all affected accounts in a single query
    const accountIds = Array.from(balanceDeltas.keys());
    const accounts =
      accountIds.length > 0
        ? await scope
            .queryOwned(
              database.get<Account>("accounts"),
              Q.where("id", Q.oneOf(accountIds))
            )
            .fetch()
        : [];

    assertFetchedAccountsCoverBalanceDeltas(accountIds, accounts);

    // Phase 3: Prepare balance updates and soft-deletes
    const batches: Model[] = [];

    for (const account of accounts) {
      const delta = balanceDeltas.get(account.id) ?? 0;
      if (delta !== 0) {
        batches.push(
          account.prepareUpdate((a) => {
            const nextBalance = a.balance + delta;
            if (!Number.isFinite(a.balance) || !Number.isFinite(nextBalance)) {
              throw new Error(INVALID_ACCOUNT_BALANCE_ERROR_CODE);
            }
            a.balance = nextBalance;
          })
        );
      }
    }

    for (const record of recordsToDelete) {
      batches.push(prepareSoftDeleteDisplayRecord(record));
    }

    // Execute everything in a single atomic batch
    await database.batch(batches);
  });
}

function prepareSoftDeleteDisplayRecord(record: Transaction | Transfer): Model {
  return record.prepareUpdate((record: Transaction | Transfer) => {
    record.deleted = true;
  });
}

function assertFetchedAccountsCoverBalanceDeltas(
  expectedAccountIds: readonly string[],
  accounts: readonly Account[]
): void {
  const fetchedAccountIds = new Set(accounts.map((account) => account.id));
  const missingAccountId = expectedAccountIds.find(
    (accountId) => !fetchedAccountIds.has(accountId)
  );

  if (missingAccountId) {
    throw new Error(BALANCE_REVERSAL_ACCOUNT_NOT_FOUND_ERROR_CODE);
  }
}
