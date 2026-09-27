import type {
  Account,
  FinancialActionGroup,
  RecurringPayment,
  Transaction,
} from "@monyvi/db";
import type { Collection, Model } from "@nozbe/watermelondb";
import { canonicalizeFinancialActionEnvelope } from "@monyvi/logic";

import type { ExecuteAccountBalanceCommandInput } from "../../services/account-balance-command-service";
import {
  createRecurringPaymentFinancialActionService,
  type RecurringPaymentFinancialActionDependencies,
} from "../../services/recurring-payment-financial-action-service";
import type { CurrentUserDataScope } from "../../services/user-data-access";

const USER_ID = "20000000-0000-4000-8000-000000000002";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";
const PAYMENT_ID = "40000000-0000-4000-8000-000000000004";
const TRANSACTION_ID = "50000000-0000-4000-8000-000000000005";
const CATEGORY_ID = "60000000-0000-4000-8000-000000000006";
const NOW = new Date("2026-09-01T12:00:00.000Z");

type ExecuteMock = jest.Mock<
  ReturnType<
    RecurringPaymentFinancialActionDependencies["executeAccountBalanceCommand"]
  >,
  [ExecuteAccountBalanceCommandInput]
>;

function model(
  table: string,
  id: string,
  values: Readonly<Record<string, unknown>>,
  preparedState: "create" | null = null
): Model {
  return {
    id,
    table,
    _isEditing: false,
    _preparedState: preparedState,
    _raw: { id, _changed: "", _status: "synced", ...values },
  } as unknown as Model;
}

