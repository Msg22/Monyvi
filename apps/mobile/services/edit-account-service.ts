/**
 * Edit Account Service
 *
 * Service functions for editing and deleting accounts.
 * Handles account updates, cascade deletes, balance adjustment tracking,
 * and account name uniqueness checks.
 *
 * Architecture & Design Rationale:
 * - Pattern: Service Layer (plain async functions, no React hooks)
 * - SOLID: SRP — handles edit/delete operations only, no UI concerns
 * - Offline-First: Soft deletes use the app-level `deleted` column so local
 *   state and Supabase sync semantics stay aligned.
 *
 * @module edit-account-service
 */

import {
  Account,
  AccountSmsSender,
  BankDetails,
  Debt,
  RecurringPayment,
  Transaction,
  Transfer,
  database,
  type CurrencyType,
  type TransactionType,
} from "@monyvi/db";
import {
  roundForCurrency,
  toMinorUnits,
  getCurrencyPrecision,
} from "@monyvi/logic";
import { Q, type Model } from "@nozbe/watermelondb";
import { t } from "i18next";
import { logger } from "@/utils/logger";
import { redactIdentifierForLog } from "@/utils/logger-redaction";
import { isInstitutionAllowedForAccountType } from "@/validation/account-validation";
import {
  USER_DATA_ACCESS_ERROR_CODES,
  findOwnedById,
  getCurrentUserDataScope,
  queryChildrenOfOwnedParent,
  queryOwned,
} from "./user-data-access";
import {
  prepareReplaceAccountSmsSenders,
  replaceAccountSmsSendersWithinWriter,
} from "./account-sms-sender-service";
import type { PrepareInsideWriterResult } from "./core-account-financial-action-service";
import type { FinancialActionLinkedExistingOperation } from "./financial-action-foundation-repository";
import { editGuardedAccount } from "./account-core-writer-production";
import type { AccountMetadataProjection } from "./account-core-writer-service";
import { normalizeCardLast4ForStorage } from "./card-last4-normalizer";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Well-known UUIDs for balance-adjustment categories.
 *
 * These are seeded by `supabase/migrations/032_seed_balance_adjustment_categories.sql`
 * and form a stable contract between the migration and this service. They are
 * intentionally hardcoded rather than looked up by name because:
 *
 * 1. Determinism — the IDs are fixed by the migration, not generated at
 *    runtime. There is no environment in which they differ.
 * 2. Performance — every balance-adjustment write would otherwise need an
 *    extra `categories` query (or a startup cache layer) to resolve them.
 * 3. Fail-fast — if the seed is ever missing, the foreign-key on
 *    `transactions.category_id` rejects the insert immediately, surfacing
 *    the breakage at write time rather than allowing a silent fallback.
 *
 * If the migration ever changes the UUIDs, both files must move in lockstep.
 */
const BALANCE_ADJUSTMENT_INCOME_CATEGORY_ID =
  "00000000-0000-0000-0001-000000000200";
const BALANCE_ADJUSTMENT_EXPENSE_CATEGORY_ID =
  "00000000-0000-0000-0001-000000000201";

const NO_PROVIDER_IDENTITY = "none";

/**
 * Typed error codes returned via {@link ServiceResult}.error.
 *
 * `OWNERSHIP_FAILED` — the requested account exists locally but its
 * `user_id` does not match the caller. Defense-in-depth on top of
 * Supabase RLS: we never write to another user's row even if a
 * foreign id reaches the service via deep-link or stale local SQLite.
 *
 * `NOT_FOUND` — the account id has no corresponding row.
 */
export const EDIT_ACCOUNT_ERROR_CODES = {
  OWNERSHIP_FAILED: "OWNERSHIP_FAILED",
  NOT_FOUND: "NOT_FOUND",
  INVALID_INSTITUTION_FOR_ACCOUNT_TYPE: "INVALID_INSTITUTION_FOR_ACCOUNT_TYPE",
} as const;
export type EditAccountErrorCode =
  (typeof EDIT_ACCOUNT_ERROR_CODES)[keyof typeof EDIT_ACCOUNT_ERROR_CODES];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data required to update an account. */
