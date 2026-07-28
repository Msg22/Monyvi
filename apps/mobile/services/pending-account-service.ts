/**
 * Pending Account Service
 *
 * Manages in-memory accounts created during the SMS review session.
 * These accounts are NOT persisted to WatermelonDB until the user
 * taps "Save All" on the review page.
 *
 * Architecture & Design Rationale:
 * - Pattern: Unit of Work — accumulates pending changes in memory,
 *   then commits them atomically in a single WatermelonDB batch write.
 * - Why: Avoids premature persistence of accounts the user might
 *   discard. Only referenced accounts are persisted on final save.
 * - SOLID: SRP — only handles pending account lifecycle.
 *   ISP — consumers only need `PendingAccount` (read) or
 *   `persistPendingAccounts` (write), not both.
 *
 * @module pending-account-service
 */

import {
  type AccountSmsSender,
  database,
  type Account,
  type AccountType,
  type BankDetails,
  type CurrencyType,
} from "@monyvi/db";
import { Q } from "@nozbe/watermelondb";
import { t } from "i18next";
import { normalizeAccountSmsSender } from "./account-sms-sender-service";
import { normalizeCardLast4ForStorage } from "./card-last4-normalizer";
import { getCurrentUserId } from "./supabase";
import { assertExpectedCurrentUser, queryOwned } from "./user-data-access";
import { commitPreparedBatch } from "./watermelon-atomic-batch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * In-memory account created during the review session.
 * Not persisted until final save — see `persistPendingAccounts`.
 */
interface PendingAccount {
  /** Temporary UUID generated client-side */
  readonly tempId: string;
  /** User-entered account name */
  readonly name: string;
  /** Currency inherited from the transaction */
  readonly currency: CurrencyType;
  /** Account type inferred from the SMS sender registry when possible. */
  readonly type: Extract<AccountType, "BANK" | "DIGITAL_WALLET">;
  /** Stable provider ID when the sender matches a known bank/wallet. */
  readonly institutionId?: string | null;
  /** Manual or known provider display name snapshot. */
  readonly providerDisplayName?: string | null;
  /** SMS sender display name saved to account_sms_senders */
  readonly senderDisplayName: string;
  /** Card last 4 digits from SMS body (for bank_details.card_last_4) */
  readonly cardLast4?: string;
}

/**
 * Result of persisting pending accounts to WatermelonDB.
 */
interface PersistResult {
  /** Maps PendingAccount.tempId → real WatermelonDB Account.id */
  readonly tempToRealIdMap: ReadonlyMap<string, string>;
  /** Number of Account records created */
  readonly createdCount: number;
  /** Errors encountered during creation */
  readonly errors: readonly string[];
}

interface PreparePendingAccountsOptions {
  readonly expectedUserId?: string;
  readonly initialBalanceByTempId?: ReadonlyMap<string, number>;
}

