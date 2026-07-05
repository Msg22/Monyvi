/**
 * SMS Sync Service
 *
 * Orchestrates the scan → filter → AI-parse → dedup pipeline for SMS transactions.
 * Reads the SMS inbox, filters by known Egyptian bank/fintech sender names,
 * sends financial candidates to Gemini AI for structured parsing, and deduplicates.
 *
 * Architecture & Design Rationale:
 * - Pattern: Pipeline / Orchestrator
 * - Why: Separates scan orchestration from parsing logic (SRP).
 *   Two-stage approach: fast on-device sender filter, then cloud AI.
 * - SOLID: Open/Closed — the AI service can be swapped without
 *   touching this orchestrator. SRP — only orchestrates, no UI.
 *
 * @module sms-sync-service
 */

import { database, Transaction, Transfer } from "@monyvi/db";
import {
  computeSmsFingerprint,
  isKnownFinancialSender,
  type ParsedSmsTransaction,
  type SmsMessage,
} from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { InteractionManager } from "react-native";
import {
  parseSmsWithAi,
  type ParseSmsContext,
  type SmsCandidate,
} from "./ai-sms-parser-service";
import { getCurrentUserDataScope } from "./user-data-access";
import { readSmsInbox } from "./sms-reader-service";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Progress callback payload emitted during scanning. */
export interface SmsScanProgress {
  readonly totalMessages: number;
  readonly messagesScanned: number;
  /** Number of AI-parsed transactions found so far. */
  readonly transactionsFound: number;
  /** Number of SMS candidates that passed the keyword filter (stable after filtering). */
  readonly candidatesFound: number;
  readonly currentPhase: "filtering" | "ai-parsing" | "complete";
  readonly currentSender: string;
  /** Number of AI parsing chunks completed (only during ai-parsing phase). */
  readonly aiChunksCompleted?: number;
  /** Total AI parsing chunks to process (only during ai-parsing phase). */
  readonly aiChunksTotal?: number;
  /** Timestamp (ms since epoch) when the scan pipeline started. Used by UI for elapsed timer. */
  readonly scanStartedAt: number;
  /**
   * Estimated time remaining for the AI parsing phase in milliseconds.
   * `undefined` until the first AI chunk completes AND total chunks >= 2.
   */
  readonly estimatedRemainingMs?: number;
}

/** Result returned when scanning completes. */
export interface SmsScanResult {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly totalScanned: number;
  readonly totalFound: number;
  readonly totalFilteredCandidates: number;
  readonly durationMs: number;
}

/** Options for the scan pipeline. */
interface ScanOptions {
  /** Only process SMS after this timestamp (ms since epoch). */
  readonly minDate?: number;
  /** Maximum messages to read from inbox. Defaults to 5000. */
  readonly maxCount?: number;
  /** Set of existing SMS fingerprints for dedup. */
  readonly existingFingerprints?: ReadonlySet<string>;
  /** Batch size for keyword filtering — smaller = more frequent progress updates. */
  readonly batchSize?: number;
  /**
   * Yield to the UI thread every N batches via InteractionManager.
   * Prevents UI freezing on large inboxes (10K+ messages).
   * Defaults to 3.
   */
  readonly yieldInterval?: number;
  /** Context to pass to AI for better account suggestions and parsing accuracy. */
  readonly aiContext: ParseSmsContext;
  /** Cancels the pipeline before sending more SMS candidates to AI. */
  readonly abortSignal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_COUNT = 2000;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_YIELD_INTERVAL = 3;
const SCAN_IN_PROGRESS_KEY = "@monyvi/sms_scan_in_progress";
/** Default to 3 months ago for both initial and full resync. */
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

function assertScanNotAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }

  const error = new Error("SMS scan aborted");
  error.name = "AbortError";
  throw error;
}

/**
 * Regex patterns that identify non-transactional SMS from financial senders.
 * These messages should be filtered out before sending to the AI parser
 * to reduce cost and avoid false positives.
 */
