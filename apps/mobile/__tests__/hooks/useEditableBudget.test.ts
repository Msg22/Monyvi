import { renderHook, waitFor } from "@testing-library/react-native";
import type { Budget } from "@monyvi/db";

const mockGetBudgetById = jest.fn<Promise<unknown>, [string]>();
const mockGetRenewableBudgetById = jest.fn<Promise<unknown>, [string]>();
const mockLoggerError = jest.fn();

jest.mock("@/services/budget-service", () => {
  const BUDGET_SERVICE_ERROR_CODES = {
    NOT_FOUND: "BUDGET_NOT_FOUND",
  } as const;

  class BudgetServiceError extends Error {
    constructor(mockCode: string) {
      super(mockCode);
      this.name = "BudgetServiceError";
      this.code = mockCode;
    }

    readonly code: string;
  }

  return {
    BUDGET_SERVICE_ERROR_CODES,
    BudgetServiceError,
    getBudgetById: async (budgetId: string): Promise<Budget> =>
      (await mockGetBudgetById(budgetId)) as Budget,
    getRenewableBudgetById: async (budgetId: string): Promise<Budget> =>
      (await mockGetRenewableBudgetById(budgetId)) as Budget,
  };
});

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

import {
  BUDGET_SERVICE_ERROR_CODES,
  BudgetServiceError,
} from "@/services/budget-service";
import { useEditableBudget } from "@/hooks/useEditableBudget";

describe("useEditableBudget", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads the requested budget for edit mode", async () => {
    const budget = { id: "budget-1" };
    mockGetBudgetById.mockResolvedValue(budget);

    const { result } = renderHook(() => useEditableBudget("budget-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.budget).toBe(budget);
    expect(result.current.loadErrorKey).toBeNull();
  });

  it("uses the renewal-specific lookup for renewal sources", async () => {
    const budget = { id: "expired-1" };
    mockGetRenewableBudgetById.mockResolvedValue(budget);

    const { result } = renderHook(() =>
      useEditableBudget("expired-1", "RENEWAL")
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetRenewableBudgetById).toHaveBeenCalledWith("expired-1");
    expect(mockGetBudgetById).not.toHaveBeenCalled();
    expect(result.current.budget).toBe(budget);
  });

  it("surfaces a typed missing budget error instead of falling back to create mode", async () => {
    mockGetBudgetById.mockRejectedValue(
      new BudgetServiceError(BUDGET_SERVICE_ERROR_CODES.NOT_FOUND)
    );

    const { result } = renderHook(() => useEditableBudget("missing-budget"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.budget).toBeUndefined();
    expect(result.current.loadErrorKey).toBe("budget_not_found");
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("logs unexpected load failures and surfaces a generic error", async () => {
    const error = new Error("database unavailable");
    mockGetBudgetById.mockRejectedValue(error);

    const { result } = renderHook(() => useEditableBudget("budget-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.budget).toBeUndefined();
    expect(result.current.loadErrorKey).toBe("load_budget_error");
    expect(mockLoggerError).toHaveBeenCalledWith(
      "editableBudget.load.failed",
      error
    );
  });
});