interface PreparedPendingAccounts extends PersistResult {
  readonly operations: readonly (Account | AccountSmsSender | BankDetails)[];
  readonly preparedAccountIds: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist pending accounts to WatermelonDB in a single atomic batch.
 *
 * Uses `prepareCreate` + `database.batch` to ensure true atomicity —
 * if any record fails to prepare, no records are committed.
 * All transactions on the review page must be valid before save,
 * so partial success is NOT acceptable.
 *
 * For each `PendingAccount`:
 * 1. Prepares an `Account` record with the inferred bank/wallet type
 * 2. Prepares an `AccountSmsSender` record and optional bank card details
 *
 * Only accounts referenced by at least one transaction should be
 * passed here — the caller filters unreferenced accounts first.
 *
 * @param pendingAccounts - Filtered list of referenced pending accounts
 * @returns Map of tempId → realId, plus count and error details
 */
async function persistPendingAccounts(
  pendingAccounts: readonly PendingAccount[]
): Promise<PersistResult> {
  const prepared = await preparePendingAccounts(pendingAccounts);
  if (prepared.errors.length > 0) {
    return {
      tempToRealIdMap: prepared.tempToRealIdMap,
      createdCount: 0,
      errors: prepared.errors,
    };
  }

  try {
    if (prepared.operations.length > 0) {
      await database.write(async (): Promise<void> => {
        await commitPreparedBatch(prepared.operations);
      });
    }
    return {
      tempToRealIdMap: prepared.tempToRealIdMap,
      createdCount: prepared.createdCount,
      errors: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      tempToRealIdMap: new Map(),
      createdCount: 0,
      errors: [`Batch write failed: ${message}`],
    };
  }
}

async function preparePendingAccounts(
  pendingAccounts: readonly PendingAccount[],
  options: PreparePendingAccountsOptions = {}
): Promise<PreparedPendingAccounts> {
  if (pendingAccounts.length === 0) {
    return {
      tempToRealIdMap: new Map(),
      createdCount: 0,
      errors: [],
      operations: [],
      preparedAccountIds: new Set(),
    };
  }

  const userId = await getCurrentUserId();
  if (
    !userId ||
    (options.expectedUserId && userId !== options.expectedUserId)
  ) {
    return {
      tempToRealIdMap: new Map(),
      createdCount: 0,
      errors: ["No authenticated user — cannot persist accounts"],
      operations: [],
      preparedAccountIds: new Set(),
    };
  }
  if (options.expectedUserId) {
    await assertExpectedCurrentUser(options.expectedUserId);
  }

  const tempToRealIdMap = new Map<string, string>();
  const errors: string[] = [];
  const preparedAccountIds = new Set<string>();

  try {
    // Pre-fetch existing active accounts for the same uniqueness contract used
    // remotely: name+currency+institution or name+currency+manual provider.
    const existingAccounts = await queryOwned(
      database.get<Account>("accounts"),
      userId,
      Q.where("deleted", false)
    ).fetch();

    // Track accounts mapped within this batch to avoid intra-batch duplicates
    const createdInBatch = new Map<
      string,
      { readonly realId: string; readonly type: AccountType }
    >();
    const initialBalanceByDedupKey = new Map<string, number>();
    for (const pending of pendingAccounts) {
      const initialBalance =
        options.initialBalanceByTempId?.get(pending.tempId) ?? 0;
      const dedupKey = buildAccountDedupKey(pending);
      initialBalanceByDedupKey.set(
        dedupKey,
        (initialBalanceByDedupKey.get(dedupKey) ?? 0) + initialBalance
      );
    }

    // Collect all DB operations to commit atomically
    const ops: Array<Account | AccountSmsSender | BankDetails> = [];

    for (const pending of pendingAccounts) {
      const dedupKey = buildAccountDedupKey(pending);

      // Check: already mapped earlier in this batch?
      const batchDuplicate = createdInBatch.get(dedupKey);
      if (batchDuplicate) {
        if (batchDuplicate.type !== pending.type) {
          errors.push(
            t("accounts:pending_account_type_conflict", {
              name: pending.name,
              currency: pending.currency,
            })
          );
          break;
        }

        // Safe to set immediately — references an already-committed or dedup'd ID
        tempToRealIdMap.set(pending.tempId, batchDuplicate.realId);
        continue;
      }

      // Check: already exists in DB?
      const existingIdentityMatch = existingAccounts.find(
        (acc) => buildAccountDedupKey(acc) === dedupKey
      );

      if (
        existingIdentityMatch &&
        existingIdentityMatch.type !== pending.type
      ) {
        errors.push(
          t("accounts:pending_account_type_conflict", {
            name: pending.name,
            currency: pending.currency,
          })
        );
        break;
      }

      const existingMatch =
        existingIdentityMatch?.type === pending.type
          ? existingIdentityMatch
          : undefined;

      if (existingMatch) {
        // Safe to set immediately — references a DB-existing record
        tempToRealIdMap.set(pending.tempId, existingMatch.id);
        createdInBatch.set(dedupKey, {
          realId: existingMatch.id,
          type: existingMatch.type,
        });
        continue;
      }

      // Prepare Account record (id assigned synchronously by prepareCreate)
      const account = database
        .get<Account>("accounts")
        .prepareCreate((record) => {
          record.userId = userId;
          record.name = pending.name;
          record.currency = pending.currency;
          record.type = pending.type;
          record.institutionId = pending.institutionId?.trim() || undefined;
          record.providerDisplayName =
            pending.providerDisplayName?.trim() || undefined;
          record.balance = initialBalanceByDedupKey.get(dedupKey) ?? 0;
          record.isDefault = false;
          record.deleted = false;
        });
      ops.push(account);
      preparedAccountIds.add(account.id);

      const senderDisplayName = pending.senderDisplayName.trim();
      const normalizedSender = normalizeAccountSmsSender(senderDisplayName);
      if (normalizedSender) {
        const sender = database
          .get<AccountSmsSender>("account_sms_senders")
          .prepareCreate((record) => {
            record.accountId = account.id;
            record.senderName = senderDisplayName;
            record.normalizedSenderName = normalizedSender;
            record.deleted = false;
          });
        ops.push(sender);
      }

      if (pending.type === "BANK") {
        const bankDetails = database
          .get<BankDetails>("bank_details")
          .prepareCreate((record) => {
            record.accountId = account.id;
            record.cardLast4 = normalizeCardLast4ForStorage(pending.cardLast4);
            record.deleted = false;
          });
        ops.push(bankDetails);
      }

      tempToRealIdMap.set(pending.tempId, account.id);

      // Track in createdInBatch so subsequent loop iterations can dedup
      createdInBatch.set(dedupKey, { realId: account.id, type: pending.type });
    }

    if (errors.length > 0) {
      return {
        tempToRealIdMap: new Map(),
        createdCount: 0,
        errors,
        operations: [],
        preparedAccountIds: new Set(),
      };
    }

    if (options.expectedUserId) {
      await assertExpectedCurrentUser(options.expectedUserId);
    }

    return {
      tempToRealIdMap,
      createdCount: preparedAccountIds.size,
      errors: [],
      operations: ops,
      preparedAccountIds,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      tempToRealIdMap: new Map(),
      createdCount: 0,
      errors: [`Account preparation failed: ${message}`],
      operations: [],
      preparedAccountIds: new Set(),
    };
  }
}

function buildAccountDedupKey(account: {
  readonly name: string;
  readonly currency: string;
  readonly institutionId?: string | null;
  readonly providerDisplayName?: string | null;
}): string {
  return [
    normalizeAccountName(account.name),
    account.currency,
    buildProviderIdentity(account),
  ].join("|");
}

function normalizeAccountName(name: string): string {
  return name.trim().toLowerCase();
}

function buildProviderIdentity(account: {
  readonly institutionId?: string | null;
  readonly providerDisplayName?: string | null;
}): string {
  const institutionId = account.institutionId?.trim();
  if (institutionId) {
    return `institution:${institutionId}`;
  }

  const providerDisplayName = account.providerDisplayName
    ?.trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  return providerDisplayName
    ? `manual:${providerDisplayName}`
    : "manual:__monyvi_no_provider__";
}

export { persistPendingAccounts, preparePendingAccounts };
export type {
  PendingAccount,
  PersistResult,
  PreparePendingAccountsOptions,
  PreparedPendingAccounts,
};
