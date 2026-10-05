import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
}

interface ActiveMutation {
  phase: "baseline" | "operation" | "reconcile";
  baseline: Session | null;
  baselineReady: Deferred;
  baselineCandidateSeen: boolean;
  baselineCandidate: Session | null;
  baselineEvent: AuthChangeEvent | null;
  bufferedEvent: {
    readonly event: AuthChangeEvent;
    readonly session: Session | null;
  } | null;
  readonly logoutGenerationAtStart: number;
}

interface MutationCancellation {
  cancelled: boolean;
}

interface CancellableMutation<T> {
  readonly promise: Promise<T>;
  cancel(): void;
}

interface AuthSessionMutationCoordinatorOptions {
  readonly readRawSession: () => Promise<Session | null>;
  readonly restoreRawSession: (session: Session) => Promise<void>;
  readonly clearRawSession: () => Promise<void>;
  readonly stopAutoRefresh: () => Promise<void>;
  readonly startAutoRefresh: () => Promise<void>;
  readonly subscribeRaw: (
    listener: (event: AuthChangeEvent, session: Session | null) => void
  ) => () => void;
}

type CoordinatedAuthListener = (
  event: AuthChangeEvent,
  session: Session | null
) => void | Promise<void>;

interface AuthSessionMutationCoordinator {
  runMutation<T>(
    operation: () => Promise<T>,
    isSuccessful: (result: T) => boolean
  ): Promise<T>;
  beginCancellableMutation<T>(
    operation: () => Promise<T>,
    isSuccessful: (result: T) => boolean
  ): CancellableMutation<T>;
  runExplicitLogout<T>(
    operation: () => Promise<T>,
    isSuccessful: (result: T) => boolean
  ): Promise<T>;
  getStableSession(): Promise<Session | null>;
  subscribe(listener: CoordinatedAuthListener): () => void;
  getGeneration(): number;
}

class AuthSessionMutationCancelledError extends Error {
  constructor() {
    super("Authentication session mutation was cancelled.");
    this.name = "AuthSessionMutationCancelledError";
  }
}

class AuthSessionMutationQuarantinedError extends Error {
  constructor() {
    super("Authentication session state is quarantined for this process.");
    this.name = "AuthSessionMutationQuarantinedError";
  }
}

function createDeferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (): void => {
      resolvePromise?.();
    },
  };
}

function sessionIdentity(session: Session | null): string | null {
  if (!session) return null;

  return [
    session.user.id,
    session.access_token,
    session.refresh_token,
  ].join("\u0000");
}

function normalizeThrownError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage);
}