const NON_TRANSACTIONAL_PATTERNS: readonly RegExp[] = [
  // OTP / verification codes (English & Arabic)
  /\bOTP[:\s]/i,
  /\bverification\s*code/i,
  /(?<!\p{Script=Arabic})رقم\s*(?:سري|مؤقت|التحقق)(?!\p{Script=Arabic})/iu,
  // Password / PIN reset
  /\binvalid\s*(IPN\s*)?PIN/i,
  /\bpassword\s*reset/i,
  /(?<!\p{Script=Arabic})إعادة\s*انشاء\s*رقم\s*سري(?!\p{Script=Arabic})/iu,
  // Promotional / marketing (Arabic telecom promos)
  /(?<!\p{Script=Arabic})افتح\s*محفظة(?!\p{Script=Arabic})/u,
  /(?<!\p{Script=Arabic})كاش\s*باك\s*مضمون(?!\p{Script=Arabic})/u,
  /(?<!\p{Script=Arabic})إستمتع\s*ب(?!\p{Script=Arabic})/u,
  // Account activation notices
  /(?<!\p{Script=Arabic})تنشيط\s*حسابكم(?!\p{Script=Arabic})/u,
  // Survey / feedback links
  /(?<!\p{Script=Arabic})تقييم\s*خبرتك(?!\p{Script=Arabic})/iu,
  /\bsurvey\b/i,
];

/**
 * Check whether an SMS body matches known non-transactional patterns
 * (OTPs, promotions, PIN resets, etc.) that should be excluded
 * from AI parsing.
 */
