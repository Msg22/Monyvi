const mockGetCurrentUserId = jest.fn();
const mockFrom = jest.fn();
const mockUpsert = jest.fn();

jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      assets: {},
      categories: {},
      financial_action_groups: {},
      profiles: {},
    },
  },
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> =>
    mockGetCurrentUserId() as Promise<string | null>,
  supabase: {
    from: (table: string): unknown => mockFrom(table),
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  GENERIC_SYNC_ERROR_CODES,
  pushChanges,
} from "../../services/sync/push-service";

type PushChangesDatabase = Parameters<typeof pushChanges>[0];
type PushChangesArgs = Parameters<typeof pushChanges>[1];

describe("pushChanges", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockResolvedValue("current-user");
    mockFrom.mockReturnValue({
      upsert: mockUpsert,
    });
    mockUpsert.mockResolvedValue({ error: null });
  });

  it.each([
    ["created", { created: [{ id: "root-1" }], updated: [], deleted: [] }],
    ["updated", { created: [], updated: [{ id: "root-1" }], deleted: [] }],
    ["deleted", { created: [], updated: [], deleted: ["root-1"] }],
  ] as const)(
    "returns dirty dedicated-table %s ids as rejected while pushing unrelated rows",
    async (_changeKind, dedicatedChanges) => {
      const database = Object.create(null) as PushChangesDatabase;
      const changes: PushChangesArgs["changes"] = {
        financial_action_groups: {
          created: [...dedicatedChanges.created],
          updated: [...dedicatedChanges.updated],
          deleted: [...dedicatedChanges.deleted],
        },
        profiles: {
          created: [
            {
              id: "profile-1",
              user_id: "current-user",
              deleted: false,
            },
          ],
          updated: [],
          deleted: [],
        },
      };
      const pushArgs: PushChangesArgs = {
        changes,
        lastPulledAt: 0,
      };

      await expect(pushChanges(database, pushArgs)).resolves.toEqual({
        experimentalRejectedIds: {
          financial_action_groups: ["root-1"],
        },
      });

      expect(mockGetCurrentUserId).toHaveBeenCalledTimes(2);
      expect(mockFrom).not.toHaveBeenCalledWith("financial_action_groups");
      expect(mockFrom).toHaveBeenCalledWith("profiles");
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    }
  );

  it("keeps foreign prior-user dedicated roots dirty without blocking current-user generic sync", async () => {
    const database = Object.create(null) as PushChangesDatabase;
    const pushArgs: PushChangesArgs = {
      changes: {
        financial_action_groups: {
          created: [
            {
              id: "foreign-root",
              user_id: "prior-user",
            },
          ],
          updated: [],
          deleted: [],
        },
        profiles: {
          created: [
            {
              id: "profile-1",
              user_id: "current-user",
              deleted: false,
            },
          ],
          updated: [],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).resolves.toEqual({
      experimentalRejectedIds: {
        financial_action_groups: ["foreign-root"],
      },
    });

    expect(mockFrom).not.toHaveBeenCalledWith("financial_action_groups");
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("fails when auth disappears before push so no captured row is acknowledged", async () => {
    mockGetCurrentUserId.mockResolvedValue(null);
    const database = Object.create(null) as PushChangesDatabase;
    const pushArgs: PushChangesArgs = {
      changes: {
        financial_action_groups: {
          created: [{ id: "dedicated-root" }],
          updated: [],
          deleted: [],
        },
        profiles: {
          created: [
            {
              id: "profile-1",
              user_id: "current-user",
              deleted: false,
            },
          ],
          updated: [],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).rejects.toThrow(
      GENERIC_SYNC_ERROR_CODES.AUTH_SCOPE_LOST
    );

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it.each([
    ["disappears", null],
    ["changes", "different-user"],
  ])(
    "fails when auth %s after an awaited remote upsert",
    async (_case, finalUserId) => {
      const executionOrder: string[] = [];
      mockGetCurrentUserId
        .mockImplementationOnce((): Promise<string> => {
          executionOrder.push("initial-auth");
          return Promise.resolve("current-user");
        })
        .mockImplementationOnce((): Promise<string | null> => {
          executionOrder.push("final-auth");
          return Promise.resolve(finalUserId);
        });
      mockUpsert.mockImplementationOnce(async (): Promise<{ error: null }> => {
        executionOrder.push("upsert-start");
        await Promise.resolve();
        executionOrder.push("upsert-complete");
        return { error: null };
      });
      const database = Object.create(null) as PushChangesDatabase;
      const pushArgs: PushChangesArgs = {
        changes: {
          profiles: {
            created: [
              {
                id: "profile-1",
                user_id: "current-user",
                deleted: false,
              },
            ],
            updated: [],
            deleted: [],
          },
        },
        lastPulledAt: 0,
      };

      await expect(
        pushChanges(database, pushArgs, "current-user")
      ).rejects.toThrow(GENERIC_SYNC_ERROR_CODES.AUTH_SCOPE_LOST);

      expect(executionOrder).toEqual([
        "initial-auth",
        "upsert-start",
        "upsert-complete",
        "final-auth",
      ]);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    }
  );

  it("allows an empty dedicated-table change set without generating a generic remote write", async () => {
    const database = Object.create(null) as PushChangesDatabase;
    const profile = {
      id: "profile-1",
      user_id: "current-user",
      deleted: false,
    };
    const changes = {
      financial_action_groups: { created: [], updated: [], deleted: [] },
      profiles: { created: [profile], updated: [], deleted: [] },
    };
    const pushArgs: PushChangesArgs = {
      changes,
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).resolves.toBeUndefined();

    expect(mockFrom).not.toHaveBeenCalledWith("financial_action_groups");
    expect(mockFrom).toHaveBeenCalledWith("profiles");
  });

  it("skips dirty shared system categories instead of pushing them through user RLS", async () => {
    const database = Object.create(null) as PushChangesDatabase;
    const pushArgs: PushChangesArgs = {
      changes: {
        categories: {
          created: [],
          updated: [
            {
              id: "00000000-0000-0000-0001-000000000002",
              user_id: null,
              is_system: true,
              system_name: "food",
              deleted: false,
            },
          ],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).resolves.toBeUndefined();

    expect(mockFrom).not.toHaveBeenCalledWith("categories");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("upserts profiles by their unique user identity", async () => {
    const database = Object.create(null) as PushChangesDatabase;
    const profile = {
      id: "local-profile-id",
      user_id: "current-user",
      display_name: "Manual QA",
      deleted: false,
    };
    const pushArgs: PushChangesArgs = {
      changes: {
        profiles: {
          created: [profile],
          updated: [],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockUpsert).toHaveBeenCalledWith(
      [expect.objectContaining(profile)],
      {
        onConflict: "user_id",
      }
    );
  });

  it("strips server-authoritative metal projections from generic asset pushes", async () => {
    const database = Object.create(null) as PushChangesDatabase;
    const pushArgs: PushChangesArgs = {
      changes: {
        assets: {
          created: [
            {
              id: "asset-1",
              user_id: "current-user",
              name: "Gold holding",
              purchase_price_decimal: "100000.125",
              purchase_currency: "EGP",
              acquisition_action_id: "action-1",
              deleted: false,
            },
          ],
          updated: [],
          deleted: [],
        },
      },
      lastPulledAt: 0,
    };

    await expect(pushChanges(database, pushArgs)).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith("assets");
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        {
          id: "asset-1",
          user_id: "current-user",
          name: "Gold holding",
          deleted: false,
        },
      ],
      { onConflict: "id" }
    );
  });
});
