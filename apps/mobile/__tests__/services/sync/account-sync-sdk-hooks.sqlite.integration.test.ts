/**
 * #395 T069 — the Watermelon 0.28.0 SDK sync-writer extension, tests FIRST.
 *
 * Real SQLiteAdapter + real synchronize() + real Watermelon writers and ACK.
 * No mock synchronize, mock database writer, network, native device or Supabase.
 * On unpatched 0.28.0 the optional callbacks are ignored: the first five
 * cases fail on observable remote/checkpoint/ACK state, not module/type errors.
 *
 * The separately inferred options objects intentionally supply extra fields
 * to the stock SDK. Do not import a not-yet-installed capability marker or
 * declarations, and do not cast a fake SyncArgs.
 */
import {
  Database as WatermelonDatabase,
  Model as WatermelonModel,
  type Database,
  type Model,
} from "@nozbe/watermelondb";
import {
  synchronize,
  type SyncDatabaseChangeSet,
  type SyncPullResult,
  type SyncPushArgs,
  type SyncPushResult,
  type SyncRejectedIds,
} from "@nozbe/watermelondb/sync";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", () =>
  jest.requireActual<Record<string, unknown>>(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.unmock("@nozbe/watermelondb/sync");

import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { schema } from "../../../../../packages/db/src/schema";

const OWNER = "11111111-1111-4111-8111-111111111111";
const CHECKPOINT_KEY = "__watermelon_last_pulled_at";
const REMOTE_ID = "395-sdk-remote";
const LOCAL_A = "395-sdk-local-a";
const LOCAL_B = "395-sdk-local-b";
const PROBE_ID = "395-sdk-writer-probe";

let dbSequence = 0;

interface AssetRaw {
  readonly id: string;
  name?: string;
  readonly type?: string;
  readonly user_id?: string;
  readonly deleted?: boolean;
  readonly _status?: string;
}

interface AssetChanges {
  readonly created: AssetRaw[];
  readonly updated: AssetRaw[];
  readonly deleted: string[];
}
function isAssetRaw(value: unknown): value is AssetRaw {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "string" &&
    (!("name" in value) ||
      value.name === undefined ||
      typeof value.name === "string")
  );
}
function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((member: unknown) => typeof member === "string")
  );
}
function isAssetChanges(value: unknown): value is AssetChanges {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "created" in value &&
    Array.isArray(value.created) &&
    value.created.every(isAssetRaw) &&
    "updated" in value &&
    Array.isArray(value.updated) &&
    value.updated.every(isAssetRaw) &&
    "deleted" in value &&
    isStringArray(value.deleted)
  );
}
/** Real SDK branded change maps are read by a checked own-property seam. */
function assetChanges(changes: SyncDatabaseChangeSet): AssetChanges {
  const descriptor = Object.getOwnPropertyDescriptor(changes, "assets");
  const raw: unknown = descriptor?.value;
  if (!isAssetChanges(raw)) throw new Error("t069_invalid_sdk_asset_changes");
  return raw;
}
function rejectedAssetIds(rejected: SyncRejectedIds): string[] {
  const descriptor = Object.getOwnPropertyDescriptor(rejected, "assets");
  const raw: unknown = descriptor?.value;
  if (raw === undefined) return [];
  if (!isStringArray(raw)) throw new Error("t069_invalid_sdk_asset_rejections");
  return raw;
}
function assetNameFromRaw(raw: unknown): unknown {
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw) ||
    !("name" in raw)
  )
    throw new Error("t069_asset_name_missing");
  return raw.name;
}
let database: Database;

function modelForTable(table: string): typeof Model {
  class SyncHookModel extends WatermelonModel {
    static table = table;
  }
  return SyncHookModel;
}

async function createDatabase(): Promise<Database> {
  const adapter = new SQLiteAdapter({
    schema,
    dbName: "file:t069-sdk-hook-" + ++dbSequence + "?mode=memory&cache=shared",
  });
  await adapter.initializingPromise;
  return new WatermelonDatabase({
    adapter,
    modelClasses: Object.keys(schema.tables).map(modelForTable),
  });
}

