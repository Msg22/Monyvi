import type { Session } from "@supabase/supabase-js";

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

import { completeAuthSessionFromUrl } from "@/services/auth-service";
import {
  signInWithEmail,
  supabase,
  verifyEmailVerificationCode,
} from "@/services/supabase";

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

describe("auth session mutation public-entrypoint integration", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("queues ordinary email session B behind callback A and leaves same-user B as final material", async () => {
    const sessionA = createSession("access-a", "refresh-a");
    const sessionB = createSession("access-b", "refresh-b");
    let persistedSession: Session | null = null;
    const events: string[] = [];
    const releaseA = createDeferred<void>();
    const startedA = createDeferred<void>();

    jest.spyOn(supabase.auth, "getSession").mockImplementation(() =>
      Promise.resolve({
        data: { session: persistedSession },
        error: null,
      })
    );
    jest.spyOn(supabase.auth, "setSession").mockImplementation(() => {
      events.push("a:start");
      startedA.resolve();
      return releaseA.promise.then(() => {
        persistedSession = sessionA;
        events.push("a:save");
        events.push("a:notify");
        events.push("a:return");
        return sessionResponse(sessionA);
      });
    });
    const signInSpy = jest
      .spyOn(supabase.auth, "signInWithPassword")
      .mockImplementation(() => {
        events.push("b:email:start");
        persistedSession = sessionB;
        events.push("b:email:save");
        events.push("b:email:notify");
        return Promise.resolve({
          data: {
            user: sessionB.user,
            session: sessionB,
          },
          error: null,
        });
      });

    const callbackPromise = completeAuthSessionFromUrl(
      "monyvi://auth-callback#access_token=access-a&refresh_token=refresh-a&type=signup"
    );
    const emailPromise = signInWithEmail("same-user@example.com", "secret");
    const emailStartedBeforeAReleased = signInSpy.mock.calls.length > 0;

    await startedA.promise;
    releaseA.resolve();
    await Promise.all([callbackPromise, emailPromise]);

    expect(emailStartedBeforeAReleased).toBe(false);
    expect(events).toEqual([
      "a:start",
      "a:save",
      "a:notify",
      "a:return",
      "b:email:start",
      "b:email:save",
      "b:email:notify",
    ]);
    expect(persistedSession?.access_token).toBe("access-b");
  });

  it("queues OTP session B behind callback A before B can mutate storage", async () => {
    const sessionA = createSession("access-a", "refresh-a");
    const sessionB = createSession("otp-access-b", "otp-refresh-b");
    let persistedSession: Session | null = null;
    const releaseA = createDeferred<void>();
    const startedA = createDeferred<void>();

    jest.spyOn(supabase.auth, "getSession").mockImplementation(() =>
      Promise.resolve({
        data: { session: persistedSession },
        error: null,
      })
    );
    jest.spyOn(supabase.auth, "setSession").mockImplementation(() => {
      startedA.resolve();
      return releaseA.promise.then(() => {
        persistedSession = sessionA;
        return sessionResponse(sessionA);
      });
    });
    const verifySpy = jest.spyOn(supabase.auth, "verifyOtp").mockImplementation(
      () => {
        persistedSession = sessionB;
        return Promise.resolve({
          data: {
            user: sessionB.user,
            session: sessionB,
          },
          error: null,
        });
      }
    );

    const callbackPromise = completeAuthSessionFromUrl(
      "monyvi://auth-callback#access_token=access-a&refresh_token=refresh-a&type=signup"
    );
    const otpPromise = verifyEmailVerificationCode(
      "same-user@example.com",
      "123456"
    );
    const otpStartedBeforeAReleased = verifySpy.mock.calls.length > 0;

    await startedA.promise;
    releaseA.resolve();
    await Promise.all([callbackPromise, otpPromise]);

    expect(otpStartedBeforeAReleased).toBe(false);
    expect(persistedSession?.access_token).toBe("otp-access-b");
  });

  it("restores a legitimate preexisting session when callback failure removes it", async () => {
    const sessionP = createSession("access-p", "refresh-p");
    let persistedSession: Session | null = sessionP;

    jest.spyOn(supabase.auth, "getSession").mockImplementation(() =>
      Promise.resolve({
        data: { session: persistedSession },
        error: null,
      })
    );
    jest.spyOn(supabase.auth, "setSession").mockImplementation((tokens) => {
      if (tokens.access_token === "access-p") {
        persistedSession = sessionP;
        return Promise.resolve(sessionResponse(sessionP));
      }

      persistedSession = null;
      return Promise.resolve({
        data: {
          user: null,
          session: null,
        },
        error: new Error("callback refresh failed"),
      });
    });

    const result = await completeAuthSessionFromUrl(
      "monyvi://auth-callback#access_token=access-a&refresh_token=refresh-a&type=signup"
    );

    expect(result.success).toBe(false);
    expect(persistedSession?.access_token).toBe("access-p");
  });

  it("quarantines later auth writes when compensation readback still exposes provisional A", async () => {
    const sessionP = createSession("access-p", "refresh-p");
    const sessionA = createSession("access-a", "refresh-a");
    let persistedSession: Session | null = sessionP;

    jest.spyOn(supabase.auth, "getSession").mockImplementation(() =>
      Promise.resolve({
        data: { session: persistedSession },
        error: null,
      })
    );
    jest.spyOn(supabase.auth, "setSession").mockImplementation((tokens) => {
      if (tokens.access_token === "access-a") {
        persistedSession = sessionA;
        return Promise.resolve({
          data: {
            user: null,
            session: null,
          },
          error: new Error("callback failed after provisional save"),
        });
      }

      return Promise.resolve(sessionResponse(sessionP));
    });
    const emailSpy = jest
      .spyOn(supabase.auth, "signInWithPassword")
      .mockResolvedValue({
        data: {
          user: sessionP.user,
          session: sessionP,
        },
        error: null,
      });

    const result = await completeAuthSessionFromUrl(
      "monyvi://auth-callback#access_token=access-a&refresh_token=refresh-a&type=signup"
    );
    expect(result.success).toBe(false);

    await signInWithEmail("same-user@example.com", "secret");

    expect(persistedSession?.access_token).toBe("access-a");
    expect(emailSpy).not.toHaveBeenCalled();
  });

  it("contains callback mutation inside a bounded auto-refresh pause", async () => {
    const sessionA = createSession("access-a", "refresh-a");
    const events: string[] = [];

    jest.spyOn(supabase.auth, "getSession").mockImplementation(() => {
      events.push("read");
      return Promise.resolve({
        data: { session: null },
        error: null,
      });
    });
    jest.spyOn(supabase.auth, "stopAutoRefresh").mockImplementation(() => {
      events.push("stop");
    });
    jest.spyOn(supabase.auth, "startAutoRefresh").mockImplementation(() => {
      events.push("start");
    });
    jest.spyOn(supabase.auth, "setSession").mockImplementation(() => {
      events.push("mutate");
      return Promise.resolve(sessionResponse(sessionA));
    });

    await completeAuthSessionFromUrl(
      "monyvi://auth-callback#access_token=access-a&refresh_token=refresh-a&type=signup"
    );

    expect(events[0]).toBe("stop");
    expect(events.at(-1)).toBe("start");
    expect(events).toContain("read");
    expect(events).toContain("mutate");
  });
});
