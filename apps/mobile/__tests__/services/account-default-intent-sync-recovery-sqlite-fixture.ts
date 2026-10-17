/**
 * #395 T069 tests FIRST — actual Add writer + SQLite + protected push and
 * production recovery dispatcher. No invented Add-specific production API.
 *
 * Expected creation Red: zero-guard Add bundle collector; absent durable Add
 * snapshot and tuple-specific recovery. See validation/t069 gap report.
 */
import { createHash, randomUUID } from "node:crypto";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import {
  canonicalizeFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  serializeCanonicalJsonValue,
  type CanonicalJsonValue,
} from "@monyvi/logic";
import { legacyEditBalanceEnvelope } from "../../../../packages/logic/src/financial-actions/__tests__/review-batch-save-fixtures";
import { createAccountReviewFinancialRegistry } from "@/services/account-review-financial-command-service";
import {
  makeSaveFixture,
  OWNER as REVIEW_CREATED_OWNER,
} from "./account-review-save-test-fixtures";
import { saveReview } from "./account-review-local-recovery-test-harness";
import type { CanonicalAccountSnapshot } from "@/services/financial-action-reconciliation-service";
import { parseCanonicalAccountsFromOutcomeJson } from "@/services/account-review-recovery-canonical";
import type { AccountDefaultSnapshot } from "../../../../packages/logic/src/financial-actions/account-create-default";
import {
  parseAccountCreateDefaultLocalRecoverySnapshotJson,
  serializeAccountCreateDefaultLocalRecoverySnapshotJson,
} from "../../../../packages/logic/src/financial-actions/account-create-default-local-recovery";
import { validateReviewBatchSavePayload } from "../../../../packages/logic/src/financial-actions/review-batch-save";
import { physicalText } from "@/services/account-review-local-snapshot-postimages";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";
import type {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  FinancialActionGroup,
  Debt,
  RecurringPayment,
  Category,
} from "@monyvi/db";
import {
  accountFormSchema,
  type AccountFormData,
} from "@/validation/account-validation";
import { assertNoDuplicateAddAccountIdentity } from "@/services/account-service";
import { createAccountDefaultIntentService } from "@/services/account-default-intent-service";
import type { AccountDefaultPreparedCommand } from "@/services/account-default-intent-command";
import { createFinancialActionFoundationRepository } from "@/services/financial-action-foundation-repository";
import {
  createFinancialActionSyncService,
  createFinancialActionPushCoordinator,
} from "@/services/financial-action-sync-service";
import { productionFinancialActionReconciliationService } from "@/services/financial-action-reconciliation-production";
import {
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
  isProtectedFinancialActionRow,
} from "@/services/sync/account-protected-fields";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "@/services/user-data-access";
import type { AppSyncDatabaseChangeSet } from "@/services/sync/types";
import {
  clearAndSeed,
  physicalSaveLedgerSnapshot,
  reopenSqliteLedger,
  type SqliteLedger,
} from "./account-review-save-sqlite-test-helpers";
import { ADD_DEFAULT_IDS } from "../../../../packages/logic/src/financial-actions/__tests__/account-create-default-test-fixtures";

