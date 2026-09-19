import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { LiveRatesTrustReadModel } from "@/services/live-rates-trust-read-model-service";

interface Observer {
  readonly next: (value: unknown) => void;
  readonly error: (cause: unknown) => void;
}

const mockSaleGroupObservers: Observer[] = [];
const mockSaleRefObservers: Observer[] = [];
const mockDatabase = { id: "database" };
const mockShapeHoldingsInputs: Array<Record<string, unknown>> = [];
const mockEmptyTrustReadModel: LiveRatesTrustReadModel = {
  gold: { state: "missing", ageMs: null, providerObservedAt: null },
  silver: { state: "missing", ageMs: null, providerObservedAt: null },
  currencies: new Map(),
};
const mockRefreshSelectedSnapshot = jest.fn();
const mockMarketRateListeners = new Set<() => void>();

interface MockMarketRatesState {
  readonly currentError: Error | null;
  readonly isConnected: boolean;
  readonly isCurrentLoading: boolean;
  readonly refreshSelectedSnapshot: () => void;
  readonly selectedSnapshot: {
    readonly snapshotId: string;
    readonly trust: typeof mockEmptyTrustReadModel;
  } | null;
}

let mockMarketRatesState: MockMarketRatesState;

function resetMockMarketRates(): void {
  mockRefreshSelectedSnapshot.mockReset();
  mockMarketRatesState = {
    currentError: null,
    isConnected: true,
    isCurrentLoading: true,
    refreshSelectedSnapshot: mockRefreshSelectedSnapshot,
    selectedSnapshot: null,
  };
}

function emitMarketRates(
  next: Omit<MockMarketRatesState, "isConnected" | "refreshSelectedSnapshot">
): void {
  mockMarketRatesState = {
    ...mockMarketRatesState,
    ...next,
  };
  for (const listener of mockMarketRateListeners) listener();
}

function selectedSnapshot(
  trust: typeof mockEmptyTrustReadModel
): MockMarketRatesState["selectedSnapshot"] {
  return { snapshotId: "snapshot-1", trust };
}

resetMockMarketRates();

interface MockLocalQuery {
  readonly observe: () => unknown;
  readonly observeWithColumns: () => unknown;
}

function mockImmediateQuery<T>(rows: readonly T[]): MockLocalQuery {
  const observeWithColumns = (): unknown => ({
    subscribe: (observer: Observer): { unsubscribe: () => void } => {
      observer.next(rows);
      return { unsubscribe: (): void => undefined };
    },
  });
  return {
    observeWithColumns,
    observe: observeWithColumns,
  };
}

// Captures the subscription so a test can control when the sale evidence
// settles (loading flags must not flip to ready before the first emission).
function mockDeferredQuery(observers: Observer[]): MockLocalQuery {
  const bind = (): unknown => ({
    subscribe: (observer: Observer): { unsubscribe: () => void } => {
      observers.push(observer);
      return { unsubscribe: (): void => undefined };
    },
  });
  return { observeWithColumns: bind, observe: bind };
}

jest.mock("@react-navigation/native", () => ({
  useIsFocused: (): boolean => true,
}));

let mockAuthUserId = "user-1";

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: mockAuthUserId }, isLoading: false }),
}));

jest.mock("@/providers/DatabaseProvider", () => ({
  useDatabase: (): unknown => mockDatabase,
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): MockMarketRatesState => {
    const React = jest.requireActual<typeof import("react")>("react");
    return React.useSyncExternalStore(
      (listener) => {
        mockMarketRateListeners.add(listener);
        return (): void => {
          mockMarketRateListeners.delete(listener);
        };
      },
      () => mockMarketRatesState,
      () => mockMarketRatesState
    );
  },
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({
    preferredCurrency: "EGP",
    isLoading: false,
  }),
}));

const mockWealthBreakdown = { totalNetWorthDecimal: "1000" };
let mockActiveHoldings: ReadonlyArray<Record<string, unknown>> = [];

