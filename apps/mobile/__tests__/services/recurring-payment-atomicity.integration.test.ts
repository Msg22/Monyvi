import type { Database, Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { Account, RecurringPayment, Transaction } from "@monyvi/db";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}

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
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const { Account } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Account")
  >("../../../../packages/db/src/models/Account");
  const { Category } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Category")
  >("../../../../packages/db/src/models/Category");
  const { RecurringPayment } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/RecurringPayment")
  >("../../../../packages/db/src/models/RecurringPayment");
  const { Transaction } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Transaction")
  >("../../../../packages/db/src/models/Transaction");
  const { Transfer } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Transfer")
  >("../../../../packages/db/src/models/Transfer");

  const adapter = new SQLiteAdapter({ schema });
  const modelClasses = [
    Account,
    Category,
    RecurringPayment,
    Transaction,
    Transfer,
  ];
  const database = new WatermelonDatabase({ adapter, modelClasses });

  return {
    Account,
    Category,
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
  getCurrentUserId: (): Promise<string> => Promise.resolve("user-1"),
}));

import { submitRecurringPayment } from "@/services/recurring-payment-service";

const {
  database,
  __adapter: adapter,
  __modelClasses: modelClasses,
} = jest.requireMock<TestDatabaseModule>("@monyvi/db");

const originalDueDate = new Date("2026-07-01T00:00:00.000Z");

async function seedAtomicityFixture(): Promise<{
  readonly account: Account;
  readonly payment: RecurringPayment;
}> {
  return await database.write(async () => {
    const account = await database.get<Account>("accounts").create((record) => {
      record.userId = "user-1";
      record.name = "Cash";
      record.type = "CASH";
      record.currency = "EGP";
      record.balance = 1000;
      record.isDefault = true;
      record.deleted = false;
    });
    const payment = await database
      .get<RecurringPayment>("recurring_payments")
      .create((record) => {
        record.userId = "user-1";
        record.name = "Rent";
        record.amount = 250;
        record.currency = "EGP";
        record.type = "EXPENSE";
        record.accountId = account.id;
        record.categoryId = "category-1";
        record.frequency = "MONTHLY";
        record.startDate = new Date("2026-06-01T00:00:00.000Z");
        record.nextDueDate = originalDueDate;
        record.action = "NOTIFY";
        record.status = "ACTIVE";
        record.deleted = false;
      });

    await database.get<Transaction>("transactions").create((record) => {
      record._raw.id = "rollback-conflict";
      record.userId = "user-1";
      record.accountId = account.id;
      record.amount = 1;
      record.currency = "EGP";
      record.type = "EXPENSE";
      record.categoryId = "category-1";
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
  it("restores cached models after rollback so a same-instance retry applies once", async () => {
    const { account, payment } = await seedAtomicityFixture();
    const originalAdapterBatch = database.adapter.batch.bind(database.adapter);
    const adapterBatchSpy = jest
      .spyOn(database.adapter, "batch")
      .mockImplementation(async (operations): Promise<void> => {
        if (operations.length !== 3) {
          await originalAdapterBatch(operations);
          return;
        }

        const transactionCreateOperation = operations[0];
        if (
          transactionCreateOperation?.[0] !== "create" ||
          transactionCreateOperation[1] !== "transactions"
        ) {
          throw new Error("Expected transaction create operation first");
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
    ).rejects.toThrow();

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
    const originalDatabaseBatch = database.batch.bind(database);
    const databaseBatchSpy = jest
      .spyOn(database, "batch")
      .mockImplementationOnce(async (...records): Promise<void> => {
        await originalDatabaseBatch(...records);
        throw observerError;
      });

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
      databaseBatchSpy.mockRestore();
    }

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
