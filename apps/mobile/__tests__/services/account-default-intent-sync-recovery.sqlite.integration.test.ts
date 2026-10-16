/**
 * #395 T069 tests FIRST — actual Add writer + SQLite + protected push and
 * production recovery dispatcher. No invented Add-specific production API.
 *
 * Expected creation Red: zero-guard Add bundle collector; absent durable Add
 * snapshot and tuple-specific recovery. See validation/t069 gap report.
 */
import { createHash, randomUUID } from "node:crypto";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";
import type {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  FinancialActionGroup,
} from "@monyvi/db";
import type { AccountFormData } from "@/validation/account-validation";
import { accountFormSchema } from "@/validation/account-validation";
import {
  assertNoDuplicateAddAccountIdentity,
} from "@/services/account-service";
import {
  createAccountDefaultIntentService,
} from "@/services/account-default-intent-service";
import type {
  AccountDefaultPreparedCommand,
} from "@/services/account-default-intent-command";
import {
  createFinancialActionFoundationRepository,
} from "@/services/financial-action-foundation-repository";
import {
  createAccountReviewFinancialRegistry,
} from "@/services/account-review-financial-command-service";
import {
  createFinancialActionSyncService,
  createFinancialActionPushCoordinator,
  FINANCIAL_ACTION_SYNC_ERROR_CODES,
} from "@/services/financial-action-sync-service";
import {
  productionFinancialActionReconciliationService,
} from "@/services/financial-action-reconciliation-production";
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
import {
  ADD_DEFAULT_IDS,
} from "../../../../packages/logic/src/financial-actions/__tests__/account-create-default-test-fixtures";

interface TestDbModule {
  readonly database: Database;
  readonly __original: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __setDatabase: (value: Database) => void;
}
jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual("@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js")
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
  const adapter = new Adapter({ schema });
  const initial = new wm.Database({
    adapter, modelClasses: actualModels.LEDGER_MODEL_CLASSES,
  });
  let current = initial;
  return {
    get database(): Database { return current; },
    __original: initial, __adapter: adapter,
    __setDatabase: (value: Database): void => { current = value; },
    Q: wm.Q, schema,
    ...Object.fromEntries(
      actualModels.LEDGER_MODEL_CLASSES.map((model) => [model.name, model])
    ),
  };
});
jest.mock("expo-crypto", () => ({
  randomUUID: (): string =>
    jest.requireActual<typeof import("node:crypto")>("node:crypto").randomUUID(),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (_algorithm: string, value: string): Promise<string> =>
    Promise.resolve(
      jest.requireActual<typeof import("node:crypto")>("node:crypto")
        .createHash("sha256").update(value, "utf8").digest("hex")
    ),
}));
let mockActiveAddOwner = ADD_DEFAULT_IDS.owner;
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

