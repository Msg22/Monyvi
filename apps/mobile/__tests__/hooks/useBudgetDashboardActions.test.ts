import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockResumeBudget = jest.fn<Promise<void>, [string]>();
const mockLoggerError = jest.fn();

jest.mock("@/services/budget-service", () => ({
  resumeBudget: (budgetId: string): Promise<void> => mockResumeBudget(budgetId),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

import { useBudgetDashboardActions } from "@/hooks/useBudgetDashboardActions";

describe("useBudgetDashboardActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResumeBudget.mockResolvedValue();
  });

  it("submits Resume once while a command is in flight", async () => {
    let resolveResume: () => void = () => undefined;
    mockResumeBudget.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveResume = resolve;
      })
    );
    const { result } = renderHook(() => useBudgetDashboardActions());

    let first: Promise<"resumed" | "ignored" | "failed"> | undefined;
    let second: Promise<"resumed" | "ignored" | "failed"> | undefined;
    act(() => {
      first = result.current.confirmResume("budget-1");
      second = result.current.confirmResume("budget-1");
    });

    expect(mockResumeBudget).toHaveBeenCalledTimes(1);
    expect(result.current.isSubmitting).toBe(true);
    await expect(second).resolves.toBe("ignored");
    resolveResume();
    await act(async () => {
      await expect(first).resolves.toBe("resumed");
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  it("retains friendly failure state and permits retry", async () => {
    mockResumeBudget.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useBudgetDashboardActions());

    await act(async () => {
      await result.current.confirmResume("budget-1");
    });

    expect(result.current.errorKey).toBe("dashboard_action_error");
    expect(result.current.isSubmitting).toBe(false);

    await act(async () => {
      await result.current.confirmResume("budget-1");
    });
    expect(mockResumeBudget).toHaveBeenCalledTimes(2);
    expect(result.current.errorKey).toBeNull();
  });

  it("clears a dismissed error", async () => {
    mockResumeBudget.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useBudgetDashboardActions());
    await act(async () => {
      await result.current.confirmResume("budget-1");
    });

    act(() => {
      result.current.resetError();
    });
    expect(result.current.errorKey).toBeNull();
  });

  it("does not update state after unmount", async () => {
    let resolveResume: () => void = () => undefined;
    mockResumeBudget.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveResume = resolve;
      })
    );
    const { result, unmount } = renderHook(() => useBudgetDashboardActions());
    let request: Promise<"resumed" | "ignored" | "failed"> | undefined;
    act(() => {
      request = result.current.confirmResume("budget-1");
    });
    unmount();
    resolveResume();

    await expect(request).resolves.toBe("resumed");
    await waitFor(() => {
      expect(mockResumeBudget).toHaveBeenCalledTimes(1);
    });
  });
});
