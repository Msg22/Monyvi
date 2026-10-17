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
  Database as WatermelonDatabase,
  Model as WatermelonModel,
  type Database,
  type Model,
} from "@nozbe/watermelondb";

import { synchronize, type SyncPullResult } from "@nozbe/watermelondb/sync";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", () =>
  jest.requireActual<Record<string, unknown>>(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.unmock("@nozbe/watermelondb/sync");

import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { schema } from "../../../../../packages/db/src/schema";
import { syncDatabase } from "../../../services/sync";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const OWNER_KEY = "__monyvi_sync_owner_user_id";
const CHECKPOINT_KEY = "__watermelon_last_pulled_at";
const PUSH_DOWN = "issue255-historical-push-down";

const H1 = "2026-10-08T00:10:00.000Z";
const H2 = "2026-10-08T00:20:00.000Z";
const H3 = "2026-10-08T00:30:00.000Z";

const EDIT_ID = "02550000-0000-4000-8000-000000000101";
const DELETE_ID = "02550000-0000-4000-8000-000000000102";
const CREATE_ID = "02550000-0000-4000-8000-000000000103";
const HISTORICAL_ID = "02550000-0000-4000-8000-000000000001";
const PAGE1_ID = "02550000-0000-4000-8000-000000000201";
const PAGE2_ID = "02550000-0000-4000-8000-000000000202";
const B_REMOTE_ID = "02550000-0000-4000-8000-000000000301";
const A_FOREIGN_ID = "02550000-0000-4000-8000-000000000302";
const A_DIRTY_ID = "02550000-0000-4000-8000-000000000303";
const SNAPSHOT_OLD = "02550000-0000-4000-8000-000000000401";
const SNAPSHOT_NEW = "02550000-0000-4000-8000-000000000402";

interface TransportPage {
  readonly data: ReadonlyArray<Record<string, unknown>> | null;
  readonly error: { readonly message: string } | null;
  readonly count: number | null;
}

interface TransportChain {
  readonly select: jest.Mock;
  readonly eq: jest.Mock;
  readonly gt: jest.Mock;
  readonly lte: jest.Mock;
  readonly or: jest.Mock;
  readonly in: jest.Mock;
  readonly limit: jest.Mock;
  readonly order: jest.Mock;
  readonly update: jest.Mock;
  readonly upsert: jest.Mock;
  readonly then: (
    resolve: (value: TransportPage) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise<unknown>;
}

let mockCurrentUserId = USER_A;
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("../../../services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockCurrentUserId),
  supabase: {
    from: (table: string): unknown => mockFrom(table),
    rpc: (...args: readonly unknown[]): unknown => mockRpc(...args),
  },
}));

jest.mock("../../../services/legacy-metal-add-repair-service", () => ({
  repairLegacyMetalAdds: (): Promise<{
    repaired: number;
    skipped: ReadonlyArray<{ actionId: string; reason: string }>;
  }> => Promise.resolve({ repaired: 0, skipped: [] }),
}));

jest.mock("../../../services/legacy-metal-edit-repair-service", () => ({
  repairLegacyMetalEdits: (): Promise<{
    repaired: number;
    skipped: ReadonlyArray<{ actionId: string; reason: string }>;
  }> => Promise.resolve({ repaired: 0, skipped: [] }),
}));

let remoteRows = new Map<string, ReadonlyArray<Record<string, unknown>>>();
let scriptedPages = new Map<string, TransportPage[]>();
let marketWatermarks: string[] = [];
let currentWatermark = H1;
let failPushWrites = false;
let databaseSequence = 0;

function setRemoteRows(
  table: string,
  rows: ReadonlyArray<Record<string, unknown>>
): void {
  remoteRows = new Map(remoteRows).set(table, rows);
}

function stagePages(table: string, ...pages: TransportPage[]): void {
  scriptedPages = new Map(scriptedPages).set(table, [...pages]);
}

function shiftPage(table: string): TransportPage | null {
  const [next, ...rest] = scriptedPages.get(table) ?? [];
  scriptedPages = new Map(scriptedPages).set(table, rest);
  return next ?? null;
}

