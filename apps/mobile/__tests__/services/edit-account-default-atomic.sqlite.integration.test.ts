/**
 * D1 — Edit Account default replacement must commit as one atomic SQLite batch.
 *
 * `database.write` only serializes writers; it is not a transaction. These
 * cases therefore prove that the prior default, the new default, the SMS
 * senders and the bank details are applied in ONE `database.batch(...)`
 * transaction, that the LIVE default is cleared (a queued competing switch
 * cannot leave two defaults), and that a real mid-batch SQLite failure rolls
 * the whole edit back on a cold reopen of the physical database.
 */
import { Collection, Model, Q } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { Account } from "@monyvi/db";

import { updateAccountWithBalanceAdjustment } from "@/services/edit-account-service";
import {
  physicalSaveLedgerSnapshot,
  reopenSqliteLedger,
  type SqliteLedger,
} from "./account-review-save-sqlite-test-helpers";

interface TestDbModule {
  readonly database: import("@nozbe/watermelondb").Database;
  readonly __adapter: SQLiteAdapter;
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
  const models = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models");
  const adapter = new Adapter({ schema });
  const database = new wm.Database({
    adapter,
    modelClasses: models.LEDGER_MODEL_CLASSES,
  });
  return {
    database,
    __adapter: adapter,
    schema,
    Q: wm.Q,
    ...Object.fromEntries(
      models.LEDGER_MODEL_CLASSES.map((model) => [model.name, model])
    ),
  };
});
jest.mock("expo-crypto", () => ({
  randomUUID: (): string =>
    jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .randomUUID(),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (algorithm: string, text: string): Promise<string> => {
    if (algorithm !== "SHA-256")
      return Promise.reject(new Error("unsupported_test_crypto_algorithm"));
    return Promise.resolve(
      jest
        .requireActual<typeof import("node:crypto")>("node:crypto")
        .createHash("sha256")
        .update(text, "utf8")
        .digest("hex")
    );
  },
}));

const OWNER = "owner-a";
const OTHER_OWNER = "owner-b";
let mockCurrentOwner: string = OWNER;
/** Switch the owner after this many owner reads, to simulate an owner change
 * while the edit is being planned. */
