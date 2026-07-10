/**
 * SMS Live Detection Handler
 *
 * Shared orchestrator used by both Tier 1 (JS-level listener) and
 * Tier 2 (Headless JS from BroadcastReceiver) to process detected
 * financial SMS transactions.
 *
 * Flow: parse result → resolve account → check preference → notify or save
 *
 * Architecture & Design Rationale:
 * - Pattern: Mediator (coordinates notification, resolution, and save)
 * - Why: Single entry point for all detected SMS regardless of source.
 *   Both tiers share identical business logic.
 * - SOLID: SRP — orchestration only. Delegates to specialized services
 *   for resolution, notification, and persistence.
 *
 * @module sms-live-detection-handler
 */

import type { ParsedSmsTransaction } from "@monyvi/logic";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PermissionsAndroid, Platform } from "react-native";
import {
  ACTION_CONFIRM,
  type NotificationParsedSmsTransaction,
  getNotificationPermissionStatus,
  registerNotificationActionHandler,
  showTransactionCreatedNotification,
  showTransactionNeedsAccountNotification,
  showTransactionNotification,
} from "./notification-service";
import { resolveAccountForSms } from "./sms-account-resolver";
import { hasExistingSmsFingerprint } from "./sms-dedup-service";
import { getCurrentUserId } from "./supabase";
import { createTransaction } from "./transaction-service";
import { createSmsAtmTransfer } from "./transfer-service";
import { logger } from "@/utils/logger";
import { redactIdentifierForLog } from "@/utils/logger-redaction";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** AsyncStorage key for the auto-confirm preference */
const AUTO_CONFIRM_KEY_PREFIX = "@monyvi/sms_auto_confirm";

/** AsyncStorage key for the live detection enabled preference */
const LIVE_DETECTION_KEY_PREFIX = "@monyvi/sms_live_detection_enabled";

const LIVE_SMS_PERMISSIONS = [
  PermissionsAndroid.PERMISSIONS.READ_SMS,
  PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
] as const;

type SaveableDetectedSmsTransaction = Omit<ParsedSmsTransaction, "rawSmsBody">;

// ---------------------------------------------------------------------------
// T046: Review page conflict — queue management
// ---------------------------------------------------------------------------

/**
 * When the user is on the SMS review page, incoming transactions are
 * queued here instead of triggering notifications.
 */
let reviewingActive = false;
const transactionQueue: ParsedSmsTransaction[] = [];
const smsSaveLocks = new Map<string, Promise<void>>();

function restoreNotificationTransactionDate(
  parsed: NotificationParsedSmsTransaction
): SaveableDetectedSmsTransaction {
  const parsedDate = parsed.date;

  if (parsedDate instanceof Date) {
    return { ...parsed, date: parsedDate };
  }

  if (typeof parsedDate === "string" || typeof parsedDate === "number") {
    const date = new Date(parsedDate);
    if (!Number.isNaN(date.getTime())) {
      return { ...parsed, date };
    }
  }

  return { ...parsed, date: new Date() };
}

async function getUserScopedPreferenceKey(
  keyPrefix: string
): Promise<string | null> {
  const userId = (await getCurrentUserId())?.trim();
  return userId ? `${keyPrefix}:${userId}` : null;
}

async function withSmsSaveLock(
  smsFingerprint: string,
  operation: () => Promise<boolean>
): Promise<boolean> {
  const previous = smsSaveLocks.get(smsFingerprint) ?? Promise.resolve();
  let releaseCurrentLock: () => void = () => {};
  const current = previous
    .catch(() => undefined)
    .then(
      () =>
        new Promise<void>((resolve) => {
          releaseCurrentLock = resolve;
        })
    );

  smsSaveLocks.set(smsFingerprint, current);
  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseCurrentLock();
    if (smsSaveLocks.get(smsFingerprint) === current) {
      smsSaveLocks.delete(smsFingerprint);
    }
  }
}

// ---------------------------------------------------------------------------
// Preference helpers
// ---------------------------------------------------------------------------

/**
 * Check whether auto-confirm is enabled.
 * Defaults to false (ask me each time).
 */
export async function isAutoConfirmEnabled(): Promise<boolean> {
  const key = await getUserScopedPreferenceKey(AUTO_CONFIRM_KEY_PREFIX);
  if (!key) {
    return false;
  }

  const value = await AsyncStorage.getItem(key);
  return value === "true";
}

