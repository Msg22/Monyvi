import {
  prepareBatchCreateTransactions,
  type BatchSaveResult,
  type PreparedBatchSave,
} from "@/services/batch-create-transactions";
import {
  prepareCashAccount,
  prepareNamedCashAccount,
} from "@/services/account-service";
import {
  preparePendingAccounts,
  type PendingAccount,
} from "@/services/pending-account-service";
import {
  deleteSmsReviewDraftsInWriter,
  deleteResolvedSmsReviewDraftsInWriter,
  runSmsReviewDraftWriter,
} from "@/services/sms-review-draft-repository";
import {
  revalidateSmsReviewDraftReferences,
  type RevalidatedSmsReviewDraftItem,
} from "@/services/sms-review-draft-reference-service";
import { hasExistingSmsFingerprint } from "@/services/sms-dedup-service";
import { isSmsReviewDraftExpired } from "@/services/sms-review-draft-retention";
import type { CurrencyType } from "@monyvi/db";
import type { ParsedSmsTransaction } from "@monyvi/logic";

export interface SaveSelectedSmsReviewDraftsInput {
  readonly selectedItems: readonly RevalidatedSmsReviewDraftItem[];
  readonly expectedUserId: string;
  readonly transactionAccountMap: ReadonlyMap<number, string>;
  readonly toAccountMap: ReadonlyMap<number, string>;
}

export class SmsReviewDraftSaveValidationError extends Error {
  public constructor(public readonly reasons: readonly string[]) {
    super("sms_review_drafts_invalid");
    this.name = "SmsReviewDraftSaveValidationError";
  }
}

function isAtmWithdrawal(transaction: ParsedSmsTransaction): boolean {
  return transaction.isAtmWithdrawal === true;
}

function sourceBalanceDelta(transaction: ParsedSmsTransaction): number {
  const amount = Math.abs(transaction.amount);
  if (isAtmWithdrawal(transaction)) return -amount;
  return transaction.type === "EXPENSE" ? -amount : amount;
}

function accumulate(
  values: Map<string, number>,
  key: string,
  delta: number
): void {
  values.set(key, (values.get(key) ?? 0) + delta);
}

