/**
 * transaction-service.test.ts — T027
 *
 * Tests all exported functions from transaction-service.ts:
 * - createTransaction
 * - updateTransaction
 * - deleteTransaction
 * - convertTransactionToTransfer
 * - batchDeleteDisplayTransactions
 *
 * Mock Strategy:
 *   The `@monyvi/db` mock is defined entirely inside the jest.mock factory
 *   to avoid Jest hoisting issues. All helpers are exposed as `__`-prefixed
 *   properties and accessed via `jest.requireMock()`.
 */

// ---------------------------------------------------------------------------
// Shared Mock Types
// ---------------------------------------------------------------------------

interface MockModelRecord {
  readonly id: string;
  [key: string]: unknown;
  update: jest.Mock;
  prepareUpdate: jest.Mock;
}

type MockUnsafeQueryRaw = jest.Mock<Promise<unknown[]>, []>;
type MockBatch = jest.Mock<Promise<void>, [readonly MockModelRecord[]]>;

interface MockDbApi {
  readonly __mockDb: {
    write: jest.Mock;
    get: jest.Mock;
    batch: MockBatch;
    adapter: { unsafeQueryRaw: MockUnsafeQueryRaw };
  };
  readonly __model: (
    id: string,
    fields?: Record<string, unknown>
  ) => MockModelRecord;
  readonly __seed: (table: string, model: MockModelRecord) => void;
  readonly __clearStores: () => void;
  readonly __rewireMocks: () => void;
}

// ---------------------------------------------------------------------------
// jest.mock declarations — factory is hoisted, so everything must be inline
// ---------------------------------------------------------------------------

jest.mock("@/services/watermelon-cache-snapshot", () => ({
  captureCachedModelSnapshot: jest.fn((model: Record<string, unknown>) => ({
    model,
    raw: { ...model },
  })),
  restoreCachedModelSnapshot: jest.fn(
    (snapshot: {
      readonly model: Record<string, unknown>;
      readonly raw: Record<string, unknown>;
    }): void => {
      Object.assign(snapshot.model, snapshot.raw);
    }
  ),
}));

jest.mock("@monyvi/db", () => {
  /** Mutable model: .update(builder) mutates fields in place */
  function createModel(
    id: string,
    fields: Record<string, unknown> = {}
  ): MockModelRecord {
    const m: Record<string, unknown> = { id, ...fields };
    m.update = jest.fn((builder: (r: Record<string, unknown>) => void) => {
      builder(m);
      return Promise.resolve(m);
    });
    m.prepareUpdate = jest.fn(
      (builder: (r: Record<string, unknown>) => void) => {
        builder(m);
        return m;
      }
    );
    return m as MockModelRecord;
  }

  const stores: Record<string, Map<string, MockModelRecord>> = {};

  function getStore(t: string): Map<string, MockModelRecord> {
    if (!stores[t]) stores[t] = new Map();
    return stores[t];
  }

  const adapter = {
    unsafeQueryRaw: jest.fn<Promise<unknown[]>, []>(),
  };

  function createCollection(tableName: string): Record<string, jest.Mock> {
    return {
      find: jest.fn((id: string) => {
        const m = getStore(tableName).get(id);
        if (!m)
          return Promise.reject(new Error(`Not found: ${id} in ${tableName}`));
        return Promise.resolve(m);
      }),
      create: jest.fn((builder: (r: Record<string, unknown>) => void) => {
        const m = createModel(`new-${tableName}-${Date.now()}`);
        builder(m);
        getStore(tableName).set(m.id, m);
        return Promise.resolve(m);
      }),
      prepareCreate: jest.fn(
        (builder: (r: Record<string, unknown>) => void) => {
          const m = createModel(`new-${tableName}-${Date.now()}`);
          builder(m);
          getStore(tableName).set(m.id, m);
          return m;
        }
      ),
      query: jest.fn(() => ({
        fetch: jest.fn(() =>
          Promise.resolve(Array.from(getStore(tableName).values()))
        ),
        unsafeFetchRaw: jest.fn(() => adapter.unsafeQueryRaw()),
      })),
    };
  }

  const db = {
    write: jest.fn((cb: () => Promise<unknown>) => cb()),
    get: jest.fn((t: string) => createCollection(t)),
    batch: jest.fn(),
    adapter,
  };

  return {
    database: db,
    Q: {
      where: jest.fn((_f: string, c: unknown) => c),
      oneOf: jest.fn((ids: string[]) => ids),
    },
    __mockDb: db,
    __stores: stores,
    __model: createModel,
    __seed: (table: string, model: MockModelRecord) => {
      getStore(table).set(model.id, model);
    },
    __clearStores: () => {
      for (const key of Object.keys(stores)) stores[key].clear();
    },
    __rewireMocks: () => {
      db.write.mockImplementation((cb: () => Promise<unknown>) => cb());
      db.get.mockImplementation((t: string) => createCollection(t));
      db.batch.mockResolvedValue(undefined);
      db.adapter.unsafeQueryRaw.mockResolvedValue([]);
    },
  };
});

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve("test-user-id")),
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  convertTransactionToTransfer,
  batchDeleteDisplayTransactions,
  BALANCE_REVERSAL_ACCOUNT_NOT_FOUND_ERROR_CODE,
  INVALID_TRANSACTION_AMOUNT_ERROR_CODE,
  TRANSACTION_ACCOUNT_CURRENCY_MISMATCH_ERROR_CODE,
} from "@/services/transaction-service";
import { USER_DATA_ACCESS_ERROR_CODES } from "@/services/user-data-access";
import { MAX_TRANSACTION_AMOUNT } from "@monyvi/logic";

