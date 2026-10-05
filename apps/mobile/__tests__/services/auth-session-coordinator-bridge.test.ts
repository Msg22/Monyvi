import {
  AuthApiError,
  type AuthChangeEvent,
  type Session,
} from "@supabase/supabase-js";

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
const { supabase } = supabaseModule;

type RawAuthCallback = Parameters<typeof supabase.auth.onAuthStateChange>[0];

interface CoordinatedSupabaseModule {
  getStableAuthSession?: () => ReturnType<typeof supabase.auth.getSession>;
  subscribeToCoordinatedAuthStateChange?: (
    callback: RawAuthCallback
  ) => ReturnType<typeof supabase.auth.onAuthStateChange>;
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

describe("Supabase coordinated auth bridge", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps provisional A out of stable reads and admits normal refreshed P-prime after compensation", async () => {
    const coordinated =
      jest.requireActual<CoordinatedSupabaseModule>("@/services/supabase");
    if (
      typeof coordinated.getStableAuthSession !== "function" ||
      typeof coordinated.subscribeToCoordinatedAuthStateChange !== "function"
    ) {
      return;
    }

    const sessionP = createSession("session-p", "refresh-p");
    const sessionA = createSession("session-a", "refresh-a");
    const sessionPPrime = createSession("session-p-prime", "refresh-p-prime");
    let persistedSession: Session | null = sessionP;
    const rawListeners = new Set<RawAuthCallback>();
    const observed: string[] = [];
    const savedA = createDeferred<void>();
    const releaseA = createDeferred<void>();

    const getSessionSpy = jest
      .spyOn(supabase.auth, "getSession")
      .mockImplementation(() => sessionReadResponse(persistedSession));
    jest.spyOn(supabase.auth, "onAuthStateChange").mockImplementation(
      (callback) => {
        rawListeners.add(callback);
        return {
          data: {
            subscription: {
              id: "raw-auth-listener",
              callback,
              unsubscribe: (): void => {
                rawListeners.delete(callback);
              },
            },
          },
        };
      }
    );
    jest.spyOn(supabase.auth, "stopAutoRefresh").mockImplementation(() =>
      Promise.resolve()
    );
    jest.spyOn(supabase.auth, "startAutoRefresh").mockImplementation(() =>
      Promise.resolve()
    );
    jest.spyOn(supabase.auth, "setSession").mockImplementation(() => {
      persistedSession = sessionA;
      for (const listener of rawListeners) {
        listener("SIGNED_IN", sessionA);
      }
      savedA.resolve();

      return releaseA.promise.then(() => ({
        data: {
          user: null,
          session: null,
        },
        error: new AuthApiError(
          "callback failed after provisional save",
          400,
          "callback_provisional_failure"
        ),
      }));
    });

    const subscription = coordinated.subscribeToCoordinatedAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null): Promise<void> => {
        if (session) {
          observed.push(session.access_token);
        }
        return Promise.resolve();
      }
    );

    const callbackPromise = authService.completeAuthSessionFromUrl(
      "monyvi://auth-callback#access_token=session-a&refresh_token=refresh-a&type=signup"
    );

    await savedA.promise;
    const rawReadsBeforeStableRead = getSessionSpy.mock.calls.length;
    const stableDuringA = await coordinated.getStableAuthSession();

    expect(stableDuringA.data.session).toEqual(sessionP);
    expect(getSessionSpy).toHaveBeenCalledTimes(rawReadsBeforeStableRead);

    for (const listener of rawListeners) {
      listener("TOKEN_REFRESHED", sessionA);
    }
    expect(observed).not.toContain("session-a");

    releaseA.resolve();
    const callbackResult = await callbackPromise;
    expect(callbackResult.success).toBe(false);

    persistedSession = sessionPPrime;
    for (const listener of rawListeners) {
      listener("TOKEN_REFRESHED", sessionPPrime);
    }

    expect(observed.at(-1)).toBe("session-p-prime");
    const stableAfterA = await coordinated.getStableAuthSession();
    expect(stableAfterA.data.session).toEqual(sessionPPrime);

    subscription.data.subscription.unsubscribe();
  });
});
