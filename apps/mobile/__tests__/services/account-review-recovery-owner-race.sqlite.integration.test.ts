/**
 * #395 T2/T051 - the dispatcher must not hand owner A's reconciliation over
 * to a separately owned B/K root when authentication changes between awaits.
 *
 * Actual Save, foundation repository, production dispatcher, dedicated
 * reconciler, proof verifier, and Watermelon/SQLite writer are NOT mocked.
 * Only native Expo crypto/UUID, the Node SQLite dispatcher and the external
 * authenticated-user boundary are adapted for Jest.
 */
import { Q, type Database } from "@nozbe/watermelondb";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  AccountFinancialEffect,
  Category,
  FinancialActionGroup,
} from "@monyvi/db";
import {
  accountReviewSaveIntentSchema,
  accountReviewSessionSchema,
  serializeCanonicalJsonValue,
} from "@monyvi/logic";
import { productionFinancialActionReconciliationService } from "../../services/financial-action-reconciliation-production";
import {
  database,
  cloneRecoverySqlite,
  readPrivateOwnedRoot,
  resetRecoverySqlite,
  saveReview,
  setReviewOwner,
} from "./account-review-local-recovery-test-harness";
import {
  financialRepository,
  stageRejectedRoot,
} from "./account-review-durable-recovery-test-helpers";
import { physicalSaveLedgerSnapshot } from "./account-review-save-sqlite-test-helpers";
import {
  ACTION,
  FOREIGN_OWNER,
  OWNER,
  SESSION,
  makeSaveFixture,
  testUuid,
  type SaveFixture,
} from "./account-review-save-test-fixtures";

const B_SESSION = testUuid(1602);
const B_BANK = testUuid(1600);
const B_CATEGORY = testUuid(1601);
const B_TRANSACTION = testUuid(1500);
const B_NEW_CASH = testUuid(1700);

let mockAuthOwner = OWNER;
let mockAuthReadCount = 0;
let mockAuthGate: Readonly<{
  atRead: number;
  entered: () => void;
  resume: Promise<void>;
}> | null = null;
let mockCryptoUuidCounter = 0;
let mockWatermelonUuidCounter = 0;

jest.mock("expo-crypto", () => {
  const { createHash } =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (algorithm: string, value: string): Promise<string> => {
      if (algorithm !== "SHA-256") {
        return Promise.reject(new Error("unsupported_test_crypto_algorithm"));
      }
      return Promise.resolve(
        createHash("sha256").update(value, "utf8").digest("hex")
      );
    },
    randomUUID: (): string => {
      mockCryptoUuidCounter += 1;
      return (
        "e1000000-0000-4000-8000-" +
        String(mockCryptoUuidCounter).padStart(12, "0")
      );
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
  const original = new wm.Database({ adapter, modelClasses: models });
  let current = original;
  return {
    get database(): Database {
      return current;
    },
    __originalDatabase: original,
    __adapter: adapter,
    __setActiveDatabase: (next: Database): void => {
      current = next;
    },
    schema,
    Q: wm.Q,
    ...Object.fromEntries(models.map((model) => [model.name, model])),
  };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => {
    const read = ++mockAuthReadCount;
    const gate = mockAuthGate;
    if (gate && read === gate.atRead) {
      gate.entered();
      // Read the actor ONLY when this pending OS/auth lookup completes.
      return gate.resume.then(() => mockAuthOwner);
    }
    return Promise.resolve(mockAuthOwner);
  },
  supabase: {},
}));

interface SqliteRuntime {
  readonly __originalDatabase: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __setActiveDatabase: (next: Database) => void;
}
const runtime = jest.requireMock<SqliteRuntime>("@monyvi/db");

function signal(): Readonly<{ promise: Promise<void>; fire: () => void }> {
  let fire!: () => void;
  const promise = new Promise<void>((resolve) => {
    fire = resolve;
  });
  return { promise, fire };
}

