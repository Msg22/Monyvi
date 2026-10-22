/**
 * Integration coverage for the category catalogue commit path.
 *
 * It drives the REAL protected sync runner against a real SQLite database.
 * The pulled category row is applied by the current sync cycle (it is not
 * pre-seeded), so the committed manifest can only match what this run
 * actually applied. A legacy category row, a transaction that keeps its old
 * category reference and an immutable JSON payload stay untouched.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SqliteDatabase from "better-sqlite3";
import type { Database } from "@nozbe/watermelondb";

// The protected runner reaches the WatermelonDB package through the sync
// services; the native adapter is not available in the test environment. The
// mocked database delegates to the fixture that the current test installs.
const mockDatabaseHolder: {
  adapter?: {
    getLocal: (key: string) => Promise<string | null>;
    setLocal: (key: string, value: string) => Promise<void>;
  };
  get?: () => {
    query: () => { fetch: () => Promise<unknown[]> };
  };
} = {};

jest.mock("@monyvi/db", () => ({
  schema: { tables: {} },
  database: {
    get: (_table: string) =>
      mockDatabaseHolder.get
        ? mockDatabaseHolder.get()
        : { query: () => ({ fetch: () => Promise.resolve([]) }) },
    adapter: {
      getLocal: (key: string) =>
        mockDatabaseHolder.adapter
          ? mockDatabaseHolder.adapter.getLocal(key)
          : Promise.resolve(null),
      setLocal: (key: string, value: string) =>
        mockDatabaseHolder.adapter
          ? mockDatabaseHolder.adapter.setLocal(key, value)
          : Promise.resolve(),
    },
  },
}));

const mockOwner = { current: "owner-1" };

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> =>
    Promise.resolve(mockOwner.current),
  getSupabaseClientOrigin: (): string | null => "https://project.supabase.co",
}));

import { database } from "@monyvi/db";
import {
  getCategoryCatalogueSnapshot,
  resetCategoryCatalogueSnapshot,
} from "@/services/category-catalogue-service";
import {
  createProtectedHistoricalSync,
  type ProtectedHistoricalSyncHost,
  type ProtectedHistoricalSyncHooks,
} from "@/services/sync/protected-historical-sync";

const OWNER = "owner-1";
const OTHER_OWNER = "owner-2";
const ORIGIN = "https://project.supabase.co";

const LEGACY_CATEGORY_ID = "legacy-system-category";
const CURRENT_CATEGORY_ID = "current-system-category";

interface Fixture {
  readonly path: string;
  readonly db: SqliteDatabase.Database;
  readonly manifestCount: () => number;
  readonly manifestValue: () => string | null;
  readonly transactionRow: () => string;
  readonly payloadRow: () => string;
  readonly appliedSystemIds: () => string[];
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), "monyvi-catalogue-"));
  const path = join(directory, "catalogue.sqlite");
  const db = new SqliteDatabase(path);
  db.exec(`
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      system_name TEXT,
      level INTEGER,
      is_system INTEGER,
      user_id TEXT,
      parent_id TEXT,
      deleted INTEGER
    );
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      amount INTEGER
    );
    CREATE TABLE user_category_settings (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      payload TEXT
    );
    CREATE TABLE local_storage (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    INSERT INTO categories VALUES
      ('${LEGACY_CATEGORY_ID}', 'electricity', 2, 1, NULL, 'l1-utilities', 0);
    INSERT INTO transactions VALUES ('tx-1', '${LEGACY_CATEGORY_ID}', 250);
    INSERT INTO user_category_settings VALUES
      ('ucs-1', '${LEGACY_CATEGORY_ID}', '{"immutable":"payload","action":"keep"}');
  `);

  const readLocal = (key: string): string | null => {
    const row = db
      .prepare("SELECT value FROM local_storage WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  };
  const writeLocal = (key: string, value: string): void => {
    db.prepare(
      "INSERT INTO local_storage (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(key, value);
  };
  const activeGlobalSystemRows = (): Array<{
    id: string;
    isSystem: true;
    userId: null;
  }> =>
    (
      db
        .prepare(
          "SELECT id FROM categories WHERE deleted = 0 AND is_system = 1 AND user_id IS NULL ORDER BY id"
        )
        .all() as Array<{ id: string }>
    ).map((row) => ({ id: row.id, isSystem: true, userId: null }));

  const watermelonLike = {
    adapter: {
      getLocal: (key: string) => Promise.resolve(readLocal(key)),
      setLocal: (key: string, value: string) => {
        writeLocal(key, value);
        return Promise.resolve();
      },
    },
    get: () => ({
      query: () => ({
        fetch: () => Promise.resolve(activeGlobalSystemRows()),
      }),
    }),
  };

  mockDatabaseHolder.adapter = watermelonLike.adapter;
  mockDatabaseHolder.get = watermelonLike.get;

  return {
    path,
    db,
    manifestCount: () =>
      Number(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS rows FROM local_storage WHERE key LIKE '__monyvi_category_catalogue%'"
            )
            .get() as { rows: number }
        ).rows
      ),
    manifestValue: () => {
      const row = db
        .prepare(
          "SELECT value FROM local_storage WHERE key LIKE '__monyvi_category_catalogue%' LIMIT 1"
        )
        .get() as { value: string } | undefined;
      return row?.value ?? null;
    },
    transactionRow: () =>
      JSON.stringify(db.prepare("SELECT * FROM transactions").get()),
    payloadRow: () =>
      JSON.stringify(db.prepare("SELECT * FROM user_category_settings").get()),
    appliedSystemIds: () =>
      (
        db
          .prepare(
            "SELECT id FROM categories WHERE deleted = 0 AND is_system = 1 AND user_id IS NULL ORDER BY id"
          )
          .all() as Array<{ id: string }>
      ).map((row) => row.id),
  };
}

interface PulledCategoryRow {
  readonly id: string;
  readonly system_name: string;
  readonly level: number;
  readonly is_system: number;
  readonly user_id: string | null;
  readonly parent_id: string | null;
  readonly deleted: number;
}

const PULLED_ROW: PulledCategoryRow = {
  id: CURRENT_CATEGORY_ID,
  system_name: "electricity",
  level: 2,
  is_system: 1,
  user_id: null,
  parent_id: "l1-utilities",
  deleted: 0,
};

interface RunnerOptions {
  readonly failSynchronize: boolean;
  /** Owner returned before the apply boundary; flipped afterwards. */
  readonly flipOwnerAfterApply: boolean;
  /** When false the apply drops the pulled row (negative case). */
  readonly applyPulledRow: boolean;
}