function makeChain(table: string): TransportChain {
  const eqFilters: Array<readonly [string, unknown]> = [];
  const gtFilters: Array<readonly [string, string]> = [];
  const lteFilters: Array<readonly [string, string]> = [];
  let cursor: {
    readonly column: string;
    readonly timestamp: string;
    readonly id: string;
  } | null = null;
  let pageLimit = 500;
  let isWrite = false;

  const chain: TransportChain = {
    select: jest.fn((): TransportChain => chain),
    eq: jest.fn((column: string, value: unknown): TransportChain => {
      eqFilters.push([column, value]);
      return chain;
    }),
    gt: jest.fn((column: string, value: string): TransportChain => {
      gtFilters.push([column, value]);
      return chain;
    }),
    lte: jest.fn((column: string, value: string): TransportChain => {
      lteFilters.push([column, value]);
      return chain;
    }),
    or: jest.fn((filter: string): TransportChain => {
      const match =
        /^(updated_at|created_at)\.gt\.(.+),and\((?:updated_at|created_at)\.eq\.(.+),id\.gt\.([^)]+)\)$/.exec(
          filter
        );
      if (match) {
        cursor = {
          column: match[1],
          timestamp: match[3],
          id: match[4],
        };
      }
      return chain;
    }),
    in: jest.fn((): TransportChain => chain),
    limit: jest.fn((value: number): TransportChain => {
      pageLimit = value;
      return chain;
    }),
    order: jest.fn((): TransportChain => chain),
    update: jest.fn((): TransportChain => {
      isWrite = true;
      return chain;
    }),
    upsert: jest.fn(() =>
      failPushWrites
        ? Promise.reject(new Error(PUSH_DOWN))
        : Promise.resolve({ data: [], error: null })
    ),
    then: (
      resolve: (value: TransportPage) => unknown,
      reject?: (reason: unknown) => unknown
    ): Promise<unknown> => {
      if (isWrite) {
        return (
          failPushWrites
            ? Promise.reject(new Error(PUSH_DOWN))
            : Promise.resolve({ data: [], error: null, count: null })
        ).then(resolve, reject);
      }

      const scripted = shiftPage(table);
      if (scripted !== null) {
        return Promise.resolve(scripted).then(resolve, reject);
      }

      let rows = [...(remoteRows.get(table) ?? [])];

      for (const [column, value] of eqFilters) {
        if (column.includes(".")) continue;
        rows = rows.filter((row) => row[column] === value);
      }
      for (const [column, value] of gtFilters) {
        rows = rows.filter(
          (row) => typeof row[column] === "string" && row[column] > value
        );
      }
      for (const [column, value] of lteFilters) {
        rows = rows.filter(
          (row) => typeof row[column] === "string" && row[column] <= value
        );
      }
      if (cursor !== null) {
        const pageCursor = cursor;
        rows = rows.filter((row) => {
          const timestamp = row[pageCursor.column];
          const id = row.id;
          return (
            typeof timestamp === "string" &&
            typeof id === "string" &&
            (timestamp > pageCursor.timestamp ||
              (timestamp === pageCursor.timestamp && id > pageCursor.id))
          );
        });
      }

      const orderColumn = rows.some((row) => typeof row.updated_at === "string")
        ? "updated_at"
        : "created_at";
      rows.sort((left, right) =>
        `${String(left[orderColumn])}:${String(left.id)}`.localeCompare(
          `${String(right[orderColumn])}:${String(right.id)}`
        )
      );

      return Promise.resolve({
        data: rows.slice(0, pageLimit),
        count: rows.length,
        error: null,
      }).then(resolve, reject);
    },
  };

  return chain;
}

function modelForTable(table: string): typeof Model {
  class HistoricalRecoveryModel extends WatermelonModel {
    static table = table;
  }
  return HistoricalRecoveryModel;
}

async function createDatabase(name: string): Promise<Database> {
  databaseSequence += 1;
  const adapter = new SQLiteAdapter({
    schema,
    dbName: `file:issue255-history-${name}-${databaseSequence}?mode=memory&cache=shared`,
  });
  await adapter.initializingPromise;
  return new WatermelonDatabase({
    adapter,
    modelClasses: Object.keys(schema.tables).map(modelForTable),
  });
}

async function reopenDatabase(database: Database): Promise<Database> {
  const adapter = await (
    database.adapter.underlyingAdapter as SQLiteAdapter
  ).testClone();
  return new WatermelonDatabase({
    adapter,
    modelClasses: Object.keys(schema.tables).map(modelForTable),
  });
}

async function checkpoint(database: Database): Promise<string> {
  const value = await database.adapter.getLocal(CHECKPOINT_KEY);
  if (typeof value !== "string") {
    throw new Error("ISSUE255_EXPECTED_REAL_CHECKPOINT");
  }
  return value;
}

async function owner(database: Database): Promise<string | undefined> {
  return database.adapter.getLocal(OWNER_KEY);
}

async function ids(
  database: Database,
  table: string
): Promise<readonly string[]> {
  const records = await database.get(table).query().fetch();
  return records.map((record) => record.id).sort();
}

