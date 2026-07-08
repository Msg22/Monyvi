/**
 * Unit tests for the Supabase <-> WatermelonDB sync adapter.
 *
 * These tests cover the failure semantics that protect WatermelonDB's sync
 * cursor. A failed pull or push must reject the sync so WatermelonDB does not
 * treat missing remote data as a successful empty changeset.
 */

const mockSynchronize = jest.fn();
const mockGetCurrentUserId = jest.fn();
const mockFrom = jest.fn();
const mockInsert = jest.fn();
const mockUpsert = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateIn = jest.fn();
const mockUpdateScopedIn = jest.fn();
const mockUpdateEq = jest.fn();
const mockWatermelonWhere = jest.fn((column: string, value: unknown) => ({
  column,
  value,
}));
const mockWatermelonNotEq = jest.fn((value: unknown) => ({ notEq: value }));
const mockForeignProfilesFetch = jest.fn();
const mockProfileQuery = jest.fn();
const mockDatabaseGet = jest.fn();
const mockDatabaseWrite = jest.fn();

interface SupabaseError {
  readonly message: string;
}

interface SupabaseResult {
  readonly data: ReadonlyArray<Record<string, unknown>> | null;
  readonly error: SupabaseError | null;
}

let selectResult: SupabaseResult = { data: [], error: null };
let selectResultsByTable: Record<string, SupabaseResult | undefined> = {};

jest.mock("@monyvi/db", () => ({
  schema: {
    tables: {
      account_sms_senders: {},
      accounts: {},
      asset_metals: {},
      assets: {},
      categories: {},
      profiles: {},
      transactions: {},
      transfers: {},
    },
  },
}));

