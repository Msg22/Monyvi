import type {
  Account,
  FinancialActionGroup,
  Transaction,
  Transfer,
} from "@monyvi/db";
import type { Collection, Model } from "@nozbe/watermelondb";
import { canonicalizeFinancialActionEnvelope } from "@monyvi/logic";

import type { ExecuteAccountBalanceCommandInput } from "../../services/account-balance-command-service";
import { createCoreAccountFinancialActionService } from "../../services/core-account-financial-action-service";
import {
  createTransactionCoreWriterService,
  type TransactionCoreWriterDependencies,
} from "../../services/transaction-core-writer-service";
import type { CurrentUserDataScope } from "../../services/user-data-access";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ACTION_ID = "20000000-0000-4000-8000-000000000002";
const OLD_ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";
const NEW_ACCOUNT_ID = "40000000-0000-4000-8000-000000000004";
const TRANSFER_ACCOUNT_ID = "41000000-0000-4000-8000-000000000004";
const TRANSACTION_ID = "50000000-0000-4000-8000-000000000005";
const TRANSFER_ID = "60000000-0000-4000-8000-000000000006";
const CATEGORY_ID = "70000000-0000-4000-8000-000000000007";
const OCCURRED_AT = new Date("2026-09-06T10:00:00.000Z");
const UPDATED_AT = new Date("2026-09-01T09:00:00.000Z");

interface FakeModel extends Model {
  readonly id: string;
  readonly table: string;
  _raw: Model["_raw"];
  [key: string]: unknown;
}

function fakeModel(
  table: string,
  id: string,
  values: Readonly<Record<string, unknown>>,
  preparedState: "create" | null = null
): FakeModel {
  const model = {
    id,
    table,
    _isEditing: false,
    _preparedState: preparedState,
    _raw: {
      id,
      _status: preparedState === "create" ? "created" : "synced",
      _changed: "",
      ...values,
    },
  } as unknown as FakeModel;
  Object.assign(model, values);
  return model;
}

function fakeRaw(values: Readonly<Record<string, unknown>>): Model["_raw"] {
  return values as unknown as Model["_raw"];
}

function account(
  id: string,
  balance: number,
  currency: "EGP" | "USD",
  revision: string
): Account {
  const model = fakeModel("accounts", id, {
    balance,
    currency,
    deleted: false,
    financialRevision: revision,
    financial_revision: revision,
    userId: USER_ID,
    user_id: USER_ID,
  });
  return model as unknown as Account;
}

function transaction(
  overrides: Readonly<Record<string, unknown>> = {}
): Transaction {
  const values = {
    accountId: OLD_ACCOUNT_ID,
    account_id: OLD_ACCOUNT_ID,
    amount: 100,
    categoryId: CATEGORY_ID,
    category_id: CATEGORY_ID,
    counterparty: undefined,
    createdAt: new Date("2026-08-01T08:00:00.000Z"),
    created_at: Date.parse("2026-08-01T08:00:00.000Z"),
    currency: "EGP",
    date: new Date(2026, 7, 1),
    deleted: false,
    isDraft: false,
    is_draft: false,
    linkedAssetId: undefined,
    linkedDebtId: undefined,
    linkedRecurringId: undefined,
    note: undefined,
    smsFingerprint: undefined,
    source: "MANUAL",
    type: "EXPENSE",
    updatedAt: UPDATED_AT,
    updated_at: UPDATED_AT.getTime(),
    userId: USER_ID,
    user_id: USER_ID,
    ...overrides,
  };
  return fakeModel(
    "transactions",
    TRANSACTION_ID,
    values
  ) as unknown as Transaction;
}

