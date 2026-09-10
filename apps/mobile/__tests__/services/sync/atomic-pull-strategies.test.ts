import type { Database } from "@nozbe/watermelondb";
import type {
  SyncPullResult,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";

import type {
  MarketRateSnapshotCursor,
  MarketRateSnapshotPullResult,
} from "@/services/sync/market-rate-snapshot-pull";

const mockGetCurrentUserId = jest.fn<Promise<string | null>, []>();
const mockPullMarketRateSnapshots = jest.fn<
  Promise<MarketRateSnapshotPullResult>,
  [MarketRateSnapshotCursor | null]
>();
const mockPullCategories = jest.fn<
  Promise<SyncTableChangeSet>,
  [string, string | null, string]
>();
const mockPullChildTable = jest.fn<Promise<SyncTableChangeSet>, never[]>();
const mockPullMetalDedicatedTable = jest.fn<
  Promise<SyncTableChangeSet>,
  [string, string, string | null, string, Database | undefined]
>();
const mockPullSnapshotTable = jest.fn<Promise<SyncTableChangeSet>, never[]>();
const mockPullUserTable = jest.fn<Promise<SyncTableChangeSet>, never[]>();
const mockProtectMetalMetadataPullFragments = jest.fn<
  SyncTableChangeSet,
  [SyncTableChangeSet, SyncTableChangeSet]
>();

const EMPTY_CHANGES: SyncTableChangeSet = {
  created: [],
  updated: [],
  deleted: [],
};

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> => mockGetCurrentUserId(),
}));

jest.mock("@/services/sync/config", () => ({
  SYNCABLE_TABLES: ["market_rates", "market_rate_observations", "categories"],
}));

jest.mock("@/services/sync/table-predicates", () => ({
  getChildTableConfig: (): undefined => undefined,
  isServerOwnedUserTable: (): boolean => false,
  isSnapshotTable: (): boolean => false,
}));

jest.mock("@/services/sync/market-rate-snapshot-pull", () => ({
  pullMarketRateSnapshots: (
    ...args: Parameters<typeof mockPullMarketRateSnapshots>
  ): ReturnType<typeof mockPullMarketRateSnapshots> =>
    mockPullMarketRateSnapshots(...args),
}));

jest.mock("@/services/sync/pull-strategies", () => ({
  pullCategories: (
    ...args: Parameters<typeof mockPullCategories>
  ): ReturnType<typeof mockPullCategories> => mockPullCategories(...args),
  pullChildTable: (
    ...args: Parameters<typeof mockPullChildTable>
  ): ReturnType<typeof mockPullChildTable> => mockPullChildTable(...args),
  pullMetalDedicatedTable: (
    ...args: Parameters<typeof mockPullMetalDedicatedTable>
  ): ReturnType<typeof mockPullMetalDedicatedTable> =>
    mockPullMetalDedicatedTable(...args),
  pullSnapshotTable: (
    ...args: Parameters<typeof mockPullSnapshotTable>
  ): ReturnType<typeof mockPullSnapshotTable> => mockPullSnapshotTable(...args),
  pullUserTable: (
    ...args: Parameters<typeof mockPullUserTable>
  ): ReturnType<typeof mockPullUserTable> => mockPullUserTable(...args),
  protectMetalMetadataPullFragments: (
    ...args: Parameters<typeof mockProtectMetalMetadataPullFragments>
  ): ReturnType<typeof mockProtectMetalMetadataPullFragments> =>
    mockProtectMetalMetadataPullFragments(...args),
}));

import { pullChanges } from "@/services/sync/atomic-pull-strategies";

const USER_ID = "user-302";
const UPPER_WATERMARK = "2026-09-09T12:00:00.000Z";
const MARKET_ROOT_CHANGES: SyncTableChangeSet = {
  created: [],
  updated: [{ id: "snapshot-1" }],
  deleted: [],
};
const MARKET_OBSERVATION_CHANGES: SyncTableChangeSet = {
  created: [],
  updated: [{ id: "observation-1" }],
  deleted: [],
};

function expectCompletedPullResult(
  value: SyncPullResult
): asserts value is Extract<
  SyncPullResult,
  { readonly changes: unknown; readonly timestamp: number }
> {
  const isCompleted = "changes" in value && "timestamp" in value;
  expect(isCompleted).toBe(true);
  if (!isCompleted) {
    throw new Error("Expected a completed pull result");
  }
}

describe("atomic pullChanges market-rate composition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockResolvedValue(USER_ID);
    mockPullMarketRateSnapshots.mockResolvedValue({
      changes: {
        market_rates: MARKET_ROOT_CHANGES,
        market_rate_observations: MARKET_OBSERVATION_CHANGES,
      },
      upperWatermark: UPPER_WATERMARK,
    });
    mockPullCategories.mockResolvedValue(EMPTY_CHANGES);
    mockPullChildTable.mockResolvedValue(EMPTY_CHANGES);
    mockPullMetalDedicatedTable.mockResolvedValue(EMPTY_CHANGES);
    mockPullSnapshotTable.mockResolvedValue(EMPTY_CHANGES);
    mockPullUserTable.mockResolvedValue(EMPTY_CHANGES);
    mockProtectMetalMetadataPullFragments.mockImplementation(
      (changes: SyncTableChangeSet): SyncTableChangeSet => changes
    );
  });

  it("uses one complete-envelope market pull as the sync watermark authority", async () => {
    const result = await pullChanges(null, USER_ID);
    expectCompletedPullResult(result);

    expect(mockPullMarketRateSnapshots).toHaveBeenCalledWith(null);
    expect(result.changes.market_rates).toBe(MARKET_ROOT_CHANGES);
    expect(result.changes.market_rate_observations).toBe(
      MARKET_OBSERVATION_CHANGES
    );
    expect(mockPullCategories).toHaveBeenCalledWith(
      USER_ID,
      null,
      UPPER_WATERMARK
    );
    expect(mockPullMetalDedicatedTable).toHaveBeenCalledTimes(5);
    expect(mockPullUserTable).not.toHaveBeenCalledWith(
      "market_rates",
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(result.timestamp).toBe(Date.parse(UPPER_WATERMARK));
    expect(mockGetCurrentUserId).toHaveBeenCalledTimes(2);
  });

  it("starts after the previous sync watermark without replaying equal-time roots", async () => {
    const lastPulledAt = Date.parse("2026-09-08T10:00:00.000Z");

    await pullChanges(lastPulledAt, USER_ID);

    expect(mockPullMarketRateSnapshots).toHaveBeenCalledWith({
      createdAt: "2026-09-08T10:00:00.000Z",
      id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    });
  });

  it("fails before other table pulls when the complete-envelope market pull fails", async () => {
    mockPullMarketRateSnapshots.mockRejectedValueOnce(
      new Error("snapshot page invalid")
    );

    await expect(pullChanges(null, USER_ID)).rejects.toThrow(
      "snapshot page invalid"
    );
    expect(mockPullCategories).not.toHaveBeenCalled();
    expect(mockPullMetalDedicatedTable).not.toHaveBeenCalled();
  });

  it("rejects an authentication-scope change before returning changes", async () => {
    mockGetCurrentUserId
      .mockResolvedValueOnce(USER_ID)
      .mockResolvedValueOnce("different-user");

    await expect(pullChanges(null, USER_ID)).rejects.toThrow(
      "sync_pull_auth_scope_lost"
    );
  });
});
