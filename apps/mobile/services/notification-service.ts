/**
 * Notification Service
 *
 * Manages expo-notifications lifecycle for SMS transaction detection:
 * - Android notification channel setup
 * - Notification category with Confirm/Discard actions
 * - Show transaction notifications with action buttons
 * - Handle notification responses (action taps)
 *
 * Architecture & Design Rationale:
 * - Pattern: Observer Pattern (event-driven notification responses)
 * - Why: Decouples notification presentation from action handling.
 *   Notification categories define reusable action sets.
 * - SOLID: SRP — only handles notification lifecycle, not parsing or DB.
 *
 * @module notification-service
 */

import type * as ExpoNotifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import { getRequiredCurrentUserId } from "@/services/user-data-access";
import { logger } from "@/utils/logger";
import { redactIdentifierForLog } from "@/utils/logger-redaction";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Android notification channel ID for SMS transactions */
const SMS_CHANNEL_ID = "sms-transactions";

/** Notification category identifier for transaction confirm/discard */
const SMS_TRANSACTION_CATEGORY = "SMS_TRANSACTION";

/** Action identifiers for notification buttons */
const ACTION_CONFIRM = "CONFIRM";
const ACTION_DISCARD = "DISCARD";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payload embedded in notification data for handler retrieval */
export interface TransactionNotificationPayload {
  readonly type: "sms_transaction";
  readonly transactionData: NotificationParsedSmsTransaction;
  readonly resolvedAccountId: string;
  readonly resolvedAccountName: string;
  readonly initiatingUserId: string;
}

interface TransactionInfoNotificationPayload {
  readonly type: "sms_transaction_created" | "sms_transaction_info";
  readonly transactionData: NotificationParsedSmsTransaction;
  readonly resolvedAccountName: string;
}

export type NotificationParsedSmsTransaction = Omit<
  ParsedSmsTransaction,
  "date" | "rawSmsBody"
> & {
  readonly date: Date | string | number | null;
};

/** Callback for handling notification action responses */
type NotificationActionHandler = (
  actionId: string,
  payload: TransactionNotificationPayload
) => Promise<void>;

type NotificationsModule = typeof ExpoNotifications;
type NotificationResponse = ExpoNotifications.NotificationResponse;
type NotificationSubscription = ExpoNotifications.Subscription;

export type NotificationPermissionStatus =
  | "undetermined"
  | "granted"
  | "denied"
  | "blocked";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let isInitialized = false;
let actionHandler: NotificationActionHandler | null = null;
let notificationsModule: NotificationsModule | null = null;
let responseSubscription: NotificationSubscription | null = null;
const handledNotificationKeys = new Set<string>();
let responseRegistrationId = 0;

const MAX_HANDLED_NOTIFICATION_KEYS = 200;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

function getNotifications(): NotificationsModule {
  if (notificationsModule) {
    return notificationsModule;
  }

  // Lazy-load expo-notifications so app startup can render before this native
  // module's event emitter is touched by the JS runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  notificationsModule = require("expo-notifications") as NotificationsModule;
  return notificationsModule;
}

/**
 * Check whether the app can show local notifications.
 */
export async function hasNotificationPermission(): Promise<boolean> {
  const permissions = await getNotifications().getPermissionsAsync();
  return permissions.granted;
}

/**
 * Check notification permission without showing the native permission prompt.
 */
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const Notifications = getNotifications();
  const permissions = await Notifications.getPermissionsAsync();

  if (permissions.granted) {
    return "granted";
  }

  if (!permissions.canAskAgain) {
    return "blocked";
  }

  return permissions.status === Notifications.PermissionStatus.UNDETERMINED
    ? "undetermined"
    : "denied";
}

/**
 * Request notification permission when enabling notification-backed features.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const status = await requestNotificationPermissionStatus();
  return status === "granted";
}

/**
 * Request notification permission and preserve whether the user can recover
 * through the native prompt or must open app settings.
 */
export async function requestNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const Notifications = getNotifications();
  const existing = await Notifications.getPermissionsAsync();

  if (existing.granted) {
    return "granted";
  }

  if (!existing.canAskAgain) {
    return "blocked";
  }

  const requested = await Notifications.requestPermissionsAsync();
  if (requested.granted) {
    return "granted";
  }

  return requested.canAskAgain ? "denied" : "blocked";
}

/**
 * Open app settings so users can manually enable notification permission.
 */
export async function openNotificationSettings(): Promise<void> {
  await Linking.openSettings();
}

/**
 * Initialize the notification service.
 * Sets up the Android channel, notification category with actions,
 * and foreground notification behavior.
 *
 * Must be called once at app startup (from _layout.tsx).
 * Idempotent — safe to call multiple times.
 */