function createCollection<T extends Model>(
  table: string,
  records: Map<string, T>,
  createId?: string
): Collection<T> {
  return {
    find: jest.fn((id: string) => {
      const record = records.get(id);
      return record
        ? Promise.resolve(record)
        : Promise.reject(new Error(`missing:${table}:${id}`));
    }),
    prepareCreate: jest.fn((builder: (record: T) => void) => {
      const record = fakeModel(
        table,
        createId ?? `${table}-created`,
        {
          createdAt: OCCURRED_AT,
          created_at: OCCURRED_AT.getTime(),
          updatedAt: OCCURRED_AT,
          updated_at: OCCURRED_AT.getTime(),
          userId: USER_ID,
          user_id: USER_ID,
        },
        "create"
      ) as unknown as T;
      builder(record);
      records.set(record.id, record);
      return record;
    }),
  } as unknown as Collection<T>;
}

function createHarness(): {
  readonly accounts: Map<string, Account>;
  readonly command: jest.Mock;
  readonly service: ReturnType<typeof createTransactionCoreWriterService>;
  readonly transactions: Map<string, Transaction>;
  readonly transfers: Map<string, Transfer>;
} {
  const accounts = new Map<string, Account>([
    [OLD_ACCOUNT_ID, account(OLD_ACCOUNT_ID, 900, "EGP", "7")],
    [NEW_ACCOUNT_ID, account(NEW_ACCOUNT_ID, 10, "USD", "11")],
    [TRANSFER_ACCOUNT_ID, account(TRANSFER_ACCOUNT_ID, 500, "EGP", "13")],
  ]);
  const transactions = new Map<string, Transaction>([
    [TRANSACTION_ID, transaction()],
  ]);
  const transfers = new Map<string, Transfer>();
  const accountCollection = createCollection("accounts", accounts);
  const transactionCollection = createCollection("transactions", transactions);
  const transferCollection = createCollection(
    "transfers",
    transfers,
    TRANSFER_ID
  );
  const scope = {
    userId: USER_ID,
    findOwned: jest.fn((collection: Collection<Model>, id: string) =>
      collection.find(id)
    ),
    assertOwned: jest.fn((model: Model) => model),
  } as unknown as CurrentUserDataScope;
  const command = jest.fn(async (input: ExecuteAccountBalanceCommandInput) => {
    const plan = await input.prepareDomainOperationPlan();
    plan.existingOperations.forEach((operation) => {
      if (operation.kind === "update") operation.update(operation.model);
      else Object.assign(operation.model, { deleted: true });
    });
    return {
      kind: "committed" as const,
      record: fakeModel(
        "financial_action_groups",
        ACTION_ID,
        {}
      ) as unknown as FinancialActionGroup,
    };
  });
  const coreService = createCoreAccountFinancialActionService({
    executeAccountBalanceCommand: command,
    hashProvider: {
      digestUtf8: jest.fn(() => Promise.resolve("a".repeat(64))),
    },
  });
  const dependencies: TransactionCoreWriterDependencies = {
    accountsCollection: () => accountCollection,
    assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
    createActionId: () => ACTION_ID,
    commitMetadataUpdate: jest.fn((record, updates) => {
      Object.assign(record, updates);
      return Promise.resolve();
    }),
    executeCoreFinancialAction: coreService.execute,
    getCurrentUserDataScope: jest.fn(() => Promise.resolve(scope)),
    now: () => OCCURRED_AT,
    transactionsCollection: () => transactionCollection,
    transfersCollection: () => transferCollection,
  };
  return {
    accounts,
    command,
    service: createTransactionCoreWriterService(dependencies),
    transactions,
    transfers,
  };
}

function readCommandInput(
  command: jest.Mock
): ExecuteAccountBalanceCommandInput {
  const calls = command.mock.calls as unknown as readonly (readonly [
    ExecuteAccountBalanceCommandInput,
  ])[];
  const input = calls[0]?.[0];
  if (!input) throw new Error("missing command");
  return input;
}

function readEnvelope(
  command: jest.Mock
): ReturnType<typeof canonicalizeFinancialActionEnvelope> {
  const input = readCommandInput(command);
  return canonicalizeFinancialActionEnvelope(input.envelope);
}