interface TestDbModule {
  readonly database: Database;
  readonly __original: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __setDatabase: (value: Database) => void;
  /** Cold restart must preserve this suite's production-complete models. */
  readonly __reopen: () => Promise<Database>;
}
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
  const actualModels = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models");
  // This suite alone exercises the *new* debt and recurring dependent lanes;
  // the shared Review ledger fixture intentionally does not register those
  // models. Use the actual generated Watermelon classes in THIS test only.
  const debtModel = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Debt")
  >("../../../../packages/db/src/models/Debt");
  const recurringModel = jest.requireActual<
    typeof import("../../../../packages/db/src/models/RecurringPayment")
  >("../../../../packages/db/src/models/RecurringPayment");
  const modelClasses = [
    ...actualModels.LEDGER_MODEL_CLASSES,
    debtModel.Debt,
    recurringModel.RecurringPayment,
  ];
  const adapter = new Adapter({ schema });
  const initial = new wm.Database({ adapter, modelClasses });
  let current = initial;
  return {
    get database(): Database {
      return current;
    },
    __original: initial,
    __adapter: adapter,
    __setDatabase: (value: Database): void => {
      current = value;
    },
    __reopen: async (): Promise<Database> => {
      // The generic Review SQLite helper intentionally omits Debt and
      // RecurringPayment. Its clone silently makes their get() collections
      // null. Retain the SAME real production model registry and the
      // original adapter.testClone(), never a mocked empty query.
      const freshAdapter = await adapter.testClone();
      return new wm.Database({ adapter: freshAdapter, modelClasses });
    },
    Q: wm.Q,
    schema,
    ...Object.fromEntries(modelClasses.map((model) => [model.name, model])),
  };
});
jest.mock("expo-crypto", () => ({
  randomUUID: (): string =>
    jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .randomUUID(),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (_algorithm: string, value: string): Promise<string> =>
    Promise.resolve(
      jest
        .requireActual<typeof import("node:crypto")>("node:crypto")
        .createHash("sha256")
        .update(value, "utf8")
        .digest("hex")
    ),
}));
let mockActiveAddOwner = ADD_DEFAULT_IDS.owner;
export function setMockActiveAddOwner(ownerId: string): void {
  mockActiveAddOwner = ownerId;
}
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockActiveAddOwner),
  supabase: {},
}));
jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/intro-flag-service", () => ({
  readIntroLocaleOverride: (): Promise<null> => Promise.resolve(null),
}));

export const moduleDb = jest.requireMock<TestDbModule>("@monyvi/db");
export const ledger: SqliteLedger = {
  database: moduleDb.__original,
  adapter: moduleDb.__adapter,
};
export const OWNER = ADD_DEFAULT_IDS.owner;
export const hashProvider = {
  digestUtf8: (bytes: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(bytes, "utf8").digest("hex")),
};

/**
 * Construct only actual canonical JSON values from typed fixture data.
 * Reject unsupported numbers, undefined, Date and objects with prototypes:
 * passing an arbitrary Record/CanonicalAccountSnapshot as CanonicalJsonValue
 * would bypass the schema boundary and obscure meaningful financial Reds.
 */
export function canonicalFixtureValue(input: unknown): CanonicalJsonValue {
  if (input === null || typeof input === "string" || typeof input === "boolean")
    return input;
  if (Array.isArray(input)) return input.map(canonicalFixtureValue);
  if (
    typeof input !== "object" ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    throw new Error("t069_invalid_noncanonical_fixture_value");
  const result: Record<string, CanonicalJsonValue> = {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = canonicalFixtureValue(value);
  }
  return result;
}
export function serializeCanonicalFixture(value: unknown): string {
  return serializeCanonicalJsonValue(canonicalFixtureValue(value));
}

export function form(
  name: string,
  opening: string,
  intent: boolean,
  accountType: AccountFormData["accountType"] = "BANK"
): AccountFormData {
  return accountFormSchema.parse({
    name,
    balance: opening,
    accountType,
    defaultIntent: intent,
    currency: "EGP",
    institutionId: accountType === "BANK" ? "cib" : null,
    providerDisplayName: accountType === "BANK" ? "CIB" : "",
    senderNames: accountType === "CASH" ? [] : ["CIBEGYPT"],
    cardLast4: accountType === "BANK" ? "0007" : "",
  });
}
export function addService(
  db: Database = ledger.database
): ReturnType<typeof createAccountDefaultIntentService> {
  return createAccountDefaultIntentService({
    database: db,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    assertNoDuplicateAccountIdentity: assertNoDuplicateAddAccountIdentity,
    createId: (): string => randomUUID(),
    now: (): Date => new Date("2026-10-16T11:00:00.000Z"),
    hashProvider,
  });
}
export function foundation(
  db: Database = moduleDb.database
): ReturnType<typeof createFinancialActionFoundationRepository> {
  return createFinancialActionFoundationRepository({
    database: db,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    registry: createAccountReviewFinancialRegistry(),
  });
}
export async function prepareAndCommit(
  name: string,
  opening: string,
  intent: boolean,
  type: AccountFormData["accountType"] = "BANK"
): Promise<AccountDefaultPreparedCommand> {
  const svc = addService();
  const original = await svc.prepare(OWNER, form(name, opening, intent, type));
  await expect(svc.commitPrepared(original)).resolves.toMatchObject({
    kind: "committed",
    accountId: original.accountId,
  });
  return original;
}
export async function root(
  actionId: string,
  db: Database = moduleDb.database
): Promise<FinancialActionGroup> {
  const rows = await db
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("action_id", actionId))
    .fetch();
  if (rows.length !== 1 || !rows[0])
    throw new Error("missing_actual_add_action_root");
  return rows[0];
}
export async function effects(
  actionId: string,
  db: Database = moduleDb.database
): Promise<readonly AccountFinancialEffect[]> {
  return db
    .get<AccountFinancialEffect>("account_financial_effects")
    .query(Q.where("action_id", actionId))
    .fetch();
}
export async function coldRestart(): Promise<Database> {
  const db = await moduleDb.__reopen();
  // All production services use the dynamically bound same singleton.
  moduleDb.__setDatabase(db);
  return db;
}

