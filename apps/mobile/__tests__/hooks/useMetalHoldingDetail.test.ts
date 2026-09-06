import { act, renderHook, waitFor } from "@testing-library/react-native";

interface MockSubscription {
  readonly unsubscribe: jest.Mock<void, []>;
}

interface MockTrustObserver {
  readonly next: (value: unknown) => void;
  readonly error: (cause: unknown) => void;
}

interface MockTrustObservation {
  readonly refresh: jest.Mock<void, []>;
  readonly subscribe: (observer: MockTrustObserver) => MockSubscription;
}

interface MockLocalQuery {
  readonly observe: () => {
    readonly subscribe: (next: () => void) => MockSubscription;
  };
}

const mockDatabase = { id: "database" };
const mockUnsubscribe = jest.fn<void, []>();
const mockTrustRefresh = jest.fn<void, []>();
const mockAppStateRemove = jest.fn<void, []>();
const mockLocalSubscribers: Array<() => void> = [];
let mockTrustObserver: MockTrustObserver | null = null;
let mockAppStateListener: ((state: string) => void) | null = null;
let mockUserId: string | null = "user-1";

const mockCreateLocalQuery = jest.fn<MockLocalQuery, []>(() => ({
  observe: () => ({
    subscribe: (next: () => void): MockSubscription => {
      mockLocalSubscribers.push(next);
      return { unsubscribe: mockUnsubscribe };
    },
  }),
}));
const mockObserveMetalDetailHolding = jest.fn<MockLocalQuery, [string, string]>(
  () => mockCreateLocalQuery()
);
const mockObserveMetalDetailHoldingState = jest.fn<
  MockLocalQuery,
  [string, string]
>(() => mockCreateLocalQuery());
const mockObserveMetalDetailEvents = jest.fn<MockLocalQuery, [string, string]>(
  () => mockCreateLocalQuery()
);
const mockObserveMetalDetailActionEvidence = jest.fn<
  MockLocalQuery,
  [string, string]
>(() => mockCreateLocalQuery());
const mockObserveMetalDetailRateReferences = jest.fn<
  MockLocalQuery,
  [string, string]
>(() => mockCreateLocalQuery());
const mockReadMetalDetailReadModel = jest.fn<Promise<unknown>, [unknown]>();
const mockSyncDatabase = jest.fn<Promise<void>, [unknown]>(() =>
  Promise.resolve()
);

jest.mock("@react-navigation/native", () => ({
  useIsFocused: (): boolean => true,
}));

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): {
    readonly isResolvingUser: boolean;
    readonly userId: string | null;
  } => ({
    isResolvingUser: false,
    userId: mockUserId,
  }),
}));

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): { readonly isConnected: boolean } => ({
    isConnected: true,
  }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): {
    readonly isLoading: boolean;
    readonly preferredCurrency: "EGP";
  } => ({
    isLoading: false,
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@/providers/DatabaseProvider", () => ({
  useDatabase: (): typeof mockDatabase => mockDatabase,
}));

jest.mock("@/services/live-rates-trust-read-model-service", () => ({
  observeLiveRatesTrust: (): MockTrustObservation => ({
    refresh: mockTrustRefresh,
    subscribe: (observer: MockTrustObserver): MockSubscription => {
      mockTrustObserver = observer;
      return { unsubscribe: mockUnsubscribe };
    },
  }),
}));

jest.mock("react-native", () => {
  const mockReactNative =
    jest.createMockFromModule<typeof import("react-native")>("react-native");
  return {
    ...mockReactNative,
    AppState: {
      ...mockReactNative.AppState,
      addEventListener: (
        _event: string,
        listener: (state: string) => void
      ): { readonly remove: jest.Mock<void, []> } => {
        mockAppStateListener = listener;
        return { remove: mockAppStateRemove };
      },
    },
  };
});

jest.mock("@/services/metal-action-evidence-observer-service", () => ({
  observeMetalDetailActionEvidence: (...args: [string, string]) =>
    mockObserveMetalDetailActionEvidence(...args),
}));

