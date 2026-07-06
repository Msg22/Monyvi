/**
 * transfer-service.test.ts — T028
 *
 * Tests all exported functions from transfer-service.ts:
 * - createTransfer
 * - updateTransfer
 * - deleteTransfer
 * - convertTransferToTransaction
 *
 * Uses inline-mock factory pattern (mock infra defined inside jest.mock
 * factory to avoid hoisting issues).
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

interface MockDbApi {
  readonly __mockDb: {
    write: jest.Mock;
    get: jest.Mock;
    batch: jest.Mock;
  };
  readonly __model: (
    id: string,
    fields?: Record<string, unknown>
  ) => MockModelRecord;
  readonly __seed: (table: string, model: MockModelRecord) => void;
  readonly __clearStores: () => void;
  readonly __rewire: () => void;
}

// ---------------------------------------------------------------------------
// jest.mock (hoisted — everything inside the factory)
// ---------------------------------------------------------------------------

jest.mock("@monyvi/db", () => {
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
      query: jest.fn(() => ({
        fetch: jest.fn(() =>
          Promise.resolve(Array.from(getStore(tableName).values()))
        ),
      })),
    };
  }

  const db = {
    write: jest.fn((cb: () => Promise<unknown>) => cb()),
    get: jest.fn((t: string) => createCollection(t)),
    batch: jest.fn(),
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
    __rewire: () => {
      db.write.mockImplementation((cb: () => Promise<unknown>) => cb());
      db.get.mockImplementation((t: string) => createCollection(t));
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
  createTransfer,
  updateTransfer,
  deleteTransfer,
  convertTransferToTransaction,
  INVALID_TRANSFER_AMOUNT_ERROR_CODE,
} from "@/services/transfer-service";
import { USER_DATA_ACCESS_ERROR_CODES } from "@/services/user-data-access";

// ---------------------------------------------------------------------------
// Grab mock helpers (typed via MockDbApi interface)
// ---------------------------------------------------------------------------

const {
  __mockDb: mockDb,
  __model: mockModel,
  __seed: mockSeed,
  __clearStores: mockClearStores,
  __rewire: mockRewire,
} = jest.requireMock<MockDbApi>("@monyvi/db");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedAccount(id: string, balance: number): MockModelRecord {
  const acc = mockModel(id, { balance, userId: "test-user-id" });
  mockSeed("accounts", acc);
  return acc;
}

function seedForeignAccount(id: string, balance: number): MockModelRecord {
  const acc = mockModel(id, { balance, userId: "foreign-user-id" });
  mockSeed("accounts", acc);
  return acc;
}

function seedTransfer(
  id: string,
  overrides: Record<string, unknown> = {}
): MockModelRecord {
  const defaults: Record<string, unknown> = {
    userId: "test-user-id",
    fromAccountId: "acc-from",
    toAccountId: "acc-to",
    amount: 100,
    currency: "EGP",
    convertedAmount: undefined,
    exchangeRate: undefined,
    date: new Date("2026-01-01"),
    notes: undefined,
    deleted: false,
  };
  const tf = mockModel(id, { ...defaults, ...overrides });
  mockSeed("transfers", tf);
  return tf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("transfer-service", () => {
  beforeEach(() => {
    mockClearStores();
    mockDb.write.mockClear();
    mockDb.get.mockClear();
    mockDb.batch.mockClear();
    mockRewire();

    const supabaseMock = jest.requireMock<{ getCurrentUserId: jest.Mock }>(
      "@/services/supabase"
    );
    supabaseMock.getCurrentUserId.mockImplementation(() =>
      Promise.resolve("test-user-id")
    );
  });

  // =========================================================================
  // createTransfer
  // =========================================================================
  describe("createTransfer", () => {
    it("should debit from-account and credit to-account", async () => {
      const from = seedAccount("acc-from", 1000);
      const to = seedAccount("acc-to", 500);

      await createTransfer({
        amount: 200,
        currency: "EGP",
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
      });

      expect(from.balance).toBe(800);
      expect(to.balance).toBe(700);
    });

    it("should use convertedAmount for to-account in multi-currency transfer", async () => {
      const from = seedAccount("acc-from", 1000);
      const to = seedAccount("acc-to", 100);

      await createTransfer({
        amount: 200,
        convertedAmount: 4,
        currency: "EGP",
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        exchangeRate: 50,
      });

      expect(from.balance).toBe(800);
      expect(to.balance).toBe(104);
    });

    it("should store absolute amount for negative input", async () => {
      const from = seedAccount("acc-from", 1000);
      const to = seedAccount("acc-to", 500);

      await createTransfer({
        amount: -300,
        currency: "EGP",
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
      });

      // Math.abs(-300) = 300 → from 1000 - 300 = 700
      expect(from.balance).toBe(700);
      expect(to.balance).toBe(800);
    });

    it("rejects amounts over the transaction cap without mutating balances", async () => {
      const from = seedAccount("acc-from", 1000);
      const to = seedAccount("acc-to", 500);

      await expect(
        createTransfer({
          amount: 1_000_000_001,
          currency: "EGP",
          fromAccountId: "acc-from",
          toAccountId: "acc-to",
        })
      ).rejects.toThrow(INVALID_TRANSFER_AMOUNT_ERROR_CODE);

      expect(from.balance).toBe(1000);
      expect(to.balance).toBe(500);
    });

    it("rejects converted amounts over the transaction cap without mutating balances", async () => {
      const from = seedAccount("acc-from", 1000);
      const to = seedAccount("acc-to", 500);

      await expect(
        createTransfer({
          amount: 100,
          convertedAmount: 1_000_000_001,
          currency: "EGP",
          fromAccountId: "acc-from",
          toAccountId: "acc-to",
        })
      ).rejects.toThrow(INVALID_TRANSFER_AMOUNT_ERROR_CODE);

      expect(from.balance).toBe(1000);
      expect(to.balance).toBe(500);
    });

    it("should throw when user is not authenticated", async () => {
      const supabaseMock = jest.requireMock<{ getCurrentUserId: jest.Mock }>(
        "@/services/supabase"
      );
      supabaseMock.getCurrentUserId.mockResolvedValueOnce(null);
      seedAccount("acc-from", 1000);
      seedAccount("acc-to", 500);

      await expect(
        createTransfer({
          amount: 100,
          currency: "EGP",
          fromAccountId: "acc-from",
          toAccountId: "acc-to",
        })
      ).rejects.toThrow(USER_DATA_ACCESS_ERROR_CODES.USER_REQUIRED);
    });

    it("should wrap everything in a single database.write", async () => {
      seedAccount("acc-from", 1000);
      seedAccount("acc-to", 500);

      await createTransfer({
        amount: 100,
        currency: "EGP",
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
      });

      expect(mockDb.write).toHaveBeenCalledTimes(1);
    });

    it("rejects a foreign account without mutating balances", async () => {
      const foreignFrom = seedForeignAccount("acc-foreign", 1000);
      const to = seedAccount("acc-to", 500);

      await expect(
        createTransfer({
          amount: 100,
          currency: "EGP",
          fromAccountId: "acc-foreign",
          toAccountId: "acc-to",
        })
      ).rejects.toThrow(USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED);

      expect(foreignFrom.balance).toBe(1000);
      expect(to.balance).toBe(500);
    });

    it("rejects a foreign to-account without mutating balances", async () => {
      const from = seedAccount("acc-from", 1000);
      const foreignTo = seedForeignAccount("acc-foreign-to", 500);

      await expect(
        createTransfer({
          amount: 100,
          currency: "EGP",
          fromAccountId: "acc-from",
          toAccountId: "acc-foreign-to",
        })
      ).rejects.toThrow(USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED);

      expect(from.balance).toBe(1000);
      expect(foreignTo.balance).toBe(500);
    });
  });

  // =========================================================================
  // updateTransfer
  // =========================================================================
  describe("updateTransfer", () => {
    it("should adjust balances when amount changes", async () => {
      const from = seedAccount("acc-from", 900);
      const to = seedAccount("acc-to", 600);
      seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 100,
      });

      await updateTransfer("tf-1", { amount: 300 });

      // Revert: from +100=1000, to -100=500
      // Apply:  from -300=700,  to +300=800
      expect(from.balance).toBe(700);
      expect(to.balance).toBe(800);
    });

    it("should handle from-account swap", async () => {
      const oldFrom = seedAccount("acc-from", 900);
      const to = seedAccount("acc-to", 600);
      const newFrom = seedAccount("acc-new", 2000);
      seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 100,
      });

      await updateTransfer("tf-1", { fromAccountId: "acc-new" });

      expect(oldFrom.balance).toBe(1000);
      expect(newFrom.balance).toBe(1900);
      expect(to.balance).toBe(600);
    });

    it("should handle to-account swap", async () => {
      const from = seedAccount("acc-from", 900);
      const oldTo = seedAccount("acc-to", 600);
      const newTo = seedAccount("acc-new-to", 300);
      seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 100,
      });

      await updateTransfer("tf-1", { toAccountId: "acc-new-to" });

      expect(from.balance).toBe(900);
      expect(oldTo.balance).toBe(500);
      expect(newTo.balance).toBe(400);
    });

    it("should update non-financial fields only without balance change", async () => {
      const from = seedAccount("acc-from", 900);
      const to = seedAccount("acc-to", 600);
      const tf = seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 100,
      });

      await updateTransfer("tf-1", { notes: "updated notes" });

      expect(from.balance).toBe(900);
      expect(to.balance).toBe(600);
      expect(tf.notes).toBe("updated notes");
    });

    it("should handle multi-currency update with convertedAmount", async () => {
      const from = seedAccount("acc-from", 900);
      const to = seedAccount("acc-to", 502);
      seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 100,
        convertedAmount: 2,
      });

      await updateTransfer("tf-1", { amount: 200, convertedAmount: 4 });

      // Revert: from +100=1000, to -2=500
      // Apply:  from -200=800,  to +4=504
      expect(from.balance).toBe(800);
      expect(to.balance).toBe(504);
    });

    it("rejects amount updates over the transaction cap without mutating balances", async () => {
      const from = seedAccount("acc-from", 900);
      const to = seedAccount("acc-to", 600);
      const transfer = seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 100,
      });

      await expect(
        updateTransfer("tf-1", { amount: 1_000_000_001 })
      ).rejects.toThrow(INVALID_TRANSFER_AMOUNT_ERROR_CODE);

      expect(from.balance).toBe(900);
      expect(to.balance).toBe(600);
      expect(transfer.amount).toBe(100);
    });

    it("rejects a foreign transfer without mutating balances", async () => {
      const from = seedAccount("acc-from", 900);
      const to = seedAccount("acc-to", 600);
      const transfer = seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 100,
        userId: "foreign-user-id",
      });

      await expect(updateTransfer("tf-1", { amount: 300 })).rejects.toThrow(
        USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED
      );

      expect(from.balance).toBe(900);
      expect(to.balance).toBe(600);
      expect(transfer.amount).toBe(100);
    });
  });

  // =========================================================================
  // deleteTransfer
  // =========================================================================
  describe("deleteTransfer", () => {
    it("should revert both account balances and soft-delete", async () => {
      const from = seedAccount("acc-from", 900);
      const to = seedAccount("acc-to", 600);
      const tf = seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 100,
      });

      await deleteTransfer("tf-1");

      expect(from.balance).toBe(1000);
      expect(to.balance).toBe(500);
      expect(tf.deleted).toBe(true);
    });

    it("should use convertedAmount for to-account reversion in multi-currency", async () => {
      const from = seedAccount("acc-from", 900);
      const to = seedAccount("acc-to", 502);
      const tf = seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 100,
        convertedAmount: 2,
      });

      await deleteTransfer("tf-1");

      expect(from.balance).toBe(1000);
      expect(to.balance).toBe(500);
      expect(tf.deleted).toBe(true);
    });

    it("rejects a foreign transfer delete without mutating balances", async () => {
      const from = seedAccount("acc-from", 900);
      const to = seedAccount("acc-to", 600);
      const transfer = seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 100,
        userId: "foreign-user-id",
      });

      await expect(deleteTransfer("tf-1")).rejects.toThrow(
        USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED
      );

      expect(from.balance).toBe(900);
      expect(to.balance).toBe(600);
      expect(transfer.deleted).toBe(false);
    });
  });

  // =========================================================================
  // convertTransferToTransaction
  // =========================================================================
  describe("convertTransferToTransaction", () => {
    it("should soft-delete transfer, revert balances, create tx, and apply EXPENSE", async () => {
      const from = seedAccount("acc-from", 800);
      const to = seedAccount("acc-to", 700);
      const tf = seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 200,
        currency: "EGP",
        date: new Date("2026-04-01"),
        notes: "original",
      });

      await convertTransferToTransaction({
        transferId: "tf-1",
        accountId: "acc-from",
        type: "EXPENSE",
        categoryId: "cat-food",
      });

      expect(tf.deleted).toBe(true);
      // Revert: from 800+200=1000, to 700-200=500
      // EXPENSE on acc-from: 1000-200=800
      expect(from.balance).toBe(800);
      expect(to.balance).toBe(500);
    });

    it("should apply INCOME balance effect on target account", async () => {
      const from = seedAccount("acc-from", 800);
      const to = seedAccount("acc-to", 700);
      seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 200,
      });

      await convertTransferToTransaction({
        transferId: "tf-1",
        accountId: "acc-to",
        type: "INCOME",
        categoryId: "cat-salary",
      });

      // Revert: from +200=1000, to -200=500
      // INCOME on acc-to: 500+200=700
      expect(from.balance).toBe(1000);
      expect(to.balance).toBe(700);
    });

    it("should throw when user is not authenticated", async () => {
      const supabaseMock = jest.requireMock<{ getCurrentUserId: jest.Mock }>(
        "@/services/supabase"
      );
      supabaseMock.getCurrentUserId.mockResolvedValueOnce(null);
      seedAccount("acc-from", 1000);
      seedTransfer("tf-1", { fromAccountId: "acc-from" });

      await expect(
        convertTransferToTransaction({
          transferId: "tf-1",
          accountId: "acc-from",
          type: "EXPENSE",
          categoryId: "cat-1",
        })
      ).rejects.toThrow(USER_DATA_ACCESS_ERROR_CODES.USER_REQUIRED);
    });

    it("rejects a foreign-owned transfer without mutating balances", async () => {
      const from = seedAccount("acc-from", 800);
      const to = seedAccount("acc-to", 700);
      const transfer = seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 200,
        userId: "foreign-user-id",
      });

      await expect(
        convertTransferToTransaction({
          transferId: "tf-1",
          accountId: "acc-from",
          type: "EXPENSE",
          categoryId: "cat-1",
        })
      ).rejects.toThrow(USER_DATA_ACCESS_ERROR_CODES.OWNERSHIP_FAILED);

      expect(from.balance).toBe(800);
      expect(to.balance).toBe(700);
      expect(transfer.deleted).toBe(false);
    });

    it("should wrap everything in a single atomic write", async () => {
      seedAccount("acc-from", 800);
      seedAccount("acc-to", 700);
      seedTransfer("tf-1", {
        fromAccountId: "acc-from",
        toAccountId: "acc-to",
        amount: 200,
      });

      await convertTransferToTransaction({
        transferId: "tf-1",
        accountId: "acc-from",
        type: "EXPENSE",
        categoryId: "cat-1",
      });

      expect(mockDb.write).toHaveBeenCalledTimes(1);
    });
  });
});
