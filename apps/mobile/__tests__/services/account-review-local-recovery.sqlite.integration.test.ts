/**
 * #395 T043/T053 physical tests FIRST. Real SQLite and production Save/foundation
 * boundaries; missing snapshot construction/capture must fail behaviorally.
 */
import { appSchema, tableSchema, Database, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  FinancialActionGroup,
  SmsReviewDraftItem,
} from "@monyvi/db";
import { schema } from "../../../../packages/db/src/schema";
import { migrations } from "../../../../packages/db/src/migrations";
import type {
  AccountReviewLocalSaveSnapshot,
} from "../../../../packages/logic/src/financial-actions/review-local-recovery";
import type {
  FinancialActionLinkedOperationPlan,
  FinancialActionLinkedOperationPreparedOwnershipInput,
} from "../../services/financial-action-foundation-contracts";
import { createFinancialActionFoundationRepository } from
  "../../services/financial-action-foundation-repository";
import { createAccountReviewFinancialRegistry } from
  "../../services/account-review-financial-command-service";
import {
  createFinancialActionSyncService,
  type FinancialActionSyncDependencies,
} from "../../services/financial-action-sync-service";
import { DEDICATED_SYNC_TABLES, SYNCABLE_TABLES } from
  "../../services/sync/config";
import {
  constructReviewSave,
  type SaveConstruction,
} from "../../services/account-review-save-plan";
import { freezeSelectedAccountReview } from
  "../../services/account-review-save-preparation";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "../../services/user-data-access";
import {
  LEDGER_MODEL_CLASSES,
  injectMidBatchDuplicate,
  ledgerState,
  physicalSaveLedgerSnapshot,
  seedLedger,
  seedSavedFingerprint,
} from "./account-review-save-sqlite-test-helpers";
import {
  ACTION, BANK, FINGERPRINT_B, OWNER, SESSION,
  makeSaveFixture, testUuid, type SaveFixture,
} from "./account-review-save-test-fixtures";
import {
  database, hashProvider, resetRecoverySqlite,
  cloneRecoverySqlite, ownedPhysicalRows, readPrivateOwnedRoot,
  requireActionRoot, saveReview, seedBoundSmsReview, setActiveReview,
} from "./account-review-local-recovery-test-harness";


// Register real Node SQLite BEFORE Jest evaluates production service imports.
// This is the same per-suite mock boundary as the passing Save SQLite suites.
/**
 * TEST-ONLY Node SHA-256 bridge for expo-crypto's Jest stub. The real Save
 * hashProvider, reducers, reconciliation, SQLite and immutable root hashing
 * remain intact; only the unavailable native crypto primitive is replaced.
 * Deterministic canonical v4 IDs also avoid non-UUID native Jest randomUUIDs.
 */
let mockCryptoUuidCounter = 0;
jest.mock("expo-crypto", () => {
  const { createHash } = jest.requireActual<typeof import("node:crypto")>(
    "node:crypto"
  );
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (algorithm: string, input: string): Promise<string> => {
      if (algorithm !== "SHA-256")
        return Promise.reject(new Error("unsupported_test_crypto_algorithm"));
      return Promise.resolve(createHash("sha256").update(input, "utf8").digest("hex"));
    },
    randomUUID: (): string => {
      mockCryptoUuidCounter += 1;
      return "e1000000-0000-4000-8000-" +
        String(mockCryptoUuidCounter).padStart(12, "0");
    },
  };
});

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", (): Readonly<Record<string, unknown>> => {
  const wm = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const models = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models").LEDGER_MODEL_CLASSES;
  const adapter = new Adapter({ schema });
  const database = new wm.Database({ adapter, modelClasses: models });
  return {
    database, __adapter: adapter, schema, Q: wm.Q,
    ...Object.fromEntries(models.map((model) => [model.name, model])),
  };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> =>
    Promise.resolve("018f0c7a-1234-4abc-8def-000000000001"),
  supabase: {},
}));

const PRIVATE_COLUMN = "local_recovery_snapshot_json";
let oldDatabaseSequence = 0;

