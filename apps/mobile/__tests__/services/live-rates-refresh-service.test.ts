import type { Database } from "@nozbe/watermelondb";

const mockApplyRemoteChanges = jest.fn();
const mockAsyncStorageGetAllKeys = jest.fn();
const mockAsyncStorageGetItem = jest.fn();
const mockAsyncStorageSetItem = jest.fn();
const mockPullMarketRates = jest.fn();
const mockPullMarketRateObservations = jest.fn();

jest.mock("@nozbe/watermelondb/sync/impl", () => ({
  applyRemoteChanges: (...args: readonly unknown[]): unknown =>
    mockApplyRemoteChanges(...args),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getAllKeys: (...args: readonly unknown[]): unknown =>
    mockAsyncStorageGetAllKeys(...args),
  getItem: (...args: readonly unknown[]): unknown =>
    mockAsyncStorageGetItem(...args),
  setItem: (...args: readonly unknown[]): unknown =>
    mockAsyncStorageSetItem(...args),
}));

jest.mock("@/services/sync/pull-strategies", () => ({
  pullMarketRates: (...args: readonly unknown[]): unknown =>
    mockPullMarketRates(...args),
  pullMarketRateObservations: (...args: readonly unknown[]): unknown =>
    mockPullMarketRateObservations(...args),
}));

import { refreshLiveMarketRates } from "@/services/live-rates-refresh-service";

interface TestDatabase {
  readonly database: Database;
  readonly write: jest.Mock;
}

function createDatabase(): TestDatabase {
  const write = jest.fn(async (action: () => Promise<void>): Promise<void> => {
    await action();
  });
  return { database: { write } as unknown as Database, write };
}

describe("refreshLiveMarketRates", () => {
  const fixtureMarkerKey =
    "@monyvi/e2e/live-rates-refresh-failure/metals-refresh-failure-cached-local-en-light";
  let markerValues: Map<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();
    markerValues = new Map();
    mockAsyncStorageGetAllKeys.mockImplementation(() =>
      Promise.resolve([...markerValues.keys()])
    );
    mockAsyncStorageGetItem.mockImplementation((key: string) =>
      Promise.resolve(markerValues.get(key))
    );
    mockAsyncStorageSetItem.mockImplementation((key: string, value: string) => {
      markerValues.set(key, value);
      return Promise.resolve();
    });
    mockPullMarketRates.mockResolvedValue({
      created: [],
      updated: [{ id: "rate-1", gold_usd_per_gram: 75 }],
      deleted: [],
    });
    mockPullMarketRateObservations.mockResolvedValue({
      changes: {
        created: [],
        updated: [{ id: "observation-1", value_decimal: "75.25" }],
        deleted: [],
      },
      upperWatermark: "2030-01-02T03:04:05.000Z",
    });
    mockApplyRemoteChanges.mockResolvedValue(undefined);
  });

  it("commits validated snapshots and observations together in one local writer", async () => {
    const { database, write } = createDatabase();

    await expect(refreshLiveMarketRates(database)).resolves.toBeUndefined();

    expect(mockPullMarketRates).toHaveBeenCalledWith();
    expect(mockPullMarketRateObservations).toHaveBeenCalledWith(null);
    expect(write).toHaveBeenCalledTimes(1);
    expect(mockApplyRemoteChanges).toHaveBeenCalledWith(
      {
        market_rates: {
          created: [],
          updated: [{ id: "rate-1", gold_usd_per_gram: 75 }],
          deleted: [],
        },
        market_rate_observations: {
          created: [],
          updated: [{ id: "observation-1", value_decimal: "75.25" }],
          deleted: [],
        },
      },
      { db: database, sendCreatedAsUpdated: true }
    );
  });

  it.each([
    ["snapshot request", mockPullMarketRates],
    ["observation request", mockPullMarketRateObservations],
  ])("rejects a failed %s without opening a local writer", async (_, pull) => {
    const { database, write } = createDatabase();
    pull.mockRejectedValueOnce(new Error("remote unavailable"));

    await expect(refreshLiveMarketRates(database)).rejects.toThrow(
      "remote unavailable"
    );
    expect(write).not.toHaveBeenCalled();
    expect(mockApplyRemoteChanges).not.toHaveBeenCalled();
  });

  it("rejects an atomic local write failure without deleting cached rows", async () => {
    const cachedRowIds = ["cached-rate", "cached-observation"];
    const write = jest.fn(
      async (action: () => Promise<void>): Promise<void> => {
        await action();
      }
    );
    const database = {
      write,
      cachedRowIds,
    } as unknown as Database;
    mockApplyRemoteChanges.mockRejectedValueOnce(
      new Error("local write failed")
    );

    await expect(refreshLiveMarketRates(database)).rejects.toThrow(
      "local write failed"
    );
    expect(cachedRowIds).toEqual(["cached-rate", "cached-observation"]);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("consumes a namespaced development fixture failure once before remote reads", async () => {
    markerValues.set(fixtureMarkerKey, "armed");
    const cachedRowIds = ["cached-rate", "cached-observation"];
    const write = jest.fn();
    const database = { cachedRowIds, write } as unknown as Database;

    await expect(refreshLiveMarketRates(database)).rejects.toThrow(
      "e2e_live_rates_refresh_failure_once"
    );

    expect(markerValues.get(fixtureMarkerKey)).toBe("consumed");
    expect(mockPullMarketRates).not.toHaveBeenCalled();
    expect(mockPullMarketRateObservations).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(cachedRowIds).toEqual(["cached-rate", "cached-observation"]);

    await expect(refreshLiveMarketRates(database)).resolves.toBeUndefined();
    expect(mockPullMarketRates).toHaveBeenCalledTimes(1);
    expect(mockPullMarketRateObservations).toHaveBeenCalledTimes(1);
  });

  it("atomically consumes one armed marker across concurrent refresh attempts", async () => {
    markerValues.set(fixtureMarkerKey, "armed");
    const { database, write } = createDatabase();

    const results = await Promise.allSettled([
      refreshLiveMarketRates(database),
      refreshLiveMarketRates(database),
    ]);

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<void> =>
        result.status === "fulfilled"
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toEqual(
      new Error("e2e_live_rates_refresh_failure_once")
    );
    expect(fulfilled).toHaveLength(1);
    expect(markerValues.get(fixtureMarkerKey)).toBe("consumed");
    expect(mockPullMarketRates).toHaveBeenCalledTimes(1);
    expect(mockPullMarketRateObservations).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("never reads or consumes development fixture markers in a release runtime", async () => {
    const runtimeGlobal = global as typeof globalThis & { __DEV__: boolean };
    const previousDev = runtimeGlobal.__DEV__;
    runtimeGlobal.__DEV__ = false;
    markerValues.set(fixtureMarkerKey, "armed");
    const { database } = createDatabase();

    try {
      await expect(refreshLiveMarketRates(database)).resolves.toBeUndefined();
    } finally {
      runtimeGlobal.__DEV__ = previousDev;
    }

    expect(mockAsyncStorageGetAllKeys).not.toHaveBeenCalled();
    expect(mockAsyncStorageGetItem).not.toHaveBeenCalled();
    expect(mockAsyncStorageSetItem).not.toHaveBeenCalled();
    expect(markerValues.get(fixtureMarkerKey)).toBe("armed");
  });
});