jest.mock("@/services/net-worth-read-model-service", () => ({
  buildWealthBreakdownReadModel: (): unknown => mockWealthBreakdown,
}));

jest.mock("@/services/metal-portfolio-read-model-service", () => ({
  observePortfolioAssets: (): unknown => mockImmediateQuery([]),
  observePortfolioHoldingStates: (): unknown => mockImmediateQuery([]),
  observePortfolioAssetMetals: (): null => null,
  observePortfolioRecentHistory: (): null => null,
  observePortfolioEffectiveActionEvidence: (): null => null,
  observePortfolioMetalSellGroups: (): unknown =>
    mockDeferredQuery(mockSaleGroupObservers),
  observePortfolioSaleRateReferences: (): unknown =>
    mockDeferredQuery(mockSaleRefObservers),
  shapeMetalPortfolioHoldings: (
    input: Record<string, unknown>
  ): readonly unknown[] => {
    mockShapeHoldingsInputs.push(input);
    return [];
  },
  buildMetalPortfolioReadModel: (input: Record<string, unknown>): unknown => ({
    activeHoldings: mockActiveHoldings,
    holdings: mockActiveHoldings,
    recentHistory: [],
    allocation: { gold: "0", silver: "0" },
    rateStatus: input.rateStatus,
    ...input,
  }),
}));

jest.mock("@/services/live-rates-trust-read-model-service", () => ({
  summarizeLiveRatesTrust: (): string => "missing",
}));

import { useMetalPortfolio } from "@/hooks/useMetalPortfolio";

