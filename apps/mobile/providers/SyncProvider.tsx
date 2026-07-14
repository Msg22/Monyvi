/**
 * Sync Context and Provider
 * Provides sync status and functions to the app with smart sync intervals
 */

import { database, type MarketRate, type Profile } from "@monyvi/db";
import { assertValidMarketRateModel } from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAuth } from "../context/AuthContext";
import { isAuthenticated as checkIsAuthenticated } from "../services/supabase";
import { syncDatabase } from "../services/sync";
import { queryOwned } from "../services/user-data-access";
import { logger } from "../utils/logger";

// Sync intervals in milliseconds
const SYNC_INTERVAL_ACTIVE = 15 * 60 * 1000; // 15 minutes when app is active
const SYNC_INTERVAL_BACKGROUND = 30 * 60 * 1000; // 30 minutes when backgrounded

/** Timeout for the initial pull-sync before declaring failure (FR-006). */
const INITIAL_SYNC_TIMEOUT_MS = 20_000;

/** State machine for the initial pull-sync that gates post-sign-in routing. */
export type InitialSyncState = "in-progress" | "success" | "failed" | "timeout";

type ShouldApplyState = () => boolean;

interface SyncContextValue {
  isSyncing: boolean;
  isInitialSync: boolean;
  lastSyncedAt: Date | null;
  syncError: Error | null;
  sync: (forceFullSync?: boolean) => Promise<void>;
  /** Resolved after the initial pull-sync completes or times out. */
  readonly initialSyncState: InitialSyncState;
  /** Re-trigger the initial sync. Returns the new state when resolved. */
  readonly retryInitialSync: () => Promise<InitialSyncState>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const shouldAlwaysApplyState = (): boolean => true;

interface SyncProviderProps {
  children: ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps): JSX.Element {
  const { isAuthenticated, user } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitialSync, setIsInitialSync] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<Error | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState
  );
  const [initialSyncState, setInitialSyncState] =
    useState<InitialSyncState>("in-progress");

  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const bootRunIdRef = useRef(0);

  const sync = useCallback(
    async (
      forceFullSync = false,
      shouldApplyState: ShouldApplyState = shouldAlwaysApplyState
    ): Promise<void> => {
      // Check if authenticated before syncing
      const authenticated = await checkIsAuthenticated();
      if (!authenticated || !shouldApplyState()) {
        return;
      }

      setIsSyncing(true);
      setSyncError(null);

      try {
        // Concurrency guard is handled inside syncDatabase (module-level lock in sync.ts)
        await syncDatabase(database, forceFullSync);
        if (!shouldApplyState()) {
          return;
        }
        setLastSyncedAt(new Date());
      } catch (error) {
        const syncErr =
          error instanceof Error ? error : new Error("Sync failed");
        if (shouldApplyState()) {
          setSyncError(syncErr);
        }
        throw syncErr;
      } finally {
        if (shouldApplyState()) {
          setIsSyncing(false);
        }
      }
    },
    []
  );

  /**
   * Runs the initial sync with a 20-second timeout race.
   * Returns the final InitialSyncState.
   */
  const runInitialSync = useCallback(
    async (
      shouldApplyState: ShouldApplyState = shouldAlwaysApplyState
    ): Promise<InitialSyncState> => {
      if (shouldApplyState()) {
        setInitialSyncState("in-progress");
      }

      let syncResult: InitialSyncState = "success";
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      try {
        await Promise.race([
          sync(true, shouldApplyState),
          new Promise<never>((_resolve, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error("initial-sync-timeout")),
              INITIAL_SYNC_TIMEOUT_MS
            );
          }),
        ]);
      } catch (error) {
        syncResult =
          error instanceof Error && error.message === "initial-sync-timeout"
            ? "timeout"
            : "failed";
      } finally {
        // Always clear the timer — otherwise the losing branch of Promise.race
        // leaks a pending timer that fires 20s later with an unhandled rejection
        // on the detached Promise (fires after Android/iOS wake-ups too).
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
        }
      }

      if (shouldApplyState()) {
        setInitialSyncState(syncResult);
      }
      return syncResult;
    },
    [sync]
  );

  /** Re-trigger the initial sync from the retry screen. */
  const retryInitialSync = useCallback(async (): Promise<InitialSyncState> => {
    return runInitialSync();
  }, [runInitialSync]);

  /**
   * Set up the sync interval based on app state.
   *
   * The interval callback checks authentication via an async call
   * to avoid closing over the potentially stale `isAuthenticated` prop.
   */
  const setupSyncInterval = useCallback(
    (isActive: boolean) => {
      // Clear existing interval
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }

      const interval = isActive
        ? SYNC_INTERVAL_ACTIVE
        : SYNC_INTERVAL_BACKGROUND;

      // TODO: Replace with structured logging (e.g., Sentry)

      syncIntervalRef.current = setInterval(() => {
        // Use async auth check instead of closed-over isAuthenticated
        // to avoid stale closure issues
        const runSync = async (): Promise<void> => {
          try {
            const authenticated = await checkIsAuthenticated();
            if (authenticated) {
              await sync();
            }
          } catch {
            // TODO: Replace with structured logging (e.g., Sentry)
          }
        };
        runSync().catch(() => {
          // TODO: Replace with structured logging (e.g., Sentry)
        });
      }, interval);
    },
    [sync]
  );

  // Handle app state changes (foreground/background)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus): void => {
      const wasBackground = appState.match(/inactive|background/);
      const isNowActive = nextAppState === "active";

      // App came to foreground from background
      if (wasBackground && isNowActive) {
        // TODO: Replace with structured logging (e.g., Sentry)
        // Sync immediately when returning to foreground
        sync().catch(() => {
          // TODO: Replace with structured logging (e.g., Sentry)
        });
        setupSyncInterval(true);
      }

      // App went to background
      if (appState === "active" && nextAppState.match(/inactive|background/)) {
        // TODO: Replace with structured logging (e.g., Sentry)
        setupSyncInterval(false);
      }

      setAppState(nextAppState);
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => subscription.remove();
  }, [appState, sync, setupSyncInterval]);

  // Initial sync on mount + data cleared detection
  useEffect(() => {
    const bootRunId = bootRunIdRef.current + 1;
    bootRunIdRef.current = bootRunId;
    const bootUserId = user?.id;
    let isMounted = true;
    const shouldContinue = (): boolean =>
      isMounted && bootRunIdRef.current === bootRunId;

    const initialSync = async (): Promise<void> => {
      // Check user is authenticated before syncing
      if (!isAuthenticated) {
        if (shouldContinue()) {
          setupSyncInterval(true);
          setInitialSyncState("success");
        }
        return;
      }

      // Check if data was cleared (empty local DB but authenticated)
      const userId = bootUserId;
      if (!userId) {
        if (shouldContinue()) {
          setInitialSyncState("failed");
        }
        return;
      }

      const profilesCollection = database.get<Profile>("profiles");
      const marketRatesCollection = database.get<MarketRate>("market_rates");
      const [currentUserProfileCount, cachedMarketRates] = await Promise.all([
        queryOwned(
          profilesCollection,
          userId,
          Q.where("deleted", false)
        ).fetchCount(),
        marketRatesCollection
          .query(Q.sortBy("created_at", Q.desc), Q.take(1))
          .fetch(),
      ]);

      if (!shouldContinue()) {
        return;
      }

      const hasValidCachedMarketRate = isValidCachedMarketRate(
        cachedMarketRates.at(0)
      );

      if (currentUserProfileCount === 0 || !hasValidCachedMarketRate) {
        setIsInitialSync(true);
        await runInitialSync(shouldContinue);
        if (shouldContinue()) {
          setIsInitialSync(false);
        }
      } else {
        // Current-user profile exists locally, so the route gate can decide
        // offline. Mark the initial-sync gate as "success" immediately and
        // refresh the rest of the user's data in the background.
        setInitialSyncState("success");
        sync(false, shouldContinue).catch((error: unknown) => {
          if (!shouldContinue()) {
            return;
          }
          // Background sync failure is non-fatal; regular sync-interval retries
          // will recover. Log so it is diagnosable but don't flip the gate.
          logger.warn(
            "sync.backgroundRefreshOnBoot.failed",
            getSafeThrownLog(error)
          );
        });
      }

      // Set up initial interval (app starts active)
      if (shouldContinue()) {
        setupSyncInterval(true);
      }
    };

    initialSync().catch(() => {
      if (shouldContinue()) {
        setInitialSyncState("failed");
      }
    });

    // Cleanup interval on unmount
    return () => {
      isMounted = false;
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isAuthenticated, runInitialSync, setupSyncInterval, sync, user?.id]);

  const value = useMemo<SyncContextValue>(
    () => ({
      isSyncing,
      isInitialSync,
      lastSyncedAt,
      syncError,
      sync,
      initialSyncState,
      retryInitialSync,
    }),
    [
      isSyncing,
      isInitialSync,
      lastSyncedAt,
      syncError,
      sync,
      initialSyncState,
      retryInitialSync,
    ]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/**
 * Hook to access sync context
 */
export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return context;
}

function getSafeThrownLog(error: unknown): {
  readonly message: string;
  readonly type?: string;
  readonly preview?: string;
} {
  if (error instanceof Error) {
    return { message: error.message };
  }

  if (typeof error === "string") {
    return {
      message: "non-error thrown",
      type: "string",
      preview: error.slice(0, 120),
    };
  }

  return {
    message: "non-error thrown",
    type: typeof error,
  };
}

function isValidCachedMarketRate(rate: MarketRate | undefined): boolean {
  if (!rate) {
    return false;
  }

  try {
    assertValidMarketRateModel(rate);
    return true;
  } catch (error: unknown) {
    logger.error("sync.cachedMarketRate.invalid", error);
    return false;
  }
}
