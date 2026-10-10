const mockFetchRows = jest.fn();
const mockCreate = jest.fn();
const mockWrite = jest.fn(async (work: () => Promise<void>): Promise<void> => work());
const mockQueryOwned = jest.fn(() => ({ fetch: mockFetchRows }));
const mockAssertExpectedCurrentUser = jest.fn(() => Promise.resolve());

jest.mock("@monyvi/db", () => ({
  database: {
    get: () => ({ create: mockCreate }),
    write: mockWrite,
  },
  MetalHistoricalRateCache: class MetalHistoricalRateCache {},
}));

jest.mock("../../services/user-data-access", () => ({
  getCurrentUserDataScope: () =>
    Promise.resolve({
      userId: "user-1",
      queryOwned: mockQueryOwned,
    }),
  assertExpectedCurrentUser: (userId: string) =>
    mockAssertExpectedCurrentUser(userId),
}));

import {
  METAL_HISTORICAL_RATE_CACHE_ERROR_CODES,
  readHistoricalDailyRateCache,
  saveHistoricalDailyRateCache,
} from "../../services/metal-historical-rate-cache-service";
import {
  normalizeHistoricalMetalTroyOunceToPureGramDecimal,
  type HistoricalDailyRateRecord,
} from "@monyvi/logic";

interface MockCacheRow {
  userId: string;
  providerKey: string;
  rateDate: string;
  resolution: string;
  goldUsdPerTroyOunceDecimal: string;
  silverUsdPerTroyOunceDecimal: string;
  goldUsdPerPureGramDecimal: string;
  silverUsdPerPureGramDecimal: string;
  currenciesUsdPerUnitJson: string;
  providerResponseTimestamp: string | null;
  fetchedAt: Date;
  responseDigest: string;
  source: string;
  quality: string;
  contractVersion: number;
  createdAt: Date;
  updatedAt: Date;
  update: jest.Mock<Promise<void>, [(row: MockCacheRow) => void]>;
}

function record(): HistoricalDailyRateRecord {
  const gold = "3110.34768";
  const silver = "31.1034768";
  return {
    contractVersion: 1,
    providerKey: "metals.dev",
    rateDate: "2026-10-10",
    resolution: "daily",
    goldUsdPerTroyOunceDecimal: gold,
    silverUsdPerTroyOunceDecimal: silver,
    goldUsdPerPureGramDecimal:
      normalizeHistoricalMetalTroyOunceToPureGramDecimal(gold) ?? "",
    silverUsdPerPureGramDecimal:
      normalizeHistoricalMetalTroyOunceToPureGramDecimal(silver) ?? "",
    currenciesUsdPerUnit: { USD: "1", EGP: "0.02" },
    providerResponseTimestamp: null,
    fetchedAt: "2026-10-10T15:00:00.000Z",
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    source: "metals.dev",
    quality: "valid",
  };
}

function cachedRow(input: HistoricalDailyRateRecord = record()): MockCacheRow {
  let row: MockCacheRow;
  const update = jest.fn(
    async (apply: (draft: MockCacheRow) => void): Promise<void> => {
      apply(row);
    }
  );
  row = {
    userId: "user-1",
    providerKey: input.providerKey,
    rateDate: input.rateDate,
    resolution: input.resolution,
    goldUsdPerTroyOunceDecimal: input.goldUsdPerTroyOunceDecimal,
    silverUsdPerTroyOunceDecimal: input.silverUsdPerTroyOunceDecimal,
    goldUsdPerPureGramDecimal: input.goldUsdPerPureGramDecimal,
    silverUsdPerPureGramDecimal: input.silverUsdPerPureGramDecimal,
    currenciesUsdPerUnitJson: JSON.stringify(input.currenciesUsdPerUnit),
    providerResponseTimestamp: input.providerResponseTimestamp,
    fetchedAt: new Date(input.fetchedAt),
    responseDigest: input.responseDigest,
    source: input.source,
    quality: input.quality,
    contractVersion: input.contractVersion,
    createdAt: new Date(input.fetchedAt),
    updatedAt: new Date(input.fetchedAt),
    update,
  };
  return row;
}

describe("#355 historical local cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchRows.mockResolvedValue([]);
    mockCreate.mockImplementation(
      async (apply: (row: Record<string, unknown>) => void): Promise<void> => {
        apply({});
      }
    );
  });

  it("reads only through the current-user scoped query and returns exact strings", async () => {
    mockFetchRows.mockResolvedValueOnce([cachedRow()]);
    const result = await readHistoricalDailyRateCache("2026-10-10");

    expect(mockQueryOwned).toHaveBeenCalledTimes(1);
    expect(result?.currenciesUsdPerUnit).toEqual({ USD: "1", EGP: "0.02" });
    expect(result?.goldUsdPerTroyOunceDecimal).toBe("3110.34768");
  });

  it("creates one current-user row and reuses provider/date identity on later saves", async () => {
    await saveHistoricalDailyRateCache(record());

    expect(mockAssertExpectedCurrentUser).toHaveBeenCalledWith("user-1");
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    const existing = cachedRow();
    mockFetchRows.mockResolvedValueOnce([existing]);
    await saveHistoricalDailyRateCache({
      ...record(),
      fetchedAt: "2026-10-10T16:00:00.000Z",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(existing.update).toHaveBeenCalledTimes(1);
    expect(existing.fetchedAt.toISOString()).toBe("2026-10-10T16:00:00.000Z");
  });

  it("fails closed when duplicate owner/provider/date rows already exist", async () => {
    mockFetchRows.mockResolvedValueOnce([cachedRow(), cachedRow()]);
    await expect(
      readHistoricalDailyRateCache("2026-10-10")
    ).rejects.toThrow(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.CORRUPT);
  });

  it("rejects malformed cached JSON instead of partially using rates", async () => {
    const row = cachedRow();
    row.currenciesUsdPerUnitJson = "{invalid";
    mockFetchRows.mockResolvedValueOnce([row]);

    await expect(
      readHistoricalDailyRateCache("2026-10-10")
    ).rejects.toThrow(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.CORRUPT);
  });
});