/** Dirty sync material is read from REAL prepared-and-committed SQLite rows. */
const ADD_TABLES = [
  "financial_action_groups",
  "accounts",
  "bank_details",
  "account_sms_senders",
  "account_financial_effects",
] as const;
export async function physicalDirtyChanges(
  db: Database = ledger.database
): Promise<AppSyncDatabaseChangeSet> {
  const changes: AppSyncDatabaseChangeSet = {};
  for (const table of ADD_TABLES) {
    const rows = await db.get<Model>(table).query().fetch();
    const created = rows
      .filter((row) => row._raw._status === "created")
      .map((row) => ({ ...row._raw }));
    const updated = rows
      .filter((row) => row._raw._status === "updated")
      .map((row) => ({ ...row._raw }));
    const deleted = rows
      .filter((row) => row._raw._status === "deleted")
      .map((row) => row.id);
    const tableChanges: SyncTableChangeSet = { created, updated, deleted };
    changes[table] = tableChanges;
  }
  return changes;
}
export interface PhysicalOwnedAccountPostimage {
  readonly id: string;
  readonly values: Readonly<Record<string, unknown>>;
}
export function isPhysicalColumnPair(
  value: unknown
): value is readonly [string, unknown] {
  return (
    Array.isArray(value) && value.length === 2 && typeof value[0] === "string"
  );
}
/** Preserve every persisted owned account value except Watermelon bookkeeping. */
export function activeOwnedAccountPostimages(
  snapshot: Awaited<ReturnType<typeof physicalSaveLedgerSnapshot>>,
  ownerId: string
): readonly PhysicalOwnedAccountPostimage[] {
  const table = snapshot.find((entry) => entry.table === "accounts");
  if (!table) throw new Error("missing_physical_accounts_snapshot");
  const active: PhysicalOwnedAccountPostimage[] = [];
  for (const encoded of table.rows) {
    const parsed: unknown = JSON.parse(encoded);
    if (!Array.isArray(parsed) || !parsed.every(isPhysicalColumnPair)) {
      throw new Error("invalid_physical_account_snapshot");
    }
    const raw: Readonly<Record<string, unknown>> = Object.fromEntries(parsed);
    if (raw.user_id !== ownerId) continue;
    if (typeof raw.id !== "string" || typeof raw.deleted !== "boolean") {
      throw new Error("invalid_owned_account_snapshot");
    }
    if (raw.deleted) continue;
    const values = Object.fromEntries(
      Object.entries(raw).filter(
        ([key]) =>
          !["_status", "_changed", "created_at", "updated_at"].includes(key)
      )
    );
    active.push({ id: raw.id, values });
  }
  return active.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  );
}

