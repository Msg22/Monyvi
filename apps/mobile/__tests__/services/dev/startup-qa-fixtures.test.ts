const mockFetch = jest.fn();
const mockBatch = jest.fn();
const mockWrite = jest.fn();
const mockGet = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: {
    get: (...args: unknown[]): unknown => mockGet(...args),
    write: (...args: unknown[]): Promise<void> =>
      mockWrite(...args) as Promise<void>,
    batch: (...args: unknown[]): Promise<void> =>
      mockBatch(...args) as Promise<void>,
  },
}));

import { removeLocalMarketRatesForQa } from "@/services/dev/startup-qa-fixtures";

describe("removeLocalMarketRatesForQa", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWrite.mockImplementation(async (writer: () => Promise<void>) => {
      await writer();
    });
    mockGet.mockImplementation((table: string) => {
      if (table !== "market_rates") {
        throw new Error(`Unexpected table access: ${table}`);
      }
      return { query: () => ({ fetch: mockFetch }) };
    });
  });

  it("permanently removes only local market-rate rows and preserves the profile", async () => {
    const firstPreparedDelete = { type: "destroy", id: "rate-1" };
    const secondPreparedDelete = { type: "destroy", id: "rate-2" };
    mockFetch.mockResolvedValue([
      {
        prepareDestroyPermanently: jest.fn(() => firstPreparedDelete),
      },
      {
        prepareDestroyPermanently: jest.fn(() => secondPreparedDelete),
      },
    ]);
    await expect(removeLocalMarketRatesForQa()).resolves.toBe(2);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("market_rates");
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockBatch).toHaveBeenCalledWith([
      firstPreparedDelete,
      secondPreparedDelete,
    ]);
  });

  it("does not open a write transaction when there are no local rate rows", async () => {
    mockFetch.mockResolvedValue([]);
    await expect(removeLocalMarketRatesForQa()).resolves.toBe(0);

    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("refuses to mutate local data outside development builds", async () => {
    const runtimeGlobal = global as typeof globalThis & { __DEV__: boolean };
    const originalIsDevelopment = runtimeGlobal.__DEV__;
    runtimeGlobal.__DEV__ = false;

    try {
      await expect(removeLocalMarketRatesForQa()).rejects.toThrow(
        "Startup QA fixtures are unavailable in release builds"
      );
      expect(mockGet).not.toHaveBeenCalled();
    } finally {
      runtimeGlobal.__DEV__ = originalIsDevelopment;
    }
  });
});