function serverAsset(
  id: string,
  userId: string,
  updatedAt: string,
  name = `server-${id.slice(-4)}`
): Record<string, unknown> {
  return {
    id,
    user_id: userId,
    created_at: "2026-10-07T23:00:00.000Z",
    updated_at: updatedAt,
    deleted: false,
    name,
    type: "REAL_ESTATE",
    is_liquid: false,
    purchase_price: 1000,
    purchase_price_decimal_text: "1000.125",
    purchase_date: "2026-01-15",
    currency: "EGP",
    purchase_currency: "EGP",
    notes: "issue255-history",
  };
}

function localAsset(
  id: string,
  userId: string,
  name: string
): Record<string, unknown> {
  return {
    id,
    user_id: userId,
    created_at: Date.parse("2026-10-07T23:00:00.000Z"),
    updated_at: Date.parse("2026-10-07T23:00:00.000Z"),
    deleted: false,
    name,
    type: "REAL_ESTATE",
    is_liquid: false,
    purchase_price: 1000,
    purchase_price_decimal: "1000.125",
    purchase_date: Date.parse("2026-01-15T00:00:00.000Z"),
    currency: "EGP",
    purchase_currency: "EGP",
    notes: "issue255-local",
  };
}

/**
 * Simulates an already-installed same-owner beta before any historical-repair
 * implementation exists.
 *
 * The real Watermelon SDK applies the baseline and persists its checkpoint.
 * Production syncDatabase is deliberately NOT invoked here, so no current or
 * future recovery-completion receipt can exist yet. The only explicit metadata
 * written by the fixture is the already-existing sync-owner marker.
 */
async function seedExistingInstallBaseline(
  database: Database
): Promise<string> {
  const baselineRows = [
    localAsset(EDIT_ID, USER_A, "server-edit-baseline"),
    localAsset(DELETE_ID, USER_A, "server-delete-baseline"),
  ];

  const pullResult: SyncPullResult = {
    changes: {
      assets: {
        created: [],
        updated: baselineRows,
        deleted: [],
      },
    },
    timestamp: Date.parse(H1),
  };

  await synchronize({
    database,
    pullChanges: (): Promise<SyncPullResult> => Promise.resolve(pullResult),
    pushChanges: (): Promise<void> => Promise.resolve(),
    sendCreatedAsUpdated: true,
  });

  await database.adapter.setLocal(OWNER_KEY, USER_A);

  const persistedCheckpoint = await checkpoint(database);
  expect(persistedCheckpoint).toBe(String(Date.parse(H1)));
  expect(await owner(database)).toBe(USER_A);

  // Baseline construction must not accidentally exercise production recovery.
  expect(mockFrom).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();

  return persistedCheckpoint;
}

function snapshot(id: string, createdAt: string): Record<string, unknown> {
  return {
    id,
    user_id: USER_A,
    snapshot_date: "2026-10-07",
    created_at: createdAt,
    total_assets_usd: 1234.5,
  };
}

async function createDirtyAsset(
  database: Database,
  id: string,
  userId: string
): Promise<Model> {
  return database.write(async (): Promise<Model> => {
    const record = database
      .get("assets")
      .prepareCreateFromDirtyRaw(
        localAsset(id, userId, `local-${id.slice(-4)}`)
      );
    await database.batch(record);
    return record;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUserId = USER_A;
  remoteRows = new Map();
  scriptedPages = new Map();
  marketWatermarks = [H1, H2, H3];
  currentWatermark = H1;
  failPushWrites = false;

  mockFrom.mockImplementation((table: string) => makeChain(table));
  mockRpc.mockImplementation((...args: readonly unknown[]) => {
    const method = String(args[0]);

    if (method === "pull_market_rate_snapshots_page_v2") {
      currentWatermark = marketWatermarks.shift() ?? currentWatermark;
      return Promise.resolve({
        data: {
          snapshots: [],
          nextCursor: null,
          upperWatermark: currentWatermark,
        },
        error: null,
      });
    }
    if (method === "seal_sync_pull_v1") {
      return Promise.resolve({ data: currentWatermark, error: null });
    }
    if (method === "pull_snapshot_deletions_page_v1") {
      return Promise.resolve({
        data: {
          rows: [],
          count: 0,
          upperWatermark: currentWatermark,
        },
        error: null,
      });
    }

    return Promise.resolve({ data: null, error: null });
  });
});

export function setMarketWatermarks(values: readonly string[]): void {
  marketWatermarks = [...values];
}
export function setFailPushWrites(value: boolean): void {
  failPushWrites = value;
}
export function setCurrentUser(value: string): void {
  mockCurrentUserId = value;
}

export {
  syncDatabase,
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
  mockFrom,
  mockRpc,
  H1,
  OWNER_KEY,
  CHECKPOINT_KEY,
  makeChain,
  localAsset,
  synchronize,
};
export type { TransportPage, TransportChain };
