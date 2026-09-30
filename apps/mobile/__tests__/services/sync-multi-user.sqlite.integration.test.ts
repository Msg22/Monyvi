import {
  Database as WatermelonDatabase,
  Model as WatermelonModel,
  type Database,
  type Model,
} from "@nozbe/watermelondb";
import {
  synchronize,
  type SyncPushArgs,
  type SyncPullResult,
} from "@nozbe/watermelondb/sync";

let mockSyncUser = "user-b";
const mockUpsert = jest.fn<
  Promise<{ error: unknown }>,
  [string, ReadonlyArray<Record<string, unknown>>]
>();
const mockDelete = jest.fn<
  Promise<{ error: unknown }>,
  [string, Record<string, unknown>]
>();
const mockRpc = jest.fn();
const mockLoggerError = jest.fn();

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", () =>
  jest.requireActual<Record<string, unknown>>(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", () => {
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  return { schema };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockSyncUser),
  supabase: {
    from: (table: string): unknown => ({
      upsert: (
        rows: ReadonlyArray<Record<string, unknown>>
      ): Promise<{ error: unknown }> => mockUpsert(table, rows),
      update: (): unknown => {
        const filters: Record<string, unknown> = {};
        const query = {
          eq: (column: string, value: unknown): unknown => {
            filters[column] = value;
            return query;
          },
          in: (column: string, value: unknown): unknown => {
            filters[column] = value;
            return query;
          },
          then: (
            resolve: (result: { error: unknown }) => unknown
          ): Promise<unknown> =>
            Promise.resolve(mockDelete(table, { ...filters })).then(resolve),
        };
        return query;
      },
    }),
    rpc: (...args: unknown[]): unknown => mockRpc(...args),
  },
}));
jest.mock("../../services/financial-action-foundation-repository", () => ({
  markFinancialActionGroupSyncFailed: jest.fn(),
  markFinancialActionGroupSyncPending: jest.fn(),
  recordFinancialActionGroupServerOutcome: jest.fn(),
}));
jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: (...args: unknown[]): unknown => mockLoggerError(...args),
  },
}));

import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { schema } from "@monyvi/db";
import { pushChanges } from "../../services/sync/push-service";

function modelForTable(table: string): typeof Model {
  class SyncTestModel extends WatermelonModel {
    static table = table;
  }
  return SyncTestModel;
}

async function createRow(
  database: Database,
  table: string,
  raw: Record<string, unknown>
): Promise<Model> {
  return database.write(async (): Promise<Model> => {
    const record = database.get(table).prepareCreateFromDirtyRaw(raw);
    await database.batch(record);
    return record;
  });
}

async function sync(database: Database): Promise<void> {
  await synchronize({
    database,
    pullChanges: (): Promise<SyncPullResult> =>
      Promise.resolve({ changes: {}, timestamp: Date.now() }),
    pushChanges: (args: SyncPushArgs) =>
      pushChanges(database, args, mockSyncUser),
    sendCreatedAsUpdated: true,
  });
}

