const mockPrepare = jest.fn();
const mockDeleteResolved = jest.fn();
const mockDeleteDrafts = jest.fn();
const mockRunWriter = jest.fn();
const mockRevalidate = jest.fn();
const mockPreparePendingAccounts = jest.fn();
const mockPrepareCashAccount = jest.fn();
const mockHasExistingSmsFingerprint = jest.fn();

jest.mock("@/services/batch-create-transactions", () => ({
  prepareBatchCreateTransactions: (...args: readonly unknown[]): unknown =>
    mockPrepare(...args),
}));

jest.mock("@/services/sms-review-draft-repository", () => ({
  deleteResolvedSmsReviewDraftsInWriter: (
    ...args: readonly unknown[]
  ): unknown => mockDeleteResolved(...args),
  deleteSmsReviewDraftsInWriter: (...args: readonly unknown[]): unknown =>
    mockDeleteDrafts(...args),
  runSmsReviewDraftWriter: (action: () => Promise<unknown>): unknown =>
    mockRunWriter(action),
}));

jest.mock("@/services/pending-account-service", () => ({
  preparePendingAccounts: (...args: readonly unknown[]): unknown =>
    mockPreparePendingAccounts(...args),
}));

jest.mock("@/services/account-service", () => ({
  prepareCashAccount: (...args: readonly unknown[]): unknown =>
    mockPrepareCashAccount(...args),
}));

jest.mock("@/services/sms-dedup-service", () => ({
  hasExistingSmsFingerprint: (...args: readonly unknown[]): unknown =>
    mockHasExistingSmsFingerprint(...args),
}));

jest.mock("@/services/sms-review-draft-reference-service", () => ({
  revalidateSmsReviewDraftReferences: (...args: readonly unknown[]): unknown =>
    mockRevalidate(...args),
}));

import {
  saveSelectedSmsReviewDrafts,
  SmsReviewDraftSaveValidationError,
} from "@/services/sms-review-draft-save-service";
import { SMS_REVIEW_DRAFT_RETENTION_DAYS } from "@/services/sms-review-draft-retention";
import type {
  RevalidatedSmsReviewDraftItem,
  SmsReviewDraftHardValidationReason,
} from "@/services/sms-review-draft-reference-service";
import type { ParsedSmsTransaction } from "@monyvi/logic";

function item(
  draftId: string,
  hardValidationReasons: readonly SmsReviewDraftHardValidationReason[] = [],
  transactionOverrides: Partial<ParsedSmsTransaction> = {}
): RevalidatedSmsReviewDraftItem {
  const fingerprint = `fp-${draftId}`;
  return {
    draftId,
    queueId: "queue-1",
    transaction: {
      amount: 100,
      currency: "EGP" as const,
      type: "EXPENSE" as const,
      counterparty: "Shop",
      merchant: "Shop",
      date: new Date("2026-07-27T10:00:00.000Z"),
      categoryId: "cat-food",
      categoryDisplayName: "Food",
      confidence: 0.95,
      originLabel: "QNB EGYPT",
      source: "SMS" as const,
      smsFingerprint: fingerprint,
      senderDisplayName: "QNB EGYPT",
      rawSmsBody: "private sms",
      deduplicationHash: fingerprint,
      ...transactionOverrides,
    },
    selectionOverride: true,
    position: 0,
    parsedAt: new Date("2026-07-27T10:00:00.000Z"),
    updatedAt: new Date("2026-07-27T10:00:00.000Z"),
    hardValidationReasons,
  };
}

