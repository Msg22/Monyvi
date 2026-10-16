/**
 * #395 T044 new, tests-FIRST physical T049-T051 recovery coverage.
 *
 * Real SQLite adapter + real Save/foundation/reconciliation/namespace/retention
 * services. Only the native SQLite dispatcher, DB-module wiring and remote
 * authentication/transport boundary are substituted by the test harness.
 * Deliberately RED against missing downstream private-root recovery behavior.
 */
import { Q, type Database } from "@nozbe/watermelondb";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  AccountFinancialEffect,
  BankDetails,
  FinancialActionGroup,
  SmsReviewDraftItem,
  SmsReviewQueue,
} from "@monyvi/db";
import {
  createFinancialActionSyncService,
  type FinancialActionSyncDependencies,
} from "../../services/financial-action-sync-service";
import {
  productionFinancialActionReconciliationService,
} from "../../services/financial-action-reconciliation-production";
import { cleanupExpiredSmsReviewDrafts } from
  "../../services/sms-review-draft-cleanup-service";
import { getSmsReviewDraftExpiryCutoff } from
  "../../services/sms-review-draft-retention";
import { deleteSmsReviewDraftsInWriter } from
  "../../services/sms-review-draft-repository";
import {
  acquireSmsReviewNamespaceInWriter,
  releaseSmsReviewNamespaceInWriter,
} from "../../services/sms-review-namespace-repository";
import { ledgerState } from "./account-review-save-sqlite-test-helpers";
import {
  ACTION, BANK, CASH, WALLET, FINGERPRINT_A, FINGERPRINT_B,
  FOREIGN_OWNER, OWNER, SESSION, makeSaveFixture, testUuid,
} from "./account-review-save-test-fixtures";
import {
  database, cloneRecoverySqlite, resetRecoverySqlite,
  saveReview, seedBoundSmsReview,
} from "./account-review-local-recovery-test-harness";
import {
  activeActionCreatedIds,
  captureHistoricalSmsRows,
  financialRepository,
  readPhysicalPrivateSnapshot,
  stageRejectedRoot,
} from "./account-review-durable-recovery-test-helpers";

// This is the real Node SQLite bridge, not an in-memory stand-in for writes.
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
  const originalDatabase = new wm.Database({ adapter, modelClasses: models });
  let currentDatabase = originalDatabase;
  return {
    get database(): Database { return currentDatabase; },
    __originalDatabase: originalDatabase,
    __adapter: adapter,
    __setActiveDatabase: (next: Database): void => {
      currentDatabase = next;
    },
    schema, Q: wm.Q,
    ...Object.fromEntries(models.map((model) => [model.name, model])),
  };
});
let mockActiveOwner = OWNER;
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockActiveOwner),
  supabase: {},
}));

interface SqliteModuleRuntime {
  readonly __adapter: SQLiteAdapter;
  readonly __originalDatabase: Database;
  readonly __setActiveDatabase: (next: Database) => void;
}
const runtime = jest.requireMock<SqliteModuleRuntime>("@monyvi/db");

let mockPhysicalQueueUuidCounter = 0;
beforeEach(async (): Promise<void> => {
  runtime.__setActiveDatabase(runtime.__originalDatabase);
  mockActiveOwner = OWNER;
  mockCryptoUuidCounter = 0;
  mockPhysicalQueueUuidCounter = 0;
  // The real Watermelon prepareCreate uses its own random-ID generator,
  // independent of expo-crypto. T049 namespace admission requires a
  // canonical UUID, not Jest's default non-UUID random string.
  setGenerator(() => testUuid(30000 + ++mockPhysicalQueueUuidCounter));
  await resetRecoverySqlite();
});
afterEach((): void => {
  runtime.__setActiveDatabase(runtime.__originalDatabase);
  mockActiveOwner = OWNER;
});