export interface UpdateAccountData {
  readonly name: string;
  readonly balance: number;
  readonly isDefault: boolean;
  readonly institutionId?: string | null;
  readonly providerDisplayName?: string;
  readonly senderNames?: readonly string[];
  readonly bankName?: string;
  readonly cardLast4?: string;
  readonly smsSenderName?: string;
}

/** Result of a service operation. */
export interface ServiceResult {
  readonly success: boolean;
  readonly error?: string;
}

/** Result of a uniqueness check. */
export interface UniquenessCheckResult {
  readonly isUnique: boolean;
  readonly error?: string;
}

export interface LinkedRecordsCounts {
  readonly transactions: number;
  readonly transfers: number;
  readonly debts: number;
  readonly recurringPayments: number;
}

export const EMPTY_LINKED_RECORDS_COUNTS: LinkedRecordsCounts = {
  transactions: 0,
  transfers: 0,
  debts: 0,
  recurringPayments: 0,
};

type SoftDeletableRecord = Model & {
  deleted: boolean;
};

function prepareSoftDelete<TRecord extends SoftDeletableRecord>(
  record: TRecord,
  applyAdditionalChanges?: (record: TRecord) => void
): TRecord {
  return record.prepareUpdate((draft) => {
    applyAdditionalChanges?.(draft);
    draft.deleted = true;
  });
}

function hasBankDetailsData(data: UpdateAccountData): boolean {
  return normalizeCardLast4ForStorage(data.cardLast4) !== undefined;
}

function normalizeProviderDisplayName(value?: string | null): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function buildProviderIdentity(
  institutionId?: string | null,
  providerDisplayName?: string | null
): string {
  const normalizedInstitutionId = institutionId?.trim();
  if (normalizedInstitutionId) {
    return `institution:${normalizedInstitutionId.toLowerCase()}`;
  }

  const normalizedProviderDisplayName =
    normalizeProviderDisplayName(providerDisplayName);
  if (normalizedProviderDisplayName) {
    return `manual:${normalizedProviderDisplayName}`;
  }

  return NO_PROVIDER_IDENTITY;
}

function hasOwnDataField<T extends object>(data: T, field: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(data, field);
}

/**
 * Signed balance delta in minor units, using the same canonical conversion
 * as the guarded account writer. A zero minor-unit delta takes the plain
 * metadata path; anything else becomes a guarded account effect.
 */
function minorUnitDelta(
  previousBalance: number,
  newBalance: number,
  currency: CurrencyType
): bigint {
  const places = getCurrencyPrecision(currency);
  const normalizedPrevious = roundForCurrency(previousBalance, currency);
  const normalizedNew = roundForCurrency(newBalance, currency);
  return (
    BigInt(toMinorUnits(normalizedNew.toFixed(places), places)) -
    BigInt(toMinorUnits(normalizedPrevious.toFixed(places), places))
  );
}

function resolveAccountMetadataUpdate(
  data: UpdateAccountData
): (projection: AccountMetadataProjection) => void {
  return (projection): void => {
    projection.name = data.name.trim();
    projection.isDefault = data.isDefault;
    if (hasOwnDataField(data, "institutionId")) {
      projection.institutionId = data.institutionId?.trim() || undefined;
    }
    if (hasOwnDataField(data, "providerDisplayName")) {
      projection.providerDisplayName =
        data.providerDisplayName?.trim() || undefined;
    } else if (hasOwnDataField(data, "bankName")) {
      projection.providerDisplayName = data.bankName?.trim() || undefined;
    }
  };
}

// ---------------------------------------------------------------------------
// T005: Account Name Uniqueness Check
// ---------------------------------------------------------------------------

/**
 * Check whether an account identity is unique for a user.
 *
 * Excludes the current account being edited (if provided) from the check.
 * Only checks against non-deleted accounts.
 * Identity is name + currency + provider:
 * - known providers use institution_id
 * - manual providers use normalized provider_display_name when present
 * - accounts without provider details use name + currency only
 *
 * @param userId - The authenticated user's ID
 * @param name - The account name to check
 * @param currency - The account's currency
 * @param excludeAccountId - The current account ID to exclude from the check
 * @param institutionId - Optional selected known provider ID
 * @param providerDisplayName - Optional manual provider display name
 * @returns UniquenessCheckResult with isUnique and optional error
 */
