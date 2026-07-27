const mockPrepare = jest.fn();
const mockDeleteResolved = jest.fn();
const mockRunWriter = jest.fn();
const mockRevalidate = jest.fn();

jest.mock("@/services/batch-create-transactions", () => ({
  prepareBatchCreateTransactions: (...args: readonly unknown[]): unknown =>
    mockPrepare(...args),
}));

jest.mock("@/services/sms-review-draft-repository", () => ({
  deleteResolvedSmsReviewDraftsInWriter: (
    ...args: readonly unknown[]
  ): unknown => mockDeleteResolved(...args),
  runSmsReviewDraftWriter: (action: () => Promise<unknown>): unknown =>
    mockRunWriter(action),
}));

jest.mock("@/services/pending-account-service", () => ({
  persistPendingAccounts: jest.fn(),
}));

jest.mock("@/services/account-service", () => ({
  ensureCashAccount: jest.fn(),
}));

jest.mock("@/services/sms-review-draft-reference-service", () => ({
  revalidateSmsReviewDraftReferences: (...args: readonly unknown[]): unknown =>
    mockRevalidate(...args),
}));

import {
  saveSelectedSmsReviewDrafts,
  SmsReviewDraftSaveValidationError,
} from "@/services/sms-review-save-service";
import type {
  RevalidatedSmsReviewDraftItem,
  SmsReviewDraftHardValidationReason,
} from "@/services/sms-review-draft-reference-service";
import type { ParsedSmsTransaction } from "@monyvi/logic";

function item(
  draftId: string,
  hardValidationReasons: readonly SmsReviewDraftHardValidationReason[] = []
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
    mockPrepare.mockResolvedValue({
      savedCount: 2,
      failedCount: 0,
      errors: [],
      operations: [{ id: "financial-1" }],
    });
    mockDeleteResolved.mockResolvedValue(undefined);
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
      [{ id: "financial-1" }]
    );
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
    expect(mockRunWriter).not.toHaveBeenCalled();
  });

  it("revalidates the effective selected account before blocking save", async () => {
    mockRevalidate.mockImplementation(
      (
        items: readonly ReturnType<typeof item>[]
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
        items: readonly ReturnType<typeof item>[]
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
    expect(mockRunWriter).not.toHaveBeenCalled();
  });

  it("retains every draft when financial preparation reports a failure", async () => {
    mockPrepare.mockResolvedValue({
      savedCount: 1,
      failedCount: 1,
      errors: ["Transaction 2 needs a category"],
      operations: [{ id: "partial-operation" }],
    });

    await expect(
      saveSelectedSmsReviewDrafts({
        selectedItems: [item("draft-1"), item("draft-2")],
        expectedUserId: "user-1",
        transactionAccountMap: new Map(),
        toAccountMap: new Map(),
      })
    ).rejects.toBeInstanceOf(SmsReviewDraftSaveValidationError);

    expect(mockRunWriter).not.toHaveBeenCalled();
    expect(mockDeleteResolved).not.toHaveBeenCalled();
  });
});
