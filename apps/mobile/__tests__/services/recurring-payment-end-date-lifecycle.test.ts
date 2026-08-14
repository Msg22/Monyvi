const mockWrite = jest.fn();
const mockGet = jest.fn();
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
  endDate?: Date;
  action: string;
  status: string;
  notes?: string;
  deleted: boolean;
  update: jest.Mock<Promise<void>, [(record: MockRecurringPayment) => void]>;
}

function createPayment(overrides: Partial<MockRecurringPayment> = {}): MockRecurringPayment {
  const payment: MockRecurringPayment = {
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
    update: jest.fn((builder: (record: MockRecurringPayment) => void) => {
      builder(payment);
      return Promise.resolve();
    }),
    ...overrides,
  };

  return payment;
}

jest.mock("@monyvi/db", () => ({
  database: {
    write: (...args: readonly unknown[]): Promise<unknown> => mockWrite(...args) as Promise<unknown>,
    get: (...args: readonly unknown[]): unknown => mockGet(...args),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: (): Promise<unknown> => mockGetCurrentUserDataScope() as Promise<unknown>,
}));

jest.mock("@/utils/dateHelpers", () => ({
  calculateNextDueDate: (): Date => new Date("2026-08-01T00:00:00.000Z"),
  isOnOrBeforeDay: (date: Date, boundary: Date): boolean => {
    const left = new Date(date);
    left.setHours(0, 0, 0, 0);
    const right = new Date(boundary);
    right.setHours(0, 0, 0, 0);
    return left.getTime() <= right.getTime();
  },
}));

import { updateRecurringPayment } from "@/services/recurring-payment-service";

describe("recurring payment End date lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWrite.mockImplementation(async (callback: () => Promise<unknown>) => callback());
    mockGet.mockReturnValue({});
    mockFindAccessibleCategory.mockResolvedValue({ id: "category-1", type: "EXPENSE" });
    mockGetCurrentUserDataScope.mockResolvedValue({
      userId: "user-1",
      findOwned: mockFindOwned,
      findAccessibleCategory: mockFindAccessibleCategory,
    });
  });

  async function update(payment: MockRecurringPayment, startDate: Date, endDate: Date | null): Promise<void> {
    mockFindOwned.mockImplementation((_collection: unknown, id: string): Promise<unknown> =>
      Promise.resolve(id === "account-1" ? { id, userId: "user-1", currency: "EGP" } : payment)
    );
    await updateRecurringPayment("payment-1", {
      name: "Netflix", amount: 250, currency: "EGP", type: "EXPENSE",
      accountId: "account-1", categoryId: "category-1", frequency: "MONTHLY",
      startDate, endDate, action: "NOTIFY",
    });
  }

  it("completes paused series with no eligible future occurrence", async () => {
    const payment = createPayment({ status: "PAUSED", nextDueDate: new Date("2026-08-01T00:00:00.000Z") });
    await update(payment, new Date("2026-06-01T00:00:00.000Z"), new Date("2026-07-01T00:00:00.000Z"));
    expect(payment.status).toBe("COMPLETED");
  });

  it("reactivates boundary-completed series after clearing End date and changing Due payment", async () => {
    const payment = createPayment({
      status: "COMPLETED", endDate: new Date("2026-07-01T00:00:00.000Z"),
      nextDueDate: new Date("2026-08-01T00:00:00.000Z"),
    });
    const duePayment = new Date("2026-06-15T00:00:00.000Z");
    await update(payment, duePayment, null);
    expect(payment.status).toBe("ACTIVE");
    expect(payment.nextDueDate).toEqual(duePayment);
  });
});
