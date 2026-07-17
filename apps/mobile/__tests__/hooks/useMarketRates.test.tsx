import { renderHook, waitFor } from "@testing-library/react-native";
import type { MarketRate } from "@monyvi/db";
import { MARKET_RATE_MODEL_VALUE_FIELDS } from "@monyvi/logic";

const mockFetch = jest.fn<Promise<MarketRate[]>, []>();
const mockUnsubscribe = jest.fn();
const mockLoggerError = jest.fn();

const mockCollection = {
  query: jest.fn((...queryClauses: readonly unknown[]) => {
    if (queryClauses.length === 2) {
      return {
        observe: () => ({
          subscribe: (callback: (rates: MarketRate[]) => void) => {
            callback([]);
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

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

import { useMarketRates } from "@/hooks/useMarketRates";

function createMarketRate(): MarketRate {
  const values = Object.fromEntries(
    MARKET_RATE_MODEL_VALUE_FIELDS.map((field) => [field, 1])
  );

  return {
    ...values,
    createdAt: new Date("2026-07-16T12:00:00.000Z"),
    isStale: () => false,
  } as unknown as MarketRate;
}

describe("useMarketRates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
        "Invalid cached previous-day market rate",
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