describe("multi-user pending sync with real SQLite and Watermelon acknowledgement", () => {
  let database: Database;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSyncUser = "user-b";
    mockUpsert.mockResolvedValue({ error: null });
    mockDelete.mockResolvedValue({ error: null });
    const adapter = new SQLiteAdapter({ schema });
    await adapter.initializingPromise;
    database = new WatermelonDatabase({
      adapter,
      modelClasses: Object.keys(schema.tables).map(modelForTable),
    });
  });

  it("syncs B, preserves A's pending assets, retries, then syncs A after switching back", async () => {
    const foreign = await createRow(database, "assets", {
      id: "asset-a",
      user_id: "user-a",
      type: "OTHER",
      name: "A savings",
      deleted: false,
    });
    const owned = await createRow(database, "assets", {
      id: "asset-b",
      user_id: "user-b",
      type: "OTHER",
      name: "B savings",
      deleted: false,
    });
    await sync(database);
    expect(owned._raw._status).toBe("synced");
    expect(foreign._raw._status).toBe("created");
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith("assets", [
      expect.objectContaining({ id: "asset-b", user_id: "user-b" }),
    ]);
    await sync(database);
    expect(foreign._raw._status).toBe("created");
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    mockSyncUser = "user-a";
    await sync(database);
    expect(foreign._raw._status).toBe("synced");
    expect(mockUpsert).toHaveBeenLastCalledWith("assets", [
      expect.objectContaining({ id: "asset-a", user_id: "user-a" }),
    ]);
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("preserves foreign updated and soft-deleted rows while syncing current-user updates", async () => {
    const foreign = await createRow(database, "assets", {
      id: "asset-a",
      user_id: "user-a",
      type: "OTHER",
    });
    mockSyncUser = "user-a";
    await sync(database);
    await database.write(() =>
      foreign.update((record) => {
        record._setRaw("deleted", true);
        record._setRaw("name", "A changed");
      })
    );
    mockSyncUser = "user-b";
    const owned = await createRow(database, "assets", {
      id: "asset-b",
      user_id: "user-b",
      type: "OTHER",
    });
    mockUpsert.mockClear();
    await sync(database);
    expect(foreign._raw._status).toBe("updated");
    expect(owned._raw._status).toBe("synced");
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    mockSyncUser = "user-a";
    await sync(database);
    expect(foreign._raw._status).toBe("synced");
    expect(mockUpsert).toHaveBeenLastCalledWith("assets", [
      expect.objectContaining({ id: "asset-a", deleted: true }),
    ]);
  });

  it("retains foreign tombstones and acknowledges only owned deletes, even after reopening SQLite", async () => {
    const foreign = await createRow(database, "assets", {
      id: "asset-a",
      user_id: "user-a",
      type: "OTHER",
    });
    const owned = await createRow(database, "assets", {
      id: "asset-b",
      user_id: "user-b",
      type: "OTHER",
    });
    await database.write(async () => {
      await database.batch(
        foreign.prepareMarkAsDeleted(),
        owned.prepareMarkAsDeleted()
      );
    });
    const adapter = await (
      database.adapter.underlyingAdapter as SQLiteAdapter
    ).testClone();
    database = new WatermelonDatabase({
      adapter,
      modelClasses: Object.keys(schema.tables).map(modelForTable),
    });
    await sync(database);
    expect(await database.adapter.getDeletedRecords("assets")).toEqual([
      "asset-a",
    ]);
    expect(mockDelete).toHaveBeenCalledWith("assets", {
      user_id: "user-b",
      id: ["asset-b"],
    });
    mockSyncUser = "user-a";
    await sync(database);
    expect(await database.adapter.getDeletedRecords("assets")).toEqual([]);
    expect(mockDelete).toHaveBeenLastCalledWith("assets", {
      user_id: "user-a",
      id: ["asset-a"],
    });
  });

  it("scopes child creates and soft deletes through owned parents", async () => {
    await createRow(database, "assets", {
      id: "asset-a",
      user_id: "user-a",
      type: "OTHER",
    });
    await createRow(database, "assets", {
      id: "asset-b",
      user_id: "user-b",
      type: "OTHER",
      deleted: true,
    });
    const foreign = await createRow(database, "asset_metals", {
      id: "metal-a",
      asset_id: "asset-a",
    });
    const owned = await createRow(database, "asset_metals", {
      id: "metal-b",
      asset_id: "asset-b",
      deleted: true,
    });
    await sync(database);
    expect(foreign._raw._status).toBe("created");
    expect(owned._raw._status).toBe("synced");
    expect(mockUpsert).toHaveBeenCalledWith("asset_metals", [
      expect.objectContaining({
        id: "metal-b",
        asset_id: "asset-b",
        deleted: true,
      }),
    ]);
    expect(mockUpsert.mock.calls.flatMap(([, rows]) => rows)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "metal-a" })])
    );
  });

  it("scopes child tombstones through retained tombstoned parents", async () => {
    const parents = [
      await createRow(database, "assets", {
        id: "asset-a",
        user_id: "user-a",
        type: "OTHER",
      }),
      await createRow(database, "assets", {
        id: "asset-b",
        user_id: "user-b",
        type: "OTHER",
      }),
    ];
    const children = [
      await createRow(database, "asset_metals", {
        id: "metal-a",
        asset_id: "asset-a",
      }),
      await createRow(database, "asset_metals", {
        id: "metal-b",
        asset_id: "asset-b",
      }),
    ];
    await database.write(async () => {
      await database.batch(
        ...[...parents, ...children].map((row) => row.prepareMarkAsDeleted())
      );
    });
    await sync(database);
    expect(await database.adapter.getDeletedRecords("asset_metals")).toEqual([
      "metal-a",
    ]);
    expect(mockDelete).toHaveBeenCalledWith("asset_metals", {
      asset_id: ["asset-b"],
      id: ["metal-b"],
    });
    mockSyncUser = "user-a";
    await sync(database);
    expect(await database.adapter.getDeletedRecords("asset_metals")).toEqual(
      []
    );
  });

  it("preserves every pending row when an owned upload fails", async () => {
    const foreign = await createRow(database, "assets", {
      id: "asset-a",
      user_id: "user-a",
      type: "OTHER",
    });
    const owned = await createRow(database, "assets", {
      id: "asset-b",
      user_id: "user-b",
      type: "OTHER",
    });
    mockUpsert.mockResolvedValueOnce({ error: { message: "network failed" } });
    await expect(sync(database)).rejects.toThrow("network failed");
    expect(foreign._raw._status).toBe("created");
    expect(owned._raw._status).toBe("created");
    await sync(database);
    expect(owned._raw._status).toBe("synced");
    expect(foreign._raw._status).toBe("created");
  });

  it("retains both users' tombstones on remote deletion failure, then retries only owned deletes", async () => {
    const foreign = await createRow(database, "assets", {
      id: "asset-a",
      user_id: "user-a",
      type: "OTHER",
    });
    const owned = await createRow(database, "assets", {
      id: "asset-b",
      user_id: "user-b",
      type: "OTHER",
    });
    await database.write(async (): Promise<void> => {
      await database.batch(
        foreign.prepareMarkAsDeleted(),
        owned.prepareMarkAsDeleted()
      );
    });
    mockDelete.mockResolvedValueOnce({ error: { message: "delete failed" } });
    await expect(sync(database)).rejects.toThrow("delete failed");
    expect(await database.adapter.getDeletedRecords("assets")).toEqual(
      expect.arrayContaining(["asset-a", "asset-b"])
    );
    await sync(database);
    expect(await database.adapter.getDeletedRecords("assets")).toEqual([
      "asset-a",
    ]);
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockDelete).toHaveBeenLastCalledWith("assets", {
      user_id: "user-b",
      id: ["asset-b"],
    });
  });
});
