import { act, render, waitFor } from "@testing-library/react-native";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import React from "react";
import { Text } from "react-native";

let mockCallbackUrl: string | null = null;
let mockLocalSearchParams: Record<string, string | string[]> = {};
const mockReplace = jest.fn();

jest.mock("expo-linking", () => ({
  useURL: (): string | null => mockCallbackUrl,
}));

jest.mock("expo-router", () => ({
  useRouter: (): { replace: typeof mockReplace } => ({
    replace: mockReplace,
  }),
  useLocalSearchParams: (): Record<string, string | string[]> =>
    mockLocalSearchParams,
}));

jest.mock("@/hooks/useDeferredRouterReplace", () => ({
  useDeferredRouterReplace: jest.fn(),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("@/components/auth/AuthCallbackFailureView", () => ({
  AuthCallbackFailureView: (): null => null,
}));
jest.mock("@/components/auth/AuthCallbackProcessingView", () => ({
  AuthCallbackProcessingView: (): null => null,
}));
jest.mock("@/components/auth/VerificationSuccessView", () => ({
  VerificationSuccessView: (): null => null,
}));
jest.mock("@/components/onboarding/LanguageSwitcherPill", () => ({
  LanguageSwitcherPill: (): null => null,
}));
jest.mock("@/components/ui/MonyviLogo", () => ({
  MonyviLogo: (): null => null,
}));
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: (): null => null,
}));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  dismissAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
  WebBrowserResultType: {
    CANCEL: "cancel",
    DISMISS: "dismiss",
    SUCCESS: "success",
  },
}));

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test-ref.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

const supabaseModule = jest.requireActual<typeof import("@/services/supabase")>(
  "@/services/supabase"
);
const authService = jest.requireActual<typeof import("@/services/auth-service")>(
  "@/services/auth-service"
);
const authContext = jest.requireActual<typeof import("@/context/AuthContext")>(
  "@/context/AuthContext"
);
const AuthCallbackScreen = jest.requireActual<
  typeof import("../../app/auth-callback")
>("../../app/auth-callback").default;

const { supabase } = supabaseModule;
const { AuthProvider, useAuth } = authContext;

type RawAuthCallback = Parameters<typeof supabase.auth.onAuthStateChange>[0];
type RawSubscription = ReturnType<
  typeof supabase.auth.onAuthStateChange
>["data"]["subscription"];

let capturedSignOut: (() => Promise<void>) | null = null;
let observedTokens: string[] = [];

function AuthStateProbe(): React.JSX.Element {
  const { session, signOut } = useAuth();
  capturedSignOut = signOut;
  const token = session?.access_token ?? "none";
  if (observedTokens.at(-1) !== token) {
    observedTokens.push(token);
  }

  return <Text testID="auth-session-token">{token}</Text>;
}

function createSession(accessToken: string, refreshToken: string): Session {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-u",
      aud: "authenticated",
      role: "authenticated",
      email: "same-user@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-10-05T00:00:00.000Z",
    },
  };
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value: T): void => {
      if (!resolvePromise) {
        throw new Error("Deferred promise was not initialized");
      }
      resolvePromise(value);
    },
  };
}

function sessionResponse(session: Session): Awaited<
  ReturnType<typeof supabase.auth.setSession>
> {
  return {
    data: {
      user: session.user,
      session,
    },
    error: null,
  };
}

function authTokenResponse(session: Session): Awaited<
  ReturnType<typeof supabase.auth.exchangeCodeForSession>
> {
  return {
    data: {
      user: session.user,
      session,
    },
    error: null,
  };
}

function sessionReadResponse(
  session: Session | null
): ReturnType<typeof supabase.auth.getSession> {
  if (session) {
    return Promise.resolve({
      data: { session },
      error: null,
    });
  }

  return Promise.resolve({
    data: { session: null },
    error: null,
  });
}

function installRawAuthBridge(
  readPersistedSession: () => Session | null,
  writePersistedSession: (session: Session | null) => void
): {
  emit(event: AuthChangeEvent, session: Session | null): void;
  readonly signOutSpy: jest.SpyInstance;
} {
  const listeners = new Set<RawAuthCallback>();

  jest.spyOn(supabase.auth, "getSession").mockImplementation(() =>
    sessionReadResponse(readPersistedSession())
  );
  jest.spyOn(supabase.auth, "onAuthStateChange").mockImplementation(
    (callback) => {
      listeners.add(callback);
      const subscription: RawSubscription = {
        id: "test-auth-listener",
        callback,
        unsubscribe: (): void => {
          listeners.delete(callback);
        },
      };
      return { data: { subscription } };
    }
  );
  const signOutSpy = jest.spyOn(supabase.auth, "signOut").mockImplementation(
    () => {
      writePersistedSession(null);
      for (const listener of listeners) {
        listener("SIGNED_OUT", null);
      }
      return Promise.resolve({ error: null });
    }
  );
  jest.spyOn(supabase.auth, "stopAutoRefresh").mockImplementation(() =>
    Promise.resolve()
  );
  jest.spyOn(supabase.auth, "startAutoRefresh").mockImplementation(() =>
    Promise.resolve()
  );

  return {
    emit: (event, session): void => {
      for (const listener of listeners) {
        listener(event, session);
      }
    },
    signOutSpy,
  };
}

