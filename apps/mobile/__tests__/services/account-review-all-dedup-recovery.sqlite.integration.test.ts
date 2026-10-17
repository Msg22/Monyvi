/* L4 #395: real SQLite all-dedup queue/prior-root lifecycle, TESTS FIRST. */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import type {
  Account,
  FinancialActionGroup,
  AccountFinancialEffect,
  Profile,
} from "@monyvi/db";
import {
  accountReviewSessionSchema,
  accountReviewSaveIntentSchema,
  serializeCanonicalJsonValue,
} from "@monyvi/logic";
import { productionFinancialActionReconciliationService } from "../../services/financial-action-reconciliation-production";
import {
  rehydrateOwnedSmsReviewGraph,
  encodeOwnedSmsReviewRow,
} from "../../services/account-review-command-snapshots";
import { discardAllSmsReviewDrafts } from "../../services/sms-review-draft-repository";
import {
  database,
  cloneRecoverySqlite,
  resetRecoverySqlite,
  readPrivateOwnedRoot,
  saveReview,
  seedBoundSmsReview,
  hashProvider,
} from "./account-review-local-recovery-test-harness";
import {
  financialRepository,
  activeActionCreatedIds,
} from "./account-review-durable-recovery-test-helpers";
import {
  physicalSaveLedgerSnapshot,
  seedSavedFingerprint,
} from "./account-review-save-sqlite-test-helpers";
import {
  ACTION,
  OWNER,
  FOREIGN_OWNER,
  BANK,
  SESSION,
  FINGERPRINT_A,
  FINGERPRINT_B,
  FINGERPRINT_C,
  freezeSaveIntent,
  makeSaveFixture,
  testUuid,
  type SaveFixture,
} from "./account-review-save-test-fixtures";
import {
  cache,
  cachedOriginalTombstone,
  createGenuinePendingAdd as seedActualAdd,
  drafts,
  injectPruneConstraint,
  physicalSmsSnapshot,
  queues,
  root,
} from "./account-review-all-dedup-physical-test-helpers";
import { executeSmsAccountReviewCommand } from "../../services/account-review-command-service";
import { makeOwnedContext } from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import { clearAcceptedAccountReviewPrivateEvidence } from "../../services/account-review-retention-terminal";
import { registerAllDedupOriginalRefusalCases } from "./account-review-all-dedup-refusal-test-cases";
const E = "e".repeat(64);
const NEXT = testUuid(6101);
const OTHER = testUuid(6102);
let mockOwner = OWNER;
let mockUuid = 0;
let queueUuid = 0;
jest.mock("expo-crypto", () => {
  const { createHash } =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (alg: string, data: string): Promise<string> =>
      alg === "SHA-256"
        ? Promise.resolve(createHash("sha256").update(data).digest("hex"))
        : Promise.reject(new Error("unsupported")),
    randomUUID: (): string =>
      "e1000000-0000-4000-8000-" + String(++mockUuid).padStart(12, "0"),
  };
});
jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", () => {
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
  const { Profile } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Profile")
  >("../../../../packages/db/src/models/Profile");
  const adapter = new Adapter({ schema });
  // This suite's command case exercises the real owned Profile read model.
  // Register it here, not in the shared recovery model list used by other suites.
  const initial: Database = new wm.Database({
    adapter,
    modelClasses: [...models, Profile],
  });
  let current: Database = initial;
  return {
    get database(): Database {
      return current;
    },
    __initial: initial,
    __adapter: adapter,
    __activate: (db: Database): void => {
      current = db;
    },
    schema,
    Q: wm.Q,
    Profile,
    ...Object.fromEntries(models.map((m) => [m.name, m])),
  };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockOwner),
  // Match the production auth coordinator subscription contract. The
  // same-owner command test has no synthetic auth-state transition.
  subscribeToCoordinatedAuthStateChange: () => ({
    data: { subscription: { unsubscribe: (): void => undefined } },
  }),
  supabase: {},
}));
interface Runtime {
  readonly __initial: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __activate: (db: Database) => void;
}
const runtime = jest.requireMock<Runtime>("@monyvi/db");
function voice(): SaveFixture {
  const prior = makeSaveFixture("voice-existing");
  const intent = accountReviewSaveIntentSchema.parse({
    ...prior.intent,
    actionId: OTHER,
    plannedEntityIds: prior.intent.plannedEntityIds.map((p, i) => ({
      ...p,
      id: testUuid(6200 + i),
    })),
  });
  return {
    intent,
    session: accountReviewSessionSchema.parse({
      ...prior.session,
      saveIntent: intent,
    }),
  };
}
async function selectLast(): Promise<SaveFixture> {
  const ds = await drafts(database);
  const one = ds[0];
  if (
    ds.length !== 1 ||
    !one ||
    one.smsFingerprint !== E ||
    one.selectionOverride !== false
  )
    throw new Error("not_last_cib");
  const graph = rehydrateOwnedSmsReviewGraph([one], OWNER, SESSION);
  const row = graph.session.rows[0];
  if (
    !row ||
    row.source !== "SMS" ||
    row.selected ||
    row.assignment.state !== "suggested"
  )
    throw new Error("not_confirmed_cib");
  const session = accountReviewSessionSchema.parse({
    ...graph.session,
    revision: "1",
    operationGeneration: "1",
    rows: [{ ...row, revision: "1", selected: true }],
    saveIntent: null,
  });
  const initial = freezeSaveIntent(session);
  const intent = accountReviewSaveIntentSchema.parse({
    ...initial,
    actionId: NEXT,
    plannedEntityIds: initial.plannedEntityIds.map((p, i) => ({
      ...p,
      id: testUuid(6300 + i),
    })),
  });
  const selected = accountReviewSessionSchema.parse({
    ...session,
    saveIntent: intent,
  });
  const source = selected.rows[0];
  if (!source || source.source !== "SMS")
    throw new Error("invalid_selected_row");
  const encoded = encodeOwnedSmsReviewRow(selected, source);
  // Authentic V2 bytes in real SQLite model; NOT a simulated Save writer.
  await database.write(() =>
    database.batch(
      one.prepareUpdate((d) => {
        d.payloadVersion = encoded.version;
        d.payloadJson = encoded.json;
        d.selectionOverride = true;
      })
    )
  );
  return { session: selected, intent };
}
interface Setup {
  readonly cleanup: SaveFixture;
  readonly otherRaw: string;
}
async function setup(): Promise<Setup> {
  const partial = makeSaveFixture("sms-shared");
  await seedBoundSmsReview(partial);
  await expect(saveReview(partial)).resolves.toEqual({ kind: "committed" });
  const r = readPrivateOwnedRoot(await root(database, ACTION));
  expect(r.queuePreimage?.disposition).toBe("present");
  expect(r.smsDrafts.map((d) => d.smsFingerprint).sort()).toEqual(
    [FINGERPRINT_A, FINGERPRINT_B, FINGERPRINT_C].sort()
  );
  const items = await drafts(database);
  expect(items.map((d) => d.smsFingerprint).sort()).toEqual(
    [FINGERPRINT_B, FINGERPRINT_C, E].sort()
  );
  const siblings = items.filter(
    (d) =>
      d.smsFingerprint === FINGERPRINT_B || d.smsFingerprint === FINGERPRINT_C
  );
  expect(siblings).toHaveLength(2);
  expect(
    await discardAllSmsReviewDrafts(
      OWNER,
      SESSION,
      siblings.map((d) => d.id)
    )
  ).toBe(2);
  const retained = readPrivateOwnedRoot(await root(database, ACTION));
  expect(retained.queuePreimage?.disposition).toBe("present");
  expect(
    retained.smsDrafts.filter((d) => d.retentionState === "superseded")
  ).toHaveLength(2);
  expect(
    retained.smsDrafts
      .filter((d) => d.retentionState === "available")
      .map((d) => d.smsFingerprint)
  ).toEqual([FINGERPRINT_A]);
  expect((await queues(database)).map((q) => q.id)).toEqual([SESSION]);
  await seedSavedFingerprint(database, E, "transfer");
  const cleanup = await selectLast();
  await expect(saveReview(voice())).resolves.toEqual({ kind: "committed" });
  const other = await root(database, OTHER);
  expect(readPrivateOwnedRoot(other).queuePreimage).toBeNull();
  return { cleanup, otherRaw: JSON.stringify(other._raw) };
}
async function stageRejection(db: Database): Promise<void> {
  const snap = readPrivateOwnedRoot(await root(db, ACTION));
  const absent = snap.createdEntityRefs
    .filter((r) => r.entity === "account")
    .map((r) => r.id)
    .sort();
  expect(absent.length).toBeGreaterThan(0);
  const repo = financialRepository(db);
  await repo.markFinancialActionGroupSyncPending(ACTION);
  await repo.recordFinancialActionGroupServerOutcome(
    ACTION,
    "stale",
    serializeCanonicalJsonValue({
      actionId: ACTION,
      status: "stale",
      code: "REVISION_STALE",
      accountRevisions: [],
      canonicalAccounts: [],
      canonicalAbsentAccountIds: absent,
    }),
    "REVISION_STALE"
  );
  expect((await root(db, ACTION)).state).toBe("rejected_compensating");
}
let pendingAddUuid = 0;
async function createGenuinePendingAdd(): Promise<
  Awaited<ReturnType<typeof seedActualAdd>>
