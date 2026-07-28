import type {
  ParsedSmsTransaction,
  ReviewableTransaction,
} from "@monyvi/logic";

const mockGetCurrentUserId = jest.fn<Promise<string | null>, []>();
const mockEnsureCashAccount = jest.fn();
const mockQueryOwned = jest.fn();
const mockQueryAccessibleCategories = jest.fn();
const mockHasExistingSmsFingerprint = jest.fn<Promise<boolean>, [string]>();
const mockPrepareTransactionCreate = jest.fn();
const mockPrepareTransferCreate = jest.fn();
const mockDatabaseBatch = jest.fn<Promise<void>, [readonly unknown[]]>();
const mockDatabaseWrite = jest.fn<Promise<void>, [() => Promise<void>]>();
const mockDatabaseGet = jest.fn();

interface MockAccount {
  readonly id: string;
  balance: number;
  readonly prepareUpdate: jest.Mock<
    MockAccount,
    [(account: MockAccount) => void]
  >;
}

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string | null> => mockGetCurrentUserId(),
}));

jest.mock("@/services/account-service", () => ({
  ensureCashAccount: (...args: readonly unknown[]): unknown =>
    mockEnsureCashAccount(...args),
}));

jest.mock("@/services/user-data-access", () => ({
  queryOwned: (...args: readonly unknown[]): unknown => mockQueryOwned(...args),
  queryAccessibleCategories: (...args: readonly unknown[]): unknown =>
    mockQueryAccessibleCategories(...args),
}));

jest.mock("@/services/sms-dedup-service", () => ({
  hasExistingSmsFingerprint: (smsFingerprint: string): Promise<boolean> =>
    mockHasExistingSmsFingerprint(smsFingerprint),
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    oneOf: (ids: readonly string[]): readonly string[] => ids,
    where: (
      column: string,
      value: unknown
    ): { column: string; value: unknown } => ({
      column,
      value,
    }),
  },
}));

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): unknown => mockDatabaseGet(table),
    write: (writer: () => Promise<void>): Promise<void> =>
      mockDatabaseWrite(writer),
    batch: (ops: readonly unknown[]): Promise<void> => mockDatabaseBatch(ops),
  },
}));

jest.mock("@/services/watermelon-atomic-batch", () => ({
  commitPreparedBatch: (operations: readonly unknown[]): Promise<void> =>
    mockDatabaseBatch(operations),
}));

jest.mock("@/services/watermelon-cache-snapshot", () => ({
  captureCachedModelSnapshot: (model: MockAccount): unknown => ({
    model,
    balance: model.balance,
  }),
  restoreCachedModelSnapshot: (snapshot: {
    readonly model: MockAccount;
    readonly balance: number;
  }): void => {
    snapshot.model.balance = snapshot.balance;
  },
}));

import {
  batchCreateTransactions,
  prepareBatchCreateTransactions,
} from "@/services/batch-create-transactions";

function createAccount(id: string, balance: number): MockAccount {
  const account: MockAccount = {
    id,
    balance,
    prepareUpdate: jest.fn((updater: (record: MockAccount) => void) => {
      updater(account);
      return account;
    }),
  };

  return account;
}

function createReviewableTransaction(
  overrides: Partial<ReviewableTransaction> = {}
): ReviewableTransaction {
  return {
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Shop",
    date: new Date("2026-05-10T12:00:00.000Z"),
    categoryId: "cat-food",
    categoryDisplayName: "Food",
    confidence: 0.9,
    originLabel: "NBE",
    source: "SMS",
    deduplicationHash: "sms-hash-1",
    ...overrides,
  };
}

