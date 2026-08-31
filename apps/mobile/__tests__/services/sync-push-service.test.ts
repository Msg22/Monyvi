const mockGetCurrentUserId = jest.fn();
const mockFrom = jest.fn();
const mockUpsert = jest.fn();

jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
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
    "rejects dirty dedicated-table %s changes before auth or remote writes",
    async (_changeKind, dedicatedChanges) => {
      const database = Object.create(null) as PushChangesDatabase;
      const changes = {
        financial_action_groups: dedicatedChanges,
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

      await expect(pushChanges(database, pushArgs)).rejects.toThrow(
        GENERIC_SYNC_ERROR_CODES.DEDICATED_CHANGES_PENDING
      );

      expect(mockGetCurrentUserId).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockUpsert).not.toHaveBeenCalled();
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
});
