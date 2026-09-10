import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";

jest.mock("@monyvi/db", () => ({
  schema: { tables: {} },
}));

jest.mock("@/services/supabase", () => ({
  supabase: {
    rpc: (): never => {
      throw new Error(
        "unexpected real Supabase RPC in dependency-injected test"
      );
    },
  },
}));

import {
  refreshLiveMarketRatesWithDependencies,
  type LiveMarketRateRefreshDependencies,
} from "@/services/live-rates-refresh-service";
import type {
  MarketRateSnapshotCursor,
  MarketRateSnapshotPullResult,
} from "@/services/sync/market-rate-snapshot-pull";

const CURSOR: MarketRateSnapshotCursor = {
  createdAt: "2030-01-02T03:04:05.000Z",
  id: "018f0c7a-1234-7abc-8def-000000000010",
};
const ROOT_CHANGES: SyncTableChangeSet = {
  created: [],
  updated: [{ id: "snapshot-2", gold_usd_per_gram: 75 }],
  deleted: [],
};
const OBSERVATION_CHANGES: SyncTableChangeSet = {
  created: [],
  updated: [{ id: "observation-2", value_decimal: "75.25" }],
  deleted: [],
};
const PULL_RESULT: MarketRateSnapshotPullResult = {
  changes: {
    market_rates: ROOT_CHANGES,
    market_rate_observations: OBSERVATION_CHANGES,
  },
  upperWatermark: "2030-01-02T04:00:00.000Z",
};

interface RefreshHarness {
  readonly applyChanges: jest.Mock<
    Promise<void>,
    [MarketRateSnapshotPullResult["changes"]]
  >;
  readonly consumeArmedFixtureMarker: jest.Mock<Promise<boolean>, []>;
  readonly dependencies: LiveMarketRateRefreshDependencies;
  readonly pullSnapshots: jest.Mock<
    Promise<MarketRateSnapshotPullResult>,
    [MarketRateSnapshotCursor | null]
  >;
  readonly readLatestSnapshotCursor: jest.Mock<
    Promise<MarketRateSnapshotCursor | null>,
    []
  >;
}

function createHarness(): RefreshHarness {
  const consumeArmedFixtureMarker = jest.fn<Promise<boolean>, []>(() =>
    Promise.resolve(false)
  );
  const readLatestSnapshotCursor = jest.fn<
    Promise<MarketRateSnapshotCursor | null>,
    []
  >(() => Promise.resolve(CURSOR));
  const pullSnapshots = jest.fn<
    Promise<MarketRateSnapshotPullResult>,
    [MarketRateSnapshotCursor | null]
  >(() => Promise.resolve(PULL_RESULT));
  const applyChanges = jest.fn<
    Promise<void>,
    [MarketRateSnapshotPullResult["changes"]]
  >(() => Promise.resolve());

  return {
    applyChanges,
    consumeArmedFixtureMarker,
    dependencies: {
      applyChanges,
      consumeArmedFixtureMarker,
      pullSnapshots,
      readLatestSnapshotCursor,
    },
    pullSnapshots,
    readLatestSnapshotCursor,
  };
}

describe("refreshLiveMarketRatesWithDependencies", () => {
  it("pulls and applies one complete root-plus-observations change unit", async () => {
    const harness = createHarness();

    await expect(
      refreshLiveMarketRatesWithDependencies(harness.dependencies)
    ).resolves.toBeUndefined();

    expect(harness.readLatestSnapshotCursor).toHaveBeenCalledTimes(1);
    expect(harness.pullSnapshots).toHaveBeenCalledWith(CURSOR);
    expect(harness.applyChanges).toHaveBeenCalledTimes(1);
    expect(harness.applyChanges).toHaveBeenCalledWith({
      market_rates: ROOT_CHANGES,
      market_rate_observations: OBSERVATION_CHANGES,
    });
  });

  it("does not open a local apply when the complete-envelope pull fails", async () => {
    const harness = createHarness();
    harness.pullSnapshots.mockRejectedValueOnce(
      new Error("remote snapshot unavailable")
    );

    await expect(
      refreshLiveMarketRatesWithDependencies(harness.dependencies)
    ).rejects.toThrow("remote snapshot unavailable");
    expect(harness.applyChanges).not.toHaveBeenCalled();
  });

  it("propagates atomic local apply failure without retrying or clearing cache", async () => {
    const harness = createHarness();
    harness.applyChanges.mockRejectedValueOnce(new Error("local write failed"));

    await expect(
      refreshLiveMarketRatesWithDependencies(harness.dependencies)
    ).rejects.toThrow("local write failed");
    expect(harness.pullSnapshots).toHaveBeenCalledTimes(1);
    expect(harness.applyChanges).toHaveBeenCalledTimes(1);
  });

  it("consumes an armed development failure before reading or pulling rates", async () => {
    const harness = createHarness();
    harness.consumeArmedFixtureMarker.mockResolvedValueOnce(true);

    await expect(
      refreshLiveMarketRatesWithDependencies(harness.dependencies)
    ).rejects.toThrow("e2e_live_rates_refresh_failure_once");
    expect(harness.readLatestSnapshotCursor).not.toHaveBeenCalled();
    expect(harness.pullSnapshots).not.toHaveBeenCalled();
    expect(harness.applyChanges).not.toHaveBeenCalled();
  });

  it("uses the same atomic pull contract and one Watermelon writer in production", () => {
    const source = readFileSync(
      join(__dirname, "../../services/live-rates-refresh-service.ts"),
      "utf8"
    );

    expect(source).toContain("pullMarketRateSnapshots");
    expect(source).toContain("readSelectedMarketRateSnapshot");
    expect(source).toContain("database.write");
    expect(source).toContain("applyRemoteChanges");
    expect(source).not.toContain("pullMarketRates(");
    expect(source).not.toContain("pullMarketRateObservations(");
    expect(source).not.toContain(
      'get<MarketRateObservation>("market_rate_observations")'
    );
  });
});
