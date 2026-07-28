import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useSmsReviewRetry } from "@/hooks/useSmsReviewRetry";

const mockUpdateReviewSession = jest.fn();
const mockRetrySmsReviewCandidates = jest.fn();
const mockMergeSmsReviewDrafts = jest.fn();

const parsedTransaction = {
  amount: 100,
  currency: "EGP",
  type: "EXPENSE",
  counterparty: "Retry Merchant",
  date: new Date("2026-07-20T11:00:00.000Z"),
  smsFingerprint: "fp-1",
  senderDisplayName: "NBE",
  categoryId: "cat-other",
  categoryDisplayName: "Other",
  rawSmsBody: "Purchase of EGP 100 at Retry Merchant",
  confidence: 0.85,
  source: "SMS",
  originLabel: "NBE",
} as const;

jest.mock("@/context/SmsScanContext", () => ({
  useSmsScanContext: () => ({
    transactions: [],
    unresolvedCandidates: [
      {
        candidate: {
          message: {
            id: "1",
            address: "NBE",
            body: "raw",
            date: 1,
            read: false,
          },
          smsFingerprint: "fp-1",
        },
        reason: "ai_failed",
        isRetryable: true,
      },
    ],
    parseContext: { categories: [], supportedCurrencies: ["EGP"] },
    reviewSessionId: 1,
    initiatingUserId: "user-1",
    updateReviewSession: mockUpdateReviewSession,
  }),
}));

jest.mock("@/services/sms-review-retry-service", () => ({
  retrySmsReviewCandidates: (...args: readonly unknown[]): unknown =>
    mockRetrySmsReviewCandidates(...args),
}));

jest.mock("@/services/sms-review-draft-repository", () => ({
  mergeSmsReviewDrafts: (...args: readonly unknown[]): unknown =>
    mockMergeSmsReviewDrafts(...args),
}));

jest.mock("@/services/ai-sms-parser-service", () => ({
  isAiConsentRequiredError: (error: unknown): boolean =>
    error instanceof Error && error.name === "AiConsentRequiredError",
}));

