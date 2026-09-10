import { act, renderHook, waitFor } from "@testing-library/react-native";

interface Observer {
  readonly next: (value: unknown) => void;
  readonly error: (cause: unknown) => void;
}

const mockTrustObservers: Observer[] = [];
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

jest.mock("@/services/net-worth-read-model-service", () => ({
  buildWealthBreakdownReadModel: (): unknown => mockWealthBreakdown,
}));

jest.mock("@/services/metal-portfolio-read-model-service", () => ({
  observePortfolioAssets: (): unknown => mockImmediateQuery([]),
  observePortfolioHoldingStates: (): unknown => mockImmediateQuery([]),
  observePortfolioAssetMetals: (): null => null,
  observePortfolioRecentHistory: (): null => null,
  shapeMetalPortfolioHoldings: (): readonly unknown[] => [],
  buildMetalPortfolioReadModel: (input: Record<string, unknown>): unknown => ({
    activeHoldings: [],
    holdings: [],
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
