import {
  act,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react-native";
import { createElement, Fragment } from "react";

interface MockSubscription {
  readonly unsubscribe: jest.Mock<void, []>;
}

interface MockObserver<T = unknown> {
  readonly error: (cause: unknown) => void;
  readonly next: (value: T) => void;
}

interface MockQuery<T = unknown> {
  readonly observe: () => {
    readonly subscribe: (observer: MockObserver<T>) => MockSubscription;
  };
  readonly observeWithColumns: (_columns: readonly string[]) => {
    readonly subscribe: (observer: MockObserver<T>) => MockSubscription;
  };
}

const mockUnsubscribe = jest.fn<void, []>();
let mockStateObserver: MockObserver<readonly unknown[]> | null = null;
let mockEventObserver: MockObserver | null = null;
let mockEvidenceObserver: MockObserver | null = null;

function queryWithObserver<T>(
  assign: (observer: MockObserver<T>) => void
): MockQuery<T> {
  const source = {
    subscribe: (observer: MockObserver<T>): MockSubscription => {
      assign(observer);
      return { unsubscribe: mockUnsubscribe };
    },
  };
  return {
    observe: () => source,
    observeWithColumns: () => source,
  };
}

const mockObserveMetalHistoryHoldingStates = jest.fn<
  MockQuery<readonly unknown[]>,
  [string, string]
>(() =>
  queryWithObserver<readonly unknown[]>((observer) => {
    mockStateObserver = observer;
  })
);
const mockObserveMetalHistoryEvents = jest.fn<MockQuery, [unknown]>(() =>
  queryWithObserver((observer) => {
    mockEventObserver = observer;
  })
);
const mockObserveMetalHistoryActionEvidence = jest.fn<MockQuery, [unknown]>(
  () =>
    queryWithObserver((observer) => {
      mockEvidenceObserver = observer;
    })
);
const mockReadMetalHistoryReadModel = jest.fn<Promise<unknown>, [unknown]>(() =>
  Promise.resolve({
    counts: { all: 0, sold: 0, disposed: 0 },
    filter: "all",
    hasMore: false,
    items: [],
  })
);

let mockCurrentUser: {
  readonly isResolvingUser: boolean;
  readonly userId: string | null;
} = { isResolvingUser: false, userId: "user-1" };

jest.mock("@react-navigation/native", () => ({
  useIsFocused: (): boolean => true,
}));

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): {
    readonly isResolvingUser: boolean;
    readonly userId: string | null;
  } => mockCurrentUser,
}));

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): { readonly isConnected: boolean } => ({
    isConnected: true,
  }),
}));

jest.mock("@/services/metal-action-evidence-observer-service", () => ({
  observeMetalHistoryActionEvidence: (input: unknown) =>
    mockObserveMetalHistoryActionEvidence(input),
}));

jest.mock("@/services/metal-history-read-model-service", () => ({
  METAL_HISTORY_PAGE_SIZE: 25,
  observeMetalHistoryEvents: (input: unknown) =>
    mockObserveMetalHistoryEvents(input),
  observeMetalHistoryHoldingStates: (userId: string, filter: string) =>
    mockObserveMetalHistoryHoldingStates(userId, filter),
  readMetalHistoryReadModel: (input: unknown) =>
    mockReadMetalHistoryReadModel(input),
}));

import { useMetalHistory } from "@/hooks/useMetalHistory";