export async function checkAccountNameUniqueness(
  userId: string,
  name: string,
  currency: CurrencyType,
  excludeAccountId?: string,
  institutionId?: string | null,
  providerDisplayName?: string | null
): Promise<UniquenessCheckResult> {
  try {
    const trimmedName = name.trim().toLowerCase();
    if (!trimmedName) {
      return { isUnique: true };
    }

    const accountsCollection = database.get<Account>("accounts");

    const conditions = [
      Q.where("currency", currency),
      Q.where("deleted", Q.notEq(true)),
    ];

    if (excludeAccountId) {
      conditions.push(Q.where("id", Q.notEq(excludeAccountId)));
    }

    const existingAccounts = await queryOwned(
      accountsCollection,
      userId,
      ...conditions
    ).fetch();

    // Case-insensitive name comparison — WatermelonDB doesn't support
    // case-insensitive queries, so we filter in JS.
    const providerIdentity = buildProviderIdentity(
      institutionId ?? null,
      providerDisplayName
    );
    const isDuplicate = existingAccounts.some((account) => {
      const hasSameName = account.name.trim().toLowerCase() === trimmedName;
      if (!hasSameName) {
        return false;
      }

      return (
        buildProviderIdentity(
          account.institutionId ?? null,
          account.providerDisplayName
        ) === providerIdentity
      );
    });

    return { isUnique: !isDuplicate };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error checking account name uniqueness";
    logger.error("checkAccountNameUniqueness_failed", error);
    return { isUnique: false, error: message };
  }
}

export async function getAccountLinkedRecordCounts(
  accountId: string
): Promise<LinkedRecordsCounts> {
  const scope = await getCurrentUserDataScope();

  const [transactions, transfers, debts, recurringPayments] = await Promise.all(
    [
      scope
        .queryOwned(
          database.get<Transaction>("transactions"),
          Q.where("account_id", accountId),
          Q.where("deleted", false)
        )
        .fetchCount(),

      scope
        .queryOwned(
          database.get<Transfer>("transfers"),
          Q.and(
            Q.or(
              Q.where("from_account_id", accountId),
              Q.where("to_account_id", accountId)
            ),
            Q.where("deleted", false)
          )
        )
        .fetchCount(),

      scope
        .queryOwned(
          database.get<Debt>("debts"),
          Q.where("account_id", accountId),
          Q.where("deleted", false)
        )
        .fetchCount(),

      scope
        .queryOwned(
          database.get<RecurringPayment>("recurring_payments"),
          Q.where("account_id", accountId),
          Q.where("deleted", false)
        )
        .fetchCount(),
    ]
  );

  return {
    transactions,
    transfers,
    debts,
    recurringPayments,
  };
}

// ---------------------------------------------------------------------------
// T006: Update Account
// ---------------------------------------------------------------------------

/**
 * Update an account, routing balance-changing edits through the guarded
 * account writer and metadata-only edits through a plain atomic writer.
 *
 * Guarded path: the balance delta commits as one idempotent account effect
 * with the expected financial revision, while the row metadata, default
 * reassignment, SMS senders, bank details, and the optional
 * balance-adjustment transaction commit in the same atomic group via the
 * inside-writer hook. A stale row (moved balance or revision since this call
 * read it) fails closed inside the command and aborts the whole group.
 *
 * Plain path: when the delta rounds to zero minor units there is no
 * financial effect to guard, so the row metadata and siblings commit through
 * a plain writer exactly like the legacy flow, without touching the
 * protected revision.
 *
 * Throws on failure — guarded-path failures abort the command group, and
 * plain-path throws roll back the writer batch.
 *
 * Performs an ownership check before writing — if the account's `userId`
 * does not match `currentUserId`, throws `OWNERSHIP_FAILED` and performs
 * no writes.
 *
 * @param accountId - The ID of the account to update
 * @param data - The new account data (the new balance is `data.balance`)
 * @param currentUserId - The authenticated user's id (for the ownership check)
 * @param adjustment - When non-null, also creates a balance-adjustment
 *   transaction within the same atomic group. The delta is computed from the
 *   live balance read inside the group, never from form-state values.
 */
