/**
 * useSmsSync Hook
 *
 * Manages first-launch SMS sync prompt visibility.
 * Checks onboarding completion + AsyncStorage flag to decide
 * whether to show the permission prompt on the dashboard.
 *
 * @module useSmsSync
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { useCurrentUser } from "./useCurrentUser";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SMS_PROMPT_SHOWN_KEY = "@monyvi/sms-prompt-shown";
const SMS_LAST_SYNC_KEY = "@monyvi/sms-last-sync";
const SMS_HAS_SYNCED_KEY = "@monyvi/sms-has-synced";

interface StoredSmsSyncState {
  readonly wasPromptShown: boolean;
  readonly hasSynced: boolean;
  readonly lastSyncTimestamp: number | null;
}

function getUserScopedKey(baseKey: string, userId: string): string {
  return `${baseKey}:${userId}`;
}

async function readStoredSmsSyncState(
  userId: string
): Promise<StoredSmsSyncState> {
  const [promptShown, hasSyncedValue, lastSync] = await AsyncStorage.multiGet([
    getUserScopedKey(SMS_PROMPT_SHOWN_KEY, userId),
    getUserScopedKey(SMS_HAS_SYNCED_KEY, userId),
    getUserScopedKey(SMS_LAST_SYNC_KEY, userId),
  ]);

  return {
    wasPromptShown: promptShown[1] === "true",
    hasSynced: hasSyncedValue[1] === "true",
    lastSyncTimestamp: lastSync[1] ? parseInt(lastSync[1], 10) : null,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseSmsSyncResult {
  /** Whether the SMS permission prompt should be shown */
  readonly shouldShowPrompt: boolean;
  /** Whether the user has completed at least one sync */
  readonly hasSynced: boolean;
  /** Timestamp of last successful sync (ms) or null */
  readonly lastSyncTimestamp: number | null;
  /** Mark the prompt as shown (dismiss it) */
  readonly dismissPrompt: () => Promise<void>;
  /** Update sync state after successful scan */
  readonly markSyncComplete: () => Promise<void>;
  /** Whether state is still loading from AsyncStorage */
  readonly isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSmsSync(): UseSmsSyncResult {
  const { userId, isResolvingUser } = useCurrentUser();
  const [shouldShowPrompt, setShouldShowPrompt] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState<string | null | undefined>(
    undefined
  );

  useEffect(() => {
    let isCancelled = false;

    setShouldShowPrompt(false);
    setHasSynced(false);
    setLastSyncTimestamp(null);
    setIsLoading(true);
    setLoadedUserId(undefined);

    async function loadState(): Promise<void> {
      if (isResolvingUser) return;
      if (Platform.OS !== "android" || userId === null) {
        if (!isCancelled) {
          setLoadedUserId(userId);
          setIsLoading(false);
        }
        return;
      }

      try {
        const storedState = await readStoredSmsSyncState(userId);
        if (isCancelled) return;

        setHasSynced(storedState.hasSynced);
        setLastSyncTimestamp(storedState.lastSyncTimestamp);
        setShouldShowPrompt(
          !storedState.wasPromptShown && !storedState.hasSynced
        );
      } catch {
        if (!isCancelled) setShouldShowPrompt(false);
      } finally {
        if (!isCancelled) {
          setLoadedUserId(userId);
          setIsLoading(false);
        }
      }
    }

    loadState().catch(() => {
      if (!isCancelled) {
        setLoadedUserId(userId);
        setIsLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isResolvingUser, userId]);

  const dismissPrompt = useCallback(async (): Promise<void> => {
    if (userId === null) return;

    setShouldShowPrompt(false);
    try {
      await AsyncStorage.setItem(
        getUserScopedKey(SMS_PROMPT_SHOWN_KEY, userId),
        "true"
      );
    } catch {
      // The prompt may appear again next time if local persistence fails.
    }
  }, [userId]);

  const markSyncComplete = useCallback(async (): Promise<void> => {
    if (userId === null) return;

    const now = Date.now();
    setHasSynced(true);
    setLastSyncTimestamp(now);
    setShouldShowPrompt(false);

    try {
      await AsyncStorage.multiSet([
        [getUserScopedKey(SMS_PROMPT_SHOWN_KEY, userId), "true"],
        [getUserScopedKey(SMS_HAS_SYNCED_KEY, userId), "true"],
        [getUserScopedKey(SMS_LAST_SYNC_KEY, userId), String(now)],
      ]);
    } catch {
      // In-memory state remains valid for the current session.
    }
  }, [userId]);

  const isLoadedForCurrentUser =
    !isResolvingUser && loadedUserId !== undefined && loadedUserId === userId;

  return {
    shouldShowPrompt: isLoadedForCurrentUser ? shouldShowPrompt : false,
    hasSynced: isLoadedForCurrentUser ? hasSynced : false,
    lastSyncTimestamp: isLoadedForCurrentUser ? lastSyncTimestamp : null,
    dismissPrompt,
    markSyncComplete,
    isLoading: !isLoadedForCurrentUser || isLoading,
  };
}