jest.mock("@nozbe/watermelondb/sync", () => ({
  synchronize: (args: unknown): Promise<unknown> =>
    mockSynchronize(args) as Promise<unknown>,
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    notEq: (value: unknown): unknown => mockWatermelonNotEq(value),
    where: (column: string, value: unknown): unknown =>
      mockWatermelonWhere(column, value),
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
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import { syncDatabase } from "../../services/sync";

function getSelectResult(table?: string): SupabaseResult {
  return (table ? selectResultsByTable[table] : undefined) ?? selectResult;
}

function makeSelectChain(table?: string): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    gt: jest.fn(() => chain),
    or: jest.fn(() => chain),
    order: jest.fn(() => Promise.resolve(getSelectResult(table))),
    in: jest.fn(() => Promise.resolve(getSelectResult(table))),
    then: (
      resolve: (value: SupabaseResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(getSelectResult(table)).then(resolve, reject),
  };

  return chain;
}

function mockSupabaseTable(): void {
  mockFrom.mockImplementation((table: string) => ({
    ...makeSelectChain(table),
    insert: mockInsert,
    upsert: mockUpsert,
    update: mockUpdate,
  }));
  mockUpdate.mockReturnValue({ eq: mockUpdateEq, in: mockUpdateScopedIn });
  mockUpdateScopedIn.mockReturnValue({ in: mockUpdateIn });
  mockUpdateEq.mockReturnValue({ in: mockUpdateIn });
}

const mockDatabaseStub = {
  get: mockDatabaseGet,
  write: mockDatabaseWrite,
};
const mockDatabase = mockDatabaseStub as never;

beforeEach(() => {
  jest.clearAllMocks();
  selectResult = { data: [], error: null };
  selectResultsByTable = {};
  mockGetCurrentUserId.mockResolvedValue("current-user");
  mockSupabaseTable();
  mockForeignProfilesFetch.mockResolvedValue([]);
  mockProfileQuery.mockReturnValue({ fetch: mockForeignProfilesFetch });
  mockDatabaseGet.mockReturnValue({ query: mockProfileQuery });
  mockDatabaseWrite.mockImplementation(async (writer: () => Promise<void>) => {
    await writer();
  });
});

describe("syncDatabase", () => {
  it("rejects pull table errors instead of returning a successful empty pull", async () => {
    selectResult = {
      data: null,
      error: { message: "profiles pull failed" },
    };
    mockSynchronize.mockImplementation(
      async (args: {
        pullChanges: (input: {
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pullChanges({ lastPulledAt: null });
      }
    );

    await expect(syncDatabase(mockDatabase, true)).rejects.toThrow(
      "profiles pull failed"
    );
  });

  it("rejects push created-row upsert errors so WatermelonDB keeps the local change dirty", async () => {
    mockUpsert.mockResolvedValue({
      error: { message: "created upsert failed" },
    });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            profiles: {
              created: [{ id: "profile-1", user_id: "current-user" }],
              updated: [],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).rejects.toThrow(
      "created upsert failed"
    );
  });

  it("rejects push upsert errors so WatermelonDB keeps the local update dirty", async () => {
    mockUpsert.mockResolvedValue({ error: { message: "upsert failed" } });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            profiles: {
              created: [],
              updated: [{ id: "profile-1", user_id: "current-user" }],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).rejects.toThrow("upsert failed");
  });

  it("batches active updated rows into one Supabase upsert", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            accounts: {
              created: [],
              updated: [
                {
                  id: "account-1",
                  user_id: "current-user",
                  name: "Main",
                  currency: "EGP",
                  deleted: false,
                },
                {
                  id: "account-2",
                  user_id: "current-user",
                  name: "Savings",
                  currency: "EGP",
                  deleted: false,
                },
              ],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).resolves.toBeUndefined();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id: "account-1", user_id: "current-user" }),
        expect.objectContaining({ id: "account-2", user_id: "current-user" }),
      ],
      { onConflict: "id" }
    );
  });

  it("pushes profile onboarding flags as JSON instead of null", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            profiles: {
              created: [],
              updated: [
                {
                  id: "profile-1",
                  user_id: "current-user",
                  onboarding_flags: null,
                  notification_settings:
                    '{"sms_transaction_confirmation":true}',
                },
              ],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).resolves.toBeUndefined();

    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "profile-1",
          user_id: "current-user",
          onboarding_flags: {},
          notification_settings: {
            sms_transaction_confirmation: true,
          },
        }),
      ],
      { onConflict: "id" }
    );
  });

  it("rejects invalid serialized profile JSON during push", async () => {
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            profiles: {
              created: [],
              updated: [
                {
                  id: "profile-1",
                  user_id: "current-user",
                  onboarding_flags: "{invalid-json",
                },
              ],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).rejects.toThrow(
      "Invalid serialized JSON in profile column onboarding_flags"
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("pulls profile JSON fields as WatermelonDB string fields", async () => {
    selectResultsByTable = {
      profiles: {
        data: [
          {
            id: "profile-1",
            user_id: "current-user",
            deleted: false,
            created_at: "2026-05-18T08:00:00.000Z",
            updated_at: "2026-05-18T08:00:00.000Z",
            onboarding_flags: { cash_account_tooltip_dismissed: true },
            notification_settings: {
              sms_transaction_confirmation: true,
            },
          },
        ],
        error: null,
      },
    };

    let pulledChanges: Record<string, unknown> | undefined;
    mockSynchronize.mockImplementation(
      async (args: {
        pullChanges: (input: {
          lastPulledAt: number | null;
        }) => Promise<{ changes: Record<string, unknown> }>;
      }) => {
        const result = await args.pullChanges({ lastPulledAt: null });
        pulledChanges = result.changes;
      }
    );

    await expect(syncDatabase(mockDatabase, true)).resolves.toBeUndefined();

    const changes = pulledChanges as {
      readonly profiles: {
        readonly updated: ReadonlyArray<Record<string, unknown>>;
      };
    };
    expect(changes.profiles.updated[0]).toEqual(
      expect.objectContaining({
        onboarding_flags: '{"cash_account_tooltip_dismissed":true}',
        notification_settings: '{"sms_transaction_confirmation":true}',
        created_at: Date.UTC(2026, 4, 18, 8),
        updated_at: Date.UTC(2026, 4, 18, 8),
      })
    );
  });

  it("rejects push soft-delete errors so WatermelonDB keeps the delete dirty", async () => {
    mockUpdateIn.mockResolvedValue({ error: { message: "delete failed" } });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            profiles: {
              created: [],
              updated: [],
              deleted: ["profile-1"],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).rejects.toThrow("delete failed");
  });

  it("rejects foreign dirty rows instead of pushing them as the authenticated user", async () => {
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            profiles: {
              created: [],
              updated: [{ id: "profile-1", user_id: "previous-user" }],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).rejects.toThrow(
      "Refusing to sync foreign local changes"
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("scopes child-table deletes through current-user parents even when the parent is soft-deleted", async () => {
    mockForeignProfilesFetch.mockResolvedValue([
      { id: "asset-1", user_id: "current-user", deleted: true },
    ]);
    mockUpdateIn.mockResolvedValue({ error: null });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            asset_metals: {
              created: [],
              updated: [],
              deleted: ["metal-1"],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).resolves.toBeUndefined();

    expect(mockDatabaseGet).toHaveBeenCalledWith("assets");
    expect(mockWatermelonWhere).toHaveBeenCalledWith("user_id", "current-user");
    expect(mockWatermelonWhere).not.toHaveBeenCalledWith("deleted", false);
    expect(mockUpdateScopedIn).toHaveBeenCalledWith("asset_id", ["asset-1"]);
    expect(mockUpdateIn).toHaveBeenCalledWith("id", ["metal-1"]);
  });

  it("rejects child-table inserts when the parent is foreign", async () => {
    mockForeignProfilesFetch.mockResolvedValue([
      { id: "asset-current", user_id: "current-user", deleted: false },
    ]);
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            asset_metals: {
              created: [{ id: "metal-1", asset_id: "asset-foreign" }],
              updated: [],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).rejects.toThrow(
      "Refusing to sync foreign local changes"
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects child-table inserts when the parent is soft-deleted", async () => {
    mockForeignProfilesFetch.mockResolvedValue([]);
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            asset_metals: {
              created: [{ id: "metal-1", asset_id: "asset-deleted" }],
              updated: [],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).rejects.toThrow(
      "Refusing to sync foreign local changes"
    );
    expect(mockWatermelonWhere).toHaveBeenCalledWith("deleted", false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("pushes parent account rows before new SMS sender child rows", async () => {
    mockForeignProfilesFetch.mockResolvedValue([
      { id: "account-1", user_id: "current-user", deleted: false },
    ]);
    mockUpsert.mockResolvedValue({ error: null });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            account_sms_senders: {
              created: [
                {
                  id: "sender-1",
                  account_id: "account-1",
                  sender_name: "CIB",
                  normalized_sender_name: "cib",
                  created_at: Date.UTC(2026, 0, 15, 10),
                  updated_at: Date.UTC(2026, 0, 15, 10),
                  deleted: false,
                },
              ],
              updated: [],
              deleted: [],
            },
            accounts: {
              created: [
                {
                  id: "account-1",
                  user_id: "current-user",
                  name: "CIB",
                  currency: "EGP",
                  type: "BANK",
                  balance: 0,
                  created_at: Date.UTC(2026, 0, 15, 10),
                  updated_at: Date.UTC(2026, 0, 15, 10),
                  deleted: false,
                },
              ],
              updated: [],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).resolves.toBeUndefined();

    const pushedTables = mockFrom.mock.calls.map(
      ([table]: readonly [string]) => table
    );

    expect(pushedTables).toEqual(["accounts", "account_sms_senders"]);
  });

  it("pushes same-table deletions before replacement creates", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    mockUpdateIn.mockResolvedValue({ error: null });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            accounts: {
              created: [
                {
                  id: "account-new",
                  user_id: "current-user",
                  name: "Cash",
                  currency: "EGP",
                  institution_id: null,
                  deleted: false,
                },
              ],
              updated: [
                {
                  id: "account-old",
                  user_id: "current-user",
                  name: "Cash",
                  currency: "EGP",
                  institution_id: null,
                  deleted: true,
                },
              ],
              deleted: ["account-hard-deleted"],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).resolves.toBeUndefined();

    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "account-old",
          deleted: true,
        }),
      ],
      { onConflict: "id" }
    );
    expect(mockUpdateIn).toHaveBeenCalledWith("id", ["account-hard-deleted"]);
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "account-new",
          deleted: false,
        }),
      ],
      { onConflict: "id" }
    );
    expect(mockUpsert.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpsert.mock.invocationCallOrder[1]
    );
    expect(mockUpdateIn.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpsert.mock.invocationCallOrder[1]
    );
  });

  it("allows child-table soft-delete updates when the owned parent is already soft-deleted", async () => {
    mockForeignProfilesFetch.mockResolvedValue([
      { id: "account-1", user_id: "current-user", deleted: true },
    ]);
    mockUpsert.mockResolvedValue({ error: null });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            account_sms_senders: {
              created: [],
              updated: [
                {
                  id: "sender-1",
                  account_id: "account-1",
                  sender_name: "CIB",
                  normalized_sender_name: "cib",
                  created_at: Date.UTC(2026, 0, 15, 10),
                  updated_at: Date.UTC(2026, 0, 15, 11),
                  deleted: true,
                },
              ],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).resolves.toBeUndefined();

    expect(mockDatabaseGet).toHaveBeenCalledWith("accounts");
    expect(mockWatermelonWhere).toHaveBeenCalledWith("user_id", "current-user");
    expect(mockWatermelonWhere).not.toHaveBeenCalledWith("deleted", false);
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "sender-1",
          account_id: "account-1",
          deleted: true,
        }),
      ],
      { onConflict: "id" }
    );
  });

  it("rejects child-table updates when parent lookup fails", async () => {
    mockForeignProfilesFetch.mockRejectedValue(
      new Error("parent lookup failed")
    );
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            asset_metals: {
              created: [],
              updated: [{ id: "metal-1", asset_id: "asset-1" }],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).rejects.toThrow(
      "parent lookup failed"
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("pushes SMS-created transactions with sms_fingerprint and without the old sms_body_hash field", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            transactions: {
              created: [
                {
                  id: "transaction-1",
                  user_id: "current-user",
                  amount: 850,
                  type: "EXPENSE",
                  date: Date.UTC(2026, 0, 15),
                  created_at: Date.UTC(2026, 0, 15, 10),
                  updated_at: Date.UTC(2026, 0, 15, 10),
                  sms_fingerprint: "sms-fingerprint-transaction-1",
                  sms_body_hash: "legacy-hash-should-not-sync",
                },
              ],
              updated: [],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith("transactions");
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "transaction-1",
          user_id: "current-user",
          sms_fingerprint: "sms-fingerprint-transaction-1",
          date: "2026-01-15",
          created_at: "2026-01-15T10:00:00.000Z",
          updated_at: "2026-01-15T10:00:00.000Z",
        }),
      ],
      { onConflict: "id" }
    );

    const insertCalls: ReadonlyArray<
      readonly [ReadonlyArray<Record<string, unknown>>, { onConflict: "id" }]
    > = mockUpsert.mock.calls;
    const [insertedRows] = insertCalls[0];
    const [insertedRow] = insertedRows;
    expect(insertedRow).not.toHaveProperty("sms_body_hash");
  });

  it("pushes SMS-created transfers with sms_fingerprint and without the old sms_body_hash field", async () => {
    mockUpsert.mockResolvedValue({ error: null });
    mockSynchronize.mockImplementation(
      async (args: {
        pushChanges: (input: {
          changes: Record<string, unknown>;
          lastPulledAt: number | null;
        }) => Promise<unknown>;
      }) => {
        await args.pushChanges({
          changes: {
            transfers: {
              created: [
                {
                  id: "transfer-1",
                  user_id: "current-user",
                  from_account_id: "cash-account",
                  to_account_id: "bank-account",
                  amount: 1000,
                  date: Date.UTC(2026, 0, 16),
                  created_at: Date.UTC(2026, 0, 16, 12),
                  updated_at: Date.UTC(2026, 0, 16, 12),
                  sms_fingerprint: "sms-fingerprint-transfer-1",
                  sms_body_hash: "legacy-transfer-hash-should-not-sync",
                },
              ],
              updated: [],
              deleted: [],
            },
          },
          lastPulledAt: null,
        });
      }
    );

    await expect(syncDatabase(mockDatabase)).resolves.toBeUndefined();

    expect(mockFrom).toHaveBeenCalledWith("transfers");
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: "transfer-1",
          user_id: "current-user",
          sms_fingerprint: "sms-fingerprint-transfer-1",
          date: "2026-01-16",
          created_at: "2026-01-16T12:00:00.000Z",
          updated_at: "2026-01-16T12:00:00.000Z",
        }),
      ],
      { onConflict: "id" }
    );

    const insertCalls: ReadonlyArray<
      readonly [ReadonlyArray<Record<string, unknown>>, { onConflict: "id" }]
    > = mockUpsert.mock.calls;
    const [insertedRows] = insertCalls[0];
    const [insertedRow] = insertedRows;
    expect(insertedRow).not.toHaveProperty("sms_body_hash");
  });
});
