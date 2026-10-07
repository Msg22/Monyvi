import { createHash } from "node:crypto";

import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  Category,
  FinancialActionGroup,
  RecurringPayment,
  Transaction,
} from "@monyvi/db";
import { serializeCanonicalJsonValue } from "@monyvi/logic";

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
  const { randomUUID } =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
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
  const { FinancialActionGroup } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/FinancialActionGroup")
  >("../../../../packages/db/src/models/FinancialActionGroup");
  const { RecurringPayment } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/RecurringPayment")
  >("../../../../packages/db/src/models/RecurringPayment");
  const { Transaction } = jest.requireActual<
    typeof import("../../../../packages/db/src/models/Transaction")
  >("../../../../packages/db/src/models/Transaction");

  setGenerator(randomUUID);
  const adapter = new SQLiteAdapter({ schema });
  const modelClasses = [
    Account,
    AccountFinancialEffect,
    Category,
    FinancialActionGroup,
    RecurringPayment,
    Transaction,
  ];
  const database = new WatermelonDatabase({ adapter, modelClasses });

  return {
    Account,
    AccountFinancialEffect,
    Category,
    FinancialActionGroup,
    RecurringPayment,
    Transaction,
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
  const { createHash: nodeCreateHash } =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  let mockUuidCounter = 1001;
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: (_algorithm: string, value: string): Promise<string> =>
      Promise.resolve(
        nodeCreateHash("sha256").update(value, "utf8").digest("hex")
      ),
    randomUUID: (): string => {
      mockUuidCounter += 1;
      return `018f0c7a-1234-4abc-8def-${String(mockUuidCounter).padStart(
        12,
        "0"
      )}`;
    },
  };
});

import { submitGuardedRecurringPayment } from "@/services/recurring-payment-financial-action-production";
import { productionFinancialActionReconciliationService } from "@/services/financial-action-reconciliation-production";
import {
  markFinancialActionGroupSyncPending,
  recordFinancialActionGroupServerOutcome,
} from "@/services/financial-action-foundation-repository";
import { formatFinancialActionLocalDate } from "@/services/transaction-financial-action-service";

const {
  database,
  __adapter: adapter,
  __modelClasses: modelClasses,
} = jest.requireMock<TestDatabaseModule>("@monyvi/db");

const ORIGINAL_DUE_DATE = new Date(2026, 6, 1);