describe("batchCreateTransactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockResolvedValue("user-1");
    mockHasExistingSmsFingerprint.mockResolvedValue(false);
    mockDatabaseWrite.mockImplementation(async (writer) => {
      await writer();
    });
    mockDatabaseBatch.mockResolvedValue();
    mockQueryAccessibleCategories.mockReturnValue({
      fetch: jest.fn<Promise<ReadonlyArray<{ readonly id: string }>>, []>(() =>
        Promise.resolve([{ id: "cat-food" }])
      ),
    });
    mockPrepareTransactionCreate.mockImplementation(
      (builder: (record: Record<string, unknown>) => void) => {
        const record: Record<string, unknown> = {};
        builder(record);
        return record;
      }
    );
    mockPrepareTransferCreate.mockImplementation(
      (builder: (record: Record<string, unknown>) => void) => {
        const record: Record<string, unknown> = {};
        builder(record);
        return record;
      }
    );
    mockDatabaseGet.mockImplementation((table: string) => {
      if (table === "transactions") {
        return { prepareCreate: mockPrepareTransactionCreate };
      }
      if (table === "transfers") {
        return { prepareCreate: mockPrepareTransferCreate };
      }
      return { table };
    });
  });

  it("silently skips duplicate SMS fingerprints in the same save payload", async () => {
    const account = createAccount("acc-1", 1000);
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([account])
      ),
    });

    const result = await batchCreateTransactions(
      [
        createReviewableTransaction({ amount: 100 }),
        createReviewableTransaction({
          amount: 250,
          counterparty: "Duplicate Shop",
        }),
      ],
      new Map([
        [0, "acc-1"],
        [1, "acc-1"],
      ])
    );

    expect(result).toEqual({ savedCount: 1, failedCount: 0, errors: [] });
    expect(mockPrepareTransactionCreate).toHaveBeenCalledTimes(1);
    expect(account.balance).toBe(900);
  });

  it("persists the SMS fingerprint without persisting the raw SMS body", async () => {
    const account = createAccount("acc-1", 1000);
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([account])
      ),
    });
    const smsReviewTransaction = {
      ...createReviewableTransaction({
        deduplicationHash: "sms-hash-1",
      }),
      rawSmsBody: "Purchase of EGP 100.00 at Private Merchant",
    };

    const result = await batchCreateTransactions(
      [smsReviewTransaction],
      new Map([[0, "acc-1"]])
    );

    const persistedRecord = mockPrepareTransactionCreate.mock.results[0]
      ?.value as Record<string, unknown> | undefined;

    expect(result).toEqual({ savedCount: 1, failedCount: 0, errors: [] });
    expect(persistedRecord).toMatchObject({
      smsFingerprint: "sms-hash-1",
    });
    expect(persistedRecord).not.toHaveProperty("rawSmsBody");
  });

  it("uses the canonical SMS fingerprint when the compatibility hash is absent", async () => {
    const account = createAccount("acc-1", 1000);
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([account])
      ),
    });
    const transaction: ParsedSmsTransaction = {
      ...createReviewableTransaction({ deduplicationHash: undefined }),
      source: "SMS",
      smsFingerprint: "canonical-sms-fingerprint",
      senderDisplayName: "QNB EGYPT",
      rawSmsBody: "Private SMS body",
    };

    const result = await batchCreateTransactions(
      [transaction],
      new Map([[0, "acc-1"]])
    );

    expect(result).toEqual({ savedCount: 1, failedCount: 0, errors: [] });
    expect(mockHasExistingSmsFingerprint).toHaveBeenCalledWith(
      "canonical-sms-fingerprint"
    );
    expect(mockPrepareTransactionCreate.mock.results[0]?.value).toMatchObject({
      smsFingerprint: "canonical-sms-fingerprint",
    });
  });

  it("does not mark a fingerprint as seen until the SMS transaction is valid", async () => {
    const account = createAccount("acc-1", 1000);
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([account])
      ),
    });

    const result = await batchCreateTransactions(
      [
        createReviewableTransaction({ counterparty: "Missing account" }),
        createReviewableTransaction({ counterparty: "Valid duplicate" }),
      ],
      new Map([[1, "acc-1"]])
    );

    expect(result.savedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(mockPrepareTransactionCreate).toHaveBeenCalledTimes(1);
    expect(account.balance).toBe(900);
  });

  it("rejects SMS transactions without a deduplication hash", async () => {
    const result = await batchCreateTransactions(
      [createReviewableTransaction({ deduplicationHash: undefined })],
      new Map([[0, "acc-1"]])
    );

    expect(result.savedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain("Missing SMS fingerprint");
    expect(mockPrepareTransactionCreate).not.toHaveBeenCalled();
    expect(mockDatabaseBatch).not.toHaveBeenCalled();
  });

  it("rejects regular SMS transactions with a missing category before writing locally", async () => {
    const account = createAccount("acc-1", 1000);
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([account])
      ),
    });

    const result = await batchCreateTransactions(
      [
        createReviewableTransaction({
          categoryId: undefined as unknown as string,
        }),
      ],
      new Map([[0, "acc-1"]])
    );

    expect(result.savedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain("needs a category");
    expect(mockPrepareTransactionCreate).not.toHaveBeenCalled();
    expect(mockDatabaseBatch).not.toHaveBeenCalled();
    expect(account.balance).toBe(1000);
  });

  it("rejects regular SMS transactions with inaccessible categories before writing locally", async () => {
    const account = createAccount("acc-1", 1000);
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([account])
      ),
    });
    mockQueryAccessibleCategories.mockReturnValue({
      fetch: jest.fn<Promise<ReadonlyArray<{ readonly id: string }>>, []>(() =>
        Promise.resolve([])
      ),
    });

    const result = await batchCreateTransactions(
      [createReviewableTransaction({ categoryId: "missing-category" })],
      new Map([[0, "acc-1"]])
    );

    expect(result.savedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain("needs a valid category");
    expect(mockPrepareTransactionCreate).not.toHaveBeenCalled();
    expect(mockDatabaseBatch).not.toHaveBeenCalled();
    expect(account.balance).toBe(1000);
  });

  it("does not require a transaction category for ATM withdrawals saved as transfers", async () => {
    const bankAccount = createAccount("bank-1", 1000);
    const cashAccount = createAccount("cash-1", 100);
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([bankAccount, cashAccount])
      ),
    });

    const atmWithdrawal = {
      ...createReviewableTransaction({
        categoryId: undefined as unknown as string,
      }),
      isAtmWithdrawal: true,
    };

    const result = await batchCreateTransactions(
      [atmWithdrawal],
      new Map([[0, "bank-1"]]),
      new Map([[0, "cash-1"]])
    );

    expect(result).toEqual({ savedCount: 1, failedCount: 0, errors: [] });
    expect(mockPrepareTransferCreate).toHaveBeenCalledTimes(1);
    expect(mockPrepareTransactionCreate).not.toHaveBeenCalled();
    expect(bankAccount.balance).toBe(900);
    expect(cashAccount.balance).toBe(200);
  });

  it("silently skips SMS fingerprints that already exist locally", async () => {
    mockHasExistingSmsFingerprint.mockResolvedValue(true);

    const result = await batchCreateTransactions(
      [createReviewableTransaction()],
      new Map([[0, "acc-1"]])
    );

    expect(result).toEqual({ savedCount: 0, failedCount: 0, errors: [] });
    expect(mockPrepareTransactionCreate).not.toHaveBeenCalled();
    expect(mockDatabaseBatch).not.toHaveBeenCalled();
  });

  it("reports fingerprints that were already saved before preparation", async () => {
    mockHasExistingSmsFingerprint.mockResolvedValue(true);

    const prepared = await prepareBatchCreateTransactions(
      [createReviewableTransaction()],
      new Map([[0, "acc-1"]])
    );

    expect(prepared.alreadySavedSmsFingerprints).toEqual(
      new Set(["sms-hash-1"])
    );
  });

  it("restores cached account balances when the adapter batch fails", async () => {
    const account = createAccount("acc-1", 1000);
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([account])
      ),
    });
    mockDatabaseBatch.mockRejectedValueOnce(new Error("adapter failed"));

    await expect(
      batchCreateTransactions(
        [createReviewableTransaction()],
        new Map([[0, "acc-1"]])
      )
    ).rejects.toThrow("adapter failed");

    expect(account.balance).toBe(1000);
  });
});
