import {
  prepareBatchCreateTransactions,
  type BatchSaveResult,
} from "@/services/batch-create-transactions";
import {
  deleteResolvedSmsReviewDraftsInWriter,
  runSmsReviewDraftWriter,
} from "@/services/sms-review-draft-repository";
import {
  revalidateSmsReviewDraftReferences,
  type RevalidatedSmsReviewDraftItem,
} from "@/services/sms-review-draft-reference-service";

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
    },
  }));
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

  const prepared = await prepareBatchCreateTransactions(
    revalidatedItems.map((item) => item.transaction),
    input.transactionAccountMap,
    input.toAccountMap
  );
  if (prepared.failedCount > 0) {
    throw new SmsReviewDraftSaveValidationError(prepared.errors);
  }

  try {
    await runSmsReviewDraftWriter(async (): Promise<void> => {
      await deleteResolvedSmsReviewDraftsInWriter(
        input.selectedItems.map((item) => item.draftId),
        input.expectedUserId,
        prepared.operations,
        prepared.alreadySavedSmsFingerprints
      );
    });
  } catch (error) {
    prepared.restoreCachedAccounts();
    throw error;
  }

  return {
    savedCount: prepared.savedCount,
    failedCount: 0,
    errors: [],
  };
}