export async function initializeNotifications(): Promise<void> {
  if (isInitialized) {
    return;
  }

  const Notifications = getNotifications();

  // Configure foreground notification behavior
  Notifications.setNotificationHandler({
    // eslint-disable-next-line @typescript-eslint/require-await -- expo API requires Promise<NotificationBehavior>
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Create Android notification channel (no-op on iOS)
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(SMS_CHANNEL_ID, {
      name: "SMS Transactions",
      description: "Notifications for detected financial SMS transactions",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#10B981",
    });
  }

  // Register notification category with Confirm/Discard actions
  await Notifications.setNotificationCategoryAsync(SMS_TRANSACTION_CATEGORY, [
    {
      identifier: ACTION_CONFIRM,
      buttonTitle: "✓ Confirm",
      options: {
        opensAppToForeground: true,
      },
    },
    {
      identifier: ACTION_DISCARD,
      buttonTitle: "✗ Discard",
      options: {
        opensAppToForeground: true,
        isDestructive: true,
      },
    },
  ]);

  isInitialized = true;
}

// ---------------------------------------------------------------------------
// Response Handling
// ---------------------------------------------------------------------------

/**
 * Register a handler for notification action responses.
 * Called when the user taps Confirm or Discard on a transaction notification.
 *
 * @param handler - Async function receiving actionId and transaction payload
 * @returns Cleanup function to unsubscribe
 */
export function registerNotificationActionHandler(
  handler: NotificationActionHandler
): () => void {
  actionHandler = handler;
  responseRegistrationId += 1;
  const registrationId = responseRegistrationId;
  const Notifications = getNotifications();

  // Remove previous subscription if any
  if (responseSubscription) {
    responseSubscription.remove();
  }

  responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      void handleNotificationActionResponse(response);
    }
  );

  void replayLastNotificationResponse(registrationId);

  return () => {
    responseRegistrationId += 1;
    if (responseSubscription) {
      responseSubscription.remove();
      responseSubscription = null;
    }
    actionHandler = null;
  };
}

async function handleNotificationActionResponse(
  response: NotificationResponse
): Promise<boolean> {
  const Notifications = getNotifications();
  const actionId = response.actionIdentifier;
  const data = response.notification.request.content
    .data as unknown as TransactionNotificationPayload;

  // Only handle our SMS transaction notifications
  if (data?.type !== "sms_transaction") {
    return false;
  }

  // Ignore default tap (no action button pressed)
  if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER || !actionHandler) {
    return true;
  }

  const notificationId = response.notification.request.identifier;
  const notificationKey =
    data.transactionData.smsFingerprint ??
    response.notification.request.identifier;

  if (!markNotificationKeyHandled(notificationKey)) {
    await dismissDeliveredNotification(notificationId);
    return true;
  }

  try {
    await actionHandler(actionId, data);
    await dismissDeliveredNotification(notificationId);
  } catch (err: unknown) {
    handledNotificationKeys.delete(notificationKey);
    logger.error("[notification-service] Action handler failed", err, {
      actionId,
      redactedNotificationId: redactIdentifierForLog(notificationId),
      redactedSmsFingerprint: redactIdentifierForLog(
        data.transactionData.smsFingerprint
      ),
    });
    return false;
  }
  return true;
}

async function replayLastNotificationResponse(
  registrationId: number
): Promise<void> {
  try {
    const Notifications = getNotifications();
    const response = await Notifications.getLastNotificationResponseAsync();
    if (responseRegistrationId !== registrationId || !response) {
      return;
    }

    const didHandleResponse = await handleNotificationActionResponse(response);
    if (didHandleResponse) {
      await Notifications.clearLastNotificationResponseAsync();
    }
  } catch (err: unknown) {
    logger.error("[notification-service] Failed to replay notification", err);
  }
}

function markNotificationKeyHandled(notificationKey: string): boolean {
  if (handledNotificationKeys.has(notificationKey)) {
    return false;
  }

  handledNotificationKeys.add(notificationKey);

  if (handledNotificationKeys.size > MAX_HANDLED_NOTIFICATION_KEYS) {
    const oldestKey = handledNotificationKeys.values().next().value;
    if (typeof oldestKey === "string") {
      handledNotificationKeys.delete(oldestKey);
    }
  }

  return true;
}

export function clearHandledNotificationKeysForTests(): void {
  if (!__DEV__) {
    return;
  }

  handledNotificationKeys.clear();
}

export function resetNotificationServiceForTests(): void {
  if (!__DEV__) {
    return;
  }

  isInitialized = false;
  actionHandler = null;
  notificationsModule = null;
  responseRegistrationId = 0;
  handledNotificationKeys.clear();
  if (responseSubscription) {
    responseSubscription.remove();
    responseSubscription = null;
  }
}

async function dismissDeliveredNotification(
  notificationId: string
): Promise<void> {
  try {
    await getNotifications().dismissNotificationAsync(notificationId);
  } catch (err: unknown) {
    logger.error("[notification-service] Failed to dismiss notification", err, {
      redactedNotificationId: redactIdentifierForLog(notificationId),
    });
  }
}

// ---------------------------------------------------------------------------
// Show Notification
// ---------------------------------------------------------------------------

/**
 * Format a currency amount for display in notification.
 */
