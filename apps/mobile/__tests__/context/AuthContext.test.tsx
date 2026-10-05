import React from "react";
import { Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import { AuthApiError } from "@supabase/supabase-js";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import {
  DEFAULT_BUDGET_DASHBOARD_FILTERS,
  clearBudgetDashboardFilterSession,
  readBudgetDashboardFilterSession,
  writeBudgetDashboardFilterSession,
} from "@/hooks/budget-dashboard-filter-session";

type TestAuthSession = {
  readonly user: { readonly id: string };
};

type AuthSessionReadResult = {
  readonly data: { readonly session: TestAuthSession | null };
  readonly error?: unknown;
};

type AuthSubscriptionResult = {
  readonly data: {
    readonly subscription: {
      readonly unsubscribe: () => void;
    };
  };
};

type AuthStateChangeCallback = (
  event: string,
  session: TestAuthSession | null
) => void;

const mockGetSession = jest.fn<Promise<AuthSessionReadResult>, []>();
const mockOnAuthStateChange = jest.fn<
  AuthSubscriptionResult,
  [AuthStateChangeCallback]
>();
const mockSignOut = jest.fn<Promise<unknown>, []>();
const mockGetStableAuthSession = jest.fn<Promise<AuthSessionReadResult>, []>();
const mockSubscribeToCoordinatedAuthStateChange = jest.fn<
  AuthSubscriptionResult,
  [AuthStateChangeCallback]
>();
const mockClearPersistedAuthSession = jest.fn<Promise<void>, []>();
const mockUnsubscribe = jest.fn<void, []>();
const mockLoggerError = jest.fn<void, unknown[]>();
const mockLoggerInfo = jest.fn<void, unknown[]>();

jest.mock("@/services/supabase", () => ({
  getStableAuthSession: (): Promise<AuthSessionReadResult> =>
    mockGetStableAuthSession(),
  subscribeToCoordinatedAuthStateChange: (
    callback: AuthStateChangeCallback
  ): AuthSubscriptionResult => mockSubscribeToCoordinatedAuthStateChange(callback),
  clearPersistedAuthSession: (): Promise<void> =>
    mockClearPersistedAuthSession(),
  supabase: {
    auth: {
      getSession: (): Promise<AuthSessionReadResult> => mockGetSession(),
      onAuthStateChange: (
        callback: AuthStateChangeCallback
      ): AuthSubscriptionResult => mockOnAuthStateChange(callback),
      signOut: (): Promise<unknown> => mockSignOut(),
    },
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (...args: unknown[]): void => {
      mockLoggerError(...args);
    },
    info: (...args: unknown[]): void => {
      mockLoggerInfo(...args);
    },
  },
}));

function AuthProbe(): React.JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Text testID="auth-state">
      {isLoading ? "loading" : isAuthenticated ? "authenticated" : "anonymous"}
    </Text>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    clearBudgetDashboardFilterSession();
    mockClearPersistedAuthSession.mockResolvedValue(undefined);
    mockGetStableAuthSession.mockImplementation(
      (): Promise<AuthSessionReadResult> => mockGetSession()
    );
    mockSubscribeToCoordinatedAuthStateChange.mockImplementation(
      (callback: AuthStateChangeCallback): AuthSubscriptionResult =>
        mockOnAuthStateChange(callback)
    );
    mockOnAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: mockUnsubscribe,
        },
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("boots from the stable coordinated snapshot instead of a provisional raw SDK session", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: "user-u" },
        },
      },
      error: null,
    });
    mockGetStableAuthSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("anonymous")).toBeTruthy();
    });

    expect(mockGetStableAuthSession).toHaveBeenCalledTimes(1);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("suppresses provisional raw listener A and publishes only later coordinated B", async () => {
    let rawCallback: AuthStateChangeCallback | null = null;
    let coordinatedCallback: AuthStateChangeCallback | null = null;
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockGetStableAuthSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockOnAuthStateChange.mockImplementation(
      (callback: AuthStateChangeCallback): AuthSubscriptionResult => {
        rawCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: mockUnsubscribe,
            },
          },
        };
      }
    );
    mockSubscribeToCoordinatedAuthStateChange.mockImplementation(
      (callback: AuthStateChangeCallback): AuthSubscriptionResult => {
        coordinatedCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: mockUnsubscribe,
            },
          },
        };
      }
    );

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("anonymous")).toBeTruthy();
    });

    act(() => {
      rawCallback?.("SIGNED_IN", {
        user: { id: "user-u" },
      });
    });
    expect(screen.getByText("anonymous")).toBeTruthy();

    act(() => {
      coordinatedCallback?.("SIGNED_IN", {
        user: { id: "user-u" },
      });
    });
    await waitFor(() => {
      expect(screen.getByText("authenticated")).toBeTruthy();
    });

    expect(mockOnAuthStateChange).not.toHaveBeenCalled();
    expect(mockSubscribeToCoordinatedAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("does not call Supabase auth methods from inside the coordinated listener callback", async () => {
    let coordinatedCallback: AuthStateChangeCallback | null = null;
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockGetStableAuthSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockSubscribeToCoordinatedAuthStateChange.mockImplementation(
      (callback: AuthStateChangeCallback): AuthSubscriptionResult => {
        coordinatedCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: mockUnsubscribe,
            },
          },
        };
      }
    );

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("anonymous")).toBeTruthy();
    });

    const stableReadsBefore = mockGetStableAuthSession.mock.calls.length;
    act(() => {
      coordinatedCallback?.("SIGNED_IN", {
        user: { id: "user-u" },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("authenticated")).toBeTruthy();
    });
    expect(mockGetStableAuthSession).toHaveBeenCalledTimes(stableReadsBefore);
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("releases auth loading when session bootstrap hangs", async () => {
    mockGetSession.mockReturnValue(new Promise(() => {}));

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    expect(screen.getByText("loading")).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });

    await waitFor(() => {
      expect(screen.getByText("anonymous")).toBeTruthy();
    });
  });

  it("applies the bootstrapped session when it resolves before timeout", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "user-1",
          },
        },
      },
    });

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("authenticated")).toBeTruthy();
    });
  });

  it("clears stale local auth when Supabase rejects the stored refresh token", async () => {
    mockGetSession.mockRejectedValue(
      new Error("Invalid Refresh Token: Refresh Token Not Found")
    );

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("anonymous")).toBeTruthy();
    });

    expect(mockClearPersistedAuthSession).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "auth.bootstrap.staleSessionCleared",
      {
        reason: "Invalid Refresh Token: Refresh Token Not Found",
      }
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("clears stale local auth when Supabase returns a refresh token error", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: null,
      },
      error: new Error("Invalid Refresh Token: Refresh Token Not Found"),
    });

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("anonymous")).toBeTruthy();
    });

    expect(mockClearPersistedAuthSession).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "auth.bootstrap.staleSessionCleared",
      {
        reason: "Invalid Refresh Token: Refresh Token Not Found",
      }
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("clears stale local auth when Supabase returns a refresh token error code", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: null,
      },
      error: new AuthApiError(
        "Token is no longer valid",
        400,
        "refresh_token_not_found"
      ),
    });

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("anonymous")).toBeTruthy();
    });

    expect(mockClearPersistedAuthSession).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "auth.bootstrap.staleSessionCleared",
      {
        reason: "Token is no longer valid",
      }
    );
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it("applies auth listener changes after bootstrap", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: null,
      },
    });
    let authCallback: AuthStateChangeCallback | null = null;
    mockOnAuthStateChange.mockImplementationOnce(
      (callback: AuthStateChangeCallback) => {
        authCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: mockUnsubscribe,
            },
          },
        };
      }
    );

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("anonymous")).toBeTruthy();
    });

    act(() => {
      authCallback?.("SIGNED_IN", {
        user: {
          id: "user-1",
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("authenticated")).toBeTruthy();
    });
  });

  it("clears budget dashboard filters when the auth listener signs out", async () => {
    writeBudgetDashboardFilterSession("user-1", {
      scope: "GLOBAL",
      period: "CUSTOM",
      status: "EXPIRED",
    });
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "user-1",
          },
        },
      },
    });
    let authCallback: AuthStateChangeCallback | null = null;
    mockOnAuthStateChange.mockImplementationOnce(
      (callback: AuthStateChangeCallback) => {
        authCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: mockUnsubscribe,
            },
          },
        };
      }
    );

    const screen = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("authenticated")).toBeTruthy();
    });

    act(() => {
      authCallback?.("SIGNED_OUT", null);
    });

    expect(readBudgetDashboardFilterSession("user-1")).toBe(
      DEFAULT_BUDGET_DASHBOARD_FILTERS
    );
    await waitFor(() => {
      expect(screen.getByText("anonymous")).toBeTruthy();
    });
  });
});
