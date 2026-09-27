import type { Database, Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { Account, RecurringPayment, Transaction } from "@monyvi/db";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}

const mockUserId = "018f0c7a-1234-4abc-8def-000000000201";
const CATEGORY_ID = "018f0c7a-1234-4abc-8def-000000000202";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown => {
  const dispatcherModule: unknown = jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  );

  return dispatcherModule;
});

jest.mock("@monyvi/db", () => {
  const { Database: WatermelonDatabase, Q } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  const SQLiteAdapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { setGenerator } = jest.requireActual<
    typeof import("@nozbe/watermelondb/utils/common/randomId")
  >("@nozbe/watermelondb/utils/common/randomId");
  const { randomUUID } = jest.requireActual<typeof import("node:crypto")>(
    "node:crypto"
  );
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const { Account } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Account")
  >("../../../../packages/db/src/models/Account");
  const { AccountFinancialEffect } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/AccountFinancialEffect")
  >("../../../../packages/db/src/models/AccountFinancialEffect");
  const { Category } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Category")
  >("../../../../packages/db/src/models/Category");
  const { RecurringPayment } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/RecurringPayment")
  >("../../../../packages/db/src/models/RecurringPayment");
  const { FinancialActionGroup } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/FinancialActionGroup")
  >("../../../../packages/db/src/models/FinancialActionGroup");
  const { Transaction } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Transaction")
  >("../../../../packages/db/src/models/Transaction");
  const { Transfer } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Transfer")
  >("../../../../packages/db/src/models/Transfer");

  setGenerator(randomUUID);
  const adapter = new SQLiteAdapter({ schema });
  const modelClasses = [
    Account,
    AccountFinancialEffect,
    Category,
    FinancialActionGroup,
    RecurringPayment,
    Transaction,
    Transfer,
  ];
  const database = new WatermelonDatabase({ adapter, modelClasses });

  return {
    Account,
    AccountFinancialEffect,
    Category,
    FinancialActionGroup,
    RecurringPayment,
    Transaction,
    Transfer,
    Q,
    database,
    __adapter: adapter,
    __modelClasses: modelClasses,
  };
});

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockUserId),
}));

jest.mock("expo-crypto", () => {
  const actual = jest.requireActual<typeof import("expo-crypto")>("expo-crypto");
  const { createHash, randomUUID } = jest.requireActual<
    typeof import("node:crypto")
  >("node:crypto");
  return {
    ...actual,
    digestStringAsync: (_algorithm: string, value: string): Promise<string> =>
      Promise.resolve(createHash("sha256").update(value).digest("hex")),
    randomUUID,
  };
});

import { submitRecurringPayment } from "@/services/recurring-payment-service";

const {
  database,
  __adapter: adapter,
  __modelClasses: modelClasses,
} = jest.requireMock<TestDatabaseModule>("@monyvi/db");

const originalDueDate = new Date("2026-07-01T00:00:00.000Z");

async function seedAtomicityFixture(
  endDate?: Date,
  conflictTransactionId = "rollback-conflict"
): Promise<{
  readonly account: Account;
  readonly payment: RecurringPayment;
}> {
  return await database.write(async () => {
    const account = await database.get<Account>("accounts").create((record) => {
      record.userId = mockUserId;
      record.name = "Cash";
      record.type = "CASH";
      record.currency = "EGP";
      record.balance = 1000;
      record.financialRevision = "0";
      record.isDefault = true;
      record.deleted = false;
    });
    const payment = await database
      .get<RecurringPayment>("recurring_payments")
      .create((record) => {
        record.userId = mockUserId;
        record.name = "Rent";
        record.amount = 250;
        record.currency = "EGP";
        record.financialRevision = "0";
        record.type = "EXPENSE";
        record.accountId = account.id;
        record.categoryId = CATEGORY_ID;
        record.frequency = "MONTHLY";
        record.startDate = new Date("2026-06-01T00:00:00.000Z");
        record.endDate = endDate;
        record.nextDueDate = originalDueDate;
        record.action = "NOTIFY";
        record.status = "ACTIVE";
        record.deleted = false;
      });

    await database.get<Transaction>("transactions").create((record) => {
      record._raw.id = conflictTransactionId;
      record.userId = mockUserId;
      record.accountId = account.id;
      record.amount = 1;
      record.currency = "EGP";
      record.type = "EXPENSE";
      record.categoryId = CATEGORY_ID;
      record.date = new Date("2026-06-01T00:00:00.000Z");
      record.source = "MANUAL";
      record.isDraft = false;
      record.deleted = false;
    });

    return { account, payment };
  });
}

