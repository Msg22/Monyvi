/**
 * Issue #255 local reproduction: ordinary-pull truncation and unsafe
 * WatermelonDB checkpoint advancement.
 *
 * Opt-in contract (passed privately by the owned runner, never committed):
 *   ISSUE255_SYNC_REPRO=1
 *   ISSUE255_SYNC_CONFIG_JSON='{"supabaseUrl":"http://127.0.0.1:<dedicated-port>","anonKey":"...","serviceRoleKey":"...","email":"issue255@monyvi.test","password":"...","expectedUserId":"<uuid>"}'
 *
 * The URL must be loopback, use an explicit port other than 54321, and point
 * at a disposable fully migrated backend. This file never reads root .env.
 * Only Node platform/storage adapters are mocked (see __tests__/setup.ts);
 * Supabase client, pull routing, Watermelon synchronize and marketV2RPC stay
 * real. Full ID/value manifests are compared, and non-secret evidence is
 * written to the owned evidence dir before final assertions.
 */
import {
  Database as WatermelonDatabase,
  Model as WatermelonModel,
  type Database,
  type Model,
} from "@nozbe/watermelondb";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseDatabase } from "@monyvi/db";
import {
  ACCOUNT_NAMESPACE,
  ACCOUNT_PREFIX,
  type AccountInsert,
  type AccountManifest,
  type AccountTruthRow,
  accountManifest,
  accountRows,
  type AssetInsert,
  type AssetManifest,
  assetManifest,
  assetRows,
  type AssetTruthSelect,
  CAP_PROBE_NAMESPACE,
  CAP_PROBE_PREFIX,
  CONTROL_ASSET_NAMESPACE,
  CONTROL_ASSET_PREFIX,
  CONTROL_COUNT,
  diffManifests,
  expectManifests,
  fail,
  ids,
  LARGE_ASSET_NAMESPACE,
  LARGE_ASSET_PREFIX,
  LARGE_COUNT,
  localAccounts,
  localAssets,
  localSenders,
  type PublicTables,
  recordEvidence,
  SENDER_NAMESPACE,
  SENDER_PREFIX,
  type SenderInsert,
  type SenderManifest,
  type SenderTruthRow,
  senderManifest,
  senderRows,
  sortById,
  UUID_PATTERN,
} from "./issue255-sync-reproduction/manifests";
jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", () =>
  jest.requireActual<Record<string, unknown>>(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { schema } from "../../../../packages/db/src/schema";
type FixtureTable = keyof Pick<
  PublicTables,
  "assets" | "accounts" | "account_sms_senders"
>;
interface Issue255Config {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
  readonly email: string;
  readonly password: string;
  readonly expectedUserId: string;
}
interface SecureStoreMock {
  readonly getItemAsync: jest.Mock<Promise<string | null>, [string]>;
  readonly setItemAsync: jest.Mock<Promise<void>, [string, string]>;
  readonly deleteItemAsync: jest.Mock<Promise<void>, [string]>;
}
type SyncDatabase = (
  database: Database,
  forceFullSync?: boolean
) => Promise<void>;
const TEST_TIMEOUT_MS = 180_000;
const INSERT_BATCH_SIZE = 200;
const DELETE_BATCH_SIZE = 100;
const TRUTH_PAGE_MAX = 250;
const SHARED_LOCAL_PORT = "54321";
const WATERMELON_CHECKPOINT_KEY = "__watermelon_last_pulled_at";
const IS_ENABLED = process.env.ISSUE255_SYNC_REPRO === "1";
const CONFIG = IS_ENABLED ? readConfig() : null;
if (CONFIG !== null) {
  process.env.EXPO_PUBLIC_SUPABASE_URL = CONFIG.supabaseUrl;
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = CONFIG.anonKey;
  process.env.EXPO_PUBLIC_SUPABASE_AUTH_STORAGE_KEY =
    "issue255-sync-reproduction-auth";
}
const describeIssue255 = IS_ENABLED ? describe : describe.skip;
jest.setTimeout(TEST_TIMEOUT_MS);
let adminClient: SupabaseClient<SupabaseDatabase> | null = null;
let appClient: SupabaseClient<SupabaseDatabase> | null = null;
let syncDatabase: SyncDatabase | null = null;
let userId: string | null = null;
let verifiedApiCap: number | null = null;
let databaseSequence = 0;
function requireString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0) fail(code);
  return value;
}
function readConfig(): Issue255Config {
  const raw = requireString(
    process.env.ISSUE255_SYNC_CONFIG_JSON,
    "ISSUE255_CONFIG_MISSING"
  );
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    fail("ISSUE255_CONFIG_INVALID_JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("ISSUE255_CONFIG_INVALID_SHAPE");
  }
  const record = value as Record<string, unknown>;
  const config: Issue255Config = {
    supabaseUrl: requireString(
      record.supabaseUrl,
      "ISSUE255_CONFIG_URL_MISSING"
    ),
    anonKey: requireString(record.anonKey, "ISSUE255_CONFIG_ANON_MISSING"),
    serviceRoleKey: requireString(
      record.serviceRoleKey,
      "ISSUE255_CONFIG_SERVICE_ROLE_MISSING"
    ),
    email: requireString(record.email, "ISSUE255_CONFIG_EMAIL_MISSING"),
    password: requireString(
      record.password,
      "ISSUE255_CONFIG_PASSWORD_MISSING"
    ),
    expectedUserId: requireString(
      record.expectedUserId,
      "ISSUE255_CONFIG_USER_ID_MISSING"
    ),
  };
  let url: URL;
  try {
    url = new URL(config.supabaseUrl);
  } catch {
    fail("ISSUE255_CONFIG_URL_INVALID");
  }
  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(host) ||
    !url.port ||
    url.port === SHARED_LOCAL_PORT
  ) {
    fail("ISSUE255_CONFIG_REQUIRES_DEDICATED_LOOPBACK");
  }
  const email = config.email.toLowerCase();
  if (
    !email.includes("issue255") ||
    !email.endsWith("@monyvi.test") ||
    !UUID_PATTERN.test(config.expectedUserId)
  ) {
    fail("ISSUE255_CONFIG_REQUIRES_DEDICATED_TEST_USER");
  }
  return config;
}
function requireConfig(): Issue255Config {
  if (CONFIG === null) fail("ISSUE255_REPRO_NOT_CONFIGURED");
  return CONFIG;
}
function requireAdmin(): SupabaseClient<SupabaseDatabase> {
  if (adminClient === null) fail("ISSUE255_ADMIN_CLIENT_NOT_READY");
  return adminClient;
}
function requireApp(): SupabaseClient<SupabaseDatabase> {
  if (appClient === null) fail("ISSUE255_APP_CLIENT_NOT_READY");
  return appClient;
}
function requireSync(): SyncDatabase {
  if (syncDatabase === null) fail("ISSUE255_SYNC_NOT_READY");
  return syncDatabase;
}
function requireUserId(): string {
  if (userId === null) fail("ISSUE255_USER_NOT_READY");
  return userId;
}
function installMemorySecureStore(): void {
  const values = new Map<string, string>();
  const store = jest.requireMock<SecureStoreMock>("expo-secure-store");
  store.getItemAsync.mockImplementation((key) =>
    Promise.resolve(values.get(key) ?? null)
  );
  store.setItemAsync.mockImplementation((key, value) => {
    values.set(key, value);
    return Promise.resolve();
  });
  store.deleteItemAsync.mockImplementation((key) => {
    values.delete(key);
    return Promise.resolve();
  });
}
function modelForTable(table: string): typeof Model {
  class Issue255Model extends WatermelonModel {
    static table = table;
  }
  return Issue255Model;
}
async function createLocalDatabase(): Promise<Database> {
  databaseSequence += 1;
  // Shared-cache in-memory SQLite: the file-backed reset path uses
  // unlinkSync, which fails with EBUSY on Windows. Memory databases take
  // the drop-tables reset path instead. Names stay unique per database so
  // each test starts from a fresh local store.
  const adapter = new SQLiteAdapter({
    schema,
    dbName: `file:issue255-sync-repro-${databaseSequence}?mode=memory&cache=shared`,
  });
  await adapter.initializingPromise;
  return new WatermelonDatabase({
    adapter,
    modelClasses: Object.keys(schema.tables).map(modelForTable),
  });
}
async function disposeDatabase(database: Database): Promise<void> {
  await database.write(() => database.unsafeResetDatabase());
}
function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < values.length; start += size) {
    result.push(values.slice(start, start + size));
  }
  return result;
}
async function insertInto(
  table: FixtureTable,
  rows: ReadonlyArray<AssetInsert | AccountInsert | SenderInsert>,
  code: string
): Promise<void> {
  for (const batch of chunks(rows, INSERT_BATCH_SIZE)) {
    // Test-harness escape: row shapes are guaranteed by the typed builders
    // above; the union-table client cannot express them to the compiler.
    const { error } = await requireAdmin()
      .from(table)
      .insert(batch as never);
    if (error) fail(code);
  }
}
async function deleteByIds(
  table: FixtureTable,
  recordIds: readonly string[],
  ownerId?: string
): Promise<void> {
  for (const batch of chunks(recordIds, DELETE_BATCH_SIZE)) {
    if (table === "account_sms_senders") {
      const { error } = await requireAdmin()
        .from(table)
        .delete()
        .in("id", batch);
      if (error) fail(`ISSUE255_FIXTURE_${table.toUpperCase()}_DELETE_FAILED`);
      continue;
    }
    if (ownerId === undefined) fail("ISSUE255_FIXTURE_OWNER_MISSING");
    const { error } = await requireAdmin()
      .from(table)
      .delete()
      .in("id", batch)
      .eq("user_id", ownerId);
    if (error) fail(`ISSUE255_FIXTURE_${table.toUpperCase()}_DELETE_FAILED`);
  }
}
async function measureActualApiCap(
  ownerId: string,
  prefix: string
): Promise<number> {
  const { data, error, count } = await requireApp()
    .from("assets")
    .select("id", { count: "exact" })
    .eq("user_id", ownerId)
    .like("name", `${prefix}%`)
    .order("id", { ascending: true })
    .range(0, LARGE_COUNT - 1);
  if (error) fail("ISSUE255_API_CAP_PROBE_FAILED");
  if (count !== LARGE_COUNT) fail("ISSUE255_API_CAP_FIXTURE_INCOMPLETE");
  const returned = data?.length ?? 0;
  if (returned <= CONTROL_COUNT || returned >= LARGE_COUNT) {
    fail("ISSUE255_API_CAP_NOT_IN_REQUIRED_RANGE");
  }
  return returned;
}
async function verifiedCap(): Promise<number> {
  if (verifiedApiCap !== null) return verifiedApiCap;
  const ownerId = requireUserId();
  const fixtureIds = ids(CAP_PROBE_NAMESPACE, LARGE_COUNT);
  await deleteByIds("assets", fixtureIds, ownerId);
  try {
    await insertInto(
      "assets",
      assetRows(CAP_PROBE_NAMESPACE, CAP_PROBE_PREFIX, LARGE_COUNT, ownerId),
      "ISSUE255_FIXTURE_ASSET_INSERT_FAILED"
    );
    verifiedApiCap = await measureActualApiCap(ownerId, CAP_PROBE_PREFIX);
    return verifiedApiCap;
  } finally {
    await deleteByIds("assets", fixtureIds, ownerId);
  }
}
function truthPageSize(apiCap: number): number {
  const size = Math.min(TRUTH_PAGE_MAX, apiCap - 1);
  if (size < 1) fail("ISSUE255_TRUTH_PAGE_SIZE_INVALID");
  return size;
}
async function assetTruth(
  ownerId: string,
  prefix: string,
  expectedCount: number,
  pageSize: number
): Promise<AssetManifest[]> {
  const rows: AssetManifest[] = [];
  for (let offset = 0; rows.length < expectedCount; ) {
    const { data, error, count } = await requireAdmin()
      .from("assets")
      .select(
        "id,user_id,name,type,currency,purchase_price,purchase_price_decimal,deleted",
        { count: "exact" }
      )
      .eq("user_id", ownerId)
      .like("name", `${prefix}%`)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) fail("ISSUE255_ASSET_TRUTH_READ_FAILED");
    if (count !== expectedCount) fail("ISSUE255_ASSET_TRUTH_COUNT_MISMATCH");
    const page = (data ?? []) as AssetTruthSelect[];
    if (page.length === 0) fail("ISSUE255_ASSET_TRUTH_EARLY_EOF");
    rows.push(...page.map(assetManifest));
    offset += page.length;
  }
  if (rows.length !== expectedCount) fail("ISSUE255_ASSET_TRUTH_OVERFLOW");
  return sortById(rows);
}
async function accountTruth(
  ownerId: string,
  expectedCount: number,
  pageSize: number
): Promise<AccountManifest[]> {
  const rows: AccountManifest[] = [];
  for (let offset = 0; rows.length < expectedCount; ) {
    const { data, error, count } = await requireAdmin()
      .from("accounts")
      .select("*", { count: "exact" })
      .eq("user_id", ownerId)
      .like("name", `${ACCOUNT_PREFIX}%`)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) fail("ISSUE255_ACCOUNT_TRUTH_READ_FAILED");
    if (count !== expectedCount) fail("ISSUE255_ACCOUNT_TRUTH_COUNT_MISMATCH");
    const page = (data ?? []) as AccountTruthRow[];
    if (page.length === 0) fail("ISSUE255_ACCOUNT_TRUTH_EARLY_EOF");
    rows.push(...page.map(accountManifest));
    offset += page.length;
  }
  if (rows.length !== expectedCount) fail("ISSUE255_ACCOUNT_TRUTH_OVERFLOW");
  return sortById(rows);
}
async function senderTruth(
  expectedCount: number,
  pageSize: number
): Promise<SenderManifest[]> {
  const rows: SenderManifest[] = [];
  for (let offset = 0; rows.length < expectedCount; ) {
    const { data, error, count } = await requireAdmin()
      .from("account_sms_senders")
      .select("*", { count: "exact" })
      .like("normalized_sender_name", `${SENDER_PREFIX}%`)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) fail("ISSUE255_SENDER_TRUTH_READ_FAILED");
    if (count !== expectedCount) fail("ISSUE255_SENDER_TRUTH_COUNT_MISMATCH");
    const page = (data ?? []) as SenderTruthRow[];
    if (page.length === 0) fail("ISSUE255_SENDER_TRUTH_EARLY_EOF");
    rows.push(...page.map(senderManifest));
    offset += page.length;
  }
  if (rows.length !== expectedCount) fail("ISSUE255_SENDER_TRUTH_OVERFLOW");
  return sortById(rows);
}
async function checkpoint(database: Database): Promise<number> {
  const value: string | null | undefined = await database.adapter.getLocal(
    WATERMELON_CHECKPOINT_KEY
  );
  if (value === null || value === undefined || !/^\d+$/.test(value)) {
    fail("ISSUE255_WATERMELON_CHECKPOINT_MISSING");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail("ISSUE255_WATERMELON_CHECKPOINT_INVALID");
  }
  return parsed;
}
async function runSync(database: Database): Promise<void> {
  await requireSync()(database);
}
async function settleServerTimestamp(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 10);
  });
}
async function seedAssets(
  namespace: number,
  prefix: string,
  count: number,
  ownerId: string,
  apiCap: number
): Promise<{ expected: AssetManifest[]; fixtureIds: string[] }> {
  const fixtureIds = ids(namespace, count);
  await deleteByIds("assets", fixtureIds, ownerId);
  const rows = assetRows(namespace, prefix, count, ownerId);
  await insertInto("assets", rows, "ISSUE255_FIXTURE_ASSET_INSERT_FAILED");
  const expected = rows.map((row) => assetManifest(row as AssetTruthSelect));
  const truth = await assetTruth(ownerId, prefix, count, truthPageSize(apiCap));
  expect(truth).toEqual(expected);
  return { expected, fixtureIds };
}
async function seedAccountsAndSenders(
  fixtureCount: number,
  ownerId: string,
  apiCap: number
): Promise<{
  expectedParentRows: AccountManifest[];
  expectedChildRows: SenderManifest[];
}> {
  const parentRows = accountRows(fixtureCount, ownerId);
  const childRows = senderRows(fixtureCount);
  await insertInto(
    "accounts",
    parentRows,
    "ISSUE255_FIXTURE_ACCOUNT_INSERT_FAILED"
  );
  await insertInto(
    "account_sms_senders",
    childRows,
    "ISSUE255_FIXTURE_SENDER_INSERT_FAILED"
  );
  const expectedParentRows = parentRows.map((row) =>
    accountManifest(row as AccountTruthRow)
  );
  const expectedChildRows = childRows.map((row) =>
    senderManifest(row as SenderTruthRow)
  );
  const [parentTruth, childTruth] = await Promise.all([
    accountTruth(ownerId, fixtureCount, truthPageSize(apiCap)),
    senderTruth(fixtureCount, truthPageSize(apiCap)),
  ]);
  // Seed validity is proven before sync, so a guard/setup failure is not
  // counted as the #255 Red.
  expect(parentTruth).toEqual(expectedParentRows);
  expect(childTruth).toEqual(expectedChildRows);
  expect(
    parentTruth.every(
      (row) => row.balance === 0 && row.financialRevision === "0"
    )
  ).toBe(true);
  return { expectedParentRows, expectedChildRows };
}
describeIssue255(
  "issue #255 ordinary pull cap reproduction against dedicated local Supabase",
  () => {
    beforeAll(async () => {
      const config = requireConfig();
      installMemorySecureStore();
      adminClient = createClient<SupabaseDatabase>(
        config.supabaseUrl,
        config.serviceRoleKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        }
      );
      const supabaseModule = jest.requireActual<
        typeof import("../../services/supabase")
      >("../../services/supabase");
      const syncModule = jest.requireActual<
        typeof import("../../services/sync")
      >("../../services/sync");
      appClient = supabaseModule.supabase;
      syncDatabase = syncModule.syncDatabase;
      const result = await appClient.auth.signInWithPassword({
        email: config.email,
        password: config.password,
      });
      if (result.error) fail("ISSUE255_SETUP_AUTH_FAILED");
      if (result.data.user?.id !== config.expectedUserId) {
        fail("ISSUE255_SETUP_AUTH_USER_MISMATCH");
      }
      userId = result.data.user.id;
    });
    afterAll(async () => {
      if (appClient !== null) {
        await appClient.auth.signOut({ scope: "local" });
      }
      userId = null;
      appClient = null;
      adminClient = null;
      syncDatabase = null;
      verifiedApiCap = null;
    });
    it("pulls all 37 REAL_ESTATE assets in the under-cap control", async () => {
      const ownerId = requireUserId();
      const apiCap = await verifiedCap();
      if (apiCap <= CONTROL_COUNT) fail("ISSUE255_CONTROL_IS_NOT_UNDER_CAP");
      let database: Database | null = null;
      const { expected, fixtureIds } = await seedAssets(
        CONTROL_ASSET_NAMESPACE,
        CONTROL_ASSET_PREFIX,
        CONTROL_COUNT,
        ownerId,
        apiCap
      );
      try {
        await settleServerTimestamp();
        database = await createLocalDatabase();
        await runSync(database);
        const applied = await localAssets(database, CONTROL_ASSET_PREFIX);
        const persistedCheckpoint = await checkpoint(database);
        const diff = diffManifests(expected, applied);
        recordEvidence("control-37", {
          actualCap: apiCap,
          checkpointAfter: persistedCheckpoint,
          expected,
          applied,
        });
        console.log(`issue255:control-37 ${JSON.stringify(diff)}`);
        expect(applied).toHaveLength(CONTROL_COUNT);
        expectManifests(applied, expected);
        expect(persistedCheckpoint).toBeGreaterThan(0);
      } finally {
        if (database !== null) await disposeDatabase(database);
        await deleteByIds("assets", fixtureIds, ownerId);
      }
    });
    it("reproduces the 2,501-row initial pull with independently verified truth, actual API cap and persisted checkpoint", async () => {
      const ownerId = requireUserId();
      const knownCap = await verifiedCap();
      let database: Database | null = null;
      const { expected, fixtureIds } = await seedAssets(
        LARGE_ASSET_NAMESPACE,
        LARGE_ASSET_PREFIX,
        LARGE_COUNT,
        ownerId,
        knownCap
      );
      try {
        const actualCap = await measureActualApiCap(
          ownerId,
          LARGE_ASSET_PREFIX
        );
        if (actualCap !== knownCap) fail("ISSUE255_API_CAP_CHANGED_DURING_RUN");
        await settleServerTimestamp();
        database = await createLocalDatabase();
        // No checkpoint may exist before the first sync on a fresh store.
        // The adapter reports a missing key as null on this platform.
        expect(
          !(await database.adapter.getLocal(WATERMELON_CHECKPOINT_KEY))
        ).toBe(true);
        await runSync(database);
        const applied = await localAssets(database, LARGE_ASSET_PREFIX);
        const persistedCheckpoint = await checkpoint(database);
        const diff = diffManifests(expected, applied);
        recordEvidence("initial-2501", {
          actualCap,
          checkpointBefore: null,
          checkpointAfter: persistedCheckpoint,
          expected,
          applied,
        });
        console.log(`issue255:initial-2501 ${JSON.stringify(diff)}`);
        expect({
          actualCap,
          expectedCount: LARGE_COUNT,
          appliedCount: applied.length,
          checkpointPersisted: persistedCheckpoint > 0,
        }).toEqual({
          actualCap,
          expectedCount: LARGE_COUNT,
          appliedCount: LARGE_COUNT,
          checkpointPersisted: true,
        });
        expectManifests(applied, expected);
      } finally {
        if (database !== null) await disposeDatabase(database);
        await deleteByIds("assets", fixtureIds, ownerId);
      }
    });
    it("runs an unchanged second sync before asserting omitted old rows are not hidden behind the checkpoint", async () => {
      const ownerId = requireUserId();
      const apiCap = await verifiedCap();
      let database: Database | null = null;
      const { expected, fixtureIds } = await seedAssets(
        LARGE_ASSET_NAMESPACE,
        LARGE_ASSET_PREFIX,
        LARGE_COUNT,
        ownerId,
        apiCap
      );
      try {
        await settleServerTimestamp();
        database = await createLocalDatabase();
        await runSync(database);
        const firstApplied = await localAssets(database, LARGE_ASSET_PREFIX);
        const firstCheckpoint = await checkpoint(database);
        // No backend mutation occurs between these two real syncDatabase calls.
        await runSync(database);
        const secondApplied = await localAssets(database, LARGE_ASSET_PREFIX);
        const secondCheckpoint = await checkpoint(database);
        const firstDiff = diffManifests(expected, firstApplied);
        const secondDiff = diffManifests(expected, secondApplied);
        recordEvidence("second-sync", {
          actualCap: apiCap,
          checkpointBefore: firstCheckpoint,
          checkpointAfter: secondCheckpoint,
          expected,
          firstApplied,
          secondApplied,
        });
        console.log(`issue255:second-sync-first ${JSON.stringify(firstDiff)}`);
        console.log(
          `issue255:second-sync-second ${JSON.stringify(secondDiff)}`
        );
        expect({
          expectedCount: LARGE_COUNT,
          firstAppliedCount: firstApplied.length,
          secondAppliedCount: secondApplied.length,
          firstCheckpointPersisted: firstCheckpoint > 0,
          secondCheckpointDidNotRegress: secondCheckpoint >= firstCheckpoint,
        }).toEqual({
          expectedCount: LARGE_COUNT,
          firstAppliedCount: LARGE_COUNT,
          secondAppliedCount: LARGE_COUNT,
          firstCheckpointPersisted: true,
          secondCheckpointDidNotRegress: true,
        });
        expectManifests(firstApplied, expected);
        expectManifests(secondApplied, expected);
      } finally {
        if (database !== null) await disposeDatabase(database);
        await deleteByIds("assets", fixtureIds, ownerId);
      }
    });
    it("pulls cap+1 zero-balance revision-zero accounts and every owned account_sms_senders child through real routing", async () => {
      const ownerId = requireUserId();
      const apiCap = await verifiedCap();
      const fixtureCount = apiCap + 1;
      if (fixtureCount > LARGE_COUNT) fail("ISSUE255_CHILD_COUNT_OUT_OF_RANGE");
      const parentIds = ids(ACCOUNT_NAMESPACE, LARGE_COUNT);
      const childIds = ids(SENDER_NAMESPACE, LARGE_COUNT);
      await deleteByIds("account_sms_senders", childIds);
      await deleteByIds("accounts", parentIds, ownerId);
      let database: Database | null = null;
      try {
        const { expectedParentRows, expectedChildRows } =
          await seedAccountsAndSenders(fixtureCount, ownerId, apiCap);
        await settleServerTimestamp();
        database = await createLocalDatabase();
        await runSync(database);
        const appliedParents = await localAccounts(database);
        const appliedChildren = await localSenders(database);
        const persistedCheckpoint = await checkpoint(database);
        const parentDiff = diffManifests(expectedParentRows, appliedParents);
        const childDiff = diffManifests(expectedChildRows, appliedChildren);
        recordEvidence("cap-plus-1", {
          actualCap: apiCap,
          checkpointBefore: null,
          checkpointAfter: persistedCheckpoint,
          expectedParents: expectedParentRows,
          appliedParents,
          expectedChildren: expectedChildRows,
          appliedChildren,
        });
        console.log(
          `issue255:cap-plus-1-parents ${JSON.stringify(parentDiff)}`
        );
        console.log(
          `issue255:cap-plus-1-children ${JSON.stringify(childDiff)}`
        );
        expect({
          apiCap,
          expectedParentCount: fixtureCount,
          appliedParentCount: appliedParents.length,
          expectedChildCount: fixtureCount,
          appliedChildCount: appliedChildren.length,
          checkpointPersisted: persistedCheckpoint > 0,
        }).toEqual({
          apiCap,
          expectedParentCount: fixtureCount,
          appliedParentCount: fixtureCount,
          expectedChildCount: fixtureCount,
          appliedChildCount: fixtureCount,
          checkpointPersisted: true,
        });
        expectManifests(appliedParents, expectedParentRows);
        expectManifests(appliedChildren, expectedChildRows);
      } finally {
        if (database !== null) await disposeDatabase(database);
        await deleteByIds("account_sms_senders", childIds);
        await deleteByIds("accounts", parentIds, ownerId);
      }
    });
  }
);
