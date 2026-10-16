/**
 * #395 T064 tests-first: actual Add entrypoint with real Watermelon/SQLite.
 *
 * No fake account-create SUT, no copied account/financial DTO, no in-memory
 * "database.write succeeds" substitute. The writer/source changes are NOT
 * present at c80a5451; newer intent cases are intended behavioral Red.
 * The independent T065 UI lane and 091 SQL lane are deliberately untouched.
 */
import type { Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  FinancialActionGroup,
  Transaction,
} from "@monyvi/db";
import { accountFormSchema, type AccountFormData } from "@/validation/account-validation";
import { createAccountForUser } from "@/services/account-service";
import {
  clearAndSeed,
  ledgerState,
  physicalSaveLedgerSnapshot,
  reopenSqliteLedger,
  type SqliteLedger,
} from "./account-review-save-sqlite-test-helpers";
import { ADD_DEFAULT_IDS } from "../../../../packages/logic/src/financial-actions/__tests__/account-create-default-test-fixtures";

interface MockDatabase {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual("@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js")
);

jest.mock("@monyvi/db", (): Readonly<Record<string, unknown>> => {
  const wm = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  const Sqlite = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const models = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models").LEDGER_MODEL_CLASSES;
  const adapter = new Sqlite({ schema });
  const database = new wm.Database({ adapter, modelClasses: models });
  return {
    database,
    __adapter: adapter,
    schema,
    Q: wm.Q,
    ...Object.fromEntries(models.map((model) => [model.name, model])),
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
let mockCurrentOwnerId = ADD_DEFAULT_IDS.owner;
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockCurrentOwnerId),
  supabase: {},
}));
jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/intro-flag-service", () => ({
  readIntroLocaleOverride: (): Promise<null> => Promise.resolve(null),
}));

const mock = jest.requireMock<MockDatabase>("@monyvi/db");
const ledger: SqliteLedger = {
  database: mock.database,
  adapter: mock.__adapter,
};

/** Existing typed form contract plus the new explicit intent (no copied DTO). */
function form(
  name: string,
  balance: string,
  defaultIntent: boolean,
  accountType: AccountFormData["accountType"] = "BANK"
): AccountFormData & { readonly defaultIntent: boolean } {
  const original = accountFormSchema.parse({
    name,
    accountType,
    currency: "EGP",
    balance,
    institutionId: accountType === "BANK" ? "cib" : null,
    providerDisplayName: accountType === "BANK" ? "CIB" : accountType === "DIGITAL_WALLET" ? "Manual Wallet" : "",
    senderNames: accountType === "CASH" ? [] : ["CIBEGYPT"],
    cardLast4: accountType === "BANK" ? "1234" : "",
  });
  return { ...original, defaultIntent };
}

/** Seed the real owned accounts model, including intentionally deleted rows. */
async function seedAccount(
  id: string,
  settings: Readonly<{
    isDefault: boolean;
    deleted?: boolean;
    userId?: string;
    name?: string;
    financialRevision?: string;
  }>
): Promise<void> {
  const database = ledger.database;
  await database.write(async (): Promise<void> => {
    const account = database.get<Account>("accounts").prepareCreate((model): void => {
      model._raw.id = id;
      model.userId = settings.userId ?? ADD_DEFAULT_IDS.owner;
      model.name = settings.name ?? "Existing account";
      model.type = "BANK";
      model.currency = "EGP";
      model.institutionId = "qnb";
      model.providerDisplayName = "QNB";
      model.balance = 100;
      model.financialRevision = settings.financialRevision ?? "2";
      model.isDefault = settings.isDefault;
      model.deleted = settings.deleted ?? false;
    });
    await database.batch(account);
  });
}

async function freshAccounts(): Promise<readonly Account[]> {
  const fresh = await reopenSqliteLedger(ledger);
  return fresh.get<Account>("accounts").query().fetch();
}

async function createdAccount(
  id: string | undefined
): Promise<Account> {
  if (!id) throw new Error("Missing newly created account ID");
  const accounts = await freshAccounts();
  const created = accounts.find((account) => account.id === id);
  if (!created) throw new Error("Created account not persisted in fresh SQLite");
  return created;
}

async function freshPhysical(): Promise<Awaited<
  ReturnType<typeof physicalSaveLedgerSnapshot>
>> {
  return physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger));
}