/**
 * Entry is auth read #3: #1 dispatch getCurrentUserDataScope(A);
 * #2 dispatch assertExpectedCurrentUser(A); #3 dedicated scope resolution.
 * No fake writer, arbitrary delay, or control of internal business logic.
 */
function holdDedicatedScopeRead(): Readonly<{
  entered: Promise<void>;
  release: () => void;
}> {
  const entered = signal();
  const release = signal();
  mockAuthReadCount = 0;
  mockAuthGate = {
    atRead: 3,
    entered: entered.fire,
    resume: release.promise,
  };
  return { entered: entered.promise, release: release.fire };
}

function ownerBFixture(): SaveFixture {
  const base = makeSaveFixture("voice-cash");
  const plannedEntityIds = base.intent.plannedEntityIds.map((entity) => {
    if (entity.entity === "transaction")
      return { ...entity, id: B_TRANSACTION };
    if (entity.entity === "account") return { ...entity, id: B_NEW_CASH };
    throw new Error("unexpected_cash_fixture_child_kind");
  });
  const intent = accountReviewSaveIntentSchema.parse({
    ...base.intent,
    ownerId: FOREIGN_OWNER,
    sessionId: B_SESSION,
    plannedEntityIds,
  });
  const session = accountReviewSessionSchema.parse({
    ...base.session,
    ownerId: FOREIGN_OWNER,
    sessionId: B_SESSION,
    rows: base.session.rows.map((row) => ({
      ...row,
      transaction: { ...row.transaction, categoryId: B_CATEGORY },
    })),
    saveIntent: intent,
  });
  return { intent, session };
}

/** Seed independently owned REAL persisted data, never another owner's row. */
async function seedOwnerBBase(db: Database): Promise<void> {
  await db.write(async (): Promise<void> => {
    const category = db.get<Category>("categories").prepareCreate((row) => {
      row._raw.id = B_CATEGORY;
      row.userId = FOREIGN_OWNER;
      row.type = "EXPENSE";
      row.deleted = false;
      row.displayName = "B Food";
      row.systemName = "b-food";
      row.isSystem = false;
      row.isHidden = false;
      row.isInternal = false;
      row.icon = "wallet-outline";
      row.iconLibrary = "Ionicons";
      row.level = 0;
      row.usageCount = 0;
    });
    const bank = db.get<Account>("accounts").prepareCreate((row) => {
      row._raw.id = B_BANK;
      row.userId = FOREIGN_OWNER;
      row.name = "B Existing Bank";
      row.type = "BANK";
      row.currency = "EGP";
      row.balance = 100;
      row.financialRevision = "0";
      row.isDefault = true;
      row.deleted = false;
      row.institutionId = "b-bank";
      row.providerDisplayName = "B Bank";
    });
    await db.batch(category, bank);
  });
}

async function ownedRoot(
  db: Database,
  ownerId: string
): Promise<FinancialActionGroup> {
  const roots = await db
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("user_id", ownerId), Q.where("action_id", ACTION))
    .fetch();
  if (roots.length !== 1 || !roots[0])
    throw new Error("missing_distinct_owned_physical_action_root");
  return roots[0];
}

async function ownedEffects(
  db: Database,
  ownerId: string
): Promise<readonly AccountFinancialEffect[]> {
  return db
    .get<AccountFinancialEffect>("account_financial_effects")
    .query(Q.where("user_id", ownerId), Q.where("action_id", ACTION))
    .fetch();
}

