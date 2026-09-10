/**
 * Sync Context and Provider
 * Provides sync status and functions to the app with smart sync intervals.
 */

import { database, type Profile } from "@monyvi/db";
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
import type { InitialSyncFailureReason } from "../utils/routing-decision";

const SYNC_INTERVAL_ACTIVE = 15 * 60 * 1000;
const SYNC_INTERVAL_BACKGROUND = 30 * 60 * 1000;
const INITIAL_SYNC_TIMEOUT_MS = 20_000;

export type InitialSyncState = "in-progress" | "success" | "failed" | "timeout";

type ShouldApplyState = () => boolean;

interface SyncContextValue {
  isSyncing: boolean;
  isInitialSync: boolean;
  lastSyncedAt: Date | null;
  syncError: Error | null;
  sync: (forceFullSync?: boolean) => Promise<void>;
  readonly initialSyncState: InitialSyncState;
  readonly initialSyncFailureReason: InitialSyncFailureReason;
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
  const [initialSyncFailureReason, setInitialSyncFailureReason] =
    useState<InitialSyncFailureReason>(null);

  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const bootRunIdRef = useRef(0);
  const initialSyncFailureReasonRef = useRef<InitialSyncFailureReason>(null);

  const sync = useCallback(
    async (
      forceFullSync = false,
      shouldApplyState: ShouldApplyState = shouldAlwaysApplyState
    ): Promise<void> => {
      const authenticated = await checkIsAuthenticated();
      if (!authenticated || !shouldApplyState()) {
        return;
      }

      setIsSyncing(true);
      setSyncError(null);

      try {
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

  const runInitialSync = useCallback(
    async (
      _failureReasonOnFailure: InitialSyncFailureReason,
      shouldApplyState: ShouldApplyState = shouldAlwaysApplyState
    ): Promise<InitialSyncState> => {
      initialSyncFailureReasonRef.current = null;
      if (shouldApplyState()) {
        setInitialSyncState("in-progress");
        setInitialSyncFailureReason(null);
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
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
        }
      }

      if (shouldApplyState()) {
        setInitialSyncState(syncResult);
        initialSyncFailureReasonRef.current = null;
        setInitialSyncFailureReason(null);
      }
      return syncResult;
    },
    [sync]
  );

  const retryInitialSync = useCallback(async (): Promise<InitialSyncState> => {
    return runInitialSync(initialSyncFailureReasonRef.current);
  }, [runInitialSync]);

  const setupSyncInterval = useCallback(
    (isActive: boolean) => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }

      const interval = isActive
        ? SYNC_INTERVAL_ACTIVE
        : SYNC_INTERVAL_BACKGROUND;

      syncIntervalRef.current = setInterval(() => {
        const runSync = async (): Promise<void> => {
          try {
            const authenticated = await checkIsAuthenticated();
            if (authenticated) {
              await sync();
            }
          } catch {
            // Regular interval retries recover transient sync failures.
          }
        };
        runSync().catch(() => {
          // Avoid an unhandled interval rejection.
        });
      }, interval);
    },
    [sync]
  );

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus): void => {
      const wasBackground = appState.match(/inactive|background/);
      const isNowActive = nextAppState === "active";

      if (wasBackground && isNowActive) {
        sync().catch(() => {
          // Existing local data remains authoritative on refresh failure.
        });
        setupSyncInterval(true);
      }

      if (appState === "active" && nextAppState.match(/inactive|background/)) {
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

  useEffect(() => {
    const bootRunId = bootRunIdRef.current + 1;
    bootRunIdRef.current = bootRunId;
    const bootUserId = user?.id;
    let isMounted = true;
    const shouldContinue = (): boolean =>
      isMounted && bootRunIdRef.current === bootRunId;

    const initialSync = async (): Promise<void> => {
      if (!isAuthenticated) {
        if (shouldContinue()) {
          initialSyncFailureReasonRef.current = null;
          setInitialSyncFailureReason(null);
          setupSyncInterval(true);
          setInitialSyncState("success");
        }
        return;
      }

      const userId = bootUserId;
      if (!userId) {
        if (shouldContinue()) {
          initialSyncFailureReasonRef.current = null;
          setInitialSyncFailureReason(null);
          setInitialSyncState("failed");
        }
        return;
      }

      const profilesCollection = database.get<Profile>("profiles");
      const currentUserProfileCount = await queryOwned(
        profilesCollection,
        userId,
        Q.where("deleted", false)
      ).fetchCount();

      if (!shouldContinue()) {
        return;
      }

      if (currentUserProfileCount === 0) {
        setIsInitialSync(true);
        await runInitialSync(null, shouldContinue);
        if (shouldContinue()) {
          setIsInitialSync(false);
        }
      } else {
        initialSyncFailureReasonRef.current = null;
        setInitialSyncFailureReason(null);
        setInitialSyncState("success");
        sync(false, shouldContinue).catch((error: unknown) => {
          if (!shouldContinue()) {
            return;
          }
          logger.warn(
            "sync.backgroundRefreshOnBoot.failed",
            getSafeThrownLog(error)
          );
        });
      }

      if (shouldContinue()) {
        setupSyncInterval(true);
      }
    };

    initialSync().catch(() => {
      if (shouldContinue()) {
        setInitialSyncFailureReason(null);
        setInitialSyncState("failed");
      }
    });

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
      initialSyncFailureReason,
      retryInitialSync,
    }),
    [
      isSyncing,
      isInitialSync,
      lastSyncedAt,
      syncError,
      sync,
      initialSyncState,
      initialSyncFailureReason,
      retryInitialSync,
    ]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

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