export async function saveSelectedSmsReviewDrafts(
  input: SaveSelectedSmsReviewDraftsInput
): Promise<BatchSaveResult> {
  if (input.selectedItems.length === 0) {
    return { savedCount: 0, failedCount: 0, errors: [] };
  }

  const effectiveItems = input.selectedItems.map((item, index) => ({
    ...item,
    transaction: {
      ...item.transaction,
      accountId:
        input.transactionAccountMap.get(index) ?? item.transaction.accountId,
      toAccountId:
        input.toAccountMap.get(index) ?? item.transaction.toAccountId,
    },
  }));
  const preparedHolder: { current?: PreparedBatchSave } = {};
  let didDeleteExpiredDrafts = false;

  try {
    await runSmsReviewDraftWriter(async (): Promise<void> => {
      const expiredDrafts = effectiveItems.filter((item) =>
        isSmsReviewDraftExpired(item.parsedAt)
      );
      if (expiredDrafts.length > 0) {
        await deleteSmsReviewDraftsInWriter(
          expiredDrafts.map(({ draftId }) => draftId),
          input.expectedUserId
        );
        didDeleteExpiredDrafts = true;
        return;
      }
      const revalidatedItems = await revalidateSmsReviewDraftReferences(
        effectiveItems,
        input.expectedUserId
      );
      const hardValidationReasons = revalidatedItems.flatMap(
        (item) => item.hardValidationReasons
      );
      if (hardValidationReasons.length > 0) {
        throw new SmsReviewDraftSaveValidationError(hardValidationReasons);
      }

      const alreadySavedFingerprints = new Set<string>();
      const unsavedItems: RevalidatedSmsReviewDraftItem[] = [];
      const seenFingerprints = new Set<string>();
      for (const item of revalidatedItems) {
        const fingerprint = item.transaction.smsFingerprint;
        if (seenFingerprints.has(fingerprint)) continue;
        seenFingerprints.add(fingerprint);
        if (
          await hasExistingSmsFingerprint(fingerprint, input.expectedUserId)
        ) {
          alreadySavedFingerprints.add(fingerprint);
        } else {
          unsavedItems.push(item);
        }
      }

      const pendingAccountsByTempId = new Map<string, PendingAccount>();
      const initialBalanceByTempId = new Map<string, number>();
      unsavedItems.forEach((item) => {
        const pendingAccount = item.transaction.pendingAccount;
        if (
          !pendingAccount ||
          pendingAccount.tempId !== item.transaction.accountId
        ) {
          return;
        }
        pendingAccountsByTempId.set(pendingAccount.tempId, pendingAccount);
        accumulate(
          initialBalanceByTempId,
          pendingAccount.tempId,
          sourceBalanceDelta(item.transaction)
        );
      });
      const preparedPendingAccounts = await preparePendingAccounts(
        [...pendingAccountsByTempId.values()],
        {
          expectedUserId: input.expectedUserId,
          initialBalanceByTempId,
        }
      );
      if (preparedPendingAccounts.errors.length > 0) {
        throw new SmsReviewDraftSaveValidationError(
          preparedPendingAccounts.errors
        );
      }

      const preparedAccountCurrencies = new Map<string, CurrencyType>();
      pendingAccountsByTempId.forEach((account) => {
        const accountId = preparedPendingAccounts.tempToRealIdMap.get(
          account.tempId
        );
        if (
          accountId &&
          preparedPendingAccounts.preparedAccountIds.has(accountId)
        ) {
          preparedAccountCurrencies.set(accountId, account.currency);
        }
      });
      const transactionAccountMap = new Map<number, string>();
      const toAccountMap = new Map<number, string>();
      const cashDestinations = new Map<
        string,
        {
          readonly currency: CurrencyType;
          readonly name: string | null;
          readonly initialBalance: number;
        }
      >();
      const cashDestinationKeyByIndex = new Map<number, string>();

      unsavedItems.forEach((item, index) => {
        const sourceId = item.transaction.accountId;
        if (sourceId) {
          transactionAccountMap.set(
            index,
            preparedPendingAccounts.tempToRealIdMap.get(sourceId) ?? sourceId
          );
        }
        if (!isAtmWithdrawal(item.transaction)) return;
        if (item.transaction.toAccountId) {
          toAccountMap.set(index, item.transaction.toAccountId);
          return;
        }
        const name = item.transaction.toAccountName?.trim() || null;
        const destinationKey = name
          ? `named:${item.transaction.currency}:${name.toLowerCase()}`
          : `default:${item.transaction.currency}`;
        const existingDestination = cashDestinations.get(destinationKey);
        cashDestinations.set(destinationKey, {
          currency: item.transaction.currency,
          name,
          initialBalance:
            (existingDestination?.initialBalance ?? 0) +
            Math.abs(item.transaction.amount),
        });
        cashDestinationKeyByIndex.set(index, destinationKey);
      });

      const accountOperations = [...preparedPendingAccounts.operations];
      const preparedCashIdByDestinationKey = new Map<string, string>();
      for (const [destinationKey, destination] of cashDestinations) {
        const cashAccount = destination.name
          ? await prepareNamedCashAccount(
              input.expectedUserId,
              destination.currency,
              destination.initialBalance,
              destination.name,
              input.expectedUserId
            )
          : await prepareCashAccount(
              input.expectedUserId,
              destination.currency,
              destination.initialBalance,
              undefined,
              input.expectedUserId
            );
        preparedCashIdByDestinationKey.set(
          destinationKey,
          cashAccount.accountId
        );
        if (cashAccount.operation) {
          accountOperations.push(cashAccount.operation);
          preparedAccountCurrencies.set(
            cashAccount.accountId,
            destination.currency
          );
        }
      }
      unsavedItems.forEach((item, index) => {
        if (isAtmWithdrawal(item.transaction) && !toAccountMap.has(index)) {
          const cashAccountId = preparedCashIdByDestinationKey.get(
            cashDestinationKeyByIndex.get(index) ?? ""
          );
          if (cashAccountId) toAccountMap.set(index, cashAccountId);
        }
      });

      const prepared = await prepareBatchCreateTransactions(
        unsavedItems.map((item) => item.transaction),
        transactionAccountMap,
        toAccountMap,
        {
          expectedUserId: input.expectedUserId,
          preparedAccountCurrencies,
        }
      );
      preparedHolder.current = prepared;
      if (prepared.failedCount > 0) {
        throw new SmsReviewDraftSaveValidationError(prepared.errors);
      }

      await deleteResolvedSmsReviewDraftsInWriter(
        input.selectedItems.map((item) => item.draftId),
        input.expectedUserId,
        [...accountOperations, ...prepared.operations],
        new Set([
          ...alreadySavedFingerprints,
          ...prepared.alreadySavedSmsFingerprints,
        ])
      );
    });
    if (didDeleteExpiredDrafts) {
      throw new SmsReviewDraftSaveValidationError(["draft_expired"]);
    }
  } catch (error) {
    preparedHolder.current?.restoreCachedAccounts();
    throw error;
  }

  return {
    savedCount: preparedHolder.current?.savedCount ?? 0,
    failedCount: 0,
    errors: [],
  };
}