jest.mock("@/services/metal-detail-read-model-service", () => ({
  observeMetalDetailEvents: (...args: [string, string]) =>
    mockObserveMetalDetailEvents(...args),
  observeMetalDetailHolding: (...args: [string, string]) =>
    mockObserveMetalDetailHolding(...args),
  observeMetalDetailHoldingState: (...args: [string, string]) =>
    mockObserveMetalDetailHoldingState(...args),
  observeMetalDetailRateReferences: (...args: [string, string]) =>
    mockObserveMetalDetailRateReferences(...args),
  readMetalDetailReadModel: (...args: [unknown]) =>
    mockReadMetalDetailReadModel(...args),
}));

jest.mock("@/services/sync", () => ({
  syncDatabase: (...args: [unknown]) => mockSyncDatabase(...args),
}));

import { useMetalHoldingDetail } from "@/hooks/useMetalHoldingDetail";

const initialRates = {
  currencies: new Map([
    [
      "EGP",
      {
        ageMs: 1_000,
        providerObservedAt: new Date("2026-09-06T10:00:00.000Z"),
        state: "fresh",
        valueDecimal: "0.0204",
      },
    ],
  ]),
  gold: {
    ageMs: 1_000,
    providerObservedAt: new Date("2026-09-06T10:00:00.000Z"),
    state: "fresh",
    valueDecimal: "81.5",
  },
  silver: { ageMs: null, providerObservedAt: null, state: "missing" },
};