export function accepted(
  command: AccountDefaultPreparedCommand
): Readonly<Record<string, unknown>> {
  return {
    actionId: command.envelope.actionId,
    status: "accepted",
    // Actual SQL091 zero-opening INSERT is revision 0 with NO receipt
    // accountRevisions; nonzero opening is revision 1 with exactly its
    // original created account ID. Do not fabricate financial acceptance.
    accountRevisions: command.effectId
      ? [{ accountId: command.accountId, revision: "1" }]
      : [],
    effectiveEventId: null,
    holdingRevision: null,
    serverAcceptedAt: "2026-10-16T11:00:00.000Z",
  };
}
export function actionSync(
  invoke: (input: {
    readonly payloadHash: string;
    readonly payloadJson: string;
  }) => Promise<unknown>,
  db: Database = moduleDb.database
): ReturnType<typeof createFinancialActionSyncService> {
  return createFinancialActionSyncService({
    foundationRepository: foundation(db),
    invokeAccountFinancialActionRpc: invoke,
  });
}
interface AddRejectionFixtureOptions {
  readonly canonicalDefaultSnapshot?: AccountDefaultSnapshot | null;
  readonly omitDefaultGraph?: boolean;
  readonly absentAccountIds?: readonly string[];
  /** Malformed unknown response key: negative proof only. */
  readonly extraReceiptKey?: string;
  readonly canonicalAccounts?: readonly CanonicalAccountSnapshot[];
}
export async function markRejected(
  command: AccountDefaultPreparedCommand,
  outcome: "stale" | "rejected" = "stale",
  options: AddRejectionFixtureOptions = {}
): Promise<void> {
  const repo = foundation();
  await repo.markFinancialActionGroupSyncPending(command.envelope.actionId);
  // SQL091 at 385d0b7: a 23505/domain-conflict business receipt has six
  // keys. The stale branch has TEN, including null canonical holding fields
  // and staleAccountIds. Neither is the invented seven-key old fixture.
  const code =
    outcome === "stale" ? "ACCOUNT_REVISION_STALE" : "DOMAIN_UNIQUE_CONFLICT";
  const graph =
    options.canonicalDefaultSnapshot === undefined
      ? command.snapshot
      : options.canonicalDefaultSnapshot;
  const common = {
    actionId: command.envelope.actionId,
    status: outcome,
    code,
    canonicalAccounts: [...(options.canonicalAccounts ?? [])],
    canonicalAbsentAccountIds: [
      ...(options.absentAccountIds ?? [command.accountId]),
    ],
    ...(options.omitDefaultGraph
      ? {}
      : {
          canonicalDefaultSnapshot:
            graph === null
              ? null
              : {
                  activeAccountIds: [...graph.activeAccountIds],
                  defaultAccount:
                    graph.defaultAccount === null
                      ? null
                      : {
                          accountId: graph.defaultAccount.accountId,
                          isDefault: true as const,
                        },
                },
        }),
    ...(options.extraReceiptKey
      ? { unexpectedReceiptKey: options.extraReceiptKey }
      : {}),
  };
  const actualSqlShape =
    outcome === "stale"
      ? {
          ...common,
          canonicalHoldingActionId: null,
          canonicalHoldingEvidenceHash: null,
          canonicalHoldingRevision: null,
          staleAccountIds: [],
        }
      : common;
  await repo.recordFinancialActionGroupServerOutcome(
    command.envelope.actionId,
    outcome,
    serializeCanonicalFixture(actualSqlShape),
    code
  );
}

/** Real owned A state: server retains original name while later local
 * metadata changes are independent LWW intent. */
export async function seedPriorA(name = "Prior default"): Promise<void> {
  await moduleDb.database.write(async (): Promise<void> => {
    const a = moduleDb.database
      .get<Account>("accounts")
      .prepareCreate((row) => {
        row._raw.id = ADD_DEFAULT_IDS.previous;
        row.userId = OWNER;
        row.name = name;
        row.type = "CASH";
        row.currency = "EGP";
        row.balance = 90;
        row.financialRevision = "0";
        row.isDefault = true;
        row.deleted = false;
      });
    await moduleDb.database.batch(a);
  });
}

export function rootCacheBytes(models: readonly Model[]): readonly string[] {
  return models.map((model) =>
    JSON.stringify({
      table: model.table,
      id: model.id,
      raw: model._raw,
      preparedState: model._preparedState,
      editing: model._isEditing,
    })
  );
}