const moduleDb = jest.requireMock<TestDbModule>("@monyvi/db");
const ledger: SqliteLedger = {
  database: moduleDb.__original,
  adapter: moduleDb.__adapter,
};
const OWNER = ADD_DEFAULT_IDS.owner;
const hashProvider = {
  digestUtf8: (bytes: string): Promise<string> => Promise.resolve(
    createHash("sha256").update(bytes, "utf8").digest("hex")
  ),
};
function form(
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
function addService(db: Database = ledger.database):
ReturnType<typeof createAccountDefaultIntentService> {
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
function foundation(db: Database = moduleDb.database):
ReturnType<typeof createFinancialActionFoundationRepository> {
  return createFinancialActionFoundationRepository({
    database: db,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    registry: createAccountReviewFinancialRegistry(),
  });
}
async function prepareAndCommit(
  name: string, opening: string, intent: boolean,
  type: AccountFormData["accountType"] = "BANK"
): Promise<AccountDefaultPreparedCommand> {
  const svc = addService();
  const original = await svc.prepare(OWNER, form(name, opening, intent, type));
  await expect(svc.commitPrepared(original)).resolves.toMatchObject({
    kind: "committed", accountId: original.accountId,
  });
  return original;
}
async function root(
  actionId: string,
  db: Database = moduleDb.database
): Promise<FinancialActionGroup> {
  const rows = await db.get<FinancialActionGroup>(
    "financial_action_groups"
  ).query(Q.where("action_id", actionId)).fetch();
  if (rows.length !== 1 || !rows[0])
    throw new Error("missing_actual_add_action_root");
  return rows[0];
}
async function effects(
  actionId: string,
  db: Database = moduleDb.database
): Promise<readonly AccountFinancialEffect[]> {
  return db.get<AccountFinancialEffect>("account_financial_effects")
    .query(Q.where("action_id", actionId)).fetch();
}
async function coldRestart(): Promise<Database> {
  const db = await reopenSqliteLedger(ledger);
  moduleDb.__setDatabase(db);
  return db;
}

/** Dirty sync material is read from REAL prepared-and-committed SQLite rows. */
const ADD_TABLES = [
  "financial_action_groups", "accounts", "bank_details",
  "account_sms_senders", "account_financial_effects",
] as const;
async function physicalDirtyChanges(
  db: Database = ledger.database
): Promise<AppSyncDatabaseChangeSet> {
  const changes: AppSyncDatabaseChangeSet = {};
  for (const table of ADD_TABLES) {
    const rows = await db.get<Model>(table).query().fetch();
    const created = rows.filter((row) => row._raw._status === "created")
      .map((row) => ({ ...row._raw }));
    const updated = rows.filter((row) => row._raw._status === "updated")
      .map((row) => ({ ...row._raw }));
    const deleted = rows.filter((row) => row._raw._status === "deleted")
      .map((row) => row.id);
    const tableChanges: SyncTableChangeSet = { created, updated, deleted };
    changes[table] = tableChanges;
  }
  return changes;
}
function accepted(command: AccountDefaultPreparedCommand):
Readonly<Record<string, unknown>> {
  return {
    actionId: command.envelope.actionId,
    status: "accepted",
    accountRevisions: command.effectId
      ? [{ accountId: command.accountId, revision: "1" }]
      : [],
    effectiveEventId: null,
    holdingRevision: null,
    serverAcceptedAt: "2026-10-16T11:00:00.000Z",
  };
}
function stale(command: AccountDefaultPreparedCommand):
Readonly<Record<string, unknown>> {
  return {
    actionId: command.envelope.actionId,
    status: "stale",
    code: "REVISION_STALE",
    accountRevisions: [],
    canonicalAccounts: [],
    canonicalAbsentAccountIds: [command.accountId],
  };
}
function actionSync(
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
async function markRejected(
  command: AccountDefaultPreparedCommand,
  outcome: "stale" | "rejected" = "stale"
): Promise<void> {
  const repo = foundation();
  await repo.markFinancialActionGroupSyncPending(command.envelope.actionId);
  const current = {
    ...stale(command), status: outcome,
    code: outcome === "stale" ? "REVISION_STALE" : "DOMAIN_UNIQUE_CONFLICT",
  };
  await repo.recordFinancialActionGroupServerOutcome(
    command.envelope.actionId, outcome, JSON.stringify(current), current.code
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

describe("#395 T069 — real Add financial writer → protected dirty group", () => {
  it("A01 first zero-opening Add has one genuine account/root, no fake effect, and a dispatchable protected bundle", async () => {
    const command = await prepareAndCommit("First Cash", "0", false, "CASH");
    const db = await coldRestart();
    const actualRoot = await root(command.envelope.actionId, db);
    expect(actualRoot.kind).toBe("create_with_default");
    expect(actualRoot.payloadJson).toContain('"account.create-default/v1"');
    expect(command.envelope.accountGuards).toEqual([]);
    expect(await effects(command.envelope.actionId, db)).toHaveLength(0);
    const account = await db.get<Account>("accounts").find(command.accountId);
    expect(account).toMatchObject({
      isDefault: true, financialRevision: "0", balance: 0,
    });
    const changes = await physicalDirtyChanges(db);
    const bundles = collectAccountFinancialActionPushBundles(changes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.candidate).toEqual({
      actionId: command.envelope.actionId,
      payloadHash: actualRoot.payloadHash,
      payloadJson: actualRoot.payloadJson,
      state: "local_complete",
    });
    expect(bundles[0]?.rowIds).toEqual({
      accounts: [command.accountId],
      financial_action_groups: [actualRoot.id],
    });
  });

  it("A02 zero-opening Bank and its actual bank/sender children never escape generic LWW", async () => {
    const command = await prepareAndCommit("First Bank", "0", true);
    const db = await coldRestart();
    const changes = await physicalDirtyChanges(db);
    const excluded = collectProtectedFinancialActionRowIds(changes);
    expect(isProtectedFinancialActionRow(
      excluded, "accounts", command.accountId
    )).toBe(true);
    expect(isProtectedFinancialActionRow(
      excluded, "bank_details", command.bankDetailId
    )).toBe(true);
    for (const sender of command.senders) {
      expect(isProtectedFinancialActionRow(
        excluded, "account_sms_senders", sender.id
      )).toBe(true);
    }
    expect(await effects(command.envelope.actionId, db)).toHaveLength(0);
    const bundles = collectAccountFinancialActionPushBundles(changes);
    expect(bundles[0]?.rowIds).toEqual(expect.objectContaining({
      bank_details: [command.bankDetailId],
      account_sms_senders: command.senders.map((item) => item.id),
    }));
    expect(bundles[0]?.rowIds.account_financial_effects).toBeUndefined();
  });

  it("A03 nonzero Add protects exactly one real financial effect and root without generic inverse", async () => {
    const command = await prepareAndCommit("Opening 10.01", "10.01", true);
    const db = await coldRestart();
    const posted = await effects(command.envelope.actionId, db);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      accountId: command.accountId, amountMinorUnits: "1001",
      acceptedAccountRevision: "1", isEffective: true,
    });
    const changes = await physicalDirtyChanges(db);
    const blocked = collectProtectedFinancialActionRowIds(changes);
    expect(isProtectedFinancialActionRow(
      blocked, "account_financial_effects", command.effectId
    )).toBe(true);
    expect(isProtectedFinancialActionRow(
      blocked, "accounts", command.accountId
    )).toBe(true);
    const bundles = collectAccountFinancialActionPushBundles(changes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]?.rowIds.account_financial_effects)
      .toEqual([command.effectId]);
  });

  it("A04 genuine Add action transmits its immutable bytes exactly once; never a generic account upsert", async () => {
    const command = await prepareAndCommit("Single Account", "0", false, "CASH");
    const dirty = await physicalDirtyChanges();
    const actualRoot = await root(command.envelope.actionId);
    const dispatched: Array<{ payloadHash: string; payloadJson: string }> = [];
    const coordinator = createFinancialActionPushCoordinator({
      ...foundation(),
      getFinancialActionGroup: foundation().getFinancialActionGroup,
      invokeAccountFinancialActionRpc: (input) => {
        dispatched.push({ ...input });
        return Promise.resolve(accepted(command));
      },
    });
    const bundles = collectAccountFinancialActionPushBundles(dirty);
    const first = await coordinator.coordinatePush(
      bundles.map((bundle) => bundle.candidate)
    );
    expect(dispatched).toEqual([{
      payloadHash: actualRoot.payloadHash,
      payloadJson: actualRoot.payloadJson,
    }]);
    expect(first.decisions).toHaveLength(1);
    expect(first.decisions[0]?.disposition).toBe("acknowledge");
    const acknowledged = {
      ...bundles[0]?.candidate, state: "accepted",
    };
    if (!acknowledged.actionId || !acknowledged.payloadHash ||
        !acknowledged.payloadJson)
      throw new Error("missing_genuine_add_candidate");
    const repeat = await coordinator.coordinatePush([acknowledged]);
    expect(repeat.decisions[0]?.disposition).toBe("acknowledge");
    expect(dispatched).toHaveLength(1);
    expect(await effects(command.envelope.actionId)).toHaveLength(0);
  });
});

describe("#395 T069 — immutable Add transport, root and replay", () => {
  it("A05 transport retry resends byte-identical action after an actual sync_failed root", async () => {
    const command = await prepareAndCommit("Offline Add", "0", false, "CASH");
    const original = await root(command.envelope.actionId);
    const attempted: Array<{ payloadHash: string; payloadJson: string }> = [];
    let failTransport = true;
    const sync = actionSync((input) => {
      attempted.push({ ...input });
      if (failTransport) return Promise.reject(new Error("offline_transport"));
      return Promise.resolve(accepted(command));
    });
    await expect(sync.syncAction(command.envelope.actionId))
      .rejects.toThrow("offline_transport");
    expect((await root(command.envelope.actionId)).state).toBe("sync_failed");
    failTransport = false;
    await sync.syncAction(command.envelope.actionId);
    expect(attempted).toEqual([
      { payloadHash: original.payloadHash, payloadJson: original.payloadJson },
      { payloadHash: original.payloadHash, payloadJson: original.payloadJson },
    ]);
    expect((await root(command.envelope.actionId)).state).toBe("accepted");
  });

  it("A06 successful accepted Add and local replay never duplicate the account, root or opening effect", async () => {
    const command = await prepareAndCommit("Accepted Add", "10.01", true);
    const sync = actionSync(() => Promise.resolve(accepted(command)));
    await sync.syncAction(command.envelope.actionId);
    const before = await physicalSaveLedgerSnapshot(await coldRestart());
    const rootRow = await root(command.envelope.actionId);
    expect(rootRow.serverOutcome).toBe("accepted");
    expect(rootRow.outcomeJson).toContain('"status":"accepted"');
    expect((await addService(moduleDb.database).commitPrepared(command)).kind)
      .toBe("replay");
    expect(await physicalSaveLedgerSnapshot(moduleDb.database)).toEqual(before);
    expect(await effects(command.envelope.actionId)).toHaveLength(1);
  });

  it("A07 idempotent remote response stores replay outcome without rebuilding a local effect", async () => {
    const command = await prepareAndCommit("Remote Replay", "0", false, "CASH");
    const sync = actionSync(() => Promise.resolve({
      ...accepted(command), status: "idempotent",
    }));
    await sync.syncAction(command.envelope.actionId);
    const actual = await root(command.envelope.actionId);
    expect(actual.serverOutcome).toBe("idempotent");
    expect(actual.outcomeJson).toContain('"status":"idempotent"');
    expect(await effects(command.envelope.actionId)).toHaveLength(0);
    expect((await addService().commitPrepared(command)).kind).toBe("replay");
  });
});

describe("#395 T069 — rejected/stale Add must restore complete physical state", () => {
  it.each(["0", "10.01"])(
    "A08 stale opening %s restores created account/children/default/effect after cold SQLite restart",
    async (opening): Promise<void> => {
      const db = ledger.database;
      await db.write(async (): Promise<void> => {
        const previous = db.get<Account>("accounts").prepareCreate((row) => {
          row._raw.id = ADD_DEFAULT_IDS.previous;
          row.userId = OWNER; row.name = "Prior default";
          row.type = "CASH"; row.currency = "EGP";
          row.balance = 90; row.financialRevision = "0";
          row.isDefault = true; row.deleted = false;
        });
        await db.batch(previous);
      });
      const before = await physicalSaveLedgerSnapshot(db);
      const command = await prepareAndCommit("New default", opening, true);
      const active = await db.get<Account>("accounts").find(command.accountId);
      expect(active.isDefault).toBe(true);
      expect((await db.get<Account>("accounts")
        .find(ADD_DEFAULT_IDS.previous)).isDefault).toBe(false);
      await markRejected(command);
      const fresh = await coldRestart();
      const queued = await root(command.envelope.actionId, fresh);
      expect(queued.state).toBe("rejected_compensating");
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          command.envelope.actionId
        )
      ).resolves.toBe("reconciled");
      const post = await physicalSaveLedgerSnapshot(fresh);
      // Strict logical restoration, not physical hard-delete: losing tombstones
      // and ineffective effects may remain as durable compensation evidence.
      expect(post.accounts.filter((account) => !account.deleted)).toEqual(
        before.accounts.filter((account) => !account.deleted)
      );
      const previous = await fresh.get<Account>("accounts")
        .find(ADD_DEFAULT_IDS.previous);
      expect(previous).toMatchObject({
        isDefault: true, balance: 90, financialRevision: "0",
      });
      const lost = await fresh.get<Account>("accounts").query(
        Q.where("id", command.accountId), Q.where("deleted", false)
      ).fetch();
      expect(lost).toHaveLength(0);
      const activeBank = await fresh.get<BankDetails>("bank_details")
        .query(Q.where("account_id", command.accountId),
          Q.where("deleted", false)).fetch();
      const activeSenders = await fresh.get<AccountSmsSender>(
        "account_sms_senders"
      ).query(Q.where("account_id", command.accountId),
        Q.where("deleted", false)).fetch();
      expect(activeBank).toHaveLength(0);
      expect(activeSenders).toHaveLength(0);
      expect((await effects(command.envelope.actionId, fresh))
        .filter((effect) => effect.isEffective)).toHaveLength(0);
      expect((await root(command.envelope.actionId, fresh)).state)
        .toBe("reconciled");
    }
  );

  it("A09 rejected Add cannot silently complete when a newer default choice displaced its preimage", async () => {
    const command = await prepareAndCommit("Default X", "0", true);
    await markRejected(command, "rejected");
    const fresh = await coldRestart();
    await fresh.write(async (): Promise<void> => {
      const candidate = await fresh.get<Account>("accounts").find(command.accountId);
      await candidate.update((row) => { row.isDefault = false; });
    });
    const before = await physicalSaveLedgerSnapshot(fresh);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        command.envelope.actionId
      )
    ).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(before);
    expect((await root(command.envelope.actionId, fresh)).state)
      .toBe("rejected_compensating");
  });

  it("A10 newer child metadata cannot be destroyed by rejected Add recovery", async () => {
    const command = await prepareAndCommit("Editable Bank", "0", true);
    await markRejected(command);
    const fresh = await coldRestart();
    const childId = command.bankDetailId;
    if (!childId) throw new Error("expected_real_bank_child");
    await fresh.write(async (): Promise<void> => {
      const child = await fresh.get<BankDetails>("bank_details").find(childId);
      await child.update((row) => { row.accountNumber = "newer-user-value"; });
    });
    const before = await physicalSaveLedgerSnapshot(fresh);
    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        command.envelope.actionId
      )
    ).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(before);
    expect((await fresh.get<BankDetails>("bank_details").find(childId))
      .accountNumber).toBe("newer-user-value");
  });

  it("A11 foreign authenticated actor cannot restore the previous owner's Add action", async () => {
    const command = await prepareAndCommit("Owner Isolated", "0", true);
    await markRejected(command);
    const fresh = await coldRestart();
    const before = await physicalSaveLedgerSnapshot(fresh);
    mockActiveAddOwner = ADD_DEFAULT_IDS.foreignOwner;
    try {
      await expect(
        productionFinancialActionReconciliationService.reconcileRejectedAction(
          command.envelope.actionId
        )
      ).rejects.toThrow();
    } finally {
      mockActiveAddOwner = OWNER;
    }
    expect(await physicalSaveLedgerSnapshot(fresh)).toEqual(before);
    expect((await root(command.envelope.actionId, fresh)).state)
      .toBe("rejected_compensating");
  });

  it("A12 a real rejected Add stays recoverable, not generic inverse compensated or acknowledged", async () => {
    const command = await prepareAndCommit("Rejected Bank", "10.01", true);
    await markRejected(command, "rejected");
    const pending = await root(command.envelope.actionId);
    const attempted: string[] = [];
    const coordinator = createFinancialActionPushCoordinator({
      ...foundation(),
      reconcileFinancialActionGroup: (id) =>
        productionFinancialActionReconciliationService.reconcileRejectedAction(id),
      invokeAccountFinancialActionRpc: ({ payloadJson }) => {
        attempted.push(payloadJson);
        return Promise.resolve(accepted(command));
      },
    });
    const result = await coordinator.coordinatePush([{
      actionId: pending.actionId, payloadHash: pending.payloadHash,
      payloadJson: pending.payloadJson, state: pending.state,
    }]);
    expect(result.decisions).toEqual([{
      actionId: pending.actionId, disposition: "recover", outcome: null,
    }]);
    expect(attempted).toEqual([]);
    expect((await root(command.envelope.actionId)).state)
      .toBe("rejected_compensating");
    expect((await effects(command.envelope.actionId))
      .every((effect) => effect.isEffective)).toBe(true);
  });
});