/**
 * A zero-opening NEW default-intent operation has a canonical metadata root,
 * not a balance effect. Legacy zero-create paths are tested separately.
 */
async function expectCanonicalZeroOpeningDefaultRoot(
  db: Database,
  accountId: string | undefined
): Promise<void> {
  if (!accountId) throw new Error("Zero opening returned no created account ID");
  const roots = await db.get<FinancialActionGroup>(
    "financial_action_groups"
  ).query().fetch();
  expect(roots).toHaveLength(1);
  const root = roots[0];
  expect(root?.domain).toBe("accounts");
  expect(root?.kind).toBe("create_with_default");
  expect(root?.domainReferenceId).toBe(accountId);
  if (!root) throw new Error("Missing canonical new default create root");

  const envelope: unknown = JSON.parse(root.payloadJson);
  expect(envelope).toMatchObject({
    envelopeVersion: "monyvi.financial-action/v1",
    domain: "accounts",
    kind: "create_with_default",
    payloadVersion: "account.create-default/v1",
    domainReferenceId: accountId,
    payload: {
      schemaVersion: "account.create-default/v1",
      operationCode: "account.create-default",
      accountEffects: [],
      domainMutation: { records: expect.arrayContaining([
        expect.objectContaining({
          entity: "account",
          mode: "create",
          after: expect.objectContaining({
            id: accountId,
            openingBalanceMinorUnits: "0",
          }),
        }),
      ]) },
    },
  });
  const financialGuards: unknown = JSON.parse(root.accountGuardsJson);
  expect(financialGuards).toEqual([]);
}

beforeEach(async (): Promise<void> => {
  jest.restoreAllMocks();
  mockCurrentOwnerId = ADD_DEFAULT_IDS.owner;
  await ledger.adapter.initializingPromise;
  await clearAndSeed(ledger.database, { onlyCategories: true });
});