import type { DisplayTransaction } from "@/hooks/useTransactionsGrouping";

// ---------------------------------------------------------------------------
// Grab mock helpers (typed via MockDbApi)
// ---------------------------------------------------------------------------

const {
  __mockDb: mockDb,
  __model: mockModel,
  __seed: mockSeed,
  __clearStores: mockClearStores,
  __rewireMocks: mockRewire,
} = jest.requireMock<MockDbApi>("@monyvi/db");

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function seedAccount(id: string, balance: number): MockModelRecord {
  const acc = mockModel(id, {
    balance,
    currency: "EGP",
    userId: "test-user-id",
  });
  mockSeed("accounts", acc);
  return acc;
}

function seedForeignAccount(id: string, balance: number): MockModelRecord {
  const acc = mockModel(id, { balance, userId: "foreign-user-id" });
  mockSeed("accounts", acc);
  return acc;
}

function seedTx(
  id: string,
  overrides: Record<string, unknown> = {}
): MockModelRecord {
  const defaults: Record<string, unknown> = {
    userId: "test-user-id",
    accountId: "acc-1",
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    categoryId: "cat-1",
    counterparty: undefined,
    note: undefined,
    date: new Date("2026-01-01"),
    source: "MANUAL",
    linkedRecurringId: undefined,
    isDraft: false,
    deleted: false,
  };
  const tx = mockModel(id, { ...defaults, ...overrides });
  mockSeed("transactions", tx);
  return tx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("transaction-service", () => {
  beforeEach(() => {
    mockClearStores();
    mockDb.write.mockClear();
    mockDb.get.mockClear();
    mockDb.batch.mockClear();
    mockDb.adapter.unsafeQueryRaw.mockClear();
    mockRewire();

    const supabaseMock = jest.requireMock<{ getCurrentUserId: jest.Mock }>(
      "@/services/supabase"
    );
    supabaseMock.getCurrentUserId.mockImplementation(() =>
      Promise.resolve("test-user-id")
    );
  });

  // =========================================================================
  // createTransaction
  // =========================================================================
  describe("createTransaction", () => {
    it("should decrease balance for EXPENSE", async () => {
      const acc = seedAccount("acc-1", 1000);
      await createTransaction({
        amount: 200,
        currency: "EGP",
        categoryId: "cat-food",
        accountId: "acc-1",
        type: "EXPENSE",
        source: "MANUAL",
      });
      expect(acc.balance).toBe(800);
    });

    it("should increase balance for INCOME", async () => {
      const acc = seedAccount("acc-1", 1000);
      await createTransaction({
        amount: 500,
        currency: "EGP",
        categoryId: "cat-salary",
        accountId: "acc-1",
        type: "INCOME",
        source: "MANUAL",
      });
      expect(acc.balance).toBe(1500);
    });

    it("commits transaction creation and balance update in one prepared batch", async () => {
      const account = seedAccount("acc-1", 1000);

      const transaction = await createTransaction({
        amount: 200,
        currency: "EGP",
        categoryId: "cat-food",
        accountId: "acc-1",
        type: "EXPENSE",
        source: "MANUAL",
      });

      expect(mockDb.write).toHaveBeenCalledTimes(1);
      expect(account.prepareUpdate).toHaveBeenCalledTimes(1);
      expect(mockDb.batch).toHaveBeenCalledTimes(1);
      expect(mockDb.batch).toHaveBeenCalledWith([transaction, account]);
    });

    it("restores the cached balance after a failed batch before retrying", async () => {
      const account = seedAccount("acc-1", 1000);
      const data = {
        amount: 200,
        currency: "EGP" as const,
        categoryId: "cat-food",
        accountId: "acc-1",
        type: "EXPENSE" as const,
        source: "MANUAL" as const,
      };
      mockDb.batch.mockRejectedValueOnce(new Error("atomic batch failed"));

      await expect(createTransaction(data)).rejects.toThrow(
        "atomic batch failed"
      );
      expect(account.balance).toBe(1000);

      await createTransaction(data);

      expect(account.balance).toBe(800);
    });

    it("treats a rejected notification as committed when the transaction persisted", async () => {
      const account = seedAccount("acc-1", 1000);
      const notificationError = new Error("observer failed after commit");
      mockDb.batch.mockRejectedValueOnce(notificationError);
      mockDb.adapter.unsafeQueryRaw.mockResolvedValueOnce([{}]);

      await expect(
        createTransaction({
          amount: 200,
          currency: "EGP",
          categoryId: "cat-food",
          accountId: "acc-1",
          type: "EXPENSE",
          source: "MANUAL",
        })
      ).resolves.toBeDefined();

      expect(account.balance).toBe(800);
      expect(mockDb.adapter.unsafeQueryRaw).toHaveBeenCalledTimes(1);
    });

    it("blocks a retry until an indeterminate rollback can be verified", async () => {
      const account = seedAccount("acc-1", 1000);
      const data = {
        amount: 200,
        currency: "EGP" as const,
        categoryId: "cat-food",
        accountId: "acc-1",
        type: "EXPENSE" as const,
        source: "MANUAL" as const,
      };
      mockDb.batch.mockRejectedValueOnce(new Error("atomic batch failed"));
      mockDb.adapter.unsafeQueryRaw
        .mockRejectedValueOnce(new Error("verification unavailable"))
        .mockRejectedValueOnce(new Error("verification still unavailable"))
        .mockResolvedValueOnce([]);

      await expect(createTransaction(data)).rejects.toThrow(
        "atomic batch failed"
      );
      expect(account.balance).toBe(800);

      await expect(createTransaction(data)).rejects.toThrow(
        "TRANSACTION_COMMIT_STATE_UNAVAILABLE"
      );
      expect(account.balance).toBe(800);
      expect(mockDb.batch).toHaveBeenCalledTimes(1);

      await expect(createTransaction(data)).resolves.toBeDefined();
      expect(account.balance).toBe(800);
      expect(account.prepareUpdate).toHaveBeenCalledTimes(2);
      expect(mockDb.batch).toHaveBeenCalledTimes(2);
    });

    it("returns the original transaction when a later verification confirms the commit", async () => {
      const account = seedAccount("acc-1", 1000);
      const data = {
        amount: 200,
        currency: "EGP" as const,
        categoryId: "cat-food",
        accountId: "acc-1",
        type: "EXPENSE" as const,
        source: "MANUAL" as const,
      };
      mockDb.batch.mockRejectedValueOnce(
        new Error("observer failed after adapter commit")
      );
      mockDb.adapter.unsafeQueryRaw
        .mockRejectedValueOnce(new Error("verification unavailable"))
        .mockResolvedValueOnce([{}]);

      await expect(createTransaction(data)).rejects.toThrow(
        "observer failed after adapter commit"
      );
      const originalTransaction = mockDb.batch.mock.calls[0]?.[0]?.[0];

      await expect(createTransaction(data)).resolves.toBe(originalTransaction);
      expect(account.balance).toBe(800);
      expect(account.prepareUpdate).toHaveBeenCalledTimes(1);
      expect(mockDb.batch).toHaveBeenCalledTimes(1);
    });

    it("rejects a transaction whose currency differs from the selected account", async () => {
      const account = seedAccount("acc-1", 1000);

      await expect(
        createTransaction({
          amount: 200,
          currency: "USD",
          categoryId: "cat-food",
          accountId: "acc-1",
          type: "EXPENSE",
          source: "MANUAL",
        })
      ).rejects.toThrow(TRANSACTION_ACCOUNT_CURRENCY_MISMATCH_ERROR_CODE);

      expect(account.balance).toBe(1000);
      expect(mockDb.batch).not.toHaveBeenCalled();
    });

    it("should reject negative input without mutating the account", async () => {
      const acc = seedAccount("acc-1", 1000);
      await expect(
        createTransaction({
          amount: -300,
          currency: "EGP",
          categoryId: "cat-1",
          accountId: "acc-1",
          type: "EXPENSE",
          source: "MANUAL",
        })
      ).rejects.toThrow(INVALID_TRANSACTION_AMOUNT_ERROR_CODE);
      expect(acc.balance).toBe(1000);
    });

    it("should reject non-finite input without mutating the account", async () => {
      const acc = seedAccount("acc-1", 1000);
      await expect(
        createTransaction({
          amount: Number.POSITIVE_INFINITY,
          currency: "EGP",
          categoryId: "cat-1",
          accountId: "acc-1",
          type: "EXPENSE",
          source: "MANUAL",
        })
      ).rejects.toThrow(INVALID_TRANSACTION_AMOUNT_ERROR_CODE);
      expect(acc.balance).toBe(1000);
    });

    it("should reject zero input without mutating the account", async () => {
      const acc = seedAccount("acc-1", 1000);
      await expect(
        createTransaction({
          amount: 0,
          currency: "EGP",
          categoryId: "cat-1",
          accountId: "acc-1",
          type: "EXPENSE",
          source: "MANUAL",
        })
      ).rejects.toThrow(INVALID_TRANSACTION_AMOUNT_ERROR_CODE);
      expect(acc.balance).toBe(1000);
    });

    it("should reject over-limit input without mutating the account", async () => {
      const acc = seedAccount("acc-1", 1000);
      await expect(
        createTransaction({
          amount: MAX_TRANSACTION_AMOUNT + 1,
          currency: "EGP",
          categoryId: "cat-1",
          accountId: "acc-1",
          type: "EXPENSE",
          source: "MANUAL",
        })
      ).rejects.toThrow(INVALID_TRANSACTION_AMOUNT_ERROR_CODE);
      expect(acc.balance).toBe(1000);
    });

    it("should persist the SMS fingerprint for SMS transactions", async () => {
      seedAccount("acc-1", 1000);
      const result = await createTransaction({
        amount: 125,
        currency: "EGP",
        categoryId: "cat-1",
        accountId: "acc-1",
        type: "EXPENSE",
        source: "SMS",
        smsFingerprint: "sms-hash-1",
      });

      expect(result.smsFingerprint).toBe("sms-hash-1");
    });

    it("does not create an SMS transaction after the authenticated user changes", async () => {
      const supabaseMock = jest.requireMock<{ getCurrentUserId: jest.Mock }>(
        "@/services/supabase"
      );
      supabaseMock.getCurrentUserId
        .mockResolvedValueOnce("test-user-id")
        .mockResolvedValueOnce("next-user-id");
      const account = seedAccount("acc-1", 1000);

      await expect(
        createTransaction(
          {
            amount: 125,
            currency: "EGP",
            categoryId: "cat-1",
            accountId: "acc-1",
            type: "EXPENSE",
            source: "SMS",
            smsFingerprint: "sms-hash-1",
          },
          "test-user-id"
        )
      ).rejects.toThrow("AUTH_SCOPE_CHANGED");

      expect(account.balance).toBe(1000);
    });

    it("should throw when user is not authenticated", async () => {
      const supabaseMock = jest.requireMock<{ getCurrentUserId: jest.Mock }>(
        "@/services/supabase"
      );
      supabaseMock.getCurrentUserId.mockResolvedValueOnce(null);
      seedAccount("acc-1", 1000);
      await expect(
        createTransaction({
          amount: 100,
          currency: "EGP",
          categoryId: "cat-1",
          accountId: "acc-1",
          type: "EXPENSE",
          source: "MANUAL",
        })
      ).rejects.toThrow(USER_DATA_ACCESS_ERROR_CODES.USER_REQUIRED);
    });

    it("rejects a foreign account without mutating its balance", async () => {
      const foreignAccount = seedForeignAccount("acc-foreign", 1000);

      await expect(
        createTransaction({
          amount: 100,
          currency: "EGP",
          categoryId: "cat-1",
          accountId: "acc-foreign",
          type: "EXPENSE",
          source: "MANUAL",
        })
      ).rejects.toThrow(USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED);

      expect(foreignAccount.balance).toBe(1000);
    });

    it("rejects a deleted account without preparing or committing", async () => {
      const deletedAccount = mockModel("acc-deleted", {
        balance: 1000,
        userId: "test-user-id",
        deleted: true,
      });
      mockSeed("accounts", deletedAccount);

      await expect(
        createTransaction({
          amount: 100,
          currency: "EGP",
          categoryId: "cat-1",
          accountId: "acc-deleted",
          type: "EXPENSE",
          source: "MANUAL",
        })
      ).rejects.toThrow("TRANSACTION_ACCOUNT_UNAVAILABLE");

      expect(deletedAccount.prepareUpdate).not.toHaveBeenCalled();
      expect(mockDb.batch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateTransaction
  // =========================================================================
  describe("updateTransaction", () => {
    it("should adjust balance when amount changes (EXPENSE)", async () => {
      const acc = seedAccount("acc-1", 900);
      seedTx("tx-1", { accountId: "acc-1", amount: 100, type: "EXPENSE" });
      await updateTransaction("tx-1", { amount: 300 });
      expect(acc.balance).toBe(700);
    });

    it("should adjust balance when amount changes (INCOME)", async () => {
      const acc = seedAccount("acc-1", 1100);
      seedTx("tx-1", { accountId: "acc-1", amount: 100, type: "INCOME" });
      await updateTransaction("tx-1", { amount: 500 });
      expect(acc.balance).toBe(1500);
    });

    it("should handle EXPENSE → INCOME type change", async () => {
      const acc = seedAccount("acc-1", 800);
      seedTx("tx-1", { accountId: "acc-1", amount: 200, type: "EXPENSE" });
      await updateTransaction("tx-1", { type: "INCOME" });
      expect(acc.balance).toBe(1200);
    });

    it("should handle INCOME → EXPENSE type change", async () => {
      const acc = seedAccount("acc-1", 1200);
      seedTx("tx-1", { accountId: "acc-1", amount: 200, type: "INCOME" });
      await updateTransaction("tx-1", { type: "EXPENSE" });
      expect(acc.balance).toBe(800);
    });

    it("rejects invalid amount updates without mutating the transaction or account", async () => {
      const acc = seedAccount("acc-1", 900);
      const tx = seedTx("tx-1", {
        accountId: "acc-1",
        amount: 100,
        type: "EXPENSE",
      });

      for (const amount of [Number.NaN, -1, 0, MAX_TRANSACTION_AMOUNT + 1]) {
        await expect(updateTransaction("tx-1", { amount })).rejects.toThrow(
          INVALID_TRANSACTION_AMOUNT_ERROR_CODE
        );

        expect(acc.balance).toBe(900);
        expect(tx.amount).toBe(100);
      }
    });

    it("should handle account swap (revert old, apply new)", async () => {
      const oldAcc = seedAccount("acc-1", 850);
      const newAcc = seedAccount("acc-2", 2000);
      seedTx("tx-1", { accountId: "acc-1", amount: 150, type: "EXPENSE" });
      await updateTransaction("tx-1", { accountId: "acc-2" });
      expect(oldAcc.balance).toBe(1000);
      expect(newAcc.balance).toBe(1850);
    });

    it("should update non-financial fields", async () => {
      seedAccount("acc-1", 1000);
      const tx = seedTx("tx-1", {
        accountId: "acc-1",
        amount: 100,
        type: "EXPENSE",
      });
      const d = new Date("2026-06-15");
      await updateTransaction("tx-1", {
        categoryId: "cat-new",
        note: "n",
        date: d,
        counterparty: "X",
      });
      expect(tx.categoryId).toBe("cat-new");
      expect(tx.note).toBe("n");
      expect(tx.date).toEqual(d);
      expect(tx.counterparty).toBe("X");
    });

    it("should skip balance adjustment for non-financial-only updates", async () => {
      const acc = seedAccount("acc-1", 900);
      seedTx("tx-1", { accountId: "acc-1", amount: 100, type: "EXPENSE" });
      await updateTransaction("tx-1", { note: "just a note" });
      expect(acc.balance).toBe(900);
    });

    it("rejects a foreign transaction without mutating the owned account", async () => {
      const acc = seedAccount("acc-1", 900);
      const tx = seedTx("tx-1", {
        accountId: "acc-1",
        amount: 100,
        type: "EXPENSE",
        userId: "foreign-user-id",
      });

      await expect(updateTransaction("tx-1", { amount: 300 })).rejects.toThrow(
        USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED
      );

      expect(acc.balance).toBe(900);
      expect(tx.amount).toBe(100);
    });
  });

  // =========================================================================
  // deleteTransaction
  // =========================================================================
  describe("deleteTransaction", () => {
    it("should revert EXPENSE balance and soft-delete", async () => {
      const acc = seedAccount("acc-1", 900);
      const tx = seedTx("tx-1", {
        accountId: "acc-1",
        amount: 100,
        type: "EXPENSE",
      });
      await deleteTransaction("tx-1");
      expect(acc.balance).toBe(1000);
      expect(tx.deleted).toBe(true);
    });

    it("should revert INCOME balance and soft-delete", async () => {
      const acc = seedAccount("acc-1", 1100);
      const tx = seedTx("tx-1", {
        accountId: "acc-1",
        amount: 100,
        type: "INCOME",
      });
      await deleteTransaction("tx-1");
      expect(acc.balance).toBe(1000);
      expect(tx.deleted).toBe(true);
    });

    it("rejects a foreign transaction delete without mutating balances", async () => {
      const acc = seedAccount("acc-1", 900);
      const tx = seedTx("tx-1", {
        accountId: "acc-1",
        amount: 100,
        type: "EXPENSE",
        userId: "foreign-user-id",
      });

      await expect(deleteTransaction("tx-1")).rejects.toThrow(
        USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED
      );

      expect(acc.balance).toBe(900);
      expect(tx.deleted).toBe(false);
    });
  });

  // =========================================================================
  // convertTransactionToTransfer
  // =========================================================================
  describe("convertTransactionToTransfer", () => {
    it("should soft-delete tx, create transfer, and adjust both accounts", async () => {
      const from = seedAccount("acc-from", 800);
      const to = seedAccount("acc-to", 500);
      const tx = seedTx("tx-1", {
        accountId: "acc-from",
        amount: 200,
        type: "EXPENSE",
        currency: "EGP",
        date: new Date("2026-03-01"),
        note: "lunch",
      });
      await convertTransactionToTransfer({
        transactionId: "tx-1",
        toAccountId: "acc-to",
        notes: "xfer",
      });
      expect(tx.deleted).toBe(true);
      expect(from.balance).toBe(800);
      expect(to.balance).toBe(700);
    });

    it("should throw when user is not authenticated", async () => {
      const supabaseMock = jest.requireMock<{ getCurrentUserId: jest.Mock }>(
        "@/services/supabase"
      );
      supabaseMock.getCurrentUserId.mockResolvedValueOnce(null);
      seedAccount("acc-from", 1000);
      seedTx("tx-1", { accountId: "acc-from" });
      await expect(
        convertTransactionToTransfer({
          transactionId: "tx-1",
          toAccountId: "acc-to",
        })
      ).rejects.toThrow(USER_DATA_ACCESS_ERROR_CODES.USER_REQUIRED);
    });

    it("rejects a foreign-owned transaction without mutating balances", async () => {
      const from = seedAccount("acc-from", 800);
      const to = seedAccount("acc-to", 500);
      const tx = seedTx("tx-1", {
        accountId: "acc-from",
        amount: 200,
        type: "EXPENSE",
        userId: "foreign-user-id",
      });

      await expect(
        convertTransactionToTransfer({
          transactionId: "tx-1",
          toAccountId: "acc-to",
        })
      ).rejects.toThrow(USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED);

      expect(tx.deleted).toBe(false);
      expect(from.balance).toBe(800);
      expect(to.balance).toBe(500);
    });
  });

  // =========================================================================
  // batchDeleteDisplayTransactions
  // =========================================================================
  describe("batchDeleteDisplayTransactions", () => {
    function asDisplayItem(record: MockModelRecord): MockModelRecord {
      return mockModel(`${record.id}-display`, {
        ...record,
        record,
      });
    }

    function asStaleDisplayItem(
      record: MockModelRecord,
      staleFields: Record<string, unknown>
    ): MockModelRecord {
      return mockModel(`${record.id}-display`, {
        ...record,
        ...staleFields,
        record,
      });
    }

    it("should do nothing for empty array", async () => {
      await batchDeleteDisplayTransactions([]);
      expect(mockDb.write).not.toHaveBeenCalled();
    });

    it("should batch-delete transactions", async () => {
      seedAccount("acc-1", 800);
      const i1 = mockModel("tx-1", {
        _type: "transaction",
        userId: "test-user-id",
        accountId: "acc-1",
        amount: 100,
        isExpense: true,
        isIncome: false,
        deleted: false,
      });
      const i2 = mockModel("tx-2", {
        _type: "transaction",
        userId: "test-user-id",
        accountId: "acc-1",
        amount: 200,
        isExpense: true,
        isIncome: false,
        deleted: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- MockModelRecord cannot satisfy WatermelonDB Model base class
      await batchDeleteDisplayTransactions([
        asDisplayItem(i1),
        asDisplayItem(i2),
      ] as unknown as readonly DisplayTransaction[]);
      expect(i1.deleted).toBe(true);
      expect(i2.deleted).toBe(true);
      expect(mockDb.batch).toHaveBeenCalledTimes(1);
    });

    it("should handle mixed transactions and transfers", async () => {
      seedAccount("acc-1", 900);
      seedAccount("acc-2", 500);
      const txI = mockModel("tx-1", {
        _type: "transaction",
        userId: "test-user-id",
        accountId: "acc-1",
        amount: 100,
        isExpense: true,
        isIncome: false,
        deleted: false,
      });
      const tfI = mockModel("tf-1", {
        _type: "transfer",
        userId: "test-user-id",
        fromAccountId: "acc-1",
        toAccountId: "acc-2",
        amount: 200,
        convertedAmount: undefined,
        deleted: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- MockModelRecord cannot satisfy WatermelonDB Model base class
      await batchDeleteDisplayTransactions([
        asDisplayItem(txI),
        asDisplayItem(tfI),
      ] as unknown as readonly DisplayTransaction[]);
      expect(txI.deleted).toBe(true);
      expect(tfI.deleted).toBe(true);
      expect(mockDb.batch).toHaveBeenCalledTimes(1);
    });

    it("uses the live transaction record for balance reversal and deletion", async () => {
      const staleAccount = seedAccount("acc-stale", 500);
      const liveAccount = seedAccount("acc-live", 700);
      const liveRecord = mockModel("tx-1", {
        _type: "transaction",
        userId: "test-user-id",
        accountId: "acc-live",
        amount: 300,
        isExpense: true,
        isIncome: false,
        deleted: false,
      });
      const staleDisplayItem = asStaleDisplayItem(liveRecord, {
        accountId: "acc-stale",
        amount: 50,
      });

      await batchDeleteDisplayTransactions([
        staleDisplayItem,
      ] as unknown as readonly DisplayTransaction[]);

      expect(liveRecord.deleted).toBe(true);
      expect(liveAccount.balance).toBe(1000);
      expect(staleAccount.balance).toBe(500);
    });

    it("uses the live transfer record for balance reversal and deletion", async () => {
      const staleFrom = seedAccount("acc-stale-from", 500);
      const staleTo = seedAccount("acc-stale-to", 500);
      const liveFrom = seedAccount("acc-live-from", 600);
      const liveTo = seedAccount("acc-live-to", 900);
      const liveRecord = mockModel("tf-1", {
        _type: "transfer",
        userId: "test-user-id",
        fromAccountId: "acc-live-from",
        toAccountId: "acc-live-to",
        amount: 200,
        convertedAmount: 250,
        deleted: false,
      });
      const staleDisplayItem = asStaleDisplayItem(liveRecord, {
        fromAccountId: "acc-stale-from",
        toAccountId: "acc-stale-to",
        amount: 25,
        convertedAmount: 30,
      });

      await batchDeleteDisplayTransactions([
        staleDisplayItem,
      ] as unknown as readonly DisplayTransaction[]);

      expect(liveRecord.deleted).toBe(true);
      expect(liveFrom.balance).toBe(800);
      expect(liveTo.balance).toBe(650);
      expect(staleFrom.balance).toBe(500);
      expect(staleTo.balance).toBe(500);
    });

    it("should not delete a transfer when a balance reversal account is missing", async () => {
      seedAccount("acc-1", 900);
      const tfI = mockModel("tf-1", {
        _type: "transfer",
        userId: "test-user-id",
        fromAccountId: "acc-1",
        toAccountId: "acc-missing",
        amount: 200,
        convertedAmount: undefined,
        deleted: false,
      });

      await expect(
        batchDeleteDisplayTransactions([
          asDisplayItem(tfI),
        ] as unknown as readonly DisplayTransaction[])
      ).rejects.toThrow(BALANCE_REVERSAL_ACCOUNT_NOT_FOUND_ERROR_CODE);

      expect(tfI.deleted).toBe(false);
      expect(mockDb.batch).not.toHaveBeenCalled();
    });

    it("rejects foreign-owned display items before deleting anything", async () => {
      seedAccount("acc-1", 900);
      const foreignItem = mockModel("tx-foreign", {
        _type: "transaction",
        userId: "foreign-user-id",
        accountId: "acc-1",
        amount: 100,
        isExpense: true,
        isIncome: false,
        deleted: false,
      });

      await expect(
        batchDeleteDisplayTransactions([
          asDisplayItem(foreignItem),
        ] as unknown as readonly DisplayTransaction[])
      ).rejects.toThrow(USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED);

      expect(foreignItem.deleted).toBe(false);
      expect(mockDb.batch).not.toHaveBeenCalled();
    });

    it("rejects a foreign-owned backing record before deleting anything", async () => {
      seedAccount("acc-1", 900);
      const foreignRecord = mockModel("tx-foreign", {
        _type: "transaction",
        userId: "foreign-user-id",
        accountId: "acc-1",
        amount: 100,
        isExpense: true,
        isIncome: false,
        deleted: false,
      });
      const ownedDisplayItem = asStaleDisplayItem(foreignRecord, {
        userId: "test-user-id",
      });

      await expect(
        batchDeleteDisplayTransactions([
          ownedDisplayItem,
        ] as unknown as readonly DisplayTransaction[])
      ).rejects.toThrow(USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED);

      expect(foreignRecord.deleted).toBe(false);
      expect(mockDb.batch).not.toHaveBeenCalled();
    });
  });
});