function priorVersionSchema(): ReturnType<typeof appSchema> {
  const tables = Object.values(schema.tables).map((table) => {
    if (table.name !== "financial_action_groups") return table;
    return tableSchema({
      name: table.name,
      unsafeSql: table.unsafeSql,
      columns: table.columnArray.filter((col) => col.name !== PRIVATE_COLUMN),
    });
  });
  return appSchema({ version: 30, tables });
}

function prepareLegacyActionRoot(db: Database): FinancialActionGroup {
  return db.get<FinancialActionGroup>("financial_action_groups")
    .prepareCreate((root): void => {
      root._raw.id = testUuid(770);
      root.actionId = ACTION;
      root.userId = OWNER;
      root.domain = "transactions";
      root.kind = "review_batch_save";
      root.domainReferenceId = testUuid(771);
      root.accountGuardsJson = "[]";
      root.payloadHash = "a".repeat(64);
      root.payloadJson = '{"legacy":true}';
      root.state = "local_complete";
      root.deleted = false;
    });
}

async function upgradeLegacySqlite(): Promise<{
  readonly database: Database;
  readonly rawAdapter: SQLiteAdapter;
}> {
  const name = "file:account-review-local-upgrade-" +
    String(++oldDatabaseSequence) + "?mode=memory&cache=shared";
  const oldAdapter = new SQLiteAdapter({
    schema: priorVersionSchema(), dbName: name,
  });
  await oldAdapter.initializingPromise;
  const oldDb = new Database({
    adapter: oldAdapter, modelClasses: LEDGER_MODEL_CLASSES,
  });
  await seedLedger(oldDb);
  await oldDb.write(async (): Promise<void> => {
    await oldDb.batch(prepareLegacyActionRoot(oldDb));
  });
  const upgradedAdapter = new SQLiteAdapter({
    schema, migrations, dbName: name,
  });
  await upgradedAdapter.initializingPromise;
  return {
    database: new Database({
      adapter: upgradedAdapter, modelClasses: LEDGER_MODEL_CLASSES,
    }),
    rawAdapter: upgradedAdapter,
  };
}

function tableForEntity(
  entity: AccountReviewLocalSaveSnapshot["createdEntityRefs"][number]["entity"]
): string {
  switch (entity) {
    case "account": return "accounts";
    case "bank_details": return "bank_details";
    case "account_sms_sender": return "account_sms_senders";
    case "transaction": return "transactions";
    case "transfer": return "transfers";
  }
}

async function assertPhysicalCreatedRefs(
  snapshot: AccountReviewLocalSaveSnapshot,
  db: Database
): Promise<void> {
  expect(snapshot.createdEntityRefs.length).toBeGreaterThan(0);
  for (const ref of snapshot.createdEntityRefs) {
    const records = await ownedPhysicalRows(db, tableForEntity(ref.entity));
    expect(records.some((model) => model.id === ref.id)).toBe(true);
    expect(ref.expectedPostimageHash).toMatch(/^[0-9a-f]{64}$/);
  }
}

async function createFailingPrivatePlan(fixture: SaveFixture): Promise<{
  readonly envelope: NonNullable<SaveConstruction["envelope"]>;
  readonly plan: FinancialActionLinkedOperationPlan;
  readonly stages: string[];
}> {
  const frozen = freezeSelectedAccountReview(fixture);
  const scope = await getCurrentUserDataScope();
  const built = await constructReviewSave(frozen, {
    database, hashProvider,
    assertOwner: (): Promise<void> => assertExpectedCurrentUser(OWNER),
    loadCurrentSession: (): Promise<typeof fixture.session> =>
      Promise.resolve(fixture.session),
  }, scope);
  if (!built.plan || !built.envelope)
    throw new Error("expected_actual_financial_linked_plan");
  const original = built.plan;
  const stages: string[] = [];
  const plan: FinancialActionLinkedOperationPlan & {
    readonly buildLocalRecoverySnapshot: (
      input: FinancialActionLinkedOperationPreparedOwnershipInput
    ) => Promise<AccountReviewLocalSaveSnapshot>;
  } = {
    ...original,
    assertPreparedOwnership: async (input): Promise<void> => {
      await original.assertPreparedOwnership(input);
      stages.push("validated");
    },
    buildLocalRecoverySnapshot: (input): Promise<AccountReviewLocalSaveSnapshot> => {
      stages.push("builder");
      expect(input.userId).toBe(OWNER);
      expect(input.cachedPreimages.length).toBeGreaterThan(0);
      expect(input.preparedPostimages.length).toBeGreaterThan(0);
      expect(input.preparedPostimages.every((row) =>
        Object.isFrozen(row.raw)
      )).toBe(true);
      return Promise.reject(new Error("intentional_private_builder_failure"));
    },
  };
  return { envelope: built.envelope, plan, stages };
}