/** Use the real foundation outcome transition and actual immutable Save root. */
async function rejectCurrentOwnerB(db: Database): Promise<void> {
  const root = await ownedRoot(db, FOREIGN_OWNER);
  const privateSnapshot = readPrivateOwnedRoot(root);
  const absent = privateSnapshot.createdEntityRefs
    .filter((ref) => ref.entity === "account")
    .map((ref) => ref.id)
    .sort();
  expect(absent).toEqual([B_NEW_CASH]);
  const repo = financialRepository(db);
  await repo.markFinancialActionGroupSyncPending(ACTION);
  await repo.recordFinancialActionGroupServerOutcome(
    ACTION,
    "stale",
    serializeCanonicalJsonValue({
      actionId: root.actionId,
      status: "stale",
      code: "REVISION_STALE",
      accountRevisions: [],
      canonicalAccounts: [],
      canonicalAbsentAccountIds: absent,
    }),
    "REVISION_STALE"
  );
  expect((await ownedRoot(db, FOREIGN_OWNER)).state).toBe(
    "rejected_compensating"
  );
}

/**
 * The schema has a composite UNIQUE(user_id,action_id), not UNIQUE(action_id).
 * Build BOTH roots using actual saveSelectedAccountReview, not raw fabricated
 * roots, so A/K and B/K have valid envelopes, private postimages and effects.
 */
async function establishTwoRecoverableOwners(): Promise<
  Readonly<{
    fresh: Database;
    a: FinancialActionGroup;
    b: FinancialActionGroup;
  }>
> {
  const aFixture = makeSaveFixture("voice-cash");
  expect(aFixture.intent.actionId).toBe(ACTION);
  expect(aFixture.session.sessionId).toBe(SESSION);
  await expect(saveReview(aFixture)).resolves.toMatchObject({
    kind: "committed",
  });
  await stageRejectedRoot(database);
  await seedOwnerBBase(database);

  mockAuthOwner = FOREIGN_OWNER;
  setReviewOwner(FOREIGN_OWNER);
  const bFixture = ownerBFixture();
  expect(bFixture.intent.actionId).toBe(ACTION);
  await expect(saveReview(bFixture)).resolves.toMatchObject({
    kind: "committed",
  });
  await rejectCurrentOwnerB(database);
  setReviewOwner(OWNER);
  mockAuthOwner = OWNER;

  const fresh = await cloneRecoverySqlite();
  runtime.__setActiveDatabase(fresh);
  const a = await ownedRoot(fresh, OWNER);
  const b = await ownedRoot(fresh, FOREIGN_OWNER);
  const privateA = readPrivateOwnedRoot(a);
  const privateB = readPrivateOwnedRoot(b);
  expect(a.id).not.toBe(b.id);
  expect(a.actionId).toBe(b.actionId);
  expect(a.userId).not.toBe(b.userId);
  expect(a.payloadHash).not.toBe(b.payloadHash);
  expect(a.localRecoverySnapshotJson).toEqual(expect.any(String));
  expect(b.localRecoverySnapshotJson).toEqual(expect.any(String));
  expect(a.state).toBe("rejected_compensating");
  expect(b.state).toBe("rejected_compensating");
  expect(privateA.createdEntityRefs.map((ref) => ref.entity).sort()).toEqual([
    "account",
    "transaction",
  ]);
  expect(privateB.createdEntityRefs.map((ref) => ref.entity).sort()).toEqual([
    "account",
    "transaction",
  ]);
  const aIds = new Set(privateA.createdEntityRefs.map((ref) => ref.id));
  expect(privateB.createdEntityRefs.every((ref) => !aIds.has(ref.id))).toBe(
    true
  );
  expect(privateB.createdEntityRefs.map((ref) => ref.id).sort()).toEqual(
    [B_NEW_CASH, B_TRANSACTION].sort()
  );
  for (const ownerId of [OWNER, FOREIGN_OWNER]) {
    const effects = await ownedEffects(fresh, ownerId);
    expect(effects).toHaveLength(1);
    expect(effects[0]?.isEffective).toBe(true);
    expect(effects[0]?.userId).toBe(ownerId);
  }
  return { fresh, a, b };
}