export function createAuthSessionMutationCoordinator(
  options: AuthSessionMutationCoordinatorOptions
): AuthSessionMutationCoordinator {
  let queueTail: Promise<void> = Promise.resolve();
  let activeMutation: ActiveMutation | null = null;
  let stableSession: Session | null = null;
  let stableInitialized = false;
  let generation = 0;
  let logoutGeneration = 0;
  let quarantined = false;
  let rawUnsubscribe: (() => void) | null = null;
  const listeners = new Set<CoordinatedAuthListener>();

  const publish = (
    event: AuthChangeEvent,
    session: Session | null
  ): void => {
    for (const listener of listeners) {
      void listener(event, session);
    }
  };

  const commitStable = (
    session: Session | null,
    event?: AuthChangeEvent
  ): void => {
    const changed =
      !stableInitialized ||
      sessionIdentity(stableSession) !== sessionIdentity(session);

    stableSession = session;
    stableInitialized = true;

    if (changed) {
      generation += 1;
    }
    if (event) {
      publish(event, session);
    }
  };

  const enterQuarantine = (): void => {
    quarantined = true;
    const shouldPublish =
      !stableInitialized || sessionIdentity(stableSession) !== null;
    stableSession = null;
    stableInitialized = true;
    generation += 1;
    if (shouldPublish) {
      publish("SIGNED_OUT", null);
    }
  };

  const handleRawAuthState = (
    event: AuthChangeEvent,
    session: Session | null
  ): void => {
    if (quarantined) {
      return;
    }

    const active = activeMutation;
    if (!active) {
      commitStable(session, event);
      return;
    }

    if (active.phase === "baseline") {
      active.baselineCandidateSeen = true;
      active.baselineCandidate = session;
      active.baselineEvent = event;
      commitStable(session, event);
      return;
    }

    active.bufferedEvent = { event, session };
  };

  const ensureRawSubscription = (): void => {
    if (rawUnsubscribe) return;
    rawUnsubscribe = options.subscribeRaw(handleRawAuthState);
  };

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const previous = queueTail;
    const done = createDeferred();
    queueTail = previous.catch(() => undefined).then(() => done.promise);

    return previous
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        done.resolve();
      });
  };

  const matchingBufferedEvent = (
    active: ActiveMutation,
    session: Session | null
  ): AuthChangeEvent | undefined => {
    const buffered = active.bufferedEvent;
    if (
      buffered &&
      sessionIdentity(buffered.session) === sessionIdentity(session)
    ) {
      return buffered.event;
    }

    if (sessionIdentity(active.baseline) !== sessionIdentity(session)) {
      return session ? "SIGNED_IN" : "SIGNED_OUT";
    }

    return undefined;
  };

  const restoreOrClear = async (
    target: Session | null
  ): Promise<void> => {
    if (target) {
      try {
        await options.restoreRawSession(target);
        return;
      } catch {
        try {
          await options.clearRawSession();
        } catch {
          // Verification below decides whether quarantine is required.
        }
        return;
      }
    }

    await options.clearRawSession();
  };

  const compensateAndVerify = async (
    active: ActiveMutation,
    current: Session | null
  ): Promise<void> => {
    const logoutWon =
      active.logoutGenerationAtStart !== logoutGeneration;
    const target = logoutWon ? null : active.baseline;

    if (sessionIdentity(current) !== sessionIdentity(target)) {
      await restoreOrClear(target);
    }

    const verified = await options.readRawSession();
    if (sessionIdentity(verified) !== sessionIdentity(target)) {
      enterQuarantine();
      throw new AuthSessionMutationQuarantinedError();
    }

    commitStable(target, logoutWon ? "SIGNED_OUT" : undefined);
  };

  const executeMutation = async <T>(
    operation: () => Promise<T>,
    isSuccessful: (result: T) => boolean,
    cancellation: MutationCancellation
  ): Promise<T> => {
    if (quarantined) {
      throw new AuthSessionMutationQuarantinedError();
    }

    ensureRawSubscription();
    const active: ActiveMutation = {
      phase: "baseline",
      baseline: stableInitialized ? stableSession : null,
      baselineReady: createDeferred(),
      baselineCandidateSeen: false,
      baselineCandidate: null,
      baselineEvent: null,
      bufferedEvent: null,
      logoutGenerationAtStart: logoutGeneration,
    };
    activeMutation = active;

    let autoRefreshStopped = false;
    let result: T | undefined;
    let hasResult = false;
    let operationError: unknown;

    try {
      await options.stopAutoRefresh();
      autoRefreshStopped = true;

      const rawBaseline = await options.readRawSession();
      const baseline = active.baselineCandidateSeen
        ? active.baselineCandidate
        : rawBaseline;
      active.baseline = baseline;

      if (
        !active.baselineCandidateSeen ||
        sessionIdentity(stableSession) !== sessionIdentity(baseline)
      ) {
        commitStable(
          baseline,
          active.baselineCandidateSeen
            ? (active.baselineEvent ?? undefined)
            : undefined
        );
      }
      active.baselineReady.resolve();

      if (cancellation.cancelled) {
        throw new AuthSessionMutationCancelledError();
      }

      active.phase = "operation";
      try {
        result = await operation();
        hasResult = true;
      } catch (error: unknown) {
        operationError = error;
      }

      active.phase = "reconcile";
      let current: Session | null;
      try {
        current = await options.readRawSession();
      } catch (error: unknown) {
        enterQuarantine();
        throw error;
      }

      const successful =
        operationError === undefined &&
        hasResult &&
        isSuccessful(result as T) &&
        !cancellation.cancelled &&
        active.logoutGenerationAtStart === logoutGeneration;

      if (successful) {
        commitStable(current, matchingBufferedEvent(active, current));
      } else {
        await compensateAndVerify(active, current);
      }

      if (cancellation.cancelled) {
        throw new AuthSessionMutationCancelledError();
      }
      if (operationError !== undefined) {
        throw normalizeThrownError(
          operationError,
          "Authentication session mutation failed."
        );
      }
      if (!hasResult) {
        throw new Error("Authentication session mutation produced no result.");
      }

      return result as T;
    } finally {
      active.baselineReady.resolve();
      try {
        if (autoRefreshStopped) {
          await options.startAutoRefresh();
        }
      } finally {
        if (activeMutation === active) {
          activeMutation = null;
        }
      }
    }
  };

  const beginCancellableMutation = <T>(
    operation: () => Promise<T>,
    isSuccessful: (result: T) => boolean
  ): CancellableMutation<T> => {
    const cancellation: MutationCancellation = { cancelled: false };
    const promise = enqueue(() =>
      executeMutation(operation, isSuccessful, cancellation)
    );

    return {
      promise,
      cancel: (): void => {
        cancellation.cancelled = true;
      },
    };
  };

  const runMutation = <T>(
    operation: () => Promise<T>,
    isSuccessful: (result: T) => boolean
  ): Promise<T> =>
    beginCancellableMutation(operation, isSuccessful).promise;

  const runExplicitLogout = <T>(
    operation: () => Promise<T>,
    isSuccessful: (result: T) => boolean
  ): Promise<T> => {
    logoutGeneration += 1;
    generation += 1;
    commitStable(null, "SIGNED_OUT");

    return enqueue(async () => {
      ensureRawSubscription();
      const active: ActiveMutation = {
        phase: "operation",
        baseline: null,
        baselineReady: createDeferred(),
        baselineCandidateSeen: false,
        baselineCandidate: null,
        baselineEvent: null,
        bufferedEvent: null,
        logoutGenerationAtStart: logoutGeneration,
      };
      active.baselineReady.resolve();
      activeMutation = active;

      let autoRefreshStopped = false;
      let result: T | undefined;
      let hasResult = false;
      let operationError: unknown;

      try {
        await options.stopAutoRefresh();
        autoRefreshStopped = true;

        try {
          result = await operation();
          hasResult = true;
        } catch (error: unknown) {
          operationError = error;
        }

        active.phase = "reconcile";

        let current: Session | null;
        try {
          current = await options.readRawSession();
        } catch (error: unknown) {
          enterQuarantine();
          throw normalizeThrownError(
            operationError ?? error,
            "Could not verify signed-out session state."
          );
        }

        if (current !== null) {
          enterQuarantine();
          if (operationError !== undefined) {
            throw normalizeThrownError(
              operationError,
              "Authentication logout failed."
            );
          }
          throw new AuthSessionMutationQuarantinedError();
        }

        commitStable(null);

        if (operationError !== undefined) {
          throw normalizeThrownError(
            operationError,
            "Authentication logout failed."
          );
        }
        if (!hasResult) {
          throw new Error("Authentication logout produced no result.");
        }

        return result as T;
      } finally {
        try {
          if (autoRefreshStopped) {
            await options.startAutoRefresh();
          }
        } finally {
          if (activeMutation === active) {
            activeMutation = null;
          }
        }
      }
    });
  };

  const getStableSession = async (): Promise<Session | null> => {
    if (quarantined) {
      return null;
    }

    const active = activeMutation;
    if (active) {
      await active.baselineReady.promise;
      return quarantined ? null : stableSession;
    }

    if (stableInitialized) {
      return stableSession;
    }

    return enqueue(async () => {
      if (quarantined) return null;
      if (stableInitialized) return stableSession;

      ensureRawSubscription();
      const rawSession = await options.readRawSession();
      commitStable(rawSession);
      return stableSession;
    });
  };

  const subscribe = (listener: CoordinatedAuthListener): (() => void) => {
    listeners.add(listener);
    ensureRawSubscription();

    if (stableInitialized && !quarantined) {
      void listener("INITIAL_SESSION", stableSession);
    }

    return (): void => {
      listeners.delete(listener);
    };
  };

  return {
    runMutation,
    beginCancellableMutation,
    runExplicitLogout,
    getStableSession,
    subscribe,
    getGeneration: (): number => generation,
  };
}

export function isAuthSessionMutationCancelledError(
  error: unknown
): error is AuthSessionMutationCancelledError {
  return error instanceof AuthSessionMutationCancelledError;
}

export function isAuthSessionMutationQuarantinedError(
  error: unknown
): error is AuthSessionMutationQuarantinedError {
  return error instanceof AuthSessionMutationQuarantinedError;
}

export type {
  AuthSessionMutationCoordinator,
  AuthSessionMutationCoordinatorOptions,
  CancellableMutation,
  CoordinatedAuthListener,
};