/** Rejected outcomes remain immutable; don't treat weak receipt evidence
 * as authority to change financial or private device state. */
export async function expectRecoveryRefusedWithoutWrites(
  command: AccountDefaultPreparedCommand,
  db: Database
): Promise<void> {
  const before = await physicalSaveLedgerSnapshot(db);
  const original = await root(command.envelope.actionId, db);
  const privateBytes = original.localRecoverySnapshotJson;
  await expect(
    productionFinancialActionReconciliationService.reconcileRejectedAction(
      command.envelope.actionId
    )
  ).rejects.toThrow();
  expect(await physicalSaveLedgerSnapshot(db)).toEqual(before);
  const unchanged = await root(command.envelope.actionId, db);
  expect(unchanged.localRecoverySnapshotJson).toBe(privateBytes);
  expect(["rejected_compensating", "reconciliation_incomplete"]).toContain(
    unchanged.state
  );
}

beforeEach(async (): Promise<void> => {
  mockActiveAddOwner = OWNER;
  moduleDb.__setDatabase(moduleDb.__original);
  jest.restoreAllMocks();
  await ledger.adapter.initializingPromise;
  await clearAndSeed(ledger.database, { onlyCategories: true });
});
afterEach((): void => {
  mockActiveAddOwner = OWNER;
  moduleDb.__setDatabase(moduleDb.__original);
});

export async function insertActualDependent(
  db: Database,
  accountId: string,
  kind: "recurring_payments" | "debts"
): Promise<Model> {
  const at = new Date("2026-10-16T12:00:00.000Z");
  if (kind === "debts") {
    return db.write(async (): Promise<Model> => {
      const debt = db.get<Debt>("debts").prepareCreate((row) => {
        row.userId = OWNER;
        row.accountId = accountId;
        row.partyName = "Newer user debt";
        row.type = "LENT";
        row.status = "ACTIVE";
        row.originalAmount = 30;
        row.outstandingAmount = 30;
        row.date = at;
        row.deleted = false;
      });
      await db.batch(debt);
      return debt;
    });
  }
  return db.write(async (): Promise<Model> => {
    // The baseline seed supplies Review-owner categories, not this Add owner.
    // Create a genuine Add-owned category in the same SQLite writer rather
    // than accidentally referencing a foreign-owner fixture category.
    const category = db.get<Category>("categories").prepareCreate((row) => {
      row.userId = OWNER;
      row.type = "EXPENSE";
      row.deleted = false;
      row.displayName = "R2 owned recurring category";
      row.systemName = "r2_owned_recurring_category";
      row.isSystem = false;
      row.isHidden = false;
      row.isInternal = false;
      row.icon = "wallet-outline";
      row.iconLibrary = "Ionicons";
      row.level = 0;
      row.usageCount = 0;
    });
    const recurring = db
      .get<RecurringPayment>("recurring_payments")
      .prepareCreate((row) => {
        row.userId = OWNER;
        row.accountId = accountId;
        row.categoryId = category.id;
        row.name = "Later recurring charge";
        row.currency = "EGP";
        row.amount = 30;
        row.action = "NOTIFY";
        row.frequency = "MONTHLY";
        row.startDate = at;
        row.nextDueDate = at;
        row.financialRevision = "0";
        row.type = "EXPENSE";
        row.status = "ACTIVE";
        row.deleted = false;
      });
    await db.batch(category, recurring);
    return recurring;
  });
}

/**
 * External SQL091 stale graph evidence: server still has original owned A
 * (balance 90 EGP) and concurrently has distinct C (0 EGP), never losing B.
 * Canonical evidence hashes use the REAL existing server-account hash contract
 * and original owner; no invented B-postimage, device writer or reverse effect.
 */
export async function canonicalServerAccount(
  accountId: string,
  balanceMinorUnits: string
): Promise<CanonicalAccountSnapshot> {
  const original = {
    accountId,
    balanceMinorUnits,
    canonicalActionId: null,
    canonicalRevision: "0",
    currency: "EGP",
    effectChain: [],
  };
  return {
    ...original,
    canonicalEvidenceHash: await hashProvider.digestUtf8(
      serializeCanonicalFixture({ ...original, userId: OWNER })
    ),
  };
}

