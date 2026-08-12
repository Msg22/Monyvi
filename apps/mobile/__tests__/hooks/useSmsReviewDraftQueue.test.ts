import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useSmsReviewDraftQueue } from "@/hooks/useSmsReviewDraftQueue";

const mockGetSnapshot = jest.fn();
const mockObserveChanges = jest.fn();
const mockRevalidate = jest.fn();
const mockCleanup = jest.fn();
const mockSetSelection = jest.fn();
let mockUserId: string | null = "user-a";

interface TestDraftItem {
  readonly draftId: string;
  readonly queueId: string;
  readonly transaction: { readonly smsFingerprint: string };
  readonly selectionOverride: boolean | null;
  readonly position: number;
  readonly parsedAt: Date;
  readonly updatedAt: Date;
}

interface TestQueueSnapshot {
  readonly queueId: string;
  readonly userId: string;
  readonly items: readonly TestDraftItem[];
  readonly itemCount: number;
  readonly earliestParsedAt: Date;
  readonly latestUpdatedAt: Date;
}

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): { userId: string | null; isResolvingUser: boolean } => ({
    userId: mockUserId,
    isResolvingUser: false,
  }),
}));

jest.mock("@/services/sms-review-draft-cleanup-service", () => ({
  cleanupExpiredSmsReviewDrafts: (...args: readonly unknown[]): unknown =>
    mockCleanup(...args),
}));

jest.mock("@/services/sms-review-draft-repository", () => ({
  getSmsReviewDraftQueueSnapshot: (...args: readonly unknown[]): unknown =>
    mockGetSnapshot(...args),
  observeSmsReviewDraftChanges: (...args: readonly unknown[]): unknown =>
    mockObserveChanges(...args),
}));

jest.mock("@/services/sms-review-draft-reference-service", () => ({
  revalidateSmsReviewDraftReferences: (...args: readonly unknown[]): unknown =>
    mockRevalidate(...args),
}));

jest.mock("@/services/sms-review-draft-command-service", () => ({
  setSmsReviewDraftSelection: (...args: readonly unknown[]): unknown =>
    mockSetSelection(...args),
}));

function createSnapshot(
  userId: string,
  fingerprint: string
): TestQueueSnapshot {
  const item = {
    draftId: `draft-${userId}`,
    queueId: `queue-${userId}`,
    transaction: { smsFingerprint: fingerprint },
    selectionOverride: null,
    position: 0,
    parsedAt: new Date("2026-07-20T00:00:00.000Z"),
    updatedAt: new Date("2026-07-20T00:00:00.000Z"),
  };
  return {
    queueId: `queue-${userId}`,
    userId,
    items: [item],
    itemCount: 1,
    earliestParsedAt: item.parsedAt,
    latestUpdatedAt: item.updatedAt,
  };
}