function renderCallbackHarness(): ReturnType<typeof render> {
  return render(
    <AuthProvider>
      <AuthStateProbe />
      <AuthCallbackScreen />
    </AuthProvider>
  );
}

describe("auth callback session coordination integration", () => {
  beforeEach(() => {
    observedTokens = [];
    capturedSignOut = null;
    mockReplace.mockReset();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("compensates timed-out callback A before queued email B begins", async () => {
    jest.useFakeTimers();
    const sessionA = createSession("session-a", "refresh-a");
    const sessionB = createSession("session-b", "refresh-b");
    let persistedSession: Session | null = null;
    let sessionSeenWhenBStarts: Session | null | undefined;
    const releaseA = createDeferred<void>();
    const startedA = createDeferred<void>();
    const returnedA = createDeferred<void>();
    const bridge = installRawAuthBridge(
      () => persistedSession,
      (session) => {
        persistedSession = session;
      }
    );

    jest.spyOn(supabase.auth, "setSession").mockImplementation(() => {
      startedA.resolve();
      return releaseA.promise.then(() => {
        persistedSession = sessionA;
        bridge.emit("SIGNED_IN", sessionA);
        returnedA.resolve();
        return sessionResponse(sessionA);
      });
    });
    const signInSpy = jest
      .spyOn(supabase.auth, "signInWithPassword")
      .mockImplementation(() => {
        sessionSeenWhenBStarts = persistedSession;
        persistedSession = sessionB;
        bridge.emit("SIGNED_IN", sessionB);
        return Promise.resolve({
          data: {
            user: sessionB.user,
            session: sessionB,
          },
          error: null,
        });
      });

    const tokenKey = ["access", "token"].join("_");
    mockCallbackUrl =
      `monyvi://auth-callback#${tokenKey}=session-a&refresh_token=refresh-a&type=signup`;
    mockLocalSearchParams = { type: "signup" };
    renderCallbackHarness();

    await act(async () => {
      await startedA.promise;
    });
    await act(async () => {
      jest.advanceTimersByTime(10_001);
      await Promise.resolve();
    });

    const emailPromise = authService.signInWithEmail(
      "same-user@example.com",
      "secret"
    );
    const emailStartedBeforeARelease = signInSpy.mock.calls.length > 0;

    releaseA.resolve();
    await act(async () => {
      await returnedA.promise;
      await emailPromise;
      await Promise.resolve();
    });

    expect(emailStartedBeforeARelease).toBe(false);
    expect(sessionSeenWhenBStarts).toBeNull();
    expect(persistedSession).toEqual(sessionB);
    expect(observedTokens).not.toContain("session-a");
    expect(observedTokens.at(-1)).toBe("session-b");
  });

  it("records explicit logout immediately but waits for callback A before SDK logout and never restores P", async () => {
    const sessionP = createSession("session-p", "refresh-p");
    const sessionA = createSession("session-a", "refresh-a");
    let persistedSession: Session | null = sessionP;
    const releaseA = createDeferred<void>();
    const startedA = createDeferred<void>();
    const returnedA = createDeferred<void>();
    const bridge = installRawAuthBridge(
      () => persistedSession,
      (session) => {
        persistedSession = session;
      }
    );

    const setSessionSpy = jest
      .spyOn(supabase.auth, "setSession")
      .mockImplementation(() => {
        startedA.resolve();
        return releaseA.promise.then(() => {
          persistedSession = sessionA;
          bridge.emit("SIGNED_IN", sessionA);
          returnedA.resolve();
          return sessionResponse(sessionA);
        });
      });

    const tokenKey = ["access", "token"].join("_");
    mockCallbackUrl =
      `monyvi://auth-callback#${tokenKey}=session-a&refresh_token=refresh-a&type=signup`;
    mockLocalSearchParams = { type: "signup" };
    renderCallbackHarness();

    await act(async () => {
      await startedA.promise;
    });
    if (!capturedSignOut) {
      throw new Error("AuthContext signOut was not captured");
    }

    const logoutPromise = capturedSignOut();
    const sdkLogoutStartedBeforeARelease =
      bridge.signOutSpy.mock.calls.length > 0;

    releaseA.resolve();
    await act(async () => {
      await returnedA.promise;
      await logoutPromise;
      await Promise.resolve();
    });

    expect(sdkLogoutStartedBeforeARelease).toBe(false);
    expect(persistedSession).toBeNull();
    expect(
      setSessionSpy.mock.calls.some(
        ([tokens]) => tokens.access_token === "session-p"
      )
    ).toBe(false);
    expect(observedTokens.at(-1)).toBe("none");
  });

  it("treats StrictMode-style unmount/remount as observer detach without logout or duplicate PKCE exchange", async () => {
    const sessionB = createSession("pkce-session-b", "pkce-refresh-b");
    let persistedSession: Session | null = null;
    const releaseExchange = createDeferred<void>();
    const startedExchange = createDeferred<void>();
    const bridge = installRawAuthBridge(
      () => persistedSession,
      (session) => {
        persistedSession = session;
      }
    );
    const exchangeSpy = jest
      .spyOn(supabase.auth, "exchangeCodeForSession")
      .mockImplementation(() => {
        startedExchange.resolve();
        return releaseExchange.promise.then(() => {
          persistedSession = sessionB;
          bridge.emit("SIGNED_IN", sessionB);
          return authTokenResponse(sessionB);
        });
      });

    mockCallbackUrl =
      "monyvi://auth-callback?code=strict-remount-code&type=signup";
    mockLocalSearchParams = { type: "signup" };

    const first = render(
      <React.StrictMode>
        <AuthProvider>
          <AuthStateProbe />
          <AuthCallbackScreen />
        </AuthProvider>
      </React.StrictMode>
    );
    await act(async () => {
      await startedExchange.promise;
    });

    first.unmount();
    const second = renderCallbackHarness();

    await act(async () => {
      await Promise.resolve();
    });
    expect(exchangeSpy).toHaveBeenCalledTimes(1);
    expect(bridge.signOutSpy).not.toHaveBeenCalled();

    releaseExchange.resolve();
    await act(async () => {
      await releaseExchange.promise;
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(observedTokens.at(-1)).toBe("pkce-session-b");
    });

    expect(exchangeSpy).toHaveBeenCalledTimes(1);
    expect(bridge.signOutSpy).not.toHaveBeenCalled();
    second.unmount();
  });
  it("does not reuse cached PKCE success after explicit logout", async () => {
    const sessionA = createSession("pkce-a", "pkce-refresh-a");
    let persistedSession: Session | null = null;
    const bridge = installRawAuthBridge(
      () => persistedSession,
      (session) => {
        persistedSession = session;
      }
    );
    const exchangeSpy = jest
      .spyOn(supabase.auth, "exchangeCodeForSession")
      .mockImplementation(() => {
        persistedSession = sessionA;
        bridge.emit("SIGNED_IN", sessionA);
        return Promise.resolve(authTokenResponse(sessionA));
      });

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });

    const first = await authService.completeAuthSessionFromUrl(
      "monyvi://auth-callback?code=logout-stale-cache-code"
    );
    expect(first.success).toBe(true);

    if (!capturedSignOut) {
      throw new Error("AuthContext signOut was not captured");
    }
    await capturedSignOut();

    const replay = await authService.completeAuthSessionFromUrl(
      "monyvi://auth-callback?code=logout-stale-cache-code"
    );

    expect(exchangeSpy).toHaveBeenCalledTimes(1);
    expect(replay.success).toBe(false);
    expect(persistedSession).toBeNull();
    expect(observedTokens.at(-1)).toBe("none");
  });

  it("does not reuse cached PKCE success after a legitimate newer session B", async () => {
    const sessionA = createSession("pkce-a", "pkce-refresh-a");
    const sessionB = createSession("session-b", "refresh-b");
    let persistedSession: Session | null = null;
    const bridge = installRawAuthBridge(
      () => persistedSession,
      (session) => {
        persistedSession = session;
      }
    );
    const exchangeSpy = jest
      .spyOn(supabase.auth, "exchangeCodeForSession")
      .mockImplementation(() => {
        persistedSession = sessionA;
        bridge.emit("SIGNED_IN", sessionA);
        return Promise.resolve(authTokenResponse(sessionA));
      });
    jest.spyOn(supabase.auth, "signInWithPassword").mockImplementation(() => {
      persistedSession = sessionB;
      bridge.emit("SIGNED_IN", sessionB);
      return Promise.resolve({
        data: {
          user: sessionB.user,
          session: sessionB,
        },
        error: null,
      });
    });

    const first = await authService.completeAuthSessionFromUrl(
      "monyvi://auth-callback?code=newer-session-stale-cache-code"
    );
    expect(first.success).toBe(true);

    await authService.signInWithEmail("same-user@example.com", "secret");
    const replay = await authService.completeAuthSessionFromUrl(
      "monyvi://auth-callback?code=newer-session-stale-cache-code"
    );

    expect(exchangeSpy).toHaveBeenCalledTimes(1);
    expect(replay.success).toBe(false);
    expect(persistedSession).toEqual(sessionB);
  });

});