> {
  return seedActualAdd({
    database,
    hashProvider,
    createId: (): string => testUuid(7800 + ++pendingAddUuid),
  });
}

beforeEach(async () => {
  runtime.__activate(runtime.__initial);
  mockOwner = OWNER;
  mockUuid = 0;
  queueUuid = 0;
  setGenerator(() => testUuid(30000 + ++queueUuid));
  pendingAddUuid = 0;
  await resetRecoverySqlite();
});
afterEach(() => {
  jest.restoreAllMocks();
  mockOwner = OWNER;
  runtime.__activate(runtime.__initial);
});

describe("L4 real SQLite all-dedup lifecycle", () => {
  registerAllDedupOriginalRefusalCases({
    setup,
    createGenuinePendingAdd,
  });

  it("L4-NATIVE: actual SQLite duplicate primary-key in same prune batch rolls back and retries", async () => {
    const prepared = await setup();
    const original = await cachedOriginalTombstone(database);
    const action = await root(database, ACTION);
    const cached: Model[] = [
      original,
      action,
      ...(await queues(database)),
      ...(await drafts(database)),
    ];
    const beforeCache = cache(cached);
    const beforePhysical = await physicalSmsSnapshot(
      await cloneRecoverySqlite()
    );
    const beforeLedger = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );
    // A seeded real primary key is the positive SQLite collision oracle.
    expect((await database.get<Account>("accounts").find(BANK)).id).toBe(BANK);
    const injection = injectPruneConstraint(database);
    let rejection: unknown;
    try {
      await saveReview(prepared.cleanup);
    } catch (error: unknown) {
      rejection = error;
    } finally {
      injection.restore();
    }
    // A pre-dispatch rejection or zero-injection outcome is never native Red.
    expect(injection.count()).toBe(1);
    expect(injection.nativeSqlError()).toMatch(
      /UNIQUE constraint failed: accounts.id/
    );
    // The real native dispatcher may throw a cross-realm error object.
    // Exact injected SQL constraint, count and surfaced error remain mandatory.
    expect(String(rejection)).toMatch(/UNIQUE constraint failed: accounts.id/);
    expect(cache(cached)).toEqual(beforeCache);
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual(
      beforePhysical
    );
    expect(
      await physicalSaveLedgerSnapshot(await cloneRecoverySqlite())
    ).toEqual(beforeLedger);
    await expect(saveReview(prepared.cleanup)).resolves.toEqual({
      kind: "cleanup_only",
      resolvedSmsDraftCount: 1,
    });
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual({
      queues: [],
      drafts: [],
    });
  });

  it("L4-HELD: ordinary all-dedup prunes atomically but rejected Review restoration after total prune remains held", async () => {
    const prepared = await setup();
    const before = await physicalSaveLedgerSnapshot(database);
    const fullBefore = await physicalSmsSnapshot(await cloneRecoverySqlite());
    const historicalOriginal = await cachedOriginalTombstone(database);
    const r = await root(database, ACTION);
    const other = await root(database, OTHER);
    const q = (await queues(database))[0];
    const d = (await drafts(database))[0];
    if (!q || !d) throw new Error("not_real_queue");
    const cached: Model[] = [r, other, q, d, historicalOriginal];
    const priorCache = cache(cached);
    mockOwner = FOREIGN_OWNER;
    await expect(saveReview(prepared.cleanup)).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(database)).toEqual(before);
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual(
      fullBefore
    );
    expect(cache(cached)).toEqual(priorCache);
    mockOwner = OWNER;
    await expect(saveReview(prepared.cleanup)).resolves.toEqual({
      kind: "cleanup_only",
      resolvedSmsDraftCount: 1,
    });
    expect(await queues(database)).toHaveLength(0);
    expect(await drafts(database)).toHaveLength(0);
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual({
      queues: [],
      drafts: [],
    });
    expect(JSON.stringify((await root(database, OTHER))._raw)).toBe(
      prepared.otherRaw
    );
    const after = await physicalSaveLedgerSnapshot(database);
    for (const t of [
      "accounts",
      "bank_details",
      "account_sms_senders",
      "categories",
      "transactions",
      "transfers",
      "account_financial_effects",
    ]) {
      expect(after.find((x) => x.table === t)?.rows).toEqual(
        before.find((x) => x.table === t)?.rows
      );
    }
    expect(
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .query(Q.where("action_id", NEXT))
        .fetch()
    ).toHaveLength(0);

    const fresh = await cloneRecoverySqlite();
    runtime.__activate(fresh);
    const recovery = readPrivateOwnedRoot(await root(fresh, ACTION));
    // Expected baseline RED: actual deleted queue still says "present".
    expect(recovery.queuePreimage?.disposition).toBe("pruned_empty");
    expect(recovery.queuePreimage?.id).toBe(SESSION);
    expect(
      recovery.smsDrafts.filter((d) => d.retentionState === "superseded")
    ).toHaveLength(2);
    expect(
      recovery.smsDrafts
        .filter((d) => d.retentionState === "available")
        .map((d) => d.smsFingerprint)
    ).toEqual([FINGERPRINT_A]);
    // A mixed pruned_empty receipt is not authority to restore a partial
    // original queue: all original physical IDs were genuinely destroyed.
    expect(await fresh.adapter.find("sms_review_queues", SESSION)).toBeNull();
    for (const draft of recovery.smsDrafts) {
      expect(
        await fresh.adapter.find("sms_review_draft_items", draft.id)
      ).toBeNull();
    }
    await stageRejection(fresh);
    const rejectedPhysical = await physicalSaveLedgerSnapshot(fresh);
    const rejectedSms = await physicalSmsSnapshot(await cloneRecoverySqlite());
    expect(rejectedSms).toEqual({ queues: [], drafts: [] });
    const heldRoot = await root(fresh, ACTION);
    const heldRaw = JSON.stringify(heldRoot._raw);
    const privateBytes = heldRoot.localRecoverySnapshotJson;
    expect(typeof privateBytes).toBe("string");
    expect(heldRoot.state).toBe("rejected_compensating");
    expect(heldRoot._raw._status).not.toBe("synced");
    const activeBefore = await activeActionCreatedIds(fresh, recovery);
    const beforeEffects = await fresh
      .get<AccountFinancialEffect>("account_financial_effects")
      .query(Q.where("user_id", OWNER), Q.where("action_id", ACTION))
      .fetch();
    expect(beforeEffects.length).toBeGreaterThan(0);
    expect(beforeEffects.every((effect) => effect.isEffective)).toBe(true);

    mockOwner = FOREIGN_OWNER;
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        ACTION
      )
    ).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(rejectedPhysical);
    mockOwner = OWNER;

    // After a physically complete mixed prune, automatic rejected-Review
    // restoration has insufficient authority. An exact HELD result must not
    // be mislabeled as compensation, ACK, replay or recovery success.
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        ACTION
      )
    ).rejects.toThrow("financial_action_reconciliation_incomplete");
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(rejectedPhysical);
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual(
      rejectedSms
    );
    expect(await activeActionCreatedIds(fresh, recovery)).toEqual(activeBefore);
    const heldAgain = await root(fresh, ACTION);
    expect(heldAgain.state).toBe("rejected_compensating");
    expect(heldAgain._raw._status).not.toBe("synced");
    expect(JSON.stringify(heldAgain._raw)).toBe(heldRaw);
    expect(heldAgain.localRecoverySnapshotJson).toBe(privateBytes);
    expect(JSON.stringify((await root(fresh, OTHER))._raw)).toBe(
      prepared.otherRaw
    );
    expect(beforeEffects.every((effect) => effect.isEffective)).toBe(true);

    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        ACTION
      )
    ).rejects.toThrow("financial_action_reconciliation_incomplete");
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(rejectedPhysical);
    expect((await root(fresh, ACTION)).localRecoverySnapshotJson).toBe(
      privateBytes
    );
  });

  it("L4-NEGATIVE: a missing original queue with a present receipt refuses reconciliation", async () => {
    await setup();
    const originalQueue = (await queues(database))[0];
    if (!originalQueue) throw new Error("missing_control_original_queue");
    const survivingDrafts = await drafts(database);
    await database.write(() =>
      database.batch(
        ...survivingDrafts.map((draft) => draft.prepareDestroyPermanently()),
        originalQueue.prepareDestroyPermanently()
      )
    );
    const fresh = await cloneRecoverySqlite();
    runtime.__activate(fresh);
    expect(
      readPrivateOwnedRoot(await root(fresh, ACTION)).queuePreimage?.disposition
    ).toBe("present");
    await stageRejection(fresh);
    const before = await physicalSaveLedgerSnapshot(fresh);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        ACTION
      )
    ).rejects.toThrow("financial_action_reconciliation_incomplete");
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(before);
    expect((await root(fresh, ACTION)).state).toBe("rejected_compensating");
  });

  it("L4-CONTROL: failed native batch keeps SQLite and cache intact; retry succeeds", async () => {
    const prepared = await setup();
    const cached = [
      await root(database, ACTION),
      await root(database, OTHER),
      (await queues(database))[0],
      (await drafts(database))[0],
    ];
    if (cached.some((m) => !m)) throw new Error("missing_cached_record");
    const originals = cache(cached);
    const prior = await physicalSaveLedgerSnapshot(await cloneRecoverySqlite());
    const smsBefore = await physicalSmsSnapshot(await cloneRecoverySqlite());
    let staged: readonly string[] = [];
    const blocked = jest
      .spyOn(runtime.__adapter, "batch")
      .mockImplementation((ops, cb): void => {
        staged = ops.map((op) => op[0] + ":" + op[1]);
        cb({ error: new Error("l4_precommit_fault") });
      });
    try {
      await expect(saveReview(prepared.cleanup)).rejects.toThrow(
        "l4_precommit_fault"
      );
    } finally {
      blocked.mockRestore();
    }
    expect(staged).toContain("destroyPermanently:sms_review_draft_items");
    expect(staged).toContain("destroyPermanently:sms_review_queues");
    expect(cache(cached as Model[])).toEqual(originals);
    expect(
      await physicalSaveLedgerSnapshot(await cloneRecoverySqlite())
    ).toEqual(prior);
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual(
      smsBefore
    );
    await expect(saveReview(prepared.cleanup)).resolves.toEqual({
      kind: "cleanup_only",
      resolvedSmsDraftCount: 1,
    });
    const fresh = await cloneRecoverySqlite();
    expect(await queues(fresh)).toHaveLength(0);
    expect(await drafts(fresh)).toHaveLength(0);
    expect(JSON.stringify((await root(fresh, OTHER))._raw)).toBe(
      prepared.otherRaw
    );
  });
  it("L4-ADD: real pending Add private carrier is preserved while Review all-dedup atomically prunes its own queue, including precommit rollback", async () => {
    const prepared = await setup();
    const add = await createGenuinePendingAdd();
    const addRoot = await root(database, add.actionId);
    const addAccount = await database
      .get<Account>("accounts")
      .find(add.accountId);
    const reviewRoot = await root(database, ACTION);
    const queue = (await queues(database))[0];
    const draft = (await drafts(database))[0];
    if (!queue || !draft)
      throw new Error("expected_real_owned_queue_and_last_draft");
    const cached: Model[] = [
      addRoot,
      addAccount,
      reviewRoot,
      queue,
      draft,
      await cachedOriginalTombstone(database),
    ];
    const cacheBefore = cache(cached);
    const durableBefore = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );

    let attempted = 0;
    const failed = jest
      .spyOn(runtime.__adapter, "batch")
      .mockImplementation((_operations, done): void => {
        attempted++;
        done({ error: new Error("l4_pending_add_precommit_fault") });
      });
    try {
      await expect(saveReview(prepared.cleanup)).rejects.toThrow(
        "l4_pending_add_precommit_fault"
      );
    } finally {
      failed.mockRestore();
    }
    expect(attempted).toBeGreaterThan(0);
    expect(cache(cached)).toEqual(cacheBefore);
    expect(
      await physicalSaveLedgerSnapshot(await cloneRecoverySqlite())
    ).toEqual(durableBefore);
    expect((await root(database, add.actionId)).localRecoverySnapshotJson).toBe(
      add.privateJson
    );

    await expect(saveReview(prepared.cleanup)).resolves.toEqual({
      kind: "cleanup_only",
      resolvedSmsDraftCount: 1,
    });
    const fresh = await cloneRecoverySqlite();
    expect(await queues(fresh)).toHaveLength(0);
    expect(await drafts(fresh)).toHaveLength(0);
    expect(
      readPrivateOwnedRoot(await root(fresh, ACTION)).queuePreimage?.disposition
    ).toBe("pruned_empty");
    const preserved = await root(fresh, add.actionId);
    expect(JSON.stringify(preserved._raw)).toBe(add.rootRaw);
    expect(preserved.localRecoverySnapshotJson).toBe(add.privateJson);
    expect(
      JSON.stringify(
        (await fresh.get<Account>("accounts").find(add.accountId))._raw
      )
    ).toBe(add.accountRaw);
    const effects = await fresh
      .get<AccountFinancialEffect>("account_financial_effects")
      .query(Q.where("action_id", add.actionId))
      .fetch();
    expect(effects).toHaveLength(0);
    expect(JSON.stringify((await root(fresh, OTHER))._raw)).toBe(
      prepared.otherRaw
    );
  });

  it("L4-ADD-REFUSAL: a corrupted owned Add private carrier cannot be mistaken for Review or silently ignored during prune", async () => {
    const prepared = await setup();
    const add = await createGenuinePendingAdd();
    const pending = await root(database, add.actionId);
    const invalid = JSON.parse(add.privateJson) as unknown;
    if (
      typeof invalid !== "object" ||
      invalid === null ||
      Array.isArray(invalid)
    )
      throw new Error("invalid_original_Add_private_object");
    // Mutate only an owned, actual Add private root in real SQLite.
    await database.write(() =>
      database.batch(
        pending.prepareUpdate((row) => {
          row.localRecoverySnapshotJson = JSON.stringify({
            ...invalid,
            ownerId: FOREIGN_OWNER,
          });
        })
      )
    );
    const before = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );
    await expect(saveReview(prepared.cleanup)).rejects.toThrow();
    expect(
      await physicalSaveLedgerSnapshot(await cloneRecoverySqlite())
    ).toEqual(before);
    expect(
      (await root(database, add.actionId)).localRecoverySnapshotJson
    ).toContain(FOREIGN_OWNER);
    expect(await queues(database)).toHaveLength(1);
    expect(await drafts(database)).toHaveLength(1);
    expect(
      readPrivateOwnedRoot(await root(database, ACTION)).queuePreimage
        ?.disposition
    ).toBe("present");
  });

  it("L4-ACCEPTED retains valid historical proof until original tombstones are consumed", async () => {
    const caseData = await setup();
    const repo = financialRepository(database);
    await repo.markFinancialActionGroupSyncPending(ACTION);
    await repo.recordFinancialActionGroupServerOutcome(
      ACTION,
      "accepted",
      serializeCanonicalJsonValue({
        actionId: ACTION,
        status: "accepted",
        accountRevisions: [],
        canonicalAccounts: [],
      }),
      null
    );
    const accepted = await root(database, ACTION);
    expect(accepted.state).toBe("accepted");
    const prior = accepted.localRecoverySnapshotJson;
    await clearAcceptedAccountReviewPrivateEvidence({
      database,
      actionId: ACTION,
    });
    expect((await root(database, ACTION)).localRecoverySnapshotJson).toBe(
      prior
    );
    await expect(saveReview(caseData.cleanup)).resolves.toEqual({
      kind: "cleanup_only",
      resolvedSmsDraftCount: 1,
    });
    expect((await root(database, ACTION)).state).toBe("accepted");
    expect((await root(database, ACTION)).localRecoverySnapshotJson).toBeNull();
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual({
      queues: [],
      drafts: [],
    });
  });

  it("L4-COMMAND genuine owned review filter update preserves sealed queue header", async () => {
    await setup();
    // Real command read-model authority requires exactly one genuine owned,
    // undeleted Profile with persisted currency. Never bypass the query or
    // substitute the screen's advisory account context for database evidence.
    await database.write(() =>
      database.batch(
        database.get<Profile>("profiles").prepareCreate((profile) => {
          profile.userId = OWNER;
          profile.preferredCurrency = "EGP";
          profile.preferredLanguage = "en";
          profile.theme = "SYSTEM";
          profile.deleted = false;
          profile.onboardingCompleted = true;
          profile.setupGuideCompleted = true;
          profile.smsDetectionEnabled = true;
          profile.updatedAt = new Date("2026-10-14T12:00:00.000Z");
        })
      )
    );
    const ownedProfiles = await database
      .get<Profile>("profiles")
      .query(Q.where("user_id", OWNER), Q.where("deleted", false))
      .fetch();
    expect(ownedProfiles).toHaveLength(1);
    expect(ownedProfiles[0]?.preferredCurrency).toBe("EGP");
    const live = await drafts(database);
    const graph = rehydrateOwnedSmsReviewGraph(live, OWNER, SESSION);
    const q = (await queues(database))[0];
    if (!q) throw new Error("no_sealed_queue_header");
    const queueRaw = JSON.stringify(q._raw);
    const historical = await cachedOriginalTombstone(database);
    const oldHistorical = cache([historical]);
    const outcome = await executeSmsAccountReviewCommand({
      queueId: SESSION,
      accountSnapshots: makeOwnedContext(),
      command: {
        kind: "set_filter",
        filter: "selected",
        ownerId: OWNER,
        sessionId: SESSION,
        expectedReviewRevision: graph.session.revision,
        expectedOperationGeneration: graph.session.operationGeneration,
      },
    });
    expect(outcome.effect).toBe("persist_sms");
    expect(JSON.stringify((await queues(database))[0]?._raw)).toBe(queueRaw);
    expect(cache([historical])).toEqual(oldHistorical);
    expect(
      readPrivateOwnedRoot(await root(database, ACTION)).queuePreimage
        ?.disposition
    ).toBe("present");
  });

  it("L4-HEADER refuses an unauthorized later queue timestamp without partial mutation", async () => {
    const caseData = await setup();
    const queue = (await queues(database))[0];
    if (!queue) throw new Error("no_current_queue_header");
    await database.write(() =>
      database.batch(
        queue.prepareUpdate((row) => {
          row.updatedAt = new Date("2026-11-01T00:00:00.000Z");
        })
      )
    );
    const historical = await cachedOriginalTombstone(database);
    const cached = [historical, queue, await root(database, ACTION)];
    const originalCache = cache(cached);
    const before = await physicalSmsSnapshot(await cloneRecoverySqlite());
    const ledger = await physicalSaveLedgerSnapshot(
      await cloneRecoverySqlite()
    );
    await expect(saveReview(caseData.cleanup)).rejects.toThrow(
      "account_review_private_lifecycle_"
    );
    expect(cache(cached)).toEqual(originalCache);
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual(
      before
    );
    expect(
      await physicalSaveLedgerSnapshot(await cloneRecoverySqlite())
    ).toEqual(ledger);
  });

  it("L4-LEGACY-SPOOF refuses corrupt Add kind/null carrier rather than exempting as legacy", async () => {
    const caseData = await setup();
    const add = await createGenuinePendingAdd();
    const row = await root(database, add.actionId);
    await database.write(() =>
      database.batch(
        row.prepareUpdate((model) => {
          model.kind = "edit_balance";
          model.localRecoverySnapshotJson = null;
        })
      )
    );
    const before = await physicalSmsSnapshot(await cloneRecoverySqlite());
    const oldCache = cache([row, await cachedOriginalTombstone(database)]);
    await expect(saveReview(caseData.cleanup)).rejects.toThrow(
      "account_review_private_lifecycle_"
    );
    expect(await physicalSmsSnapshot(await cloneRecoverySqlite())).toEqual(
      before
    );
    expect(cache([row, await cachedOriginalTombstone(database)])).toEqual(
      oldCache
    );
  });
});
