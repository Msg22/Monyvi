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
import type { ReviewableTransaction } from "@monyvi/logic";
import { Q, type Model } from "@nozbe/watermelondb";
import { ensureCashAccount } from "./account-service";
import { getCurrentUserId } from "./supabase";
import { queryAccessibleCategories, queryOwned } from "./user-data-access";
import { hasExistingSmsFingerprint } from "./sms-dedup-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BatchSaveResult {
  readonly savedCount: number;
  readonly failedCount: number;
  readonly errors: readonly string[];
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
export async function batchCreateTransactions<T extends ReviewableTransaction>(
  transactions: readonly T[],
  transactionAccountMap: ReadonlyMap<number, string>,
  toAccountMap?: ReadonlyMap<number, string>
): Promise<BatchSaveResult> {
  if (transactions.length === 0) {
    return { savedCount: 0, failedCount: 0, errors: [] };
  }

  // ── Pre-batch lookups (outside the write block) ──────────────────────

  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      savedCount: 0,
      failedCount: transactions.length,
      errors: ["User not authenticated"],
    };
  }

  const errors: string[] = [];
  const regularCategoryIds = new Set<string>();

  // Ensure Cash accounts exist for ATM withdrawal routing
  // Only needed for ATM transactions NOT already resolved via toAccountMap
  const cashAccountIdByCurrency = new Map<CurrencyType, string>();
  const atmCurrencies = new Set<CurrencyType>();

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (isAtmWithdrawalTransaction(tx)) {
      if (!toAccountMap?.has(i)) {
        atmCurrencies.add(tx.currency);
      }
      continue;
    }

    const categoryId = getRuntimeCategoryId(tx);
    if (categoryId) {
      regularCategoryIds.add(categoryId);
    }
  }

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

  // ── Prepare all operations in-memory ─────────────────────────────────

  const transactionsCollection = database.get<Transaction>("transactions");
  const transfersCollection = database.get<Transfer>("transfers");
  const accountsCollection = database.get<Account>("accounts");

  const preparedOps: Model[] = [];
  const balanceDeltas = new Map<string, number>();
  const seenSmsFingerprints = new Set<string>();
  let savedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const smsFingerprint =
      tx.source === "SMS" ? tx.deduplicationHash : undefined;

    if (tx.source === "SMS" && !smsFingerprint) {
      errors.push(`Missing SMS fingerprint for transaction index ${i}`);
      failedCount++;
      continue;
    }

    if (smsFingerprint && seenSmsFingerprints.has(smsFingerprint)) {
      continue;
    }

    if (smsFingerprint && (await hasExistingSmsFingerprint(smsFingerprint))) {
      seenSmsFingerprints.add(smsFingerprint);
      continue;
    }

    const accountId = transactionAccountMap.get(i);

    if (!accountId) {
      errors.push(
        `No account mapped for transaction index ${i} (${tx.counterparty})`
      );
      failedCount++;
      continue;
    }

    // ── ATM Withdrawal: prepare as Transfer (bank → cash) ──
    if (isAtmWithdrawalTransaction(tx)) {
      // Prefer user-selected TO account, fall back to auto-resolved by currency
      const cashAccountId =
        toAccountMap?.get(i) ?? cashAccountIdByCurrency.get(tx.currency);

      if (!cashAccountId) {
        errors.push(
          `Skipped ATM withdrawal index ${i} — failed to resolve Cash account in ${tx.currency}`
        );
        failedCount++;
        continue;
      }

      preparedOps.push(
        transfersCollection.prepareCreate((t) => {
          t.userId = userId;
          t.fromAccountId = accountId;
          t.toAccountId = cashAccountId;
          t.amount = Math.abs(tx.amount);
          t.currency = tx.currency;
          t.date = new Date(tx.date);
          t.notes = `ATM Withdrawal`;
          t.smsFingerprint = smsFingerprint;
          t.deleted = false;
        })
      );

      // Transfer balance effects: debit from-account, credit to-account
      const amount = Math.abs(tx.amount);
      accumulateBalanceDelta(balanceDeltas, accountId, -amount);
      accumulateBalanceDelta(balanceDeltas, cashAccountId, amount);

      savedCount++;
      if (smsFingerprint) {
        seenSmsFingerprints.add(smsFingerprint);
      }
      continue;
    }

    // ── Regular transaction ─
    const categoryId = getRuntimeCategoryId(tx);
    if (!categoryId) {
      errors.push(`Transaction ${i + 1} needs a category`);
      failedCount++;
      continue;
    }

    if (!accessibleCategoryIds.has(categoryId)) {
      errors.push(`Transaction ${i + 1} needs a valid category`);
      failedCount++;
      continue;
    }

    preparedOps.push(
      transactionsCollection.prepareCreate((record) => {
        record.userId = userId;
        record.accountId = accountId;
        record.amount = Math.abs(tx.amount);
        record.currency = tx.currency;
        record.type = tx.type;
        record.categoryId = categoryId;
        record.counterparty = tx.counterparty ?? undefined;
        record.note = "";
        record.date = tx.date;
        record.source = tx.source;
        record.smsFingerprint = smsFingerprint;
        record.isDraft = false;
        record.deleted = false;
      })
    );

    // Balance effects
    const amount = Math.abs(tx.amount);
    if (tx.type === "EXPENSE") {
      accumulateBalanceDelta(balanceDeltas, accountId, -amount);
    } else {
      accumulateBalanceDelta(balanceDeltas, accountId, amount);
    }

    savedCount++;
    if (smsFingerprint) {
      seenSmsFingerprints.add(smsFingerprint);
    }
  }

  // ── Batch-fetch all affected accounts and prepare balance updates ────

  const accountIds = Array.from(balanceDeltas.keys());
  if (accountIds.length > 0) {
    const accounts = await queryOwned(
      accountsCollection,
      userId,
      Q.where("id", Q.oneOf(accountIds))
    ).fetch();

    const existingIds = new Set(accounts.map((a) => a.id));
    const missingIds = accountIds.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(
        `[batch-create-transactions] Missing account rows for mapped IDs: ${missingIds.join(", ")}`
      );
    }

    for (const account of accounts) {
      const delta = balanceDeltas.get(account.id);
      if (delta && delta !== 0) {
        preparedOps.push(
          account.prepareUpdate((a) => {
            a.balance = (a.balance ?? 0) + delta;
          })
        );
      }
    }
  }

  // ── Execute everything in a single atomic batch ──────────────────────

  if (preparedOps.length > 0) {
    await database.write(async () => {
      await database.batch(preparedOps);
    });
  }

  return { savedCount, failedCount, errors };
}
