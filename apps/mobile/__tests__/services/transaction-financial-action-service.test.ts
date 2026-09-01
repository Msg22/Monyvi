import type { Account, FinancialActionGroup, Transaction } from "@monyvi/db";
import type { Collection, Model } from "@nozbe/watermelondb";
import {
  canonicalizeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
} from "@monyvi/logic";

import {
  createTransactionFinancialActionService,
  type TransactionFinancialActionDependencies,
} from "../../services/transaction-financial-action-service";
import type { ExecuteAccountBalanceCommandInput } from "../../services/account-balance-command-service";
import type { CurrentUserDataScope } from "../../services/user-data-access";

const USER_ID = "20000000-0000-4000-8000-000000000002";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";
const TRANSACTION_ID = "40000000-0000-4000-8000-000000000004";
const CATEGORY_ID = "50000000-0000-4000-8000-000000000005";
const CREATED_AT = new Date("2026-09-01T12:00:00.000Z");

interface FakeModel extends Model {
  readonly id: string;
  readonly table: string;
  _raw: Model["_raw"];
}

type ExecuteMock = jest.Mock<
  ReturnType<TransactionFinancialActionDependencies["executeAccountBalanceCommand"]>,
  [ExecuteAccountBalanceCommandInput]
>;

function fakeModel(
  table: string,
  id: string,
  values: Readonly<Record<string, unknown>>
): FakeModel {
  return {
    id,
    table,
    _isEditing: false,
    _preparedState: table === "transactions" ? "create" : null,
    _raw: {
      id,
      _status: table === "transactions" ? "created" : "synced",
      _changed: "",
      ...values,
    },
  } as unknown as FakeModel;
}

function createHarness(input?: {
  readonly balance?: number;
  readonly currency?: string;
  readonly deleted?: boolean;
  readonly financialRevision?: string;
  readonly transactionUserId?: string;
}): {
  readonly account: Account;
  readonly execute: ExecuteMock;
  readonly service: ReturnType<typeof createTransactionFinancialActionService>;
} {
  const account = fakeModel("accounts", ACCOUNT_ID, {
    balance: input?.balance ?? 1000,
    currency: input?.currency ?? "EGP",
    deleted: input?.deleted ?? false,
    financial_revision: input?.financialRevision ?? "7",
    user_id: USER_ID,
  }) as unknown as Account;
  Object.assign(account, {
    balance: input?.balance ?? 1000,
    currency: input?.currency ?? "EGP",
    deleted: input?.deleted ?? false,
    financialRevision: input?.financialRevision ?? "7",
    userId: USER_ID,
  });

  const transaction = fakeModel("transactions", TRANSACTION_ID, {
    account_id: ACCOUNT_ID,
    amount: 200,
    category_id: CATEGORY_ID,
    counterparty: null,
    created_at: CREATED_AT.getTime(),
    currency: "EGP",
    date: new Date(2026, 8, 1).getTime(),
    deleted: false,
    is_draft: false,
    linked_asset_id: null,
    linked_debt_id: null,
    linked_recurring_id: null,
    note: null,
    sms_fingerprint: null,
    source: "MANUAL",
    type: "EXPENSE",
    updated_at: CREATED_AT.getTime(),
    user_id: input?.transactionUserId ?? USER_ID,
  }) as unknown as Transaction;
  Object.assign(transaction, {
    accountId: ACCOUNT_ID,
    amount: 200,
    categoryId: CATEGORY_ID,
    counterparty: undefined,
    createdAt: CREATED_AT,
    currency: "EGP",
    date: new Date(2026, 8, 1),
    deleted: false,
    isDraft: false,
    linkedAssetId: undefined,
    linkedDebtId: undefined,
    linkedRecurringId: undefined,
    note: undefined,
    smsFingerprint: undefined,
    source: "MANUAL",
    type: "EXPENSE",
    userId: input?.transactionUserId ?? USER_ID,
  });

  const scope = {
    userId: USER_ID,
    findOwned: jest.fn(() => Promise.resolve(account)),
  } as unknown as CurrentUserDataScope;
  const execute: ExecuteMock = jest.fn(
    async (command: ExecuteAccountBalanceCommandInput) => {
      const plan = await command.prepareDomainOperationPlan();
      const accountOperation = plan.existingOperations[0];
      if (!accountOperation || accountOperation.kind !== "update") {
        throw new Error("missing account update");
      }
      accountOperation.update(accountOperation.model);
      await plan.assertCachedOwnership({
        userId: USER_ID,
        cachedPreimages: [
          {
            id: ACCOUNT_ID,
            kind: "update",
            table: "accounts",
            raw: account._raw,
          },
        ],
      });
      await plan.assertPreparedOwnership({
        userId: USER_ID,
        cachedPreimages: [],
        preparedPostimages: [
          {
            id: TRANSACTION_ID,
            kind: "create",
            table: "transactions",
            raw: transaction._raw,
          },
        ],
      });
      const committedRecord = fakeModel(
        "financial_action_groups",
        TRANSACTION_ID,
        {}
      ) as unknown as FinancialActionGroup;
      return { kind: "committed" as const, record: committedRecord };
    }
  );
  const accountsCollection = Object.create(null) as Collection<Account>;
  const transactionsCollection = Object.assign(Object.create(null), {
    prepareCreate: jest.fn(
      (builder: (record: Transaction) => void): Transaction => {
        builder(transaction);
        Object.assign(
          transaction._raw as unknown as Record<string, unknown>,
          {
            account_id: transaction.accountId,
            amount: transaction.amount,
            category_id: transaction.categoryId,
            counterparty: transaction.counterparty ?? null,
            currency: transaction.currency,
            date: transaction.date.getTime(),
            deleted: transaction.deleted,
            is_draft: transaction.isDraft,
            linked_asset_id: transaction.linkedAssetId ?? null,
            linked_debt_id: transaction.linkedDebtId ?? null,
            linked_recurring_id: transaction.linkedRecurringId ?? null,
            note: transaction.note ?? null,
            sms_fingerprint: transaction.smsFingerprint ?? null,
            source: transaction.source,
            type: transaction.type,
            user_id: input?.transactionUserId ?? transaction.userId,
          }
        );
        return transaction;
      }
    ),
  }) as Collection<Transaction>;
  const dependencies: TransactionFinancialActionDependencies = {
    accountsCollection: () => accountsCollection,
    assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
    executeAccountBalanceCommand: execute,
    getCurrentUserDataScope: jest.fn(() => Promise.resolve(scope)),
    hashProvider: {
      digestUtf8: jest.fn(() => Promise.resolve("a".repeat(64))),
    },
    transactionsCollection: () => transactionsCollection,
  };

  return {
    account,
    execute,
    service: createTransactionFinancialActionService(dependencies),
  };
}