function createRunner(
  fixture: Fixture,
  options: RunnerOptions
): {
  syncDatabase: (database: Database, forceFullSync?: boolean) => Promise<void>;
} {
  const owner = { current: OWNER };
  mockOwner.current = OWNER;

  const hooks: ProtectedHistoricalSyncHooks = {
    synchronize: async (input) => {
      if (options.failSynchronize) {
        throw new Error("sdk_sync_failed");
      }
      const pullResult = (await input.pullChanges(null)) as unknown as {
        changes?: { categories?: { updated?: unknown[] } };
      };
      const updated = pullResult.changes?.categories?.updated ?? [];
      const apply = fixture.db.transaction(() => {
        for (const record of updated) {
          const row = record as PulledCategoryRow;
          if (!options.applyPulledRow && row.id === CURRENT_CATEGORY_ID) {
            continue;
          }
          fixture.db
            .prepare(
              "INSERT OR REPLACE INTO categories (id, system_name, level, is_system, user_id, parent_id, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )
            .run(
              row.id,
              row.system_name,
              row.level,
              row.is_system,
              row.user_id,
              row.parent_id,
              row.deleted
            );
        }
      });
      apply();
      // The owner changes after the pull and apply boundary.
      if (options.flipOwnerAfterApply) {
        owner.current = OTHER_OWNER;
        mockOwner.current = OTHER_OWNER;
      }
      return [];
    },
    applyDeferred: () => Promise.resolve(),
    assertOwner: () => Promise.resolve(),
  };

  const host: ProtectedHistoricalSyncHost = {
    getOwner: () => Promise.resolve(owner.current),
    repairAdds: () => Promise.resolve({ skipped: [] }),
    repairEdits: () => Promise.resolve({ skipped: [] }),
    historicalRequired: () => Promise.resolve(false),
    hasUnresolved: () => Promise.resolve(false),
    markComplete: () => Promise.resolve(),
    removeReceipt: () => Promise.resolve(),
    pull: () =>
      Promise.resolve({
        changes: {
          categories: {
            created: [],
            updated: [PULLED_ROW],
            deleted: [],
          },
        },
        timestamp: 1_700_000_000_000,
        catalogueAttempt: {
          origin: ORIGIN,
          ownerId: OWNER,
          capturedAt: 1_700_000_000_000,
          complete: true,
          systemIds: [CURRENT_CATEGORY_ID],
          customOwnerIds: [],
        },
      }),
    push: () => Promise.resolve(),
  };

  return createProtectedHistoricalSync(hooks, host);
}

describe("category catalogue commit through the protected sync runner", (): void => {
  afterEach((): void => {
    resetCategoryCatalogueSnapshot();
  });

  it("writes exactly one manifest from the row this cycle applied and keeps old references", async (): Promise<void> => {
    const fixture = createFixture();
    const transactionBefore = fixture.transactionRow();
    const payloadBefore = fixture.payloadRow();
    const runner = createRunner(fixture, {
      failSynchronize: false,
      flipOwnerAfterApply: false,
      applyPulledRow: true,
    });

    await runner.syncDatabase(database);

    // The current row exists only because this cycle applied it.
    expect(fixture.appliedSystemIds()).toContain(CURRENT_CATEGORY_ID);
    expect(fixture.manifestCount()).toBe(1);
    const manifest = JSON.parse(fixture.manifestValue() ?? "{}") as {
      systemIds: string[];
      snapshotComplete: boolean;
    };
    expect(manifest.snapshotComplete).toBe(true);
    expect(manifest.systemIds).toEqual([CURRENT_CATEGORY_ID]);
    const snapshot = getCategoryCatalogueSnapshot();
    expect(snapshot.status).toBe("ready");
    expect([...snapshot.selectedSystemIds]).toEqual([CURRENT_CATEGORY_ID]);
    // The old reference and the immutable payload are untouched.
    expect(fixture.transactionRow()).toBe(transactionBefore);
    expect(fixture.payloadRow()).toBe(payloadBefore);
  });

  it("writes no manifest when the applied rows do not contain the pulled id", async (): Promise<void> => {
    const fixture = createFixture();
    const runner = createRunner(fixture, {
      failSynchronize: false,
      flipOwnerAfterApply: false,
      applyPulledRow: false,
    });

    await runner.syncDatabase(database);

    expect(fixture.appliedSystemIds()).not.toContain(CURRENT_CATEGORY_ID);
    expect(fixture.manifestCount()).toBe(0);
    expect(getCategoryCatalogueSnapshot().status).not.toBe("ready");
  });

  it("writes no manifest when the SDK synchronization fails", async (): Promise<void> => {
    const fixture = createFixture();
    const runner = createRunner(fixture, {
      failSynchronize: true,
      flipOwnerAfterApply: false,
      applyPulledRow: true,
    });

    await expect(runner.syncDatabase(database)).rejects.toThrow();

    expect(fixture.manifestCount()).toBe(0);
    expect(getCategoryCatalogueSnapshot().status).not.toBe("ready");
  });

  it("writes no manifest and publishes nothing when the owner changes after the apply", async (): Promise<void> => {
    const fixture = createFixture();
    const runner = createRunner(fixture, {
      failSynchronize: false,
      flipOwnerAfterApply: true,
      applyPulledRow: true,
    });

    await runner.syncDatabase(database);

    expect(fixture.manifestCount()).toBe(0);
    expect(getCategoryCatalogueSnapshot().status).not.toBe("ready");
  });

  it("keeps the snapshot file readable for later forensics", (): void => {
    const fixture = createFixture();
    expect(readFileSync(fixture.path).length).toBeGreaterThan(0);
  });
});
