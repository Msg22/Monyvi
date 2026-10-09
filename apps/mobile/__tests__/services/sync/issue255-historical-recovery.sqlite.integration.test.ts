/**
 * #255/#377 historical-recovery reproduction.
 *
 * Uses real Watermelon SQLite + real synchronize through production
 * syncDatabase. Only Supabase network transport and unrelated legacy-metal
 * repair are isolated.
 *
 * Current expected Red:
 * - same-owner DB has a real persisted checkpoint
 * - an older server row exists behind that checkpoint
 * - normal same-owner sync cannot recover it
 *
 * This file does NOT define a production repair API/marker and does not cover
 * account_financial_effects (#367 owns that lane).
 */
import {
  syncDatabase,
  synchronize,
  OWNER_KEY,
  H1,
  USER_A,
  USER_B,
  PUSH_DOWN,
  H2,
  H3,
  EDIT_ID,
  DELETE_ID,
  CREATE_ID,
  HISTORICAL_ID,
  PAGE1_ID,
  PAGE2_ID,
  B_REMOTE_ID,
  A_FOREIGN_ID,
  A_DIRTY_ID,
  SNAPSHOT_OLD,
  SNAPSHOT_NEW,
  setRemoteRows,
  stagePages,
  createDatabase,
  reopenDatabase,
  checkpoint,
  owner,
  ids,
  serverAsset,
  seedExistingInstallBaseline,
  snapshot,
  createDirtyAsset,
  setMarketWatermarks,
  setFailPushWrites,
  setCurrentUser,
} from "./issue255-historical-recovery-fixtures";