beforeEach(async (): Promise<void> => {
  mockCryptoUuidCounter = 0;
  await resetRecoverySqlite();
});

describe("#395 T053 actual Watermelon v30 to v31 private-column upgrade", () => {
  it("L01 preserves legacy root, account rows and null private value over actual migration and restart", async () => {
    const { database: upgraded, rawAdapter } = await upgradeLegacySqlite();
    const existing = await upgraded.get<FinancialActionGroup>(
      "financial_action_groups"
    ).find(testUuid(770));
    expect(existing.actionId).toBe(ACTION);
    expect(existing.payloadHash).toBe("a".repeat(64));
    expect(existing.localRecoverySnapshotJson).toBeNull();
    const accounts = await upgraded.get<Account>("accounts").query().fetch();
    expect(accounts).toHaveLength(3);
    // Database.adapter is already a compat wrapper. Clone the raw adapter.
    const restartedAdapter = await rawAdapter.testClone();
    const reopened = new Database({
      adapter: restartedAdapter, modelClasses: LEDGER_MODEL_CLASSES,
    });
    const afterRestart = await reopened.get<FinancialActionGroup>(
      "financial_action_groups"
    ).find(testUuid(770));
    expect(afterRestart.localRecoverySnapshotJson).toBeNull();
    expect(afterRestart.payloadJson).toBe('{"legacy":true}');
    expect(await reopened.get<Account>("accounts").query().fetch()).toHaveLength(3);
  });
});

