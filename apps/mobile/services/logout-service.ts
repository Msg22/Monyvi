/**
 * Logout Service
 *
 * Orchestrates the full logout sequence: sync, then destroy session.
 * Implements the Facade pattern so components call a single function.
 *
 * @module logout-service
 */

import type { Database } from "@nozbe/watermelondb";
import { fetch } from "@react-native-community/netinfo";
import { coordinatedSignOut } from "./supabase";
import { getActiveSyncPromise, syncDatabase } from "./sync";
import {
  setAutoConfirm,
  setLiveDetectionEnabled,
} from "./sms-live-detection-handler";
import { stopSmsListener } from "./sms-live-listener-service";
import { logger } from "@/utils/logger";

// =============================================================================
// Types
// =============================================================================

/** Result of the `performLogout` function. */
interface LogoutResult {
  /** Whether the logout completed successfully. */
  readonly success: boolean;
  /** If `success` is false, the reason for failure. */
  readonly error?: "no_network" | "sync_failed" | "unknown";
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of sync retry attempts before giving up. */
const MAX_SYNC_RETRIES = 1;

/** Maximum time (ms) to wait for an in-flight sync before abandoning it. */
const ACTIVE_SYNC_TIMEOUT_MS = 10_000;

// =============================================================================
// Core Logout Functions
// =============================================================================

/**
 * Perform the full logout sequence for a signed-in user.
 *
 * Steps:
 * 1. Verify network connectivity
 * 2. Await any in-flight sync, then run a fresh sync (retry once on failure)
 * 3. Destroy Supabase session
 *
 * @param database - The WatermelonDB database instance
 * @param forceSkipSync - If true, skip sync entirely (used after user acknowledges data loss risk)
 * @returns LogoutResult indicating success or the reason for failure
 */
export async function performLogout(
  database: Database,
  forceSkipSync = false
): Promise<LogoutResult> {
  try {
    if (!forceSkipSync) {
      const networkState = await fetch();
      if (!networkState.isConnected) {
        return { success: false, error: "no_network" };
      }

      const syncSucceeded = await attemptSync(database);
      if (!syncSucceeded) {
        return { success: false, error: "sync_failed" };
      }
    }

    await disableLiveSmsAutomationSafely();
    await destroySession();

    return { success: true };
  } catch {
    // TODO: Replace with structured logging (e.g., Sentry)
    return { success: false, error: "unknown" };
  }
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Attempt to sync local data to the server, with one retry on failure.
 *
 * @param database - The WatermelonDB database instance
 * @returns true if sync succeeded, false if it failed after retries
 */
async function attemptSync(database: Database): Promise<boolean> {
  const activeSync = getActiveSyncPromise();
  if (activeSync) {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error("Active sync timed out"));
        }, ACTIVE_SYNC_TIMEOUT_MS);
      });
      await Promise.race([activeSync, timeout]);
    } catch {
      // Active sync failed or timed out; try a fresh sync below.
    } finally {
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt++) {
    try {
      await syncDatabase(database);
      return true;
    } catch {
      const isLastAttempt = attempt === MAX_SYNC_RETRIES;
      if (isLastAttempt) {
        // TODO: Replace with structured logging (e.g., Sentry)
        return false;
      }
      // TODO: Replace with structured logging (e.g., Sentry)
    }
  }

  return false;
}

async function disableLiveSmsAutomation(): Promise<void> {
  stopSmsListener();
  await setLiveDetectionEnabled(false);
  await setAutoConfirm(false);
}

async function disableLiveSmsAutomationSafely(): Promise<void> {
  try {
    await disableLiveSmsAutomation();
  } catch (error: unknown) {
    logger.error("logout.disableLiveSmsAutomation.failed", error);
  }
}

/**
 * Destroy the current Supabase session. Session becomes null.
 */
async function destroySession(): Promise<void> {
  const { error } = await coordinatedSignOut();
  if (error) {
    throw error;
  }
}