function formatAmount(amount: number, currency: string): string {
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

function serializeTransactionData(
  parsed: ParsedSmsTransaction
): NotificationParsedSmsTransaction {
  const { rawSmsBody: _rawSmsBody, date, ...transactionData } = parsed;
  return {
    ...transactionData,
    date: date.toISOString(),
  };
}

/**
 * Show a local notification for a detected SMS transaction.
 *
 * Displays the transaction summary with Confirm/Discard action buttons.
 *
 * @param parsed         - The parsed SMS transaction
 * @param resolvedAccountId   - ID of the resolved target account
 * @param resolvedAccountName - Display name of the resolved account
 * @param initiatingUserId    - Authenticated user who initiated live parsing
 */
export async function showTransactionNotification(
  parsed: ParsedSmsTransaction,
  resolvedAccountId: string,
  resolvedAccountName: string,
  initiatingUserId: string
): Promise<void> {
  await initializeNotifications();

  const canShowNotification = await hasNotificationPermission();
  if (!canShowNotification) {
    logger.warn(
      "[notification-service] Notification permission denied; SMS notification skipped"
    );
    return;
  }

  const isExpense = parsed.type === "EXPENSE";
  const typeEmoji = isExpense ? "💸" : "💰";
  const typeLabel = isExpense ? "Expense" : "Income";

  const title = `${typeEmoji} ${typeLabel} Detected`;
  const body = [
    `${formatAmount(parsed.amount, parsed.currency)} from ${parsed.senderDisplayName}`,
    parsed.counterparty ? `To: ${parsed.counterparty}` : undefined,
    `Account: ${resolvedAccountName}`,
  ]
    .filter(Boolean)
    .join("\n");

  const payload: TransactionNotificationPayload = {
    type: "sms_transaction",
    transactionData: serializeTransactionData(parsed),
    resolvedAccountId,
    resolvedAccountName,
    initiatingUserId,
  };

  try {
    if ((await getRequiredCurrentUserId()) !== initiatingUserId) return;
  } catch {
    return;
  }

  await getNotifications().scheduleNotificationAsync({
    identifier: `sms-transaction-${parsed.smsFingerprint}`,
    content: {
      title,
      body,
      categoryIdentifier: SMS_TRANSACTION_CATEGORY,
      data: payload as unknown as Record<string, unknown>,
      sound: "default",
    },
    trigger: Platform.OS === "android" ? { channelId: SMS_CHANNEL_ID } : null,
  });
}

/**
 * Show an info-only notification after auto-confirm creates a transaction.
 */
export async function showTransactionCreatedNotification(
  parsed: ParsedSmsTransaction,
  resolvedAccountName: string,
  initiatingUserId: string
): Promise<void> {
  await showInfoOnlySmsTransactionNotification({
    parsed,
    resolvedAccountName,
    initiatingUserId,
    identifierPrefix: "sms-transaction-created",
    title: "Transaction created",
    type: "sms_transaction_created",
  });
}

/**
 * Show an info-only notification when an SMS was detected but no account could
 * be matched safely.
 */
export async function showTransactionNeedsAccountNotification(
  parsed: ParsedSmsTransaction,
  initiatingUserId: string
): Promise<void> {
  await showInfoOnlySmsTransactionNotification({
    parsed,
    resolvedAccountName: "No Account Configured",
    initiatingUserId,
    identifierPrefix: "sms-transaction-info",
    title: "Transaction needs an account",
    type: "sms_transaction_info",
  });
}

async function showInfoOnlySmsTransactionNotification({
  parsed,
  resolvedAccountName,
  initiatingUserId,
  identifierPrefix,
  title,
  type,
}: {
  readonly parsed: ParsedSmsTransaction;
  readonly resolvedAccountName: string;
  readonly initiatingUserId: string;
  readonly identifierPrefix: string;
  readonly title: string;
  readonly type: TransactionInfoNotificationPayload["type"];
}): Promise<void> {
  await initializeNotifications();

  const canShowNotification = await hasNotificationPermission();
  if (!canShowNotification) {
    logger.warn(
      "[notification-service] Notification permission denied; SMS notification skipped"
    );
    return;
  }

  const body = [
    `${formatAmount(parsed.amount, parsed.currency)} from ${parsed.senderDisplayName}`,
    parsed.counterparty ? `To: ${parsed.counterparty}` : undefined,
    `Account: ${resolvedAccountName}`,
  ]
    .filter(Boolean)
    .join("\n");
  const payload: TransactionInfoNotificationPayload = {
    type,
    transactionData: serializeTransactionData(parsed),
    resolvedAccountName,
  };

  try {
    if ((await getRequiredCurrentUserId()) !== initiatingUserId) return;
  } catch {
    return;
  }

  await getNotifications().scheduleNotificationAsync({
    identifier: `${identifierPrefix}-${parsed.smsFingerprint}`,
    content: {
      title,
      body,
      categoryIdentifier: undefined,
      data: payload as unknown as Record<string, unknown>,
      sound: "default",
    },
    trigger: Platform.OS === "android" ? { channelId: SMS_CHANNEL_ID } : null,
  });
}

// ---------------------------------------------------------------------------
// Constants re-exports for handler consumers
// ---------------------------------------------------------------------------

export { ACTION_CONFIRM, ACTION_DISCARD };
