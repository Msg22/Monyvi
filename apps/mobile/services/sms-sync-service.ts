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
  DEFAULT_SMS_SCAN_POLICY,
  getParsedSmsTransactionKey,
  isExcludedBeforeSmsParsing,
  isLikelyCorruptedSmsText,
  isKnownFinancialSender,
  type ParsedSmsTransaction,
  type SmsScanKind,
  type SmsMessage,
} from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { InteractionManager } from "react-native";
import {
  type ParseSmsContext,
  type SmsCandidate,
} from "./ai-sms-parser-service";
import {
  getTrustedPrefilterDisposition,
  initializeSmsParserScanSession,
  parseSmsWithOrchestrator,
  toSmsParserDiagnosticsLogContext,
  type HybridSmsUnresolvedCandidate,
  type SmsParserDiagnostics,
  type SmsParserOrchestratorResult,
  type SmsScanSafeguardSummary,
} from "./sms-parser-orchestrator";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
  type CurrentUserDataScope,
} from "./user-data-access";
import { readSmsInbox } from "./sms-reader-service";
import { logger } from "@/utils/logger";
import { assertNotAborted } from "./abort-utils";
import { resolveSmsScanPolicy } from "./sms-scan-policy-service";
import {
  finalizeSmsScanCheckpoint,
  loadSmsScanSafeguardState,
  type SmsCheckpointMessageState,
} from "./sms-scan-checkpoint-coordinator";
import { recordOversizedSmsOutcome } from "./sms-oversized-outcome-service";
import { getSmsSafeguardQaNowMs } from "@/config/sms-safeguard-qa-config";

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
  readonly unresolvedCandidates: readonly HybridSmsUnresolvedCandidate[];
  readonly parseContext: ParseSmsContext;
  readonly parserDiagnostics: SmsParserDiagnostics;
  readonly safeguardSummary: SmsScanSafeguardSummary;
}

/** Options for the scan pipeline. */
export interface ScanOptions {
  /** Explicit intent used to select the bounded scan policy. */
  readonly scanKind: Exclude<SmsScanKind, "live">;
  /** Inbox page size. Every page in the bounded window is read. Defaults to 2000. */
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

function assertScanNotAborted(signal: AbortSignal | undefined): void {
  assertNotAborted(signal, "SMS scan aborted");
}

function resolveSmsInboxPageSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_COUNT;
  }
  return Math.max(1, Math.floor(value));
}

function isExpectedSafeguardPartialResult(
  result: SmsParserOrchestratorResult
): boolean {
  const summary = result.safeguardSummary;
  if (summary.completionStatus !== "partial") {
    return false;
  }
  return (
    summary.unresolvedCount > 0 ||
    summary.deferredAiCount > 0 ||
    summary.oversizedCount > 0 ||
    summary.availability !== undefined
  );
}

async function readBoundedSmsInbox(input: {
  readonly pageSize: number;
  readonly minDate: number;
  readonly maxDate: number;
  readonly abortSignal?: AbortSignal;
}): Promise<readonly SmsMessage[]> {
  const messages: SmsMessage[] = [];
  let indexFrom = 0;
  let hasMore = true;

  while (hasMore) {
    assertScanNotAborted(input.abortSignal);
    const page = await readSmsInbox({
      maxCount: input.pageSize,
      minDate: input.minDate,
      maxDate: input.maxDate,
      indexFrom,
      sortOrder: "date DESC, _id DESC",
    });
    messages.push(...page);
    hasMore = page.length === input.pageSize;
    indexFrom += page.length;
  }

  return messages;
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
 * Keep at most one parsed transaction per SMS fingerprint.
 * This matches the persistence and review-session deduplication invariant.
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
  return loadExistingSmsFingerprintsForScope(scope);
}