beforeEach(async (): Promise<void> => {
  runtime.__setActiveDatabase(runtime.__originalDatabase);
  mockAuthOwner = OWNER;
  mockAuthReadCount = 0;
  mockAuthGate = null;
  mockCryptoUuidCounter = 0;
  mockWatermelonUuidCounter = 0;
  setGenerator(() => testUuid(30000 + ++mockWatermelonUuidCounter));
  await resetRecoverySqlite();
});
afterEach((): void => {
  mockAuthGate = null;
  mockAuthOwner = OWNER;
  setReviewOwner(OWNER);
  runtime.__setActiveDatabase(runtime.__originalDatabase);
});

describe("#395 T2 owner identity must survive dispatcher-to-recovery handoff", () => {
  it("T2-RED: A/K checked by dispatcher must NOT compensate valid B/K when auth changes during the dedicated scope await", async () => {
    const { fresh, a, b } = await establishTwoRecoverableOwners();
    const before = await physicalSaveLedgerSnapshot(fresh);
    const gate = holdDedicatedScopeRead();
    // Attach both outcomes immediately to avoid unhandled rejections.
    const pending = productionFinancialActionReconciliationService
      .reconcileRejectedAction(ACTION)
      .then(
        (value) => ({ kind: "resolved" as const, value }),
        (error: unknown) => ({ kind: "rejected" as const, error })
      );
    await gate.entered;
    // The dispatcher has already checked A; the ONLY change is OS auth.
    mockAuthOwner = FOREIGN_OWNER;
    gate.release();
    const outcome = await pending;

    // Full raw ledger includes both physical roots, private JSON, created
    // account/transaction members, effect flags, and any SMS/queue rows.
    // Baseline code reconciles B/K: this exact equality is the real RED.
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(before);
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.error).toBeInstanceOf(Error);
    }
    expect((await ownedRoot(fresh, OWNER)).id).toBe(a.id);
    expect((await ownedRoot(fresh, FOREIGN_OWNER)).id).toBe(b.id);
    expect((await ownedRoot(fresh, OWNER)).state).toBe("rejected_compensating");
    expect((await ownedRoot(fresh, FOREIGN_OWNER)).state).toBe(
      "rejected_compensating"
    );
    expect((await ownedEffects(fresh, OWNER))[0]?.isEffective).toBe(true);
    expect((await ownedEffects(fresh, FOREIGN_OWNER))[0]?.isEffective).toBe(
      true
    );
  });

  it("T2-CONTROL: B/K genuinely reconciles and replays under stable B; A/K remains independent and can reconcile under stable A", async () => {
    const { fresh, a, b } = await establishTwoRecoverableOwners();
    mockAuthOwner = FOREIGN_OWNER;
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        ACTION
      )
    ).resolves.toBe("reconciled");
    expect((await ownedRoot(fresh, FOREIGN_OWNER)).id).toBe(b.id);
    expect((await ownedRoot(fresh, FOREIGN_OWNER)).state).toBe("reconciled");
    expect((await ownedEffects(fresh, FOREIGN_OWNER))[0]?.isEffective).toBe(
      false
    );
    expect((await ownedRoot(fresh, OWNER)).id).toBe(a.id);
    expect((await ownedRoot(fresh, OWNER)).state).toBe("rejected_compensating");
    expect((await ownedEffects(fresh, OWNER))[0]?.isEffective).toBe(true);
    const afterB = await physicalSaveLedgerSnapshot(fresh);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        ACTION
      )
    ).resolves.toBe("replay");
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(afterB);

    mockAuthOwner = OWNER;
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        ACTION
      )
    ).resolves.toBe("reconciled");
    expect((await ownedRoot(fresh, OWNER)).state).toBe("reconciled");
    expect((await ownedEffects(fresh, OWNER))[0]?.isEffective).toBe(false);
    const afterBoth = await physicalSaveLedgerSnapshot(fresh);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        ACTION
      )
    ).resolves.toBe("replay");
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(afterBoth);
  });
});