/**
 * Set the auto-confirm preference.
 */
export async function setAutoConfirm(enabled: boolean): Promise<void> {
  const key = await getUserScopedPreferenceKey(AUTO_CONFIRM_KEY_PREFIX);
  if (!key) {
    return;
  }

  await AsyncStorage.setItem(key, String(enabled));
}

/**
 * Check whether live SMS detection is enabled.
 * Defaults to false (opt-in).
 */
export async function isLiveDetectionEnabled(): Promise<boolean> {
  const key = await getUserScopedPreferenceKey(LIVE_DETECTION_KEY_PREFIX);
  if (!key) {
    return false;
  }

  const value = await AsyncStorage.getItem(key);
  return value === "true";
}

/**
 * Set the live detection enabled preference.
 */
export async function setLiveDetectionEnabled(enabled: boolean): Promise<void> {
  const key = await getUserScopedPreferenceKey(LIVE_DETECTION_KEY_PREFIX);
  if (!key) {
    return;
  }

  await AsyncStorage.setItem(key, String(enabled));
}

/**
 * Check whether all runtime permissions needed by live detection are present.
 */
export async function canLiveDetectionRun(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }

  const [hasSmsPermissions, notificationStatus] = await Promise.all([
    Promise.all(
      LIVE_SMS_PERMISSIONS.map((permission) =>
        PermissionsAndroid.check(permission)
      )
    ).then((statuses) => statuses.every(Boolean)),
    getNotificationPermissionStatus(),
  ]);

  return hasSmsPermissions && notificationStatus === "granted";
}

/**
 * Keep the stored live detection preference honest.
 *
 * If the user revoked SMS or notification permission outside this screen, the
 * stored toggle is turned off so startup/resume never leaves a dead listener
 * state behind.
 */
export async function reconcileLiveDetectionPreference(): Promise<boolean> {
  const enabled = await isLiveDetectionEnabled();

  if (!enabled) {
    return false;
  }

  const canRun = await canLiveDetectionRun();

  if (canRun) {
    return true;
  }

  await setLiveDetectionEnabled(false);
  await setAutoConfirm(false);
  return false;
}

// ---------------------------------------------------------------------------
// Transaction saving
// ---------------------------------------------------------------------------

/**
 * Save a detected SMS transaction to the database.
 */
async function saveDetectedTransaction(
  parsed: SaveableDetectedSmsTransaction,
  accountId: string
): Promise<boolean> {
  return withSmsSaveLock(parsed.smsFingerprint, () =>
    saveDetectedTransactionWithoutLock(parsed, accountId)
  );
}

