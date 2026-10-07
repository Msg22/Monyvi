/**
 * Issue #255 checkpoint integration tests (T016 basis, [US3]).
 *
 * AUTHORED ONLY — never executed. Focused tests using REAL
 * in-memory SQLite, the REAL Watermelon `synchronize` SDK (unmocked), and
 * the REAL production `syncDatabase` entry (only the network transport is
 * mocked and legacy-metal repairs are isolated as documented below).
 * Executed only at the T018 final batch against the owned backend harness.
 *
 * (1) Baseline commits via actual synchronize; then page 1 succeeds and
 *     page 2 fails: actual synchronize rejects, the existing checkpoint
 *     AND applied baseline rows are unchanged, and no first-page rows are
 *     applied.
 * (2) Actual synchronize good pull plus a genuinely dirty local row, then
 *     the push callback throws: the SDK rejects, the applied remote row
 *     and checkpoint remain, and the local row is still dirty/retryable.
 *
 * No manual checkpoint writes; no mock upserts passed off as production;
 * no simulation. No device, no backend, no secrets.
 */
import {
  Database as WatermelonDatabase,
  Model as WatermelonModel,
  type Database,
  type Model,
} from "@nozbe/watermelondb";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", () =>
  jest.requireActual<Record<string, unknown>>(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.unmock("@nozbe/watermelondb/sync");
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { schema } from "../../../../../packages/db/src/schema";

import { syncDatabase } from "../../../services/sync";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const UPPER = "2026-10-07T12:00:00.000Z";
const UPPER_2 = "2026-10-07T14:00:00.000Z";
const WATERMELON_CHECKPOINT_KEY = "__watermelon_last_pulled_at";
const PUSH_DOWN_MESSAGE = "simulated-push-transport-down";

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
  readonly limit: jest.Mock;
  readonly order: jest.Mock;
  readonly range: jest.Mock;
  readonly in: jest.Mock;
  readonly upsert: jest.Mock;
  readonly update: jest.Mock;
  readonly then: (
    resolve: (value: TransportPage) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise<unknown>;
}

jest.mock("../../../services/supabase", () => ({
  getCurrentUserId: (): Promise<string> =>
    Promise.resolve("11111111-1111-4111-8111-111111111111"),
  supabase: {
    from: (table: string): unknown => mockFrom(table),
    rpc: (...args: readonly unknown[]): unknown => mockRpc(...args),
  },
}));

// Isolated: legacy-metal repair is unrelated to the pull/checkpoint
// contract under test and would otherwise act on the empty fixture store.
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

const mockFrom = jest.fn();
const mockRpc = jest.fn();

let stagedPages: ReadonlyMap<string, readonly TransportPage[]> = new Map();
let failPushWrites = false;
let marketWatermarks: string[] = [];
let currentWatermark = UPPER;
let journalResponses: ReadonlyArray<{
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}> = [];

function makeChain(page: TransportPage): TransportChain {
  let isWrite = false;
  const chain: TransportChain = {
    select: jest.fn((): TransportChain => chain),
    eq: jest.fn((): TransportChain => chain),
    gt: jest.fn((): TransportChain => chain),
    lte: jest.fn((): TransportChain => chain),
    or: jest.fn((): TransportChain => chain),
    limit: jest.fn((): TransportChain => chain),
    order: jest.fn((): TransportChain => chain),
    range: jest.fn((): TransportChain => chain),
    in: jest.fn((): TransportChain => chain),
    upsert: jest.fn(
      (..._args: readonly unknown[]): Promise<unknown> =>
        failPushWrites
          ? Promise.reject(new Error(PUSH_DOWN_MESSAGE))
          : Promise.resolve({ data: [], error: null })
    ),
    update: jest.fn((): TransportChain => {
      isWrite = true;
      return chain;
    }),
    then: (
      resolve: (value: TransportPage) => unknown,
      reject?: (reason: unknown) => unknown
    ): Promise<unknown> =>
      (isWrite && failPushWrites
        ? Promise.reject(new Error(PUSH_DOWN_MESSAGE))
        : Promise.resolve(page)
      ).then(resolve, reject),
  };
  return chain;
}

function modelForTable(table: string): typeof Model {
  class CheckpointModel extends WatermelonModel {
    static table = table;
  }
  return CheckpointModel;
}

async function createLocalDatabase(name: string): Promise<Database> {
  const adapter = new SQLiteAdapter({
    schema,
    dbName: `file:issue255-checkpoint-${name}?mode=memory&cache=shared`,
  });
  await adapter.initializingPromise;
  return new WatermelonDatabase({
    adapter,
    modelClasses: Object.keys(schema.tables).map(modelForTable),
  });
}

async function readCheckpoint(database: Database): Promise<string | null> {
  const value = await database.adapter.getLocal(WATERMELON_CHECKPOINT_KEY);
  return typeof value === "string" ? value : null;
}

async function assetIds(database: Database): Promise<readonly string[]> {
  const records = await database.get("assets").query().fetch();
  return records.map((record) => record.id).sort();
}

function assetRow(id: string, updatedAt: string): Record<string, unknown> {
  return {
    id,
    user_id: USER_ID,
    name: `issue255-checkpoint-${id.slice(-4)}`,
    type: "REAL_ESTATE",
    is_liquid: false,
    purchase_price: 1000,
    purchase_price_decimal: "1000",
    purchase_price_decimal_text: "1000.125",
    purchase_date: "2026-01-15",
    currency: "EGP",
    purchase_currency: "EGP",
    notes: "checkpoint-fixture",
    deleted: false,
    updated_at: updatedAt,
  };
}

const BASE_ID = "020f0c7a-1234-4abc-8def-000000000001";
const PAGE1_ID = "020f0c7a-1234-4abc-8def-000000000002";

function stageAssets(...pages: readonly TransportPage[]): void {
  stagedPages = new Map(stagedPages).set("assets", pages);
}

beforeEach(() => {
  jest.clearAllMocks();
  stagedPages = new Map();
  failPushWrites = false;
  marketWatermarks = [UPPER, UPPER_2];
  currentWatermark = UPPER;
  journalResponses = [];
  mockFrom.mockImplementation((table: string) => {
    const [next, ...rest] = stagedPages.get(table) ?? [];
    stagedPages = new Map(stagedPages).set(table, rest);
    return makeChain(next ?? { data: [], error: null, count: 0 });
  });
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
      const [next, ...rest] = journalResponses;
      journalResponses = rest;
      if (next) return Promise.resolve(next);
      return Promise.resolve({
        data: { rows: [], count: 0, upperWatermark: currentWatermark },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
});

describe("#255 checkpoint survives failed pulls and pushes", () => {
  it("page-1 success then page-2 failure rejects with checkpoint and baseline unchanged", async () => {
    const database = await createLocalDatabase("pull-failure");

    try {
      stageAssets({
        data: [assetRow(BASE_ID, "2026-10-07T10:00:00.000Z")],
        count: 1,
        error: null,
      });
      await syncDatabase(database);
      const baselineCheckpoint = await readCheckpoint(database);
      if (baselineCheckpoint === null) {
        throw new Error("ISSUE255_BASELINE_CHECKPOINT_MISSING");
      }
      expect(await assetIds(database)).toEqual([BASE_ID]);

      stageAssets(
        {
          data: [assetRow(PAGE1_ID, "2026-10-07T13:00:00.000Z")],
          count: 2,
          error: null,
        },
        { data: null, error: { message: "page-2-down" }, count: null }
      );
      await expect(syncDatabase(database)).rejects.toThrow();
      expect(await readCheckpoint(database)).toBe(baselineCheckpoint);
      expect(await assetIds(database)).toEqual([BASE_ID]);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });

  it("good pull plus dirty local row then failed push keeps checkpoint, rows, and dirty state", async () => {
    const database = await createLocalDatabase("push-failure");

    try {
      stageAssets({
        data: [assetRow(BASE_ID, "2026-10-07T10:00:00.000Z")],
        count: 1,
        error: null,
      });
      await syncDatabase(database);
      const baselineCheckpoint = await readCheckpoint(database);
      if (baselineCheckpoint === null) {
        throw new Error("ISSUE255_BASELINE_CHECKPOINT_MISSING");
      }

      const baseline = await database.get("assets").find(BASE_ID);
      await database.write(() => baseline.markAsDeleted());
      expect(baseline.syncStatus).toBe("deleted");

      failPushWrites = true;
      stageAssets({
        data: [assetRow(PAGE1_ID, "2026-10-07T13:00:00.000Z")],
        count: 1,
        error: null,
      });
      await expect(syncDatabase(database)).rejects.toThrow(PUSH_DOWN_MESSAGE);

      expect(await readCheckpoint(database)).toBe(String(Date.parse(UPPER_2)));
      expect(await readCheckpoint(database)).not.toBe(baselineCheckpoint);
      const deletedIds = await database.adapter.getDeletedRecords("assets");
      expect(deletedIds).toContain(BASE_ID);
      expect(await assetIds(database)).toContain(PAGE1_ID);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });
  it("later journal failure leaves the applied snapshot checkpoint unchanged", async () => {
    const database = await createLocalDatabase("journal-failure");
    try {
      stageAssets({
        data: [assetRow(BASE_ID, "2026-10-07T10:00:00.000Z")],
        count: 1,
        error: null,
      });
      await syncDatabase(database);
      const baselineCheckpoint = await readCheckpoint(database);
      journalResponses = [
        {
          data: {
            rows: [
              {
                entry_id: PAGE1_ID,
                user_id: USER_ID,
                table_name: "daily_snapshot_assets",
                record_id: BASE_ID,
                published_at: "2026-10-07T13:00:00.123456+00:00",
              },
            ],
            count: 2,
            upperWatermark: UPPER_2,
          },
          error: null,
        },
        { data: null, error: { message: "journal-page-2-down" } },
      ];
      await expect(syncDatabase(database)).rejects.toThrow(
        "journal-page-2-down"
      );
      expect(await readCheckpoint(database)).toBe(baselineCheckpoint);
      expect(await assetIds(database)).toEqual([BASE_ID]);
    } finally {
      await database.write(() => database.unsafeResetDatabase());
    }
  });
});