function assetRaw(
  id: string,
  name: string
): {
  readonly id: string;
  readonly user_id: string;
  readonly type: string;
  readonly name: string;
  readonly deleted: boolean;
} {
  return {
    id,
    user_id: OWNER,
    type: "OTHER",
    name,
    deleted: false,
  };
}

async function createAsset(id: string, name: string): Promise<Model> {
  return database.write(async (): Promise<Model> => {
    const record = database
      .get("assets")
      .prepareCreateFromDirtyRaw(assetRaw(id, name));
    await database.batch(record);
    return record;
  });
}

async function updateAsset(record: Model, name: string): Promise<void> {
  await database.write(async () => {
    await database.batch(
      record.prepareUpdate((model) => {
        model._setRaw("name", name);
      })
    );
  });
}

async function deleteAsset(record: Model): Promise<void> {
  await database.write(async () => {
    await database.batch(record.prepareMarkAsDeleted());
  });
}

function remoteAsset(id: string, name: string): SyncDatabaseChangeSet {
  return {
    assets: {
      created: [assetRaw(id, name)],
      updated: [],
      deleted: [],
    },
  };
}

async function checkpoint(): Promise<string | null> {
  const stored = await database.adapter.getLocal(CHECKPOINT_KEY);
  return typeof stored === "string" ? stored : null;
}

async function assetName(id: string): Promise<unknown> {
  const record = await database.get("assets").find(id);
  return assetNameFromRaw(record._raw);
}

async function tombstones(): Promise<readonly string[]> {
  return database.adapter.getDeletedRecords("assets");
}

async function ordinarySync(timestamp: number): Promise<void> {
  await synchronize({
    database,
    pullChanges: (): Promise<SyncPullResult> =>
      Promise.resolve({
        changes: {},
        timestamp,
      }),
    pushChanges: (): Promise<void> => Promise.resolve(),
  });
}

beforeEach(async () => {
  database = await createDatabase();
});

afterEach(async () => {
  await database.write(() => database.unsafeResetDatabase());
});

