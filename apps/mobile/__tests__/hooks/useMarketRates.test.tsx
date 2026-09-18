import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { MarketRate } from "@monyvi/db";
import {
  MARKET_RATE_MODEL_VALUE_FIELDS,
  type CurrentMarketInstrument,
} from "@monyvi/logic";
import type {
  SelectedCurrentMarketRate,
  SelectedMarketRateSnapshot,
} from "@/services/market-rate-snapshot-read-model-service";

const mockFetch = jest.fn<Promise<MarketRate[]>, []>();
const mockUnsubscribe = jest.fn<void, []>();
const mockLoggerError = jest.fn();
let mockObservedRates: MarketRate[] = [];
let mockLatestRatesObserver: ((rates: MarketRate[]) => void) | null = null;
let mockSnapshotObserver: {
  readonly next: (snapshot: SelectedMarketRateSnapshot | null) => void;
  readonly error?: (cause: unknown) => void;
} | null = null;
const mockSnapshotRefresh = jest.fn<void, []>();

const mockCollection = {
  query: jest.fn((...queryClauses: readonly unknown[]) => {
    if (queryClauses.length === 2) {
      return {
        observe: () => ({
          subscribe: (
            observer:
              | ((rates: MarketRate[]) => void)
              | { readonly next: (rates: MarketRate[]) => void }
          ) => {
            const next =
              typeof observer === "function" ? observer : observer.next;
            mockLatestRatesObserver = next;
            next(mockObservedRates);
            return { unsubscribe: mockUnsubscribe };
          },
        }),
      };
    }

    return { fetch: mockFetch };
  }),
};

const mockDatabase = {
  get: jest.fn(() => mockCollection),
};

jest.mock("@/providers/DatabaseProvider", () => ({
  useDatabase: () => mockDatabase,
}));

jest.mock("@/providers/MarketRatesRealtimeProvider", () => ({
  useMarketRatesRealtime: () => ({ isConnected: true }),
}));

jest.mock("@/services/market-rate-snapshot-read-model-service", () => ({
  observeSelectedMarketRateSnapshot: () => ({
    refresh: mockSnapshotRefresh,
    subscribe: (
      observer: NonNullable<typeof mockSnapshotObserver>
    ): { readonly unsubscribe: jest.Mock<void, []> } => {
      mockSnapshotObserver = observer;
      return { unsubscribe: mockUnsubscribe };
    },
  }),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

import { useMarketRates } from "@/hooks/useMarketRates";

function createMarketRate(
  createdAt = new Date("2026-07-16T12:00:00.000Z")
): MarketRate {
  const values = Object.fromEntries(
    MARKET_RATE_MODEL_VALUE_FIELDS.map((field) => [field, 1])
  );

  const rate = {
    ...values,
    createdAt,
    isStale: (): boolean =>
      Date.now() - rate.createdAt.getTime() > 24 * 60 * 60 * 1000,
  } as unknown as MarketRate;

  return rate;
}

function createSelectedSnapshot(
  providerObservedAt: Date
): SelectedMarketRateSnapshot {
  const ageMs = Date.now() - providerObservedAt.getTime();
  const freshness: "stale" | "fresh" =
    ageMs > 24 * 60 * 60 * 1000 ? "stale" : "fresh";
  const trustValue = {
    ageMs,
    providerObservedAt,
    source: "provider",
    state: freshness,
    valueDecimal: "1",
  };
  const snapshot: SelectedMarketRateSnapshot = {
    snapshotId: "snapshot-1",
    capturedAt: new Date("2026-07-16T12:00:00.000Z"),
    ratesByInstrument: new Map<
      CurrentMarketInstrument,
      SelectedCurrentMarketRate
    >([
      [
        "metal:GOLD",
        {
          instrumentCode: "metal:GOLD",
          valueDecimal: "1",
          normalizedUsdPerBaseDecimal: "1",
          unit: "usd_per_pure_gram",
          orientation: "quote_per_base",
          providerObservedAt,
          source: "provider",
          quality: "valid",
          freshness,
          ageMs,
        },
      ],
    ]),
    trust: {
      gold: trustValue,
      silver: trustValue,
      currencies: new Map(),
    },
  };
  return snapshot;
}

describe("useMarketRates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockObservedRates = [];
    mockLatestRatesObserver = null;
    mockSnapshotObserver = null;
    mockFetch.mockResolvedValue([]);
  });

  it("refreshes the timestamp when Watermelon re-emits the same model instance", async () => {
    const initialCreatedAt = new Date(Date.now() - 8 * 60 * 1000);
    const correctedCreatedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const rate = createMarketRate(initialCreatedAt);
    mockObservedRates = [rate];

    const { result } = renderHook(() => useMarketRates());

    act(() => {
      mockSnapshotObserver?.next(createSelectedSnapshot(initialCreatedAt));
    });

    await waitFor(() => {
      expect(result.current.lastUpdated).toEqual(initialCreatedAt);
      expect(result.current.isStale).toBe(false);
    });

    await act(async () => {
      rate.createdAt = correctedCreatedAt;
      mockLatestRatesObserver?.([rate]);
      mockSnapshotObserver?.next(createSelectedSnapshot(correctedCreatedAt));
      await Promise.resolve();
    });

    expect(result.current.lastUpdated).toEqual(correctedCreatedAt);
    expect(result.current.isStale).toBe(true);
  });

  it("drops an invalid cached previous-day rate instead of exposing it to trend calculations", async () => {
    const invalidPreviousDayRate = createMarketRate();
    Object.defineProperty(invalidPreviousDayRate, "egpUsd", { value: 0 });
    mockFetch.mockResolvedValue([invalidPreviousDayRate]);

    const { result } = renderHook(() => useMarketRates());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
      expect(result.current.previousDayRate).toBeNull();
      expect(mockLoggerError).toHaveBeenCalledWith(
        "marketRates.historicalRow.invalid",
        expect.any(Error)
      );
    });
  });

  it("exposes a valid cached previous-day rate", async () => {
    const previousDayRate = createMarketRate();
    mockFetch.mockResolvedValue([previousDayRate]);

    const { result } = renderHook(() => useMarketRates());

    await waitFor(() => {
      expect(result.current.previousDayRate).toBe(previousDayRate);
    });
  });
});
