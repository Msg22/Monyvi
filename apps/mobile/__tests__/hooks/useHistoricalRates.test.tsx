import { renderHook, waitFor } from "@testing-library/react-native";
import type { MarketRate } from "@monyvi/db";
import { MARKET_RATE_MODEL_VALUE_FIELDS } from "@monyvi/logic";

const mockFetch = jest.fn<Promise<MarketRate[]>, []>();
const mockLoggerError = jest.fn();

const mockCollection = {
  query: jest.fn(() => ({ fetch: mockFetch })),
};

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn(() => mockCollection),
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

import {
  computeEquivalentText,
  toDateKey,
  useHistoricalRates,
} from "@/hooks/useHistoricalRates";

const TRANSACTION_DATE = new Date("2026-07-10T12:00:00.000Z");
const TRANSACTION_DATES = [TRANSACTION_DATE] as const;
const NO_TRANSACTION_DATES: readonly Date[] = [];

function createMarketRate(): MarketRate {
  const values = Object.fromEntries(
    MARKET_RATE_MODEL_VALUE_FIELDS.map((field) => [field, 1])
  );

  return values as unknown as MarketRate;
}

describe("useHistoricalRates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses local calendar fields for historical-rate lookup keys", () => {
    const localCalendarDate = new Date("2026-08-31T21:00:00.000Z");
    Object.assign(localCalendarDate, {
      getFullYear: (): number => 2026,
      getMonth: (): number => 8,
      getDate: (): number => 1,
    });

    expect(toDateKey(localCalendarDate)).toBe("2026-09-01");
  });

  it("treats an invalid cached historical rate as unavailable", async () => {
    const invalidRate = createMarketRate();
    Object.defineProperty(invalidRate, "egpUsd", { value: 0 });
    mockFetch.mockResolvedValue([invalidRate]);

    const { result } = renderHook(() => useHistoricalRates(TRANSACTION_DATES));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(
      result.current.ratesByDate.get(toDateKey(TRANSACTION_DATE))
    ).toBeNull();
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Invalid cached historical market rate",
      expect.any(Error),
      { date: "2026-07-10" }
    );
  });

  it("exposes a valid cached historical rate", async () => {
    const validRate = createMarketRate();
    mockFetch.mockResolvedValue([validRate]);

    const { result } = renderHook(() => useHistoricalRates(TRANSACTION_DATES));

    await waitFor(() => {
      expect(result.current.ratesByDate.get(toDateKey(TRANSACTION_DATE))).toBe(
        validRate
      );
    });
  });

  it("treats a missing historical rate as unavailable", async () => {
    mockFetch.mockResolvedValue([]);

    const { result } = renderHook(() => useHistoricalRates(TRANSACTION_DATES));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(
      result.current.ratesByDate.get(toDateKey(TRANSACTION_DATE))
    ).toBeNull();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("skips database work when no transaction dates need rates", async () => {
    const { result } = renderHook(() =>
      useHistoricalRates(NO_TRANSACTION_DATES)
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.ratesByDate.size).toBe(0);
  });

  it("reports a historical-rate query failure without exposing a rate", async () => {
    const queryError = new Error("query failed");
    mockFetch.mockRejectedValue(queryError);

    const { result } = renderHook(() => useHistoricalRates(TRANSACTION_DATES));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.ratesByDate.size).toBe(0);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Failed to fetch historical market rates",
      queryError
    );
  });
});

describe("computeEquivalentText", () => {
  it("returns no equivalent amount without a historical rate", () => {
    expect(computeEquivalentText(100, "USD", "EGP", null)).toBeNull();
  });

  it("returns no equivalent amount for the preferred currency", () => {
    expect(
      computeEquivalentText(100, "USD", "USD", createMarketRate())
    ).toBeNull();
  });

  it("returns no equivalent amount when conversion does not change the value", () => {
    expect(
      computeEquivalentText(100, "USD", "EGP", createMarketRate())
    ).toBeNull();
  });

  it("formats a converted equivalent amount", () => {
    const rate = createMarketRate();
    Object.defineProperty(rate, "egpUsd", { value: 0.02 });

    expect(computeEquivalentText(100, "USD", "EGP", rate)).toContain("5,000");
  });
});