describe("#395 T064 real SQLite Add default intent service", () => {
  it("forces first Cash account ON despite stale/false form preference, zero opening and no effects", async (): Promise<void> => {
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.owner, form("My Cash", "0", false, "CASH")
    );
    expect(result.success).toBe(true);
    const account = await createdAccount(result.accountId);
    expect(account.isDefault).toBe(true);
    expect(account.balance).toBe(0);
    expect(account.financialRevision).toBe("0");
    const state = await ledgerState(await reopenSqliteLedger(ledger));
    expect(state.counts).toMatchObject({
      accounts: 1, bankDetails: 0, senders: 0,
      effects: 0, actions: 1, transactions: 0,
    });
    await expectCanonicalZeroOpeningDefaultRoot(
      await reopenSqliteLedger(ledger),
      result.accountId
    );
  });

  it("later OFF preserves the previous default even with other active accounts", async (): Promise<void> => {
    await seedAccount(ADD_DEFAULT_IDS.previous, { isDefault: true });
    const prior = await freshPhysical();
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.owner, form("Second Bank", "0", false)
    );
    expect(result.success).toBe(true);
    const accounts = await freshAccounts();
    expect(accounts.find((row) => row.id === ADD_DEFAULT_IDS.previous)?.isDefault)
      .toBe(true);
    expect(accounts.find((row) => row.id === result.accountId)?.isDefault)
      .toBe(false);
    expect(accounts.filter((row) => row.isDefault && !row.deleted)).toHaveLength(1);
    expect(await freshPhysical()).not.toEqual(prior);
  });

  it("later ON clears only captured A and sets new B ON in the SAME successful create", async (): Promise<void> => {
    await seedAccount(ADD_DEFAULT_IDS.previous, { isDefault: true });
    await seedAccount(ADD_DEFAULT_IDS.other, {
      isDefault: false, name: "Other active",
    });
    const before = await freshAccounts();
    const prior = before.find((row) => row.id === ADD_DEFAULT_IDS.previous);
    const sibling = before.find((row) => row.id === ADD_DEFAULT_IDS.other);
    expect(prior?.isDefault).toBe(true);
    expect(sibling?.isDefault).toBe(false);
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.owner, form("Replace Default", "0", true)
    );
    expect(result.success).toBe(true);
    const after = await freshAccounts();
    expect(after.find((row) => row.id === ADD_DEFAULT_IDS.previous)?.isDefault)
      .toBe(false);
    expect(after.find((row) => row.id === ADD_DEFAULT_IDS.other)?.isDefault)
      .toBe(false);
    expect(after.find((row) => row.id === result.accountId)?.isDefault)
      .toBe(true);
    expect(after.filter((row) => row.isDefault && !row.deleted)).toHaveLength(1);
    expect(after.find((row) => row.id === ADD_DEFAULT_IDS.previous)?.balance)
      .toBe(prior?.balance);
    expect(after.find((row) => row.id === ADD_DEFAULT_IDS.previous)?.financialRevision)
      .toBe(prior?.financialRevision);
  });

  it("later ON with an intentional no-default state creates only B as default", async (): Promise<void> => {
    await seedAccount(ADD_DEFAULT_IDS.previous, { isDefault: false });
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.owner, form("New Default", "0", true)
    );
    expect(result.success).toBe(true);
    const rows = await freshAccounts();
    expect(rows.find((row) => row.id === result.accountId)?.isDefault).toBe(true);
    expect(rows.find((row) => row.id === ADD_DEFAULT_IDS.previous)?.isDefault)
      .toBe(false);
  });

  it("later OFF with intentional no-default keeps both false", async (): Promise<void> => {
    await seedAccount(ADD_DEFAULT_IDS.previous, { isDefault: false });
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.owner, form("Nondefault Wallet", "0", false, "DIGITAL_WALLET")
    );
    expect(result.success).toBe(true);
    const rows = await freshAccounts();
    expect(rows.filter((row) => row.isDefault && !row.deleted)).toEqual([]);
    expect(rows.find((row) => row.id === result.accountId)?.isDefault).toBe(false);
  });

  it("uses the complete owned active set, ignoring foreign and deleted account defaults", async (): Promise<void> => {
    await seedAccount(ADD_DEFAULT_IDS.previous, {
      isDefault: true, userId: ADD_DEFAULT_IDS.foreignOwner,
    });
    await seedAccount(ADD_DEFAULT_IDS.other, {
      isDefault: true, deleted: true,
    });
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.owner, form("Actually First", "0", false)
    );
    expect(result.success).toBe(true);
    const rows = await freshAccounts();
    expect(rows.find((row) => row.id === result.accountId)?.isDefault).toBe(true);
    expect(rows.find((row) => row.id === ADD_DEFAULT_IDS.previous)?.isDefault)
      .toBe(true);
    expect(rows.find((row) => row.id === ADD_DEFAULT_IDS.other)?.deleted)
      .toBe(true);
  });

  it("never accepts a different authenticated actor for an owned zero-opening creation", async (): Promise<void> => {
    const before = await freshPhysical();
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.foreignOwner, form("Wrong Actor", "0", true)
    );
    expect(result.success).toBe(false);
    expect(await freshPhysical()).toEqual(before);
  });

  it("creates zero-opening BANK and sender/details in one canonical metadata root with zero financial effects", async (): Promise<void> => {
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.owner, form("Bank No Opening", "0", true)
    );
    expect(result.success).toBe(true);
    const db = await reopenSqliteLedger(ledger);
    const state = await ledgerState(db);
    expect(state.counts).toMatchObject({
      accounts: 1, bankDetails: 1, senders: 1, actions: 1,
      effects: 0, transactions: 0,
    });
    await expectCanonicalZeroOpeningDefaultRoot(db, result.accountId);
    const details = await db.get<BankDetails>("bank_details").query().fetch();
    const senders = await db.get<AccountSmsSender>("account_sms_senders").query().fetch();
    expect(details[0]?.accountId).toBe(result.accountId);
    expect(details[0]?.cardLast4).toBe(1234);
    expect(senders[0]?.accountId).toBe(result.accountId);
    expect(senders[0]?.normalizedSenderName).toBe("cibegypt");
  });

  it("posts nonzero 10.01 exactly once, creates no adjustment transaction, advances new account revision to one", async (): Promise<void> => {
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.owner, form("Bank Opening 10.01", "10.01", true)
    );
    expect(result.success).toBe(true);
    const account = await createdAccount(result.accountId);
    expect(account.balance).toBe(10.01);
    expect(account.financialRevision).toBe("1");
    const db = await reopenSqliteLedger(ledger);
    const effects = await db.get<AccountFinancialEffect>("account_financial_effects").query().fetch();
    const roots = await db.get<FinancialActionGroup>("financial_action_groups").query().fetch();
    const transactions = await db.get<Transaction>("transactions").query().fetch();
    expect(effects).toHaveLength(1);
    expect(effects[0]?.accountId).toBe(result.accountId);
    expect(effects[0]?.amountMinorUnits).toBe("1001");
    expect(roots).toHaveLength(1);
    expect(transactions).toHaveLength(0);
  });

  it("a child-create failure rolls back account/default/bank/sender/action/effect physically", async (): Promise<void> => {
    await seedAccount(ADD_DEFAULT_IDS.previous, { isDefault: true });
    const before = await freshPhysical();
    const failure = new Error("injected_atomic_batch_commit_failure");
    // Inject at the real Watermelon commit seam. Do not force a future
    // preparedCreate + batch writer to use legacy collection.create().
    const atomicBatch = jest.spyOn(ledger.database, "batch")
      .mockRejectedValueOnce(failure);
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.owner, form("Reject Child", "0", true)
    );
    expect(result.success).toBe(false);
    expect(await freshPhysical()).toEqual(before);
    expect(atomicBatch).toHaveBeenCalledTimes(1);
  });

  it("a duplicate identity cannot replay into a second account, child or default clear", async (): Promise<void> => {
    const input = form("One Unique Bank", "0", true);
    const first = await createAccountForUser(ADD_DEFAULT_IDS.owner, input);
    expect(first.success).toBe(true);
    const before = await freshPhysical();
    const second = await createAccountForUser(ADD_DEFAULT_IDS.owner, input);
    expect(second.success).toBe(false);
    expect(second.accountId).toBeUndefined();
    expect(await freshPhysical()).toEqual(before);
    // This is duplicate-submit protection, NOT proof of financial-action
    // canonical replay/hash matching (requires the future T064 writer).
  });

  it("an invalid form changes no account/default/child/effect/action row", async (): Promise<void> => {
    await seedAccount(ADD_DEFAULT_IDS.previous, { isDefault: true });
    const before = await freshPhysical();
    const badInput = { ...form("Invalid Amount", "0", true), balance: "1.2.3" };
    const result = await createAccountForUser(ADD_DEFAULT_IDS.owner, badInput);
    expect(result.success).toBe(false);
    expect(await freshPhysical()).toEqual(before);
  });

  it("a foreign existing default never gets cleared by an owned ON creation", async (): Promise<void> => {
    await seedAccount(ADD_DEFAULT_IDS.previous, {
      isDefault: true, userId: ADD_DEFAULT_IDS.foreignOwner,
    });
    await seedAccount(ADD_DEFAULT_IDS.other, {
      isDefault: false, name: "Owned",
    });
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.owner, form("Owned ON", "0", true)
    );
    expect(result.success).toBe(true);
    const rows = await freshAccounts();
    expect(rows.find((row) => row.id === ADD_DEFAULT_IDS.previous)?.isDefault)
      .toBe(true);
    expect(rows.find((row) => row.id === ADD_DEFAULT_IDS.other)?.isDefault)
      .toBe(false);
    expect(rows.find((row) => row.id === result.accountId)?.isDefault).toBe(true);
  });

  it("detects two owned active defaults or proves SQLite already forbids creating that state", async (): Promise<void> => {
    await seedAccount(ADD_DEFAULT_IDS.previous, { isDefault: true });
    let rejectedAtStorage = false;
    try {
      await seedAccount(ADD_DEFAULT_IDS.other, {
        isDefault: true, name: "Second conflicting default",
      });
    } catch {
      rejectedAtStorage = true;
    }
    const before = await freshPhysical();
    if (rejectedAtStorage) {
      const rows = await freshAccounts();
      expect(rows.filter((row) =>
        row.userId === ADD_DEFAULT_IDS.owner && !row.deleted && row.isDefault
      )).toHaveLength(1);
      return;
    }
    const result = await createAccountForUser(
      ADD_DEFAULT_IDS.owner, form("Must Reject Duplicate Defaults", "0", true)
    );
    expect(result.success).toBe(false);
    expect(await freshPhysical()).toEqual(before);
  });

  it("preserves persisted action/effect IDs after a duplicate nonzero submit across a fresh SQLite clone", async (): Promise<void> => {
    const input = form("Stable Opening Identity", "10.01", true);
    const first = await createAccountForUser(ADD_DEFAULT_IDS.owner, input);
    expect(first.success).toBe(true);
    const before = await freshPhysical();
    const snapshotDb = await reopenSqliteLedger(ledger);
    const rootsBefore = await snapshotDb
      .get<FinancialActionGroup>("financial_action_groups").query().fetch();
    const effectsBefore = await snapshotDb
      .get<AccountFinancialEffect>("account_financial_effects").query().fetch();
    expect(rootsBefore).toHaveLength(1);
    expect(effectsBefore).toHaveLength(1);
    const rootIds = rootsBefore.map((root) => root.id);
    const effectIds = effectsBefore.map((effect) => effect.id);
    const again = await createAccountForUser(ADD_DEFAULT_IDS.owner, input);
    expect(again.success).toBe(false);
    expect(await freshPhysical()).toEqual(before);
    const fresh = await reopenSqliteLedger(ledger);
    expect((await fresh.get<FinancialActionGroup>("financial_action_groups")
      .query().fetch()).map((root) => root.id)).toEqual(rootIds);
    expect((await fresh.get<AccountFinancialEffect>("account_financial_effects")
      .query().fetch()).map((effect) => effect.id)).toEqual(effectIds);
    // A duplicate form is not the same as an acknowledged financial-action
    // replay: immutable action-ID/hash replay still needs future writer tests.
  });

  it("serializes two different first-account creates without orphaned roots, children or two defaults", async (): Promise<void> => {
    // Uncontrolled Promise.all scheduling permits either a later capture
    // after the first commit (both succeed) or two empty captures (one
    // stale-CAS loser). Neither outcome may produce partial persisted rows.
    const [first, second] = await Promise.all([
      createAccountForUser(
        ADD_DEFAULT_IDS.owner, form("First Race Bank", "0", false)
      ),
      createAccountForUser(
        ADD_DEFAULT_IDS.owner, form("First Race Wallet", "0", false, "DIGITAL_WALLET")
      ),
    ]);
    const results = [first, second];
    const successful = results.filter((result) => result.success);
    const failed = results.filter((result) => !result.success);
    expect(successful.length).toBeGreaterThanOrEqual(1);
    expect(successful.length).toBeLessThanOrEqual(2);
    expect(failed.every((result) => result.accountId === undefined)).toBe(true);
    const ids = successful.map((result) => result.accountId);
    expect(ids.every((id): id is string => typeof id === "string")).toBe(true);
    expect(new Set(ids).size).toBe(successful.length);

    const db = await reopenSqliteLedger(ledger);
    const accounts = await db.get<Account>("accounts").query().fetch();
    const ownedActive = accounts.filter((account) =>
      account.userId === ADD_DEFAULT_IDS.owner && !account.deleted
    );
    expect(ownedActive).toHaveLength(successful.length);
    expect(ownedActive.map((account) => account.id).sort()).toEqual([...ids].sort());
    expect(ownedActive.filter((account) => account.isDefault)).toHaveLength(1);

    const roots = await db.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query().fetch();
    expect(roots).toHaveLength(successful.length);
    expect(new Set(roots.map((root) => root.actionId)).size)
      .toBe(successful.length);
    expect(roots.map((root) => root.domainReferenceId).sort())
      .toEqual([...ids].sort());
    expect(roots.every((root) =>
      root.userId === ADD_DEFAULT_IDS.owner &&
      root.domain === "accounts" &&
      root.kind === "create_with_default"
    )).toBe(true);

    const [bankDetails, senders, effects] = await Promise.all([
      db.get<BankDetails>("bank_details").query().fetch(),
      db.get<AccountSmsSender>("account_sms_senders").query().fetch(),
      db.get<AccountFinancialEffect>("account_financial_effects")
        .query().fetch(),
    ]);
    const persistedIds = new Set(ownedActive.map((account) => account.id));
    expect(bankDetails).toHaveLength(
      ownedActive.filter((account) => account.type === "BANK").length
    );
    expect(senders).toHaveLength(
      ownedActive.filter((account) => account.type !== "CASH").length
    );
    expect(bankDetails.every((child) => persistedIds.has(child.accountId)))
      .toBe(true);
    expect(senders.every((child) => persistedIds.has(child.accountId)))
      .toBe(true);
    expect(effects).toHaveLength(0);
    expect(ownedActive.every((account) =>
      account.balance === 0 && account.financialRevision === "0"
    )).toBe(true);
  });

});
