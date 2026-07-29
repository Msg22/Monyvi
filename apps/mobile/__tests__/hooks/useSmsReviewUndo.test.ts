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
  selectionOverride: boolean | null = null
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
    selectionOverride,
    position: 0,
    parsedAt: new Date("2026-07-27T09:12:00.000Z"),
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

  it("falls back to the sender label when merchant names are empty", async () => {
    mockDiscard.mockResolvedValue(createUndoItem(""));
    const { result } = renderHook(() => useSmsReviewUndo());

    await act(async () => result.current.discard("draft-empty", "user-1"));

    expect(result.current.discardedName).toBe("QNB EGYPT");
  });

  it("shows the optimistic Undo item immediately and preserves its live selection", async () => {
    let resolveDiscard!: (item: VolatileSmsReviewUndoItem) => void;
    const persistedItem = createUndoItem("Selected", null);
    const optimisticItem = createUndoItem("Selected", true);
    mockDiscard.mockReturnValue(
      new Promise<VolatileSmsReviewUndoItem>((resolve) => {
        resolveDiscard = resolve;
      })
    );
    const { result } = renderHook(() => useSmsReviewUndo());

    let discardRequest!: Promise<void>;
    act(() => {
      discardRequest = result.current.discard(
        optimisticItem.draftId,
        optimisticItem.userId,
        optimisticItem
      );
    });

    expect(result.current.undoItem).toEqual(optimisticItem);
    expect(result.current.undoItem?.selectionOverride).toBe(true);

    await act(async () => {
      resolveDiscard(persistedItem);
      await discardRequest;
    });

    expect(result.current.undoItem?.selectionOverride).toBe(true);
  });

  it("hides Undo immediately and restores once when discard persistence is pending", async () => {
    let resolveDiscard!: (item: VolatileSmsReviewUndoItem) => void;
    let resolveUndo!: (restored: boolean) => void;
    const optimisticItem = createUndoItem("Pending", false);
    mockDiscard.mockReturnValue(
      new Promise<VolatileSmsReviewUndoItem>((resolve) => {
        resolveDiscard = resolve;
      })
    );
    mockUndo.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveUndo = resolve;
      })
    );
    const { result } = renderHook(() => useSmsReviewUndo());

    act(() => {
      void result.current.discard(
        optimisticItem.draftId,
        optimisticItem.userId,
        optimisticItem
      );
    });

    let undoRequest!: Promise<boolean>;
    act(() => {
      undoRequest = result.current.undo();
    });
    expect(result.current.undoItem).toBeNull();
    expect(mockUndo).not.toHaveBeenCalled();

    await act(async () => {
      resolveDiscard(createUndoItem("Pending", null));
      await Promise.resolve();
    });
    expect(mockUndo).toHaveBeenCalledWith(
      expect.objectContaining({ selectionOverride: false })
    );
    expect(result.current.undoItem).toBeNull();

    await act(async () => {
      resolveUndo(true);
      await undoRequest;
    });
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(result.current.undoItem).toBeNull();
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

  it("restores the previous successful undo when a replacement discard fails", async () => {
    mockDiscard
      .mockResolvedValueOnce(createUndoItem("First"))
      .mockRejectedValueOnce(new Error("discard failed"));
    const { result } = renderHook(() => useSmsReviewUndo());

    await act(async () => result.current.discard("draft-1", "user-1"));
    await act(async () => {
      await expect(result.current.discard("draft-2", "user-1")).rejects.toThrow(
        "discard failed"
      );
    });

    expect(result.current.undoItem?.draftId).toBe("draft-First");
  });

  it("keeps an earlier in-flight discard undo when the newer discard fails", async () => {
    let resolveFirst!: (item: VolatileSmsReviewUndoItem) => void;
    let rejectSecond!: (error: Error) => void;
    const firstResult = new Promise<VolatileSmsReviewUndoItem>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResult = new Promise<VolatileSmsReviewUndoItem>(
      (_resolve, reject) => {
        rejectSecond = reject;
      }
    );
    mockDiscard
      .mockReturnValueOnce(firstResult)
      .mockReturnValueOnce(secondResult);
    const { result } = renderHook(() => useSmsReviewUndo());

    await act(async () => {
      const firstDiscard = result.current.discard("draft-1", "user-1");
      const secondDiscard = result.current.discard("draft-2", "user-1");
      rejectSecond(new Error("discard failed"));
      await expect(secondDiscard).rejects.toThrow("discard failed");
      resolveFirst(createUndoItem("First"));
      await firstDiscard;
    });

    expect(result.current.undoItem?.draftId).toBe("draft-First");
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

  it("does not re-show a closed banner when discard persistence finishes", async () => {
    let resolveDiscard!: (item: VolatileSmsReviewUndoItem) => void;
    const optimisticItem = createUndoItem("Hidden pending");
    mockDiscard.mockReturnValue(
      new Promise<VolatileSmsReviewUndoItem>((resolve) => {
        resolveDiscard = resolve;
      })
    );
    const { result } = renderHook(() => useSmsReviewUndo());

    let discardRequest!: Promise<void>;
    act(() => {
      discardRequest = result.current.discard(
        optimisticItem.draftId,
        optimisticItem.userId,
        optimisticItem
      );
      result.current.close();
    });
    expect(result.current.undoItem).toBeNull();

    await act(async () => {
      resolveDiscard(optimisticItem);
      await discardRequest;
    });

    expect(result.current.undoItem).toBeNull();
    mockDiscard.mockRejectedValueOnce(new Error("replacement failed"));
    await act(async () => {
      await expect(
        result.current.discard("draft-replacement", "user-1")
      ).rejects.toThrow("replacement failed");
    });
    expect(result.current.undoItem).toBeNull();
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

  it("coalesces repeated undo requests while restoration is pending", async () => {
    const item = createUndoItem("Restored");
    let resolveUndo!: (restored: boolean) => void;
    mockDiscard.mockResolvedValue(item);
    mockUndo.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveUndo = resolve;
      })
    );
    const { result } = renderHook(() => useSmsReviewUndo());

    await act(async () => {
      await result.current.discard(item.draftId, item.userId);
    });

    let firstUndo!: Promise<boolean>;
    let secondUndo!: Promise<boolean>;
    act(() => {
      firstUndo = result.current.undo();
      secondUndo = result.current.undo();
    });

    expect(mockUndo).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveUndo(true);
      await Promise.all([firstUndo, secondUndo]);
    });
    expect(result.current.undoItem).toBeNull();
  });

  it("keeps the visible undo until the user acts on it", async () => {
    mockDiscard.mockResolvedValue(createUndoItem("Persistent"));
    const { result } = renderHook(() => useSmsReviewUndo());

    await act(async () => result.current.discard("draft-1", "user-1"));
    act(() => jest.advanceTimersByTime(60_000));

    expect(result.current.undoItem?.draftId).toBe("draft-Persistent");
    expect(mockUndo).not.toHaveBeenCalled();
  });
});
