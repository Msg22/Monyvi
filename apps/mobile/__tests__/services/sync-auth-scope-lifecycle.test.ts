import type { Database } from "@nozbe/watermelondb";

const mockSynchronize = jest.fn();
const mockGetCurrentUserId = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockSetLocal = jest.fn().mockResolvedValue(undefined);
let mockHistoricalRecoveryRequired = false;
let mockUnresolvedCount = 0;

jest.mock("@monyvi/db", () => ({ schema: { tables: {} } }));

jest.mock("@nozbe/watermelondb/sync", () => ({
  synchronize: (input: unknown): Promise<void> =>
    mockSynchronize(input) as Promise<void>,
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> =>
    mockGetCurrentUserId() as Promise<string | null>,
  supabase: {
    from: (table: string): unknown => mockFrom(table),
    rpc: (name: string, args: unknown): unknown => mockRpc(name, args),
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import { syncDatabase } from "../../services/sync";
import { logger } from "@/utils/logger";

interface SynchronizeCallbacks {
  readonly pullChanges: (input: {
    readonly lastPulledAt: number | null;
  }) => Promise<{ readonly timestamp: number }>;
  readonly pushChanges: (input: {
    readonly changes: Record<string, never>;
    readonly lastPulledAt: number;
  }) => Promise<unknown>;
}

const EXPECTED_USER_ID = "current-user";
const INITIAL_WATERMARK = 1_700_000_000_000;
const database = {
  adapter: {
    // Existing lifecycle cases start after this fixed repair completed.
    getLocal: jest.fn(
      (key: string): Promise<string | undefined> =>
        Promise.resolve(
          key ===
            "__monyvi_sync_historical_recovery:issue255-v1:current-user" &&
            !mockHistoricalRecoveryRequired
            ? "complete"
            : undefined
        )
    ),
    setLocal: mockSetLocal,
  },
  get: (): {
    query: () => { fetchCount: () => Promise<number> };
  } => ({
    query: (): { fetchCount: () => Promise<number> } => ({
      fetchCount: (): Promise<number> => Promise.resolve(mockUnresolvedCount),
    }),
  }),
} as unknown as Database;

interface EmptySelectChain {
  readonly select: jest.Mock<EmptySelectChain>;
  readonly eq: jest.Mock<EmptySelectChain>;
  readonly gt: jest.Mock<EmptySelectChain>;
  readonly lte: jest.Mock<EmptySelectChain>;
  readonly limit: jest.Mock<EmptySelectChain>;
  readonly or: jest.Mock<EmptySelectChain>;
  readonly order: jest.Mock<EmptySelectChain>;
  readonly then: (
    resolve: (value: {
      readonly data: readonly [];
      readonly error: null;
    }) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise<unknown>;
}

describe("sync auth scope lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHistoricalRecoveryRequired = false;
    mockUnresolvedCount = 0;
    mockGetCurrentUserId.mockReset();
    const upperWatermark = "2026-05-18T08:05:00.000Z";
    mockRpc.mockImplementation((name: string) => {
      const data =
        name === "seal_sync_pull_v1"
          ? upperWatermark
          : name === "pull_snapshot_deletions_page_v1"
            ? { rows: [], count: 0, upperWatermark }
            : { nextCursor: null, snapshots: [], upperWatermark };
      return Promise.resolve({ data, error: null });
    });
    mockFrom.mockImplementation(() => {
      const chain: EmptySelectChain = {
        select: jest.fn((): EmptySelectChain => chain),
        eq: jest.fn((): EmptySelectChain => chain),
        gt: jest.fn((): EmptySelectChain => chain),
        lte: jest.fn((): EmptySelectChain => chain),
        limit: jest.fn((): EmptySelectChain => chain),
        or: jest.fn((): EmptySelectChain => chain),
        order: jest.fn((): EmptySelectChain => chain),
        then: (
          resolve: (value: {
            readonly data: readonly [];
            readonly error: null;
          }) => unknown,
          reject?: (reason: unknown) => unknown
        ) =>
          Promise.resolve({ data: [], error: null, count: 0 } as const).then(
            resolve,
            reject
          ),
      };
      return chain;
    });
  });

  it.each([
    { repairDue: true, unresolved: 1, shouldWarn: true },
    { repairDue: true, unresolved: 0, shouldWarn: false },
    { repairDue: false, unresolved: 1, shouldWarn: false },
  ])(
    "warns only for the captured withholding gate: $repairDue/$unresolved",
    async ({ repairDue, unresolved, shouldWarn }): Promise<void> => {
      mockHistoricalRecoveryRequired = repairDue;
      mockUnresolvedCount = unresolved;
      mockGetCurrentUserId.mockResolvedValue(EXPECTED_USER_ID);
      mockSynchronize.mockImplementation((): Promise<void> => {
        // Resolution during synchronization must not change the captured gate.
        mockUnresolvedCount = 0;
        return Promise.resolve();
      });

      await syncDatabase(database);

      // Exact arguments ensure the event contains no identifiers or payload.
      expect(jest.mocked(logger.warn).mock.calls).toEqual(
        shouldWarn ? [["sync.historicalRecoveryReceiptWithheld"]] : []
      );
      const receipt =
        "__monyvi_sync_historical_recovery:issue255-v1:current-user";
      if (repairDue && !shouldWarn) {
        expect(mockSetLocal).toHaveBeenCalledWith(receipt, "complete");
      } else {
        expect(mockSetLocal).not.toHaveBeenCalledWith(receipt, "complete");
      }
    }
  );

  it.each([
    ["vanishes", null],
    ["changes", "different-user"],
  ])(
    "does not advance an empty-pull watermark when auth %s before pull",
    async (_label, pullUserId) => {
      let persistedWatermark = INITIAL_WATERMARK;
      mockGetCurrentUserId
        .mockResolvedValueOnce(EXPECTED_USER_ID)
        .mockResolvedValueOnce(pullUserId);
      mockSynchronize.mockImplementation(
        async (callbacks: SynchronizeCallbacks): Promise<void> => {
          const result = await callbacks.pullChanges({
            lastPulledAt: persistedWatermark,
          });
          persistedWatermark = result.timestamp;
        }
      );

      await expect(syncDatabase(database)).rejects.toThrow(
        "sync_pull_auth_scope_lost"
      );
      expect(persistedWatermark).toBe(INITIAL_WATERMARK);
    }
  );

  it("does not advance an empty-pull watermark when auth vanishes before pull returns", async () => {
    let persistedWatermark = INITIAL_WATERMARK;
    mockGetCurrentUserId
      .mockResolvedValueOnce(EXPECTED_USER_ID)
      .mockResolvedValueOnce(EXPECTED_USER_ID)
      .mockResolvedValueOnce(null);
    mockSynchronize.mockImplementation(
      async (callbacks: SynchronizeCallbacks): Promise<void> => {
        const result = await callbacks.pullChanges({
          lastPulledAt: persistedWatermark,
        });
        persistedWatermark = result.timestamp;
      }
    );

    await expect(syncDatabase(database)).rejects.toThrow(
      "sync_pull_auth_scope_lost"
    );
    expect(persistedWatermark).toBe(INITIAL_WATERMARK);
  });

  it("rejects an empty push when the authenticated user differs from the pull owner", async () => {
    mockGetCurrentUserId
      .mockResolvedValueOnce(EXPECTED_USER_ID)
      .mockResolvedValueOnce(EXPECTED_USER_ID)
      .mockResolvedValueOnce(EXPECTED_USER_ID)
      .mockResolvedValueOnce("different-user");
    mockSynchronize.mockImplementation(
      async (callbacks: SynchronizeCallbacks): Promise<void> => {
        const pullResult = await callbacks.pullChanges({ lastPulledAt: null });
        await callbacks.pushChanges({
          changes: {},
          lastPulledAt: pullResult.timestamp,
        });
      }
    );

    await expect(syncDatabase(database)).rejects.toThrow(
      "sync_push_auth_scope_lost"
    );
  });
});
jest.mock("../../services/legacy-metal-add-repair-service", () => ({
  repairLegacyMetalAdds: jest
    .fn()
    .mockResolvedValue({ repaired: 0, skipped: [] }),
}));
jest.mock("../../services/legacy-metal-edit-repair-service", () => ({
  repairLegacyMetalEdits: jest
    .fn()
    .mockResolvedValue({ repaired: 0, skipped: [] }),
}));