describe("#395 T044 actual SQLite queue, rejection and cold-restart safety", () => {
  it("D01 records pruned_empty and each exact original draft on the same committed owned root", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    const original = await captureHistoricalSmsRows(database);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await cloneRecoverySqlite();
    const snapshot = await readPhysicalPrivateSnapshot(fresh);
    expect(snapshot.queuePreimage).toMatchObject({
      ...original.queue,
      disposition: "pruned_empty",
      expectedPostimageHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(await fresh.get<SmsReviewQueue>("sms_review_queues").query().fetch())
      .toHaveLength(0);
    expect(snapshot.smsDrafts).toHaveLength(original.drafts.length);
    for (const draft of original.drafts) {
      const retained = snapshot.smsDrafts.find((row) => row.id === draft.id);
      expect(retained).toEqual({
        ...draft,
        retentionState: "available",
        payloadVersion: String(draft.payloadVersion),
        position: String(draft.position),
        operation: "delete_saved",
        expectedPostimageHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
    }
  });

  it("D02 reopens a stale action on a fresh adapter, restores the original queue and selected drafts, and compensates every created member once", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    const historical = await captureHistoricalSmsRows(database);
    const originalAccounts = (await ledgerState(database)).accounts;
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const captured = await readPhysicalPrivateSnapshot(database);
    expect(captured.createdEntityRefs.length).toBeGreaterThan(2);
    await stageRejectedRoot(database);

    const fresh = await cloneRecoverySqlite();
    expect(fresh).not.toBe(database);
    expect(await readPhysicalPrivateSnapshot(fresh)).toEqual(captured);
    runtime.__setActiveDatabase(fresh);
    expect(
      await productionFinancialActionReconciliationService
        .reconcileRejectedAction(ACTION)
    ).toBe("reconciled");

    const restored = await captureHistoricalSmsRows(fresh);
    expect(restored).toEqual(historical);
    expect(await activeActionCreatedIds(fresh, captured)).toEqual([]);
    const effects = await fresh
      .get<AccountFinancialEffect>("account_financial_effects")
      .query(Q.where("action_id", ACTION)).fetch();
    expect(effects.length).toBeGreaterThan(0);
    expect(effects.every((effect) => !effect.isEffective)).toBe(true);
    const finalState = await ledgerState(fresh);
    expect(finalState.accounts.filter((account) =>
      [BANK, CASH, WALLET].includes(account.id)
    )).toEqual(originalAccounts);
    const root = await fresh.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query(Q.where("action_id", ACTION)).fetch();
    expect(root).toHaveLength(1);
    expect(root[0]?.state).toBe("reconciled");
    expect(root[0]?.localRecoverySnapshotJson).toBeNull();

    expect(
      await productionFinancialActionReconciliationService
        .reconcileRejectedAction(ACTION)
    ).toBe("replay");
    expect(await ledgerState(fresh)).toEqual(finalState);
  });

  it("D03 refuses compensation atomically when a created Bank child has a newer persisted user edit", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const captured = await readPhysicalPrivateSnapshot(database);
    await stageRejectedRoot(database);
    const fresh = await cloneRecoverySqlite();
    runtime.__setActiveDatabase(fresh);
    const childRef = captured.createdEntityRefs.find(
      (ref) => ref.entity === "bank_details"
    );
    if (!childRef) throw new Error("missing_actual_prepared_bank_child");
    const child = await fresh.get<BankDetails>("bank_details").find(childRef.id);
    await fresh.write(async (): Promise<void> => {
      await child.update((record): void => {
        record.accountNumber = "newer-user-owned-child-value";
      });
    });
    const before = await ledgerState(fresh);
    const effects = await fresh
      .get<AccountFinancialEffect>("account_financial_effects")
      .query(Q.where("action_id", ACTION)).fetch();
    expect(effects.every((row) => row.isEffective)).toBe(true);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(ACTION)
    ).rejects.toThrow();
    expect((await fresh.get<BankDetails>("bank_details").find(childRef.id))
      .accountNumber).toBe("newer-user-owned-child-value");
    expect(await ledgerState(fresh)).toEqual(before);
    expect(effects.every((row) => row.isEffective)).toBe(true);
    const roots = await fresh.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query(Q.where("action_id", ACTION)).fetch();
    expect(roots[0]?.state).not.toBe("reconciled");
  });

  it("D04 an authenticated foreign actor cannot load or compensate the owned action after restart", async () => {
    const fixture = makeSaveFixture("sms-new-wallet");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    await stageRejectedRoot(database);
    const fresh = await cloneRecoverySqlite();
    runtime.__setActiveDatabase(fresh);
    const before = await ledgerState(fresh);
    mockActiveOwner = FOREIGN_OWNER;
    try {
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(ACTION)
      ).rejects.toThrow();
    } finally {
      mockActiveOwner = OWNER;
    }
    expect(await ledgerState(fresh)).toEqual(before);
    expect((await fresh.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query(Q.where("action_id", ACTION)).fetch())[0]?.state)
      .toBe("rejected_compensating");
  });
});