describe("useMetalPortfolio summary loading signal", () => {
  beforeEach(() => {
    mockAuthUserId = "user-1";
    resetMockMarketRates();
    mockSaleGroupObservers.length = 0;
    mockSaleRefObservers.length = 0;
    mockActiveHoldings = [];
  });

  it("keeps the dashboard summary loading until rates settle while holdings are ready", async () => {
    const { result } = renderHook(() =>
      useMetalPortfolio({ accountsValueDecimal: "1000" })
    );

    // My Metals section readiness can render the (empty) holdings section
    // immediately, so the screen-level flag settles.
    await waitFor(() => expect(result.current.readiness.holdings).toBe(true));
    expect(result.current.isLoading).toBe(false);

    // The dashboard-facing signal must stay loading until the wealth summary
    // inputs (rates + preferred currency) are ready, so the total never
    // collapses to a temporary dash.
    expect(result.current.isSummaryLoading).toBe(true);
    expect(result.current.readiness.summary).toBe(false);
    expect(result.current.wealthBreakdown).toBeNull();
  });

  it("releases summary loading and exposes the wealth breakdown once rates arrive", async () => {
    const { result } = renderHook(() =>
      useMetalPortfolio({ accountsValueDecimal: "1000" })
    );
    await waitFor(() => expect(result.current.readiness.holdings).toBe(true));

    act(() => {
      emitMarketRates({
        currentError: null,
        isCurrentLoading: false,
        selectedSnapshot: selectedSnapshot(mockEmptyTrustReadModel),
      });
    });

    await waitFor(() => expect(result.current.isSummaryLoading).toBe(false));
    expect(result.current.readiness.summary).toBe(true);
    expect(result.current.wealthBreakdown).toBe(mockWealthBreakdown);
  });

  it("keeps the dashboard breakdown visible when account conversion is unavailable", async () => {
    const { result } = renderHook(() =>
      useMetalPortfolio({ accountsValueDecimal: null })
    );
    await waitFor(() => expect(result.current.readiness.holdings).toBe(true));

    act(() => {
      emitMarketRates({
        currentError: null,
        isCurrentLoading: false,
        selectedSnapshot: selectedSnapshot(mockEmptyTrustReadModel),
      });
    });

    await waitFor(() => expect(result.current.isSummaryLoading).toBe(false));
    expect(result.current.wealthBreakdown).toBe(mockWealthBreakdown);
  });

  it("settles readiness after an initial rate error so the screen shows unavailable values instead of an endless skeleton", async () => {
    const { result } = renderHook(() =>
      useMetalPortfolio({ accountsValueDecimal: "1000" })
    );
    await waitFor(() => expect(result.current.readiness.holdings).toBe(true));
    expect(result.current.isSummaryLoading).toBe(true);
    expect(result.current.readiness.summary).toBe(false);

    act(() => {
      emitMarketRates({
        currentError: new Error("rate observer failed"),
        isCurrentLoading: false,
        selectedSnapshot: null,
      });
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    // The failed initial rate observation is a settled unavailable state, not a
    // permanent loading state, for both the dashboard flag and the My Metals
    // section readiness derived from it.
    expect(result.current.readiness.summary).toBe(true);
    expect(result.current.isSummaryLoading).toBe(false);
  });

  it("clears a previous account's portfolio observer error when the signed-in user changes", async () => {
    const { result, rerender } = renderHook(() =>
      useMetalPortfolio({ accountsValueDecimal: "1000" })
    );
    await waitFor(() => expect(result.current.readiness.holdings).toBe(true));

    act(() => {
      mockSaleGroupObservers[0]?.error(
        new Error("user A sale evidence observer failed")
      );
    });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    mockAuthUserId = "user-2";
    rerender(undefined);

    // The new account must not inherit account A's generic failure/retry state.
    expect(result.current.error).toBeNull();
  });
});

describe("useMetalPortfolio conservative provider timestamp", () => {
  beforeEach(() => {
    resetMockMarketRates();
    mockSaleGroupObservers.length = 0;
    mockSaleRefObservers.length = 0;
  });

  it("returns null when a consumed rate lacks a timestamp even though another has one", async () => {
    mockActiveHoldings = [
      {
        metalType: "GOLD",
        purchaseCurrency: null,
        purchasePriceDecimal: null,
        status: "active",
        isVisible: true,
        isEffective: true,
      },
    ];
    const { result } = renderHook(() => useMetalPortfolio());
    await waitFor(() => expect(result.current.readiness.holdings).toBe(true));

    act(() => {
      emitMarketRates({
        currentError: null,
        isCurrentLoading: false,
        selectedSnapshot: selectedSnapshot({
          gold: {
            state: "fresh",
            ageMs: 1_000,
            providerObservedAt: new Date("2026-09-08T10:00:00.000Z"),
            valueDecimal: "81.5",
          },
          silver: { state: "missing", ageMs: null, providerObservedAt: null },
          currencies: new Map([
            [
              "EGP",
              { state: "unknown", ageMs: null, providerObservedAt: null },
            ],
          ]),
        }),
      });
    });

    await waitFor(() =>
      expect(result.current.readiness.rateCurrency).toBe(true)
    );
    // Gold has a timestamp but the preferred currency rate's age is unknown, so
    // the aggregate cannot truthfully claim a single "last updated" time.
    expect(result.current.rateProviderObservedAt).toBeNull();
  });

  it("returns the oldest timestamp when every consumed rate has one", async () => {
    mockActiveHoldings = [
      {
        metalType: "GOLD",
        purchaseCurrency: null,
        purchasePriceDecimal: null,
        status: "active",
        isVisible: true,
        isEffective: true,
      },
    ];
    const { result } = renderHook(() => useMetalPortfolio());
    await waitFor(() => expect(result.current.readiness.holdings).toBe(true));

    act(() => {
      emitMarketRates({
        currentError: null,
        isCurrentLoading: false,
        selectedSnapshot: selectedSnapshot({
          gold: {
            state: "fresh",
            ageMs: 1_000,
            providerObservedAt: new Date("2026-09-08T10:00:00.000Z"),
            valueDecimal: "81.5",
          },
          silver: { state: "missing", ageMs: null, providerObservedAt: null },
          currencies: new Map([
            [
              "EGP",
              {
                state: "fresh",
                ageMs: 2_000,
                providerObservedAt: new Date("2026-09-08T09:00:00.000Z"),
                valueDecimal: "0.02",
              },
            ],
          ]),
        }),
      });
    });

    await waitFor(() =>
      expect(result.current.readiness.rateCurrency).toBe(true)
    );
    expect(result.current.rateProviderObservedAt?.toISOString()).toBe(
      "2026-09-08T09:00:00.000Z"
    );
  });
});

describe("useMetalPortfolio realized-sale readiness", () => {
  beforeEach(() => {
    resetMockMarketRates();
    mockSaleGroupObservers.length = 0;
    mockSaleRefObservers.length = 0;
  });

  it("keeps realized-sale pending until the sell-group and sale rate-reference snapshots settle while active holdings stay ready", async () => {
    const { result } = renderHook(() => useMetalPortfolio());
    await waitFor(() => expect(result.current.readiness.holdings).toBe(true));

    // Active holdings do not wait on the realized-sale secondary streams.
    expect(result.current.readiness.holdings).toBe(true);
    // Realized-sale presentation must stay pending until both snapshots arrive.
    expect(result.current.readiness.realizedSale).toBe(false);

    act(() => {
      mockSaleGroupObservers[0]?.next([]);
    });
    // Sell groups arrived, but per-sale history results still need references.
    await waitFor(() => expect(mockSaleGroupObservers).toHaveLength(1));
    expect(result.current.readiness.realizedSale).toBe(false);

    act(() => {
      mockSaleRefObservers[0]?.next([]);
    });
    await waitFor(() =>
      expect(result.current.readiness.realizedSale).toBe(true)
    );
    // Holdings stayed visible the whole time (no second blocking readiness).
    expect(result.current.readiness.holdings).toBe(true);
  });

  it("marks realized-sale evidence unsettled while it reloads for a different user", async () => {
    const { result } = renderHook(() => useMetalPortfolio());
    await waitFor(() => expect(result.current.readiness.holdings).toBe(true));
    act(() => {
      mockSaleGroupObservers[0]?.next([]);
      mockSaleRefObservers[0]?.next([]);
    });
    await waitFor(() =>
      expect(result.current.readiness.realizedSale).toBe(true)
    );

    // A dependency refresh re-arms the loading flags before the fresh stream
    // resolves, so a stale snapshot is never rendered as current-user data.
    act(() => {
      result.current.refresh();
    });
    expect(result.current.readiness.realizedSale).toBe(false);
  });
});

describe("useMetalPortfolio calendar boundary rollover", () => {
  afterEach(() => {
    jest.useRealTimers();
    resetMockMarketRates();
    mockSaleGroupObservers.length = 0;
    mockSaleRefObservers.length = 0;
    mockShapeHoldingsInputs.length = 0;
  });

  function boundaryDates(): string[] {
    return mockShapeHoldingsInputs.map((input) =>
      String(input.latestAllowedCalendarDate)
    );
  }

  it("refreshes the trusted boundary when the device-local day rolls over while mounted", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
    mockShapeHoldingsInputs.length = 0;

    const { result } = renderHook(() => useMetalPortfolio());

    expect(result.current.readiness.holdings).toBe(true);
    expect(boundaryDates()).toContain("2026-01-15");

    // The clock advances past local midnight while the hook stays mounted; the
    // next refresh tick must move the boundary so a same-day sale is not
    // stranded as unavailable until remount.
    jest.setSystemTime(new Date(2026, 0, 16, 0, 0, 30));
    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(boundaryDates()).toContain("2026-01-16");
    // The refresh must only ever move the boundary forward to the real local day.
    expect(boundaryDates()).not.toContain("2026-01-14");
  });
});