let mockOwnerSwitchesAfterReads: number | null = null;
let mockOwnerReadCount = 0;
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => {
    mockOwnerReadCount += 1;
    if (
      mockOwnerSwitchesAfterReads !== null &&
      mockOwnerReadCount > mockOwnerSwitchesAfterReads
    ) {
      return Promise.resolve(OTHER_OWNER);
    }
    return Promise.resolve(mockCurrentOwner);
  },
  supabase: {},
}));
jest.mock("@/utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const moduleDb = jest.requireMock<TestDbModule>("@monyvi/db");
const database = moduleDb.database;
const ledger: SqliteLedger = {
  database,
  adapter: moduleDb.__adapter,
};

interface SeedAccount {
  readonly name: string;
  readonly isDefault: boolean;
  readonly owner?: string;
  readonly type?: "BANK" | "CASH" | "DIGITAL_WALLET";
  readonly balance?: number;
}

async function seedAccount(seed: SeedAccount): Promise<string> {
  let createdId = "";
  await database.write(async () => {
    const account = await database.get<Account>("accounts").create((row) => {
      row.userId = seed.owner ?? OWNER;
      row.name = seed.name;
      row.currency = "EGP";
      row.type = seed.type ?? "BANK";
      row.balance = seed.balance ?? 100;
      row.isDefault = seed.isDefault;
      row.deleted = false;
      row.financialRevision = "0";
    });
    createdId = account.id;
  });
  return createdId;
}

async function ownedAccounts(owner: string): Promise<Account[]> {
  return database
    .get<Account>("accounts")
    .query(Q.where("user_id", owner))
    .fetch();
}

async function defaultIds(owner: string): Promise<string[]> {
  const accounts = await ownedAccounts(owner);
  return accounts.filter((account) => account.isDefault).map((a) => a.id);
}

async function actionRowCount(): Promise<number> {
  const rows = await database.get("financial_action_groups").query().fetch();
  return rows.length;
}

beforeEach(async (): Promise<void> => {
  mockCurrentOwner = OWNER;
  mockOwnerSwitchesAfterReads = null;
  mockOwnerReadCount = 0;
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
});

type EncodedInsert = readonly [
  1,
  string,
  string,
  ReadonlyArray<Array<string | number | boolean | null>>,
];

function isEncodedInsertFor(
  value: unknown,
  table: string
): value is EncodedInsert {
  if (!Array.isArray(value) || value.length !== 4) return false;
  const tuple: readonly unknown[] = value;
  return (
    tuple[0] === 1 &&
    tuple[1] === table &&
    typeof tuple[2] === "string" &&
    tuple[2].startsWith(`insert into "${table}" (`)
  );
}

/**
 * Duplicate the encoded physical INSERT of one table INSIDE the real
 * better-sqlite3 transaction, so the genuine SQLite constraint error aborts
 * the whole transaction. The adapter, the dispatcher and the database batch
 * are never mocked, and the prepared-record bookkeeping is already cleared by
 * `Database.batch` before the adapter runs.
 */
function injectDuplicateSenderInsert(db: typeof database): {
  readonly injectedCount: () => number;
  readonly restore: () => void;
} {
  const actualSqlite = db.adapter.underlyingAdapter as {
    readonly _dispatcherType?: string;
    readonly _dispatcher?: {
      readonly constructor: { readonly name: string };
      readonly call: (
        method: string,
        args: readonly unknown[],
        callback: (error: unknown, result: unknown) => void
      ) => void;
    };
  };
  if (actualSqlite._dispatcherType !== "asynchronous") {
    throw new Error("expected_real_sqlite_node_adapter");
  }
  const dispatcher = actualSqlite._dispatcher;
  if (!dispatcher || dispatcher.constructor.name !== "SqliteNodeDispatcher") {
    throw new Error("expected_actual_sqlite_node_dispatcher");
  }
  const realNodeCall = dispatcher.call.bind(dispatcher);
  let injected = 0;
  const spy = jest
    .spyOn(dispatcher, "call")
    .mockImplementation((method, args, callback): void => {
      if (method !== "batch" || injected !== 0) {
        realNodeCall(method, args, callback);
        return;
      }
      const pending: unknown = args[0];
      if (!Array.isArray(pending)) {
        realNodeCall(method, args, callback);
        return;
      }
      const operations: readonly unknown[] = pending;
      const targetIndex = operations.findIndex((operation) =>
        isEncodedInsertFor(operation, "account_sms_senders")
      );
      if (targetIndex < 0) {
        realNodeCall(method, args, callback);
        return;
      }
      const target = operations[targetIndex];
      if (!isEncodedInsertFor(target, "account_sms_senders")) {
        throw new Error("unexpected_encoded_sqlite_sender_insert");
      }
      const firstArguments = target[3][0];
      if (!firstArguments || typeof firstArguments[0] !== "string") {
        throw new Error("encoded_sqlite_create_missing_original_arguments");
      }
      const duplicate: EncodedInsert = [
        1,
        "account_sms_senders",
        target[2],
        [[...firstArguments]],
      ];
      injected += 1;
      realNodeCall(
        method,
        [
          [
            ...operations.slice(0, targetIndex + 1),
            duplicate,
            ...operations.slice(targetIndex + 1),
          ],
        ],
        callback
      );
    });
  return {
    injectedCount: (): number => injected,
    restore: (): void => spy.mockRestore(),
  };
}

describe("D1 Edit Account default replacement is one atomic SQLite batch", () => {
  it("moves the default flag in a single batch and leaves exactly one default", async (): Promise<void> => {
    await seedAccount({ name: "A", isDefault: true });
    const accountB = await seedAccount({ name: "B", isDefault: false });

    const result = await updateAccountWithBalanceAdjustment(
      accountB,
      OWNER,
      { name: "B", balance: 100, isDefault: true },
      null
    );

    expect(result).toEqual({ success: true });
    expect(await defaultIds(OWNER)).toEqual([accountB]);
  });

  it("commits the prior default, the new default and the children in exactly one batch", async (): Promise<void> => {
    await seedAccount({ name: "A", isDefault: true });
    const accountB = await seedAccount({ name: "B", isDefault: false });
    const realBatch = database.batch.bind(database);
    const batchSpy = jest
      .spyOn(database, "batch")
      .mockImplementation(
        (...records: Array<false | void | Model | Model[] | null>) =>
          realBatch(...records)
      );
    const updateSpy = jest.spyOn(Model.prototype, "update");
    const createSpy = jest.spyOn(Collection.prototype, "create");

    try {
      const result = await updateAccountWithBalanceAdjustment(
        accountB,
        OWNER,
        {
          name: "B",
          balance: 100,
          isDefault: true,
          senderNames: ["SENDER-1"],
        },
        null
      );
      expect(result).toEqual({ success: true });
      expect(batchSpy).toHaveBeenCalledTimes(1);
      // No row is written outside the single batch, so a failing batch cannot
      // leave a partial commit behind.
      expect(updateSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
    } finally {
      updateSpy.mockRestore();
      createSpy.mockRestore();
      batchSpy.mockRestore();
    }

    expect(await defaultIds(OWNER)).toEqual([accountB]);
    const senders = await database.get("account_sms_senders").query().fetch();
    expect(senders).toHaveLength(1);
  });

  it("clears the LIVE default when a competing default switch already landed", async (): Promise<void> => {
    const accountA = await seedAccount({ name: "A", isDefault: true });
    const accountB = await seedAccount({ name: "B", isDefault: false });
    const accountC = await seedAccount({ name: "C", isDefault: false });

    // A competing writer switches the default from A to C before this edit
    // runs. The edit must read the live default inside the writer, clear C and
    // set B, so exactly one default remains.
    await database.write(async () => {
      const current = await database
        .get<Account>("accounts")
        .query(Q.where("id", accountA))
        .fetch();
      const next = await database
        .get<Account>("accounts")
        .query(Q.where("id", accountC))
        .fetch();
      const currentDefault = current[0];
      const nextDefault = next[0];
      if (!currentDefault || !nextDefault) {
        throw new Error("expected_both_competing_default_accounts");
      }
      await database.batch(
        currentDefault.prepareUpdate((row) => {
          row.isDefault = false;
        }),
        nextDefault.prepareUpdate((row) => {
          row.isDefault = true;
        })
      );
    });
    expect(await defaultIds(OWNER)).toEqual([accountC]);

    const result = await updateAccountWithBalanceAdjustment(
      accountB,
      OWNER,
      { name: "B", balance: 100, isDefault: true },
      null
    );

    expect(result).toEqual({ success: true });
    const defaults = await defaultIds(OWNER);
    expect(defaults).toEqual([accountB]);
    expect(defaults).toHaveLength(1);
  });

  it("keeps the balance, the protected revision and the action log untouched", async (): Promise<void> => {
    await seedAccount({ name: "A", isDefault: true });
    const accountB = await seedAccount({ name: "B", isDefault: false });
    const before = await ownedAccounts(OWNER);
    const targetBefore = before.find((a) => a.id === accountB);
    const balanceBefore = targetBefore?.balance;
    const revisionBefore = targetBefore?.financialRevision;
    const actionsBefore = await actionRowCount();

    await updateAccountWithBalanceAdjustment(
      accountB,
      OWNER,
      { name: "B renamed", balance: 100, isDefault: true },
      null
    );

    const after = await ownedAccounts(OWNER);
    const target = after.find((a) => a.id === accountB);
    expect(target?.balance).toBe(balanceBefore);
    expect(target?.financialRevision).toBe(revisionBefore);
    expect(await actionRowCount()).toBe(actionsBefore);
  });

  it("applies two reversals with exactly one default after each step", async (): Promise<void> => {
    const accountA = await seedAccount({ name: "A", isDefault: true });
    const accountB = await seedAccount({ name: "B", isDefault: false });

    await updateAccountWithBalanceAdjustment(
      accountB,
      OWNER,
      { name: "B", balance: 100, isDefault: true },
      null
    );
    expect(await defaultIds(OWNER)).toEqual([accountB]);

    await updateAccountWithBalanceAdjustment(
      accountA,
      OWNER,
      { name: "A", balance: 100, isDefault: true },
      null
    );
    expect(await defaultIds(OWNER)).toEqual([accountA]);
  });

  it("aborts without any saved or cached change when the owner switches during planning", async (): Promise<void> => {
    const accountA = await seedAccount({ name: "A", isDefault: true });
    const accountB = await seedAccount({ name: "B", isDefault: false });

    // The owner changes after the first owner read, so the abort happens at
    // the owner assertion that follows the asynchronous planning.
    mockOwnerSwitchesAfterReads = 1;

    const result = await updateAccountWithBalanceAdjustment(
      accountB,
      OWNER,
      { name: "B", balance: 100, isDefault: true },
      null
    );

    expect(result.success).toBe(false);
    const accounts = await ownedAccounts(OWNER);
    expect(accounts.find((account) => account.id === accountA)?.isDefault).toBe(
      true
    );
    expect(accounts.find((account) => account.id === accountB)?.isDefault).toBe(
      false
    );
    expect(accounts.find((account) => account.id === accountB)?.name).toBe("B");
    expect(
      await database.get("account_sms_senders").query().fetch()
    ).toHaveLength(0);
  });

  it("restores an earlier prepared row when a later preparation fails", async (): Promise<void> => {
    const accountA = await seedAccount({ name: "A", isDefault: true });
    const accountB = await seedAccount({ name: "B", isDefault: false });

    // The first preparation succeeds and mutates the cached raw; the second
    // one fails before the batch runs. The target row is prepared second.
    const targetModel = (
      await database
        .get<Account>("accounts")
        .query(Q.where("id", accountB))
        .fetch()
    )[0];
    if (!targetModel) {
      throw new Error("expected_target_account");
    }
    const targetSpy = jest
      .spyOn(targetModel, "prepareUpdate")
      .mockImplementation((): never => {
        throw new Error("forced_preparation_failure");
      });

    let result: { success: boolean; error?: string };
    try {
      result = await updateAccountWithBalanceAdjustment(
        accountB,
        OWNER,
        { name: "B", balance: 100, isDefault: true },
        null
      );
    } finally {
      targetSpy.mockRestore();
    }

    expect(result.success).toBe(false);
    expect(result.error).toBe("forced_preparation_failure");

    // The cached rows are back to their persisted state, so a same-session
    // retry cannot read a stale flag.
    const cached = await ownedAccounts(OWNER);
    expect(cached.find((account) => account.id === accountA)?.isDefault).toBe(
      true
    );
    expect(cached.find((account) => account.id === accountB)?.isDefault).toBe(
      false
    );
    expect(await defaultIds(OWNER)).toEqual([accountA]);
  });

  it("rolls the whole edit back on a cold reopen when the batch fails inside SQLite", async (): Promise<void> => {
    const accountA = await seedAccount({ name: "A", isDefault: true });
    const accountB = await seedAccount({ name: "B", isDefault: false });
    const bankDetailsBefore = await database
      .get("bank_details")
      .query()
      .fetch();
    const sendersBefore = await database
      .get("account_sms_senders")
      .query()
      .fetch();
    const snapshotBefore = await physicalSaveLedgerSnapshot(database);

    // The real SQLite batch receives a duplicated physical insert, so the
    // genuine SQLite constraint error aborts the whole transaction. The
    // adapter path is never mocked.
    const injection = injectDuplicateSenderInsert(database);

    let result: { success: boolean; error?: string };
    try {
      result = await updateAccountWithBalanceAdjustment(
        accountB,
        OWNER,
        {
          name: "B",
          balance: 100,
          isDefault: true,
          senderNames: ["SENDER-1"],
        },
        null
      );
    } finally {
      injection.restore();
    }

    expect(result.success).toBe(false);
    expect(injection.injectedCount()).toBe(1);

    // SAME SESSION: the cached rows are back to the persisted state, so a
    // retry in this session cannot read a stale "already default" flag and
    // skip clearing the previous default.
    const cached = await ownedAccounts(OWNER);
    expect(cached.find((account) => account.id === accountA)?.isDefault).toBe(
      true
    );
    expect(cached.find((account) => account.id === accountB)?.isDefault).toBe(
      false
    );

    // The physical rows are unchanged: the failed batch committed nothing.
    const afterFailure = await reopenSqliteLedger(ledger);
    expect(await physicalSaveLedgerSnapshot(afterFailure)).toEqual(
      snapshotBefore
    );
    expect(await afterFailure.get("bank_details").query().fetch()).toHaveLength(
      bankDetailsBefore.length
    );
    expect(
      await afterFailure.get("account_sms_senders").query().fetch()
    ).toHaveLength(sendersBefore.length);

    // The same-session retry commits and leaves exactly one default.
    const retry = await updateAccountWithBalanceAdjustment(
      accountB,
      OWNER,
      {
        name: "B",
        balance: 100,
        isDefault: true,
        senderNames: ["SENDER-1"],
      },
      null
    );
    expect(retry.success).toBe(true);
    expect(await defaultIds(OWNER)).toEqual([accountB]);

    // Cold reopen of the physical database: the committed edit is there and
    // nothing partial was left behind.
    const reopened = await reopenSqliteLedger(ledger);
    const reopenedAccounts = await reopened
      .get<Account>("accounts")
      .query(Q.where("user_id", OWNER))
      .fetch();
    expect(
      reopenedAccounts.filter((account) => account.isDefault).map((a) => a.id)
    ).toEqual([accountB]);
    expect(
      await reopened.get("account_sms_senders").query().fetch()
    ).toHaveLength(1);
  });

  it("never unsets a default owned by another user", async (): Promise<void> => {
    await seedAccount({ name: "A", isDefault: true });
    const accountB = await seedAccount({ name: "B", isDefault: false });
    const foreign = await seedAccount({
      name: "Foreign",
      isDefault: true,
      owner: OTHER_OWNER,
    });

    await updateAccountWithBalanceAdjustment(
      accountB,
      OWNER,
      { name: "B", balance: 100, isDefault: true },
      null
    );

    expect(await defaultIds(OWNER)).toEqual([accountB]);
    expect(await defaultIds(OTHER_OWNER)).toEqual([foreign]);
  });

  it("fails closed without writing when the edited account belongs to another user", async (): Promise<void> => {
    const foreign = await seedAccount({
      name: "Foreign",
      isDefault: true,
      owner: OTHER_OWNER,
    });

    const result = await updateAccountWithBalanceAdjustment(
      foreign,
      OWNER,
      { name: "Hijacked", balance: 100, isDefault: true },
      null
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("OWNERSHIP_FAILED");
    const foreignRows = await ownedAccounts(OTHER_OWNER);
    expect(foreignRows[0]?.name).toBe("Foreign");
    expect(foreignRows[0]?.isDefault).toBe(true);
  });
});
