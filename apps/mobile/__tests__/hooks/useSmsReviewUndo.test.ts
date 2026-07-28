import { act, renderHook } from "@testing-library/react-native";

import { useSmsReviewUndo } from "@/hooks/useSmsReviewUndo";
import type { VolatileSmsReviewUndoItem } from "@/services/sms-review-draft-repository";

const mockDiscard = jest.fn();
const mockUndo = jest.fn();

jest.mock("@/services/sms-review-draft-command-service", () => ({
  discardOneSmsReviewDraft: (...args: readonly unknown[]): unknown =>
    mockDiscard(...args),
  undoSmsReviewDraftDiscard: (...args: readonly unknown[]): unknown =>
    mockUndo(...args),
}));

function createUndoItem(
  name: string,
  expiresAt = Date.now() + 3_500
): VolatileSmsReviewUndoItem {
  return {
    draftId: `draft-${name}`,
    userId: "user-1",
    queueId: "queue-1",
    smsFingerprint: `fingerprint-${name}`,
    transaction: {
      amount: 10,
      currency: "EGP",
      type: "EXPENSE",
      counterparty: name,
      date: new Date("2026-07-27T09:12:00.000Z"),
      categoryId: "category-1",
      categoryDisplayName: "Other",
      confidence: 0.9,
      originLabel: "QNB EGYPT",
      source: "SMS",
      deduplicationHash: `fingerprint-${name}`,
      accountId: "account-1",
      merchant: name,
      reviewStatus: "auto_selectable",
      reviewReasons: [],
      smsFingerprint: `fingerprint-${name}`,
      senderDisplayName: "QNB EGYPT",
      rawSmsBody: "private body",
      isAtmWithdrawal: false,
    },
    selectionOverride: null,
    position: 0,
    parsedAt: new Date("2026-07-27T09:12:00.000Z"),
    expiresAt,
  } as const;
}

describe("useSmsReviewUndo", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps the latest user discard when operations resolve out of order", async () => {
    let resolveFirst!: (item: VolatileSmsReviewUndoItem) => void;
    let resolveSecond!: (item: VolatileSmsReviewUndoItem) => void;
    const firstResult = new Promise<VolatileSmsReviewUndoItem>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResult = new Promise<VolatileSmsReviewUndoItem>((resolve) => {
      resolveSecond = resolve;
    });
    mockDiscard
      .mockReturnValueOnce(firstResult)
      .mockReturnValueOnce(secondResult);
    const { result } = renderHook(() => useSmsReviewUndo());

    await act(async () => {
      const firstDiscard = result.current.discard("draft-1", "user-1");
      const secondDiscard = result.current.discard("draft-2", "user-1");
      resolveSecond(createUndoItem("Second"));
      await secondDiscard;
      resolveFirst(createUndoItem("First"));
      await firstDiscard;
    });

    expect(result.current.discardedName).toBe("Second");
    expect(result.current.undoItem?.draftId).toBe("draft-Second");
  });

  it("hides the previous undo as soon as a different discard starts", async () => {
    let resolveSecond!: (item: VolatileSmsReviewUndoItem) => void;
    const secondResult = new Promise<VolatileSmsReviewUndoItem>((resolve) => {
      resolveSecond = resolve;
    });
    mockDiscard
      .mockResolvedValueOnce(createUndoItem("First"))
      .mockReturnValueOnce(secondResult);
    mockUndo.mockResolvedValue(true);
    const { result } = renderHook(() => useSmsReviewUndo());

    await act(async () => result.current.discard("draft-1", "user-1"));
    expect(result.current.undoItem?.draftId).toBe("draft-First");

    let secondDiscard!: Promise<void>;
    act(() => {
      secondDiscard = result.current.discard("draft-2", "user-1");
    });
    expect(result.current.undoItem).toBeNull();

    let restored = true;
    await act(async () => {
      restored = await result.current.undo();
      resolveSecond(createUndoItem("Second"));
      await secondDiscard;
    });

    expect(restored).toBe(false);
    expect(mockUndo).not.toHaveBeenCalled();
    expect(result.current.undoItem?.draftId).toBe("draft-Second");
  });

  it("reuses an in-flight discard for the same draft", async () => {
    let resolveDiscard!: (item: VolatileSmsReviewUndoItem) => void;
    const discardResult = new Promise<VolatileSmsReviewUndoItem>((resolve) => {
      resolveDiscard = resolve;
    });
    mockDiscard.mockReturnValue(discardResult);
    const { result } = renderHook(() => useSmsReviewUndo());

    await act(async () => {
      const firstDiscard = result.current.discard("draft-1", "user-1");
      const repeatedDiscard = result.current.discard("draft-1", "user-1");

      expect(mockDiscard).toHaveBeenCalledTimes(1);
      resolveDiscard(createUndoItem("First"));
      await Promise.all([firstDiscard, repeatedDiscard]);
    });

    expect(result.current.undoItem?.draftId).toBe("draft-First");
  });

  it("hides the banner without restoring the suggestion", async () => {
    mockDiscard.mockResolvedValue(createUndoItem("Hidden"));
    const { result } = renderHook(() => useSmsReviewUndo());

    await act(async () => result.current.discard("draft-1", "user-1"));
    act(() => result.current.close());

    expect(result.current.undoItem).toBeNull();
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it("clears the latest undo after a successful restore", async () => {
    const item = createUndoItem("Restored");
    mockDiscard.mockResolvedValue(item);
    mockUndo.mockResolvedValue(true);
    const { result } = renderHook(() => useSmsReviewUndo());

    await act(async () => result.current.discard("draft-1", "user-1"));
    let restored = false;
    await act(async () => {
      restored = await result.current.undo();
    });

    expect(restored).toBe(true);
    expect(mockUndo).toHaveBeenCalledWith(item);
    expect(result.current.undoItem).toBeNull();
  });

  it("expires the visible undo without restoring it", async () => {
    mockDiscard.mockResolvedValue(createUndoItem("Expired", Date.now() + 100));
    const { result } = renderHook(() => useSmsReviewUndo());

    await act(async () => result.current.discard("draft-1", "user-1"));
    act(() => jest.advanceTimersByTime(100));

    expect(result.current.undoItem).toBeNull();
    expect(mockUndo).not.toHaveBeenCalled();
  });
});