describe("#395 T069 — durable created-default predecessor sequencing", () => {
  it("A13 Add B cannot push before locally optimistic Add A accepts; exact A→B bytes remain immutable", async () => {
    const first = await prepareAndCommit("First A", "0", false, "CASH");
    const second = await prepareAndCommit("Later B", "0", true);
    expect(second.snapshot.activeAccountIds).toEqual([first.accountId]);
    expect(second.dependencyActionIds).toEqual([first.envelope.actionId]);
    const firstRoot = await root(first.envelope.actionId);
    const secondRoot = await root(second.envelope.actionId);
    const calls: Array<{ payloadHash: string; payloadJson: string }> = [];
    const sync = actionSync((input) => {
      calls.push({ ...input });
      return Promise.resolve(
        input.payloadJson === firstRoot.payloadJson
          ? accepted(first)
          : accepted(second)
      );
    });
    await expect(sync.syncAction(second.envelope.actionId))
      .rejects.toThrow("account_review_default_predecessor_blocked");
    expect(calls).toEqual([]);
    await sync.syncAction(first.envelope.actionId);
    await sync.syncAction(second.envelope.actionId);
    expect(calls).toEqual([
      { payloadHash: firstRoot.payloadHash, payloadJson: firstRoot.payloadJson },
      { payloadHash: secondRoot.payloadHash, payloadJson: secondRoot.payloadJson },
    ]);
    expect((await root(second.envelope.actionId)).state).toBe("accepted");
  });

  it("A14 rejected Add A blocks dependent Add B after cold restart without resampling its default", async () => {
    const first = await prepareAndCommit("First A", "0", false, "CASH");
    const second = await prepareAndCommit("Later B", "0", true);
    const unchanged = await root(second.envelope.actionId);
    await markRejected(first);
    const fresh = await coldRestart();
    const requests: string[] = [];
    const sync = actionSync((input) => {
      requests.push(input.payloadHash);
      return Promise.resolve(accepted(second));
    }, fresh);
    await expect(sync.syncAction(second.envelope.actionId))
      .rejects.toThrow("account_review_default_predecessor_blocked");
    expect(requests).toEqual([]);
    const retained = await root(second.envelope.actionId, fresh);
    expect(retained.state).toBe("local_complete");
    expect(retained.payloadJson).toBe(unchanged.payloadJson);
    expect(retained.payloadHash).toBe(unchanged.payloadHash);
    expect(second.snapshot.defaultAccount?.accountId).toBe(first.accountId);
  });

  it("A15 predecessor check reasserts current authenticated owner before dispatch", async () => {
    const first = await prepareAndCommit("First A", "0", false, "CASH");
    const second = await prepareAndCommit("Later B", "0", true);
    const calls: string[] = [];
    mockActiveAddOwner = ADD_DEFAULT_IDS.foreignOwner;
    try {
      await expect(actionSync((input) => {
        calls.push(input.payloadHash);
        return Promise.reject(new Error("forbidden_foreign_send"));
      }).syncAction(second.envelope.actionId)).rejects.toThrow();
    } finally {
      mockActiveAddOwner = OWNER;
    }
    expect(calls).toEqual([]);
    const retained = await root(second.envelope.actionId);
    expect(retained.state).toBe("local_complete");
    expect(retained.userId).toBe(first.ownerId);
  });
});
