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
  createTransferCoreWriterService,
  type TransferCoreWriterDependencies,
} from "../../services/transfer-core-writer-service";
import type { CurrentUserDataScope } from "../../services/user-data-access";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ACTION_ID = "20000000-0000-4000-8000-000000000002";
const FROM_ID = "30000000-0000-4000-8000-000000000003";
const TO_ID = "40000000-0000-4000-8000-000000000004";
const ALT_ID = "41000000-0000-4000-8000-000000000004";
const TRANSFER_ID = "50000000-0000-4000-8000-000000000005";
const TRANSACTION_ID = "60000000-0000-4000-8000-000000000006";
const CATEGORY_ID = "70000000-0000-4000-8000-000000000007";
const NOW = new Date("2026-09-06T10:00:00.000Z");
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
  return fakeModel("accounts", id, {
    balance,
    currency,
    deleted: false,
    financialRevision: revision,
    financial_revision: revision,
    userId: USER_ID,
    user_id: USER_ID,
  }) as unknown as Account;
}

function transfer(): Transfer {
  return fakeModel("transfers", TRANSFER_ID, {
    amount: 100,
    convertedAmount: 2,
    converted_amount: 2,
    createdAt: new Date("2026-08-01T08:00:00.000Z"),
    created_at: Date.parse("2026-08-01T08:00:00.000Z"),
    currency: "EGP",
    date: new Date(2026, 7, 1),
    deleted: false,
    exchangeRate: 50,
    exchange_rate: 50,
    fromAccountId: FROM_ID,
    from_account_id: FROM_ID,
    notes: "saved",
    smsFingerprint: undefined,
    toAccountId: TO_ID,
    to_account_id: TO_ID,
    updatedAt: UPDATED_AT,
    updated_at: UPDATED_AT.getTime(),
    userId: USER_ID,
    user_id: USER_ID,
  }) as unknown as Transfer;
}

