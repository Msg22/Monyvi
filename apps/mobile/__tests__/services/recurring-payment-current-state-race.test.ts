const mockWrite = jest.fn();
const mockGet = jest.fn((tableName: string) => ({ tableName }));
const mockFindOwned = jest.fn();
const mockFindAccessibleCategory = jest.fn();
const mockGetCurrentUserDataScope = jest.fn();

interface MockRecurringPayment {
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
  update: jest.Mock<Promise<void>, [(record: MockRecurringPayment) => void]>;
}

jest.mock("@monyvi/db", () => ({
  database: {
    write: (...args: readonly unknown[]): Promise<unknown> =>
      mockWrite(...args) as Promise<unknown>,
    get: (tableName: string): { readonly tableName: string } =>
      mockGet(tableName),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: (): Promise<unknown> =>
    mockGetCurrentUserDataScope() as Promise<unknown>,
}));

jest.mock("@/services/transaction-service", () => ({
  assertValidTransactionAmount: jest.fn(),
  prepareTransactionCreateWithBalance: jest.fn(),
}));

jest.mock("@/services/watermelon-cache-snapshot", () => ({
  captureCachedModelSnapshot: jest.fn(),
  restoreCachedModelSnapshot: jest.fn(),
}));

jest.mock("@/services/watermelon-atomic-batch", () => ({
  commitPreparedBatch: jest.fn(),
}));

import {
  RECURRING_PAYMENT_SERVICE_ERROR_CODES,
  updateRecurringPayment,
} from "@/services/recurring-payment-service";

describe("recurring-payment transaction-time state protection", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.setSystemTime(new Date(2026, 5, 1, 12, 0, 0));
  });

  it("rejects an edit when schedule state changes before the database writer even if nextDueDate is unchanged", async () => {
    const loadedStartDate = new Date(2026, 5, 1, 8, 0, 0);
    const loadedNextDueDate = new Date(2026, 6, 1, 8, 0, 0);
    const payment: MockRecurringPayment = {
      id: "payment-1",
      userId: "user-1",
      name: "Subscription",
      amount: 250,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "MONTHLY",
      startDate: loadedStartDate,
      nextDueDate: loadedNextDueDate,
      action: "NOTIFY",
      status: "ACTIVE",
      deleted: false,
      update: jest.fn((builder) => {
        builder(payment);
        return Promise.resolve();
      }),
    };

    mockFindOwned.mockImplementation(
      (collection: { readonly tableName: string }): Promise<unknown> => {
        if (collection.tableName === "recurring_payments") {
          return Promise.resolve(payment);
        }
        if (collection.tableName === "accounts") {
          return Promise.resolve({
            id: "account-1",
            userId: "user-1",
            currency: "EGP",
            deleted: false,
          });
        }
        return Promise.reject(new Error("unexpected collection"));
      }
    );
    mockFindAccessibleCategory.mockResolvedValue({
      id: "category-1",
      userId: null,
      type: "EXPENSE",
      deleted: false,
    });
    mockGetCurrentUserDataScope.mockResolvedValue({
      userId: "user-1",
      findOwned: mockFindOwned,
      findAccessibleCategory: mockFindAccessibleCategory,
    });
    mockWrite.mockImplementation(
      (callback: () => Promise<unknown>): Promise<unknown> => {
        payment.frequency = "WEEKLY";
        return callback();
      }
    );

    const updateData = {
      name: "Renamed subscription",
      amount: 250,
      currency: "EGP",
      type: "EXPENSE",
      accountId: "account-1",
      categoryId: "category-1",
      frequency: "MONTHLY",
      startDate: loadedNextDueDate,
      expectedNextDueDate: loadedNextDueDate,
      expectedState: {
        startDate: loadedStartDate,
        endDate: null,
        frequency: "MONTHLY",
        status: "ACTIVE",
      },
      action: "NOTIFY",
    } as unknown as Parameters<typeof updateRecurringPayment>[1];

    await expect(
      updateRecurringPayment("payment-1", updateData)
    ).rejects.toThrow(RECURRING_PAYMENT_SERVICE_ERROR_CODES.STALE_SCHEDULE);

    expect(payment.frequency).toBe("WEEKLY");
    expect(payment.update).not.toHaveBeenCalled();
  });
});
