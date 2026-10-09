/** Supplemental Normal-authored receipt cases; real SDK/SQLite fixture bindings. Unexecuted. */

import {
  synchronize,
  snapshot,
  OWNER_KEY,
  H1,
  mockFrom,
  makeChain,
  createDatabase,
  reopenDatabase,
  seedExistingInstallBaseline,
  USER_A,
  USER_B,
  H2,
  H3,
  HISTORICAL_ID,
  CREATE_ID,
  B_REMOTE_ID,
  PUSH_DOWN,
  setRemoteRows,
  serverAsset,
  syncDatabase,
  ids,
  owner,
  checkpoint,
  createDirtyAsset,
  setFailPushWrites,
  setCurrentUser,
  setMarketWatermarks,
} from "./issue255-historical-recovery-fixtures";
import {
  HISTORICAL_RECOVERY_VERSION,
  isHistoricalRecoveryRequired,
  createHistoricalSnapshotPullStrategy,
  type HistoricalRecoveryPullResult,
} from "../../../services/sync/historical-recovery";

import type { Database, Model } from "@nozbe/watermelondb";
import { pullChanges } from "../../../services/sync/atomic-pull-strategies";
import type { SyncPullResult } from "@nozbe/watermelondb/sync";
function localSnapshot(id: string, createdAt: string): Record<string, unknown> {
  return {
    ...snapshot(id, createdAt),
    created_at: Date.parse(createdAt),
    snapshot_date: Date.parse("2026-10-07T00:00:00.000Z"),
  };
}

