import { act, renderHook, waitFor } from "@testing-library/react-native";

interface Observer {
  readonly next: (value: unknown) => void;
  readonly error: (cause: unknown) => void;
}

const mockTrustObservers: Observer[] = [];
const mockSaleGroupObservers: Observer[] = [];
const mockSaleRefObservers: Observer[] = [];
const mockDatabase = { id: "database" };
const mockEmptyTrustReadModel = {
  gold: { state: "missing", ageMs: null, providerObservedAt: null },
  silver: { state: "missing", ageMs: null, providerObservedAt: null },
  currencies: new Map(),
};

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

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" }, isLoading: false }),
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
  useMarketRates: (): { isConnected: boolean } => ({ isConnected: true }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({
    preferredCurrency: "EGP",
    isLoading: false,
  }),
}));

const mockWealthBreakdown = { totalNetWorthDecimal: "1000" };
let mockActiveHoldings: readonly Record<string, unknown>[] = [];

jest.mock("@/services/net-worth-read-model-service", () => ({
  buildWealthBreakdownReadModel: (): unknown => mockWealthBreakdown,
}));

jest.mock("@/services/metal-portfolio-read-model-service", () => ({
  observePortfolioAssets: (): unknown => mockImmediateQuery([]),
  observePortfolioHoldingStates: (): unknown => mockImmediateQuery([]),
  observePortfolioAssetMetals: (): null => null,
  observePortfolioRecentHistory: (): null => null,
  observePortfolioMetalSellGroups: (): unknown =>
    mockDeferredQuery(mockSaleGroupObservers),
  observePortfolioSaleRateReferences: (): unknown =>
    mockDeferredQuery(mockSaleRefObservers),
  shapeMetalPortfolioHoldings: (): readonly unknown[] => [],
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
  observeLiveRatesTrust: () => ({
    refresh: jest.fn(),
    subscribe: (observer: Observer): { unsubscribe: () => void } => {
      mockTrustObservers.push(observer);
      return { unsubscribe: (): void => undefined };
    },
  }),
  summarizeLiveRatesTrust: (): string => "missing",
}));

import { useMetalPortfolio } from "@/hooks/useMetalPortfolio";

describe("useMetalPortfolio summary loading signal", () => {
  beforeEach(() => {
    mockTrustObservers.length = 0;
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
      mockTrustObservers[0]?.next(mockEmptyTrustReadModel);
    });

    await waitFor(() => expect(result.current.isSummaryLoading).toBe(false));
    expect(result.current.readiness.summary).toBe(true);
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
      mockTrustObservers[0]?.error(new Error("rate observer failed"));
    });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    // The failed initial rate observation is a settled unavailable state, not a
    // permanent loading state, for both the dashboard flag and the My Metals
    // section readiness derived from it.
    expect(result.current.readiness.summary).toBe(true);
    expect(result.current.isSummaryLoading).toBe(false);
  });
});

describe("useMetalPortfolio conservative provider timestamp", () => {
  beforeEach(() => {
    mockTrustObservers.length = 0;
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
      mockTrustObservers[0]?.next({
        gold: {
          state: "fresh",
          ageMs: 1_000,
          providerObservedAt: new Date("2026-09-08T10:00:00.000Z"),
          valueDecimal: "81.5",
        },
        silver: { state: "missing", ageMs: null, providerObservedAt: null },
        currencies: new Map([
          ["EGP", { state: "unknown", ageMs: null, providerObservedAt: null }],
        ]),
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
      mockTrustObservers[0]?.next({
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
    mockTrustObservers.length = 0;
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
    await waitFor(() => expect(result.current.readiness.realizedSale).toBe(true));
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
    await waitFor(() => expect(result.current.readiness.realizedSale).toBe(true));

    // A dependency refresh re-arms the loading flags before the fresh stream
    // resolves, so a stale snapshot is never rendered as current-user data.
    act(() => {
      result.current.refresh();
    });
    expect(result.current.readiness.realizedSale).toBe(false);
  });
});