function harness(input?: {
  readonly accountCurrency?: string;
  readonly accountDeleted?: boolean;
  readonly endDate?: Date;
  readonly paymentDeleted?: boolean;
  readonly paymentStatus?: "ACTIVE" | "COMPLETED" | "PAUSED";
  readonly paymentType?: "EXPENSE" | "INCOME";
}): {
  readonly account: Account;
  readonly execute: ExecuteMock;
  readonly payment: RecurringPayment;
  readonly service: ReturnType<
    typeof createRecurringPaymentFinancialActionService
  >;
} {
  const account = model("accounts", ACCOUNT_ID, {
    balance: 1000,
    currency: input?.accountCurrency ?? "EGP",
    deleted: input?.accountDeleted ?? false,
    financial_revision: "7",
    user_id: USER_ID,
  }) as Account;
  Object.assign(account, {
    balance: 1000,
    currency: input?.accountCurrency ?? "EGP",
    deleted: input?.accountDeleted ?? false,
    financialRevision: "7",
    userId: USER_ID,
  });
  const payment = model("recurring_payments", PAYMENT_ID, {
    category_id: CATEGORY_ID,
    currency: "EGP",
    deleted: input?.paymentDeleted ?? false,
    end_date: input?.endDate?.getTime() ?? null,
    frequency: "MONTHLY",
    financial_revision: "7",
    next_due_date: new Date(2026, 8, 1).getTime(),
    status: input?.paymentStatus ?? "ACTIVE",
    type: input?.paymentType ?? "EXPENSE",
    updated_at: new Date("2026-08-31T12:00:00.000Z").getTime(),
    user_id: USER_ID,
  }) as RecurringPayment;
  Object.assign(payment, {
    categoryId: CATEGORY_ID,
    currency: "EGP",
    deleted: input?.paymentDeleted ?? false,
    endDate: input?.endDate,
    frequency: "MONTHLY",
    financialRevision: "7",
    nextDueDate: new Date(2026, 8, 1),
    status: input?.paymentStatus ?? "ACTIVE",
    type: input?.paymentType ?? "EXPENSE",
    updatedAt: new Date("2026-08-31T12:00:00.000Z"),
    userId: USER_ID,
  });
  const transaction = model(
    "transactions",
    TRANSACTION_ID,
    {
      account_id: ACCOUNT_ID,
      amount: 125,
      category_id: CATEGORY_ID,
      counterparty: null,
      created_at: NOW.getTime(),
      currency: "EGP",
      date: NOW.getTime(),
      deleted: false,
      is_draft: false,
      linked_asset_id: null,
      linked_debt_id: null,
      linked_recurring_id: PAYMENT_ID,
      note: null,
      sms_fingerprint: null,
      source: "RECURRING",
      type: input?.paymentType ?? "EXPENSE",
      user_id: USER_ID,
    },
    "create"
  ) as Transaction;
  Object.assign(transaction, {
    accountId: ACCOUNT_ID,
    amount: 125,
    categoryId: CATEGORY_ID,
    createdAt: NOW,
    currency: "EGP",
    date: NOW,
    deleted: false,
    isDraft: false,
    linkedRecurringId: PAYMENT_ID,
    source: "RECURRING",
    type: input?.paymentType ?? "EXPENSE",
    userId: USER_ID,
  });
  const accountCollection = Object.create(null) as Collection<Account>;
  const paymentCollection = Object.create(null) as Collection<RecurringPayment>;
  const scope = {
    userId: USER_ID,
    findOwned: jest.fn((collection: Collection<Model>) =>
      Promise.resolve(
        (collection as unknown) === accountCollection ? account : payment
      )
    ),
  } as unknown as CurrentUserDataScope;
  const transactionCollection = Object.assign(Object.create(null), {
    prepareCreate: jest.fn((builder: (record: Transaction) => void) => {
      builder(transaction);
      Object.assign(
        transaction._raw as unknown as Record<string, unknown>,
        {
          account_id: transaction.accountId,
          amount: transaction.amount,
          category_id: transaction.categoryId,
          currency: transaction.currency,
          date: transaction.date.getTime(),
          deleted: transaction.deleted,
          is_draft: transaction.isDraft,
          linked_recurring_id: transaction.linkedRecurringId ?? null,
          note: transaction.note ?? null,
          source: transaction.source,
          type: transaction.type,
          user_id: transaction.userId,
        }
      );
      return transaction;
    }),
  }) as Collection<Transaction>;
  const execute: ExecuteMock = jest.fn(
    async (command: ExecuteAccountBalanceCommandInput) => {
    const plan = await command.prepareDomainOperationPlan();
    const cachedPreimages = plan.existingOperations.map((operation) => ({
      id: operation.model.id,
      kind: operation.kind,
      raw: { ...operation.model._raw },
      table: operation.model.table,
    })) as never;
    await plan.assertCachedOwnership({
      cachedPreimages,
      userId: USER_ID,
    });
    for (const operation of plan.existingOperations) {
      if (operation.kind !== "update") continue;
      operation.update(operation.model);
      const raw = operation.model._raw as unknown as Record<string, unknown>;
      if (operation.model.table === "accounts") {
        const updatedAccount = operation.model as Account;
        raw.balance = updatedAccount.balance;
        raw.financial_revision = updatedAccount.financialRevision;
      }
      if (operation.model.table === "recurring_payments") {
        const updatedPayment = operation.model as RecurringPayment;
        raw.financial_revision = updatedPayment.financialRevision;
        raw.next_due_date = updatedPayment.nextDueDate.getTime();
        raw.status = updatedPayment.status;
      }
    }
    await plan.assertPreparedOwnership({
      cachedPreimages,
      preparedPostimages: [
        ...plan.preparedCreates.map((record) => ({
          id: record.id,
          kind: "create" as const,
          raw: record._raw,
          table: record.table,
        })),
        ...plan.existingOperations.map((operation) => ({
          id: operation.model.id,
          kind: operation.kind,
          raw: operation.model._raw,
          table: operation.model.table,
        })),
      ],
      userId: USER_ID,
    });
      return {
        kind: "committed" as const,
        record: model(
          "financial_action_groups",
          TRANSACTION_ID,
          {}
        ) as unknown as FinancialActionGroup,
      };
    }
  );
  const dependencies: RecurringPaymentFinancialActionDependencies = {
    accountsCollection: () => accountCollection,
    assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
    calculateNextDueDate: () => new Date(2026, 9, 1),
    createId: () => TRANSACTION_ID,
    executeAccountBalanceCommand: execute,
    getCurrentUserDataScope: jest.fn(() => Promise.resolve(scope)),
    hashProvider: {
      digestUtf8: jest.fn(() => Promise.resolve("a".repeat(64))),
    },
    now: () => NOW,
    recurringPaymentsCollection: () => paymentCollection,
    transactionsCollection: () => transactionCollection,
  };
  return {
    account,
    execute,
    payment,
    service: createRecurringPaymentFinancialActionService(dependencies),
  };
}