describe("#395 T044 actual retention and namespace writers, not simulated snapshot edits", () => {
  it("D05 redacts only the SMS entry at the exact 30-day parsedAt cutoff, retaining its newer sibling", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    const second = await database
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .query(Q.where("sms_fingerprint", FINGERPRINT_B)).fetch();
    if (second.length !== 1 || !second[0])
      throw new Error("missing_second_real_sqlite_draft");
    await database.write(async (): Promise<void> => {
      await second[0].update((row): void => {
        row.parsedAt = new Date("2026-10-16T12:00:00.000Z");
      });
    });
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const captured = await readPhysicalPrivateSnapshot(database);
    const expiredOriginal = captured.smsDrafts.find(
      (row) => row.smsFingerprint === FINGERPRINT_A
    );
    const survivingOriginal = captured.smsDrafts.find(
      (row) => row.smsFingerprint === FINGERPRINT_B
    );
    if (!expiredOriginal || expiredOriginal.retentionState !== "available" ||
        !survivingOriginal || survivingOriginal.retentionState !== "available") {
      throw new Error("actual_preimages_must_be_available_at_initial_save");
    }
    const now = new Date("2026-11-14T12:00:00.000Z");
    expect(getSmsReviewDraftExpiryCutoff(now).toISOString())
      .toBe("2026-10-15T12:00:00.000Z");
    await cleanupExpiredSmsReviewDrafts({ now });
    const after = await readPhysicalPrivateSnapshot(database);
    const expired = after.smsDrafts.find(
      (row) => row.smsFingerprint === FINGERPRINT_A
    );
    expect(expired?.retentionState).toBe("expired");
    expect(Object.keys(expired ?? {}).sort()).toEqual([
      "expectedPostimageHash", "id", "operation", "parsedAt",
      "queueId", "retentionState", "smsFingerprint",
    ]);
    expect(expired).toMatchObject({
      id: expiredOriginal.id,
      parsedAt: expiredOriginal.parsedAt,
      expectedPostimageHash: expiredOriginal.expectedPostimageHash,
    });
    expect(after.smsDrafts.find(
      (row) => row.smsFingerprint === FINGERPRINT_B
    )).toEqual(survivingOriginal);
    const root = await freshRoot(database);
    expect(root.localRecoverySnapshotJson).not.toContain(
      expiredOriginal.payloadJson
    );
  });

  it("D06 acquiring and even subsequently cancelling a newer namespace permanently revokes a pruned queue's old restore right", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    expect((await readPhysicalPrivateSnapshot(database)).queuePreimage?.disposition)
      .toBe("pruned_empty");
    const fresh = await cloneRecoverySqlite();
    runtime.__setActiveDatabase(fresh);
    const lease = await fresh.write(() =>
      acquireSmsReviewNamespaceInWriter({ expectedUserId: OWNER })
    );
    expect(lease.queueId).not.toBe(SESSION);
    await fresh.write(() =>
      releaseSmsReviewNamespaceInWriter({ lease, disposition: "cancelled" })
    );
    expect(await fresh.get<SmsReviewQueue>("sms_review_queues").query().fetch())
      .toHaveLength(0);
    const changed = await readPhysicalPrivateSnapshot(fresh);
    expect(changed.queuePreimage?.disposition).toBe("superseded");
    await stageRejectedRoot(fresh);
    // Approved lifecycle: supersession permanently revokes SMS restoration,
    // but verified financial rollback still reaches a real terminal root.
    expect(await productionFinancialActionReconciliationService
      .reconcileRejectedAction(ACTION)).toBe("reconciled");
    expect(await fresh.get<SmsReviewQueue>("sms_review_queues").query().fetch())
      .toHaveLength(0);
    expect(await activeActionCreatedIds(fresh, changed)).toEqual([]);
    const effects = await fresh.get<AccountFinancialEffect>(
      "account_financial_effects"
    ).query(Q.where("action_id", ACTION)).fetch();
    expect(effects.length).toBeGreaterThan(0);
    expect(effects.every((effect) => !effect.isEffective)).toBe(true);
    const reconciled = await freshRoot(fresh);
    expect(reconciled.state).toBe("reconciled");
    expect(reconciled.localRecoverySnapshotJson).toBeNull();
  });

  it("D07 explicit discard of a real remaining linked SMS draft redacts its owned root evidence in the SAME deletion writer", async () => {
    const fixture = makeSaveFixture("sms-shared");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await cloneRecoverySqlite();
    runtime.__setActiveDatabase(fresh);
    const original = await readPhysicalPrivateSnapshot(fresh);
    const affected = original.smsDrafts.find(
      (entry) => entry.operation === "rebind_remaining"
    );
    if (!affected || affected.retentionState !== "available")
      throw new Error("missing_actual_remaining_group_rebind_preimage");
    const existing = await fresh.get<SmsReviewDraftItem>(
      "sms_review_draft_items"
    ).find(affected.id);
    await fresh.write(() =>
      deleteSmsReviewDraftsInWriter([existing.id], OWNER)
    );
    const changed = await readPhysicalPrivateSnapshot(fresh);
    const redacted = changed.smsDrafts.find((row) => row.id === affected.id);
    expect(redacted?.retentionState).toBe("superseded");
    expect(Object.keys(redacted ?? {}).sort()).toEqual([
      "expectedPostimageHash", "id", "operation", "parsedAt",
      "queueId", "retentionState", "smsFingerprint",
    ]);
    expect(changed.smsDrafts.filter(
      (row) => row.id !== affected.id
    )).toEqual(original.smsDrafts.filter(
      (row) => row.id !== affected.id
    ));
    await stageRejectedRoot(fresh);
    // Explicit discard is irrevocable for this draft. The financial action
    // may still compensate and terminate without resurrecting SMS content.
    expect(await productionFinancialActionReconciliationService
      .reconcileRejectedAction(ACTION)).toBe("reconciled");
    expect(await fresh.get<SmsReviewDraftItem>(
      "sms_review_draft_items"
    ).query(Q.where("id", affected.id)).fetch()).toHaveLength(0);
    expect(await activeActionCreatedIds(fresh, changed)).toEqual([]);
    const effects = await fresh.get<AccountFinancialEffect>(
      "account_financial_effects"
    ).query(Q.where("action_id", ACTION)).fetch();
    expect(effects.length).toBeGreaterThan(0);
    expect(effects.every((effect) => !effect.isEffective)).toBe(true);
    const reconciled = await freshRoot(fresh);
    expect(reconciled.state).toBe("reconciled");
    expect(reconciled.localRecoverySnapshotJson).toBeNull();
  });

  it("D08 actual protected RPC uses only canonical public bytes; failed transport retains the private root", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedBoundSmsReview(fixture);
    await expect(saveReview(fixture)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await cloneRecoverySqlite();
    const snapshot = await readPhysicalPrivateSnapshot(fresh);
    const originalRoot = await fresh.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query(Q.where("action_id", ACTION)).fetch();
    const root = originalRoot[0];
    if (!root || typeof root.localRecoverySnapshotJson !== "string")
      throw new Error("missing_device_local_privacy_sentinel");
    const privateBytes = root.localRecoverySnapshotJson;
    const calls: Array<
      Parameters<FinancialActionSyncDependencies["invokeAccountFinancialActionRpc"]>[0]
    > = [];
    const sync = createFinancialActionSyncService({
      foundationRepository: financialRepository(fresh),
      invokeAccountFinancialActionRpc: (input): Promise<unknown> => {
        calls.push(input);
        return Promise.reject(new Error("simulated_transport_unavailable"));
      },
    });
    await expect(sync.syncAction(ACTION)).rejects.toThrow(
      "simulated_transport_unavailable"
    );
    expect(calls).toEqual([{
      payloadHash: root.payloadHash,
      payloadJson: root.payloadJson,
    }]);
    const transmitted = JSON.stringify(calls);
    expect(transmitted).not.toContain(privateBytes);
    expect(transmitted).not.toContain("local_recovery_snapshot_json");
    for (const draft of snapshot.smsDrafts) {
      if (draft.retentionState === "available") {
        expect(transmitted).not.toContain(draft.payloadJson);
      }
    }
    const retryable = await fresh.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query(Q.where("action_id", ACTION)).fetch();
    expect(retryable[0]?.state).toBe("sync_failed");
    expect(retryable[0]?.localRecoverySnapshotJson).toBe(privateBytes);
    expect(retryable[0]?.outcomeJson).toBeNull();
  });
});

async function freshRoot(db: Database): Promise<FinancialActionGroup> {
  const roots = await db.get<FinancialActionGroup>(
    "financial_action_groups"
  ).query(Q.where("action_id", ACTION)).fetch();
  const root = roots[0];
  if (roots.length !== 1 || !root) throw new Error("missing_action_root");
  return root;
}