async function seedScheduleFixture(): Promise<{
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
    const existingCategories = await database
      .get<Category>("categories")
      .query(Q.where("id", CATEGORY_ID))
      .fetch();
    if (existingCategories.length === 0) {
      await database.get<Category>("categories").create((record) => {
        record._raw.id = CATEGORY_ID;
        record.userId = mockUserId;
        record.systemName = "rent";
        record.displayName = "Rent";
        record.level = 1;
        record.deleted = false;
      });
    }
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
        record.startDate = new Date(2026, 5, 1);
        record.nextDueDate = ORIGINAL_DUE_DATE;
        record.action = "NOTIFY";
        record.status = "ACTIVE";
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

function sha256Hex(canonicalText: string): string {
  return createHash("sha256").update(canonicalText, "utf8").digest("hex");
}

function staleOutcomeJson(accountId: string): string {
  const accountEntry = {
    accountId,
    balanceMinorUnits: "100000",
    canonicalActionId: null,
    canonicalRevision: "0",
    currency: "EGP",
    effectChain: [],
  };
  return serializeCanonicalJsonValue({
    canonicalAccounts: [
      {
        ...accountEntry,
        canonicalEvidenceHash: sha256Hex(
          serializeCanonicalJsonValue({ ...accountEntry, userId: mockUserId })
        ),
      },
    ],
  });
}

describe("guarded pay-now schedule restore across restart", () => {
  it("persists the original schedule in durable evidence", async () => {
    const { account, payment } = await seedScheduleFixture();

    await submitGuardedRecurringPayment({
      accountId: account.id,
      amount: 250,
      paymentId: payment.id,
    });

    const freshDatabase = await openFreshDatabase();
    const roots = await freshDatabase
      .get<FinancialActionGroup>("financial_action_groups")
      .query()
      .fetch();
    expect(roots).toHaveLength(1);
    const payload = JSON.parse(roots[0]?.payloadJson ?? "{}") as {
      payload?: {
        domainMutation?: {
          records?: Array<{
            entity?: string;
            before?: {
              financialRevision?: string;
              nextDueDate?: string;
              status?: string;
            };
          }>;
        };
      };
    };
    const scheduleRecord = payload.payload?.domainMutation?.records?.find(
      (record) => record.entity === "recurring_payment"
    );
    expect(scheduleRecord?.before).toEqual({
      financialRevision: "0",
      nextDueDate: formatFinancialActionLocalDate(ORIGINAL_DUE_DATE),
      status: "ACTIVE",
    });
  });

  it("restores next due date, status, and revision exactly once after restart", async () => {
    const { account, payment } = await seedScheduleFixture();

    const transaction = await submitGuardedRecurringPayment({
      accountId: account.id,
      amount: 250,
      paymentId: payment.id,
    });

    expect(payment.financialRevision).toBe("1");
    expect(formatFinancialActionLocalDate(payment.nextDueDate)).toBe(
      "2026-08-01"
    );
    const committedDatabase = await openFreshDatabase();
    const committedPayment = await committedDatabase
      .get<RecurringPayment>("recurring_payments")
      .find(payment.id);
    expect(committedPayment.financialRevision).toBe("1");

    await markFinancialActionGroupSyncPending(transaction.id);
    await recordFinancialActionGroupServerOutcome(
      transaction.id,
      "stale",
      staleOutcomeJson(account.id),
      "ACCOUNT_REVISION_STALE"
    );
    expect(payment.financialRevision).toBe("1");
    const beforeReconcileDatabase = await openFreshDatabase();
    const beforeReconcilePayment = await beforeReconcileDatabase
      .get<RecurringPayment>("recurring_payments")
      .find(payment.id);
    expect(beforeReconcilePayment.financialRevision).toBe("1");
    const cachedPayment = await database
      .get<RecurringPayment>("recurring_payments")
      .query(Q.where("id", payment.id))
      .fetch();
    expect(cachedPayment[0]?.financialRevision).toBe("1");
    const first =
      await productionFinancialActionReconciliationService.reconcileRejectedAction(
        transaction.id
      );
    expect(first).toBe("reconciled");

    const freshDatabase = await openFreshDatabase();
    const freshPayment = await freshDatabase
      .get<RecurringPayment>("recurring_payments")
      .find(payment.id);
    expect(formatFinancialActionLocalDate(freshPayment.nextDueDate)).toBe(
      formatFinancialActionLocalDate(ORIGINAL_DUE_DATE)
    );
    expect(freshPayment.status).toBe("ACTIVE");
    expect(freshPayment.financialRevision).toBe("0");

    const freshAccount = await freshDatabase
      .get<Account>("accounts")
      .find(account.id);
    expect(freshAccount.balance).toBe(1000);
    expect(freshAccount.financialRevision).toBe("0");

    const freshTransaction = await freshDatabase
      .get<Transaction>("transactions")
      .find(transaction.id);
    expect(freshTransaction.deleted).toBe(true);

    const second =
      await productionFinancialActionReconciliationService.reconcileRejectedAction(
        transaction.id
      );
    expect(second).toBe("reconciled");
    const settledPayment = await freshDatabase
      .get<RecurringPayment>("recurring_payments")
      .find(payment.id);
    expect(settledPayment.financialRevision).toBe("0");
  });

  it("preserves a newer schedule edit instead of restoring stale Pay Now values", async () => {
    const { account, payment } = await seedScheduleFixture();
    const transaction = await submitGuardedRecurringPayment({
      accountId: account.id,
      amount: 250,
      paymentId: payment.id,
    });
    const newerDueDate = new Date(2026, 8, 15);
    await database.write(async () => {
      await payment.update((record) => {
        record.nextDueDate = newerDueDate;
        record.financialRevision = "2";
      });
    });

    await markFinancialActionGroupSyncPending(transaction.id);
    await recordFinancialActionGroupServerOutcome(
      transaction.id,
      "stale",
      staleOutcomeJson(account.id),
      "ACCOUNT_REVISION_STALE"
    );

    await expect(
      productionFinancialActionReconciliationService.reconcileRejectedAction(
        transaction.id
      )
    ).rejects.toThrow("financial_action_reconciliation_incomplete");

    const freshDatabase = await openFreshDatabase();
    const freshPayment = await freshDatabase
      .get<RecurringPayment>("recurring_payments")
      .find(payment.id);
    expect(formatFinancialActionLocalDate(freshPayment.nextDueDate)).toBe(
      formatFinancialActionLocalDate(newerDueDate)
    );
    expect(freshPayment.financialRevision).toBe("2");
    const freshRoot = await freshDatabase
      .get<FinancialActionGroup>("financial_action_groups")
      .query(Q.where("action_id", transaction.id))
      .fetch();
    expect(freshRoot).toHaveLength(1);
    expect(freshRoot[0]?.state).toBe("rejected_compensating");
  });
});