describe("useMetalHoldingDetail", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalSubscribers.splice(0);
    mockTrustObserver = null;
    mockAppStateListener = null;
    mockUserId = "user-1";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("re-reads the holding when any lifecycle dependency changes", async () => {
    const model = { holdingId: "holding-1" };
    mockReadMetalDetailReadModel.mockResolvedValue(model);
    const { result } = renderHook(() => useMetalHoldingDetail("holding-1"));

    act(() => {
      mockTrustObserver?.next(initialRates);
    });
    await waitFor(() => expect(result.current.model).toBe(model));

    expect(mockObserveMetalDetailHolding).toHaveBeenCalledWith(
      "user-1",
      "holding-1"
    );
    expect(mockObserveMetalDetailHoldingState).toHaveBeenCalledWith(
      "user-1",
      "holding-1"
    );
    expect(mockObserveMetalDetailEvents).toHaveBeenCalledWith(
      "user-1",
      "holding-1"
    );
    expect(mockObserveMetalDetailActionEvidence).toHaveBeenCalledWith(
      "user-1",
      "holding-1"
    );
    expect(mockObserveMetalDetailRateReferences).toHaveBeenCalledWith(
      "user-1",
      "holding-1"
    );
    expect(mockLocalSubscribers).toHaveLength(5);

    act(() => {
      mockLocalSubscribers[3]?.();
    });
    await waitFor(() =>
      expect(mockReadMetalDetailReadModel).toHaveBeenCalledTimes(2)
    );
    expect(result.current.model).toBe(model);
  });

  it("uses retry to start a real sync and re-read the local model", async () => {
    mockReadMetalDetailReadModel.mockResolvedValue({ holdingId: "holding-1" });
    const { result } = renderHook(() => useMetalHoldingDetail("holding-1"));

    act(() => {
      mockTrustObserver?.next(initialRates);
    });
    await waitFor(() =>
      expect(mockReadMetalDetailReadModel).toHaveBeenCalledTimes(1)
    );

    act(() => {
      result.current.retry();
    });

    await waitFor(() =>
      expect(mockSyncDatabase).toHaveBeenCalledWith(mockDatabase)
    );
    await waitFor(() =>
      expect(mockReadMetalDetailReadModel).toHaveBeenCalledTimes(2)
    );
  });

  it("re-values the holding when a newer trusted rate arrives", async () => {
    mockReadMetalDetailReadModel.mockResolvedValue({ holdingId: "holding-1" });
    renderHook(() => useMetalHoldingDetail("holding-1"));

    act(() => {
      mockTrustObserver?.next(initialRates);
    });
    await waitFor(() =>
      expect(mockReadMetalDetailReadModel).toHaveBeenCalledTimes(1)
    );

    const updatedRates = {
      ...initialRates,
      gold: {
        ...initialRates.gold,
        providerObservedAt: new Date("2026-09-06T10:05:00.000Z"),
        valueDecimal: "82.25",
      },
    };
    act(() => {
      mockTrustObserver?.next(updatedRates);
    });

    await waitFor(() =>
      expect(mockReadMetalDetailReadModel).toHaveBeenLastCalledWith({
        currentRates: updatedRates,
        holdingId: "holding-1",
        preferredCurrency: "EGP",
        userId: "user-1",
      })
    );
  });

  it("clears an old model before a replacement holding finishes loading", async () => {
    let resolveReplacement: ((value: unknown) => void) | null = null;
    const firstModel = { holdingId: "holding-1" };
    const replacementModel = { holdingId: "holding-2" };
    mockReadMetalDetailReadModel
      .mockResolvedValueOnce(firstModel)
      .mockImplementationOnce(
        () =>
          new Promise<unknown>((resolve) => {
            resolveReplacement = resolve;
          })
      );
    const { result, rerender } = renderHook(
      ({ holdingId }: { readonly holdingId: string }) =>
        useMetalHoldingDetail(holdingId),
      { initialProps: { holdingId: "holding-1" } }
    );

    act(() => {
      mockTrustObserver?.next(initialRates);
    });
    await waitFor(() => expect(result.current.model).toBe(firstModel));

    rerender({ holdingId: "holding-2" });

    expect(result.current.model).toBeNull();

    act(() => {
      resolveReplacement?.(replacementModel);
    });
    await waitFor(() => expect(result.current.model).toBe(replacementModel));
  });

  it("clears an old model before a replacement user finishes loading", async () => {
    let resolveReplacement: ((value: unknown) => void) | null = null;
    const firstModel = { holdingId: "holding-1", userId: "user-1" };
    const replacementModel = { holdingId: "holding-1", userId: "user-2" };
    mockReadMetalDetailReadModel
      .mockResolvedValueOnce(firstModel)
      .mockImplementationOnce(
        () =>
          new Promise<unknown>((resolve) => {
            resolveReplacement = resolve;
          })
      );
    const { result, rerender } = renderHook(() =>
      useMetalHoldingDetail("holding-1")
    );

    act(() => {
      mockTrustObserver?.next(initialRates);
    });
    await waitFor(() => expect(result.current.model).toBe(firstModel));

    mockUserId = "user-2";
    rerender({});

    expect(result.current.model).toBeNull();

    act(() => {
      resolveReplacement?.(replacementModel);
    });
    await waitFor(() => expect(result.current.model).toBe(replacementModel));
  });

  it("refreshes rate trust when the app returns to foreground", () => {
    renderHook(() => useMetalHoldingDetail("holding-1"));

    act(() => {
      mockAppStateListener?.("active");
    });

    expect(mockTrustRefresh).toHaveBeenCalledTimes(1);
  });

  it("reclassifies rate trust at the bounded freshness deadline", () => {
    jest.useFakeTimers();
    renderHook(() => useMetalHoldingDetail("holding-1"));

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(mockTrustRefresh).toHaveBeenCalledTimes(1);
  });

  it("surfaces rate observer failure without reading synthetic missing rates", async () => {
    const rateError = new Error("Local rates unavailable");
    mockReadMetalDetailReadModel.mockResolvedValue({ holdingId: "holding-1" });
    const { result } = renderHook(() => useMetalHoldingDetail("holding-1"));

    act(() => {
      mockTrustObserver?.error(rateError);
    });

    await waitFor(() => expect(result.current.error).toBe(rateError));
    expect(mockReadMetalDetailReadModel).not.toHaveBeenCalled();
    expect(result.current.model).toBeNull();
  });
});