describe("transaction core writer service", () => {
  it("guards an amount update with one exact net effect and one revision increment", async () => {
    const harness = createHarness();

    await harness.service.update(TRANSACTION_ID, { amount: 250 });

    const accountValue = harness.accounts.get(OLD_ACCOUNT_ID);
    expect(accountValue?.balance).toBe(750);
    expect(accountValue?.financialRevision).toBe("8");
    expect(harness.transactions.get(TRANSACTION_ID)?.amount).toBe(250);
    expect(readEnvelope(harness.command).payload.accountEffects).toEqual([
      {
        accountId: OLD_ACCOUNT_ID,
        amountMinorUnits: "-15000",
        currency: "EGP",
      },
    ]);
  });

  it("records the exact net effect of an expense-to-income change", async () => {
    const harness = createHarness();

    await harness.service.update(TRANSACTION_ID, { type: "INCOME" });

    expect(readEnvelope(harness.command).payload.accountEffects).toEqual([
      {
        accountId: OLD_ACCOUNT_ID,
        amountMinorUnits: "20000",
        currency: "EGP",
      },
    ]);
    expect(harness.accounts.get(OLD_ACCOUNT_ID)?.balance).toBe(1100);
    expect(harness.accounts.get(OLD_ACCOUNT_ID)?.financialRevision).toBe("8");
  });

  it("uses each account currency precision when moving a transaction across currencies", async () => {
    const harness = createHarness();

    await harness.service.update(TRANSACTION_ID, {
      accountId: NEW_ACCOUNT_ID,
    });

    const envelope = readEnvelope(harness.command);
    expect(envelope.accountGuards).toEqual([
      { accountId: OLD_ACCOUNT_ID, expectedRevision: "7" },
      { accountId: NEW_ACCOUNT_ID, expectedRevision: "11" },
    ]);
    expect(envelope.payload.accountEffects).toEqual([
      {
        accountId: OLD_ACCOUNT_ID,
        amountMinorUnits: "10000",
        currency: "EGP",
      },
      {
        accountId: NEW_ACCOUNT_ID,
        amountMinorUnits: "-10000",
        currency: "USD",
      },
    ]);
    expect(harness.transactions.get(TRANSACTION_ID)?.currency).toBe("USD");
    expect(harness.accounts.get(OLD_ACCOUNT_ID)?.balance).toBe(1000);
    expect(harness.accounts.get(NEW_ACCOUNT_ID)?.balance).toBe(-90);
  });

  it("commits metadata only when submitted financial fields equal the live record", async () => {
    const harness = createHarness();

    await harness.service.update(TRANSACTION_ID, {
      accountId: OLD_ACCOUNT_ID,
      amount: 100,
      note: "updated",
      type: "EXPENSE",
    });

    expect(harness.command).not.toHaveBeenCalled();
    expect(harness.transactions.get(TRANSACTION_ID)?.note).toBe("updated");
    expect(harness.accounts.get(OLD_ACCOUNT_ID)?.financialRevision).toBe("7");
  });

  it("rejects a prepared transaction postimage that differs from command evidence", async () => {
    const harness = createHarness();

    await harness.service.update(TRANSACTION_ID, { amount: 250 });

    const input = readCommandInput(harness.command);
    const plan = await input.prepareDomainOperationPlan();
    await expect(
      Promise.resolve().then(() =>
        plan.assertPreparedOwnership({
          cachedPreimages: [],
          preparedPostimages: [
            {
              id: TRANSACTION_ID,
              kind: "update",
              table: "transactions",
              raw: fakeRaw({
                id: TRANSACTION_ID,
                _status: "updated",
                _changed: "amount",
                account_id: OLD_ACCOUNT_ID,
                amount: 999,
                category_id: CATEGORY_ID,
                counterparty: null,
                created_at: Date.parse("2026-08-01T08:00:00.000Z"),
                currency: "EGP",
                date: new Date(2026, 7, 1).getTime(),
                deleted: false,
                is_draft: false,
                linked_asset_id: null,
                linked_debt_id: null,
                linked_recurring_id: null,
                note: null,
                sms_fingerprint: null,
                source: "MANUAL",
                type: "EXPENSE",
                user_id: USER_ID,
              }),
            },
            {
              id: OLD_ACCOUNT_ID,
              kind: "update",
              table: "accounts",
              raw: fakeRaw({
                id: OLD_ACCOUNT_ID,
                _status: "updated",
                _changed: "balance,financial_revision",
                user_id: USER_ID,
              }),
            },
          ],
          userId: USER_ID,
        })
      )
    ).rejects.toThrow("TRANSACTION_FINANCIAL_ACTION_INVALID_PLAN");
  });

  it("soft-deletes through a guarded inverse effect", async () => {
    const harness = createHarness();

    await harness.service.delete(TRANSACTION_ID);

    expect(harness.accounts.get(OLD_ACCOUNT_ID)?.balance).toBe(1000);
    expect(harness.transactions.get(TRANSACTION_ID)?.deleted).toBe(true);
    expect(readEnvelope(harness.command).payload.operationCode).toBe(
      "transaction.delete"
    );
  });

  it("converts a transaction to a transfer as one guarded group", async () => {
    const harness = createHarness();

    await harness.service.convertToTransfer({
      notes: "moved",
      toAccountId: TRANSFER_ACCOUNT_ID,
      transactionId: TRANSACTION_ID,
    });

    const envelope = readEnvelope(harness.command);
    expect(envelope.payload.operationCode).toBe(
      "transaction.convert-to-transfer"
    );
    expect(
      (envelope.payload.domainMutation as { records: readonly unknown[] })
        .records
    ).toHaveLength(2);
    expect(harness.transactions.get(TRANSACTION_ID)?.deleted).toBe(true);
    expect(harness.transfers.get(TRANSFER_ID)).toBeDefined();
  });

  it("fails closed when conversion cannot express an exact destination-currency amount", async () => {
    const harness = createHarness();

    await expect(
      harness.service.convertToTransfer({
        toAccountId: NEW_ACCOUNT_ID,
        transactionId: TRANSACTION_ID,
      })
    ).rejects.toThrow("TRANSACTION_ACCOUNT_CURRENCY_MISMATCH");

    expect(harness.command).not.toHaveBeenCalled();
    expect(harness.transactions.get(TRANSACTION_ID)?.deleted).toBe(false);
  });

  it("batch-deletes mixed records with one sorted effect per account", async () => {
    const harness = createHarness();
    const transfer = fakeModel("transfers", TRANSFER_ID, {
      amount: 50,
      convertedAmount: 1,
      converted_amount: 1,
      createdAt: new Date("2026-08-02T08:00:00.000Z"),
      created_at: Date.parse("2026-08-02T08:00:00.000Z"),
      currency: "EGP",
      date: new Date(2026, 7, 2),
      deleted: false,
      exchangeRate: 50,
      fromAccountId: OLD_ACCOUNT_ID,
      from_account_id: OLD_ACCOUNT_ID,
      notes: undefined,
      smsFingerprint: undefined,
      toAccountId: NEW_ACCOUNT_ID,
      to_account_id: NEW_ACCOUNT_ID,
      updatedAt: UPDATED_AT,
      updated_at: UPDATED_AT.getTime(),
      userId: USER_ID,
      user_id: USER_ID,
    }) as unknown as Transfer;
    harness.transfers.set(TRANSFER_ID, transfer);

    const transactionRecord = harness.transactions.get(TRANSACTION_ID);
    if (!transactionRecord) throw new Error("missing transaction fixture");
    await harness.service.batchDelete([
      { kind: "transaction", record: transactionRecord },
      { kind: "transfer", record: transfer },
    ]);

    const envelope = readEnvelope(harness.command);
    expect(envelope.payload.accountEffects).toEqual([
      {
        accountId: OLD_ACCOUNT_ID,
        amountMinorUnits: "15000",
        currency: "EGP",
      },
      {
        accountId: NEW_ACCOUNT_ID,
        amountMinorUnits: "-100",
        currency: "USD",
      },
    ]);
    expect(envelope.payload.operationCode).toBe("transaction.batch-delete");
  });
});