export async function updateAccountWithinWriter(
  accountId: string,
  data: UpdateAccountData,
  currentUserId: string,
  adjustment: BalanceAdjustmentPayload | null
): Promise<void> {
  const accountsCollection = database.get<Account>("accounts");

  let existingAccount: Account;
  try {
    existingAccount = await findOwnedById(
      accountsCollection,
      accountId,
      currentUserId
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED
    ) {
      logger.error(
        "Attempted to update account with mismatched user scope",
        undefined,
        {
          redactedAccountId: redactIdentifierForLog(accountId),
        }
      );
      throw new Error(EDIT_ACCOUNT_ERROR_CODES.OWNERSHIP_FAILED);
    }

    const message =
      error instanceof Error && error.message
        ? error.message
        : t("account_not_found");
    logger.error("Account not found", undefined, {
      redactedAccountId: redactIdentifierForLog(accountId),
    });
    throw new Error(message);
  }

  if (existingAccount.deleted) {
    logger.error("Attempted to update deleted account", undefined, {
      redactedAccountId: redactIdentifierForLog(accountId),
    });
    throw new Error(t("accounts:cannot_update_deleted_account"));
  }

  // Snapshot BEFORE mutating — this is the source of truth for any paired
  // balance-adjustment transaction (defends against stale form state).
  if (
    hasOwnDataField(data, "institutionId") &&
    !isInstitutionAllowedForAccountType(
      data.institutionId ?? null,
      existingAccount.type
    )
  ) {
    throw new Error(
      EDIT_ACCOUNT_ERROR_CODES.INVALID_INSTITUTION_FOR_ACCOUNT_TYPE
    );
  }

  const previousBalance = existingAccount.balance;
  const newBalance = roundForCurrency(data.balance, existingAccount.currency);

  if (
    minorUnitDelta(previousBalance, newBalance, existingAccount.currency) === 0n
  ) {
    await updateAccountMetadataWithinWriter(
      accountId,
      data,
      currentUserId,
      existingAccount,
      previousBalance,
      newBalance,
      adjustment
    );
    return;
  }

  const prepareInsideWriter = async (): Promise<PrepareInsideWriterResult> => {
    // Sibling writes are returned as plan fragments so they commit atomically
    // with the guarded account effect instead of committing early through
    // direct Model.update()/create() calls.
    const preparedCreates: Model[] = [];
    const existingOperations: FinancialActionLinkedExistingOperation[] = [];
    // Reassigning the default touches a different account row without a
    // balance effect, so it runs here as a plan operation inside the same
    // guarded batch.
    if (data.isDefault && !existingAccount.isDefault) {
      const currentDefaults = await queryOwned(
        accountsCollection,
        existingAccount.userId,
        Q.where("is_default", true),
        Q.where("deleted", Q.notEq(true)),
        Q.where("id", Q.notEq(accountId))
      ).fetch();

      // There should be at most one default, but we defensively unset the
      // first match just in case of data inconsistency.
      const currentDefault = currentDefaults[0];
      if (currentDefault) {
        const model: Model = currentDefault;
        existingOperations.push({
          kind: "update",
          model,
          update: (target): void => {
            (target as Account).isDefault = false;
          },
        });
      }
    }

    if (hasOwnDataField(data, "senderNames")) {
      const senders = await prepareReplaceAccountSmsSenders(
        existingAccount,
        currentUserId,
        data.senderNames ?? []
      );
      preparedCreates.push(...senders.preparedCreates);
      existingOperations.push(...senders.existingOperations);
    }

    // Update bank details if this is a bank account
    if (existingAccount.isBank) {
      const [activeBankDetail] = await queryChildrenOfOwnedParent(
        database.get<BankDetails>("bank_details"),
        existingAccount,
        currentUserId,
        "account_id",
        Q.where("deleted", false)
      ).fetch();

      if (activeBankDetail) {
        const model: Model = activeBankDetail;
        existingOperations.push({
          kind: "update",
          model,
          update: (target): void => {
            (target as BankDetails).cardLast4 = normalizeCardLast4ForStorage(
              data.cardLast4
            );
          },
        });
      } else if (hasBankDetailsData(data)) {
        preparedCreates.push(
          database.get<BankDetails>("bank_details").prepareCreate((bd) => {
            bd.accountId = accountId;
            bd.cardLast4 = normalizeCardLast4ForStorage(data.cardLast4);
            bd.deleted = false;
          })
        );
      }
    }
    return Object.freeze({
      preparedCreates: Object.freeze([...preparedCreates]),
      existingOperations: Object.freeze([...existingOperations]),
    });
  };

  const difference = newBalance - previousBalance;
  const isIncrease = difference > 0;
  const adjustmentTransaction =
    adjustment === null
      ? undefined
      : {
          accountId,
          amount: roundForCurrency(
            Math.abs(difference),
            existingAccount.currency
          ),
          categoryId: isIncrease
            ? BALANCE_ADJUSTMENT_INCOME_CATEGORY_ID
            : BALANCE_ADJUSTMENT_EXPENSE_CATEGORY_ID,
          currency: existingAccount.currency,
          date: new Date(),
          note: `Balance adjustment: ${previousBalance} \u2192 ${newBalance}`,
          source: "MANUAL" as const,
          type: (isIncrease ? "INCOME" : "EXPENSE") as TransactionType,
          userId: currentUserId,
        };

  await editGuardedAccount({
    account: existingAccount,
    adjustmentTransaction,
    nextBalance: newBalance,
    prepareInsideWriter,
    updateMetadata: resolveAccountMetadataUpdate(data),
    userId: currentUserId,
  });
}

