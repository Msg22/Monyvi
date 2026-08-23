/**
 * Auth Context
 * Provides authentication state and functions throughout the app.
 *
 * Architecture & Design Rationale:
 * - Pattern: React Context with session-based state
 * - Why: Simple session check — if session exists, the user is
 *   authenticated. No server re-verification needed.
 * - SOLID: SRP — context only manages auth state propagation.
 *
 * Race Guard: applySession() + listenerFiredRef ensures that
 * a stale bootstrap result cannot overwrite a fresher session from
 * onAuthStateChange.
 */

import { AuthApiError, type Session, type User } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { clearBudgetDashboardFilterSession } from "@/hooks/budget-dashboard-filter-session";
import { clearPersistedAuthSession, supabase } from "@/services/supabase";
import { logger } from "@/utils/logger";

const AUTH_BOOTSTRAP_TIMEOUT_MS = 10_000;

// =============================================================================
// Types
// =============================================================================

interface AuthContextValue {
  readonly user: User | null;
  readonly session: Session | null;
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly signOut: () => Promise<void>;
}

interface AuthSubscription {
  unsubscribe(): void;
}

// =============================================================================
// Context
// =============================================================================

const AuthContext = createContext<AuthContextValue | null>(null);

// =============================================================================
// Hook
// =============================================================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// =============================================================================
// Provider
// =============================================================================

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(timeoutMessage)),
      timeoutMs
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  });
}

function isAuthBootstrapTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "auth-bootstrap-timeout";
}

function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (
    error instanceof AuthApiError &&
    (error.code === "refresh_token_not_found" ||
      error.code === "invalid_refresh_token")
  ) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found")
  );
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({
  children,
}: AuthProviderProps): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Guard: tracks whether onAuthStateChange has fired at least once.
  // If it has, the bootstrap result is stale and should be discarded.
  const listenerFiredRef = useRef(false);

  /**
   * Centralized session application. Both bootstrap and the auth
   * listener route through here. The `fromListener` flag indicates
   * the source: listener updates always win; bootstrap updates are
   * skipped if the listener has already fired.
   *
   * Architecture & Design Rationale:
   * - Pattern: Single Entry Point for State Mutation
   * - Why: Prevents the race where bootstrap's slower getSession()
   *   overwrites a fresher session already published by the listener.
   */
  const applySession = useCallback(
    (newSession: Session | null, fromListener: boolean): void => {
      if (!fromListener && listenerFiredRef.current) {
        // Bootstrap resolved AFTER the listener already fired — skip.
        return;
      }

      if (fromListener) {
        listenerFiredRef.current = true;
      }

      const sessionUser = newSession?.user ?? null;

      setSession(sessionUser ? newSession : null);
      setUser(sessionUser);
    },
    []
  );

  useEffect(() => {
    let isMounted = true;
    let authSubscription: AuthSubscription | null = null;

    const subscribeToAuthChanges = (): void => {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, newSession) => {
        if (event === "SIGNED_OUT") {
          clearBudgetDashboardFilterSession();
        }
        applySession(newSession, true);
        setIsLoading(false);
      });

      authSubscription = subscription;
    };

    const bootstrapSession = async (): Promise<void> => {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_BOOTSTRAP_TIMEOUT_MS,
          "auth-bootstrap-timeout"
        );

        if (error) {
          throw error;
        }

        if (!isMounted) return;

        applySession(initialSession, false);
      } catch (error: unknown) {
        if (isInvalidRefreshTokenError(error)) {
          await clearPersistedAuthSession();
          logger.info("auth.bootstrap.staleSessionCleared", {
            reason: error instanceof Error ? error.message : "unknown",
          });
        } else if (!isAuthBootstrapTimeout(error)) {
          logger.error("Auth bootstrap failed", { error });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          subscribeToAuthChanges();
        }
      }
    };

    void bootstrapSession();

    return () => {
      isMounted = false;
      authSubscription?.unsubscribe();
    };
  }, [applySession]);

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
  }, []);

  const isAuthenticated = user !== null;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated,
      signOut,
    }),
    [user, session, isLoading, isAuthenticated, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
