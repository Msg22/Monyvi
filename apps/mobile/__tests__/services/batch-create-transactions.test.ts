import type { ReviewableTransaction } from "@monyvi/logic";

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
