import type { Database } from "@nozbe/watermelondb";

const mockSynchronize = jest.fn();
const mockGetCurrentUserId = jest.fn();

jest.mock("@monyvi/db", () => ({ schema: { tables: {} } }));

jest.mock("@nozbe/watermelondb/sync", () => ({
  synchronize: (input: unknown): Promise<void> =>
    mockSynchronize(input) as Promise<void>,
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> =>
    mockGetCurrentUserId() as Promise<string | null>,
  supabase: { from: jest.fn() },
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
const emptyDatabase: Record<string, never> = {};
const database = emptyDatabase as unknown as Database;

describe("sync auth scope lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
