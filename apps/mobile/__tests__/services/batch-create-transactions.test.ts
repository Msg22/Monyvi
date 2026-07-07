import type { ReviewableTransaction } from "@monyvi/logic";

type PrepareCreateBuilder = (record: Record<string, unknown>) => void;

const mockGetCurrentUserId = jest.fn<Promise<string | null>, []>();
const mockEnsureCashAccount = jest.fn();
const mockQueryOwned = jest.fn();
const mockQueryAccessibleCategories = jest.fn();
const mockHasExistingSmsFingerprint = jest.fn<Promise<boolean>, [string]>();
const mockPrepareTransactionCreate = jest.fn<
  Record<string, unknown>,
  [PrepareCreateBuilder]
>();
const mockPrepareTransferCreate = jest.fn<
  Record<string, unknown>,
  [PrepareCreateBuilder]
>();
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

interface MockCategory {
  readonly id: string;
  readonly systemName: string;
  readonly displayName: string;
  readonly isSystem: boolean;
  readonly userId?: string | null;
  readonly createdAt?: Date;
  readonly type?: string | null;
  readonly parentId?: string | null;
  readonly level?: number;
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

import { batchCreateTransactions } from "@/services/batch-create-transactions";

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

  it("remaps local-only shared system category duplicates to the canonical category before saving", async () => {
    const account = createAccount("acc-1", 1000);
    const localDuplicate: MockCategory = {
      id: "local-food",
      systemName: "food",
      displayName: "Food",
      isSystem: true,
      userId: null,
      createdAt: new Date("2026-07-05T10:00:00.000Z"),
    };
    const canonicalCategory: MockCategory = {
      id: "00000000-0000-0000-0001-000000000010",
      systemName: "food",
      displayName: "Food",
      isSystem: true,
      userId: null,
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
    };
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([account])
      ),
    });
    mockQueryAccessibleCategories
      .mockReturnValueOnce({
        fetch: jest.fn<Promise<readonly MockCategory[]>, []>(() =>
          Promise.resolve([localDuplicate])
        ),
      })
      .mockReturnValueOnce({
        fetch: jest.fn<Promise<readonly MockCategory[]>, []>(() =>
          Promise.resolve([localDuplicate, canonicalCategory])
        ),
      });

    const result = await batchCreateTransactions(
      [createReviewableTransaction({ categoryId: "local-food" })],
      new Map([[0, "acc-1"]])
    );

    expect(result).toEqual({ savedCount: 1, failedCount: 0, errors: [] });
    expect(mockPrepareTransactionCreate).toHaveBeenCalledTimes(1);
    const builder = mockPrepareTransactionCreate.mock.calls[0]?.[0];
    const record: Record<string, unknown> = {};
    if (!builder) {
      throw new Error("Expected transaction create builder to be recorded.");
    }
    builder(record);
    expect(record.categoryId).toBe(
      "00000000-0000-0000-0001-000000000010"
    );
  });

  it("matches shared system category duplicates by full category identity", async () => {
    const account = createAccount("acc-1", 1000);
    const localTravelRoot: MockCategory = {
      id: "local-travel-root",
      systemName: "travel",
      displayName: "Travel",
      isSystem: true,
      userId: null,
      type: "EXPENSE",
      parentId: null,
      level: 1,
    };
    const canonicalShoppingTravel: MockCategory = {
      id: "00000000-0000-0000-0001-000000000111",
      systemName: "travel",
      displayName: "Travel",
      isSystem: true,
      userId: null,
      type: "EXPENSE",
      parentId: "00000000-0000-0000-0001-000000000020",
      level: 2,
    };
    const canonicalRootTravel: MockCategory = {
      id: "00000000-0000-0000-0001-000000000222",
      systemName: "travel",
      displayName: "Travel",
      isSystem: true,
      userId: null,
      type: "EXPENSE",
      parentId: null,
      level: 1,
    };
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([account])
      ),
    });
    mockQueryAccessibleCategories
      .mockReturnValueOnce({
        fetch: jest.fn<Promise<readonly MockCategory[]>, []>(() =>
          Promise.resolve([localTravelRoot])
        ),
      })
      .mockReturnValueOnce({
        fetch: jest.fn<Promise<readonly MockCategory[]>, []>(() =>
          Promise.resolve([
            localTravelRoot,
            canonicalShoppingTravel,
            canonicalRootTravel,
          ])
        ),
      })
      .mockReturnValueOnce({
        fetch: jest.fn<Promise<readonly MockCategory[]>, []>(() =>
          Promise.resolve([])
        ),
      });

    const result = await batchCreateTransactions(
      [createReviewableTransaction({ categoryId: "local-travel-root" })],
      new Map([[0, "acc-1"]])
    );

    expect(result).toEqual({ savedCount: 1, failedCount: 0, errors: [] });
    const builder = mockPrepareTransactionCreate.mock.calls[0]?.[0];
    const record: Record<string, unknown> = {};
    if (!builder) {
      throw new Error("Expected transaction create builder to be recorded.");
    }
    builder(record);
    expect(record.categoryId).toBe(
      "00000000-0000-0000-0001-000000000222"
    );
  });

  it("canonicalizes duplicate parent IDs before matching child system categories", async () => {
    const account = createAccount("acc-1", 1000);
    const localShoppingParent: MockCategory = {
      id: "local-shopping",
      systemName: "shopping",
      displayName: "Shopping",
      isSystem: true,
      userId: null,
      type: "EXPENSE",
      parentId: null,
      level: 1,
    };
    const canonicalShoppingParent: MockCategory = {
      id: "00000000-0000-0000-0001-000000000020",
      systemName: "shopping",
      displayName: "Shopping",
      isSystem: true,
      userId: null,
      type: "EXPENSE",
      parentId: null,
      level: 1,
    };
    const localShoppingTravel: MockCategory = {
      id: "local-shopping-travel",
      systemName: "travel",
      displayName: "Travel",
      isSystem: true,
      userId: null,
      type: "EXPENSE",
      parentId: "local-shopping",
      level: 2,
    };
    const canonicalShoppingTravel: MockCategory = {
      id: "00000000-0000-0000-0001-000000000111",
      systemName: "travel",
      displayName: "Travel",
      isSystem: true,
      userId: null,
      type: "EXPENSE",
      parentId: "00000000-0000-0000-0001-000000000020",
      level: 2,
    };
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([account])
      ),
    });
    mockQueryAccessibleCategories
      .mockReturnValueOnce({
        fetch: jest.fn<Promise<readonly MockCategory[]>, []>(() =>
          Promise.resolve([localShoppingTravel])
        ),
      })
      .mockReturnValueOnce({
        fetch: jest.fn<Promise<readonly MockCategory[]>, []>(() =>
          Promise.resolve([localShoppingTravel, canonicalShoppingTravel])
        ),
      })
      .mockReturnValueOnce({
        fetch: jest.fn<Promise<readonly MockCategory[]>, []>(() =>
          Promise.resolve([localShoppingParent, canonicalShoppingParent])
        ),
      });

    const result = await batchCreateTransactions(
      [createReviewableTransaction({ categoryId: "local-shopping-travel" })],
      new Map([[0, "acc-1"]])
    );

    expect(result).toEqual({ savedCount: 1, failedCount: 0, errors: [] });
    const builder = mockPrepareTransactionCreate.mock.calls[0]?.[0];
    const record: Record<string, unknown> = {};
    if (!builder) {
      throw new Error("Expected transaction create builder to be recorded.");
    }
    builder(record);
    expect(record.categoryId).toBe(
      "00000000-0000-0000-0001-000000000111"
    );
  });

  it("rejects local-only shared system category duplicates when no canonical category exists", async () => {
    const account = createAccount("acc-1", 1000);
    const localDuplicate: MockCategory = {
      id: "local-food",
      systemName: "food",
      displayName: "Food",
      isSystem: true,
      userId: null,
      createdAt: new Date("2026-07-05T10:00:00.000Z"),
    };
    mockQueryOwned.mockReturnValue({
      fetch: jest.fn<Promise<readonly MockAccount[]>, []>(() =>
        Promise.resolve([account])
      ),
    });
    mockQueryAccessibleCategories
      .mockReturnValueOnce({
        fetch: jest.fn<Promise<readonly MockCategory[]>, []>(() =>
          Promise.resolve([localDuplicate])
        ),
      })
      .mockReturnValueOnce({
        fetch: jest.fn<Promise<readonly MockCategory[]>, []>(() =>
          Promise.resolve([localDuplicate])
        ),
      });

    const result = await batchCreateTransactions(
      [createReviewableTransaction({ categoryId: "local-food" })],
      new Map([[0, "acc-1"]])
    );

    expect(result.savedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.errors[0]).toContain("needs a valid category");
    expect(mockPrepareTransactionCreate).not.toHaveBeenCalled();
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
});
