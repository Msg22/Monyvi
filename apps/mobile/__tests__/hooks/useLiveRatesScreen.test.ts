import { act, renderHook, waitFor } from "@testing-library/react-native";

interface MockSubscription {
  readonly unsubscribe: jest.Mock<void, []>;
}

interface MockTrustObserver {
  readonly error: (cause: unknown) => void;
  readonly next: (value: unknown) => void;
}

const mockRefreshLiveMarketRates = jest.fn<Promise<void>, [unknown]>(() =>
  Promise.resolve()
);
const mockUnsubscribe = jest.fn<void, []>();
const mockDatabase = { id: "database" };
const mockTrustObservers: MockTrustObserver[] = [];
let mockLatestRates: unknown = {};

jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): {
    readonly isConnected: boolean;
    readonly isLoading: boolean;
    readonly lastUpdated: Date | null;
    readonly latestRates: unknown;
    readonly previousDayRate: null;
  } => ({
    isConnected: true,
    isLoading: false,
    lastUpdated: new Date("2026-09-07T00:00:00.000Z"),
    latestRates: mockLatestRates,
    previousDayRate: null,
  }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): { readonly preferredCurrency: "EGP" } => ({
    preferredCurrency: "EGP",
  }),
}));

jest.mock("@/providers/DatabaseProvider", () => ({
  useDatabase: (): typeof mockDatabase => mockDatabase,
}));

jest.mock("@/services/live-rates-refresh-service", () => ({
  refreshLiveMarketRates: (...args: [unknown]): Promise<void> =>
    mockRefreshLiveMarketRates(...args),
}));

jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));

jest.mock("@/services/live-rates-trust-read-model-service", () => ({
  observeLiveRatesTrust: (): {
    readonly refresh: jest.Mock<void, []>;
    readonly subscribe: (observer: MockTrustObserver) => MockSubscription;
  } => ({
    refresh: jest.fn<void, []>(),
    subscribe: (observer: MockTrustObserver): MockSubscription => {
      mockTrustObservers.push(observer);
      return { unsubscribe: mockUnsubscribe };
    },
  }),
  summarizeLiveRatesTrust: (): "missing" => "missing",
}));

jest.mock("@monyvi/logic", () => ({
  CURRENCY_INFO_MAP: { EGP: { code: "EGP", symbol: "EGP" } },
  SUPPORTED_CURRENCIES: [],
  calculateTrendPercent: (): number => 0,
  convertCurrency: (): number => 0,
  formatRate: (): string => "0",
  getGoldPurityPrice: (): number => 0,
  getMetalPrice: (): number => 0,
  isSupportedMetalsIsoCurrencyCode: (): boolean => true,
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: "en" };
  } => ({
    i18n: { resolvedLanguage: "en" },
  }),
}));

import { useLiveRatesScreen } from "@/hooks/useLiveRatesScreen";

const trustedRates = {
  currencies: new Map(),
  gold: {
    ageMs: 1_000,
    providerObservedAt: new Date("2026-09-07T00:00:00.000Z"),
    state: "fresh",
  },
  silver: {
    ageMs: 1_000,
    providerObservedAt: new Date("2026-09-07T00:00:00.000Z"),
    state: "fresh",
  },
};

describe("useLiveRatesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLatestRates = {};
    mockTrustObservers.splice(0);
  });

  it("keeps the screen loading while cached rates wait for trust initialization", async () => {
    const { result } = renderHook(() => useLiveRatesScreen());

    expect(result.current.hasData).toBe(false);
    expect(result.current.isLoading).toBe(true);

    act(() => {
      mockTrustObservers[0]?.next(trustedRates);
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasData).toBe(true);
  });

  it("surfaces observer failure and resubscribes on accessible refresh retry", async () => {
    const { result } = renderHook(() => useLiveRatesScreen());
    const failedObserver = mockTrustObservers[0];

    act(() => {
      failedObserver?.error(new Error("Local observation read failed"));
    });

    await waitFor(() =>
      expect(result.current.refreshError).toBe("cached_refresh_failed")
    );

    act(() => {
      result.current.onRefresh();
    });

    await waitFor(() => expect(mockTrustObservers).toHaveLength(2));
    act(() => {
      mockTrustObservers[1]?.next(trustedRates);
    });

    await waitFor(() => expect(result.current.refreshError).toBeNull());
    expect(result.current.rateTrust.gold.state).toBe("fresh");
  });

  it("reports sub-hour rate ages with minute granularity", async () => {
    const { result } = renderHook(() => useLiveRatesScreen());

    act(() => {
      mockTrustObservers[0]?.next({
        currencies: new Map(),
        gold: {
          ageMs: 120_000,
          providerObservedAt: new Date("2026-09-07T00:00:00.000Z"),
          state: "fresh",
        },
        silver: {
          ageMs: 120_000,
          providerObservedAt: new Date("2026-09-07T00:00:00.000Z"),
          state: "fresh",
        },
      });
    });

    await waitFor(() =>
      expect(result.current.rateTrust.gold.ageText).toBe("2 minutes ago")
    );
  });
});