function isNonTransactionalSms(body: string): boolean {
  return NON_TRANSACTIONAL_PATTERNS.some((pattern) => pattern.test(body));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract sms_fingerprint strings from raw query rows into a Set.
 * Shared by both the transactions and transfers queries below.
 */
function collectFingerprints(
  rows: ReadonlyArray<Record<string, unknown>>,
  target: Set<string>
): void {
  for (const row of rows) {
    const fingerprint = row.sms_fingerprint;
    if (typeof fingerprint === "string") {
      target.add(fingerprint);
    }
  }
}

/**
 * Remove exact duplicate parsed SMS transactions from the same scan result.
 * Different transactions can legitimately come from the same SMS.
 *
 * This protects the save path from duplicate AI entries for one SMS.
 */
function deduplicateParsedSmsTransactions(
  transactions: readonly ParsedSmsTransaction[]
): readonly ParsedSmsTransaction[] {
  const seenTransactions = new Set<string>();
  const deduplicated: ParsedSmsTransaction[] = [];

  for (const transaction of transactions) {
    const transactionKey = getParsedSmsTransactionKey(transaction);
    if (seenTransactions.has(transactionKey)) {
      continue;
    }

    seenTransactions.add(transactionKey);
    deduplicated.push(transaction);
  }

  return deduplicated;
}

function getParsedSmsTransactionKey(transaction: ParsedSmsTransaction): string {
  return JSON.stringify({
    smsFingerprint: transaction.smsFingerprint,
    amount: transaction.amount,
    currency: transaction.currency,
    type: transaction.type,
    counterparty: transaction.counterparty ?? null,
    date: transaction.date.getTime(),
    categoryId: transaction.categoryId,
    categoryDisplayName: transaction.categoryDisplayName,
    isAtmWithdrawal: transaction.isAtmWithdrawal === true,
    cardLast4: transaction.cardLast4 ?? null,
  });
}

/**
 * Query all existing SMS fingerprints from the transactions AND transfers tables.
 * Used for deduplication before scanning so saved SMS records are skipped.
 *
 * Scoped to the current user so stale local rows from another account do not
 * suppress valid SMS imports for the signed-in user.
 */
export async function loadExistingSmsFingerprints(): Promise<
  ReadonlySet<string>
> {
  const scope = await getCurrentUserDataScope();
  const fingerprints = new Set<string>();

  // ── Transactions ──────────────────────────────────────────────────────
  const transactionRows = (await scope
    .queryOwned(
      database.get<Transaction>("transactions"),
      Q.where("source", "SMS"),
      Q.where("sms_fingerprint", Q.notEq(null)),
      Q.where("deleted", false)
    )
    .unsafeFetchRaw()) as ReadonlyArray<Record<string, unknown>>;

  collectFingerprints(transactionRows, fingerprints);

  // ── Transfers (ATM withdrawals, etc.) ─────────────────────────────────
  const transferRows = (await scope
    .queryOwned(
      database.get<Transfer>("transfers"),
      Q.where("sms_fingerprint", Q.notEq(null)),
      Q.where("deleted", false)
    )
    .unsafeFetchRaw()) as ReadonlyArray<Record<string, unknown>>;

  collectFingerprints(transferRows, fingerprints);

  return fingerprints;
}

/**
 * Scan the SMS inbox and return parsed, deduplicated transactions.
 *
 * Pipeline:
 * 1. Read SMS inbox via sms-reader-service
 * 2. On-device keyword filter → financial candidates
 * 3. Compute SHA-256 fingerprint for each candidate
 * 4. Dedup against existing fingerprints in local DB
 * 5. Send deduplicated candidates to AI Edge Function
 * 6. Return AI-parsed transactions
 *
 * @param onProgress - Callback invoked after each batch with scan progress
 * @param options    - Optional filters (minDate, maxCount, existingFingerprints)
 * @returns Parsed, deduplicated transactions ready for review
 */
export async function scanAndParseSms(
  options: ScanOptions,
  onProgress?: (progress: SmsScanProgress) => void
): Promise<SmsScanResult> {
  // Guard against interrupted scans — clean up stale flags
  await AsyncStorage.setItem(SCAN_IN_PROGRESS_KEY, "true");

  try {
    return await executeScanPipeline(options, onProgress);
  } finally {
    // Always clear the flag, even on error/abort
    await AsyncStorage.removeItem(SCAN_IN_PROGRESS_KEY);
  }
}

/**
 * Check if a previous scan was interrupted (force-close).
 * Call on app launch to detect and clean up stale state.
 */
export async function cleanupStaleScanState(): Promise<boolean> {
  const inProgress = await AsyncStorage.getItem(SCAN_IN_PROGRESS_KEY);
  if (inProgress === "true") {
    await AsyncStorage.removeItem(SCAN_IN_PROGRESS_KEY);
    logger.info("smsSync.staleScanState.cleaned");
    return true;
  }
  return false;
}

/**
 * Internal scan pipeline implementation.
 * Separated from scanAndParseSms to allow the outer function
 * to manage the scan-in-progress guard cleanly.
 */
async function executeScanPipeline(
  options: ScanOptions,
  onProgress?: (progress: SmsScanProgress) => void
): Promise<SmsScanResult> {
  const startTime = Date.now();
  const maxCount = options?.maxCount ?? DEFAULT_MAX_COUNT;
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
  const yieldInterval = options?.yieldInterval ?? DEFAULT_YIELD_INTERVAL;
  const abortSignal = options?.abortSignal;
  const existingFingerprints =
    options?.existingFingerprints ?? (await loadExistingSmsFingerprints());
  // Default to 3 months ago when no minDate is provided
  const effectiveMinDate = options?.minDate ?? Date.now() - THREE_MONTHS_MS;

  // ─── Step 1: Read SMS inbox ───────────────────────────────────────────
  const messages: readonly SmsMessage[] = await readSmsInbox({
    maxCount,
    minDate: effectiveMinDate,
  });
  assertScanNotAborted(abortSignal);

  const totalMessages = messages.length;
  let messagesScanned = 0;
  let batchCount = 0;

  // ─── Step 2: On-device keyword filter + fingerprint + dedup ───────────
  const candidates: SmsCandidate[] = [];
  const seenFingerprints = new Set(existingFingerprints);

  for (let i = 0; i < totalMessages; i += batchSize) {
    assertScanNotAborted(abortSignal);
    const batch = messages.slice(i, i + batchSize);

    for (const sms of batch) {
      messagesScanned++;

      // Filter by known Egyptian bank/fintech sender names
      if (!isKnownFinancialSender(sms.address)) {
        continue;
      }

      // Skip OTPs, promotions, PIN resets, etc.
      if (isNonTransactionalSms(sms.body)) {
        continue;
      }

      // Compute fingerprint for deduplication
      const fingerprint = await computeSmsFingerprint({
        sender: sms.address,
        body: sms.body,
        receivedAtMs: sms.date,
      });

      // Skip if already exists in local DB
      if (seenFingerprints.has(fingerprint)) {
        continue;
      }

      seenFingerprints.add(fingerprint);
      candidates.push({ message: sms, smsFingerprint: fingerprint });
    }

    // Emit progress after each batch
    onProgress?.({
      totalMessages,
      messagesScanned,
      transactionsFound: 0,
      candidatesFound: candidates.length,
      currentPhase: "filtering",
      currentSender: batch[batch.length - 1]?.address ?? "",
      scanStartedAt: startTime,
    });

    // Yield to UI thread periodically
    batchCount++;
    if (batchCount % yieldInterval === 0) {
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => {
          resolve();
        });
      });
    }
  }

  // ─── Step 3: Send candidates to AI for parsing ────────────────────────
  assertScanNotAborted(abortSignal);
  onProgress?.({
    totalMessages,
    messagesScanned: totalMessages,
    transactionsFound: 0,
    candidatesFound: candidates.length,
    currentPhase: "ai-parsing",
    currentSender: "",
    aiChunksCompleted: 0,
    scanStartedAt: startTime,
  });

  // Track per-chunk durations for estimated time remaining calculation
  const chunkDurations: number[] = [];

  const aiResult = await parseSmsWithAi(
    candidates,
    options.aiContext,
    (aiProgress) => {
      // Accumulate chunk durations for rolling average
      chunkDurations.push(aiProgress.chunkDurationMs);

      // Calculate estimated remaining from rolling average of completed chunk durations
      const remainingChunks =
        aiProgress.totalChunks - aiProgress.chunksCompleted;
      let estimatedRemainingMs: number | undefined;

      if (
        chunkDurations.length >= 1 &&
        aiProgress.totalChunks >= 2 &&
        remainingChunks > 0
      ) {
        const avgChunkDurationMs =
          chunkDurations.reduce((sum, d) => sum + d, 0) / chunkDurations.length;
        estimatedRemainingMs = Math.round(avgChunkDurationMs * remainingChunks);
      }

      onProgress?.({
        totalMessages,
        messagesScanned: totalMessages,
        transactionsFound: aiProgress.transactionsSoFar,
        candidatesFound: candidates.length,
        currentPhase: "ai-parsing",
        currentSender: "",
        aiChunksCompleted: aiProgress.chunksCompleted,
        aiChunksTotal: aiProgress.totalChunks,
        scanStartedAt: startTime,
        estimatedRemainingMs,
      });
    },
    abortSignal
  );
  const deduplicatedTransactions = deduplicateParsedSmsTransactions(
    aiResult.transactions
  );

  // ─── Step 4: Return results ───────────────────────────────────────────
  const durationMs = Date.now() - startTime;

  onProgress?.({
    totalMessages,
    messagesScanned: totalMessages,
    transactionsFound: deduplicatedTransactions.length,
    candidatesFound: candidates.length,
    currentPhase: "complete",
    currentSender: "",
    scanStartedAt: startTime,
  });

  logger.info("smsSync.aiParsing.complete", {
    transactionCount: deduplicatedTransactions.length,
    candidateCount: candidates.length,
    durationMs,
  });

  return {
    transactions: deduplicatedTransactions,
    totalScanned: messagesScanned,
    totalFound: deduplicatedTransactions.length,
    totalFilteredCandidates: candidates.length,
    durationMs,
  };
}