// Freeze Date only; SQLite callbacks, timers and microtasks remain real.
function useSnapshotDate(now: string = H2): void {
  jest.useFakeTimers({
    now: Date.parse(now),
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
}

describe("#255 historical recovery receipt continuation", () => {
  it("writes the owner-scoped receipt only after a successful production recovery", async () => {
    let database = await createDatabase("receipt-success");

    try {
      await seedExistingInstallBaseline(database);
      setMarketWatermarks([H2, H3]);
      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(true);

      setRemoteRows("assets", [
        serverAsset(
          HISTORICAL_ID,
          USER_A,
          "2026-10-07T23:59:00.000Z",
          "historically-omitted"
        ),
      ]);

      await syncDatabase(database);

      expect(await ids(database, "assets")).toContain(HISTORICAL_ID);
      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(false);
      expect(await owner(database)).toBe(USER_A);
      database = await reopenDatabase(database);
      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(false);
      await syncDatabase(database);
      expect(await ids(database, "assets")).toContain(HISTORICAL_ID);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it("keeps the receipt absent after push failure, then succeeds after reopen/retry", async () => {
    let database = await createDatabase("receipt-push-retry");

    try {
      await seedExistingInstallBaseline(database);
      setMarketWatermarks([H2, H3]);

      setRemoteRows("assets", [
        serverAsset(HISTORICAL_ID, USER_A, "2026-10-07T23:59:00.000Z"),
      ]);

      const pending = await createDirtyAsset(database, CREATE_ID, USER_A);

      setFailPushWrites(true);
      await expect(syncDatabase(database)).rejects.toThrow(PUSH_DOWN);

      expect(await ids(database, "assets")).toContain(HISTORICAL_ID);
      expect(pending.syncStatus).toBe("created");
      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(true);

      database = await reopenDatabase(database);
      setFailPushWrites(false);

      await syncDatabase(database);

      expect(await ids(database, "assets")).toContain(HISTORICAL_ID);
      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(false);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it("stores recovery receipts independently per owner", async () => {
    const database = await createDatabase("receipt-owner-scope");

    try {
      await seedExistingInstallBaseline(database);
      setMarketWatermarks([H2, H3]);
      await syncDatabase(database);

      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(false);
      expect(await isHistoricalRecoveryRequired(database, USER_B)).toBe(true);

      setCurrentUser(USER_B);
      setRemoteRows("assets", [
        serverAsset(B_REMOTE_ID, USER_B, "2026-10-07T20:00:00.000Z"),
      ]);

      await syncDatabase(database);

      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(false);
      expect(await isHistoricalRecoveryRequired(database, USER_B)).toBe(false);
      expect(await owner(database)).toBe(USER_B);
      expect(await ids(database, "assets")).toContain(B_REMOTE_ID);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it("fails sync when receipt persistence fails and retries the recovery on the next call", async () => {
    const database = await createDatabase("receipt-storage-failure");
    const receiptKey =
      `__monyvi_sync_historical_recovery:` +
      `${HISTORICAL_RECOVERY_VERSION}:${USER_A}`;

    try {
      await seedExistingInstallBaseline(database);
      setMarketWatermarks([H2, H3]);

      setRemoteRows("assets", [
        serverAsset(HISTORICAL_ID, USER_A, "2026-10-07T23:59:00.000Z"),
      ]);

      const originalSetLocal = database.adapter.setLocal.bind(database.adapter);

      const setLocal = jest
        .spyOn(database.adapter, "setLocal")
        .mockImplementation((key: string, value: string) =>
          key === receiptKey
            ? Promise.reject(new Error("receipt-write-down"))
            : originalSetLocal(key, value)
        );

      await expect(syncDatabase(database)).rejects.toThrow(
        "receipt-write-down"
      );

      expect(await ids(database, "assets")).toContain(HISTORICAL_ID);
      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(true);

      setLocal.mockRestore();

      await syncDatabase(database);

      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(false);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });
  it("keeps checkpoint and receipt unchanged when the real SDK apply batch fails, then recovers after reopening", async () => {
    let database = await createDatabase("receipt-apply-retry");
    try {
      const baseline = await seedExistingInstallBaseline(database);
      setMarketWatermarks([H2, H3]);
      setRemoteRows("assets", [
        serverAsset(HISTORICAL_ID, USER_A, "2026-10-07T23:59:00.000Z"),
      ]);
      const apply = jest
        .spyOn(database.adapter, "batch")
        .mockRejectedValueOnce(new Error("sqlite-apply-down"));
      try {
        await expect(syncDatabase(database)).rejects.toThrow(
          "sqlite-apply-down"
        );
        expect(apply).toHaveBeenCalledTimes(1);
        expect(await checkpoint(database)).toBe(baseline);
        expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(true);
      } finally {
        apply.mockRestore();
      }
      database = await reopenDatabase(database);
      expect(await ids(database, "assets")).not.toContain(HISTORICAL_ID);
      expect(await checkpoint(database)).toBe(baseline);
      await syncDatabase(database);
      expect(await ids(database, "assets")).toContain(HISTORICAL_ID);
      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(false);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  async function createDirtySnapshot(
    database: Database,
    id: string,
    userId: string,
    createdAt: number
  ): Promise<Model> {
    return database.write(async (): Promise<Model> => {
      const row = database
        .get("daily_snapshot_assets")
        .prepareCreateFromDirtyRaw({
          id,
          user_id: userId,
          snapshot_date: Date.parse("2026-10-07T00:00:00.000Z"),
          created_at: createdAt,
          total_assets_usd: 999,
        });
      await database.batch(row);
      return row;
    });
  }

  it("one-time snapshot cleanup deletes only clean owned absent rows in the frozen (cutoff,H] window", async () => {
    const database = await createDatabase("snapshot-absent-set");

    const cutoff = "2026-07-10T00:00:00.000Z";
    const upper = "2026-10-08T00:00:00.000Z";

    const CLEAN_ABSENT = "02550000-0000-4000-8000-000000000411";
    const REMOTE_ACTIVE = "02550000-0000-4000-8000-000000000412";
    const DIRTY = "02550000-0000-4000-8000-000000000413";
    const FOREIGN = "02550000-0000-4000-8000-000000000414";
    const TOO_OLD = "02550000-0000-4000-8000-000000000415";
    const NEWER_THAN_H = "02550000-0000-4000-8000-000000000416";
    const AT_H = "02550000-0000-4000-8000-000000000417";
    const PENDING_DELETE = "02550000-0000-4000-8000-000000000418";

    try {
      await synchronize({
        database,
        pullChanges: (): Promise<SyncPullResult> =>
          Promise.resolve({
            changes: {
              daily_snapshot_assets: {
                created: [],
                updated: [
                  localSnapshot(CLEAN_ABSENT, "2026-09-01T00:00:00.000Z"),
                  localSnapshot(REMOTE_ACTIVE, upper),
                  localSnapshot(AT_H, upper),
                  {
                    ...localSnapshot(FOREIGN, "2026-09-03T00:00:00.000Z"),
                    user_id: USER_B,
                  },
                  localSnapshot(TOO_OLD, cutoff),
                  localSnapshot(NEWER_THAN_H, "2026-10-08T00:01:00.000Z"),
                ],
                deleted: [],
              },
            },
            timestamp: Date.parse(upper),
          }),
        pushChanges: (): Promise<void> => Promise.resolve(),
        sendCreatedAsUpdated: true,
      });

      const dirty = await createDirtySnapshot(
        database,
        DIRTY,
        USER_A,
        Date.parse("2026-09-04T00:00:00.000Z")
      );

      const pendingDelete = await createDirtySnapshot(
        database,
        PENDING_DELETE,
        USER_A,
        Date.parse("2026-09-04T00:00:00.000Z")
      );
      await database.write(() => pendingDelete.markAsDeleted());

      await synchronize({
        database,
        sendCreatedAsUpdated: true,
        pullChanges: (): Promise<HistoricalRecoveryPullResult> =>
          Promise.resolve({
            timestamp: Date.parse(upper) + 1,
            experimentalStrategy: createHistoricalSnapshotPullStrategy(
              USER_A,
              cutoff,
              upper
            ),
            changes: {
              daily_snapshot_assets: {
                created: [],
                updated: [
                  {
                    ...localSnapshot(REMOTE_ACTIVE, upper),
                    total_assets_usd: 1234,
                  },
                ],
                deleted: [],
              },
            },
          }),
      });
      const remaining = await ids(database, "daily_snapshot_assets");
      expect([...remaining].sort()).toEqual(
        [REMOTE_ACTIVE, DIRTY, FOREIGN, TOO_OLD, NEWER_THAN_H].sort()
      );
      expect(
        await database.adapter.getDeletedRecords("daily_snapshot_assets")
      ).toContain(PENDING_DELETE);
      expect(dirty._raw._status).toBe("created");
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });
  async function seedSnapshotBaseline(
    database: Database,
    rows: ReadonlyArray<Record<string, unknown>>
  ): Promise<void> {
    await synchronize({
      database,
      pullChanges: (): Promise<SyncPullResult> =>
        Promise.resolve({
          changes: {
            daily_snapshot_assets: {
              created: [],
              updated: [...rows],
              deleted: [],
            },
          },
          timestamp: Date.parse(H1),
        }),
      sendCreatedAsUpdated: true,
    });
    await database.adapter.setLocal(OWNER_KEY, USER_A);
  }

  it("demonstrates why October fixture replacement cannot use a January host clock", async () => {
    const database = await createDatabase("snapshot-future-clock-control");
    const oldId = "02550000-0000-4000-8000-000000000481";
    const newId = "02550000-0000-4000-8000-000000000482";
    try {
      useSnapshotDate("2027-01-10T12:00:00.000Z");
      await seedSnapshotBaseline(database, [
        localSnapshot(oldId, "2026-10-07T08:00:00.000Z"),
      ]);
      setMarketWatermarks([H2]);
      setRemoteRows("daily_snapshot_assets", [
        snapshot(newId, "2026-10-07T09:00:00.000Z"),
      ]);
      await syncDatabase(database);
      // Both October rows are outside the current retention window.
      // The original in-window expectation [newId] would fail here.
      expect(await ids(database, "daily_snapshot_assets")).toEqual([oldId]);
      expect(await ids(database, "daily_snapshot_assets")).not.toContain(newId);
    } finally {
      jest.useRealTimers();
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it("applies pre-journal snapshot cleanup through production once, then preserves absence on a later forced full pull", async () => {
    const database = await createDatabase("snapshot-one-time-production");
    const oldId = "02550000-0000-4000-8000-000000000421";
    const newId = "02550000-0000-4000-8000-000000000422";
    try {
      useSnapshotDate();
      await seedSnapshotBaseline(database, [
        localSnapshot(oldId, "2026-10-07T08:00:00.000Z"),
      ]);
      setMarketWatermarks([H2, H3]);
      setRemoteRows("daily_snapshot_assets", [
        snapshot(newId, "2026-10-07T09:00:00.000Z"),
      ]);
      await syncDatabase(database);
      expect(await ids(database, "daily_snapshot_assets")).toEqual([newId]);
      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(false);
      setRemoteRows("daily_snapshot_assets", []);
      await syncDatabase(database, true);
      expect(await ids(database, "daily_snapshot_assets")).toEqual([newId]);
    } finally {
      jest.useRealTimers();
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it("preserves a snapshot edited during the final remote page before absence cleanup", async () => {
    const database = await createDatabase("snapshot-late-edit");
    const id = "02550000-0000-4000-8000-000000000431";
    let edited = false;
    try {
      useSnapshotDate();
      await seedSnapshotBaseline(database, [
        localSnapshot(id, "2026-10-07T08:00:00.000Z"),
      ]);
      setMarketWatermarks([H2]);
      const row = await database.get("daily_snapshot_assets").find(id);
      expect(row.syncStatus).toBe("synced");
      mockFrom.mockImplementation((table: string) => {
        const chain = makeChain(table);
        if (table === "metal_holding_states") {
          const resolvePage = chain.then;
          jest
            .spyOn(chain, "then")
            .mockImplementation(async (resolve, reject) => {
              if (!edited) {
                await database.write(() =>
                  row.update((record) => {
                    record._setRaw("total_assets_usd", 9876);
                  })
                );
                expect(row.syncStatus).toBe("updated");
                edited = true;
              }
              return resolvePage(resolve, reject);
            });
        }
        return chain;
      });
      await syncDatabase(database);
      expect(edited).toBe(true);
      expect(await ids(database, "daily_snapshot_assets")).toEqual([id]);
      expect(
        (await database.get("daily_snapshot_assets").find(id))._raw
      ).toMatchObject({ total_assets_usd: 9876, user_id: USER_A });
    } finally {
      jest.useRealTimers();
      jest.restoreAllMocks();
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it("rechecks absence eligibility inside the SDK writer after pull completion", async () => {
    const database = await createDatabase("snapshot-after-selection-edit");
    const dirtyId = "02550000-0000-4000-8000-000000000441";
    const cleanId = "02550000-0000-4000-8000-000000000442";
    try {
      useSnapshotDate();
      await seedSnapshotBaseline(database, [
        localSnapshot(dirtyId, "2026-10-07T08:00:00.000Z"),
        localSnapshot(cleanId, "2026-10-07T08:00:00.000Z"),
      ]);
      setMarketWatermarks([H2]);
      const row = await database.get("daily_snapshot_assets").find(dirtyId);
      await synchronize({
        database,
        sendCreatedAsUpdated: true,
        pullChanges: () => pullChanges(null, USER_A, database),
        onWillApplyRemoteChanges: async (): Promise<void> => {
          expect(row.syncStatus).toBe("synced");
          await database.write(() =>
            row.update((record) => {
              record._setRaw("total_assets_usd", 7654);
            })
          );
        },
      });
      expect(await ids(database, "daily_snapshot_assets")).toEqual([dirtyId]);
      expect(row.syncStatus).toBe("updated");
      expect(row._raw).toMatchObject({ total_assets_usd: 7654 });
    } finally {
      jest.useRealTimers();
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it("preserves remote update matching and explicit journal deletion outside the replacement window", async () => {
    const database = await createDatabase("snapshot-replacement-journal");
    const updateId = "02550000-0000-4000-8000-000000000451";
    const deleteId = "02550000-0000-4000-8000-000000000452";
    const tombstoneId = "02550000-0000-4000-8000-000000000453";
    const cutoff = "2026-07-10T00:00:00.000Z";
    try {
      await seedSnapshotBaseline(
        database,
        [updateId, deleteId, tombstoneId].map((id) =>
          localSnapshot(id, "2026-06-01T00:00:00.000Z")
        )
      );
      const rows = await database.get("daily_snapshot_assets").query().fetch();
      await database.write(async () => {
        for (const row of rows)
          await row.update((record) =>
            record._setRaw("total_assets_usd", 5432)
          );
        await database
          .get("daily_snapshot_assets")
          .find(tombstoneId)
          .then((row) => row.markAsDeleted());
      });
      await synchronize({
        database,
        sendCreatedAsUpdated: true,
        pullChanges: (): Promise<HistoricalRecoveryPullResult> =>
          Promise.resolve({
            timestamp: Date.parse(H2),
            experimentalStrategy: createHistoricalSnapshotPullStrategy(
              USER_A,
              cutoff,
              H2
            ),
            changes: {
              daily_snapshot_assets: {
                created: [],
                updated: [
                  {
                    ...localSnapshot(updateId, "2026-06-01T00:00:00.000Z"),
                    total_assets_usd: 1234,
                  },
                ],
                deleted: [deleteId, tombstoneId],
              },
            },
          }),
      });
      expect(await ids(database, "daily_snapshot_assets")).toEqual([updateId]);
      const retained = await database
        .get("daily_snapshot_assets")
        .find(updateId);
      expect(retained._raw).toMatchObject({ total_assets_usd: 5432 });
      expect(retained.syncStatus).toBe("updated");
      expect(
        await database.adapter.getDeletedRecords("daily_snapshot_assets")
      ).not.toContain(tombstoneId);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it.each([false, true])(
    "handles auth loss after the receipt actually commits; cleanup failure=%s",
    async (cleanupFails): Promise<void> => {
      const database = await createDatabase(
        `receipt-post-write-auth-${String(cleanupFails)}`
      );
      const receiptKey = `__monyvi_sync_historical_recovery:${HISTORICAL_RECOVERY_VERSION}:${USER_A}`;
      const foreignReceiptKey = `__monyvi_sync_historical_recovery:${HISTORICAL_RECOVERY_VERSION}:${USER_B}`;
      const retryId = "02550000-0000-4000-8000-000000000491";
      try {
        // B's pre-existing receipt comes from successful production sync,
        // not a fabricated completion flag.
        setCurrentUser(USER_B);
        setMarketWatermarks([H1]);
        await syncDatabase(database);
        expect(await database.adapter.getLocal(foreignReceiptKey)).toBe(
          "complete"
        );

        setCurrentUser(USER_A);
        jest.clearAllMocks();
        await seedExistingInstallBaseline(database);
        setMarketWatermarks([H2, H3]);
        setRemoteRows("assets", [
          serverAsset(HISTORICAL_ID, USER_A, "2026-10-07T23:59:00.000Z"),
        ]);
        expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(true);

        const originalSetLocal = database.adapter.setLocal.bind(
          database.adapter
        );
        const originalRemoveLocal = database.adapter.removeLocal.bind(
          database.adapter
        );
        let receiptCommitted = false;
        const storage = jest
          .spyOn(database.adapter, "setLocal")
          .mockImplementation(
            async (key: string, value: string): Promise<void> => {
              await originalSetLocal(key, value);
              if (key === receiptKey) {
                expect(await database.adapter.getLocal(key)).toBe("complete");
                receiptCommitted = true;
                setCurrentUser(USER_B);
              }
            }
          );
        const cleanup = jest
          .spyOn(database.adapter, "removeLocal")
          .mockImplementation(async (key: string): Promise<void> => {
            if (key === receiptKey && cleanupFails) {
              throw new Error("receipt-cleanup-down");
            }
            await originalRemoveLocal(key);
          });
        try {
          await expect(syncDatabase(database)).rejects.toThrow(
            cleanupFails ? "receipt-cleanup-down" : "sync_auth_scope_lost"
          );
          expect(receiptCommitted).toBe(true);
          expect(await ids(database, "assets")).toContain(HISTORICAL_ID);
          expect(await checkpoint(database)).toBe(String(Date.parse(H2)));
          expect(await owner(database)).toBe(USER_A);
          expect(await database.adapter.getLocal(receiptKey)).toBe(
            cleanupFails ? "complete" : null
          );
          expect(await database.adapter.getLocal(foreignReceiptKey)).toBe(
            "complete"
          );
          expect(cleanup).toHaveBeenCalledWith(receiptKey);
          expect(cleanup).not.toHaveBeenCalledWith(foreignReceiptKey);
        } finally {
          storage.mockRestore();
          cleanup.mockRestore();
          setCurrentUser(USER_A);
        }

        if (!cleanupFails) {
          // No intervening B sync or owner-marker change forces this retry.
          // The additional row predates the checkpoint and needs a full pull.
          setRemoteRows("assets", [
            serverAsset(HISTORICAL_ID, USER_A, "2026-10-07T23:59:00.000Z"),
            serverAsset(retryId, USER_A, "2026-10-07T23:58:00.000Z"),
          ]);
          await syncDatabase(database);
          expect(await ids(database, "assets")).toContain(retryId);
          expect(await database.adapter.getLocal(receiptKey)).toBe("complete");
          expect(await database.adapter.getLocal(foreignReceiptKey)).toBe(
            "complete"
          );
        }
      } finally {
        setCurrentUser(USER_A);
        await database.write(() => database.unsafeResetDatabase());
      }
    }
  );

  it("does not write a recovery receipt when owner changes after SDK success", async () => {
    const database = await createDatabase("receipt-post-apply-auth");
    try {
      await seedExistingInstallBaseline(database);
      setMarketWatermarks([H2, H3]);
      setRemoteRows("assets", [
        serverAsset(HISTORICAL_ID, USER_A, "2026-10-07T23:59:00.000Z"),
      ]);
      const originalSetLocal = database.adapter.setLocal.bind(database.adapter);
      const storage = jest
        .spyOn(database.adapter, "setLocal")
        .mockImplementation(
          async (key: string, value: string): Promise<void> => {
            await originalSetLocal(key, value);
            if (key === OWNER_KEY) setCurrentUser(USER_B);
          }
        );
      try {
        await expect(syncDatabase(database)).rejects.toThrow(
          "sync_auth_scope_lost"
        );
        expect(await ids(database, "assets")).toContain(HISTORICAL_ID);
        expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(true);
        expect(await isHistoricalRecoveryRequired(database, USER_B)).toBe(true);
      } finally {
        storage.mockRestore();
        setCurrentUser(USER_A);
      }
      await syncDatabase(database);
      expect(await isHistoricalRecoveryRequired(database, USER_A)).toBe(false);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });
});