export async function replaceDurableAddDependencies(
  command: AccountDefaultPreparedCommand,
  replacements: ReadonlyArray<{
    readonly actionId: string;
    readonly payloadHash: string;
  }>,
  db: Database = moduleDb.database
): Promise<void> {
  const current = await root(command.envelope.actionId, db);
  if (typeof current.localRecoverySnapshotJson !== "string")
    throw new Error("missing_genuine_private_add_dependency_snapshot");
  const parsed = parseAccountCreateDefaultLocalRecoverySnapshotJson({
    json: current.localRecoverySnapshotJson,
    expectedRoot: {
      actionId: command.envelope.actionId,
      ownerId: command.ownerId,
      domainReferenceId: command.accountId,
      payloadHash: current.payloadHash,
      expectedDefaultSnapshot: command.snapshot,
    },
  });
  expect(parsed.dependencyRoots).toEqual(command.dependencyRoots);
  await db.write(() =>
    db.batch(
      current.prepareUpdate((row) => {
        // Only the vulnerable device-private array is changed. The original
        // immutable envelope/root hash, full active/default graph and financial
        // physical postimages are unchanged.
        // Device-private test tampering retains the complete strict
        // twelve-key original structure. Only the captured creator journal
        // is intentionally changed; no arbitrary JSON casts are permitted.
        row.localRecoverySnapshotJson =
          serializeAccountCreateDefaultLocalRecoverySnapshotJson({
            ...parsed,
            dependencyRoots: [...replacements],
          });
      })
    )
  );
  const modified = await root(command.envelope.actionId, db);
  const modifiedPrivate = modified.localRecoverySnapshotJson;
  if (typeof modifiedPrivate !== "string")
    throw new Error("r5_missing_modified_private_dependency_journal");
  expect(
    parseAccountCreateDefaultLocalRecoverySnapshotJson({
      json: modifiedPrivate,
      expectedRoot: {
        actionId: command.envelope.actionId,
        ownerId: command.ownerId,
        domainReferenceId: command.accountId,
        payloadHash: modified.payloadHash,
        expectedDefaultSnapshot: command.snapshot,
      },
    }).dependencyRoots
  ).toEqual(replacements);
}