describe("useSmsReviewDraftQueue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = "user-a";
    mockCleanup.mockResolvedValue({
      deletedItemCount: 0,
      deletedQueueCount: 0,
    });
    mockObserveChanges.mockResolvedValue({
      subscribe: jest.fn(() => ({ unsubscribe: jest.fn() })),
    });
    mockRevalidate.mockImplementation(
      (items: readonly unknown[]): Promise<readonly unknown[]> =>
        Promise.resolve(items)
    );
    mockSetSelection.mockResolvedValue(undefined);
  });

  it("does not let an old account request replace the new account queue", async () => {
    let resolveOld: ((value: unknown) => void) | undefined;
    const oldRequest = new Promise((resolve) => {
      resolveOld = resolve;
    });
    const newSnapshot = createSnapshot("user-b", "fp-b");
    mockGetSnapshot.mockImplementation((userId: string) =>
      userId === "user-a" ? oldRequest : Promise.resolve(newSnapshot)
    );

    const { result, rerender } = renderHook(() => useSmsReviewDraftQueue());
    await waitFor(() => expect(mockGetSnapshot).toHaveBeenCalledWith("user-a"));

    mockUserId = "user-b";
    rerender(undefined);
    await waitFor(() => expect(result.current.userId).toBe("user-b"));
    await waitFor(() => expect(result.current.queueId).toBe("queue-user-b"));

    await act(async () => {
      resolveOld?.(createSnapshot("user-a", "fp-a"));
      await Promise.resolve();
    });

    expect(result.current.queueId).toBe("queue-user-b");
    expect(result.current.items[0]?.transaction.smsFingerprint).toBe("fp-b");
  });

  it("hides a loaded previous-user queue immediately while the next user loads", async () => {
    let resolveUserB: ((value: TestQueueSnapshot) => void) | undefined;
    const userBRequest = new Promise<TestQueueSnapshot>((resolve) => {
      resolveUserB = resolve;
    });
    mockGetSnapshot.mockImplementation((userId: string) =>
      userId === "user-a"
        ? Promise.resolve(createSnapshot("user-a", "fp-a"))
        : userBRequest
    );

    const { result, rerender } = renderHook(() => useSmsReviewDraftQueue());
    await waitFor(() => expect(result.current.queueId).toBe("queue-user-a"));

    mockUserId = "user-b";
    rerender(undefined);

    expect(result.current.userId).toBe("user-b");
    expect(result.current.queueId).toBeNull();
    expect(result.current.items).toEqual([]);
    expect(result.current.itemCount).toBe(0);

    await act(async () => {
      resolveUserB?.(createSnapshot("user-b", "fp-b"));
      await userBRequest;
    });
  });

  it("does not let an older same-user refetch replace a newer snapshot", async () => {
    let resolveOlder: ((value: TestQueueSnapshot) => void) | undefined;
    let resolveNewer: ((value: TestQueueSnapshot) => void) | undefined;
    const olderRequest = new Promise<TestQueueSnapshot>((resolve) => {
      resolveOlder = resolve;
    });
    const newerRequest = new Promise<TestQueueSnapshot>((resolve) => {
      resolveNewer = resolve;
    });
    mockGetSnapshot
      .mockReturnValueOnce(olderRequest)
      .mockReturnValueOnce(newerRequest);

    const { result } = renderHook(() => useSmsReviewDraftQueue());
    await waitFor(() => expect(mockGetSnapshot).toHaveBeenCalledTimes(1));

    await act(async () => {
      const newestRefetch = result.current.refetch();
      resolveNewer?.(createSnapshot("user-a", "fp-newer"));
      await newestRefetch;
    });
    expect(result.current.items[0]?.transaction.smsFingerprint).toBe(
      "fp-newer"
    );

    await act(async () => {
      resolveOlder?.(createSnapshot("user-a", "fp-older"));
      await olderRequest;
    });

    expect(result.current.items[0]?.transaction.smsFingerprint).toBe(
      "fp-newer"
    );
  });

  it("preserves unchanged draft item identity across observer refetches", async () => {
    const snapshot = createSnapshot("user-a", "fp-stable");
    mockGetSnapshot.mockImplementation(() =>
      Promise.resolve({
        ...snapshot,
        items: snapshot.items.map((item) => ({
          ...item,
          transaction: { ...item.transaction },
          parsedAt: new Date(item.parsedAt),
          updatedAt: new Date(item.updatedAt),
        })),
      })
    );

    const { result } = renderHook(() => useSmsReviewDraftQueue());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const firstItem = result.current.items[0];

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.items[0]).toBe(firstItem);
  });

  it("persists a stale selected override as unselected after hard validation", async () => {
    const snapshot = createSnapshot("user-a", "fp-hard");
    mockGetSnapshot.mockResolvedValue(snapshot);
    mockRevalidate.mockResolvedValue([
      {
        ...snapshot.items[0],
        selectionOverride: true,
        hardValidationReasons: ["account_unavailable"],
      },
    ]);

    const { result } = renderHook(() => useSmsReviewDraftQueue());

    await waitFor(() =>
      expect(mockSetSelection).toHaveBeenCalledWith(
        "draft-user-a",
        "user-a",
        false
      )
    );
    await waitFor(() =>
      expect(result.current.items[0]?.selectionOverride).toBe(false)
    );
  });
});
