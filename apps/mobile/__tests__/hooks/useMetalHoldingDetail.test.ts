import { act, renderHook, waitFor } from "@testing-library/react-native";

interface MockSubscription {
  readonly unsubscribe: jest.Mock<void, []>;
}

interface MockTrustObserver {
  readonly next: (value: unknown) => void;
  readonly error: (cause: unknown) => void;
}

interface MockLocalQuery {
  readonly observe: () => {
    readonly subscribe: (next: () => void) => MockSubscription;
  };
}

const mockDatabase = { id: "database" };
const mockUnsubscribe = jest.fn<void, []>();
const mockLocalSubscribers: Array<() => void> = [];
let mockTrustObserver: MockTrustObserver | null = null;

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
    readonly userId: string;
  } => ({
    isResolvingUser: false,
    userId: "user-1",
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
  observeLiveRatesTrust: (): {
    readonly subscribe: (observer: MockTrustObserver) => MockSubscription;
  } => ({
    subscribe: (observer: MockTrustObserver): MockSubscription => {
      mockTrustObserver = observer;
      return { unsubscribe: mockUnsubscribe };
    },
  }),
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
    expect(mockObserveMetalDetailRateReferences).toHaveBeenCalledWith(
      "user-1",
      "holding-1"
    );
    expect(mockLocalSubscribers).toHaveLength(4);

    act(() => {
      mockLocalSubscribers[2]?.();
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
});