describe("T069 real Watermelon synchronize() guarded SDK seams", () => {
  it("runs the remote guard inside the real apply writer and uses its replacement change set", async () => {
    const probe = await createAsset(PROBE_ID, "original");
    await ordinarySync(100);
    expect(probe._raw._status).toBe("synced");

    let callCount = 0;
    const options = {
      database,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: remoteAsset(REMOTE_ID, "unvalidated-remote"),
          timestamp: 200,
        }),
      pushChanges: (): Promise<void> => Promise.resolve(),
      beforeApplyRemoteChangesInWriter: async (
        captured: SyncDatabaseChangeSet
      ): Promise<SyncDatabaseChangeSet> => {
        callCount++;
        expect(await checkpoint()).toBe("100");
        // This MUST be an actual Watermelon writer: database.batch rejects
        // outside one. Do not create another nested database.write here.
        await database.batch(
          probe.prepareUpdate((record) => {
            record._setRaw("name", "guard-ran-in-writer");
          })
        );
        const ownedAssets = assetChanges(captured);
        return {
          ...captured,
          assets: {
            ...ownedAssets,
            created: ownedAssets.created.map((raw) => ({
              ...raw,
              name: "validated-replacement",
            })),
          },
        };
      },
    };

    await synchronize(options);
    expect(callCount).toBe(1);
    expect(await assetName(REMOTE_ID)).toBe("validated-replacement");
    expect(await assetName(PROBE_ID)).toBe("guard-ran-in-writer");
    expect(await checkpoint()).toBe("200");
  });

  it("refuses unowned remote data before remote application or checkpoint advancement", async () => {
    await ordinarySync(210);
    const options = {
      database,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: remoteAsset(REMOTE_ID, "foreign-owner-remote"),
          timestamp: 211,
        }),
      beforeApplyRemoteChangesInWriter: (
        _captured: SyncDatabaseChangeSet
      ): Promise<SyncDatabaseChangeSet> =>
        Promise.reject(new Error("t069-remote-owner-lost")),
    };

    await expect(synchronize(options)).rejects.toThrow(
      "t069-remote-owner-lost"
    );
    expect(await database.get("assets").query().fetchIds()).not.toContain(
      REMOTE_ID
    );
    expect(await checkpoint()).toBe("210");
  });

  it("rechecks after real remote application but blocks the checkpoint on rejection", async () => {
    await ordinarySync(300);
    let appliedNameObserved: unknown = null;
    const options = {
      database,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: remoteAsset(REMOTE_ID, "already-applied"),
          timestamp: 301,
        }),
      beforePullCheckpointInWriter: async (): Promise<void> => {
        appliedNameObserved = await assetName(REMOTE_ID);
        throw new Error("t069-checkpoint-owner-lost");
      },
    };

    await expect(synchronize(options)).rejects.toThrow(
      "t069-checkpoint-owner-lost"
    );
    expect(appliedNameObserved).toBe("already-applied");
    expect(await checkpoint()).toBe("300");
    // Watermelon batch/adapter changes may have COMMITTED before this guard.
    // The hook prevents a false checkpoint, NOT an imagined DB rollback.
    expect(await assetName(REMOTE_ID)).toBe("already-applied");
  });

  it("unions preexisting transport rejection with a new ACK-writer rejection for dirty updates", async () => {
    const priorRejected = await createAsset(LOCAL_A, "a-before");
    const newlyRejected = await createAsset(LOCAL_B, "b-before");
    const probe = await createAsset(PROBE_ID, "probe-before");
    await ordinarySync(400);
    await updateAsset(priorRejected, "a-pending");
    await updateAsset(newlyRejected, "b-pending");

    let ackHookCalls = 0;
    const options = {
      database,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: {},
          timestamp: 401,
        }),
      pushChanges: (rawArgs: SyncPushArgs): Promise<SyncPushResult> => {
        const args = assetChanges(rawArgs.changes);
        expect(args.updated.map((raw) => raw.id).sort()).toEqual([
          LOCAL_A,
          LOCAL_B,
        ]);
        return Promise.resolve({
          experimentalRejectedIds: { assets: [LOCAL_A] },
        });
      },
      beforeMarkLocalChangesAsSyncedInWriter: async (
        rawCaptured: SyncDatabaseChangeSet,
        rawAlreadyRejected: SyncRejectedIds
      ): Promise<SyncRejectedIds> => {
        const captured = assetChanges(rawCaptured);
        const alreadyRejected = rejectedAssetIds(rawAlreadyRejected);
        ackHookCalls++;
        expect(captured.updated.map((raw) => raw.id).sort()).toEqual([
          LOCAL_A,
          LOCAL_B,
        ]);
        expect(alreadyRejected).toContain(LOCAL_A);
        // Another real model write proves the callback is inside the SDK's
        // original ACK writer, before selection and deleted-ID cleanup.
        await database.batch(
          probe.prepareUpdate((record) => {
            record._setRaw("name", "ack-writer-ran");
          })
        );
        // Deliberately omit LOCAL_A. Extension must UNION, never replace,
        // the push transport's rejected-ID set.
        return { assets: [LOCAL_B] };
      },
    };

    await synchronize(options);
    expect(ackHookCalls).toBe(1);
    expect(priorRejected._raw._status).toBe("updated");
    expect(newlyRejected._raw._status).toBe("updated");
    expect(await assetName(PROBE_ID)).toBe("ack-writer-ran");
    expect(await checkpoint()).toBe("401");
  });

  it("retains a losing deleted tombstone when the ACK hook rejects its captured ID", async () => {
    const removed = await createAsset(LOCAL_A, "later-deleted");
    await ordinarySync(500);
    await deleteAsset(removed);
    expect(await tombstones()).toContain(LOCAL_A);

    let hookCalled = false;
    const options = {
      database,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: {},
          timestamp: 501,
        }),
      pushChanges: (rawArgs: SyncPushArgs): Promise<void> => {
        const args = assetChanges(rawArgs.changes);
        expect(args.deleted).toContain(LOCAL_A);
        return Promise.resolve();
      },
      beforeMarkLocalChangesAsSyncedInWriter: async (
        rawCaptured: SyncDatabaseChangeSet,
        rawExistingRejected: SyncRejectedIds
      ): Promise<SyncRejectedIds> => {
        const captured = assetChanges(rawCaptured);
        const existingRejected = rejectedAssetIds(rawExistingRejected);
        hookCalled = true;
        expect(captured.deleted).toContain(LOCAL_A);
        expect(existingRejected ?? []).not.toContain(LOCAL_A);
        expect(await tombstones()).toContain(LOCAL_A);
        return { assets: [LOCAL_A] };
      },
    };

    await synchronize(options);
    expect(hookCalled).toBe(true);
    expect(await tombstones()).toContain(LOCAL_A);

    // After protected ownership actually admits a later retry, the same
    // unmodified stock ACK path is still able to release the tombstone.
    await ordinarySync(502);
    expect(await tombstones()).not.toContain(LOCAL_A);
  });

  it("preserves stock raw-equality when a row changes while push transport is in flight", async () => {
    const record = await createAsset(LOCAL_A, "first");
    await ordinarySync(600);
    await updateAsset(record, "captured-for-push");

    await synchronize({
      database,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: {},
          timestamp: 601,
        }),
      pushChanges: async (rawArgs: SyncPushArgs): Promise<void> => {
        const args = assetChanges(rawArgs.changes);
        expect(args.updated[0]?.name).toBe("captured-for-push");
        // SDK must NOT own a write lock while awaiting network transport.
        await updateAsset(record, "newer-local-write");
      },
    });

    expect(record._raw._status).toBe("updated");
    expect(assetNameFromRaw(record._raw)).toBe("newer-local-write");
    expect(await checkpoint()).toBe("601");
  });

  it("leaves unguarded SDK behavior unchanged when all optional callbacks are absent", async () => {
    const updated = await createAsset(LOCAL_A, "first");
    const removed = await createAsset(LOCAL_B, "will-delete");
    await ordinarySync(700);
    await updateAsset(updated, "ordinary-update");
    await deleteAsset(removed);

    await ordinarySync(701);
    expect(updated._raw._status).toBe("synced");
    expect(assetNameFromRaw(updated._raw)).toBe("ordinary-update");
    expect(await tombstones()).not.toContain(LOCAL_B);
    expect(await checkpoint()).toBe("701");
  });

  it.each(["mutate-array-in-place", "replace-array-property"] as const)(
    "keeps a transport-rejected deleted ID after the ACK hook tries to %s",
    async (tampering) => {
      const removed = await createAsset(LOCAL_A, "transport-rejected-delete");
      await ordinarySync(810);
      await deleteAsset(removed);
      expect(await tombstones()).toContain(LOCAL_A);
      const transportRejected = { assets: [LOCAL_A] };
      let callbackCalled = 0;
      const options = {
        database,
        pullChanges: (): Promise<SyncPullResult> =>
          Promise.resolve({
            changes: {},
            timestamp: 811,
          }),
        pushChanges: (rawCaptured: SyncPushArgs): Promise<SyncPushResult> => {
          const captured = assetChanges(rawCaptured.changes);
          expect(captured.deleted).toContain(LOCAL_A);
          return Promise.resolve({
            experimentalRejectedIds: transportRejected,
          });
        },
        beforeMarkLocalChangesAsSyncedInWriter: (
          rawCaptured: SyncDatabaseChangeSet,
          rawPrior: SyncRejectedIds
        ): Promise<SyncRejectedIds> => {
          const captured = assetChanges(rawCaptured);
          const prior = rejectedAssetIds(rawPrior);
          callbackCalled++;
          expect(captured.deleted).toContain(LOCAL_A);
          expect(prior).toEqual([LOCAL_A]);
          if (tampering === "mutate-array-in-place") {
            prior.splice(0, prior.length);
          } else {
            Object.defineProperty(rawPrior, "assets", {
              value: [],
              configurable: true,
              enumerable: true,
              writable: true,
            });
          }
          // Even a hostile callback cannot rewrite the immutable transport
          // rejection. Returning empty additions must preserve LOCAL_A.
          return Promise.resolve({});
        },
      };

      await synchronize(options);
      expect(callbackCalled).toBe(1);
      expect(transportRejected.assets).toEqual([LOCAL_A]);
      expect(await tombstones()).toContain(LOCAL_A);
      expect(await checkpoint()).toBe("811");
    }
  );

  it("isolates captured push raws so ACK-hook rewriting cannot acknowledge an unsent newer edit", async () => {
    const record = await createAsset(LOCAL_A, "original");
    await ordinarySync(820);
    await updateAsset(record, "sent-snapshot");
    let callbackCalled = 0;
    const options = {
      database,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: {},
          timestamp: 821,
        }),
      pushChanges: async (rawCaptured: SyncPushArgs): Promise<void> => {
        const captured = assetChanges(rawCaptured.changes);
        expect(captured.updated[0]?.name).toBe("sent-snapshot");
        // The real transport awaits a newer local writer without holding
        // the SDK ACK writer; the previous raw is now stale.
        await updateAsset(record, "not-sent-newer-edit");
      },
      beforeMarkLocalChangesAsSyncedInWriter: (
        rawCaptured: SyncDatabaseChangeSet,
        rawPrior: SyncRejectedIds
      ): Promise<SyncRejectedIds> => {
        const captured = assetChanges(rawCaptured);
        const prior = rejectedAssetIds(rawPrior);
        callbackCalled++;
        expect(prior ?? []).toEqual([]);
        const raw = captured.updated.find(
          (candidate) => candidate.id === LOCAL_A
        );
        if (!raw) throw new Error("t069-missing-captured-updated-asset");
        expect(raw.name).toBe("sent-snapshot");
        // This mutation must affect only the hook's isolated copy, never
        // SDK's original captured raw used by stock areRecordsEqual.
        raw.name = "not-sent-newer-edit";
        return Promise.resolve({});
      },
    };

    await synchronize(options);
    expect(callbackCalled).toBe(1);
    expect(assetNameFromRaw(record._raw)).toBe("not-sent-newer-edit");
    expect(record._raw._status).toBe("updated");
    expect(await checkpoint()).toBe("821");
  });

  it.each([
    ["array", []],
    ["null", null],
    ["scalar", 7],
    ["non-string-id-array", { assets: [77] }],
  ] as const)(
    "refuses an ACK hook's malformed %s response before deleting the original tombstone",
    async (_name, malformed: unknown) => {
      const removed = await createAsset(LOCAL_A, "retain-on-malformed");
      await ordinarySync(830);
      await deleteAsset(removed);
      expect(await tombstones()).toContain(LOCAL_A);
      const options = {
        database,
        pullChanges: (): Promise<SyncPullResult> =>
          Promise.resolve({
            changes: {},
            timestamp: 831,
          }),
        pushChanges: (): Promise<void> => Promise.resolve(),
        beforeMarkLocalChangesAsSyncedInWriter: (): Promise<unknown> =>
          Promise.resolve(malformed),
      };
      // Intentional malformed runtime callback input. Reflect.apply avoids
      // lying to TypeScript about an invalid SDK SyncRejectedIds result.
      await expect(Reflect.apply(synchronize, null, [options])).rejects.toThrow(
        /Invalid Monyvi ACK rejected-ID/
      );
      expect(await tombstones()).toContain(LOCAL_A);
      // The pull checkpoint legitimately advanced before push/ACK failure.
      expect(await checkpoint()).toBe("831");
    }
  );

  it("accepts a valid empty ACK rejection addition and retains stock tombstone cleanup", async () => {
    const removed = await createAsset(LOCAL_A, "ordinary-delete");
    await ordinarySync(840);
    await deleteAsset(removed);
    let callbackCalled = 0;
    const options = {
      database,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: {},
          timestamp: 841,
        }),
      pushChanges: (): Promise<void> => Promise.resolve(),
      beforeMarkLocalChangesAsSyncedInWriter: (
        captured: SyncDatabaseChangeSet,
        rejected: SyncRejectedIds
      ): Promise<SyncRejectedIds> => {
        callbackCalled++;
        expect(assetChanges(captured).deleted).toContain(LOCAL_A);
        expect(rejectedAssetIds(rejected)).toEqual([]);
        return Promise.resolve({});
      },
    };
    await synchronize(options);
    expect(callbackCalled).toBe(1);
    expect(await tombstones()).not.toContain(LOCAL_A);
    expect(await checkpoint()).toBe("841");
  });
});
