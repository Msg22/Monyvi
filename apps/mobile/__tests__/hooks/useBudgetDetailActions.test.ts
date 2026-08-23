import { act, renderHook } from "@testing-library/react-native";

const mockPauseBudget = jest.fn<Promise<void>, [string]>();
const mockResumeBudget = jest.fn<Promise<void>, [string]>();
const mockDeleteBudget = jest.fn<Promise<void>, [string]>();
const mockLoggerError = jest.fn();

jest.mock("../../services/budget-service", () => ({
  pauseBudget: (budgetId: string): Promise<void> => mockPauseBudget(budgetId),
  resumeBudget: (budgetId: string): Promise<void> => mockResumeBudget(budgetId),
  deleteBudget: (budgetId: string): Promise<void> => mockDeleteBudget(budgetId),
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

import { useBudgetDetailActions } from "../../hooks/useBudgetDetailActions";

function createDeferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
} {
  let resolvePromise: (() => void) | undefined;
  let rejectPromise: ((error: unknown) => void) | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (): void => resolvePromise?.(),
    reject: (error: unknown): void => rejectPromise?.(error),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPauseBudget.mockResolvedValue(undefined);
  mockResumeBudget.mockResolvedValue(undefined);
  mockDeleteBudget.mockResolvedValue(undefined);
});

describe("useBudgetDetailActions", () => {
  it.each([
    ["pause", mockPauseBudget],
    ["resume", mockResumeBudget],
    ["delete", mockDeleteBudget],
  ] as const)("delegates %s to the current-user-scoped command service", async (action, command) => {
    const { result } = renderHook(() => useBudgetDetailActions());

    await act(async () => {
      await expect(result.current.execute(action, "budget-1")).resolves.toEqual({
        status: "success",
        action,
      });
    });

    expect(command).toHaveBeenCalledWith("budget-1");
    expect(result.current.pendingAction).toBeNull();
    expect(result.current.errorKey).toBeNull();
  });

  it("rejects a duplicate action while a command is pending", async () => {
    const deferred = createDeferred();
    mockPauseBudget.mockReturnValueOnce(deferred.promise);
    const { result } = renderHook(() => useBudgetDetailActions());

    let firstResult: Promise<unknown> | undefined;
    act(() => {
      firstResult = result.current.execute("pause", "budget-1");
    });

    expect(result.current.pendingAction).toBe("pause");

    await act(async () => {
      await expect(result.current.execute("pause", "budget-1")).resolves.toEqual({
        status: "ignored",
        action: "pause",
      });
    });
    expect(mockPauseBudget).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve();
      await firstResult;
    });
  });

  it("returns a stable translated error key and logs structured context", async () => {
    const failure = new Error("raw database failure");
    mockResumeBudget.mockRejectedValueOnce(failure);
    const { result } = renderHook(() => useBudgetDetailActions());

    await act(async () => {
      await expect(result.current.execute("resume", "budget-9")).resolves.toEqual({
        status: "error",
        action: "resume",
        errorKey: "detail.actions.resume_error",
      });
    });

    expect(result.current.errorKey).toBe("detail.actions.resume_error");
    expect(mockLoggerError).toHaveBeenCalledWith(
      "budgetDetail.action.failed",
      failure,
      { action: "resume", budgetId: "budget-9" }
    );
  });

  it("clears a prior error before starting a retry", async () => {
    mockDeleteBudget.mockRejectedValueOnce(new Error("failure"));
    const deferred = createDeferred();
    mockDeleteBudget.mockReturnValueOnce(deferred.promise);
    const { result } = renderHook(() => useBudgetDetailActions());

    await act(async () => {
      await result.current.execute("delete", "budget-1");
    });
    expect(result.current.errorKey).toBe("detail.actions.delete_error");

    act(() => {
      void result.current.execute("delete", "budget-1");
    });
    expect(result.current.errorKey).toBeNull();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });
  });

  it("does not publish completion state after unmount", async () => {
    const deferred = createDeferred();
    mockPauseBudget.mockReturnValueOnce(deferred.promise);
    const { result, unmount } = renderHook(() => useBudgetDetailActions());

    act(() => {
      void result.current.execute("pause", "budget-1");
    });
    unmount();

    deferred.resolve();
    await expect(deferred.promise).resolves.toBeUndefined();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});