function readEnvelope(execute: ExecuteMock): FinancialActionEnvelopeV1 {
  const input = execute.mock.calls[0]?.[0];
  if (!input) throw new Error("missing command input");
  return canonicalizeFinancialActionEnvelope(input.envelope);
}

describe("transaction financial action service", () => {
  it("commits plain expense creation through one exact guarded action", async () => {
    const harness = createHarness();

    await expect(
      harness.service.create({
        accountId: ACCOUNT_ID,
        amount: 200,
        categoryId: CATEGORY_ID,
        currency: "EGP",
        date: new Date(2026, 8, 1),
        source: "MANUAL",
        type: "EXPENSE",
      })
    ).resolves.toMatchObject({ id: TRANSACTION_ID });

    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(harness.account.balance).toBe(800);
    expect(harness.account.financialRevision).toBe("8");
    expect(readEnvelope(harness.execute)).toEqual({
      accountGuards: [{ accountId: ACCOUNT_ID, expectedRevision: "7" }],
      actionId: TRANSACTION_ID,
      domain: "transactions",
      domainReferenceId: TRANSACTION_ID,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "create",
      occurredAt: CREATED_AT.toISOString(),
      payload: {
        accountEffects: [
          {
            accountId: ACCOUNT_ID,
            amountMinorUnits: "-20000",
            currency: "EGP",
          },
        ],
        domainMutation: {
          records: [
            {
              after: {
                accountId: ACCOUNT_ID,
                amountMinorUnits: "20000",
                categoryId: CATEGORY_ID,
                counterparty: null,
                createdAt: CREATED_AT.toISOString(),
                currency: "EGP",
                date: "2026-09-01",
                deleted: false,
                id: TRANSACTION_ID,
                isDraft: false,
                linkedAssetId: null,
                linkedDebtId: null,
                linkedRecurringId: null,
                note: null,
                smsFingerprint: null,
                source: "MANUAL",
                type: "EXPENSE",
              },
              entity: "transaction",
              expectedUpdatedAt: null,
              mode: "create",
            },
          ],
        },
        domainRecordRefs: [TRANSACTION_ID],
        operationCode: "transaction.create",
        schemaVersion: "account.balance-effects/v1",
      },
      payloadVersion: "account.balance-effects/v1",
      userId: USER_ID,
    });
  });

  it("uses a positive exact effect for income", async () => {
    const harness = createHarness();

    await harness.service.create({
      accountId: ACCOUNT_ID,
      amount: 200,
      categoryId: CATEGORY_ID,
      currency: "EGP",
      date: new Date(2026, 8, 1),
      source: "MANUAL",
      type: "INCOME",
    });

    expect(harness.account.balance).toBe(1200);
    expect(readEnvelope(harness.execute).payload.accountEffects).toEqual([
      {
        accountId: ACCOUNT_ID,
        amountMinorUnits: "20000",
        currency: "EGP",
      },
    ]);
  });

  it("fails closed before the command when the account is deleted", async () => {
    const harness = createHarness({ deleted: true });

    await expect(
      harness.service.create({
        accountId: ACCOUNT_ID,
        amount: 200,
        categoryId: CATEGORY_ID,
        currency: "EGP",
        date: new Date(2026, 8, 1),
        source: "MANUAL",
        type: "EXPENSE",
      })
    ).rejects.toThrow("TRANSACTION_ACCOUNT_UNAVAILABLE");

    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("fails closed before the command when account currency differs", async () => {
    const harness = createHarness({ currency: "USD" });

    await expect(
      harness.service.create({
        accountId: ACCOUNT_ID,
        amount: 200,
        categoryId: CATEGORY_ID,
        currency: "EGP",
        date: new Date(2026, 8, 1),
        source: "MANUAL",
        type: "EXPENSE",
      })
    ).rejects.toThrow("TRANSACTION_ACCOUNT_CURRENCY_MISMATCH");

    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("rejects a prepared transaction outside the authenticated owner", async () => {
    const harness = createHarness({
      transactionUserId: "60000000-0000-4000-8000-000000000006",
    });

    await expect(
      harness.service.create({
        accountId: ACCOUNT_ID,
        amount: 200,
        categoryId: CATEGORY_ID,
        currency: "EGP",
        date: new Date(2026, 8, 1),
        source: "MANUAL",
        type: "EXPENSE",
      })
    ).rejects.toThrow("TRANSACTION_FINANCIAL_ACTION_OWNERSHIP_FAILED");
  });
});