function collection<T extends Model>(
  table: string,
  records: Map<string, T>,
  createId: string
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
        createId,
        {
          createdAt: NOW,
          created_at: NOW.getTime(),
          updatedAt: NOW,
          updated_at: NOW.getTime(),
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
  readonly service: ReturnType<typeof createTransferCoreWriterService>;
  readonly transactions: Map<string, Transaction>;
  readonly transfers: Map<string, Transfer>;
} {
  const accounts = new Map<string, Account>([
    [FROM_ID, account(FROM_ID, 900, "EGP", "7")],
    [TO_ID, account(TO_ID, 12, "USD", "11")],
    [ALT_ID, account(ALT_ID, 400, "EGP", "13")],
  ]);
  const transfers = new Map<string, Transfer>([[TRANSFER_ID, transfer()]]);
  const transactions = new Map<string, Transaction>();
  const accountCollection = collection("accounts", accounts, "unused-account");
  const transferCollection = collection("transfers", transfers, TRANSFER_ID);
  const transactionCollection = collection(
    "transactions",
    transactions,
    TRANSACTION_ID
  );
  const scope = {
    userId: USER_ID,
    findOwned: jest.fn((target: Collection<Model>, id: string) =>
      target.find(id)
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
  const core = createCoreAccountFinancialActionService({
    executeAccountBalanceCommand: command,
    hashProvider: {
      digestUtf8: jest.fn(() => Promise.resolve("a".repeat(64))),
    },
  });
  const dependencies: TransferCoreWriterDependencies = {
    accountsCollection: () => accountCollection,
    assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
    createActionId: () => ACTION_ID,
    commitMetadataUpdate: jest.fn((record, updates) => {
      Object.assign(record, updates);
      return Promise.resolve();
    }),
    executeCoreFinancialAction: core.execute,
    getCurrentUserDataScope: jest.fn(() => Promise.resolve(scope)),
    now: () => NOW,
    transactionsCollection: () => transactionCollection,
    transfersCollection: () => transferCollection,
  };
  return {
    accounts,
    command,
    service: createTransferCoreWriterService(dependencies),
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

function envelope(
  command: jest.Mock
): ReturnType<typeof canonicalizeFinancialActionEnvelope> {
  const input = readCommandInput(command);
  return canonicalizeFinancialActionEnvelope(input.envelope);
}

describe("transfer core writer service", () => {
  it("creates a cross-currency transfer using destination precision", async () => {
    const harness = createHarness();
    harness.transfers.clear();

    await harness.service.create({
      amount: 150,
      convertedAmount: 3,
      currency: "EGP",
      fromAccountId: FROM_ID,
      toAccountId: TO_ID,
    });

    expect(envelope(harness.command).payload.accountEffects).toEqual([
      { accountId: FROM_ID, amountMinorUnits: "-15000", currency: "EGP" },
      { accountId: TO_ID, amountMinorUnits: "300", currency: "USD" },
    ]);
    expect(harness.accounts.get(FROM_ID)?.financialRevision).toBe("8");
    expect(harness.accounts.get(TO_ID)?.financialRevision).toBe("12");
  });

  it("updates a converted amount even when source amount and accounts are unchanged", async () => {
    const harness = createHarness();

    await harness.service.update(TRANSFER_ID, { convertedAmount: 4 });

    expect(envelope(harness.command).payload.accountEffects).toEqual([
      { accountId: TO_ID, amountMinorUnits: "200", currency: "USD" },
    ]);
    expect(harness.accounts.get(TO_ID)?.balance).toBe(14);
    expect(harness.transfers.get(TRANSFER_ID)?.convertedAmount).toBe(4);
  });

  it("moves a same-currency source account with one effect per affected account", async () => {
    const harness = createHarness();

    await harness.service.update(TRANSFER_ID, { fromAccountId: ALT_ID });

    expect(envelope(harness.command).payload.accountEffects).toEqual([
      { accountId: FROM_ID, amountMinorUnits: "10000", currency: "EGP" },
      { accountId: ALT_ID, amountMinorUnits: "-10000", currency: "EGP" },
    ]);
    expect(harness.accounts.get(FROM_ID)?.balance).toBe(1000);
    expect(harness.accounts.get(ALT_ID)?.balance).toBe(300);
    expect(harness.accounts.get(TO_ID)?.financialRevision).toBe("11");
  });

  it("commits metadata only when submitted financial fields equal the live record", async () => {
    const harness = createHarness();

    await harness.service.update(TRANSFER_ID, {
      amount: 100,
      convertedAmount: 2,
      fromAccountId: FROM_ID,
      notes: "updated",
      toAccountId: TO_ID,
    });

    expect(harness.command).not.toHaveBeenCalled();
    expect(harness.transfers.get(TRANSFER_ID)?.notes).toBe("updated");
    expect(harness.accounts.get(FROM_ID)?.financialRevision).toBe("7");
  });

  it("rejects a prepared transfer postimage that differs from command evidence", async () => {
    const harness = createHarness();

    await harness.service.update(TRANSFER_ID, { convertedAmount: 4 });

    const input = readCommandInput(harness.command);
    const plan = await input.prepareDomainOperationPlan();
    await expect(
      Promise.resolve().then(() =>
        plan.assertPreparedOwnership({
          cachedPreimages: [],
          preparedPostimages: [
            {
              id: TRANSFER_ID,
              kind: "update",
              table: "transfers",
              raw: fakeRaw({
                id: TRANSFER_ID,
                _status: "updated",
                _changed: "converted_amount",
                amount: 999,
                converted_amount: 4,
                created_at: Date.parse("2026-08-01T08:00:00.000Z"),
                currency: "EGP",
                date: new Date(2026, 7, 1).getTime(),
                deleted: false,
                exchange_rate: 50,
                from_account_id: FROM_ID,
                notes: "saved",
                sms_fingerprint: null,
                to_account_id: TO_ID,
                user_id: USER_ID,
              }),
            },
            {
              id: TO_ID,
              kind: "update",
              table: "accounts",
              raw: fakeRaw({
                id: TO_ID,
                _status: "updated",
                _changed: "balance,financial_revision",
                user_id: USER_ID,
              }),
            },
          ],
          userId: USER_ID,
        })
      )
    ).rejects.toThrow("TRANSFER_FINANCIAL_ACTION_INVALID_PLAN");
  });

  it("soft-deletes with exact inverse effects", async () => {
    const harness = createHarness();

    await harness.service.delete(TRANSFER_ID);

    expect(envelope(harness.command).payload.accountEffects).toEqual([
      { accountId: FROM_ID, amountMinorUnits: "10000", currency: "EGP" },
      { accountId: TO_ID, amountMinorUnits: "-200", currency: "USD" },
    ]);
    expect(harness.transfers.get(TRANSFER_ID)?.deleted).toBe(true);
  });

  it("converts into a destination-currency transaction as one group", async () => {
    const harness = createHarness();

    await harness.service.convertToTransaction({
      accountId: TO_ID,
      categoryId: CATEGORY_ID,
      transferId: TRANSFER_ID,
      type: "INCOME",
    });

    const action = envelope(harness.command);
    expect(action.payload.operationCode).toBe(
      "transfer.convert-to-transaction"
    );
    expect(action.payload.accountEffects).toEqual([
      { accountId: FROM_ID, amountMinorUnits: "10000", currency: "EGP" },
    ]);
    expect(harness.transactions.get(TRANSACTION_ID)?.amount).toBe(2);
    expect(harness.transactions.get(TRANSACTION_ID)?.currency).toBe("USD");
  });

  it("fails closed when a cross-currency create omits the destination amount", async () => {
    const harness = createHarness();
    harness.transfers.clear();

    await expect(
      harness.service.create({
        amount: 150,
        currency: "EGP",
        fromAccountId: FROM_ID,
        toAccountId: TO_ID,
      })
    ).rejects.toThrow("TRANSFER_DESTINATION_AMOUNT_REQUIRED");

    expect(harness.command).not.toHaveBeenCalled();
  });
});
