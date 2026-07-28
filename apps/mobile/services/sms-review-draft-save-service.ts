import {
  prepareBatchCreateTransactions,
  type BatchSaveResult,
  type PreparedBatchSave,
} from "@/services/batch-create-transactions";
import { prepareCashAccount } from "@/services/account-service";
import {
  preparePendingAccounts,
  type PendingAccount,
} from "@/services/pending-account-service";
import {
  deleteResolvedSmsReviewDraftsInWriter,
  runSmsReviewDraftWriter,
} from "@/services/sms-review-draft-repository";
import {
  revalidateSmsReviewDraftReferences,
  type RevalidatedSmsReviewDraftItem,
} from "@/services/sms-review-draft-reference-service";
import { hasExistingSmsFingerprint } from "@/services/sms-dedup-service";
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

  try {
    await runSmsReviewDraftWriter(async (): Promise<void> => {
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
        if (await hasExistingSmsFingerprint(fingerprint)) {
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
      const cashBalanceByCurrency = new Map<CurrencyType, number>();
      const cashNameByCurrency = new Map<CurrencyType, string>();

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
        accumulate(
          cashBalanceByCurrency,
          item.transaction.currency,
          Math.abs(item.transaction.amount)
        );
        cashNameByCurrency.set(
          item.transaction.currency,
          item.transaction.toAccountName?.trim() || "Cash"
        );
      });

      const accountOperations = [...preparedPendingAccounts.operations];
      const preparedCashIdByCurrency = new Map<CurrencyType, string>();
      for (const [currency, initialBalance] of cashBalanceByCurrency) {
        const cashAccount = await prepareCashAccount(
          input.expectedUserId,
          currency,
          initialBalance,
          cashNameByCurrency.get(currency),
          input.expectedUserId
        );
        preparedCashIdByCurrency.set(currency, cashAccount.accountId);
        if (cashAccount.operation) {
          accountOperations.push(cashAccount.operation);
          preparedAccountCurrencies.set(cashAccount.accountId, currency);
        }
      }
      unsavedItems.forEach((item, index) => {
        if (isAtmWithdrawal(item.transaction) && !toAccountMap.has(index)) {
          const cashAccountId = preparedCashIdByCurrency.get(
            item.transaction.currency
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
      if (prepared.failedCount > 0) {
        throw new SmsReviewDraftSaveValidationError(prepared.errors);
      }
      preparedHolder.current = prepared;

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