describe("recurring Pay Now financial action", () => {
  it("creates one linked transaction and advances its exact schedule atomically", async () => {
    const context = harness();

    await context.service.submit({
      accountId: ACCOUNT_ID,
      amount: 125,
      paymentId: PAYMENT_ID,
    });

    const command = context.execute.mock.calls[0]?.[0] as
      | ExecuteAccountBalanceCommandInput
      | undefined;
    expect(command).toBeDefined();
    expect(canonicalizeFinancialActionEnvelope(command?.envelope)).toMatchObject({
      domain: "recurring_payments",
      domainReferenceId: PAYMENT_ID,
      kind: "pay_now",
      payload: {
        accountEffects: [
          {
            accountId: ACCOUNT_ID,
            amountMinorUnits: "-12500",
            currency: "EGP",
            effectId: TRANSACTION_ID,
          },
        ],
        domainMutation: {
          records: [
            {
              after: {
                id: PAYMENT_ID,
                financialRevision: "8",
                nextDueDate: "2026-10-01",
                status: "ACTIVE",
              },
              entity: "recurring_payment",
              expectedRevision: "7",
              mode: "update",
            },
            {
              after: {
                id: TRANSACTION_ID,
                linkedRecurringId: PAYMENT_ID,
                source: "RECURRING",
              },
              entity: "transaction",
              mode: "create",
            },
          ],
        },
        operationCode: "recurring.pay-now",
      },
    });
    expect(context.account.balance).toBe(875);
    expect(context.account.financialRevision).toBe("8");
    expect(context.payment.nextDueDate).toEqual(new Date(2026, 9, 1));
    expect(context.payment.status).toBe("ACTIVE");
    expect(context.payment.financialRevision).toBe("8");
  });

  it("completes a final occurrence without advancing beyond end date", async () => {
    const context = harness({ endDate: new Date(2026, 8, 1) });

    await context.service.submit({
      accountId: ACCOUNT_ID,
      amount: 125,
      paymentId: PAYMENT_ID,
    });

    expect(context.payment.nextDueDate).toEqual(new Date(2026, 8, 1));
    expect(context.payment.status).toBe("COMPLETED");
  });

  it.each(["PAUSED", "COMPLETED"] as const)(
    "fails closed when the recurring payment is %s",
    async (paymentStatus) => {
      const context = harness({ paymentStatus });

      await expect(
        context.service.submit({
          accountId: ACCOUNT_ID,
          amount: 125,
          paymentId: PAYMENT_ID,
        })
      ).rejects.toThrow("RECURRING_PAYMENT_UNAVAILABLE");

      expect(context.execute).not.toHaveBeenCalled();
    }
  );

  it("fails closed when the recurring payment is deleted", async () => {
    const context = harness({ paymentDeleted: true });

    await expect(
      context.service.submit({
        accountId: ACCOUNT_ID,
        amount: 125,
        paymentId: PAYMENT_ID,
      })
    ).rejects.toThrow("RECURRING_PAYMENT_UNAVAILABLE");

    expect(context.execute).not.toHaveBeenCalled();
  });

  it("fails closed when the selected account is unavailable", async () => {
    const context = harness({ accountDeleted: true });

    await expect(
      context.service.submit({
        accountId: ACCOUNT_ID,
        amount: 125,
        paymentId: PAYMENT_ID,
      })
    ).rejects.toThrow("RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE");

    expect(context.execute).not.toHaveBeenCalled();
  });

  it("fails closed when the selected account currency differs", async () => {
    const context = harness({ accountCurrency: "USD" });

    await expect(
      context.service.submit({
        accountId: ACCOUNT_ID,
        amount: 125,
        paymentId: PAYMENT_ID,
      })
    ).rejects.toThrow("RECURRING_PAYMENT_ACCOUNT_CURRENCY_MISMATCH");

    expect(context.execute).not.toHaveBeenCalled();
  });

  it("uses a positive exact effect for recurring income", async () => {
    const context = harness({ paymentType: "INCOME" });

    await context.service.submit({
      accountId: ACCOUNT_ID,
      amount: 125,
      paymentId: PAYMENT_ID,
    });

    const command = context.execute.mock.calls[0]?.[0] as
      | ExecuteAccountBalanceCommandInput
      | undefined;
    expect(command?.envelope.payload.accountEffects).toEqual([
      {
        accountId: ACCOUNT_ID,
        amountMinorUnits: "12500",
        currency: "EGP",
        effectId: TRANSACTION_ID,
      },
    ]);
    expect(context.account.balance).toBe(1125);
  });
});