/**
 * Metadata-only account update inside an already-open `database.write`
 * block: the legacy composition (default reassignment, row metadata, SMS
 * senders, bank details, optional adjustment transaction) without touching
 * the protected balance revision. Used only when the balance delta rounds
 * to zero minor units and there is no financial effect to guard.
 */
async function updateAccountMetadataWithinWriter(
  accountId: string,
  data: UpdateAccountData,
  currentUserId: string,
  existingAccount: Account,
  previousBalance: number,
  newBalance: number,
  adjustment: BalanceAdjustmentPayload | null
): Promise<void> {
  const accountsCollection = database.get<Account>("accounts");

  await database.write(async () => {
    // If setting as default, unset any current default for this user
    if (data.isDefault && !existingAccount.isDefault) {
      const currentDefaults = await queryOwned(
        accountsCollection,
        existingAccount.userId,
        Q.where("is_default", true),
        Q.where("deleted", Q.notEq(true)),
        Q.where("id", Q.notEq(accountId))
      ).fetch();

      // There should be at most one default, but we defensively unset all that match the criteria just in case of data inconsistency.
      const currentDefault = currentDefaults[0];
      if (currentDefault) {
        await currentDefault.update((acc) => {
          acc.isDefault = false;
        });
      }
    }

    // Update account metadata fields. The protected balance column is
    // deliberately untouched here: this path runs only for zero minor-unit
    // deltas, so any float dust below one minor unit is dropped instead of
    // being written outside the guarded boundary.
    await existingAccount.update((acc) => {
      acc.name = data.name.trim();
      acc.isDefault = data.isDefault;
      if (hasOwnDataField(data, "institutionId")) {
        acc.institutionId = data.institutionId?.trim() || undefined;
      }

      if (hasOwnDataField(data, "providerDisplayName")) {
        acc.providerDisplayName = data.providerDisplayName?.trim() || undefined;
      } else if (hasOwnDataField(data, "bankName")) {
        acc.providerDisplayName = data.bankName?.trim() || undefined;
      }
    });

    if (hasOwnDataField(data, "senderNames")) {
      await replaceAccountSmsSendersWithinWriter(
        existingAccount,
        currentUserId,
        data.senderNames ?? []
      );
    }

    // Update bank details if this is a bank account
    if (existingAccount.isBank) {
      const [activeBankDetail] = await queryChildrenOfOwnedParent(
        database.get<BankDetails>("bank_details"),
        existingAccount,
        currentUserId,
        "account_id",
        Q.where("deleted", false)
      ).fetch();

      if (activeBankDetail) {
        await activeBankDetail.update((bd) => {
          bd.cardLast4 = normalizeCardLast4ForStorage(data.cardLast4);
        });
      } else if (hasBankDetailsData(data)) {
        await database.get<BankDetails>("bank_details").create((bd) => {
          bd.accountId = accountId;
          bd.cardLast4 = normalizeCardLast4ForStorage(data.cardLast4);
          bd.deleted = false;
        });
      }
    }

    if (adjustment !== null) {
      await createBalanceAdjustmentTransactionWithinWriter(
        accountId,
        currentUserId,
        adjustment.currency,
        previousBalance,
        newBalance
      );
    }
  });
}

