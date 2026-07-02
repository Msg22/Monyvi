import React from "react";
import { Text } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import { AuthApiError } from "@supabase/supabase-js";
import { AuthProvider, useAuth } from "@/context/AuthContext";

const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignOut = jest.fn();
const mockClearPersistedAuthSession = jest.fn();
const mockUnsubscribe = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerInfo = jest.fn();

type AuthStateChangeCallback = (
  event: string,
  session: { readonly user: { readonly id: string } } | null
) => void;

jest.mock("@/services/supabase", () => ({
  clearPersistedAuthSession: (): Promise<void> =>
    mockClearPersistedAuthSession() as Promise<void>,
  supabase: {
    auth: {
      getSession: (...args: unknown[]): Promise<unknown> =>
        mockGetSession(...args) as Promise<unknown>,
      onAuthStateChange: (...args: unknown[]): unknown =>
        mockOnAuthStateChange(...args),
      signOut: (...args: unknown[]): Promise<unknown> =>
        mockSignOut(...args) as Promise<unknown>,
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
    mockClearPersistedAuthSession.mockResolvedValue(undefined);
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
});