async function openFreshDatabase(): Promise<Database> {
  const clonedAdapter = await adapter.testClone();
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");

  return new WatermelonDatabase({
    adapter: clonedAdapter,
    modelClasses,
  });
}

describe("recurring payment SQLite atomicity", () => {
  it("commits the final transaction, balance, next due date, and completion together", async () => {
    const { account, payment } = await seedAtomicityFixture(
      originalDueDate,
      "final-payment-conflict"
    );

    await submitRecurringPayment({
      payment,
      accountId: account.id,
      amount: 250,
    });

    const freshDatabase = await openFreshDatabase();
    const accountAfterPayment = await freshDatabase
      .get<Account>("accounts")
      .find(account.id);
    const paymentAfterPayment = await freshDatabase
      .get<RecurringPayment>("recurring_payments")
      .find(payment.id);
    const transactions = await freshDatabase
      .get<Transaction>("transactions")
      .query()
      .fetch();

    expect(accountAfterPayment.balance).toBe(750);
    expect(paymentAfterPayment.nextDueDate).toEqual(
      new Date("2026-07-01T00:00:00.000Z")
    );
    expect(paymentAfterPayment.status).toBe("COMPLETED");
    expect(
      transactions.filter((transaction) => transaction.linkedRecurringId === payment.id)
    ).toHaveLength(1);
  });

  it("restores cached models after rollback so a same-instance retry applies once", async () => {
    const { account, payment } = await seedAtomicityFixture();
    const originalAdapterBatch = database.adapter.batch.bind(database.adapter);
    const adapterBatchSpy = jest
      .spyOn(database.adapter, "batch")
      .mockImplementation(async (operations): Promise<void> => {
        const transactionCreateOperation = operations.find(
          (operation) =>
            operation[0] === "create" && operation[1] === "transactions"
        );
        if (
          transactionCreateOperation?.[0] !== "create" ||
          transactionCreateOperation[1] !== "transactions"
        ) {
          await originalAdapterBatch(operations);
          return;
        }

        const conflictingOperation: typeof transactionCreateOperation = [
          "create",
          "transactions",
          {
            ...transactionCreateOperation[2],
            id: "rollback-conflict",
          },
        ];

        await originalAdapterBatch([...operations, conflictingOperation]);
      });

    await expect(
      submitRecurringPayment({
        payment,
        accountId: account.id,
        amount: 250,
        note: "Rent payment",
      })
    ).rejects.toMatchObject({
      name: "SqliteError",
      message: "UNIQUE constraint failed: transactions.id",
    });

    adapterBatchSpy.mockRestore();

    expect(account.balance).toBe(1000);
    expect(payment.nextDueDate).toEqual(originalDueDate);

    await submitRecurringPayment({
      payment,
      accountId: account.id,
      amount: 250,
      note: "Rent payment",
    });

    const freshDatabase = await openFreshDatabase();
    const freshAccount = await freshDatabase
      .get<Account>("accounts")
      .find(account.id);
    const freshPayment = await freshDatabase
      .get<RecurringPayment>("recurring_payments")
      .find(payment.id);
    const linkedTransactions = await freshDatabase
      .get<Transaction>("transactions")
      .query()
      .fetch();

    expect(freshAccount.balance).toBe(750);
    expect(freshPayment.nextDueDate).toEqual(
      new Date("2026-08-01T00:00:00.000Z")
    );
    expect(
      linkedTransactions.filter(
        (transaction) => transaction.linkedRecurringId === payment.id
      )
    ).toHaveLength(1);

    const observerError = new Error("observer failed after commit");
    const healthyDatabaseSubscriber = jest.fn();
    const healthyCollectionSubscriber = jest.fn();
    const leadingHealthyAccountSubscriber = jest.fn();
    const trailingHealthyAccountSubscriber = jest.fn();
    const healthyPaymentSubscriber = jest.fn();
    const unsubscribeHealthyDatabaseSubscriber = database.experimentalSubscribe(
      ["accounts"],
      healthyDatabaseSubscriber,
      "atomic batch regression"
    );
    const unsubscribeHealthyCollectionSubscriber = database
      .get<Account>("accounts")
      .experimentalSubscribe(healthyCollectionSubscriber);
    const unsubscribeLeadingHealthyAccountSubscriber =
      account.experimentalSubscribe(leadingHealthyAccountSubscriber);
    const unsubscribeThrowingSubscriber = account.experimentalSubscribe(() => {
      throw observerError;
    });
    const unsubscribeTrailingHealthyAccountSubscriber =
      account.experimentalSubscribe(trailingHealthyAccountSubscriber);
    const unsubscribeHealthyPaymentSubscriber = payment.experimentalSubscribe(
      healthyPaymentSubscriber
    );

    try {
      await expect(
        submitRecurringPayment({
          payment,
          accountId: account.id,
          amount: 250,
          note: "Second rent payment",
        })
      ).resolves.toBeUndefined();
    } finally {
      unsubscribeHealthyPaymentSubscriber();
      unsubscribeTrailingHealthyAccountSubscriber();
      unsubscribeThrowingSubscriber();
      unsubscribeLeadingHealthyAccountSubscriber();
      unsubscribeHealthyCollectionSubscriber();
      unsubscribeHealthyDatabaseSubscriber();
    }

    expect(healthyDatabaseSubscriber).toHaveBeenCalledTimes(1);
    expect(healthyCollectionSubscriber).toHaveBeenCalledTimes(1);
    expect(leadingHealthyAccountSubscriber).toHaveBeenCalledTimes(1);
    expect(leadingHealthyAccountSubscriber).toHaveBeenCalledWith(false);
    expect(trailingHealthyAccountSubscriber).toHaveBeenCalledTimes(1);
    expect(trailingHealthyAccountSubscriber).toHaveBeenCalledWith(false);
    expect(healthyPaymentSubscriber).toHaveBeenCalledTimes(1);
    expect(healthyPaymentSubscriber).toHaveBeenCalledWith(false);

    expect(account.balance).toBe(500);
    expect(payment.nextDueDate).toEqual(new Date("2026-09-01T00:00:00.000Z"));

    const databaseAfterNotificationFailure = await openFreshDatabase();
    const accountAfterNotificationFailure =
      await databaseAfterNotificationFailure
        .get<Account>("accounts")
        .find(account.id);
    const paymentAfterNotificationFailure =
      await databaseAfterNotificationFailure
        .get<RecurringPayment>("recurring_payments")
        .find(payment.id);
    const transactionsAfterNotificationFailure =
      await databaseAfterNotificationFailure
        .get<Transaction>("transactions")
        .query()
        .fetch();

    expect(accountAfterNotificationFailure.balance).toBe(500);
    expect(paymentAfterNotificationFailure.nextDueDate).toEqual(
      new Date("2026-09-01T00:00:00.000Z")
    );
    expect(
      transactionsAfterNotificationFailure.filter(
        (transaction) => transaction.linkedRecurringId === payment.id
      )
    ).toHaveLength(2);
  });
});
