/* eslint-disable max-lines -- This service suite intentionally shares one hoisted WatermelonDB mock graph. */
const mockWrite = jest.fn();
const mockGet = jest.fn();
const mockCreateRecurringPayment = jest.fn();
const mockFindOwned = jest.fn();
const mockFindAccessibleCategory = jest.fn();
const mockGetCurrentUserDataScope = jest.fn();
const mockBatch = jest.fn();
const mockAdapterBatch = jest.fn<Promise<void>, [readonly unknown[]]>();
const mockAssertValidTransactionAmount = jest.fn();
const mockPrepareTransactionCreateWithBalance = jest.fn();
const mockRestoreCachedAccount = jest.fn();

interface MockRecurringPaymentRecord {
  readonly id: string;
  userId: string;
  name: string;
  amount: number;
  currency: string;
  type: string;
  accountId: string;
  categoryId: string;
  frequency: string;
  startDate: Date;
  nextDueDate: Date;
  action: string;
  status: string;
  deleted: boolean;
  notes?: string;
  endDate?: Date;
  update: jest.Mock<
    Promise<void>,
    [(record: MockRecurringPaymentRecord) => void]
  >;
  prepareUpdate: jest.Mock<
    MockRecurringPaymentRecord,
    [(record: MockRecurringPaymentRecord) => void]
  >;
}

interface MockCollection {
  readonly create?: typeof mockCreateRecurringPayment;
  readonly find?: jest.Mock;
}

interface MockUserDataScope {
  readonly userId: string;
  readonly findOwned: typeof mockFindOwned;
  readonly findAccessibleCategory: typeof mockFindAccessibleCategory;
}

function createRecurringRecord(
  overrides: Partial<MockRecurringPaymentRecord> = {}
): MockRecurringPaymentRecord {
  const record: MockRecurringPaymentRecord = {
    id: "payment-1",
    userId: "user-1",
    name: "Netflix",
    amount: 250,
    currency: "EGP",
    type: "EXPENSE",
    accountId: "account-1",
    categoryId: "category-1",
    frequency: "MONTHLY",
    startDate: new Date("2026-06-01T00:00:00.000Z"),
    nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
    action: "NOTIFY",
    status: "ACTIVE",
    deleted: false,
    notes: "streaming",
    update: jest.fn(
      (builder: (draft: MockRecurringPaymentRecord) => void): Promise<void> => {
        builder(record);
        return Promise.resolve();
      }
    ),
    prepareUpdate: jest.fn(
      (builder: (draft: MockRecurringPaymentRecord) => void) => {
        builder(record);
        return record;
      }
    ),
    ...overrides,
  };

  return record;
}

jest.mock("@monyvi/db", () => ({
  database: {
    write: (...args: readonly unknown[]): Promise<unknown> =>
      mockWrite(...args) as Promise<unknown>,
    get: (tableName: string): MockCollection =>
      mockGet(tableName) as MockCollection,
    batch: (...args: readonly unknown[]): Promise<void> =>
      mockBatch(...args) as Promise<void>,
    adapter: {
      batch: (operations: readonly unknown[]): Promise<void> =>
        mockAdapterBatch(operations),
    },
  },
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: (): Promise<MockUserDataScope> =>
    mockGetCurrentUserDataScope() as Promise<MockUserDataScope>,
}));

jest.mock("@/utils/dateHelpers", () => ({
  calculateNextDueDate: (date: Date, frequency: string): Date => {
    if (frequency === "WEEKLY") {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }

    if (frequency === "YEARLY") {
      const next = new Date(date);
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      return next;
    }

    return new Date("2026-08-01T00:00:00.000Z");
  },
  isOnOrBeforeDay: (date: Date, boundary: Date): boolean => {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    const normalizedBoundary = new Date(boundary);
    normalizedBoundary.setHours(0, 0, 0, 0);
    return normalizedDate.getTime() <= normalizedBoundary.getTime();
  },
  getNextMonthSameDay: (): Date => new Date("2026-07-01T00:00:00.000Z"),
}));

jest.mock("@/services/transaction-service", () => ({
  assertValidTransactionAmount: (amount: number): void => {
    mockAssertValidTransactionAmount(amount);
  },
  createTransaction: jest.fn(),
  prepareTransactionCreateWithBalance: (
    ...args: readonly unknown[]
  ): Promise<unknown> =>
    mockPrepareTransactionCreateWithBalance(...args) as Promise<unknown>,
}));