// ---------------------------------------------------------------------------
// T007: Delete Account With Cascade
// ---------------------------------------------------------------------------

/**
 * Cascade soft-deletes an account and all related records.
 *
 * Deletes in this order within a single write block:
 * 1. bank_details
 * 2. account_sms_senders
 * 3. transactions
 * 4. transfers (where account is from_account OR to_account)
 * 5. debts
 * 6. recurring_payments
 * 7. The account itself
 *
 * Uses the domain `deleted` column for sync-safe soft deletes.
 *
 * Performs an ownership check before any cascade — if the account's
 * `userId` does not match `currentUserId`, returns `OWNERSHIP_FAILED`
 * and performs no writes.
 *
 * @param accountId - The ID of the account to delete
 * @param currentUserId - The authenticated user's id (for the ownership check)
 * @returns ServiceResult with success and optional error code
 */
export async function deleteAccountWithCascade(
  accountId: string,
  currentUserId: string
): Promise<ServiceResult> {
  try {
    let ownershipFailed = false;
    let notFound = false;

    await database.write(async () => {
      const accountsCollection = database.get<Account>("accounts");
      const transfersCollection = database.get<Transfer>("transfers");

      let account: Account;
      try {
        account = await findOwnedById(
          accountsCollection,
          accountId,
          currentUserId
        );
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error.message === USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED
        ) {
          ownershipFailed = true;
        } else {
          notFound = true;
        }
        return;
      }

      // Fetch all non-deleted children via explicit filtered queries.
      const [
        bankDetailRecords,
        accountSmsSenderRecords,
        transactionRecords,
        fromTransfers,
        toTransfers,
        debtRecords,
        recurringPaymentRecords,
      ] = await Promise.all([
        queryChildrenOfOwnedParent(
          database.get<BankDetails>("bank_details"),
          account,
          currentUserId,
          "account_id",
          Q.where("deleted", false)
        ).fetch(),
        queryChildrenOfOwnedParent(
          database.get<AccountSmsSender>("account_sms_senders"),
          account,
          currentUserId,
          "account_id",
          Q.where("deleted", false)
        ).fetch(),
        queryOwned(
          database.get<Transaction>("transactions"),
          currentUserId,
          Q.where("account_id", accountId),
          Q.where("deleted", false)
        ).fetch(),
        queryOwned(
          database.get<Transfer>("transfers"),
          currentUserId,
          Q.where("from_account_id", accountId),
          Q.where("deleted", false)
        ).fetch(),
        queryOwned(
          transfersCollection,
          currentUserId,
          Q.where("to_account_id", accountId),
          Q.where("deleted", false)
        ).fetch(),
        queryOwned(
          database.get<Debt>("debts"),
          currentUserId,
          Q.where("account_id", accountId),
          Q.where("deleted", false)
        ).fetch(),
        queryOwned(
          database.get<RecurringPayment>("recurring_payments"),
          currentUserId,
          Q.where("account_id", accountId),
          Q.where("deleted", false)
        ).fetch(),
      ]);

      // Batch all domain soft-deletes into a single write for performance.
      const batchOps: SoftDeletableRecord[] = [
        ...bankDetailRecords.map((record) => prepareSoftDelete(record)),
        ...accountSmsSenderRecords.map((record) => prepareSoftDelete(record)),
        ...transactionRecords.map((record) => prepareSoftDelete(record)),
        ...fromTransfers.map((record) => prepareSoftDelete(record)),
        ...toTransfers.map((record) => prepareSoftDelete(record)),
        ...debtRecords.map((record) => prepareSoftDelete(record)),
        ...recurringPaymentRecords.map((record) => prepareSoftDelete(record)),
      ];

      batchOps.push(
        prepareSoftDelete(account, (acc) => {
          if (acc.isDefault) {
            acc.isDefault = false;
          }
        })
      );

      await database.batch(...batchOps);
    });

    if (notFound) {
      return { success: false, error: EDIT_ACCOUNT_ERROR_CODES.NOT_FOUND };
    }
    if (ownershipFailed) {
      return {
        success: false,
        error: EDIT_ACCOUNT_ERROR_CODES.OWNERSHIP_FAILED,
      };
    }

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error deleting account";
    logger.error("deleteAccountWithCascade_failed", error);
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// T008: Create Balance Adjustment Transaction
// ---------------------------------------------------------------------------

/**
 * Create a balance-adjustment transaction inside an already-open
 * `database.write` block.
 *
 * Skips creation entirely when the delta rounds to zero minor units for the
 * account currency — a fixed float epsilon would omit real high-precision
 * changes (for example 1000 satoshis on a BTC account).
 *
 * Throws on failure so the surrounding writer rolls back.
 *
 * @returns `true` if a transaction was actually created, `false` if skipped
 *          due to a zero minor-unit delta.
 */
async function createBalanceAdjustmentTransactionWithinWriter(
  accountId: string,
  userId: string,
  currency: CurrencyType,
  previousBalance: number,
  newBalance: number
): Promise<boolean> {
  if (minorUnitDelta(previousBalance, newBalance, currency) === 0n) {
    return false;
  }

  const difference = newBalance - previousBalance;
  const isIncome = difference > 0;
  const categoryId = isIncome
    ? BALANCE_ADJUSTMENT_INCOME_CATEGORY_ID
    : BALANCE_ADJUSTMENT_EXPENSE_CATEGORY_ID;
  const transactionType: TransactionType = isIncome ? "INCOME" : "EXPENSE";

  const transactionsCollection = database.get<Transaction>("transactions");

  await transactionsCollection.create((tx) => {
    tx.userId = userId;
    tx.accountId = accountId;
    tx.amount = roundForCurrency(Math.abs(difference), currency);
    tx.currency = currency;
    tx.type = transactionType;
    tx.categoryId = categoryId;
    tx.date = new Date();
    tx.source = "MANUAL";
    tx.isDraft = false;
    tx.deleted = false;
    tx.note = `Balance adjustment: ${previousBalance} \u2192 ${newBalance}`;
  });

  return true;
}

// ---------------------------------------------------------------------------
// Atomic update + balance-adjustment
// ---------------------------------------------------------------------------

/**
 * Optional balance-adjustment payload paired with an account update.
 *
 * Note: there is no `previousBalance` field. The previous balance is taken
 * from the live account row inside the writer batch \u2014 passing a form-state
 * value would risk silent corruption when another flow (e.g., sync) moved
 * the balance while the form was open.
 */
export interface BalanceAdjustmentPayload {
  readonly userId: string;
  readonly currency: CurrencyType;
}

/**
 * Update an account and (optionally) record the balance change as a
 * transaction in a single atomic group.
 *
 * Balance-changing edits route through the guarded account writer: the delta
 * commits as one idempotent account effect while the row metadata, default
 * reassignment, SMS senders, bank details, and the adjustment transaction
 * commit in the same group. Metadata-only edits (zero minor-unit delta) use
 * a plain writer without touching the protected revision.
 *
 * The balance-adjustment delta is computed from the **live** pre-update
 * balance (captured inside the writer) and `data.balance`. Callers do not
 * pass a `previousBalance` — this defends against stale form state if the
 * balance was moved by another flow (e.g., sync) while the form was open.
 *
 * @param accountId - The ID of the account to update
 * @param data - The new account data (the new balance is `data.balance`)
 * @param adjustment - When non-null, also creates a balance-adjustment
 *   transaction within the same atomic group.
 * @returns ServiceResult with success and optional error
 */
export async function updateAccountWithBalanceAdjustment(
  accountId: string,
  userId: string,
  data: UpdateAccountData,
  adjustment: BalanceAdjustmentPayload | null
): Promise<ServiceResult> {
  try {
    await updateAccountWithinWriter(accountId, data, userId, adjustment);

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error creating balance adjustment transaction";
    logger.error("updateAccountWithBalanceAdjustment_failed", error);
    return { success: false, error: message };
  }
}