export async function prepareRealReviewCreatorDependency(): Promise<{
  readonly ancestor: FinancialActionGroup;
  readonly successor: AccountDefaultPreparedCommand;
  readonly canonicalReceipt: Readonly<Record<string, unknown>>;
  readonly createdAccountId: string;
}> {
  mockActiveAddOwner = REVIEW_CREATED_OWNER;
  const review = makeSaveFixture("voice-cash");
  await expect(saveReview(review, ledger.database)).resolves.toMatchObject({
    kind: "committed",
  });
  const candidates = await ledger.database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(Q.where("action_id", review.intent.actionId))
    .fetch();
  const ancestor = candidates[0];
  if (candidates.length !== 1 || !ancestor)
    throw new Error("r4_no_genuine_review_creator_root");
  const envelope = parseFinancialActionEnvelopeJson(
    ancestor.payloadJson,
    createAccountReviewFinancialRegistry()
  );
  if (
    envelope.kind !== "review_batch_save" ||
    envelope.payloadVersion !== "review.batch-save/v1"
  )
    throw new Error("r4_not_genuine_review_action");
  const originalReviewPayload = validateReviewBatchSavePayload(
    envelope.payload
  );
  const records = originalReviewPayload.domainMutation.records.filter(
    (record) => record.entity === "account" && record.mode === "create"
  );
  const accountRecord = records[0];
  if (
    !accountRecord ||
    accountRecord.entity !== "account" ||
    records.length !== 1
  )
    throw new Error("r4_expected_exactly_one_review_created_account");
  const createdAccountId = accountRecord.after.id;
  // This particular real voice-cash Save creates exactly this account;
  // SQL090's closed accepted accountRevisions include every created
  // account and every financially effected pre-existing account. The
  // fixture refuses silently truncated receipts if its true writer shape
  // ever changes to touch another account.
  if (
    originalReviewPayload.accountEffects.some(
      (effect) => effect.accountId !== createdAccountId
    )
  )
    throw new Error("r4_unexpected_additional_accepted_revision_member");
  const accountA = await ledger.database
    .get<Account>("accounts")
    .find(createdAccountId);
  expect(accountA.userId).toBe(REVIEW_CREATED_OWNER);
  const canonicalReceipt: Readonly<Record<string, unknown>> = {
    actionId: ancestor.actionId,
    status: "accepted",
    accountRevisions: [{ accountId: createdAccountId, revision: "1" }],
    effectiveEventId: null,
    holdingRevision: null,
    serverAcceptedAt: "2026-10-16T11:00:00.000Z",
  };
  // B must be physically committed WHILE its genuine Review creator is
  // unresolved. Accepting R before B.prepare would correctly give B an
  // empty predecessor list, so this ordering is part of the real test.
  const svc = addService(ledger.database);
  const successor = await svc.prepare(
    REVIEW_CREATED_OWNER,
    form("Dependent on real Review A", "0", true, "CASH")
  );
  expect(successor.dependencyActionIds).toEqual([ancestor.actionId]);
  expect(successor.dependencyRoots).toEqual([
    {
      actionId: ancestor.actionId,
      payloadHash: ancestor.payloadHash,
    },
  ]);
  await expect(svc.commitPrepared(successor)).resolves.toMatchObject({
    kind: "committed",
    accountId: successor.accountId,
  });
  const repo = foundation(ledger.database);
  await repo.markFinancialActionGroupSyncPending(ancestor.actionId);
  await repo.recordFinancialActionGroupServerOutcome(
    ancestor.actionId,
    "accepted",
    serializeCanonicalFixture(canonicalReceipt),
    null
  );
  await markRejected(successor, "rejected");
  // The ACTUAL foundation state machine maps SQL091 rejected (23505)
  // to reconciliation_incomplete, reserving rejected_compensating for stale.
  // The six-field bound receipt, action bytes and server outcome remain real.
  const rejectedRoot = await root(successor.envelope.actionId, ledger.database);
  expect(rejectedRoot.state).toBe("reconciliation_incomplete");
  expect(rejectedRoot.serverOutcome).toBe("rejected");
  expect(rejectedRoot.rejectionCode).toBe("domain_unique_conflict");
  expect(rejectedRoot.outcomeJson).toContain('"canonicalDefaultSnapshot"');
  return { ancestor, successor, canonicalReceipt, createdAccountId };
}

export {
  createHash,
  randomUUID,
  Q,
  canonicalizeFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  serializeCanonicalJsonValue,
  legacyEditBalanceEnvelope,
  createAccountReviewFinancialRegistry,
  makeSaveFixture,
  REVIEW_CREATED_OWNER,
  saveReview,
  parseCanonicalAccountsFromOutcomeJson,
  parseAccountCreateDefaultLocalRecoverySnapshotJson,
  serializeAccountCreateDefaultLocalRecoverySnapshotJson,
  validateReviewBatchSavePayload,
  physicalText,
  accountFormSchema,
  assertNoDuplicateAddAccountIdentity,
  createAccountDefaultIntentService,
  createFinancialActionFoundationRepository,
  createFinancialActionSyncService,
  createFinancialActionPushCoordinator,
  productionFinancialActionReconciliationService,
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
  isProtectedFinancialActionRow,
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
  clearAndSeed,
  physicalSaveLedgerSnapshot,
  reopenSqliteLedger,
  ADD_DEFAULT_IDS,
};
export type {
  Database,
  Model,
  CanonicalJsonValue,
  CanonicalAccountSnapshot,
  AccountDefaultSnapshot,
  SQLiteAdapter,
  SyncTableChangeSet,
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  FinancialActionGroup,
  Debt,
  RecurringPayment,
  Category,
  AccountFormData,
  AccountDefaultPreparedCommand,
  AppSyncDatabaseChangeSet,
  SqliteLedger,
};
