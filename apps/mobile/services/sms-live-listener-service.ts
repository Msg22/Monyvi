/**
 * SMS Live Listener Service
 *
 * Subscribes to native SMS events emitted by SmsEventModule (via the
 * SmsBroadcastReceiver) when the app process is alive. Filters incoming
 * SMS with on-device keyword filter, sends financial candidates to AI
 * for parsing, and notifies registered handlers.
 *
 * Architecture & Design Rationale:
 * - Pattern: Observer Pattern (event subscription with typed handlers)
 * - Why: Decouples SMS reception from processing. Multiple consumers
 *   can subscribe without modifying the listener itself.
 * - SOLID: SRP — only manages the native SMS event subscription.
 *   All parsing and notification logic lives in detection handler.
 * - Change: Replaced RegexSmsParser with keyword filter + AI Edge Function.
 *
 * @module sms-live-listener-service
 */

import { type ParsedSmsTransaction } from "@monyvi/logic";
import {
  DeviceEventEmitter,
  type EmitterSubscription,
  NativeModules,
  Platform,
} from "react-native";
import { processLiveSmsEvent } from "./sms-live-processor";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback for detected financial SMS transactions */
type LiveSmsEventHandler = (
  parsed: ParsedSmsTransaction,
  userId: string
) => void;

/** SMS data shape emitted by native SmsEventModule */
interface NativeSmsEvent {
  readonly sender: string;
  readonly body: string;
  readonly timestamp: number;
}

interface NativeSmsModules {
  readonly SmsEventModule?: {
    readonly getConstants?: () => unknown;
    readonly setListenerReady?: (isReady: boolean) => Promise<void> | void;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Event name matching SmsEventModule.EVENT_NAME in Kotlin */
const NATIVE_SMS_EVENT = "onSmsReceived";

/** Max recent fingerprints to track (prevents memory leak) */
const MAX_RECENT_FINGERPRINTS = 200;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let isListening = false;
let nativeSubscription: EmitterSubscription | null = null;
const handlers = new Set<LiveSmsEventHandler>();

/** Track recently processed fingerprints to avoid duplicates within a session */
const recentFingerprints = new Set<string>();

// ---------------------------------------------------------------------------
// Internal processing
// ---------------------------------------------------------------------------

/**
 * Touch the native module before subscribing so React Native creates the
 * SmsEventModule instance and its initialize() stores ReactApplicationContext.
 */
function ensureSmsEventModuleInitialized(): void {
  const { SmsEventModule } = NativeModules as NativeSmsModules;

  if (!SmsEventModule) {
    logger.warn("smsLiveListener.nativeModuleUnavailable");
    return;
  }

  SmsEventModule.getConstants?.();
}

function setNativeListenerReady(isReady: boolean): void {
  const { SmsEventModule } = NativeModules as NativeSmsModules;
  const result = SmsEventModule?.setListenerReady?.(isReady);

  if (result && typeof result.catch === "function") {
    result.catch((error: unknown) => {
      logger.warn("smsLiveListener.listenerReadyFlagFailed", {
        isReady,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

/**
 * Process an incoming SMS event from native:
 * 1. Keyword filter for financial relevance
 * 2. If financial, compute hash for dedup
 * 3. Send to AI Edge Function for parsing
 * 4. Emit to registered handlers
 */
async function processNativeSmsEvent(event: NativeSmsEvent): Promise<void> {
  try {
    const result = await processLiveSmsEvent(
      { ...event, deliveryMode: "foreground" },
      {
        isRecentlyProcessed: (smsFingerprint) =>
          recentFingerprints.has(smsFingerprint),
        markRecentlyProcessed,
      }
    );

    if (result.status === "disabled") {
      stopSmsListener();
      return;
    }

    // Step 4: Emit parsed transactions to all registered handlers
    if (result.status !== "parsed" || result.userId === undefined) return;

    for (const parsed of result.transactions) {
      for (const handler of handlers) {
        handler(parsed, result.userId);
      }
    }
  } catch (err) {
    logger.error("smsLiveListener.processNativeEventFailed", err);
  }
}

function markRecentlyProcessed(smsFingerprint: string): void {
  recentFingerprints.add(smsFingerprint);

  if (recentFingerprints.size > MAX_RECENT_FINGERPRINTS) {
    const iterator = recentFingerprints.values();
    const firstValue = iterator.next().value;
    if (firstValue !== undefined) {
      recentFingerprints.delete(firstValue);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start listening for incoming SMS events from native SmsEventModule.
 *
 * Subscribes to DeviceEventEmitter events emitted by the native
 * SmsBroadcastReceiver → SmsEventModule bridge.
 *
 * Idempotent — calling multiple times is safe.
 */
export function startSmsListener(): void {
  if (Platform.OS !== "android") {
    logger.info("smsLiveListener.androidOnly");
    return;
  }

  if (isListening) {
    logger.info("smsLiveListener.alreadyListening");
    return;
  }

  try {
    ensureSmsEventModuleInitialized();

    nativeSubscription = DeviceEventEmitter.addListener(
      NATIVE_SMS_EVENT,
      (event: NativeSmsEvent) => {
        processNativeSmsEvent(event).catch((err: unknown) => {
          logger.error("smsLiveListener.processFailed", err);
        });
      }
    );

    isListening = true;
    setNativeListenerReady(true);
    logger.info("smsLiveListener.started");
  } catch (err) {
    logger.error("smsLiveListener.startFailed", err);
    isListening = false;
    setNativeListenerReady(false);
  }
}

/**
 * Stop listening for incoming SMS events.
 * Idempotent — calling when not listening is safe.
 */
export function stopSmsListener(): void {
  if (!isListening) {
    return;
  }

  if (nativeSubscription) {
    nativeSubscription.remove();
    nativeSubscription = null;
  }

  isListening = false;
  setNativeListenerReady(false);
  logger.info("smsLiveListener.stopped");
}

/**
 * Whether the listener is currently active.
 */
export function isSmsListenerActive(): boolean {
  return isListening;
}

/**
 * Register a handler for detected financial SMS transactions.
 *
 * @param handler - Called when a financial SMS is parsed successfully
 * @returns Cleanup function to unsubscribe
 */
export function onTransactionDetected(
  handler: LiveSmsEventHandler
): () => void {
  handlers.add(handler);

  return () => {
    handlers.delete(handler);
  };
}

/**
 * Clear the recent fingerprints cache.
 * Useful for testing or when the user performs a full re-scan.
 */
export function clearRecentFingerprints(): void {
  recentFingerprints.clear();
}
