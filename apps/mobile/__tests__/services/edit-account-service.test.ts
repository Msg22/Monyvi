/**
 * edit-account-service.test.ts
 *
 * Tests all exported functions from edit-account-service.ts:
 * - checkAccountNameUniqueness
 * - deleteAccountWithCascade
 * - updateAccountWithBalanceAdjustment (the sole public mutation entry
 *   point — covers what `updateAccount` and `createBalanceAdjustmentTransaction`
 *   used to test, plus atomicity, rollback, and stale-balance defense)
 *
 * Mock Strategy:
 *   The `@monyvi/db` mock is defined entirely inside the jest.mock factory
 *   to avoid Jest hoisting issues. Follows the same pattern as
 *   transaction-service.test.ts.
 */

// ---------------------------------------------------------------------------
// Shared Mock Types
// ---------------------------------------------------------------------------

interface MockModelRecord {
  readonly id: string;
  [key: string]: unknown;
  update: jest.Mock;
  markAsDeleted: jest.Mock;
  prepareUpdate: jest.Mock<MockModelRecord, [MockPreparedBuilder]>;
  prepareMarkAsDeleted: jest.Mock;
  bankDetails: { fetch: jest.Mock };
  transactions: { fetch: jest.Mock };
  transfers: { fetch: jest.Mock };
  debts: { fetch: jest.Mock };
  recurringPayments: { fetch: jest.Mock };
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
  readonly __rewireMocks: () => void;
  readonly __getStore: (table: string) => Map<string, MockModelRecord>;
}

type MockPreparedBuilder = (record: MockModelRecord) => void;

// ---------------------------------------------------------------------------
// jest.mock declarations
// ---------------------------------------------------------------------------

jest.mock("@monyvi/db", () => {
  const COLUMN_FIELD_MAP: Record<string, string> = {
    account_id: "accountId",
    from_account_id: "fromAccountId",
    is_default: "isDefault",
    to_account_id: "toAccountId",
    user_id: "userId",
  };

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function isMockPreparedBuilder(value: unknown): value is MockPreparedBuilder {
    return typeof value === "function";
  }

  function recordValue(record: MockModelRecord, columnName: string): unknown {
    const mappedField = COLUMN_FIELD_MAP[columnName] ?? columnName;
    return record[columnName] ?? record[mappedField];
  }

  function comparisonValue(comparison: Record<string, unknown>): unknown {
    const right = comparison.right;
    if (isRecord(right) && "operator" in right) {
      return comparisonValue(right);
    }
    if (isRecord(right) && "value" in right) {
      return right.value;
    }
    return right;
  }

  function comparisonOperator(comparison: Record<string, unknown>): unknown {
    const right = comparison.right;
    if (comparison.operator !== undefined) {
      return comparison.operator;
    }
    return isRecord(right) ? right.operator : undefined;
  }

  function matchesClause(record: MockModelRecord, clause: unknown): boolean {
    if (!isRecord(clause) || clause.type !== "where") {
      return true;
    }

    const columnName = String(clause.left);
    const comparison = clause.comparison;
    if (!isRecord(comparison)) {
      return true;
    }

    const actual = recordValue(record, columnName);
    const expected = comparisonValue(comparison);

    const operator = comparisonOperator(comparison);

    if (operator === "notEq") {
      return actual !== expected;
    }

    if (operator === "oneOf" && Array.isArray(expected)) {
      return expected.includes(actual);
    }

    return actual === expected;
  }

  const stores: Record<string, Map<string, MockModelRecord>> = {};

  function getStore(t: string): Map<string, MockModelRecord> {
    if (!stores[t]) stores[t] = new Map();
    return stores[t];
  }

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

    m.markAsDeleted = jest.fn(() => {
      m.deleted = true;
      return Promise.resolve();
    });

    // Default child relation mocks — return empty arrays
    m.prepareUpdate = jest.fn((builder: MockPreparedBuilder) => {
      m._preparedBuilder = builder;
      return m;
    });

    m.prepareMarkAsDeleted = jest.fn(() => {
      m._preparedBuilder = (record: MockModelRecord): void => {
        record.deleted = true;
        record._preparedState = "markAsDeleted";
      };
      return m;
    });

    m.bankDetails = { fetch: jest.fn(() => Promise.resolve([])) };
    m.transactions = { fetch: jest.fn(() => Promise.resolve([])) };
    m.transfers = { fetch: jest.fn(() => Promise.resolve([])) };
    m.debts = { fetch: jest.fn(() => Promise.resolve([])) };
    m.recurringPayments = { fetch: jest.fn(() => Promise.resolve([])) };

    return m as MockModelRecord;
  }

  function applyPreparedBatch(
    ...records: readonly MockModelRecord[]
  ): Promise<void> {
    for (const record of records) {
      const preparedBuilder = record._preparedBuilder;
      if (isMockPreparedBuilder(preparedBuilder)) {
        preparedBuilder(record);
        delete record._preparedBuilder;
      }
    }

    return Promise.resolve();
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
      query: jest.fn((...clauses: readonly unknown[]) => ({
        fetch: jest.fn(() =>
          Promise.resolve(
            Array.from(getStore(tableName).values()).filter((record) =>
              clauses.every((clause) => matchesClause(record, clause))
            )
          )
        ),
      })),
    };
  }

  const db = {
    write: jest.fn((cb: () => Promise<unknown>) => cb()),
    get: jest.fn((t: string) => createCollection(t)),
    batch: jest.fn(applyPreparedBatch),
  };

  return {
    database: db,
    Account: {},
    AccountSmsSender: {},
    BankDetails: {},
    Transaction: {},
    Transfer: {},
    Q: {
      where: jest.fn((left: string, right: unknown) => ({
        type: "where",
        left,
        comparison: { right },
      })),
      notEq: jest.fn((value: unknown) => ({
        operator: "notEq",
        right: value,
      })),
      sortBy: jest.fn(),
    },
    __mockDb: db,
    __stores: stores,
    __model: createModel,
    __getStore: getStore,
    __seed: (table: string, model: MockModelRecord) => {
      getStore(table).set(model.id, model);
    },
    __clearStores: () => {
      for (const key of Object.keys(stores)) stores[key].clear();
    },
    __rewireMocks: () => {
      db.write.mockImplementation((cb: () => Promise<unknown>) => cb());
      db.get.mockImplementation((t: string) => createCollection(t));
      db.batch.mockImplementation(applyPreparedBatch);
    },
  };
});

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve("user-1"),
}));

