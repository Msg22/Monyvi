import { act, renderHook, waitFor } from "@testing-library/react-native";

const mockDatabase = { id: "database" };
const mockPerformLogout = jest.fn();
const mockLoggerError = jest.fn();
const mockClearBudgetDashboardFilterSession = jest.fn();

jest.mock("@/providers/DatabaseProvider", () => ({
  useDatabase: (): unknown => mockDatabase,
}));

jest.mock("@/services/logout-service", () => ({
  performLogout: (...args: readonly unknown[]): unknown =>
    mockPerformLogout(...args),
}));

jest.mock("@/hooks/budget-dashboard-filter-session", () => ({
  clearBudgetDashboardFilterSession: (): void => {
    mockClearBudgetDashboardFilterSession();
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: readonly unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

import { useLogoutFlow } from "@/hooks/useLogoutFlow";

describe("useLogoutFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("performs regular logout and calls success callback", async () => {
    const onSuccess = jest.fn();
    mockPerformLogout.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useLogoutFlow({ onSuccess }));

    await act(async () => {
      await result.current.requestLogout();
    });

    expect(mockPerformLogout).toHaveBeenCalledWith(mockDatabase);
    expect(mockClearBudgetDashboardFilterSession).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.isLoggingOut).toBe(false);
  });

  it("shows sync warning when regular logout cannot finish sync", async () => {
    mockPerformLogout.mockResolvedValue({
      success: false,
      error: "sync_failed",
    });

    const { result } = renderHook(() => useLogoutFlow());

    await act(async () => {
      await result.current.requestLogout();
    });

    expect(result.current.showSyncWarning).toBe(true);
    expect(result.current.isLoggingOut).toBe(false);
  });

  it("delegates no-network and unknown logout failures to configured callbacks", async () => {
    const onNoNetwork = jest.fn();
    const onUnknownError = jest.fn();
    mockPerformLogout
      .mockResolvedValueOnce({ success: false, error: "no_network" })
      .mockResolvedValueOnce({ success: false, error: "unknown" });

    const { result } = renderHook(() =>
      useLogoutFlow({ onNoNetwork, onUnknownError })
    );

    await act(async () => {
      await result.current.requestLogout();
    });
    await act(async () => {
      await result.current.requestLogout();
    });

    expect(onNoNetwork).toHaveBeenCalledTimes(1);
    expect(onUnknownError).toHaveBeenCalledTimes(1);
  });

  it("performs force logout, clears sync warning, and calls success callback", async () => {
    const onSuccess = jest.fn();
    mockPerformLogout.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useLogoutFlow({ onSuccess }));

    act(() => {
      result.current.showSyncWarningModal();
    });
    await waitFor(() => {
      expect(result.current.showSyncWarning).toBe(true);
    });

    await act(async () => {
      await result.current.forceLogout();
    });

    expect(mockPerformLogout).toHaveBeenCalledWith(mockDatabase, true);
    expect(mockClearBudgetDashboardFilterSession).toHaveBeenCalledTimes(1);
    expect(result.current.showSyncWarning).toBe(false);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("exposes a force-logout error state when forced logout fails", async () => {
    mockPerformLogout.mockResolvedValue({ success: false, error: "unknown" });

    const { result } = renderHook(() => useLogoutFlow());

    await act(async () => {
      await result.current.forceLogout();
    });

    expect(result.current.showForceLogoutError).toBe(true);
    expect(mockClearBudgetDashboardFilterSession).not.toHaveBeenCalled();
    expect(result.current.isLoggingOut).toBe(false);
  });

  it("logs unexpected thrown errors and delegates unknown failure callback", async () => {
    const onUnknownError = jest.fn();
    const error = new Error("logout exploded");
    mockPerformLogout.mockRejectedValue(error);

    const { result } = renderHook(() => useLogoutFlow({ onUnknownError }));

    await act(async () => {
      await result.current.requestLogout();
    });

    expect(mockLoggerError).toHaveBeenCalledWith(
      "logout.request.failed",
      error
    );
    expect(onUnknownError).toHaveBeenCalledTimes(1);
  });
});
