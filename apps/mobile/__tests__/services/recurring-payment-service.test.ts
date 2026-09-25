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
const mockSubmitGuardedRecurringPayment = jest.fn();

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

jest.mock("@/services/recurring-payment-financial-action-production", () => ({
  submitGuardedRecurringPayment: async (
    input: Readonly<Record<string, unknown>>
  ): Promise<void> => {
    await mockSubmitGuardedRecurringPayment(input);
  },
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

describe("recurring-payment-service", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(2026, 5, 1, 12, 0, 0));
    jest.clearAllMocks();
    mockWrite.mockImplementation(
      async (callback: () => Promise<unknown>): Promise<unknown> => callback()
    );
    mockBatch.mockResolvedValue(undefined);
    mockAdapterBatch.mockResolvedValue(undefined);
    mockAssertValidTransactionAmount.mockReturnValue(undefined);
    mockSubmitGuardedRecurringPayment.mockResolvedValue(undefined);
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

    it.each([-250, 0, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000_000.01])(
      "rejects invalid create amount %p before resolving scope or writing",
      async (amount) => {
        await expect(
          createRecurringPayment({ ...validCreateData, amount })
        ).rejects.toThrow(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT);

        expect(mockGetCurrentUserDataScope).not.toHaveBeenCalled();
        expect(mockWrite).not.toHaveBeenCalled();
      }
    );

    it("accepts the inclusive maximum and the two-, three-, and eight-decimal currency contract", async () => {
      await expect(
        createRecurringPayment({
          ...validCreateData,
          amount: 1_000_000_000,
        })
      ).resolves.toBeDefined();
      mockFindOwned.mockResolvedValueOnce({
        id: "account-1",
        userId: "user-1",
        currency: "KWD",
      });
      await expect(
        createRecurringPayment({
          ...validCreateData,
          amount: 12.345,
          currency: "KWD",
        })
      ).resolves.toBeDefined();
      mockFindOwned.mockResolvedValueOnce({
        id: "account-1",
        userId: "user-1",
        currency: "BTC",
      });
      await expect(
        createRecurringPayment({
          ...validCreateData,
          amount: 0.12345678,
          currency: "BTC",
        })
      ).resolves.toBeDefined();

      expect(mockWrite).toHaveBeenCalledTimes(3);
    });

    it("validates decimal precision against the resolved account currency", async () => {
      await expect(
        createRecurringPayment({
          ...validCreateData,
          amount: 12.345,
        })
      ).rejects.toThrow(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT);

      expect(mockGetCurrentUserDataScope).toHaveBeenCalledTimes(1);
      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("rejects a recurring currency that does not match the owned account", async () => {
      await expect(
        createRecurringPayment({
          ...validCreateData,
          amount: 12.345,
          currency: "KWD",
        })
      ).rejects.toThrow(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.CURRENCY_MISMATCH
      );

      expect(mockWrite).not.toHaveBeenCalled();
    });

    it.each([
      new Date(Number.NaN),
      new Date(2026, 4, 31, 23, 59, 59),
      new Date(2027, 5, 2, 0, 0, 0),
    ])(
      "rejects invalid or out-of-range create date %p before writing",
      async (startDate) => {
        await expect(
          createRecurringPayment({ ...validCreateData, startDate })
        ).rejects.toThrow(
          RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_START_DATE
        );

        expect(mockGetCurrentUserDataScope).not.toHaveBeenCalled();
        expect(mockWrite).not.toHaveBeenCalled();
      }
    );

    it("rejects an invalid End date before writing", async () => {
      await expect(
        createRecurringPayment({
          ...validCreateData,
          endDate: new Date(Number.NaN),
        })
      ).rejects.toThrow(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_END_DATE);

      expect(mockWrite).not.toHaveBeenCalled();
    });

    it("rejects an invalid update amount before resolving scope or writing", async () => {
      await expect(
        updateRecurringPayment("payment-1", {
          ...validCreateData,
          amount: -250,
        })
      ).rejects.toThrow(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT);

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

    it("rejects a stale expected Due payment instead of rewinding the schedule", async () => {
      const payment = createRecurringRecord({
        startDate: new Date("2026-06-01T08:00:00.000Z"),
        nextDueDate: new Date("2026-08-01T08:00:00.000Z"),
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
          startDate: new Date("2026-07-01T08:00:00.000Z"),
          expectedNextDueDate: new Date("2026-07-01T08:00:00.000Z"),
        })
      ).rejects.toThrow(RECURRING_PAYMENT_SERVICE_ERROR_CODES.STALE_SCHEDULE);

      expect(payment.nextDueDate).toEqual(new Date("2026-08-01T08:00:00.000Z"));
      expect(mockWrite).not.toHaveBeenCalled();
      expect(payment.update).not.toHaveBeenCalled();
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
      jest.setSystemTime(new Date(2026, 8, 4, 12));

      await expect(
        createRecurringPayment({
          name: "Ended historical payment",
          amount: 250,
          currency: "EGP",
          type: "EXPENSE",
          accountId: "account-1",
          categoryId: "category-1",
          frequency: "WEEKLY",
          startDate: new Date(2026, 7, 1, 8),
          endDate: new Date(2026, 8, 4, 23, 59, 59),
          initialOccurrenceRecorded: true,
          action: "NOTIFY",
        })
      ).rejects.toThrow(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_SCHEDULE);

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

  it("rejects an edited End date before the current Due payment", async () => {
    const payment = createRecurringRecord({
      nextDueDate: new Date("2026-08-01T00:00:00.000Z"),
    });
    mockFindOwned.mockImplementation(
      (_collection: MockCollection, id: string): Promise<unknown> =>
        id === "account-1"
          ? Promise.resolve({ id, userId: "user-1", currency: "EGP" })
          : Promise.resolve(payment)
    );

    await expect(
      updateRecurringPayment("payment-1", {
        name: "Netflix",
        amount: 250,
        currency: "EGP",
        type: "EXPENSE",
        accountId: "account-1",
        categoryId: "category-1",
        frequency: "MONTHLY",
        startDate: payment.startDate,
        endDate: new Date("2026-07-01T00:00:00.000Z"),
        action: "NOTIFY",
      })
    ).rejects.toThrow(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_SCHEDULE);

    expect(mockWrite).not.toHaveBeenCalled();
    expect(payment.status).toBe("ACTIVE");
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
      startDate: payment.startDate,
      endDate: null,
      action: "NOTIFY",
    });

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
    it("validates the amount and delegates Pay Now to the guarded command", async () => {

      const payment = createRecurringRecord();

      await submitRecurringPayment({
        payment: payment as never,
        accountId: "account-1",
        amount: 250,
        note: "July bill",
      });

      expect(mockAssertValidTransactionAmount).toHaveBeenCalledWith(250);
      expect(mockSubmitGuardedRecurringPayment).toHaveBeenCalledWith({
        accountId: "account-1",
        amount: 250,
        note: "July bill",
        paymentId: "payment-1",
      });
      expect(mockWrite).not.toHaveBeenCalled();
      expect(mockBatch).not.toHaveBeenCalled();
    });


    it("propagates guarded command failures", async () => {
      const payment = createRecurringRecord();
      const commandError = new Error("RECURRING_PAYMENT_UNAVAILABLE");
      mockSubmitGuardedRecurringPayment.mockRejectedValueOnce(commandError);

      await expect(
        submitRecurringPayment({
          payment: payment as never,
          accountId: "account-1",
          amount: 250,
        })
      ).rejects.toThrow(commandError);
    });

    it("rejects an invalid amount before invoking the guarded command", async () => {
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

      expect(mockSubmitGuardedRecurringPayment).not.toHaveBeenCalled();
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
