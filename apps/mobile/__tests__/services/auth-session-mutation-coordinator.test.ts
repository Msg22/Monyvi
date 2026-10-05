interface TestSession {
  readonly id: string;
}

interface CancellableMutation<T> {
  readonly promise: Promise<T>;
  cancel(): void;
}

interface AuthSessionMutationCoordinator {
  beginCancellableMutation<T>(
    operation: () => Promise<T>
  ): CancellableMutation<T>;
  runMutation<T>(operation: () => Promise<T>): Promise<T>;
  runExplicitLogout<T>(operation: () => Promise<T>): Promise<T>;
  readStableSession(): Promise<TestSession | null>;
  publishAuthStateChange(
    event: string,
    session: TestSession | null
  ): void;
  subscribe(
    listener: (event: string, session: TestSession | null) => void
  ): () => void;
}

interface CoordinatorModule {
  createAuthSessionMutationCoordinator(options: {
    readSession: () => Promise<TestSession | null>;
    restoreSession: (session: TestSession) => Promise<void>;
    clearSession: () => Promise<void>;
    identifySession: (session: TestSession | null) => string | null;
  }): AuthSessionMutationCoordinator;
}

function loadCoordinatorModule(): CoordinatorModule {
  return jest.requireActual(
    "@/services/auth-session-mutation-coordinator"
  ) as CoordinatorModule;
}

describe("auth-session mutation coordinator", () => {
  it("keeps ordinary email and OTP mutations queued until a callback mutation settles", async () => {
    const events: string[] = [];
    let persistedSession: TestSession | null = null;
    let resolveCallback: (() => void) | undefined;
    const coordinator = loadCoordinatorModule().createAuthSessionMutationCoordinator({
      readSession: async () => persistedSession,
      restoreSession: async (session) => {
        persistedSession = session;
      },
      clearSession: async () => {
        persistedSession = null;
      },
      identifySession: (session) => session?.id ?? null,
    });

    const callback = coordinator.beginCancellableMutation(
      () =>
        new Promise<void>((resolve) => {
          resolveCallback = (): void => {
            events.push("callback:save");
            persistedSession = { id: "callback-a" };
            coordinator.publishAuthStateChange("SIGNED_IN", persistedSession);
            events.push("callback:resolve");
            resolve();
          };
        })
    );
    const email = coordinator.runMutation(async () => {
      events.push("email:start");
      persistedSession = { id: "email-b" };
    });
    const otp = coordinator.runMutation(async () => {
      events.push("otp:start");
      persistedSession = { id: "otp-b" };
    });

    await Promise.resolve();
    expect(events).toEqual([]);

    resolveCallback?.();
    await Promise.all([callback.promise, email, otp]);

    expect(events).toEqual([
      "callback:save",
      "callback:resolve",
      "email:start",
      "otp:start",
    ]);
    expect(persistedSession).toEqual({ id: "otp-b" });
  });

  it("suppresses a cancelled callback session until compensation completes", async () => {
    let persistedSession: TestSession | null = null;
    let resolveCallback: (() => void) | undefined;
    const observed: string[] = [];
    const coordinator = loadCoordinatorModule().createAuthSessionMutationCoordinator({
      readSession: async () => persistedSession,
      restoreSession: async (session) => {
        persistedSession = session;
      },
      clearSession: async () => {
        persistedSession = null;
      },
      identifySession: (session) => session?.id ?? null,
    });
    coordinator.subscribe((_event, session) => {
      if (session) observed.push(session.id);
    });

    const callback = coordinator.beginCancellableMutation(
      () =>
        new Promise<void>((resolve) => {
          resolveCallback = (): void => {
            persistedSession = { id: "callback-a" };
            coordinator.publishAuthStateChange("SIGNED_IN", persistedSession);
            resolve();
          };
        })
    );
    callback.cancel();
    resolveCallback?.();
    await callback.promise;

    expect(observed).not.toContain("callback-a");
    expect(await coordinator.readStableSession()).toBeNull();
  });

  it("restores a legitimate preexisting session after cancelled callback overwrite when no logout occurred", async () => {
    let persistedSession: TestSession | null = { id: "preexisting-p" };
    let resolveCallback: (() => void) | undefined;
    const coordinator = loadCoordinatorModule().createAuthSessionMutationCoordinator({
      readSession: async () => persistedSession,
      restoreSession: async (session) => {
        persistedSession = session;
      },
      clearSession: async () => {
        persistedSession = null;
      },
      identifySession: (session) => session?.id ?? null,
    });

    const callback = coordinator.beginCancellableMutation(
      () =>
        new Promise<void>((resolve) => {
          resolveCallback = (): void => {
            persistedSession = { id: "callback-a" };
            coordinator.publishAuthStateChange("SIGNED_IN", persistedSession);
            resolve();
          };
        })
    );
    callback.cancel();
    resolveCallback?.();
    await callback.promise;

    expect(await coordinator.readStableSession()).toEqual({
      id: "preexisting-p",
    });
  });

  it("lets explicit logout intent win instead of restoring a pre-cancel session", async () => {
    let persistedSession: TestSession | null = { id: "preexisting-p" };
    let resolveCallback: (() => void) | undefined;
    const observed: Array<string | null> = [];
    const coordinator = loadCoordinatorModule().createAuthSessionMutationCoordinator({
      readSession: async () => persistedSession,
      restoreSession: async (session) => {
        persistedSession = session;
      },
      clearSession: async () => {
        persistedSession = null;
      },
      identifySession: (session) => session?.id ?? null,
    });
    coordinator.subscribe((_event, session) => {
      observed.push(session?.id ?? null);
    });

    const callback = coordinator.beginCancellableMutation(
      () =>
        new Promise<void>((resolve) => {
          resolveCallback = (): void => {
            persistedSession = { id: "callback-a" };
            coordinator.publishAuthStateChange("SIGNED_IN", persistedSession);
            resolve();
          };
        })
    );
    callback.cancel();

    const logout = coordinator.runExplicitLogout(async () => {
      persistedSession = null;
      coordinator.publishAuthStateChange("SIGNED_OUT", null);
    });

    resolveCallback?.();
    await Promise.all([callback.promise, logout]);

    expect(await coordinator.readStableSession()).toBeNull();
    expect(observed).not.toContain("preexisting-p");
    expect(observed).not.toContain("callback-a");
    expect(observed.at(-1)).toBeNull();
  });
});