describe("useMetalHistory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStateObserver = null;
    mockEventObserver = null;
    mockEvidenceObserver = null;
    mockCurrentUser = { isResolvingUser: false, userId: "user-1" };
  });

  it("re-reads History when action evidence arrives after lifecycle rows", async () => {
    renderHook(() => useMetalHistory());
    await waitFor(() =>
      expect(mockReadMetalHistoryReadModel).toHaveBeenCalledTimes(1)
    );

    act(() => {
      mockStateObserver?.next([{ holdingId: "holding-1", userId: "user-1" }]);
    });
    await waitFor(() =>
      expect(mockObserveMetalHistoryActionEvidence).toHaveBeenCalledWith({
        holdings: [{ id: "holding-1", userId: "user-1" }],
        userId: "user-1",
      })
    );
    expect(mockEventObserver).not.toBeNull();
    expect(mockEvidenceObserver).not.toBeNull();

    const readCountBeforeEvidence =
      mockReadMetalHistoryReadModel.mock.calls.length;
    act(() => {
      mockEvidenceObserver?.next([]);
    });
    await waitFor(() =>
      expect(mockReadMetalHistoryReadModel).toHaveBeenCalledTimes(
        readCountBeforeEvidence + 1
      )
    );
  });

  it("surfaces holding-state observer failures and resubscribes on retry", async () => {
    const { result } = renderHook(() => useMetalHistory());
    await waitFor(() =>
      expect(mockReadMetalHistoryReadModel).toHaveBeenCalledTimes(1)
    );
    const subscriptionsBefore =
      mockObserveMetalHistoryHoldingStates.mock.calls.length;

    act(() => {
      mockStateObserver?.error(new Error("state observer failed"));
    });
    await waitFor(() =>
      expect(result.current.error?.message).toBe("state observer failed")
    );

    act(() => {
      result.current.retry();
    });
    await waitFor(() =>
      expect(mockObserveMetalHistoryHoldingStates.mock.calls.length).toBe(
        subscriptionsBefore + 1
      )
    );
  });

  it("preserves loaded items and skips the skeleton during a background refetch", async () => {
    const loaded = {
      counts: { all: 1, sold: 1, disposed: 0 },
      filter: "all",
      hasMore: false,
      items: [{ holdingId: "h1" }],
    };
    mockReadMetalHistoryReadModel.mockResolvedValueOnce(loaded);
    mockReadMetalHistoryReadModel.mockResolvedValueOnce(loaded);
    mockReadMetalHistoryReadModel.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useMetalHistory());
    await waitFor(() =>
      expect(result.current.history.items).toEqual(loaded.items)
    );

    act(() => {
      mockStateObserver?.next([{ holdingId: "holding-1", userId: "user-1" }]);
    });
    await waitFor(() =>
      expect(mockReadMetalHistoryReadModel).toHaveBeenCalledTimes(2)
    );
    await waitFor(() => expect(mockEventObserver).not.toBeNull());

    act(() => {
      mockEventObserver?.next([]);
    });
    await waitFor(() =>
      expect(mockReadMetalHistoryReadModel).toHaveBeenCalledTimes(3)
    );

    expect(result.current.history.items).toEqual(loaded.items);
    expect(result.current.isLoading).toBe(false);
  });

  it("does not expose a settled previous user's History during a direct identity change", async () => {
    const firstHistory = {
      counts: { all: 1, sold: 1, disposed: 0 },
      filter: "all",
      hasMore: false,
      items: [{ holdingId: "user-1-holding" }],
    };
    mockReadMetalHistoryReadModel.mockResolvedValueOnce(firstHistory);
    const observedResults: Array<ReturnType<typeof useMetalHistory>> = [];
    function HistoryHarness(): React.JSX.Element {
      observedResults.push(useMetalHistory());
      return createElement(Fragment);
    }
    const view = render(createElement(HistoryHarness));

    await waitFor(() =>
      expect(observedResults.at(-1)?.history.items).toEqual(firstHistory.items)
    );

    const renderCountBeforeIdentityChange = observedResults.length;
    mockCurrentUser = { isResolvingUser: false, userId: "user-2" };
    mockReadMetalHistoryReadModel.mockReturnValueOnce(new Promise(() => {}));
    view.rerender(createElement(HistoryHarness));

    const identityChangeResults = observedResults.slice(
      renderCountBeforeIdentityChange
    );
    expect(identityChangeResults).not.toHaveLength(0);
    expect(
      identityChangeResults.every(
        (snapshot) => snapshot.history.items.length === 0 && snapshot.isLoading
      )
    ).toBe(true);
  });
});