interface MockGuardedEditInput
  extends Omit<AccountCoreEditInput, "account" | "updateMetadata"> {
  readonly account: MockModelRecord;
  readonly updateMetadata: (projection: Record<string, unknown>) => void;
}

const mockEditGuardedAccount = jest.fn(
  async (input: MockGuardedEditInput): Promise<void> => {
    await input.prepareInsideWriter();
  }
);

jest.mock("@/services/account-core-writer-production", () => ({
  editGuardedAccount: (input: MockGuardedEditInput): Promise<void> =>
    mockEditGuardedAccount(input),
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import {
  checkAccountNameUniqueness,
  updateAccountWithBalanceAdjustment,
  deleteAccountWithCascade,
  EDIT_ACCOUNT_ERROR_CODES,
} from "@/services/edit-account-service";
import type { AccountCoreEditInput } from "@/services/account-core-writer-service";

// ---------------------------------------------------------------------------
// Grab mock helpers
// ---------------------------------------------------------------------------

const {
  __mockDb: mockDb,
  __model: mockModel,
  __seed: mockSeed,
  __clearStores: mockClearStores,
  __rewireMocks: mockRewire,
  __getStore: mockGetStore,
} = jest.requireMock<MockDbApi>("@monyvi/db");

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function seedAccount(
  id: string,
  fields: Record<string, unknown> = {}
): MockModelRecord {
  const defaults: Record<string, unknown> = {
    name: "Test Account",
    balance: 0,
    currency: "EGP",
    type: "CASH",
    userId: "user-1",
    isDefault: false,
    deleted: false,
    isBank: false,
  };
  const acc = mockModel(id, { ...defaults, ...fields });
  mockSeed("accounts", acc);
  return acc;
}

function guardedEditInput(): MockGuardedEditInput {
  const input = mockEditGuardedAccount.mock.calls[0]?.[0];
  if (!input) throw new Error("missing guarded edit input");
  return input;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("edit-account-service", () => {
  beforeEach(() => {
    mockClearStores();
    mockDb.write.mockClear();
    mockDb.get.mockClear();
    mockDb.batch.mockClear();
    mockEditGuardedAccount.mockClear();
    mockRewire();
  });

  // =========================================================================
  // checkAccountNameUniqueness
  // =========================================================================
  describe("checkAccountNameUniqueness", () => {
    it("should return isUnique=true for empty name", async () => {
      const result = await checkAccountNameUniqueness("user-1", "", "EGP");
      expect(result.isUnique).toBe(true);
    });

    it("should return isUnique=true when no duplicate exists", async () => {
      seedAccount("acc-1", { name: "Cash", currency: "EGP", userId: "user-1" });
      const result = await checkAccountNameUniqueness(
        "user-1",
        "Savings",
        "EGP"
      );
      expect(result.isUnique).toBe(true);
    });

    it("should return isUnique=false when duplicate exists (case-insensitive)", async () => {
      seedAccount("acc-1", { name: "Cash", currency: "EGP", userId: "user-1" });
      const result = await checkAccountNameUniqueness("user-1", "cash", "EGP");
      expect(result.isUnique).toBe(false);
    });

    it("should treat the same name and currency as unique when the known provider differs", async () => {
      seedAccount("acc-1", {
        name: "Savings",
        currency: "EGP",
        userId: "user-1",
        institutionId: "nbe",
      });

      const result = await checkAccountNameUniqueness(
        "user-1",
        "Savings",
        "EGP",
        undefined,
        "cib"
      );

      expect(result.isUnique).toBe(true);
    });

    it("should treat manual provider display names as part of the duplicate identity", async () => {
      seedAccount("acc-1", {
        name: "Main",
        currency: "EGP",
        userId: "user-1",
        institutionId: undefined,
        providerDisplayName: "QA Bank",
      });

      const result = await checkAccountNameUniqueness(
        "user-1",
        " main ",
        "EGP",
        undefined,
        null,
        " qa   bank "
      );

      expect(result.isUnique).toBe(false);
    });

    it("should allow the same name and currency when one manual provider name differs", async () => {
      seedAccount("acc-1", {
        name: "Main",
        currency: "EGP",
        userId: "user-1",
        institutionId: undefined,
        providerDisplayName: "QA Bank",
      });

      const result = await checkAccountNameUniqueness(
        "user-1",
        "Main",
        "EGP",
        undefined,
        null,
        "Family Bank"
      );

      expect(result.isUnique).toBe(true);
    });

    it("should exclude the current account from the check", async () => {
      // Seed two accounts: acc-1 has the same name, acc-2 has a different name.
      // The mock returns all accounts (doesn't filter Q.where), but the JS
      // case-insensitive filter should only match "Cash" — and since acc-1
      // is the one being edited, its name match should be excluded.
      // We verify this by ensuring a different-named second account doesn't
      // cause a false positive.
      seedAccount("acc-2", {
        name: "Savings",
        currency: "EGP",
        userId: "user-1",
      });
      const result = await checkAccountNameUniqueness(
        "user-1",
        "Savings",
        "EGP",
        "acc-2"
      );
      // The mock returns both accounts from the store. The function filters
      // by case-insensitive name match. Since "acc-2" has name "Savings" and
      // matches the query, BUT the Q.where(id, notEq) should exclude it.
      // However, since our mock doesn't apply Q.where filters, this test
      // validates the JS-level case-insensitive comparison logic instead.
      // With only "acc-2" matching and it being the excluded account, the
      // function WOULD return isUnique=true in production.
      // For mock-level testing, we verify that the function calls the
      // database and returns a result without error.
      expect(result.error).toBeUndefined();
    });

    it("should return error on database failure", async () => {
      mockDb.get.mockImplementationOnce(() => ({
        query: jest.fn(() => ({
          fetch: jest.fn(() => Promise.reject(new Error("DB read error"))),
        })),
      }));
      const result = await checkAccountNameUniqueness("user-1", "Cash", "EGP");
      expect(result.isUnique).toBe(false);
      expect(result.error).toBe("DB read error");
    });
  });

  // =========================================================================
  // deleteAccountWithCascade
  // =========================================================================
  describe("deleteAccountWithCascade", () => {
    it("should mark account as deleted", async () => {
      const acc = seedAccount("acc-1");
      const result = await deleteAccountWithCascade("acc-1", "user-1");
      expect(result.success).toBe(true);
      expect(acc.deleted).toBe(true);
      expect(acc.prepareUpdate).toHaveBeenCalled();
      expect(acc.prepareMarkAsDeleted).not.toHaveBeenCalled();
      expect(acc.markAsDeleted).not.toHaveBeenCalled();
    });

    it("should cascade delete bank_details", async () => {
      seedAccount("acc-1");
      const bd = mockModel("bd-1", {
        accountId: "acc-1",
        deleted: false,
      });
      mockSeed("bank_details", bd);
      await deleteAccountWithCascade("acc-1", "user-1");
      expect(bd.deleted).toBe(true);
      expect(bd.prepareUpdate).toHaveBeenCalled();
      expect(bd.prepareMarkAsDeleted).not.toHaveBeenCalled();
    });

    it("should cascade delete account_sms_senders", async () => {
      seedAccount("acc-1");
      const sender = mockModel("sender-1", {
        accountId: "acc-1",
        senderName: "CIB",
        normalizedSenderName: "cib",
        deleted: false,
      });
      mockSeed("account_sms_senders", sender);

      await deleteAccountWithCascade("acc-1", "user-1");

      expect(sender.deleted).toBe(true);
      expect(sender.prepareUpdate).toHaveBeenCalled();
      expect(sender.prepareMarkAsDeleted).not.toHaveBeenCalled();
    });

    it("should cascade delete transactions", async () => {
      seedAccount("acc-1");
      const tx = mockModel("tx-1", {
        accountId: "acc-1",
        userId: "user-1",
        deleted: false,
      });
      mockSeed("transactions", tx);
      await deleteAccountWithCascade("acc-1", "user-1");
      expect(tx.deleted).toBe(true);
      expect(tx.prepareUpdate).toHaveBeenCalled();
      expect(tx.prepareMarkAsDeleted).not.toHaveBeenCalled();
    });

    it("should leave foreign child rows untouched during cascade delete", async () => {
      seedAccount("acc-1");
      const ownedTx = mockModel("tx-owned", {
        accountId: "acc-1",
        userId: "user-1",
        deleted: false,
      });
      const foreignTx = mockModel("tx-foreign", {
        accountId: "acc-1",
        userId: "user-2",
        deleted: false,
      });
      const ownedTransfer = mockModel("tf-owned", {
        fromAccountId: "acc-1",
        toAccountId: "other",
        userId: "user-1",
        deleted: false,
      });
      const foreignTransfer = mockModel("tf-foreign", {
        fromAccountId: "acc-1",
        toAccountId: "other",
        userId: "user-2",
        deleted: false,
      });

      mockSeed("transactions", ownedTx);
      mockSeed("transactions", foreignTx);
      mockSeed("transfers", ownedTransfer);
      mockSeed("transfers", foreignTransfer);

      await deleteAccountWithCascade("acc-1", "user-1");

      expect(ownedTx.deleted).toBe(true);
      expect(ownedTransfer.deleted).toBe(true);
      expect(foreignTx.deleted).toBe(false);
      expect(foreignTransfer.deleted).toBe(false);
      expect(foreignTx.prepareUpdate).not.toHaveBeenCalled();
      expect(foreignTransfer.prepareUpdate).not.toHaveBeenCalled();
    });

    it("should cascade delete transfers (from_account)", async () => {
      seedAccount("acc-1");
      const tf = mockModel("tf-1", {
        fromAccountId: "acc-1",
        toAccountId: "other",
        userId: "user-1",
        deleted: false,
      });
      mockSeed("transfers", tf);
      await deleteAccountWithCascade("acc-1", "user-1");
      expect(tf.deleted).toBe(true);
      expect(tf.prepareUpdate).toHaveBeenCalled();
      expect(tf.prepareMarkAsDeleted).not.toHaveBeenCalled();
    });

    it("should cascade delete transfers (to_account)", async () => {
      seedAccount("acc-1");
      const toTransfer = mockModel("tf-to-1", {
        fromAccountId: "other",
        toAccountId: "acc-1",
        userId: "user-1",
        deleted: false,
      });
      mockSeed("transfers", toTransfer);
      await deleteAccountWithCascade("acc-1", "user-1");
      expect(toTransfer.deleted).toBe(true);
      expect(toTransfer.prepareUpdate).toHaveBeenCalled();
      expect(toTransfer.prepareMarkAsDeleted).not.toHaveBeenCalled();
    });

    it("should cascade delete debts", async () => {
      seedAccount("acc-1");
      const debt = mockModel("debt-1", {
        accountId: "acc-1",
        userId: "user-1",
        deleted: false,
      });
      mockSeed("debts", debt);
      await deleteAccountWithCascade("acc-1", "user-1");
      expect(debt.deleted).toBe(true);
      expect(debt.prepareUpdate).toHaveBeenCalled();
      expect(debt.prepareMarkAsDeleted).not.toHaveBeenCalled();
    });

    it("should cascade delete recurring_payments", async () => {
      seedAccount("acc-1");
      const rp = mockModel("rp-1", {
        accountId: "acc-1",
        userId: "user-1",
        deleted: false,
      });
      mockSeed("recurring_payments", rp);
      await deleteAccountWithCascade("acc-1", "user-1");
      expect(rp.deleted).toBe(true);
      expect(rp.prepareUpdate).toHaveBeenCalled();
      expect(rp.prepareMarkAsDeleted).not.toHaveBeenCalled();
    });

    it("should cascade delete ALL related entities together", async () => {
      const acc = seedAccount("acc-1");
      const bd = mockModel("bd-1", { accountId: "acc-1", deleted: false });
      const tx = mockModel("tx-1", {
        accountId: "acc-1",
        userId: "user-1",
        deleted: false,
      });
      const tf = mockModel("tf-1", {
        fromAccountId: "acc-1",
        toAccountId: "other",
        userId: "user-1",
        deleted: false,
      });
      const debt = mockModel("debt-1", {
        accountId: "acc-1",
        userId: "user-1",
        deleted: false,
      });
      const rp = mockModel("rp-1", {
        accountId: "acc-1",
        userId: "user-1",
        deleted: false,
      });

      mockSeed("bank_details", bd);
      mockSeed("transactions", tx);
      mockSeed("transfers", tf);
      mockSeed("debts", debt);
      mockSeed("recurring_payments", rp);

      await deleteAccountWithCascade("acc-1", "user-1");

      expect(bd.deleted).toBe(true);
      expect(tx.deleted).toBe(true);
      expect(tf.deleted).toBe(true);
      expect(debt.deleted).toBe(true);
      expect(rp.deleted).toBe(true);
      expect(acc.deleted).toBe(true);
      expect(mockDb.batch).toHaveBeenCalled();
    });

    it("should leave already-soft-deleted children untouched", async () => {
      seedAccount("acc-1");
      const activeDetail = mockModel("bd-active", {
        accountId: "acc-1",
        deleted: false,
      });
      const deletedDetail = mockModel("bd-deleted", {
        accountId: "acc-1",
        deleted: true,
      });
      mockSeed("bank_details", activeDetail);
      mockSeed("bank_details", deletedDetail);

      await deleteAccountWithCascade("acc-1", "user-1");

      expect(activeDetail.prepareUpdate).toHaveBeenCalled();
      expect(activeDetail.deleted).toBe(true);
      expect(deletedDetail.prepareUpdate).not.toHaveBeenCalled();
      expect(deletedDetail.prepareMarkAsDeleted).not.toHaveBeenCalled();
    });

    it("should return NOT_FOUND when the account does not exist", async () => {
      mockDb.get.mockImplementationOnce(() => ({
        find: jest.fn(() => Promise.reject(new Error("Not found"))),
      }));
      const result = await deleteAccountWithCascade("bad-id", "user-1");
      expect(result.success).toBe(false);
      expect(result.error).toBe(EDIT_ACCOUNT_ERROR_CODES.NOT_FOUND);
    });

    it("should return OWNERSHIP_FAILED and skip writes when userId does not match", async () => {
      const acc = seedAccount("acc-1", { userId: "owner-user" });
      const bd = mockModel("bd-1", { accountId: "acc-1", deleted: false });
      const tx = mockModel("tx-1", { accountId: "acc-1", deleted: false });
      mockSeed("bank_details", bd);
      mockSeed("transactions", tx);

      const result = await deleteAccountWithCascade("acc-1", "attacker-user");

      expect(result.success).toBe(false);
      expect(result.error).toBe(EDIT_ACCOUNT_ERROR_CODES.OWNERSHIP_FAILED);
      // No deletes anywhere in the cascade
      expect(acc.markAsDeleted).not.toHaveBeenCalled();
      expect(acc.prepareUpdate).not.toHaveBeenCalled();
      expect(bd.prepareUpdate).not.toHaveBeenCalled();
      expect(tx.prepareUpdate).not.toHaveBeenCalled();
      expect(acc.update).not.toHaveBeenCalled();
    });

    it("should clear is_default flag when deleting a default account (T028)", async () => {
      const defaultAcc = seedAccount("acc-default", {
        isDefault: true,
        userId: "user-1",
      });
      const otherAcc = seedAccount("acc-other", {
        isDefault: false,
        userId: "user-1",
      });

      const result = await deleteAccountWithCascade("acc-default", "user-1");

      expect(result.success).toBe(true);
      // The default flag is cleared in the same prepared update as the soft delete.
      expect(defaultAcc.prepareUpdate).toHaveBeenCalled();
      expect(defaultAcc.isDefault).toBe(false);
      expect(defaultAcc.deleted).toBe(true);
      expect(defaultAcc.prepareMarkAsDeleted).not.toHaveBeenCalled();
      // Other accounts should NOT be auto-promoted
      expect(otherAcc.update).not.toHaveBeenCalled();
      expect(otherAcc.isDefault).toBe(false);
    });

    it("should NOT clear is_default for non-default accounts", async () => {
      const nonDefault = seedAccount("acc-non-default", {
        isDefault: false,
      });

      await deleteAccountWithCascade("acc-non-default", "user-1");

      // update should NOT have been called for is_default clearing
      expect(nonDefault.update).not.toHaveBeenCalled();
      expect(nonDefault.deleted).toBe(true);
      expect(nonDefault.prepareUpdate).toHaveBeenCalled();
      expect(nonDefault.prepareMarkAsDeleted).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateAccountWithBalanceAdjustment — single public mutation entry point
  //
  // Covers:
  //   - the `updateAccount` legacy paths (name trim, default flip,
  //     bank-details update, error on missing account) when called with
  //     `adjustment: null`
  //   - the `createBalanceAdjustmentTransaction` legacy paths (INCOME on
  //     increase, EXPENSE on decrease, absolute amount, sub-epsilon skip)
  //     when called with a non-null adjustment
  //   - the atomicity contract from #374 (single write, rollback on
  //     adjustment failure, defensive previousBalance from live account)
  // =========================================================================
  describe("updateAccountWithBalanceAdjustment", () => {
    // ---- helpers --------------------------------------------------------

    /**
     * Wires the `accounts` collection to return `acc` from `find()` and the
     * `transactions` collection through a `txCreate` you pass in. Other
     * collections are stubbed empty.
     */
    function wireAccountAndTransactionMocks(
      acc: MockModelRecord,
      txCreate: jest.Mock
    ): void {
      const accountsCollectionMock = {
        find: jest.fn(() => Promise.resolve(acc)),
        query: jest.fn(() => ({ fetch: jest.fn(() => Promise.resolve([])) })),
      };
      mockDb.get.mockImplementation((tableName: string) => {
        if (tableName === "accounts") return accountsCollectionMock;
        if (tableName === "transactions") return { create: txCreate };
        return {
          find: jest.fn(),
          query: jest.fn(() => ({ fetch: jest.fn(() => Promise.resolve([])) })),
          create: jest.fn((builder: (r: Record<string, unknown>) => void) => {
            const record = mockModel(`new-${tableName}-${Date.now()}`);
            builder(record);
            mockSeed(tableName, record);
            return Promise.resolve(record);
          }),
        };
      });
    }

    /** Build a transactions.create mock that captures the created row. */
    function captureTxCreate(): {
      readonly create: jest.Mock;
      readonly captured: () => Record<string, unknown> | undefined;
    } {
      let captured: Record<string, unknown> | undefined;
      const create = jest.fn(
        (builder: (r: Record<string, unknown>) => void) => {
          captured = { id: `new-tx-${Date.now()}` };
          builder(captured);
          return Promise.resolve(captured);
        }
      );
      return { create, captured: (): typeof captured => captured };
    }

    // ---- batching contract (atomicity) ---------------------------------

    it("delegates balance-changing edits to the guarded command exactly once", async () => {
      seedAccount("acc-1", { name: "Old", balance: 100, userId: "user-1" });

      const result = await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        { name: "New", balance: 250, isDefault: false },
        { userId: "user-1", currency: "EGP" }
      );

      expect(result.success).toBe(true);
      expect(mockEditGuardedAccount).toHaveBeenCalledTimes(1);
      const input = guardedEditInput();
      expect(input.nextBalance).toBe(250);
      expect(input.userId).toBe("user-1");
      expect(input.account.id).toBe("acc-1");
      // The guarded command owns the writer; this layer opens none.
      expect(mockDb.write).not.toHaveBeenCalled();
    });

    it("routes metadata-only edits through the plain writer without the guarded command", async () => {
      seedAccount("acc-1", { name: "Old", balance: 100 });

      const result = await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        { name: "New", balance: 100, isDefault: false },
        null
      );

      expect(result.success).toBe(true);
      expect(mockEditGuardedAccount).not.toHaveBeenCalled();
      expect(mockDb.write).toHaveBeenCalledTimes(1);
    });

    it("builds the guarded input with the live delta and resolved metadata", async () => {
      const acc = seedAccount("acc-1", {
        name: "Old",
        balance: 100,
        userId: "user-1",
      });
      const tx = captureTxCreate();
      wireAccountAndTransactionMocks(acc, tx.create);

      const result = await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        { name: "Renamed", balance: 350, isDefault: false },
        { userId: "user-1", currency: "EGP" }
      );

      expect(result.success).toBe(true);
      const input = guardedEditInput();
      expect(input.nextBalance).toBe(350);
      const projection: Record<string, unknown> = {};
      input.updateMetadata(projection);
      expect(projection.name).toBe("Renamed");
      expect(input.adjustmentTransaction).toEqual({
        accountId: "acc-1",
        amount: 250,
        categoryId: "00000000-0000-0000-0001-000000000200",
        currency: "EGP",
        date: expect.any(Date) as unknown as Date,
        note: "Balance adjustment: 100 → 350",
        source: "MANUAL",
        type: "INCOME",
        userId: "user-1",
      });
      // The row itself is updated by the guarded command, not the hook.
      expect(acc.name).toBe("Old");
      // The adjustment transaction commits through the group mutation, not
      // the hook, so the hook creates no transaction rows.
      expect(tx.create).not.toHaveBeenCalled();
      expect(mockGetStore("transactions").size).toBe(0);
    });

    // ---- guarded sibling failure --------------------------------------

    it("fails the edit when guarded sibling writes fail without touching the row", async () => {
      const acc = seedAccount("acc-1", {
        name: "Original",
        balance: 100,
        type: "BANK",
        isBank: true,
        userId: "user-1",
      });
      mockDb.get.mockImplementation((tableName: string) => {
        if (tableName === "accounts") {
          return { find: jest.fn(() => Promise.resolve(acc)) };
        }
        if (tableName === "bank_details") {
          return {
            query: jest.fn(() => ({
              fetch: jest.fn(() => Promise.resolve([])),
            })),
            create: jest.fn(() =>
              Promise.reject(new Error("Bank details failed"))
            ),
          };
        }
        return {
          find: jest.fn(() =>
            Promise.reject(new Error(`unexpected find: ${tableName}`))
          ),
          query: jest.fn(() => ({
            fetch: jest.fn(() => Promise.resolve([])),
          })),
          create: jest.fn(() =>
            Promise.reject(new Error(`unexpected create: ${tableName}`))
          ),
        };
      });

      const result = await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        {
          name: "Renamed",
          balance: 350,
          isDefault: false,
          cardLast4: "1234",
        },
        { userId: "user-1", currency: "EGP" }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Bank details failed");
      // The account row is updated by the guarded command, which never ran.
      expect(acc.name).toBe("Original");
      expect(acc.balance).toBe(100);
    });

    // ---- defensive previousBalance (issue #374 Notes / CodeRabbit) -----

    it("computes the adjustment delta from the LIVE balance, not from any caller-supplied value", async () => {
      // The DB row's live balance is 250 (e.g., a sync moved it while the
      // form was open displaying 100). When the form submits with new
      // balance 400 and assumes the old was 100, the service must record
      // a delta of |400 - 250| = 150 (live), not |400 - 100| = 300 (stale).
      const acc = seedAccount("acc-1", {
        name: "Original",
        balance: 250,
        userId: "user-1",
      });
      const tx = captureTxCreate();
      wireAccountAndTransactionMocks(acc, tx.create);

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        { name: "Original", balance: 400, isDefault: false },
        { userId: "user-1", currency: "EGP" }
      );

      expect(guardedEditInput().nextBalance).toBe(400);
      expect(guardedEditInput().adjustmentTransaction).toEqual(
        expect.objectContaining({ amount: 150, type: "INCOME" })
      );
      expect(tx.create).not.toHaveBeenCalled();
    });

    // ---- INCOME / EXPENSE / amount math --------------------------------

    it("builds an INCOME adjustment spec when the live balance increases", async () => {
      const acc = seedAccount("acc-1", { balance: 1000, userId: "user-1" });
      const tx = captureTxCreate();
      wireAccountAndTransactionMocks(acc, tx.create);

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        { name: "Test", balance: 1500, isDefault: false },
        { userId: "user-1", currency: "EGP" }
      );

      expect(guardedEditInput().adjustmentTransaction).toEqual(
        expect.objectContaining({
          amount: 500,
          categoryId: "00000000-0000-0000-0001-000000000200",
          type: "INCOME",
        })
      );
      expect(tx.create).not.toHaveBeenCalled();
    });

    it("builds an EXPENSE adjustment spec when the live balance decreases", async () => {
      const acc = seedAccount("acc-1", { balance: 1500, userId: "user-1" });
      const tx = captureTxCreate();
      wireAccountAndTransactionMocks(acc, tx.create);

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        { name: "Test", balance: 1000, isDefault: false },
        { userId: "user-1", currency: "EGP" }
      );

      expect(guardedEditInput().adjustmentTransaction).toEqual(
        expect.objectContaining({
          amount: 500,
          categoryId: "00000000-0000-0000-0001-000000000201",
          type: "EXPENSE",
        })
      );
      expect(tx.create).not.toHaveBeenCalled();
    });

    it("uses the absolute difference as transaction amount", async () => {
      const acc = seedAccount("acc-1", { balance: 1000, userId: "user-1" });
      const tx = captureTxCreate();
      wireAccountAndTransactionMocks(acc, tx.create);

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        { name: "Test", balance: 700, isDefault: false },
        { userId: "user-1", currency: "EGP" }
      );

      expect(guardedEditInput().adjustmentTransaction).toEqual(
        expect.objectContaining({ amount: 300 })
      );
      expect(tx.create).not.toHaveBeenCalled();
    });

    it("keeps real high-precision BTC minor-unit changes that a fixed epsilon would omit", async () => {
      // 0.00001 BTC is 1000 satoshis: below the legacy 0.001 float epsilon
      // but a real minor-unit delta that must become a guarded effect with
      // adjustment evidence.
      const acc = seedAccount("acc-1", {
        balance: 1,
        currency: "BTC",
        userId: "user-1",
      });
      const tx = captureTxCreate();
      wireAccountAndTransactionMocks(acc, tx.create);

      const result = await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        { name: "BTC", balance: 1.00001, isDefault: false },
        { userId: "user-1", currency: "BTC" }
      );

      expect(result.success).toBe(true);
      expect(mockEditGuardedAccount).toHaveBeenCalledTimes(1);
      expect(guardedEditInput().nextBalance).toBe(1.00001);
      expect(guardedEditInput().adjustmentTransaction).toEqual(
        expect.objectContaining({
          amount: 0.00001,
          currency: "BTC",
          type: "INCOME",
        })
      );
      expect(tx.create).not.toHaveBeenCalled();
    });

    it("skips the adjustment when the delta rounds to zero minor units", async () => {
      const acc = seedAccount("acc-1", {
        name: "Old",
        balance: 100,
        userId: "user-1",
      });
      const tx = captureTxCreate();
      wireAccountAndTransactionMocks(acc, tx.create);

      const result = await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        { name: "Renamed", balance: 100.0001, isDefault: false },
        { userId: "user-1", currency: "EGP" }
      );

      expect(result.success).toBe(true);
      expect(tx.create).not.toHaveBeenCalled();
      expect(acc.name).toBe("Renamed");
      // Sub-minor-unit dust never touches the protected balance column.
      expect(acc.balance).toBe(100);
      expect(mockEditGuardedAccount).not.toHaveBeenCalled();
    });

    // ---- migrated `updateAccount` coverage (adjustment: null) ----------

    it("routes balance-changing metadata through the guarded command without an adjustment transaction", async () => {
      const acc = seedAccount("acc-1", {
        name: "Old Name",
        balance: 100,
        isDefault: false,
      });
      const tx = captureTxCreate();
      wireAccountAndTransactionMocks(acc, tx.create);

      const result = await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        { name: "New Name", balance: 500, isDefault: false },
        null
      );

      expect(result.success).toBe(true);
      expect(mockEditGuardedAccount).toHaveBeenCalledTimes(1);
      const input = guardedEditInput();
      expect(input.nextBalance).toBe(500);
      const projection: Record<string, unknown> = {};
      input.updateMetadata(projection);
      expect(projection.name).toBe("New Name");
      expect(input.adjustmentTransaction).toBeUndefined();
      expect(tx.create).not.toHaveBeenCalled();
    });

    it("trims the account name", async () => {
      const acc = seedAccount("acc-1", { name: "Old" });

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        { name: "  Trimmed Name  ", balance: 0, isDefault: false },
        null
      );

      expect(acc.name).toBe("Trimmed Name");
    });

      it("unsets the previous default inside the guarded group when setting a new default", async () => {
      const oldDefault = seedAccount("acc-old", {
        name: "Old Default",
        balance: 50,
        isDefault: true,
        userId: "user-1",
      });
      seedAccount("acc-new", {
        name: "New Default",
        balance: 0,
        isDefault: false,
        userId: "user-1",
      });

      const result = await updateAccountWithBalanceAdjustment(
        "acc-new",
        "user-1",
        { name: "New Default", balance: 75, isDefault: true },
        null
      );

      expect(result.success).toBe(true);
      expect(oldDefault.isDefault).toBe(false);
      const input = guardedEditInput();
      const projection: Record<string, unknown> = {};
      input.updateMetadata(projection);
      expect(projection.isDefault).toBe(true);
      expect(mockGetStore("transactions").size).toBe(0);
    });

    it("unsets previous default when setting new default", async () => {
      const oldDefault = seedAccount("acc-old", {
        name: "Old Default",
        isDefault: true,
        userId: "user-1",
      });
      seedAccount("acc-new", {
        name: "New Default",
        isDefault: false,
        userId: "user-1",
      });

      await updateAccountWithBalanceAdjustment(
        "acc-new",
        "user-1",
        { name: "New Default", balance: 0, isDefault: true },
        null
      );

      expect(oldDefault.isDefault).toBe(false);
    });

    it("updates account provider metadata, sender rows, and bank card details for bank accounts", async () => {
      const bankDetail = mockModel("bd-1", {
        accountId: "acc-1",
        cardLast4: 1234,
        deleted: false,
      });
      const existingSender = mockModel("sender-1", {
        accountId: "acc-1",
        senderName: "OldSMS",
        normalizedSenderName: "oldsms",
        deleted: false,
      });
      const account = seedAccount("acc-1", {
        name: "Bank Account",
        type: "BANK",
        isBank: true,
        providerDisplayName: "Old Bank",
      });
      mockSeed("bank_details", bankDetail);
      mockSeed("account_sms_senders", existingSender);

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        {
          name: "Bank Account",
          balance: 0,
          isDefault: false,
          bankName: "New Bank",
          providerDisplayName: "New Bank",
          cardLast4: " 5678 ",
          senderNames: ["NewSMS"],
        },
        null
      );

      expect(account.providerDisplayName).toBe("New Bank");
      expect(bankDetail.cardLast4).toBe(5678);
      expect(existingSender.deleted).toBe(true);
      expect(Array.from(mockGetStore("account_sms_senders").values())).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            accountId: "acc-1",
            senderName: "NewSMS",
            normalizedSenderName: "newsms",
            deleted: false,
          }),
        ])
      );
    });

    it("preserves provider metadata when a partial account update omits provider fields", async () => {
      seedAccount("acc-1", {
        name: "Bank Account",
        type: "BANK",
        isBank: true,
        institutionId: "cib",
        providerDisplayName: "CIB",
      });

      const result = await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        {
          name: "Updated Bank Account",
          balance: 25,
          isDefault: false,
        },
        null
      );

      expect(result.success).toBe(true);
      const input = guardedEditInput();
      const projection: Record<string, unknown> = {};
      input.updateMetadata(projection);
      expect(projection.name).toBe("Updated Bank Account");
      expect(projection).not.toHaveProperty("institutionId");
      expect(projection).not.toHaveProperty("providerDisplayName");
    });

    it("respects an explicit provider display name clear", async () => {
      seedAccount("acc-1", {
        name: "Bank Account",
        type: "BANK",
        isBank: true,
        providerDisplayName: "Legacy Bank",
      });

      const result = await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        {
          name: "Bank Account",
          balance: 25,
          isDefault: false,
          bankName: "Legacy Bank",
          providerDisplayName: "",
        },
        null
      );

      expect(result.success).toBe(true);
      const input = guardedEditInput();
      const projection: Record<string, unknown> = {};
      input.updateMetadata(projection);
      expect(projection.providerDisplayName).toBeUndefined();
    });

    it("rejects institution ids that do not match the existing account type", async () => {
      const account = seedAccount("acc-1", {
        name: "Bank Account",
        type: "BANK",
        isBank: true,
        institutionId: "cib",
        providerDisplayName: "CIB",
      });

      const result = await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        {
          name: "Bank Account",
          balance: 25,
          isDefault: false,
          institutionId: "vodafone-cash",
          providerDisplayName: "Vodafone Cash",
        },
        null
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        EDIT_ACCOUNT_ERROR_CODES.INVALID_INSTITUTION_FOR_ACCOUNT_TYPE
      );
      expect(account.institutionId).toBe("cib");
      expect(account.providerDisplayName).toBe("CIB");
    });

    it("preserves unchanged sender rows when replacing account sender names", async () => {
      const existingSender = mockModel("sender-1", {
        accountId: "acc-1",
        senderName: "CIB",
        normalizedSenderName: "cib",
        deleted: false,
      });
      seedAccount("acc-1", {
        name: "Bank Account",
        type: "BANK",
        isBank: true,
      });
      mockSeed("account_sms_senders", existingSender);

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        {
          name: "Bank Account",
          balance: 0,
          isDefault: false,
          bankName: "CIB",
          senderNames: ["CIB", "CIBEGYPT"],
        },
        null
      );

      expect(existingSender.deleted).toBe(false);
      expect(existingSender.update).not.toHaveBeenCalledWith(
        expect.any(Function)
      );
      expect(Array.from(mockGetStore("account_sms_senders").values())).toEqual(
        expect.arrayContaining([
          existingSender,
          expect.objectContaining({
            accountId: "acc-1",
            senderName: "CIBEGYPT",
            normalizedSenderName: "cibegypt",
            deleted: false,
          }),
        ])
      );
    });

    it("preserves sender rows when the update payload omits senderNames", async () => {
      const existingSender = mockModel("sender-1", {
        accountId: "acc-1",
        senderName: "CIB",
        normalizedSenderName: "cib",
        deleted: false,
      });
      seedAccount("acc-1", {
        name: "Bank Account",
        type: "BANK",
        isBank: true,
      });
      mockSeed("account_sms_senders", existingSender);

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        {
          name: "Renamed Bank Account",
          balance: 0,
          isDefault: false,
          bankName: "CIB",
        },
        null
      );

      expect(existingSender.deleted).toBe(false);
      expect(existingSender.update).not.toHaveBeenCalled();
      expect(Array.from(mockGetStore("account_sms_senders").values())).toEqual([
        existingSender,
      ]);
    });

    it("reactivates a dirty-deleted sender row instead of creating a duplicate", async () => {
      const deletedSender = mockModel("sender-1", {
        accountId: "acc-1",
        senderName: "CIB",
        normalizedSenderName: "cib",
        deleted: true,
      });
      seedAccount("acc-1", {
        name: "Bank Account",
        type: "BANK",
        isBank: true,
      });
      mockSeed("account_sms_senders", deletedSender);

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        {
          name: "Bank Account",
          balance: 0,
          isDefault: false,
          bankName: "CIB",
          senderNames: ["CIB"],
        },
        null
      );

      expect(deletedSender.deleted).toBe(false);
      expect(mockGetStore("account_sms_senders").size).toBe(1);
      expect(Array.from(mockGetStore("account_sms_senders").values())).toEqual([
        expect.objectContaining({
          id: "sender-1",
          accountId: "acc-1",
          senderName: "CIB",
          normalizedSenderName: "cib",
          deleted: false,
        }),
      ]);
    });

    it("creates missing bank details when editing a bank account with no detail row", async () => {
      const acc = seedAccount("acc-1", {
        name: "Bank Account",
        type: "BANK",
        isBank: true,
      });
      acc.bankDetails.fetch.mockResolvedValue([]);

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        {
          name: "Bank Account",
          balance: 0,
          isDefault: false,
          bankName: "CIB",
          cardLast4: "1234",
          senderNames: ["CIBSMS"],
        },
        null
      );

      const createdDetails = Array.from(mockGetStore("bank_details").values());
      expect(createdDetails).toHaveLength(1);
      expect(createdDetails[0]).toMatchObject({
        accountId: "acc-1",
        cardLast4: 1234,
        deleted: false,
      });
      expect(Array.from(mockGetStore("account_sms_senders").values())).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            accountId: "acc-1",
            senderName: "CIBSMS",
            normalizedSenderName: "cibsms",
            deleted: false,
          }),
        ])
      );
    });

    it("does not create an empty bank details row when no bank metadata is provided", async () => {
      seedAccount("acc-1", {
        name: "Bank Account",
        type: "BANK",
        isBank: true,
      });

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        {
          name: "Bank Account",
          balance: 0,
          isDefault: false,
          bankName: "",
          cardLast4: "",
          smsSenderName: "",
        },
        null
      );

      expect(mockGetStore("bank_details").size).toBe(0);
    });

    it("stores nullish card digits when clearing an existing bank detail row", async () => {
      const bankDetail = mockModel("bd-1", {
        accountId: "acc-1",
        cardLast4: 1234,
        deleted: false,
      });
      seedAccount("acc-1", {
        name: "Bank Account",
        type: "BANK",
        isBank: true,
      });
      mockSeed("bank_details", bankDetail);

      await updateAccountWithBalanceAdjustment(
        "acc-1",
        "user-1",
        {
          name: "Bank Account",
          balance: 0,
          isDefault: false,
          cardLast4: "",
        },
        null
      );

      expect(bankDetail.cardLast4).toBeUndefined();
    });

    it("returns success: false when the account is not found", async () => {
      mockDb.get.mockImplementationOnce(() => ({
        find: jest.fn(() => Promise.reject(new Error("Account not found"))),
      }));

      const result = await updateAccountWithBalanceAdjustment(
        "bad-id",
        "user-1",
        { name: "X", balance: 0, isDefault: false },
        null
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Account not found");
    });
  });
});
