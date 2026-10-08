/**
 * Owned Supabase + real SQLite/SDK integration; invoked only by the guarded runner.
 * No production receipt API is assumed. Old installation baseline uses SDK synchronize.
 * Financial fixture is immutable and retained; exact ordinary IDs are cleaned.
 * Network and financial/sync behavior are real. Native SQLite dispatch/storage only are adapted.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "../../..");
const runtime = JSON.parse(process.env.ISSUE255_SYNC_CONFIG_JSON || "{}");
process.env.EXPO_PUBLIC_SUPABASE_URL = runtime.supabaseUrl;
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = runtime.anonKey;
process.env.EXPO_PUBLIC_SUPABASE_AUTH_STORAGE_KEY = "issue255-historical-live";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", () =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.unmock("@nozbe/watermelondb/sync");
jest.mock("@monyvi/db", () => {
  const path = require("node:path");
  const root = path.resolve(__dirname, "../../..");
  const { Database, Model } = jest.requireActual("@nozbe/watermelondb");
  const Adapter = jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite"
  ).default;
  const { schema } = jest.requireActual(
    path.join(root, "packages/db/src/schema")
  );
  const models = {};
  for (const name of [
    "Account",
    "AccountFinancialEffect",
    "FinancialActionGroup",
    "Transaction",
    "Transfer",
    "RecurringPayment",
    "Asset",
    "AssetMetal",
    "MetalHoldingState",
    "MetalActionEvidence",
    "MetalLifecycleEvent",
    "MetalRateReference",
    "Profile",
  ]) {
    models[name] = jest.requireActual(
      path.join(root, "packages/db/src/models", name)
    )[name];
  }
  const byTable = new Map(
    Object.values(models).map((model) => [model.table, model])
  );
  const modelClasses = Object.keys(schema.tables).map((table) => {
    class FixtureModel extends Model {
      static table = table;
    }
    return byTable.get(table) || FixtureModel;
  });
  const adapter = new Adapter({
    schema,
    dbName: "file:issue255-historical-live?mode=memory&cache=shared",
  });
  return {
    ...models,
    schema,
    database: new Database({ adapter, modelClasses }),
    __adapter: adapter,
  };
});
jest.mock("expo-crypto", () => {
  const crypto = require("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: async (_algorithm, value) =>
      crypto.createHash("sha256").update(value).digest("hex"),
    randomUUID: () => crypto.randomUUID(),
  };
});

const { createClient } = require("@supabase/supabase-js");
const { synchronize } = require("@nozbe/watermelondb/sync");
const { database, __adapter: adapter } = require("@monyvi/db");
const { assetRows, assetManifest, localAssets, ids } = require(
  path.join(
    root,
    "apps/mobile/__tests__/services/issue255-sync-reproduction/manifests"
  )
);
const store = require("expo-secure-store");
const storage = new Map();
store.getItemAsync.mockImplementation(async (key) => storage.get(key) ?? null);
store.setItemAsync.mockImplementation(async (key, value) => {
  storage.set(key, value);
});
store.deleteItemAsync.mockImplementation(async (key) => {
  storage.delete(key);
});
const { supabase: app } = jest.requireActual(
  path.join(root, "apps/mobile/services/supabase")
);
const { syncDatabase } = jest.requireActual(
  path.join(root, "apps/mobile/services/sync")
);
const { canonicalizeFinancialActionEnvelope, hashFinancialActionEnvelope } =
  jest.requireActual(path.join(root, "packages/logic/src/financial-actions"));
const admin = createClient(runtime.supabaseUrl, runtime.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const owner = runtime.expectedUserId;
const prefix = "issue255-history-live-";
const capNamespace = 0x25510001;
const historyNamespace = 0x25510002;
const updateNamespace = 0x25510003;
const deleteNamespace = 0x25510004;
const createNamespace = 0x25510005;
const ACCOUNT = ids(0x25510006, 1)[0];
const ACTION = ids(0x25510007, 1)[0];
const EFFECT = ids(0x25510008, 1)[0];
// Hard-delete journal IDs remain retained, so each producer replacement uses a fresh identity.
const [OLD, REPLACEMENT, NEXT] = Array.from({ length: 3 }, () =>
  crypto.randomUUID()
);
const cleanup = { assets: [], daily_snapshot_assets: [REPLACEMENT, NEXT] };
const evidence = {
  owner,
  retained: { account: ACCOUNT, action: ACTION, effect: EFFECT },
  retainedSnapshotJournalIds: [REPLACEMENT, NEXT],
  stages: [],
};
let cap;

function save() {
  fs.writeFileSync(
    path.join(process.env.ISSUE255_EVIDENCE_DIR, "live-proof.json"),
    JSON.stringify(evidence, null, 2)
  );
}
async function checked(query, code) {
  const result = await query;
  if (result.error) throw new Error(code + ":" + result.error.code);
  return result;
}
async function batches(values, operation) {
  for (let offset = 0; offset < values.length; offset += 100) {
    await operation(values.slice(offset, offset + 100));
  }
}
async function remove(table, recordIds) {
  await batches(recordIds, (batch) =>
    checked(
      admin.from(table).delete().eq("user_id", owner).in("id", batch),
      "fixture_cleanup"
    )
  );
}
async function seedAssets(namespace, label, count) {
  const rows = assetRows(namespace, prefix + label, count, owner);
  cleanup.assets.push(...rows.map((row) => row.id));
  await remove(
    "assets",
    rows.map((row) => row.id)
  );
  await batches(rows, (batch) =>
    checked(admin.from("assets").insert(batch), "asset_seed")
  );
  return rows;
}
async function watermark() {
  await new Promise((resolve) => setTimeout(resolve, 5));
  const { data } = await checked(
    app.rpc("pull_market_rate_snapshots_page_v2"),
    "market_barrier"
  );
  expect(typeof data.upperWatermark).toBe("string");
  const timestamp = Date.parse(data.upperWatermark);
  expect(Number.isFinite(timestamp)).toBe(true);
  return timestamp;
}
async function checkpoint() {
  return Number(await database.adapter.getLocal("__watermelon_last_pulled_at"));
}
async function rawRows(table) {
  return (await database.get(table).query().fetch()).map((record) => ({
    ...record._raw,
  }));
}
async function snapshotSeed(id) {
  await checked(
    admin.from("daily_snapshot_assets").insert({
      id,
      user_id: owner,
      snapshot_date: "1998-01-25",
      total_assets_usd: 1234.5,
    }),
    "snapshot_seed"
  );
}
async function truthAssets(label) {
  const all = [];
  const size = Math.min(250, cap - 1);
  for (let offset = 0; ; offset += size) {
    const { data } = await checked(
      admin
        .from("assets")
        .select("*")
        .eq("user_id", owner)
        .like("name", prefix + label + "%")
        .order("id")
        .range(offset, offset + size - 1),
      "truth_page"
    );
    all.push(...data);
    if (data.length < size) return all;
  }
}
function sorted(values) {
  return [...values].sort((left, right) => left.id.localeCompare(right.id));
}
async function assertAssets(label) {
  const truth = await truthAssets(label);
  const expected = truth.filter((row) => !row.deleted).map(assetManifest);
  const actual = await localAssets(database, prefix + label);
  expect(sorted(actual)).toEqual(sorted(expected));
  return expected.length;
}
async function acceptedFinancialFixture() {
  const occurredAt = "2026-10-07T00:00:00.000Z";
  const envelope = canonicalizeFinancialActionEnvelope({
    accountGuards: [{ accountId: ACCOUNT, expectedRevision: "0" }],
    actionId: ACTION,
    domain: "accounts",
    domainReferenceId: ACCOUNT,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "create",
    occurredAt,
    payload: {
      accountEffects: [
        {
          accountId: ACCOUNT,
          amountMinorUnits: "1000",
          currency: "EGP",
          effectId: EFFECT,
        },
      ],
      domainMutation: {
        records: [
          {
            after: {
              createdAt: occurredAt,
              currency: "EGP",
              deleted: false,
              id: ACCOUNT,
              institutionId: null,
              isDefault: false,
              name: prefix + "retained-account",
              openingBalanceMinorUnits: "1000",
              providerDisplayName: null,
              targetBalanceMinorUnits: null,
              type: "CASH",
            },
            entity: "account",
            expectedUpdatedAt: null,
            mode: "create",
          },
        ],
      },
      domainRecordRefs: [ACCOUNT],
      operationCode: "account.create",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: owner,
  });
  const hashed = await hashFinancialActionEnvelope(envelope, {
    digestUtf8: async (text) =>
      crypto.createHash("sha256").update(text, "utf8").digest("hex"),
  });
  await checked(
    app.rpc("apply_account_financial_action_v1", {
      p_payload_json: hashed.canonicalText,
      p_payload_hash: hashed.payloadHash,
    }),
    "financial_acceptance"
  );
  const { data: account } = await checked(
    admin
      .from("accounts")
      .select("id,balance,financial_revision")
      .eq("user_id", owner)
      .eq("id", ACCOUNT)
      .single(),
    "financial_account_truth"
  );
  expect(String(account.financial_revision)).toBe("1");
  expect(Number(account.balance)).toBe(10);
}
async function assertFinancial() {
  const { data: remote } = await checked(
    admin
      .from("account_financial_effects")
      .select(
        "id,amount_text:amount_minor_units::text,revision_text:accepted_account_revision::text,compensated_at"
      )
      .eq("user_id", owner)
      .eq("id", EFFECT)
      .single(),
    "effect_truth"
  );
  const effect = (await rawRows("account_financial_effects")).find(
    (row) => row.id === EFFECT
  );
  expect(effect).toBeDefined();
  expect(effect.amount_minor_units).toBe(remote.amount_text);
  expect(effect.accepted_account_revision).toBe(remote.revision_text);
  expect(effect.compensated_at).toBeNull();
  const account = (await rawRows("accounts")).find((row) => row.id === ACCOUNT);
  expect(account.balance).toBe(10);
  expect(account.financial_revision).toBe("1");
  expect(effect.user_id).toBe(owner);
}
beforeAll(async () => {
  if (process.env.ISSUE255_SYNC_REPRO !== "1")
    throw new Error("Guarded launcher required");
  await adapter.initializingPromise;
  const login = await app.auth.signInWithPassword({
    email: runtime.email,
    password: runtime.password,
  });
  if (login.error || login.data.user?.id !== owner)
    throw new Error("Synthetic owner mismatch");
  await remove("daily_snapshot_assets", cleanup.daily_snapshot_assets);
  const probe = await seedAssets(capNamespace, "cap-", 2501);
  const result = await checked(
    app
      .from("assets")
      .select("id", { count: "exact" })
      .eq("user_id", owner)
      .like("name", prefix + "cap-%")
      .order("id")
      .range(0, 2500),
    "cap_probe"
  );
  expect(result.count).toBe(2501);
  cap = result.data.length;
  expect(cap).toBeGreaterThan(1);
  expect(cap).toBeLessThan(2501);
  evidence.actualApiCap = cap;
  await remove(
    "assets",
    probe.map((row) => row.id)
  );
  save();
}, 180000);
afterAll(async () => {
  try {
    await remove("assets", cleanup.assets);
    await remove("daily_snapshot_assets", cleanup.daily_snapshot_assets);
    evidence.ordinaryCleanup = "completed";
  } finally {
    await database.write(() => database.unsafeResetDatabase());
    await app.auth.signOut();
    save();
  }
}, 180000);

test("automatic same-schema recovery hydrates pre-checkpoint rows/effects and replaces pre-journal snapshot identities", async () => {
  const historical = await seedAssets(historyNamespace, "old-", cap + 1);
  await acceptedFinancialFixture();
  await snapshotSeed(REPLACEMENT);
  const H = await watermark();
  const { data: remote } = await checked(
    admin
      .from("assets")
      .select("updated_at")
      .eq("user_id", owner)
      .eq("id", historical[0].id)
      .single(),
    "historical_age"
  );
  expect(Date.parse(remote.updated_at)).toBeLessThan(H);
  await synchronize({
    database,
    pullChanges: async () => ({
      timestamp: H,
      changes: {
        daily_snapshot_assets: {
          created: [
            {
              id: OLD,
              user_id: owner,
              snapshot_date: "1998-01-25",
              total_assets_usd: 999,
              created_at: H - 10000,
            },
          ],
          updated: [],
          deleted: [],
        },
      },
    }),
  });
  await database.adapter.setLocal("__monyvi_sync_owner_user_id", owner);
  expect(await checkpoint()).toBe(H);
  expect(await localAssets(database, prefix + "old-")).toEqual([]);
  expect(
    (await rawRows("account_financial_effects")).find(
      (row) => row.id === EFFECT
    )
  ).toBeUndefined();
  await syncDatabase(database);
  expect(await assertAssets("old-")).toBe(cap + 1);
  await assertFinancial();
  const snapshotIds = (await rawRows("daily_snapshot_assets")).map(
    (row) => row.id
  );
  expect(snapshotIds).toContain(REPLACEMENT);
  expect(snapshotIds).not.toContain(OLD);
  expect(await checkpoint()).toBeGreaterThanOrEqual(H);
  await syncDatabase(database);
  await assertAssets("old-");
  await assertFinancial();
  evidence.stages.push({
    name: "historical-recovery",
    baseline: H,
    rows: cap + 1,
    checkpoint: await checkpoint(),
    sameSchema: true,
    productionForceFullSync: false,
  });
  save();
}, 300000);

test("incremental changes exceed the actual cap; unchanged pulls do not replay finance; real snapshot replacement is journaled", async () => {
  const count = cap + 1;
  const updates = await seedAssets(updateNamespace, "update-", count);
  const deletions = await seedAssets(deleteNamespace, "delete-", count);
  await syncDatabase(database);
  await assertAssets("update-");
  await assertAssets("delete-");
  const before = await checkpoint();
  await batches(
    updates.map((row) => row.id),
    (batch) =>
      checked(
        admin
          .from("assets")
          .update({ purchase_price: 34567, purchase_price_decimal: "34567" })
          .eq("user_id", owner)
          .in("id", batch),
        "incremental_update"
      )
  );
  await batches(
    deletions.map((row) => row.id),
    (batch) =>
      checked(
        admin
          .from("assets")
          .update({ deleted: true })
          .eq("user_id", owner)
          .in("id", batch),
        "incremental_delete"
      )
  );
  await seedAssets(createNamespace, "create-", count);
  await remove("daily_snapshot_assets", [REPLACEMENT]);
  await snapshotSeed(NEXT);
  await watermark();
  await syncDatabase(database);
  expect(await assertAssets("update-")).toBe(count);
  expect(await assertAssets("delete-")).toBe(0);
  expect(await assertAssets("create-")).toBe(count);
  const snapshotIds = (await rawRows("daily_snapshot_assets")).map(
    (row) => row.id
  );
  expect(snapshotIds).toContain(NEXT);
  expect(snapshotIds).not.toContain(REPLACEMENT);
  await assertFinancial();
  expect(await checkpoint()).toBeGreaterThan(before);
  await syncDatabase(database);
  await assertAssets("update-");
  await assertAssets("delete-");
  await assertAssets("create-");
  await assertFinancial();
  evidence.stages.push({
    name: "incremental-create-update-delete",
    countPerOperation: count,
    lowerCheckpoint: before,
    checkpoint: await checkpoint(),
  });
  save();
}, 300000);