describe("#395 T043 actual selected Save device-private evidence", () => {
  it.each(["sms-new-bank", "sms-new-wallet"] as const)(
    "L02 %s stores exact nine-key owned SMS preimages with real created domain children",
    async (scenario): Promise<void> => {
      const fixture = makeSaveFixture(scenario);
      await seedBoundSmsReview(fixture);
      const batchWitness = jest.spyOn(database, "batch");
      try {
        await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
        const linked = batchWitness.mock.calls.find((call) => {
          const operations = call[0];
          return Array.isArray(operations) && operations.some(
            (model: Model) => model.table === "financial_action_groups"
          );
        });
        const operations = linked?.[0];
        if (!Array.isArray(operations))
          throw new Error("missing_single_atomic_adapter_batch");
        const rootOperation = operations.find(
          (model: Model) => model.table === "financial_action_groups"
        );
        if (!rootOperation) throw new Error("missing_real_root_operation");
        const privateColumn: unknown = Object.entries(rootOperation._raw)
          .find(([name]) => name === PRIVATE_COLUMN)?.[1];
        expect(privateColumn).toEqual(expect.any(String));
        expect(operations.map((model: Model) => model.table)).toEqual(
          expect.arrayContaining([
            "financial_action_groups", "accounts",
            "account_financial_effects", "sms_review_draft_items",
          ])
        );
      } finally {
        batchWitness.mockRestore();
      }
      const fresh = await cloneRecoverySqlite();
      const root = await requireActionRoot(fresh);
      const privateValue = root.localRecoverySnapshotJson;
      expect(privateValue).toEqual(expect.any(String));
      const snapshot = readPrivateOwnedRoot(root);
      expect(Object.keys(snapshot).sort()).toEqual([
        "actionId", "createdEntityRefs", "defaultDependencyActionIds",
        "defaultPreimages", "ownerId", "queuePreimage", "sessionId",
        "smsDrafts", "version",
      ]);
      expect(snapshot).toMatchObject({
        actionId: fixture.intent.actionId,
        ownerId: OWNER, sessionId: SESSION,
        queuePreimage: { id: SESSION, userId: OWNER },
      });
      expect(snapshot.smsDrafts.length).toBeGreaterThan(0);
      expect(snapshot.createdEntityRefs.map((ref) => ref.id).sort()).toEqual(
        fixture.intent.plannedEntityIds.map((ref) => ref.id).sort()
      );
      await assertPhysicalCreatedRefs(snapshot, fresh);
      expect((await ledgerState(fresh)).counts).toMatchObject({
        actions: 1, draftItems: 0,
      });
    }
  );

  it("L03 persists actual original SMS draft numeric state as canonical strings", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    const drafts = await database.get<SmsReviewDraftItem>(
      "sms_review_draft_items"
    ).query().fetch();
    const actual = new Map(drafts.map((row) => [
      row.smsFingerprint, { payloadVersion: row.payloadVersion, position: row.position },
    ]));
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const parsed = readPrivateOwnedRoot(await requireActionRoot(await cloneRecoverySqlite()));
    expect(parsed.smsDrafts.filter(
      (draft) => draft.retentionState === "available"
    ).length).toBeGreaterThan(0);
    for (const draft of parsed.smsDrafts) {
      if (draft.retentionState !== "available") continue;
      const original = actual.get(draft.smsFingerprint);
      if (!original) throw new Error("missing_actual_sms_preimage");
      expect(draft.payloadVersion).toBe(String(original.payloadVersion));
      expect(draft.position).toBe(String(original.position));
      expect(Number.isSafeInteger(original.position)).toBe(true);
    }
  });

  it.each(["voice-existing", "voice-cash"] as const)(
    "L04 %s saves strict private evidence without Voice transcript or SMS preimages",
    async (scenario): Promise<void> => {
      const fixture = makeSaveFixture(scenario);
      await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
      const root = await requireActionRoot(await cloneRecoverySqlite());
      const snapshot = readPrivateOwnedRoot(root);
      expect(snapshot.queuePreimage).toBeNull();
      expect(snapshot.smsDrafts).toEqual([]);
      expect(snapshot.createdEntityRefs.length).toBeGreaterThan(0);
      expect(root.localRecoverySnapshotJson).not.toMatch(
        /rawAudio|transcript|audioBytes|smsBody|rawSmsBody/
      );
      expect(root.payloadJson).not.toContain(PRIVATE_COLUMN);
    }
  );

  it("L05 a fresh SQLite clone retains the same authenticated private snapshot", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const original = await requireActionRoot(database);
    const bytes = original.localRecoverySnapshotJson;
    const fresh = await cloneRecoverySqlite();
    const restored = await requireActionRoot(fresh);
    expect(restored).not.toBe(original);
    expect(restored.localRecoverySnapshotJson).toBe(bytes);
    const parsed = readPrivateOwnedRoot(restored);
    expect(parsed.actionId).toBe(ACTION);
    expect(parsed.ownerId).toBe(OWNER);
  });

  it("L06 a genuine SQLite mid-batch failure leaves root, children and private bytes absent", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    const before = await physicalSaveLedgerSnapshot(await cloneRecoverySqlite());
    const cachedBank = await database.get<Account>("accounts").find(BANK);
    const rawBefore = JSON.stringify(cachedBank._raw);
    const release = injectMidBatchDuplicate(database);
    try {
      await expect(saveReview(fixture)).rejects.toThrow();
    } finally {
      release();
    }
    expect(await physicalSaveLedgerSnapshot(await cloneRecoverySqlite()))
      .toEqual(before);
    expect(JSON.stringify(cachedBank._raw)).toBe(rawBefore);
    expect(await ownedPhysicalRows(database, "financial_action_groups"))
      .toHaveLength(0);
  });

  it("L07 optional builder runs after real ownership and before any physical commit", async () => {
    const fixture = makeSaveFixture("voice-existing");
    setActiveReview(fixture);
    const baseline = await physicalSaveLedgerSnapshot(await cloneRecoverySqlite());
    const pending = await createFailingPrivatePlan(fixture);
    const repository = createFinancialActionFoundationRepository({
      database, registry: createAccountReviewFinancialRegistry(),
      getCurrentUserDataScope, assertExpectedCurrentUser,
    });
    await expect(repository.commitFinancialActionGroupLocally({
      envelope: pending.envelope, hashProvider,
      prepareLinkedOperationPlan: (): Promise<FinancialActionLinkedOperationPlan> =>
        Promise.resolve(pending.plan),
    })).rejects.toThrow("intentional_private_builder_failure");
    expect(pending.stages).toEqual(["validated", "builder"]);
    expect(await physicalSaveLedgerSnapshot(await cloneRecoverySqlite()))
      .toEqual(baseline);
    expect(await ownedPhysicalRows(database, "financial_action_groups"))
      .toHaveLength(0);
  });

  it("L08 an all-dedup SMS cleanup does not fabricate financial/private root", async () => {
    const fixture = makeSaveFixture("sms-all-dedup");
    await seedBoundSmsReview(fixture);
    // The canonical sms-all-dedup fixture actually selects only B.
    // Match the real selected source set, then seed one genuinely saved
    // transaction; an unselected A must not be fabricated as selected.
    const selected = fixture.session.rows.flatMap((row) =>
      row.source === "SMS" && row.selected ? [row.sourceFingerprint] : []
    );
    expect(selected).toEqual([FINGERPRINT_B]);
    await seedSavedFingerprint(database, FINGERPRINT_B, "transaction");
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "cleanup_only" });
    const fresh = await cloneRecoverySqlite();
    expect(await ownedPhysicalRows(fresh, "financial_action_groups")).toHaveLength(0);
    expect((await ledgerState(fresh)).counts.draftItems).toBe(0);
  });

  it("L09 uses real dedicated RPC and generic-sync classification without private recovery bytes", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const root = await requireActionRoot(await cloneRecoverySqlite());
    const privateBytes = root.localRecoverySnapshotJson;
    if (typeof privateBytes !== "string")
      throw new Error("missing_durable_private_root_for_rpc");
    const snapshot = readPrivateOwnedRoot(root);
    const available = snapshot.smsDrafts.find(
      (draft) => draft.retentionState === "available"
    );
    if (!available || available.retentionState !== "available")
      throw new Error("missing_actual_sms_preimage_for_privacy");
    const outgoing: Array<
      Parameters<FinancialActionSyncDependencies["invokeAccountFinancialActionRpc"]>[0]
    > = [];
    const foundation = createFinancialActionFoundationRepository({
      database,
      getCurrentUserDataScope,
      assertExpectedCurrentUser,
      registry: createAccountReviewFinancialRegistry(),
    });
    const sync = createFinancialActionSyncService({
      foundationRepository: foundation,
      invokeAccountFinancialActionRpc: (input): Promise<unknown> => {
        outgoing.push(input);
        return Promise.reject(new Error("injected_private_rpc_transport_failure"));
      },
    });
    await expect(sync.syncAction(root.actionId)).rejects.toThrow(
      "injected_private_rpc_transport_failure"
    );
    expect(outgoing).toEqual([{
      payloadHash: root.payloadHash,
      payloadJson: root.payloadJson,
    }]);
    const sent = JSON.stringify(outgoing);
    expect(sent).not.toContain(privateBytes);
    expect(sent).not.toContain(available.payloadJson);
    expect(sent).not.toContain(PRIVATE_COLUMN);
    expect(DEDICATED_SYNC_TABLES.has("financial_action_groups")).toBe(true);
    expect(SYNCABLE_TABLES).not.toContain("financial_action_groups");
    const failed = await requireActionRoot(await cloneRecoverySqlite());
    expect(failed.state).toBe("sync_failed");
    expect(failed.localRecoverySnapshotJson).toBe(privateBytes);
    expect(failed.outcomeJson).toBeNull();
  });
});