describe("saveSelectedSmsReviewDrafts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRevalidate.mockImplementation(
      (items: readonly unknown[]): Promise<readonly unknown[]> =>
        Promise.resolve(items)
    );
    mockHasExistingSmsFingerprint.mockResolvedValue(false);
    mockPreparePendingAccounts.mockResolvedValue({
      tempToRealIdMap: new Map(),
      createdCount: 0,
      errors: [],
      operations: [],
      preparedAccountIds: new Set(),
    });
    mockPrepareCashAccount.mockResolvedValue({
      accountId: "cash-account-1",
      created: false,
      operation: null,
    });
    mockPrepare.mockResolvedValue({
      savedCount: 2,
      failedCount: 0,
      errors: [],
      operations: [{ id: "financial-1" }],
      alreadySavedSmsFingerprints: new Set(),
      restoreCachedAccounts: jest.fn(),
    });
    mockDeleteResolved.mockResolvedValue(undefined);
    mockDeleteDrafts.mockResolvedValue(undefined);
    mockRunWriter.mockImplementation(async (action: () => Promise<unknown>) =>
      action()
    );
  });

  it("commits financial operations and selected draft deletion in one writer", async () => {
    const result = await saveSelectedSmsReviewDrafts({
      selectedItems: [item("draft-1"), item("draft-2")],
      expectedUserId: "user-1",
      transactionAccountMap: new Map([
        [0, "account-1"],
        [1, "account-1"],
      ]),
      toAccountMap: new Map(),
    });

    expect(result.savedCount).toBe(2);
    expect(mockRunWriter).toHaveBeenCalledTimes(1);
    expect(mockDeleteResolved).toHaveBeenCalledWith(
      ["draft-1", "draft-2"],
      "user-1",
      [{ id: "financial-1" }],
      new Set()
    );
  });

  it("passes preexisting saved fingerprints to final draft cleanup", async () => {
    const alreadySavedSmsFingerprints = new Set(["fp-draft-1"]);
    mockHasExistingSmsFingerprint.mockResolvedValue(true);
    mockPrepare.mockResolvedValue({
      savedCount: 0,
      failedCount: 0,
      errors: [],
      operations: [],
      alreadySavedSmsFingerprints,
      restoreCachedAccounts: jest.fn(),
    });

    await saveSelectedSmsReviewDrafts({
      selectedItems: [item("draft-1")],
      expectedUserId: "user-1",
      transactionAccountMap: new Map([[0, "account-1"]]),
      toAccountMap: new Map(),
    });

    expect(mockDeleteResolved).toHaveBeenCalledWith(
      ["draft-1"],
      "user-1",
      [],
      alreadySavedSmsFingerprints
    );
  });

  it("restores prepared account cache state when the atomic writer fails", async () => {
    const restoreCachedAccounts = jest.fn();
    mockPrepare.mockResolvedValue({
      savedCount: 1,
      failedCount: 0,
      errors: [],
      operations: [{ id: "financial-1" }],
      alreadySavedSmsFingerprints: new Set(),
      restoreCachedAccounts,
    });
    mockRunWriter.mockImplementation(async (action: () => Promise<unknown>) => {
      await action();
      throw new Error("adapter failed");
    });

    await expect(
      saveSelectedSmsReviewDrafts({
        selectedItems: [item("draft-1")],
        expectedUserId: "user-1",
        transactionAccountMap: new Map([[0, "account-1"]]),
        toAccountMap: new Map(),
      })
    ).rejects.toThrow("adapter failed");

    expect(restoreCachedAccounts).toHaveBeenCalledTimes(1);
  });

  it("blocks selected hard-invalid drafts before preparing writes", async () => {
    await expect(
      saveSelectedSmsReviewDrafts({
        selectedItems: [item("draft-1", ["account_required"])],
        expectedUserId: "user-1",
        transactionAccountMap: new Map(),
        toAccountMap: new Map(),
      })
    ).rejects.toBeInstanceOf(SmsReviewDraftSaveValidationError);

    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockRunWriter).toHaveBeenCalledTimes(1);
  });

  it("rejects a draft that expires before the save writer starts", async () => {
    const now = new Date("2026-07-27T10:00:00.000Z");
    const expiringItem = {
      ...item("draft-expiring"),
      parsedAt: new Date(
        now.getTime() -
          SMS_REVIEW_DRAFT_RETENTION_DAYS * 24 * 60 * 60 * 1000 +
          1
      ),
    };
    jest.useFakeTimers().setSystemTime(now);
    mockRunWriter.mockImplementationOnce(
      async (action: () => Promise<unknown>) => {
        jest.setSystemTime(new Date(now.getTime() + 2));
        return action();
      }
    );

    try {
      await expect(
        saveSelectedSmsReviewDrafts({
          selectedItems: [expiringItem],
          expectedUserId: "user-1",
          transactionAccountMap: new Map([[0, "account-1"]]),
          toAccountMap: new Map(),
        })
      ).rejects.toMatchObject({ reasons: ["draft_expired"] });
    } finally {
      jest.useRealTimers();
    }

    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockDeleteDrafts).toHaveBeenCalledWith(
      ["draft-expiring"],
      "user-1"
    );
  });

  it("revalidates the effective selected account before blocking save", async () => {
    mockRevalidate.mockImplementation(
      (
        items: ReadonlyArray<ReturnType<typeof item>>
      ): Promise<readonly RevalidatedSmsReviewDraftItem[]> =>
        Promise.resolve(
          items.map((draft) => ({ ...draft, hardValidationReasons: [] }))
        )
    );

    await saveSelectedSmsReviewDrafts({
      selectedItems: [item("draft-1", ["account_required"])],
      expectedUserId: "user-1",
      transactionAccountMap: new Map([[0, "account-current"]]),
      toAccountMap: new Map(),
    });

    expect(mockRevalidate).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          transaction: expect.objectContaining({
            accountId: "account-current",
          }) as ParsedSmsTransaction,
        }),
      ],
      "user-1"
    );
    expect(mockPrepare).toHaveBeenCalledTimes(1);
  });

  it("blocks a category that became unavailable before the atomic writer", async () => {
    mockRevalidate.mockImplementation(
      (
        items: ReadonlyArray<ReturnType<typeof item>>
      ): Promise<readonly RevalidatedSmsReviewDraftItem[]> =>
        Promise.resolve(
          items.map((draft) => ({
            ...draft,
            hardValidationReasons: ["category_unavailable"],
          }))
        )
    );

    await expect(
      saveSelectedSmsReviewDrafts({
        selectedItems: [item("draft-1")],
        expectedUserId: "user-1",
        transactionAccountMap: new Map([[0, "account-current"]]),
        toAccountMap: new Map(),
      })
    ).rejects.toBeInstanceOf(SmsReviewDraftSaveValidationError);

    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockRunWriter).toHaveBeenCalledTimes(1);
  });

  it("retains every draft when financial preparation reports a failure", async () => {
    const restoreCachedAccounts = jest.fn();
    mockPrepare.mockResolvedValue({
      savedCount: 1,
      failedCount: 1,
      errors: ["Transaction 2 needs a category"],
      operations: [{ id: "partial-operation" }],
      alreadySavedSmsFingerprints: new Set(),
      restoreCachedAccounts,
    });

    await expect(
      saveSelectedSmsReviewDrafts({
        selectedItems: [item("draft-1"), item("draft-2")],
        expectedUserId: "user-1",
        transactionAccountMap: new Map(),
        toAccountMap: new Map(),
      })
    ).rejects.toBeInstanceOf(SmsReviewDraftSaveValidationError);

    expect(mockRunWriter).toHaveBeenCalledTimes(1);
    expect(mockDeleteResolved).not.toHaveBeenCalled();
    expect(restoreCachedAccounts).toHaveBeenCalledTimes(1);
  });

  it("commits a newly created source account in the same batch as the financial record and draft deletion", async () => {
    const pendingAccount = {
      tempId: "pending-account-1",
      name: "QNB EGYPT",
      currency: "EGP" as const,
      type: "BANK" as const,
      senderDisplayName: "QNB EGYPT",
    };
    mockPreparePendingAccounts.mockResolvedValue({
      tempToRealIdMap: new Map([["pending-account-1", "account-created-1"]]),
      createdCount: 1,
      errors: [],
      operations: [{ id: "account-created-1" }],
      preparedAccountIds: new Set(["account-created-1"]),
    });

    await saveSelectedSmsReviewDrafts({
      selectedItems: [
        item("draft-1", [], {
          accountId: "pending-account-1",
          pendingAccount,
        }),
      ],
      expectedUserId: "user-1",
      transactionAccountMap: new Map([[0, "pending-account-1"]]),
      toAccountMap: new Map(),
    });

    expect(mockPreparePendingAccounts).toHaveBeenCalledWith(
      [pendingAccount],
      expect.objectContaining({
        expectedUserId: "user-1",
        initialBalanceByTempId: new Map([["pending-account-1", -100]]),
      })
    );
    expect(mockPrepare).toHaveBeenCalledWith(
      [expect.objectContaining({ smsFingerprint: "fp-draft-1" })],
      new Map([[0, "account-created-1"]]),
      new Map(),
      expect.objectContaining({
        expectedUserId: "user-1",
        preparedAccountCurrencies: new Map([["account-created-1", "EGP"]]),
      })
    );
    expect(mockDeleteResolved).toHaveBeenCalledWith(
      ["draft-1"],
      "user-1",
      [{ id: "account-created-1" }, { id: "financial-1" }],
      new Set()
    );
  });
});
