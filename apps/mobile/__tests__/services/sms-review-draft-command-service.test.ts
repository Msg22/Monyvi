import type { ParsedSmsTransaction } from "@monyvi/logic";

import {
  discardEverySmsReviewDraft,
  discardOneSmsReviewDraft,
  editSmsReviewDraft,
  setSmsReviewDraftSelection,
  SMS_REVIEW_UNDO_DURATION_MS,
  undoSmsReviewDraftDiscard,
} from "@/services/sms-review-draft-command-service";
import type { VolatileSmsReviewUndoItem } from "@/services/sms-review-draft-repository";

const mockDiscardAll = jest.fn();
const mockDiscardOne = jest.fn();
const mockRestore = jest.fn();
const mockUpdateItem = jest.fn();
const mockUpdateSelection = jest.fn();

jest.mock("@/services/sms-review-draft-repository", () => ({
  discardAllSmsReviewDrafts: (...args: readonly unknown[]): unknown =>
    mockDiscardAll(...args),
  discardSmsReviewDraft: (...args: readonly unknown[]): unknown =>
    mockDiscardOne(...args),
  restoreSmsReviewDraft: (...args: readonly unknown[]): unknown =>
    mockRestore(...args),
  updateSmsReviewDraftItem: (...args: readonly unknown[]): unknown =>
    mockUpdateItem(...args),
  updateSmsReviewDraftSelection: (...args: readonly unknown[]): unknown =>
    mockUpdateSelection(...args),
}));

const transaction: ParsedSmsTransaction = {
  amount: 100,
  currency: "EGP",
  type: "EXPENSE",
  counterparty: "Merchant",
  date: new Date("2026-07-27T12:00:00.000Z"),
  categoryId: "category-1",
  categoryDisplayName: "Shopping",
  confidence: 0.95,
  originLabel: "QNB EGYPT",
  source: "SMS",
  smsFingerprint: "fingerprint-1",
  senderDisplayName: "QNB EGYPT",
  rawSmsBody: "message",
};

function createUndoItem(expiresAt: number): VolatileSmsReviewUndoItem {
  return {
    draftId: "draft-1",
    userId: "user-1",
    queueId: "queue-1",
    smsFingerprint: "fingerprint-1",
    transaction,
    selectionOverride: false,
    position: 2,
    parsedAt: new Date("2026-07-27T12:00:00.000Z"),
    expiresAt,
  };
}

describe("sms-review-draft-command-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscardAll.mockResolvedValue(2);
    mockDiscardOne.mockImplementation(
      (_draftId: string, _userId: string, expiresAt: number) =>
        Promise.resolve(createUndoItem(expiresAt))
    );
    mockRestore.mockResolvedValue(undefined);
    mockUpdateItem.mockResolvedValue(undefined);
    mockUpdateSelection.mockResolvedValue(undefined);
  });

  it("delegates complete edits and nullable selection overrides", async () => {
    await editSmsReviewDraft("draft-1", "user-1", transaction);
    await setSmsReviewDraftSelection("draft-1", "user-1", null);

    expect(mockUpdateItem).toHaveBeenCalledWith(
      "draft-1",
      "user-1",
      transaction
    );
    expect(mockUpdateSelection).toHaveBeenCalledWith("draft-1", "user-1", null);
  });

  it("creates a bounded latest undo window for individual discard", async () => {
    const now = 1_000;

    const result = await discardOneSmsReviewDraft("draft-1", "user-1", now);

    expect(mockDiscardOne).toHaveBeenCalledWith(
      "draft-1",
      "user-1",
      now + SMS_REVIEW_UNDO_DURATION_MS
    );
    expect(result.expiresAt).toBe(now + SMS_REVIEW_UNDO_DURATION_MS);
  });

  it("restores before expiry and refuses an expired undo", async () => {
    const undoItem = createUndoItem(5_000);

    await expect(undoSmsReviewDraftDiscard(undoItem, 4_999)).resolves.toBe(
      true
    );
    expect(mockRestore).toHaveBeenCalledWith(undoItem);

    mockRestore.mockClear();
    await expect(undoSmsReviewDraftDiscard(undoItem, 5_000)).resolves.toBe(
      false
    );
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it("delegates final bulk discard without creating undo state", async () => {
    await expect(discardEverySmsReviewDraft("user-1")).resolves.toBe(2);
    expect(mockDiscardAll).toHaveBeenCalledWith("user-1");
    expect(mockRestore).not.toHaveBeenCalled();
  });
});