import {
  createRecurringPayment,
  deleteRecurringPayment,
  pauseRecurringPayment,
  RECURRING_PAYMENT_SERVICE_ERROR_CODES,
  resumeRecurringPayment,
  submitRecurringPayment,
  updateRecurringPayment,
} from "@/services/recurring-payment-service";

const { database: mockDatabase } = jest.requireMock<{
  database: {
    adapter: {
      batch: (operations: readonly unknown[]) => Promise<void>;
    };
  };
}>("@monyvi/db");

describe("recurring-payment-service", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));
    jest.clearAllMocks();
    mockWrite.mockImplementation(
      async (callback: () => Promise<unknown>): Promise<unknown> => callback()
    );
    mockBatch.mockResolvedValue(undefined);
    mockAdapterBatch.mockResolvedValue(undefined);
    mockAssertValidTransactionAmount.mockReturnValue(undefined);
    mockPrepareTransactionCreateWithBalance.mockResolvedValue({
      transaction: { id: "transaction-1" },
      operations: [{ id: "transaction-1" }, { id: "account-1" }],
      restoreCachedAccount: mockRestoreCachedAccount,
    });
    mockCreateRecurringPayment.mockImplementation(
      (
        builder: (record: Partial<MockRecurringPaymentRecord>) => void
      ): Promise<Partial<MockRecurringPaymentRecord>> => {
        const record: Partial<MockRecurringPaymentRecord> = {};
        builder(record);
        return Promise.resolve(record);
      }
    );
    mockGet.mockImplementation((tableName: string): MockCollection => {
      if (tableName === "recurring_payments") {
        return { create: mockCreateRecurringPayment };
      }

      return {};
    });
    mockFindOwned.mockImplementation(
      (_collection: MockCollection, id: string): Promise<unknown> => {
        if (id === "account-1") {
          return Promise.resolve({ id, userId: "user-1", currency: "EGP" });
        }

        return Promise.resolve(createRecurringRecord({ id }));
      }
    );
    mockFindAccessibleCategory.mockResolvedValue({
      id: "category-1",
      userId: null,
      type: "EXPENSE",
    });
    mockGetCurrentUserDataScope.mockResolvedValue({
      userId: "user-1",
      findOwned: mockFindOwned,
      findAccessibleCategory: mockFindAccessibleCategory,
    });
  });

  describe("create and update boundary validation", () => {
    const validCreateData = {
      name: "Netflix",
      amount: 250,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "MONTHLY",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      action: "NOTIFY",
    } as const;

    it.each([
      -250,
      0,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      1_000_000_000.01,
      12.345,
    ])("rejects invalid create amount %p before resolving scope or writing", async (amount) => {
      await expect(
        createRecurringPayment({ ...validCreateData, amount })
      ).rejects.toThrow(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT
      );

      expect(mockGetCurrentUserDataScope).not.toHaveBeenCalled();
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("accepts the inclusive maximum and the two-, three-, and eight-decimal currency contract", async () => {
      await expect(
        createRecurringPayment({
          ...validCreateData,
          amount: 1_000_000_000,
        })
      ).resolves.toBeDefined();
      await expect(
        createRecurringPayment({
          ...validCreateData,
          amount: 12.345,
          currency: "KWD",
        })
      ).resolves.toBeDefined();
      await expect(
        createRecurringPayment({
          ...validCreateData,
          amount: 0.12345678,
          currency: "BTC",
        })
      ).resolves.toBeDefined();

      expect(mockWrite).toHaveBeenCalledTimes(3);
    });

    it.each([
      new Date(Number.NaN),
      new Date("2026-05-31T23:59:59.000Z"),
      new Date("2027-06-02T00:00:00.000Z"),
    ])("rejects invalid or out-of-range create date %p before writing", async (startDate) => {
      await expect(
        createRecurringPayment({ ...validCreateData, startDate })
      ).rejects.toThrow(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_START_DATE
      );

      expect(mockGetCurrentUserDataScope).not.toHaveBeenCalled();
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("rejects an invalid End date before writing", async () => {
      await expect(
        createRecurringPayment({
          ...validCreateData,
          endDate: new Date(Number.NaN),
        })
      ).rejects.toThrow(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_END_DATE
      );

      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("rejects an invalid update amount before resolving scope or writing", async () => {
      await expect(
        updateRecurringPayment("payment-1", {
          ...validCreateData,
          amount: -250,
        })
      ).rejects.toThrow(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT
      );

      expect(mockGetCurrentUserDataScope).not.toHaveBeenCalled();
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("allows an unchanged legacy start day during update", async () => {
      const legacyStartDate = new Date("2025-01-10T08:00:00.000Z");
      const unchangedLegacyDate = new Date("2025-01-10T20:00:00.000Z");
      const payment = createRecurringRecord({ startDate: legacyStartDate });
      mockFindOwned.mockImplementation(
        (_collection: MockCollection, id: string): Promise<unknown> =>
          id === "account-1"
            ? Promise.resolve({ id, userId: "user-1", currency: "EGP" })
            : Promise.resolve(payment)
      );

      await updateRecurringPayment("payment-1", {
        ...validCreateData,
        startDate: unchangedLegacyDate,
      });

      expect(mockWrite).toHaveBeenCalledTimes(1);
      expect(payment.startDate).toEqual(unchangedLegacyDate);
    });

    it("keeps the advanced next due date when the start date stays on the same local day", async () => {
      const legacyStartDate = new Date("2025-01-10T08:00:00.000Z");
      const unchangedLegacyDate = new Date("2025-01-10T20:00:00.000Z");
      const advancedNextDueDate = new Date("2026-07-10T08:00:00.000Z");
      const payment = createRecurringRecord({
        startDate: legacyStartDate,
        nextDueDate: advancedNextDueDate,
      });
      mockFindOwned.mockImplementation(
        (_collection: MockCollection, id: string): Promise<unknown> =>
          id === "account-1"
            ? Promise.resolve({ id, userId: "user-1", currency: "EGP" })
            : Promise.resolve(payment)
      );

      await updateRecurringPayment("payment-1", {
        ...validCreateData,
        startDate: unchangedLegacyDate,
      });

      expect(payment.startDate).toEqual(unchangedLegacyDate);
      expect(payment.nextDueDate).toEqual(advancedNextDueDate);
    });

    it("rejects changing a legacy start day to a different out-of-range date before writing", async () => {
      const payment = createRecurringRecord({
        startDate: new Date("2025-01-10T08:00:00.000Z"),
      });
      mockFindOwned.mockImplementation(
        (_collection: MockCollection, id: string): Promise<unknown> =>
          id === "account-1"
            ? Promise.resolve({ id, userId: "user-1", currency: "EGP" })
            : Promise.resolve(payment)
      );

      await expect(
        updateRecurringPayment("payment-1", {
          ...validCreateData,
          startDate: new Date("2025-01-11T08:00:00.000Z"),
        })
      ).rejects.toThrow(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_START_DATE
      );

      expect(mockWrite).not.toHaveBeenCalled();
      expect(payment.update).not.toHaveBeenCalled();
    });
  });

  describe("historical transaction recurring templates", () => {
    it("starts the template at the first frequency-aligned occurrence on or after today", async () => {
      jest.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));

      const result = await createRecurringPayment({
        name: "Historical weekly payment",
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
        accountId: "account-1",
        categoryId: "category-1",
        frequency: "WEEKLY",
        startDate: new Date("2026-08-01T08:00:00.000Z"),
        initialOccurrenceRecorded: true,
        action: "NOTIFY",
      });

      expect(result).toMatchObject({
        startDate: new Date("2026-08-01T08:00:00.000Z"),
        nextDueDate: new Date("2026-09-05T08:00:00.000Z"),
        status: "ACTIVE",
      });
    });

    it("rejects a historical template when no aligned occurrence remains before End date", async () => {
      jest.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));

      await expect(
        createRecurringPayment({
          name: "Ended historical payment",
          amount: 250,
          currency: "EGP",
          type: "EXPENSE",
          accountId: "account-1",
          categoryId: "category-1",
          frequency: "WEEKLY",
          startDate: new Date("2026-08-01T08:00:00.000Z"),
          endDate: new Date("2026-09-04T23:59:59.000Z"),
          initialOccurrenceRecorded: true,
          action: "NOTIFY",
        })
      ).rejects.toThrow(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_SCHEDULE
      );

      expect(mockWrite).not.toHaveBeenCalled();
    });
  });

  it("resolves account and category scope before creating a recurring payment", async () => {
    const result = await createRecurringPayment({
      name: "Netflix",
      amount: 250,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "MONTHLY",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      action: "NOTIFY",
      notes: "streaming",
    });

    expect(mockFindOwned).toHaveBeenCalledWith(expect.anything(), "account-1");
    expect(mockFindAccessibleCategory).toHaveBeenCalledWith(
      expect.anything(),
      "category-1"
    );
    expect(result).toMatchObject({
      userId: "user-1",
      name: "Netflix",
      amount: 250,
      currency: "EGP",
      status: "ACTIVE",
      deleted: false,
    });
  });

  it("uses Due payment as the first outstanding occurrence when creating a recurring payment", async () => {
    const result = await createRecurringPayment({
      name: "Weekly Gym",
      amount: 250,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "WEEKLY",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      action: "NOTIFY",
      notes: "membership",
    });

    expect(result).toMatchObject({
      frequency: "WEEKLY",
      nextDueDate: new Date("2026-06-01T00:00:00.000Z"),
    });
  });

  it("advances the next due date when the first occurrence is already recorded", async () => {
    const result = await createRecurringPayment({
      name: "Recorded gym payment",
      amount: 250,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "WEEKLY",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      initialOccurrenceRecorded: true,
      action: "NOTIFY",
    });

    expect(result.nextDueDate).toEqual(new Date("2026-06-08T00:00:00.000Z"));
  });

  it("persists an End date on create and clears it on update", async () => {
    const endDate = new Date("2026-08-01T00:00:00.000Z");
    const created = await createRecurringPayment({
      name: "Internet bill",
      amount: 120,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "MONTHLY",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate,
      action: "NOTIFY",
    });
    const payment = createRecurringRecord({ endDate });
    mockFindOwned.mockImplementation(
      (_collection: MockCollection, id: string): Promise<unknown> =>
        id === "account-1"
          ? Promise.resolve({ id, userId: "user-1", currency: "EGP" })
          : Promise.resolve(payment)
    );

    await updateRecurringPayment("payment-1", {
      name: "Internet bill",
      amount: 120,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "MONTHLY",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: null,
      action: "NOTIFY",
    });

    expect(created).toMatchObject({ endDate });
    expect(payment.endDate).toBeUndefined();
  });

  it("completes an active series when an edited End date is before its next due payment", async () => {
    const payment = createRecurringRecord({
      nextDueDate: new Date("2026-08-01T00:00:00.000Z"),
    });
    mockFindOwned.mockImplementation(
      (_collection: MockCollection, id: string): Promise<unknown> =>
        id === "account-1"
          ? Promise.resolve({ id, userId: "user-1", currency: "EGP" })
          : Promise.resolve(payment)
    );

    await updateRecurringPayment("payment-1", {
      name: "Netflix",
      amount: 250,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "MONTHLY",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-07-01T00:00:00.000Z"),
      action: "NOTIFY",
    });

    expect(payment.status).toBe("COMPLETED");
  });

  it("keeps an edited Due payment outstanding when it equals End date", async () => {
    const payment = createRecurringRecord({
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
    });
    mockFindOwned.mockImplementation(
      (_collection: MockCollection, id: string): Promise<unknown> =>
        id === "account-1"
          ? Promise.resolve({ id, userId: "user-1", currency: "EGP" })
          : Promise.resolve(payment)
    );
    const duePayment = new Date("2026-07-15T00:00:00.000Z");

    await updateRecurringPayment("payment-1", {
      name: "Netflix",
      amount: 250,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "MONTHLY",
      startDate: duePayment,
      endDate: duePayment,
      action: "NOTIFY",
    });

    expect(payment.status).toBe("ACTIVE");
    expect(payment.nextDueDate).toEqual(duePayment);
  });

  it("keeps an end-date-completed payment completed when its next due date becomes eligible", async () => {
    const payment = createRecurringRecord({
      status: "COMPLETED",
      endDate: new Date("2026-07-01T00:00:00.000Z"),
      nextDueDate: new Date("2026-08-01T00:00:00.000Z"),
    });
    mockFindOwned.mockImplementation((_collection: MockCollection, id: string): Promise<unknown> => id === "account-1" ? Promise.resolve({ id, userId: "user-1" }) : Promise.resolve(payment));

    await updateRecurringPayment("payment-1", { name: "Netflix", amount: 250, currency: "EGP", type: "EXPENSE", accountId: "account-1", categoryId: "category-1", frequency: "MONTHLY", startDate: payment.startDate, endDate: null, action: "NOTIFY" });

    expect(payment.status).toBe("COMPLETED");
    expect(payment.nextDueDate).toEqual(new Date("2026-08-01T00:00:00.000Z"));
  });

  it("keeps the final paid occurrence when editing a completed bounded series", async () => {
    const finalPaidDate = new Date("2026-07-01T00:00:00.000Z");
    const payment = createRecurringRecord({
      status: "COMPLETED",
      endDate: finalPaidDate,
      nextDueDate: finalPaidDate,
    });
    mockFindOwned.mockImplementation((_collection: MockCollection, id: string): Promise<unknown> => id === "account-1" ? Promise.resolve({ id, userId: "user-1" }) : Promise.resolve(payment));

    await updateRecurringPayment("payment-1", {
      name: "Netflix",
      amount: 250,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "WEEKLY",
      startDate: new Date("2026-06-15T00:00:00.000Z"),
      endDate: finalPaidDate,
      action: "NOTIFY",
    });

    expect(payment.status).toBe("COMPLETED");
    expect(payment.nextDueDate).toEqual(finalPaidDate);
  });

  it("rejects a deleted category reference before creating a recurring payment", async () => {
    mockFindAccessibleCategory.mockResolvedValue({
      id: "category-1",
      userId: null,
      deleted: true,
    });

    await expect(
      createRecurringPayment({
        name: "Weekly Gym",
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
        accountId: "account-1",
        categoryId: "category-1",
        frequency: "WEEKLY",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        action: "NOTIFY",
        notes: "membership",
      })
    ).rejects.toThrow(
      RECURRING_PAYMENT_SERVICE_ERROR_CODES.CATEGORY_UNAVAILABLE
    );
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("rejects a mismatched category type before creating a recurring payment", async () => {
    mockFindAccessibleCategory.mockResolvedValue({
      id: "category-1",
      userId: null,
      type: "INCOME",
      deleted: false,
    });

    await expect(
      createRecurringPayment({
        name: "Weekly Gym",
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
        accountId: "account-1",
        categoryId: "category-1",
        frequency: "WEEKLY",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        action: "NOTIFY",
        notes: "membership",
      })
    ).rejects.toThrow(
      RECURRING_PAYMENT_SERVICE_ERROR_CODES.CATEGORY_UNAVAILABLE
    );
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("rejects a deleted account reference before creating a recurring payment", async () => {
    mockFindOwned.mockResolvedValue({
      id: "account-1",
      userId: "user-1",
      currency: "EGP",
      deleted: true,
    });

    await expect(
      createRecurringPayment({
        name: "Weekly Gym",
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
        accountId: "account-1",
        categoryId: "category-1",
        frequency: "WEEKLY",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        action: "NOTIFY",
        notes: "membership",
      })
    ).rejects.toThrow(
      RECURRING_PAYMENT_SERVICE_ERROR_CODES.ACCOUNT_UNAVAILABLE
    );
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("normalizes missing account references before creating a recurring payment", async () => {
    mockFindOwned.mockRejectedValue(new Error("Record not found"));

    await expect(
      createRecurringPayment({
        name: "Weekly Gym",
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
        accountId: "missing-account",
        categoryId: "category-1",
        frequency: "WEEKLY",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        action: "NOTIFY",
        notes: "membership",
      })
    ).rejects.toThrow(
      RECURRING_PAYMENT_SERVICE_ERROR_CODES.ACCOUNT_UNAVAILABLE
    );
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("normalizes missing category references before creating a recurring payment", async () => {
    mockFindAccessibleCategory.mockRejectedValue(new Error("Record not found"));

    await expect(
      createRecurringPayment({
        name: "Weekly Gym",
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
        accountId: "account-1",
        categoryId: "missing-category",
        frequency: "WEEKLY",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        action: "NOTIFY",
        notes: "membership",
      })
    ).rejects.toThrow(
      RECURRING_PAYMENT_SERVICE_ERROR_CODES.CATEGORY_UNAVAILABLE
    );
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("rejects a deleted category reference before updating a recurring payment", async () => {
    mockFindAccessibleCategory.mockResolvedValue({
      id: "category-1",
      userId: null,
      deleted: true,
    });

    await expect(
      updateRecurringPayment("payment-1", {
        name: "Gym",
        amount: 450,
        currency: "EGP",
        type: "EXPENSE",
        accountId: "account-1",
        categoryId: "category-1",
        frequency: "WEEKLY",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        action: "AUTO_CREATE",
        notes: undefined,
      })
    ).rejects.toThrow(
      RECURRING_PAYMENT_SERVICE_ERROR_CODES.CATEGORY_UNAVAILABLE
    );
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("rejects a mismatched category type before updating a recurring payment", async () => {
    mockFindAccessibleCategory.mockResolvedValue({
      id: "category-1",
      userId: null,
      type: "INCOME",
      deleted: false,
    });

    await expect(
      updateRecurringPayment("payment-1", {
        name: "Gym",
        amount: 450,
        currency: "EGP",
        type: "EXPENSE",
        accountId: "account-1",
        categoryId: "category-1",
        frequency: "WEEKLY",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        action: "AUTO_CREATE",
        notes: undefined,
      })
    ).rejects.toThrow(
      RECURRING_PAYMENT_SERVICE_ERROR_CODES.CATEGORY_UNAVAILABLE
    );
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("rejects a deleted account reference before updating a recurring payment", async () => {
    mockFindOwned.mockImplementation(
      (_collection: MockCollection, id: string): Promise<unknown> => {
        if (id === "account-1") {
          return Promise.resolve({
            id,
            userId: "user-1",
            currency: "EGP",
            deleted: true,
          });
        }

        return Promise.resolve(createRecurringRecord({ id }));
      }
    );

    await expect(
      updateRecurringPayment("payment-1", {
        name: "Gym",
        amount: 450,
        currency: "EGP",
        type: "EXPENSE",
        accountId: "account-1",
        categoryId: "category-1",
        frequency: "WEEKLY",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        action: "AUTO_CREATE",
        notes: undefined,
      })
    ).rejects.toThrow(
      RECURRING_PAYMENT_SERVICE_ERROR_CODES.ACCOUNT_UNAVAILABLE
    );
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("updates editable fields on an owned recurring payment", async () => {
    const payment = createRecurringRecord({
      frequency: "WEEKLY",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      nextDueDate: new Date("2026-07-08T00:00:00.000Z"),
    });
    mockFindOwned.mockImplementation(
      (_collection: MockCollection, id: string): Promise<unknown> => {
        if (id === "account-1") {
          return Promise.resolve({ id, userId: "user-1", currency: "EGP" });
        }

        return Promise.resolve(payment);
      }
    );

    await updateRecurringPayment("payment-1", {
      name: "Gym",
      amount: 450,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "WEEKLY",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      action: "AUTO_CREATE",
      notes: undefined,
    });

    expect(payment.update).toHaveBeenCalledTimes(1);
    expect(payment).toMatchObject({
      name: "Gym",
      amount: 450,
      frequency: "WEEKLY",
      action: "AUTO_CREATE",
      notes: undefined,
      nextDueDate: new Date("2026-07-08T00:00:00.000Z"),
    });
  });

  it("uses the edited Due payment as the next outstanding occurrence", async () => {
    const payment = createRecurringRecord({
      frequency: "MONTHLY",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
    });
    mockFindOwned.mockImplementation(
      (_collection: MockCollection, id: string): Promise<unknown> => {
        if (id === "account-1") {
          return Promise.resolve({ id, userId: "user-1", currency: "EGP" });
        }

        return Promise.resolve(payment);
      }
    );

    await updateRecurringPayment("payment-1", {
      name: "Gym",
      amount: 450,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "WEEKLY",
      startDate: new Date("2026-06-15T00:00:00.000Z"),
      action: "AUTO_CREATE",
      notes: undefined,
    });

    expect(payment.nextDueDate).toEqual(new Date("2026-06-15T00:00:00.000Z"));
  });

  it("recomputes next due date from the current due date when only the frequency changes", async () => {
    const payment = createRecurringRecord({
      frequency: "MONTHLY",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
    });
    mockFindOwned.mockImplementation(
      (_collection: MockCollection, id: string): Promise<unknown> => {
        if (id === "account-1") {
          return Promise.resolve({ id, userId: "user-1", currency: "EGP" });
        }

        return Promise.resolve(payment);
      }
    );

    await updateRecurringPayment("payment-1", {
      name: "Gym",
      amount: 450,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "WEEKLY",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      action: "AUTO_CREATE",
      notes: undefined,
    });

    expect(payment.nextDueDate).toEqual(new Date("2026-07-08T00:00:00.000Z"));
  });

  describe("submitRecurringPayment", () => {
    it("completes after the final eligible payment, including overdue Pay Now", async () => {
      const payment = createRecurringRecord({
        nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-07-01T00:00:00.000Z"),
      });
      mockFindOwned.mockResolvedValue(payment);

      await submitRecurringPayment({ payment: payment as never, accountId: "account-1", amount: 250 });

      expect(payment.status).toBe("COMPLETED");
      expect(payment.nextDueDate).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    });

    it("advances a shortened-month occurrence from the original monthly anchor", async () => {
      const payment = createRecurringRecord({
        frequency: "MONTHLY",
        startDate: new Date("2026-01-31T09:00:00.000Z"),
        nextDueDate: new Date("2026-02-28T09:00:00.000Z"),
      });
      mockFindOwned.mockResolvedValue(payment);

      await submitRecurringPayment({
        payment: payment as never,
        accountId: "account-1",
        amount: 250,
      });

      expect(payment.nextDueDate).toEqual(
        new Date("2026-03-31T09:00:00.000Z")
      );
    });

    it("accepts a final due payment on End date when times differ", async () => {
      const payment = createRecurringRecord({
        nextDueDate: new Date("2026-07-01T15:00:00.000Z"),
        endDate: new Date("2026-07-01T00:00:00.000Z"),
      });
      mockFindOwned.mockResolvedValue(payment);

      await submitRecurringPayment({
        payment: payment as never,
        accountId: "account-1",
        amount: 250,
      });

      expect(payment.status).toBe("COMPLETED");
    });

    it("rejects a repeated final Pay Now after the series is completed", async () => {
      const payment = createRecurringRecord({
        status: "COMPLETED",
        nextDueDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-07-01T00:00:00.000Z"),
      });
      mockFindOwned.mockResolvedValue(payment);

      await expect(
        submitRecurringPayment({
          payment: payment as never,
          accountId: "account-1",
          amount: 250,
        })
      ).rejects.toThrow(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.PAYMENT_UNAVAILABLE
      );

      expect(mockPrepareTransactionCreateWithBalance).not.toHaveBeenCalled();
    });

    it("rejects Pay Now when the persisted payment is paused", async () => {
      const payment = createRecurringRecord({ status: "PAUSED" });
      mockFindOwned.mockResolvedValue(payment);

      await expect(
        submitRecurringPayment({
          payment: payment as never,
          accountId: "account-1",
          amount: 250,
        })
      ).rejects.toThrow(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.PAYMENT_UNAVAILABLE
      );

      expect(mockPrepareTransactionCreateWithBalance).not.toHaveBeenCalled();
      expect(mockBatch).not.toHaveBeenCalled();
    });

    it("batches transaction creation, balance update, and persisted schedule advancement in one writer", async () => {
      const stalePayment = createRecurringRecord({
        currency: "USD",
        categoryId: "stale-category",
        nextDueDate: new Date("2026-05-01T00:00:00.000Z"),
      });
      const persistedPayment = createRecurringRecord({
        currency: "EGP",
        categoryId: "category-1",
        nextDueDate: new Date("2026-07-01T00:00:00.000Z"),
      });
      mockFindOwned.mockResolvedValue(persistedPayment);

      await submitRecurringPayment({
        payment: stalePayment as never,
        accountId: "account-1",
        amount: 425,
        note: "July bill",
      });

      expect(mockWrite).toHaveBeenCalledTimes(1);
      expect(mockFindOwned).toHaveBeenCalledWith(
        expect.anything(),
        "payment-1"
      );
      expect(mockPrepareTransactionCreateWithBalance).toHaveBeenCalledWith(
        {
          amount: 425,
          currency: "EGP",
          categoryId: "category-1",
          accountId: "account-1",
          note: "July bill",
          type: "EXPENSE",
          source: "MANUAL",
          date: expect.any(Date) as Date,
          linkedRecurringId: "payment-1",
        },
        expect.objectContaining({ userId: "user-1" }),
        "user-1"
      );
      expect(persistedPayment.nextDueDate).toEqual(
        new Date("2026-08-01T00:00:00.000Z")
      );
      expect(mockBatch).toHaveBeenCalledTimes(1);
      expect(mockBatch).toHaveBeenCalledWith([
        { id: "transaction-1" },
        { id: "account-1" },
        persistedPayment,
      ]);
    });

    it("restores cached state immediately after an adapter rollback", async () => {
      const payment = createRecurringRecord();
      const adapterError = new Error("atomic adapter batch failed");
      mockFindOwned.mockResolvedValue(payment);
      mockAdapterBatch.mockRejectedValueOnce(adapterError);
      mockBatch.mockImplementationOnce(
        async (operations: readonly unknown[]): Promise<void> => {
          await mockDatabase.adapter.batch(operations);
        }
      );

      await expect(
        submitRecurringPayment({
          payment: payment as never,
          accountId: "account-1",
          amount: 250,
        })
      ).rejects.toThrow(adapterError);

      expect(mockWrite).toHaveBeenCalledTimes(1);
      expect(mockBatch).toHaveBeenCalledTimes(1);
      expect(mockRestoreCachedAccount).toHaveBeenCalledTimes(1);
    });

    it("does not rewind or reject when cache publication fails after adapter commit", async () => {
      const payment = createRecurringRecord();
      const notificationError = new Error("observer failed after commit");
      mockFindOwned.mockResolvedValue(payment);
      mockBatch.mockImplementationOnce(
        async (operations: readonly unknown[]): Promise<void> => {
          await mockDatabase.adapter.batch(operations);
          throw notificationError;
        }
      );

      await expect(
        submitRecurringPayment({
          payment: payment as never,
          accountId: "account-1",
          amount: 250,
        })
      ).resolves.toBeUndefined();

      expect(mockRestoreCachedAccount).not.toHaveBeenCalled();
    });

    it("uses persisted income direction when preparing the atomic transaction", async () => {
      const payment = createRecurringRecord({ type: "INCOME" });
      mockFindOwned.mockResolvedValue(payment);

      await submitRecurringPayment({
        payment: payment as never,
        accountId: "account-1",
        amount: 900,
      });

      expect(mockPrepareTransactionCreateWithBalance).toHaveBeenCalledWith(
        expect.objectContaining({ type: "INCOME", amount: 900 }),
        expect.anything(),
        "user-1"
      );
      expect(mockBatch).toHaveBeenCalledTimes(1);
    });

    it("rejects a deleted recurring payment without preparing or committing", async () => {
      const payment = createRecurringRecord({ deleted: true });
      mockFindOwned.mockResolvedValue(payment);

      await expect(
        submitRecurringPayment({
          payment: payment as never,
          accountId: "account-1",
          amount: 250,
        })
      ).rejects.toThrow(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.PAYMENT_UNAVAILABLE
      );

      expect(mockPrepareTransactionCreateWithBalance).not.toHaveBeenCalled();
      expect(mockBatch).not.toHaveBeenCalled();
    });

    it("rejects a missing or foreign recurring payment without committing", async () => {
      const payment = createRecurringRecord();
      const scopeError = new Error("OWNERSHIP_FAILED");
      mockFindOwned.mockRejectedValue(scopeError);

      await expect(
        submitRecurringPayment({
          payment: payment as never,
          accountId: "account-1",
          amount: 250,
        })
      ).rejects.toThrow(scopeError);

      expect(mockPrepareTransactionCreateWithBalance).not.toHaveBeenCalled();
      expect(mockBatch).not.toHaveBeenCalled();
    });

    it("does not commit when account lookup or auth revalidation fails", async () => {
      const payment = createRecurringRecord();
      const preparationError = new Error("AUTH_SCOPE_CHANGED");
      mockFindOwned.mockResolvedValue(payment);
      mockPrepareTransactionCreateWithBalance.mockRejectedValue(
        preparationError
      );

      await expect(
        submitRecurringPayment({
          payment: payment as never,
          accountId: "account-1",
          amount: 250,
        })
      ).rejects.toThrow(preparationError);

      expect(mockBatch).not.toHaveBeenCalled();
    });

    it("rejects an invalid amount before resolving scope or opening a writer", async () => {
      const payment = createRecurringRecord();
      const validationError = new Error("INVALID_TRANSACTION_AMOUNT");
      mockAssertValidTransactionAmount.mockImplementation(() => {
        throw validationError;
      });

      await expect(
        submitRecurringPayment({
          payment: payment as never,
          accountId: "account-1",
          amount: 0,
        })
      ).rejects.toThrow(validationError);

      expect(mockGetCurrentUserDataScope).not.toHaveBeenCalled();
      expect(mockWrite).not.toHaveBeenCalled();
      expect(mockBatch).not.toHaveBeenCalled();
    });
  });

  it("pauses, resumes, and soft-deletes an owned recurring payment", async () => {
    const payment = createRecurringRecord();
    mockFindOwned.mockResolvedValue(payment);

    await pauseRecurringPayment("payment-1");
    expect(payment.status).toBe("PAUSED");

    await resumeRecurringPayment("payment-1");
    expect(payment.status).toBe("ACTIVE");

    await deleteRecurringPayment("payment-1");
    expect(payment.deleted).toBe(true);
  });
});