async function saveDetectedTransactionWithoutLock(
  parsed: SaveableDetectedSmsTransaction,
  accountId: string
): Promise<boolean> {
  if (await hasExistingSmsFingerprint(parsed.smsFingerprint)) {
    logger.info("smsDetection.duplicateSkipped", {
      redactedSmsFingerprint: redactIdentifierForLog(parsed.smsFingerprint),
    });
    return false;
  }

  // ATM withdrawals: route as bank → cash transfer
  if (parsed.isAtmWithdrawal) {
    const result = await createSmsAtmTransfer({
      bankAccountId: accountId,
      amount: parsed.amount,
      currency: parsed.currency,
      date: parsed.date,
      smsFingerprint: parsed.smsFingerprint,
      senderDisplayName: parsed.senderDisplayName,
    });

    if (!result.success) {
      throw new Error(
        `[sms-detection] ATM transfer failed: ${result.error ?? "unknown error"}`
      );
    }

    logger.info("smsDetection.atmTransferSaved", {
      currency: parsed.currency,
      redactedSmsFingerprint: redactIdentifierForLog(parsed.smsFingerprint),
    });
    return true;
  }

  // Regular transactions
  await createTransaction({
    amount: parsed.amount,
    currency: parsed.currency,
    categoryId: parsed.categoryId,
    counterparty: parsed.counterparty || undefined,
    accountId,
    note: `[SMS] ${parsed.merchant ?? parsed.senderDisplayName}`,
    type: parsed.type,
    date: parsed.date,
    source: "SMS",
    smsFingerprint: parsed.smsFingerprint,
  });

  logger.info("smsDetection.transactionSaved", {
    currency: parsed.currency,
    type: parsed.type,
    redactedSmsFingerprint: redactIdentifierForLog(parsed.smsFingerprint),
  });
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Handle a detected financial SMS transaction.
 *
 * Called from both the Tier 1 JS listener and Tier 2 Headless JS task.
 *
 * Flow:
 * 1. Resolve target account via bank_details chain
 * 2. Check auto-confirm preference
 * 3. Auto-confirm safe suggestions → save directly
 * 4. Ask me or needs-review → show notification with Confirm/Discard actions
 * 5. If no account resolved → show notification asking to configure
 *
 * @param parsed - The parser-produced SMS transaction
 */
export async function handleDetectedSms(
  parsed: ParsedSmsTransaction
): Promise<void> {
  // T046: Queue if the user is on the review page
  if (reviewingActive) {
    transactionQueue.push(parsed);
    logger.info("smsDetection.transactionQueued", {
      type: parsed.type,
      redactedSmsFingerprint: redactIdentifierForLog(parsed.smsFingerprint),
    });
    return;
  }

  try {
    // Step 1: Resolve account using sender, parser hints, and raw SMS fallback
    const resolved = await resolveAccountForSms(
      parsed.senderDisplayName,
      parsed.rawSmsBody,
      parsed.currency,
      parsed.cardLast4
    );

    if (!resolved) {
      // No account configured: show notification asking to set up.
      logger.warn("smsDetection.accountResolutionMissing", {
        currency: parsed.currency,
        hasSenderDisplayName: parsed.senderDisplayName.trim().length > 0,
        redactedSmsFingerprint: redactIdentifierForLog(parsed.smsFingerprint),
      });
      await showTransactionNeedsAccountNotification(parsed);
      return;
    }

    // Step 2: Check preference
    const autoConfirm = await isAutoConfirmEnabled();
    const requiresReview =
      parsed.reviewStatus === "needs_review" ||
      (parsed.reviewReasons?.length ?? 0) > 0;

    if (autoConfirm && !requiresReview) {
      // Step 3: Auto-confirm — save directly
      const didSave = await saveDetectedTransaction(parsed, resolved.accountId);
      if (didSave) {
        await showTransactionCreatedNotification(parsed, resolved.accountName);
      }
    } else {
      // Step 4: Ask me — show notification
      await showTransactionNotification(
        parsed,
        resolved.accountId,
        resolved.accountName
      );
    }
  } catch (err) {
    logger.error("smsDetection.handleFailed", err, {
      redactedSmsFingerprint: redactIdentifierForLog(parsed.smsFingerprint),
    });
  }
}

/**
 * Initialize the notification action handler for Confirm/Discard responses.
 *
 * Must be called once at app startup. When the user taps "Confirm" on a
 * transaction notification, the transaction is saved to the database.
 * "Discard" simply dismisses the notification (no-op).
 *
 * @returns Cleanup function to unsubscribe
 */
export function initializeDetectionActionHandler(): () => void {
  return registerNotificationActionHandler(async (actionId, payload) => {
    if (actionId === ACTION_CONFIRM && payload.resolvedAccountId) {
      await saveDetectedTransaction(
        restoreNotificationTransactionDate(payload.transactionData),
        payload.resolvedAccountId
      );
    }
    // ACTION_DISCARD is a no-op — notification is auto-dismissed
  });
}

// ---------------------------------------------------------------------------
// T046: Review page conflict — public API
// ---------------------------------------------------------------------------

/**
 * Mark the review page as active / inactive.
 * While active, incoming live-detected transactions are queued
 * instead of triggering notifications.
 *
 * Call with `true` on review page mount, `false` on unmount.
 */
export function setReviewingActive(active: boolean): void {
  reviewingActive = active;
}

/**
 * Process any transactions that were queued while the review page
 * was active. Call this after the review page is dismissed.
 *
 * @returns The number of transactions that were flushed
 */
export async function flushQueuedTransactions(): Promise<number> {
  if (transactionQueue.length === 0) {
    return 0;
  }

  const queued = transactionQueue.splice(0);
  logger.info("smsDetection.flushingQueuedTransactions", {
    count: queued.length,
  });

  for (const parsed of queued) {
    await handleDetectedSms(parsed);
  }

  return queued.length;
}
