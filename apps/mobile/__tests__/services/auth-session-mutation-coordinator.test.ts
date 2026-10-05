import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  createAuthSessionMutationCoordinator,
  isAuthSessionMutationQuarantinedError,
} from "@/services/auth-session-mutation-coordinator";

interface CoordinatorModule {
  createAuthSessionMutationCoordinator: unknown;
}

describe("auth-session mutation coordinator contract", () => {
  it("exports the approved coordinator factory boundary", () => {
    const coordinatorModule = jest.requireActual<CoordinatorModule>(
      "@/services/auth-session-mutation-coordinator"
    );

    expect(coordinatorModule.createAuthSessionMutationCoordinator).toEqual(
      expect.any(Function)
    );
  });
});

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

describe("auth-session mutation coordinator logout and replay hardening", () => {
  it("rejects and quarantines explicit logout when SDK reports success but raw readback still contains P", async () => {
    const sessionP = createSession("session-p", "refresh-p");
    let rawSession: Session | null = sessionP;
    let rawListener:
      | ((event: AuthChangeEvent, session: Session | null) => void)
      | undefined;

    const coordinator = createAuthSessionMutationCoordinator({
      readRawSession: () => Promise.resolve(rawSession),
      restoreRawSession: (session) => {
        rawSession = session;
        return Promise.resolve();
      },
      clearRawSession: () => {
        rawSession = null;
        return Promise.resolve();
      },
      stopAutoRefresh: () => Promise.resolve(),
      startAutoRefresh: () => Promise.resolve(),
      subscribeRaw: (listener) => {
        rawListener = listener;
        return (): void => {
          rawListener = undefined;
        };
      },
    });

    await coordinator.getStableSession();

    await expect(
      coordinator.runExplicitLogout(
        () => Promise.resolve({ error: null }),
        (result) => result.error === null
      )
    ).rejects.toSatisfy(isAuthSessionMutationQuarantinedError);

    expect(rawSession).toEqual(sessionP);
    await expect(
      coordinator.runMutation(
        () => Promise.resolve({ success: true }),
        (result) => result.success
      )
    ).rejects.toSatisfy(isAuthSessionMutationQuarantinedError);
    expect(rawListener).toBeDefined();
  });

  it("quarantines later auth writers when SDK logout throws and P remains", async () => {
    const sessionP = createSession("session-p", "refresh-p");
    let rawSession: Session | null = sessionP;

    const coordinator = createAuthSessionMutationCoordinator({
      readRawSession: () => Promise.resolve(rawSession),
      restoreRawSession: (session) => {
        rawSession = session;
        return Promise.resolve();
      },
      clearRawSession: () => {
        rawSession = null;
        return Promise.resolve();
      },
      stopAutoRefresh: () => Promise.resolve(),
      startAutoRefresh: () => Promise.resolve(),
      subscribeRaw: () => (): void => undefined,
    });

    await coordinator.getStableSession();

    await expect(
      coordinator.runExplicitLogout(
        () => Promise.reject(new Error("SDK logout failed")),
        () => false
      )
    ).rejects.toThrow("SDK logout failed");

    expect(rawSession).toEqual(sessionP);
    await expect(
      coordinator.runMutation(
        () => Promise.resolve({ success: true }),
        (result) => result.success
      )
    ).rejects.toSatisfy(isAuthSessionMutationQuarantinedError);
  });

  it("replays INITIAL_SESSION with current approved B to a subscriber attaching after bootstrap", async () => {
    const sessionP = createSession("session-p", "refresh-p");
    const sessionB = createSession("session-b", "refresh-b");
    let rawSession: Session | null = sessionP;
    let rawListener:
      | ((event: AuthChangeEvent, session: Session | null) => void)
      | undefined;

    const coordinator = createAuthSessionMutationCoordinator({
      readRawSession: () => Promise.resolve(rawSession),
      restoreRawSession: (session) => {
        rawSession = session;
        return Promise.resolve();
      },
      clearRawSession: () => {
        rawSession = null;
        return Promise.resolve();
      },
      stopAutoRefresh: () => Promise.resolve(),
      startAutoRefresh: () => Promise.resolve(),
      subscribeRaw: (listener) => {
        rawListener = listener;
        return (): void => {
          rawListener = undefined;
        };
      },
    });

    await expect(coordinator.getStableSession()).resolves.toEqual(sessionP);

    rawSession = sessionB;
    rawListener?.("TOKEN_REFRESHED", sessionB);

    const observed: Array<{
      readonly event: AuthChangeEvent;
      readonly session: Session | null;
    }> = [];
    const unsubscribe = coordinator.subscribe((event, session) => {
      observed.push({ event, session });
    });

    expect(observed).toEqual([
      {
        event: "INITIAL_SESSION",
        session: sessionB,
      },
    ]);

    unsubscribe();
  });
});