async function loadExistingSmsFingerprintsForScope(
  scope: CurrentUserDataScope
): Promise<ReadonlySet<string>> {
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
 * @param options    - Scan intent, limits, dedup state, and parser context
 * @returns Parsed, deduplicated transactions ready for review
 */
export async function scanAndParseSms(
  options: ScanOptions,
  onProgress?: (progress: SmsScanProgress) => void
): Promise<SmsScanResult> {
  const scanStartedAtMs = getSmsSafeguardQaNowMs(Date.now());
  const initiatingScope = await getCurrentUserDataScope();
  const scanSessionId = Crypto.randomUUID();
  const requestContext = {
    scanSessionId,
    scanKind: options.scanKind,
    scanStartedAtMs,
  } as const;
  // Guard against interrupted scans — clean up stale flags
  await AsyncStorage.setItem(SCAN_IN_PROGRESS_KEY, "true");

  try {
    await initializeSmsParserScanSession(
      options.aiContext,
      requestContext,
      options.abortSignal,
      initiatingScope.userId
    );
    return await executeScanPipeline(
      options,
      initiatingScope,
      scanStartedAtMs,
      scanSessionId,
      onProgress
    );
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
  initiatingScope: CurrentUserDataScope,
  scanStartedAtMs: number,
  scanSessionId: string,
  onProgress?: (progress: SmsScanProgress) => void
): Promise<SmsScanResult> {
  const durationStartedAtMs = performance.now();
  const pageSize = resolveSmsInboxPageSize(options?.maxCount);
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
  const yieldInterval = options?.yieldInterval ?? DEFAULT_YIELD_INTERVAL;
  const abortSignal = options?.abortSignal;
  const existingFingerprints =
    options?.existingFingerprints ??
    (await loadExistingSmsFingerprintsForScope(initiatingScope));
  const initialSafeguardState = await loadSmsScanSafeguardState({
    userId: initiatingScope.userId,
    scanKind: options.scanKind,
    scanStartedAtMs,
    fingerprints: [],
    savedFingerprints: existingFingerprints,
  });
  const { effectiveMinDate, processingPolicyVersion } = resolveSmsScanPolicy({
    scanKind: options.scanKind,
    scanStartedAtMs,
    checkpoint: initialSafeguardState.checkpoint,
  });

  // ─── Step 1: Read SMS inbox ───────────────────────────────────────────
  assertScanNotAborted(abortSignal);
  const inboxMessages = await readBoundedSmsInbox({
    pageSize,
    minDate: effectiveMinDate,
    maxDate: scanStartedAtMs,
    abortSignal,
  });
  assertScanNotAborted(abortSignal);

  // Keep the orchestration boundary authoritative even if a platform adapter
  // returns an out-of-window row despite receiving minDate.
  const messages = inboxMessages.filter(
    (message) =>
      message.date >= effectiveMinDate && message.date <= scanStartedAtMs
  );
  const fingerprintedMessages = await Promise.all(
    messages.map(async (message) => ({
      message,
      fingerprint: await computeSmsFingerprint({
        sender: message.address,
        body: message.body,
        receivedAtMs: message.date,
      }),
    }))
  );
  const safeguardState = await loadSmsScanSafeguardState({
    userId: initiatingScope.userId,
    scanKind: options.scanKind,
    scanStartedAtMs,
    fingerprints: fingerprintedMessages.map(({ fingerprint }) => fingerprint),
    savedFingerprints: existingFingerprints,
  });

  const totalMessages = messages.length;
  let messagesScanned = 0;
  let batchCount = 0;

  // ─── Step 2: On-device keyword filter + fingerprint + dedup ───────────
  const candidates: SmsCandidate[] = [];
  const seenFingerprints = new Set(existingFingerprints);
  const checkpointStates: Array<
    Omit<SmsCheckpointMessageState, "outcome"> & {
      outcome: SmsCheckpointMessageState["outcome"] | null;
    }
  > = [];

  for (let i = 0; i < totalMessages; i += batchSize) {
    assertScanNotAborted(abortSignal);
    const batch = fingerprintedMessages.slice(i, i + batchSize);

    for (const { message: sms, fingerprint } of batch) {
      messagesScanned++;

      const addCheckpointState = (
        outcome: SmsCheckpointMessageState["outcome"] | null
      ): void => {
        checkpointStates.push({
          fingerprint,
          receivedAtMs: sms.date,
          outcome,
        });
      };

      if (isExcludedBeforeSmsParsing(sms.body)) {
        addCheckpointState("local_excluded");
        continue;
      }

      // Filter by known Egyptian bank/fintech sender names
      if (!isKnownFinancialSender(sms.address)) {
        addCheckpointState("local_excluded");
        continue;
      }

      if (isLikelyCorruptedSmsText(sms.body)) {
        addCheckpointState("local_excluded");
        continue;
      }

      const candidate = { message: sms, smsFingerprint: fingerprint };
      const trustedPrefilterDisposition = getTrustedPrefilterDisposition(
        candidate,
        options.aiContext.supportedCurrencies
      );
      if (trustedPrefilterDisposition === "filter_before_ai") {
        addCheckpointState("local_excluded");
        continue;
      }
      if (
        isNonTransactionalSms(sms.body) &&
        trustedPrefilterDisposition !== "route_to_parser"
      ) {
        addCheckpointState("local_excluded");
        continue;
      }

      // Skip if already exists in local DB
      if (seenFingerprints.has(fingerprint)) {
        addCheckpointState(
          existingFingerprints.has(fingerprint) ? "saved" : null
        );
        continue;
      }

      if (
        trustedPrefilterDisposition !== "route_to_parser" &&
        safeguardState.durableKnownFingerprints.has(fingerprint)
      ) {
        addCheckpointState("future_durable");
        continue;
      }

      seenFingerprints.add(fingerprint);
      candidates.push(candidate);
      addCheckpointState(null);
    }

    // Emit progress after each batch
    onProgress?.({
      totalMessages,
      messagesScanned,
      transactionsFound: 0,
      candidatesFound: candidates.length,
      currentPhase: "filtering",
      currentSender: batch[batch.length - 1]?.message.address ?? "",
      scanStartedAt: scanStartedAtMs,
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
  await assertExpectedCurrentUser(initiatingScope.userId);
  onProgress?.({
    totalMessages,
    messagesScanned: totalMessages,
    transactionsFound: 0,
    candidatesFound: candidates.length,
    currentPhase: "ai-parsing",
    currentSender: "",
    aiChunksCompleted: 0,
    scanStartedAt: scanStartedAtMs,
  });

  // Track per-chunk durations for estimated time remaining calculation
  const chunkDurations: number[] = [];
  const aiResult = await parseSmsWithOrchestrator(
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
        scanStartedAt: scanStartedAtMs,
        estimatedRemainingMs,
      });
    },
    abortSignal,
    {
      expectedUserId: initiatingScope.userId,
      terminalFingerprints: safeguardState.terminalFingerprints,
      requestContext: {
        scanSessionId,
        scanKind: options.scanKind,
        scanStartedAtMs,
      },
    }
  );
  await assertPinnedScanContext(initiatingScope.userId, abortSignal);

  logger.info(
    "smsSync.parserDiagnostics",
    toSmsParserDiagnosticsLogContext(aiResult.diagnostics)
  );

  if (
    aiResult.hasError &&
    aiResult.transactions.length === 0 &&
    !isExpectedSafeguardPartialResult(aiResult)
  ) {
    throw new Error("SMS AI parsing failed");
  }

  const deduplicatedTransactions = deduplicateParsedSmsTransactions(
    aiResult.transactions
  );
  const transactionFingerprints = new Set(
    deduplicatedTransactions.map((transaction) => transaction.smsFingerprint)
  );
  const durableNegativeFingerprints = new Set([
    ...(aiResult.durableNegativeFingerprints ?? []),
    ...(aiResult.terminalFingerprints ?? []),
  ]);
  const durableLocalRejectionFingerprints = new Set(
    aiResult.durableLocalRejectionFingerprints ?? []
  );
  const oversizedFingerprints = new Set(
    (aiResult.oversizedCandidates ?? []).map(
      (candidate) => candidate.smsFingerprint
    )
  );
  await assertPinnedScanContext(initiatingScope.userId, abortSignal);
  for (const candidate of aiResult.oversizedCandidates ?? []) {
    await recordOversizedSmsOutcome({
      userId: initiatingScope.userId,
      smsFingerprint: candidate.smsFingerprint,
      originalReceivedAtMs: candidate.message.date,
      nowMs: scanStartedAtMs,
      lookbackDays: DEFAULT_SMS_SCAN_POLICY.lookbackDays,
    });
    await assertPinnedScanContext(initiatingScope.userId, abortSignal);
  }
  const finalizedCheckpointStates: readonly SmsCheckpointMessageState[] =
    checkpointStates.map((state) => ({
      ...state,
      outcome:
        state.outcome ??
        (transactionFingerprints.has(state.fingerprint)
          ? "memory_suggestion"
          : durableLocalRejectionFingerprints.has(state.fingerprint)
            ? "local_excluded"
            : oversizedFingerprints.has(state.fingerprint)
              ? "candidate_too_large"
              : durableNegativeFingerprints.has(state.fingerprint)
                ? "ai_negative"
                : "unresolved"),
    }));

  await assertPinnedScanContext(initiatingScope.userId, abortSignal);
  await finalizeSmsScanCheckpoint({
    userId: initiatingScope.userId,
    processingPolicyVersion,
    nowMs: scanStartedAtMs,
    states: finalizedCheckpointStates,
  });
  await assertPinnedScanContext(initiatingScope.userId, abortSignal);

  // ─── Step 4: Return results ───────────────────────────────────────────
  const durationMs = Math.max(
    0,
    Math.round(performance.now() - durationStartedAtMs)
  );

  onProgress?.({
    totalMessages,
    messagesScanned: totalMessages,
    transactionsFound: deduplicatedTransactions.length,
    candidatesFound: candidates.length,
    currentPhase: "complete",
    currentSender: "",
    scanStartedAt: scanStartedAtMs,
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
    unresolvedCandidates: aiResult.unresolvedCandidates ?? [],
    parseContext: options.aiContext,
    parserDiagnostics: aiResult.diagnostics,
    safeguardSummary: aiResult.safeguardSummary,
  };
}

async function assertPinnedScanContext(
  expectedUserId: string,
  abortSignal: AbortSignal | undefined
): Promise<void> {
  assertScanNotAborted(abortSignal);
  await assertExpectedCurrentUser(expectedUserId);
  assertScanNotAborted(abortSignal);
}
