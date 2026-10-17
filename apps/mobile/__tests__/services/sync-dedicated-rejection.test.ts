const mockSynchronize = jest.fn();
const mockGetCurrentUserId = jest.fn();
const mockPushChanges = jest.fn();

jest.mock("@nozbe/watermelondb/sync", () => ({
  MONYVI_SYNC_WRITER_GUARDS: "monyvi/watermelon-sync-writer-guards/0.28.0/v1",
  synchronize: (args: unknown): Promise<unknown> => {
    // This transport-only mock must receive every protected SDK writer hook.
    expect(args).toEqual(
      expect.objectContaining<Record<string, unknown>>({
        beforeApplyRemoteChangesInWriter: expect.any(Function),
        beforePullCheckpointInWriter: expect.any(Function),
        beforeMarkLocalChangesAsSyncedInWriter: expect.any(Function),
        conflictResolver: expect.any(Function),
      })
    );
    return mockSynchronize(args) as Promise<unknown>;
  },
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> =>
    mockGetCurrentUserId() as Promise<string | null>,
}));

jest.mock("../../services/sync/atomic-pull-strategies", () => ({
  pullChanges: jest.fn(),
}));

jest.mock("@monyvi/db", () => ({ schema: { tables: {} } }));

jest.mock("../../services/sync/push-service", () => ({
  pushChanges: (...args: readonly unknown[]): Promise<unknown> =>
    mockPushChanges(...args) as Promise<unknown>,
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

describe("syncDatabase dedicated rejection passthrough", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockResolvedValue("current-user");
  });

  it("returns push rejected ids to Watermelon synchronize", async () => {
    const database = {
      adapter: {
        getLocal: jest.fn(
          (key: string): Promise<string | undefined> =>
            Promise.resolve(
              key ===
                "__monyvi_sync_historical_recovery:issue255-v1:current-user"
                ? "complete"
                : undefined
            )
        ),
        setLocal: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as Parameters<typeof syncDatabase>[0];
    const rejectedResult = {
      experimentalRejectedIds: {
        financial_action_groups: ["foreign-root"],
      },
    };
    let callbackResult: unknown;
    mockPushChanges.mockResolvedValue(rejectedResult);
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number;
        }) => Promise<unknown>;
      }): Promise<void> => {
        callbackResult = await args.pushChanges({
          changes: {
            financial_action_groups: {
              created: [{ id: "foreign-root" }],
              updated: [],
              deleted: [],
            },
          },
          lastPulledAt: 123,
        });
      }
    );

    await expect(syncDatabase(database)).resolves.toBeUndefined();

    expect(callbackResult).toEqual(rejectedResult);
    expect(mockPushChanges).toHaveBeenCalledWith(
      database,
      {
        changes: {
          financial_action_groups: {
            created: [{ id: "foreign-root" }],
            updated: [],
            deleted: [],
          },
        },
        lastPulledAt: 123,
      },
      "current-user",
      undefined,
      expect.any(Object)
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
