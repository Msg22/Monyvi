const mockFetchRows = jest.fn<Promise<MockCacheRow[]>, []>();
const mockCreate = jest.fn<
  Promise<void>,
  [apply: (row: Record<string, unknown>) => void]
>();
const mockWrite = jest.fn((work: () => Promise<void>): Promise<void> => work());
const mockQueryOwned = jest.fn(() => ({ fetch: mockFetchRows }));
const mockAssertExpectedCurrentUser = jest.fn(
  (_userId: string): Promise<void> => Promise.resolve()
);

jest.mock("@monyvi/db", () => ({
  database: {
    get: () => ({ create: mockCreate }),
    write: (work: () => Promise<void>): Promise<void> => mockWrite(work),
  },
  MetalHistoricalRateCache: class MetalHistoricalRateCache {},
}));

jest.mock("../../services/user-data-access", () => ({
  USER_DATA_ACCESS_ERROR_CODES: { AUTH_SCOPE_CHANGED: "auth_scope_changed" },
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

interface MockCacheRow extends Record<string, unknown> {
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
  snapshotId: string | null;
  metalProviderObservedAt: string | null;
  currencyProviderObservedAt: string | null;
  fetchedAt: Date;
  responseDigest: string;
  source: string;
  quality: string;
  contractVersion: number;
  createdAt: Date;
  updatedAt: Date;
  update: jest.Mock<Promise<void>, [apply: (draft: MockCacheRow) => void]>;
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
  const row: MockCacheRow = {
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
    snapshotId: input.snapshotId ?? null,
    metalProviderObservedAt: input.metalProviderObservedAt ?? null,
    currencyProviderObservedAt: input.currencyProviderObservedAt ?? null,
    fetchedAt: new Date(input.fetchedAt),
    responseDigest: input.responseDigest,
    source: input.source,
    quality: input.quality,
    contractVersion: input.contractVersion,
    createdAt: new Date(input.fetchedAt),
    updatedAt: new Date(input.fetchedAt),
    update: jest.fn((apply: (draft: MockCacheRow) => void): Promise<void> => {
      apply(row);
      return Promise.resolve();
    }),
  };
  return row;
}

describe("#355 historical local cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWrite.mockReset();
    mockWrite.mockImplementation(
      (work: () => Promise<void>): Promise<void> => work()
    );
    mockAssertExpectedCurrentUser.mockReset();
    mockAssertExpectedCurrentUser.mockResolvedValue(undefined);
    mockFetchRows.mockReset();
    mockFetchRows.mockResolvedValue([]);
    mockCreate.mockReset();
    mockCreate.mockImplementation(
      (apply: (row: Record<string, unknown>) => void): Promise<void> => {
        apply({});
        return Promise.resolve();
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

  it("rejects an auth change before returning an awaited owned cache row", async () => {
    mockFetchRows.mockResolvedValueOnce([cachedRow()]);
    mockAssertExpectedCurrentUser.mockRejectedValueOnce(
      new Error("auth_scope_changed")
    );
    await expect(readHistoricalDailyRateCache("2026-10-10")).rejects.toThrow(
      "auth_scope_changed"
    );
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

  it("persists truthful remote snapshot proof and reuses the owner/date row across provenance changes", async () => {
    const existing = cachedRow();
    const snapshot: HistoricalDailyRateRecord = {
      ...record(),
      providerKey: "remote_market_rates",
      source: "remote_market_rates",
      resolution: "snapshot",
      snapshotId: "018f0c7a-1234-7abc-8def-000000000099",
      metalProviderObservedAt: "2026-10-10T10:00:00.000Z",
      currencyProviderObservedAt: "2026-10-10T10:01:00.000Z",
    };
    mockFetchRows.mockResolvedValueOnce([existing]);
    await saveHistoricalDailyRateCache(snapshot);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(existing.snapshotId).toBe(snapshot.snapshotId);
    expect(existing.metalProviderObservedAt).toBe(
      snapshot.metalProviderObservedAt
    );
    expect(existing.currencyProviderObservedAt).toBe(
      snapshot.currencyProviderObservedAt
    );
    mockFetchRows.mockResolvedValueOnce([existing]);
    expect(await readHistoricalDailyRateCache(snapshot.rateDate)).toEqual(
      snapshot
    );
  });

  it("fails closed when duplicate owner/provider/date rows already exist", async () => {
    mockFetchRows.mockResolvedValueOnce([cachedRow(), cachedRow()]);
    await expect(readHistoricalDailyRateCache("2026-10-10")).rejects.toThrow(
      METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.CORRUPT
    );
  });

  it("safely serializes concurrent upserts for the same owner and date under the writer", async () => {
    const rows: MockCacheRow[] = [];
    let writerTail = Promise.resolve();
    let isInsideWriter = false;
    mockWrite.mockImplementation((work): Promise<void> => {
      const pending = writerTail.then(async (): Promise<void> => {
        isInsideWriter = true;
        try {
          await work();
        } finally {
          isInsideWriter = false;
        }
      });
      writerTail = pending;
      return pending;
    });
    mockFetchRows.mockImplementation((): Promise<MockCacheRow[]> => {
      expect(isInsideWriter).toBe(true);
      return Promise.resolve([...rows]);
    });
    mockCreate.mockImplementation(
      (apply: (row: Record<string, unknown>) => void): Promise<void> => {
        const created = cachedRow();
        apply(created);
        rows.push(created);
        return Promise.resolve();
      }
    );

    const recordA = record();
    const recordB = {
      ...record(),
      fetchedAt: "2026-10-10T17:00:00.000Z",
    };

    const [resultA, resultB] = await Promise.all([
      saveHistoricalDailyRateCache(recordA),
      saveHistoricalDailyRateCache(recordB),
    ]);

    expect(resultA.rateDate).toBe("2026-10-10");
    expect(resultB.rateDate).toBe("2026-10-10");
    expect(mockWrite).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe("user-1");
    expect(rows[0]?.update).toHaveBeenCalledTimes(1);
    expect(rows[0]?.fetchedAt.toISOString()).toBe(recordB.fetchedAt);
  });

  it("rechecks authentication when a queued writer starts before querying or saving", async () => {
    mockAssertExpectedCurrentUser.mockRejectedValueOnce(
      new Error("auth_scope_changed")
    );
    await expect(saveHistoricalDailyRateCache(record())).rejects.toThrow(
      "auth_scope_changed"
    );
    expect(mockFetchRows).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects malformed cached JSON instead of partially using rates", async () => {
    const row = cachedRow();
    row.currenciesUsdPerUnitJson = "{invalid";
    mockFetchRows.mockResolvedValueOnce([row]);

    await expect(readHistoricalDailyRateCache("2026-10-10")).rejects.toThrow(
      METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.CORRUPT
    );
  });

  it("rechecks the authenticated owner after the writer lookup resolves", async () => {
    const existing = cachedRow();
    mockFetchRows.mockResolvedValueOnce([existing]);
    mockAssertExpectedCurrentUser
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("auth_scope_changed"));
    await expect(saveHistoricalDailyRateCache(record())).rejects.toThrow(
      "auth_scope_changed"
    );
    expect(existing.update).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does not save a response under a replacement authenticated owner", async () => {
    await expect(
      saveHistoricalDailyRateCache(record(), undefined, {
        expectedUserId: "user-previous",
      })
    ).rejects.toThrow();
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does not commit enrichment cancelled while waiting for the writer", async () => {
    const controller = new AbortController();
    mockWrite.mockImplementation(async (work): Promise<void> => {
      controller.abort();
      await work();
    });
    await expect(
      saveHistoricalDailyRateCache(record(), undefined, {
        expectedUserId: "user-1",
        signal: controller.signal,
      })
    ).rejects.toThrow();
    expect(mockFetchRows).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
