const mockSynchronize = jest.fn();
const mockGetCurrentUserId = jest.fn();
const mockPushChanges = jest.fn();

jest.mock("@nozbe/watermelondb/sync", () => ({
  synchronize: (args: unknown): Promise<unknown> =>
    mockSynchronize(args) as Promise<unknown>,
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> =>
    mockGetCurrentUserId() as Promise<string | null>,
}));

jest.mock("../../services/sync/pull-strategies", () => ({
  pullChanges: jest.fn(),
}));

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
        getLocal: jest.fn().mockResolvedValue(undefined),
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
      "current-user"
    );
  });
});
