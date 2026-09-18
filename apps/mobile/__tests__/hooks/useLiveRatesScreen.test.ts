import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockRefreshLiveMarketRates = jest.fn<Promise<void>, [unknown]>(() =>
  Promise.resolve()
);
const mockDatabase = { id: "database" };
const mockRefreshSelectedSnapshot = jest.fn<void, []>();
const mockMarketRatesListeners = new Set<() => void>();
let mockMarketRatesState = {
  currentError: null as Error | null,
  isConnected: true,
  isCurrentLoading: true,
  lastUpdated: null as Date | null,
  previousDayRate: null,
  refreshSelectedSnapshot: mockRefreshSelectedSnapshot,
  selectedSnapshot: null as null | {
    readonly capturedAt: Date;
    readonly ratesByInstrument: ReadonlyMap<string, unknown>;
    readonly snapshotId: string;
    readonly trust: typeof trustedRates;
  },
};

function emitMarketRates(next: Partial<typeof mockMarketRatesState>): void {
  mockMarketRatesState = { ...mockMarketRatesState, ...next };
  for (const listener of mockMarketRatesListeners) listener();
}

jest.mock("@/hooks/useMarketRates", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    useMarketRates: (): typeof mockMarketRatesState =>
      React.useSyncExternalStore(
        (listener) => {
          mockMarketRatesListeners.add(listener);
          return () => mockMarketRatesListeners.delete(listener);
        },
        () => mockMarketRatesState
      ),
  };
});

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

function selectedSnapshot(
  trust = trustedRates
): NonNullable<typeof mockMarketRatesState.selectedSnapshot> {
  return {
    capturedAt: new Date("2026-09-07T00:00:00.000Z"),
    ratesByInstrument: new Map(),
    snapshotId: "snapshot-1",
    trust,
  };
}

describe("useLiveRatesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarketRatesListeners.clear();
    mockMarketRatesState = {
      currentError: null,
      isConnected: true,
      isCurrentLoading: true,
      lastUpdated: null,
      previousDayRate: null,
      refreshSelectedSnapshot: mockRefreshSelectedSnapshot,
      selectedSnapshot: null,
    };
  });

  it("keeps the screen loading while cached rates wait for trust initialization", async () => {
    const { result } = renderHook(() => useLiveRatesScreen());

    expect(result.current.hasData).toBe(false);
    expect(result.current.isLoading).toBe(true);

    act(() => {
      emitMarketRates({
        isCurrentLoading: false,
        lastUpdated: new Date("2026-09-07T00:00:00.000Z"),
        selectedSnapshot: selectedSnapshot(),
      });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasData).toBe(true);
  });

  it("surfaces observer failure and resubscribes on accessible refresh retry", async () => {
    const { result } = renderHook(() => useLiveRatesScreen());

    act(() => {
      emitMarketRates({
        selectedSnapshot: selectedSnapshot(),
        lastUpdated: new Date("2026-09-07T00:00:00.000Z"),
        currentError: new Error("Local observation read failed"),
        isCurrentLoading: false,
      });
    });

    await waitFor(() =>
      expect(result.current.refreshError).toBe("cached_refresh_failed")
    );

    act(() => {
      result.current.onRefresh();
    });

    act(() => {
      emitMarketRates({
        currentError: null,
        selectedSnapshot: selectedSnapshot(),
      });
    });

    await waitFor(() => expect(result.current.refreshError).toBeNull());
    expect(result.current.rateTrust.gold.state).toBe("fresh");
  });

  it("reports sub-hour rate ages with minute granularity", async () => {
    const { result } = renderHook(() => useLiveRatesScreen());

    act(() => {
      const trust = {
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
      };
      emitMarketRates({
        isCurrentLoading: false,
        selectedSnapshot: selectedSnapshot(trust),
      });
    });

    await waitFor(() =>
      expect(result.current.rateTrust.gold.ageText).toBe("2 minutes ago")
    );
  });
});