describe("#255 historical recovery with real Watermelon SQLite", () => {
  it("RED: production sync recovers an older same-owner omission while preserving pending local create/edit/delete", async () => {
    const database = await createDatabase("same-owner-red");

    try {
      const baselineCheckpoint = await seedExistingInstallBaseline(database);
      setMarketWatermarks([H2, H3]);

      // This represents data that was already on the server but omitted by the
      // historical capped pull which produced the installed checkpoint.
      // It is injected only AFTER the old-install state is constructed so it
      // cannot be mistaken for a post-repair omission.
      setRemoteRows("assets", [
        serverAsset(
          EDIT_ID,
          USER_A,
          "2026-10-08T00:05:00.000Z",
          "server-edit-baseline"
        ),
        serverAsset(
          DELETE_ID,
          USER_A,
          "2026-10-08T00:06:00.000Z",
          "server-delete-baseline"
        ),
        serverAsset(
          HISTORICAL_ID,
          USER_A,
          "2026-10-07T23:59:00.000Z",
          "historically-omitted"
        ),
      ]);

      expect(Date.parse("2026-10-07T23:59:00.000Z")).toBeLessThan(
        Number(baselineCheckpoint)
      );

      const created = await createDirtyAsset(database, CREATE_ID, USER_A);
      const edited = await database.get("assets").find(EDIT_ID);
      const deleted = await database.get("assets").find(DELETE_ID);

      await database.write(() =>
        edited.update((record) => {
          record._setRaw("name", "pending-local-edit");
        })
      );
      await database.write(() => deleted.markAsDeleted());

      expect(created.syncStatus).toBe("created");
      expect(edited.syncStatus).toBe("updated");
      expect(deleted.syncStatus).toBe("deleted");
      expect(await owner(database)).toBe(USER_A);

      // Force the later push phase to fail. A future historical-recovery
      // implementation must still perform its production-entry pull repair,
      // preserve all captured dirty work, and must not treat this failed whole
      // synchronization as completed recovery.
      setFailPushWrites(true);

      await expect(syncDatabase(database)).rejects.toThrow(PUSH_DOWN);

      expect(created.syncStatus).toBe("created");
      expect(edited.syncStatus).toBe("updated");
      expect(deleted.syncStatus).toBe("deleted");
      expect(await owner(database)).toBe(USER_A);

      // Intentional Red on b2ec0fd:
      // current same-owner sync uses the real advanced checkpoint, so this
      // older historically omitted row is filtered out. The eventual repair
      // must make this assertion pass through production syncDatabase without
      // resetting the DB or directly rewriting the Watermelon checkpoint.
      expect(await ids(database, "assets")).toContain(HISTORICAL_ID);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it("reopens after a later-page failure and retries from the unchanged real checkpoint", async () => {
    let database = await createDatabase("page-retry");

    try {
      setRemoteRows("assets", [
        serverAsset(EDIT_ID, USER_A, "2026-10-08T00:05:00.000Z"),
      ]);
      await syncDatabase(database);
      const baselineCheckpoint = await checkpoint(database);

      stagePages(
        "assets",
        {
          data: [serverAsset(PAGE1_ID, USER_A, "2026-10-08T00:15:00.000Z")],
          count: 2,
          error: null,
        },
        { data: null, count: null, error: { message: "page-2-down" } }
      );

      await expect(syncDatabase(database)).rejects.toThrow("page-2-down");
      expect(await checkpoint(database)).toBe(baselineCheckpoint);
      expect(await ids(database, "assets")).not.toContain(PAGE1_ID);

      database = await reopenDatabase(database);

      stagePages(
        "assets",
        {
          data: [serverAsset(PAGE1_ID, USER_A, "2026-10-08T00:15:00.000Z")],
          count: 2,
          error: null,
        },
        {
          data: [serverAsset(PAGE2_ID, USER_A, "2026-10-08T00:16:00.000Z")],
          count: 1,
          error: null,
        }
      );

      await syncDatabase(database);

      expect(await ids(database, "assets")).toEqual(
        [EDIT_ID, PAGE1_ID, PAGE2_ID].sort()
      );
      expect(Number(await checkpoint(database))).toBe(Date.parse(H3));
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it("forces a full owner-scoped pull on A to B switch and preserves A dirty work", async () => {
    const database = await createDatabase("owner-switch");

    try {
      setRemoteRows("assets", [
        serverAsset(EDIT_ID, USER_A, "2026-10-08T00:05:00.000Z"),
      ]);
      await syncDatabase(database);
      expect(await owner(database)).toBe(USER_A);

      const dirtyA = await createDirtyAsset(database, A_DIRTY_ID, USER_A);

      setCurrentUser(USER_B);
      setRemoteRows("assets", [
        serverAsset(A_FOREIGN_ID, USER_A, "2026-10-07T20:00:00.000Z"),
        serverAsset(B_REMOTE_ID, USER_B, "2026-10-07T20:00:00.000Z"),
      ]);

      await syncDatabase(database);

      const localIds = await ids(database, "assets");
      expect(localIds).toContain(B_REMOTE_ID);
      expect(localIds).not.toContain(A_FOREIGN_ID);
      expect(dirtyA.syncStatus).toBe("created");
      expect(await owner(database)).toBe(USER_B);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it("repairs the pre-journal snapshot identity gap once, replacing clean S-old with S-new", async () => {
    const database = await createDatabase("snapshot-pre-journal");

    try {
      await synchronize({
        database,
        sendCreatedAsUpdated: true,
        pullChanges: () =>
          Promise.resolve({
            timestamp: Date.parse(H1),
            changes: {
              daily_snapshot_assets: {
                created: [],
                deleted: [],
                updated: [
                  {
                    ...snapshot(SNAPSHOT_OLD, "2026-10-07T08:00:00.000Z"),
                    created_at: Date.parse("2026-10-07T08:00:00.000Z"),
                    snapshot_date: Date.parse("2026-10-07T00:00:00.000Z"),
                  },
                ],
              },
            },
          }),
      });
      await database.adapter.setLocal(OWNER_KEY, USER_A);
      expect(await ids(database, "daily_snapshot_assets")).toEqual([
        SNAPSHOT_OLD,
      ]);

      setRemoteRows("daily_snapshot_assets", [
        snapshot(SNAPSHOT_NEW, "2026-10-07T09:00:00.000Z"),
      ]);

      await syncDatabase(database, true);

      // No historical journal row exists. The one-time scoped SDK replacement repairs it.
      expect(await ids(database, "daily_snapshot_assets")).toEqual([
        SNAPSHOT_NEW,
      ]);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });
});
