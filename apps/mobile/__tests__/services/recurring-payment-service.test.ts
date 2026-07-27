const mockWrite = jest.fn();
const mockGet = jest.fn();
const mockCreateRecurringPayment = jest.fn();
const mockFindOwned = jest.fn();
const mockFindAccessibleCategory = jest.fn();
const mockGetCurrentUserDataScope = jest.fn();
const mockBatch = jest.fn();
const mockAssertValidTransactionAmount = jest.fn();
const mockPrepareTransactionCreateWithBalance = jest.fn();
const mockRestoreCachedAccount = jest.fn();
const mockWasTransactionPersisted = jest.fn();

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

describe("recurring-payment-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWrite.mockImplementation(
      async (callback: () => Promise<unknown>): Promise<unknown> => callback()
    );
    mockBatch.mockResolvedValue(undefined);
    mockAssertValidTransactionAmount.mockReturnValue(undefined);
    mockWasTransactionPersisted.mockResolvedValue(false);
    mockPrepareTransactionCreateWithBalance.mockResolvedValue({
      transaction: { id: "transaction-1" },
      operations: [{ id: "transaction-1" }, { id: "account-1" }],
      restoreCachedAccount: mockRestoreCachedAccount,
      wasTransactionPersisted: mockWasTransactionPersisted,
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

  it("persists the frequency-aware next due date when creating a recurring payment", async () => {
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
      nextDueDate: new Date("2026-06-08T00:00:00.000Z"),
    });
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
        startDate: new Date("2026-01-01T00:00:00.000Z"),
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
        startDate: new Date("2026-01-01T00:00:00.000Z"),
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
        startDate: new Date("2026-01-01T00:00:00.000Z"),
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

  it("recomputes next due date with the selected frequency when the start date changes", async () => {
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

    expect(payment.nextDueDate).toEqual(new Date("2026-06-22T00:00:00.000Z"));
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

    it("propagates an atomic batch failure without falling back to separate writes", async () => {
      const payment = createRecurringRecord();
      const batchError = new Error("atomic batch failed");
      mockFindOwned.mockResolvedValue(payment);
      mockBatch.mockRejectedValue(batchError);

      await expect(
        submitRecurringPayment({
          payment: payment as never,
          accountId: "account-1",
          amount: 250,
        })
      ).rejects.toThrow(batchError);

      expect(mockWrite).toHaveBeenCalledTimes(1);
      expect(mockBatch).toHaveBeenCalledTimes(1);
      expect(mockRestoreCachedAccount).toHaveBeenCalledTimes(1);
    });

    it("does not rewind or reject when a notification fails after the transaction commits", async () => {
      const payment = createRecurringRecord();
      const notificationError = new Error("observer failed after commit");
      mockFindOwned.mockResolvedValue(payment);
      mockBatch.mockRejectedValue(notificationError);
      mockWasTransactionPersisted.mockResolvedValue(true);

      await expect(
        submitRecurringPayment({
          payment: payment as never,
          accountId: "account-1",
          amount: 250,
        })
      ).resolves.toBeUndefined();

      expect(mockWasTransactionPersisted).toHaveBeenCalledTimes(1);
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
