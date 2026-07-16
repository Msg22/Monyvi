import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useSmsReviewRetry } from "@/hooks/useSmsReviewRetry";

const mockUpdateReviewSession = jest.fn();
const mockRetrySmsReviewCandidates = jest.fn();

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
    updateReviewSession: mockUpdateReviewSession,
  }),
}));

jest.mock("@/services/sms-review-retry-service", () => ({
  retrySmsReviewCandidates: (...args: readonly unknown[]): unknown =>
    mockRetrySmsReviewCandidates(...args),
}));

describe("useSmsReviewRetry", () => {
  beforeEach(() => jest.clearAllMocks());

  it("guards repeated taps and commits one atomic result", async () => {
    let resolveRetry: ((value: unknown) => void) | undefined;
    mockRetrySmsReviewCandidates.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRetry = resolve;
      })
    );
    const { result } = renderHook(() => useSmsReviewRetry());

    act(() => {
      void result.current.retry();
      void result.current.retry();
    });
    expect(mockRetrySmsReviewCandidates).toHaveBeenCalledTimes(1);

    act(() => {
      resolveRetry?.({ transactions: [], unresolvedCandidates: [] });
    });
    await waitFor(() => expect(result.current.isRetrying).toBe(false));
    expect(mockUpdateReviewSession).toHaveBeenCalledWith(
      {
        transactions: [],
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
});