describe("useSmsReviewRetry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMergeSmsReviewDrafts.mockResolvedValue({
      insertedCount: 0,
      existingCount: 0,
      rejectedCount: 0,
      reviewableFingerprints: [],
    });
  });

  it("guards repeated taps and commits one atomic result", async () => {
    let resolveRetry: ((value: unknown) => void) | undefined;
    mockRetrySmsReviewCandidates.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRetry = resolve;
      })
    );
    const { result } = renderHook(() => useSmsReviewRetry());

    expect(result.current.unresolvedCount).toBe(1);
    expect(result.current.retryableCount).toBe(1);

    act(() => {
      void result.current.retry();
      void result.current.retry();
    });
    expect(mockRetrySmsReviewCandidates).toHaveBeenCalledTimes(1);

    act(() => {
      resolveRetry?.({
        transactions: [],
        unresolvedCandidates: [],
        hasRetryError: false,
      });
    });
    await waitFor(() => expect(result.current.isRetrying).toBe(false));
    expect(mockUpdateReviewSession).toHaveBeenCalledWith(
      {
        unresolvedCandidates: [],
      },
      1
    );
  });

  it("aborts in-flight retry on unmount without committing stale state", () => {
    let capturedSignal: AbortSignal | undefined;
    mockRetrySmsReviewCandidates.mockImplementationOnce(
      ({ abortSignal }: { readonly abortSignal: AbortSignal }) => {
        capturedSignal = abortSignal;
        return new Promise(() => undefined);
      }
    );
    const { result, unmount } = renderHook(() => useSmsReviewRetry());

    act(() => void result.current.retry());
    unmount();

    expect(capturedSignal?.aborted).toBe(true);
    expect(mockUpdateReviewSession).not.toHaveBeenCalled();
  });

  it("surfaces a generic retry failure without clearing pending candidates", async () => {
    mockRetrySmsReviewCandidates.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useSmsReviewRetry());

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.hasRetryError).toBe(true);
    expect(mockUpdateReviewSession).not.toHaveBeenCalled();
  });

  it("prunes a durably completed candidate before a later retry group fails", async () => {
    mockRetrySmsReviewCandidates.mockImplementationOnce(
      async ({
        onTransactionsCompleted,
      }: {
        readonly onTransactionsCompleted: (
          transactions: readonly (typeof parsedTransaction)[]
        ) => Promise<void>;
      }) => {
        await onTransactionsCompleted([
          { ...parsedTransaction, smsFingerprint: "fp-1" },
        ]);
        throw new Error("later group failed");
      }
    );
    mockMergeSmsReviewDrafts.mockResolvedValueOnce({
      insertedCount: 1,
      existingCount: 0,
      rejectedCount: 0,
      reviewableFingerprints: ["fp-1"],
    });
    const { result } = renderHook(() => useSmsReviewRetry());

    await act(async () => {
      await result.current.retry();
    });

    expect(mockMergeSmsReviewDrafts).toHaveBeenCalledWith({
      transactions: [{ ...parsedTransaction, smsFingerprint: "fp-1" }],
      expectedUserId: "user-1",
    });
    expect(mockUpdateReviewSession).toHaveBeenCalledWith(
      { unresolvedCandidates: [] },
      1
    );
    expect(result.current.hasRetryError).toBe(true);
  });

  it("keeps a retry candidate pending when durable merge rejects its result", async () => {
    mockRetrySmsReviewCandidates.mockImplementationOnce(
      async ({
        onTransactionsCompleted,
      }: {
        readonly onTransactionsCompleted: (
          transactions: readonly (typeof parsedTransaction)[]
        ) => Promise<void>;
      }) => {
        await onTransactionsCompleted([
          { ...parsedTransaction, smsFingerprint: "fp-1" },
        ]);
        throw new Error("later group failed");
      }
    );
    mockMergeSmsReviewDrafts.mockResolvedValueOnce({
      insertedCount: 0,
      existingCount: 0,
      rejectedCount: 1,
      reviewableFingerprints: [],
    });
    const { result } = renderHook(() => useSmsReviewRetry());

    await act(async () => {
      await result.current.retry();
    });

    expect(mockUpdateReviewSession).not.toHaveBeenCalled();
    expect(result.current.hasRetryError).toBe(true);
  });

  it("commits successful rows and surfaces a retryable partial failure", async () => {
    mockRetrySmsReviewCandidates.mockResolvedValueOnce({
      transactions: [],
      unresolvedCandidates: [
        {
          candidate: {
            message: {
              id: "1",
              address: "NBE",
              body: "raw",
              date: 1,
              read: false,
            },
            smsFingerprint: "fp-1",
          },
          reason: "ai_failed",
          isRetryable: true,
        },
      ],
      hasRetryError: true,
    });
    const { result } = renderHook(() => useSmsReviewRetry());

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.hasRetryError).toBe(true);
    expect(mockUpdateReviewSession).toHaveBeenCalledTimes(1);
  });

  it("persists successful retry results before updating the review session", async () => {
    mockRetrySmsReviewCandidates.mockResolvedValueOnce({
      transactions: [parsedTransaction],
      unresolvedCandidates: [],
      hasRetryError: false,
    });
    const { result } = renderHook(() => useSmsReviewRetry());

    await act(async () => {
      await result.current.retry();
    });

    expect(mockMergeSmsReviewDrafts).toHaveBeenCalledWith({
      transactions: [parsedTransaction],
      expectedUserId: "user-1",
    });
    expect(mockMergeSmsReviewDrafts.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpdateReviewSession.mock.invocationCallOrder[0]
    );
  });

  it("keeps retry results out of transient state when durable persistence fails", async () => {
    mockRetrySmsReviewCandidates.mockResolvedValueOnce({
      transactions: [parsedTransaction],
      unresolvedCandidates: [],
      hasRetryError: false,
    });
    mockMergeSmsReviewDrafts.mockRejectedValueOnce(new Error("storage full"));
    const { result } = renderHook(() => useSmsReviewRetry());

    await act(async () => {
      await result.current.retry();
    });

    expect(result.current.hasRetryError).toBe(true);
    expect(mockUpdateReviewSession).not.toHaveBeenCalled();
  });

  it("routes stale consent failures to consent recovery instead of generic retry error", async () => {
    const error = new Error("consent");
    error.name = "AiConsentRequiredError";
    mockRetrySmsReviewCandidates.mockRejectedValueOnce(error);
    const { result } = renderHook(() => useSmsReviewRetry());

    await act(async () => {
      await result.current.retry();
    });

    const consentState = result.current as typeof result.current & {
      readonly isConsentRequired: boolean;
      readonly dismissConsentRequired: () => void;
    };
    expect(consentState.isConsentRequired).toBe(true);
    expect(result.current.hasRetryError).toBe(false);

    act(() => consentState.dismissConsentRequired());
    expect(
      (
        result.current as typeof result.current & {
          readonly isConsentRequired: boolean;
        }
      ).isConsentRequired
    ).toBe(false);
  });
});
