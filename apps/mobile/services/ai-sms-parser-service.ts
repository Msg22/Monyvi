/**
 * AI SMS Parser Service
 *
 * Mobile-side service client for the `/parse-sms` Edge Function.
 * Sends filtered SMS candidates to Gemini via Supabase Edge Function
 * and maps the AI response back to `ParsedSmsTransaction` objects.
 *
 * Falls back to `sms-category-mapper.ts` if the AI call fails.
 *
 * @module ai-sms-parser-service
 */

import { z } from "zod";
import { supabase } from "./supabase";
import { logger } from "@/utils/logger";
import { shouldUseFixtureSmsParser } from "@/config/e2e-test-config";
import { assertNotAborted, createAbortError } from "./abort-utils";

import {
  buildCategoryMap,
  buildCategoryTree,
  clampConfidence,
  MAX_TRANSACTION_AMOUNT,
  normalizeCurrency,
  normalizeType,
  parseCategory,
  type CategoryMap,
  type CategoryTreeSource,
  type ParsedSmsTransaction,
  type SmsMessage,
} from "@monyvi/logic";

// ---------------------------------------------------------------------------
// Schemas — AI response validation
// ---------------------------------------------------------------------------

const AiSmsTransactionSchema = z.object({
  messageId: z.string(),
  amount: z.number().finite().positive().max(MAX_TRANSACTION_AMOUNT),
  currency: z.enum(["EGP", "USD"]),
  type: z.enum(["EXPENSE", "INCOME"]),
  counterparty: z.string(),
  date: z.string(),
  categorySystemName: z.string(),
  isAtmWithdrawal: z.boolean().optional().default(false),
  cardLast4: z.string().optional(),
  confidenceScore: z.number(),
  isTrusted: z.boolean(),
});

type AiSmsTransaction = z.infer<typeof AiSmsTransactionSchema>;

/** Result from AI parsing */
export interface AiParseResult {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly hasError?: boolean;
  readonly isRetryable?: boolean;
  readonly unresolvedCandidates?: readonly AiUnresolvedCandidate[];
}

export interface AiUnresolvedCandidate {
  readonly candidate: SmsCandidate;
  readonly reason:
    | "chunk_failed"
    | "mapping_failed"
    | "response_invalid"
    | "unexpected_failure";
  readonly isRetryable: boolean;
}

/** Context sent alongside SMS messages to the Edge Function. */
export interface ParseSmsContext {
  /** Raw category entries from DB — used to build both the AI tree string and the validation set. */
  readonly categories: readonly CategoryTreeSource[];
  readonly supportedCurrencies: readonly string[];
}

// ---------------------------------------------------------------------------
// Input type — candidate SMS for AI processing
// ---------------------------------------------------------------------------

export interface SmsCandidate {
  /** The original SMS message */
  readonly message: SmsMessage;
  /** Pre-computed sender/body/time fingerprint for deduplication */
  readonly smsFingerprint: string;
}

// ---------------------------------------------------------------------------

/**
 * Client-side chunk size — messages per Edge Function call.
 * Each chunk should complete well within the Supabase ~150s wall-time limit.
 * 50 messages ≈ 10–15s (one Gemini call on the server).
 *
 * Reduced from 100 to 50 to:
 * - Stay safely within the ~150s edge function wall-time
 * - Provide more frequent progress updates (2× chunks = 2× UI updates)
 * - Reduce the blast radius of a single chunk failure
 */
const CLIENT_CHUNK_SIZE = 50;

/**
 * Minimum chunk size for retry-with-split. Chunks at or below this size
 * will NOT be split further on failure — they are treated as permanently failed.
 * This prevents infinite bisection.
 */
const MIN_CHUNK_SIZE_FOR_SPLIT = 10;

/** Delay between chunks (ms) to avoid Gemini rate limits. */
const INTER_CHUNK_DELAY_MS = 2000;
const AI_CONSENT_REQUIRED_STATUS = 403;
const AI_CONSENT_REQUIRED_ERROR_NAME = "AiConsentRequiredError";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function createAiConsentRequiredError(): Error {
  const error = new Error("AI processing consent required");
  error.name = AI_CONSENT_REQUIRED_ERROR_NAME;
  return error;
}

export function isAiConsentRequiredError(error: unknown): boolean {
  return (
    error instanceof Error && error.name === AI_CONSENT_REQUIRED_ERROR_NAME
  );
}

/**
 * Parsed edge function response.
 */
interface ChunkAiResult {
  readonly transactions: readonly AiSmsTransaction[];
  /** True if the Edge Function call failed (not a legitimate empty result). */
  readonly hasError: boolean;
  /** False for permanent failures such as auth/config 4xx responses. */
  readonly isRetryable?: boolean;
  readonly invalidMessageIds?: readonly string[];
  readonly hasUncorrelatedFailure?: boolean;
  readonly failureReason?: AiUnresolvedCandidate["reason"];
}

/**
 * Safely parse and validate the Edge Function response.
 * Uses Zod schema validation for each transaction entry.
 * Marks unexpected response shapes as errors so retry-capable callers can
 * recover instead of treating malformed responses as legitimate empty results.
 */
function parseAiResponse(data: unknown): ChunkAiResult {
  const errorResult: ChunkAiResult = {
    transactions: [],
    hasError: true,
    isRetryable: true,
    hasUncorrelatedFailure: true,
    failureReason: "response_invalid",
  };

  if (typeof data !== "object" || data === null) {
    logger.warn("[ai-sms-parser] parseAiResponse: data is not an object", {
      dataType: typeof data,
    });
    return errorResult;
  }

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.transactions)) {
    logger.warn("[ai-sms-parser] parseAiResponse: invalid response envelope", {
      reasonCode: "transactions_array_missing",
    });
    return errorResult;
  }

  const transactions: AiSmsTransaction[] = [];
  const invalidMessageIds = new Set<string>();
  let hasUncorrelatedFailure = false;
  let invalidCount = 0;

  for (const raw of obj.transactions) {
    const parsed = AiSmsTransactionSchema.safeParse(raw);
    if (parsed.success) {
      transactions.push(parsed.data);
    } else {
      invalidCount++;
      const invalidMessageId =
        typeof raw === "object" &&
        raw !== null &&
        typeof (raw as Record<string, unknown>).messageId === "string"
          ? (raw as Record<string, string>).messageId.trim()
          : "";
      if (invalidMessageId.length > 0) {
        invalidMessageIds.add(invalidMessageId);
      } else {
        hasUncorrelatedFailure = true;
      }
      // PII/privacy: do NOT log `raw` or full `issues` — they include amounts,
      // senders, counterparties, etc. Log only aggregate diagnostics so Sentry
      // doesn't retain user financial data.
      logger.warn("[ai-sms-parser] Skipping malformed transaction entry", {
        issueCount: parsed.error.issues.length,
        issuePaths: parsed.error.issues
          .map((i) => i.path.join("."))
          .slice(0, 5),
        issueCodes: Array.from(new Set(parsed.error.issues.map((i) => i.code))),
      });
    }
  }

  if (invalidCount > 0) {
    logger.warn("[ai-sms-parser] parseAiResponse: validation failures", {
      invalidCount,
      total: obj.transactions.length,
    });
  }

  return {
    transactions,
    hasError: invalidCount > 0,
    isRetryable: invalidCount > 0 ? true : undefined,
    invalidMessageIds: [...invalidMessageIds],
    hasUncorrelatedFailure,
    failureReason: invalidCount > 0 ? "response_invalid" : undefined,
  };
}

function isRetryableAiFailure(status: number | undefined): boolean {
  if (status === undefined) {
    return true;
  }

  return status === 408 || status === 429 || status >= 500;
}

function parseDate(dateStr: string, fallbackMs: number): Date {
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return new Date(fallbackMs);
  }
  return parsed;
}

interface AiMappingResult {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly resolvedMessageIds: ReadonlySet<string>;
  readonly failedMessageIds: ReadonlySet<string>;
  readonly hasUncorrelatedFailure: boolean;
}

function mapAiTransaction(
  aiTx: AiSmsTransaction,
  candidate: SmsCandidate,
  validCategoryMap: CategoryMap
): ParsedSmsTransaction {
  const counterparty =
    candidate.message.address &&
    aiTx.counterparty.toLowerCase().trim() ===
      candidate.message.address.toLowerCase().trim()
      ? ""
      : aiTx.counterparty;
  const category = parseCategory(aiTx.categorySystemName, validCategoryMap);

  return {
    amount: aiTx.amount,
    currency: normalizeCurrency(aiTx.currency),
    type: normalizeType(aiTx.type),
    counterparty,
    date: parseDate(aiTx.date, candidate.message.date),
    source: "SMS",
    originLabel: candidate.message.address,
    deduplicationHash: candidate.smsFingerprint,
    smsFingerprint: candidate.smsFingerprint,
    senderDisplayName: candidate.message.address,
    categoryId: category.id,
    categoryDisplayName: category.displayName,
    rawSmsBody: candidate.message.body,
    confidence: clampConfidence(aiTx.confidenceScore),
    isAtmWithdrawal: aiTx.isAtmWithdrawal ?? false,
    cardLast4: aiTx.cardLast4,
  };
}

function mapAiTransactions(
  aiTransactions: readonly AiSmsTransaction[],
  candidateMap: ReadonlyMap<string, SmsCandidate>,
  validCategoryMap: CategoryMap
): AiMappingResult {
  const transactions: ParsedSmsTransaction[] = [];
  const resolvedMessageIds = new Set<string>();
  const failedMessageIds = new Set<string>();
  let hasUncorrelatedFailure = false;

  for (const aiTx of aiTransactions) {
    const candidate = candidateMap.get(aiTx.messageId);
    if (!candidate) {
      logger.warn("[ai-sms-parser] Unknown message identity, skipping", {
        reasonCode: "candidate_identity_unknown",
      });
      hasUncorrelatedFailure = true;
      continue;
    }
    if (!aiTx.isTrusted) {
      logger.info("[ai-sms-parser] Untrusted transaction, skipping", {
        reasonCode: "ai_result_untrusted",
      });
      resolvedMessageIds.add(aiTx.messageId);
      continue;
    }
    try {
      transactions.push(mapAiTransaction(aiTx, candidate, validCategoryMap));
      resolvedMessageIds.add(aiTx.messageId);
    } catch (error: unknown) {
      failedMessageIds.add(aiTx.messageId);
      logger.warn("[ai-sms-parser] Transaction mapping failed", {
        reasonCode: "transaction_mapping_failed",
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  return {
    transactions,
    resolvedMessageIds,
    failedMessageIds,
    hasUncorrelatedFailure,
  };
}

/**
 * Send a single chunk of messages to the Edge Function.
 * Returns validated AI transactions, or empty results on failure.
 */
async function invokeParseChunk(
  messagesPayload: readonly MessagePayload[],
  context: ParseSmsContext,
  abortSignal?: AbortSignal
): Promise<ChunkAiResult> {
  throwIfAborted(abortSignal);
  const response = await supabase.functions.invoke("parse-sms", {
    body: {
      messages: messagesPayload,
      categories: buildCategoryTree(context.categories),
      supportedCurrencies: context.supportedCurrencies,
    },
    signal: abortSignal,
  });

  if (response.error) {
    // supabase-js wraps non-2xx responses in FunctionsHttpError with a
    // generic message. The actual status + body live on `error.context`
    // (a Response). Read them so we can tell auth (401) apart from
    // payload/runtime errors (4xx/5xx) without guessing.
    let status: number | undefined;
    let bodyLength: number | undefined;
    const ctx = (response.error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      status = ctx.status;
      try {
        bodyLength = (await ctx.clone().text()).length;
      } catch {
        bodyLength = undefined;
      }
    }

    if (status === AI_CONSENT_REQUIRED_STATUS) {
      throw createAiConsentRequiredError();
    }

    // PII/privacy: do NOT include the response body. Upstream providers
    // sometimes echo the original SMS text in error responses. Log only
    // the HTTP status, body length, and chunk size for diagnostics.
    logger.error(
      "[ai-sms-parser] parse-sms chunk failed",
      new Error("SMS AI parser request failed"),
      {
        status,
        bodyLength,
        chunkSize: messagesPayload.length,
      }
    );
    return {
      transactions: [],
      hasError: true,
      isRetryable: isRetryableAiFailure(status),
      hasUncorrelatedFailure: true,
      failureReason: "chunk_failed",
    };
  }

  return parseAiResponse(response.data);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Callback invoked after each chunk completes (or after a retry resolves). */
export interface AiParseProgress {
  readonly chunksCompleted: number;
  readonly totalChunks: number;
  readonly transactionsSoFar: number;
  /** Duration of the just-completed chunk in milliseconds. Used for time estimation. */
  readonly chunkDurationMs: number;
}

interface MessagePayload {
  readonly id: string;
  readonly body: string;
  readonly sender: string;
  readonly date: string; // not neede to be send to the AI.
}

interface ChunkWork {
  readonly messages: readonly MessagePayload[];
  /** True if this chunk is already a retry sub-chunk (no further splitting). */
  readonly isRetry: boolean;
}

function collectUnresolvedCandidates(input: {
  readonly messages: readonly MessagePayload[];
  readonly candidateMap: ReadonlyMap<string, SmsCandidate>;
  readonly resolvedMessageIds: ReadonlySet<string>;
  readonly failedMessageIds: ReadonlySet<string>;
  readonly hasUncorrelatedFailure: boolean;
  readonly reason: AiUnresolvedCandidate["reason"];
  readonly isRetryable: boolean;
}): readonly AiUnresolvedCandidate[] {
  const currentMessageIds = new Set(input.messages.map(({ id }) => id));
  const hasForeignFailureIdentity = [...input.failedMessageIds].some(
    (messageId) => !currentMessageIds.has(messageId)
  );
  const failedIds =
    input.hasUncorrelatedFailure || hasForeignFailureIdentity
      ? currentMessageIds
      : input.failedMessageIds;

  return [...failedIds].flatMap((messageId) => {
    if (input.resolvedMessageIds.has(messageId)) return [];
    const candidate = input.candidateMap.get(messageId);
    return candidate
      ? [{ candidate, reason: input.reason, isRetryable: input.isRetryable }]
      : [];
  });
}

function loadFixtureSmsParser(): typeof import("./testing/ai-sms-fixture-parser").parseSmsWithFixtureAi {
  // Lazily load fixture-only code so production parser imports do not pull in
  // the test SMS corpus unless E2E fixture mode is explicitly active.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fixtureParser =
    require("./testing/ai-sms-fixture-parser") as typeof import("./testing/ai-sms-fixture-parser");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return fixtureParser.parseSmsWithFixtureAi;
}

function throwIfAborted(abortSignal?: AbortSignal): void {
  assertNotAborted(abortSignal, "SMS parse aborted");
}

function waitForInterChunkDelay(abortSignal?: AbortSignal): Promise<void> {
  throwIfAborted(abortSignal);
  if (abortSignal === undefined) {
    return new Promise((resolve) => setTimeout(resolve, INTER_CHUNK_DELAY_MS));
  }
  return new Promise((resolve, reject) => {
    const handleAbort = (): void => {
      clearTimeout(timerId);
      reject(createAbortError("SMS parse aborted"));
    };
    const timerId = setTimeout(() => {
      abortSignal.removeEventListener("abort", handleAbort);
      resolve();
    }, INTER_CHUNK_DELAY_MS);
    abortSignal.addEventListener("abort", handleAbort, { once: true });
  });
}

/**
 * Parse SMS candidates through the AI Edge Function.
 *
 * Chunks candidates client-side into groups of {@link CLIENT_CHUNK_SIZE}
 * and sends each chunk as a separate Edge Function call. This avoids
 * the Supabase ~150s wall-time limit that occurs when processing
 * thousands of messages in a single invocation.
 *
 * Failed chunks are logged but do not abort the pipeline — partial
 * results from successful chunks are still returned.
 *
 * @param candidates - SMS messages that passed the keyword filter
 * @param context - Client context (categories, currencies)
 * @param onProgress - Optional callback invoked after each chunk completes
 * @returns Parsed transactions only (account suggestions derived separately)
 * @throws AbortError when the caller cancels, or AiConsentRequiredError when
 * the existing AI consent gate rejects the request.
 */
export async function parseSmsWithAi(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  onProgress?: (progress: AiParseProgress) => void,
  abortSignal?: AbortSignal
): Promise<AiParseResult> {
  const emptyResult: AiParseResult = { transactions: [], hasError: false };
  if (candidates.length === 0) return emptyResult;
  throwIfAborted(abortSignal);

  try {
    if (shouldUseFixtureSmsParser()) {
      const parseSmsWithFixtureAi = loadFixtureSmsParser();
      return await parseSmsWithFixtureAi(
        candidates,
        context,
        onProgress,
        abortSignal
      );
    }

    // Build validation set once for the entire parse session
    const validCategoryMap = buildCategoryMap(context.categories);

    // Build the lookup map: messageId → candidate
    const candidateMap = new Map<string, SmsCandidate>();
    const allMessages: readonly MessagePayload[] = candidates.map((c) => {
      candidateMap.set(c.message.id, c);
      return {
        id: c.message.id,
        body: c.message.body,
        sender: c.message.address,
        date: new Date(c.message.date).toISOString(),
      };
    });

    // Build a queue of chunks to process. Retry-with-split may add
    // sub-chunks dynamically, so we use a queue instead of index-based loop.

    // Initial chunking
    const chunkQueue: ChunkWork[] = [];
    for (let i = 0; i < allMessages.length; i += CLIENT_CHUNK_SIZE) {
      chunkQueue.push({
        messages: allMessages.slice(i, i + CLIENT_CHUNK_SIZE),
        isRetry: false,
      });
    }

    let totalChunks = chunkQueue.length;
    let chunksCompleted = 0;
    let hasError = false;
    let hasNonRetryableError = false;
    const allResults: ParsedSmsTransaction[] = [];
    const unresolvedCandidates: AiUnresolvedCandidate[] = [];
    const unresolvedFingerprints = new Set<string>();

    let chunkIndex = 0;
    while (chunkIndex < chunkQueue.length) {
      throwIfAborted(abortSignal);

      // Delay between chunks to avoid Gemini rate limits (skip for first chunk)
      if (chunkIndex > 0) {
        await waitForInterChunkDelay(abortSignal);
      }
      throwIfAborted(abortSignal);

      const currentChunk = chunkQueue[chunkIndex];
      const chunkStartMs = Date.now();

      const chunkResult = await invokeParseChunk(
        currentChunk.messages,
        context,
        abortSignal
      );
      throwIfAborted(abortSignal);
      const chunkDurationMs = Date.now() - chunkStartMs;

      // Only retry-with-split on actual errors, not legitimate empty results
      if (
        chunkResult.hasError &&
        chunkResult.isRetryable !== false &&
        currentChunk.messages.length > 0 &&
        !currentChunk.isRetry &&
        currentChunk.messages.length > MIN_CHUNK_SIZE_FOR_SPLIT
      ) {
        // Retry-with-split: bisect the failed chunk and enqueue sub-chunks
        const midpoint = Math.ceil(currentChunk.messages.length / 2);
        const firstHalf = currentChunk.messages.slice(0, midpoint);
        const secondHalf = currentChunk.messages.slice(midpoint);

        logger.warn("[ai-sms-parser] Chunk failed, splitting for retry", {
          failedSize: currentChunk.messages.length,
          firstHalfSize: firstHalf.length,
          secondHalfSize: secondHalf.length,
        });

        // Replace the failed chunk's slot with 2 retry sub-chunks.
        // We splice them right after the current index so they're processed next.
        chunkQueue.splice(
          chunkIndex + 1,
          0,
          { messages: firstHalf, isRetry: true },
          { messages: secondHalf, isRetry: true }
        );

        // Adjust total: we're replacing 1 failed chunk with 2 sub-chunks (+1 net)
        totalChunks += 1;

        // Move past the failed chunk (don't count it as completed)
        chunkIndex++;
        continue;
      }

      const mapped = mapAiTransactions(
        chunkResult.transactions,
        candidateMap,
        validCategoryMap
      );
      allResults.push(...mapped.transactions);

      const appendUnresolved = (
        values: readonly AiUnresolvedCandidate[]
      ): void => {
        for (const value of values) {
          if (unresolvedFingerprints.has(value.candidate.smsFingerprint))
            continue;
          unresolvedFingerprints.add(value.candidate.smsFingerprint);
          unresolvedCandidates.push(value);
        }
      };

      if (chunkResult.hasError) {
        hasError = true;
        const isRetryable = chunkResult.isRetryable !== false;
        if (!isRetryable) hasNonRetryableError = true;
        appendUnresolved(
          collectUnresolvedCandidates({
            messages: currentChunk.messages,
            candidateMap,
            resolvedMessageIds: mapped.resolvedMessageIds,
            failedMessageIds: new Set(chunkResult.invalidMessageIds ?? []),
            hasUncorrelatedFailure: chunkResult.hasUncorrelatedFailure === true,
            reason: chunkResult.failureReason ?? "chunk_failed",
            isRetryable,
          })
        );
      }

      if (mapped.failedMessageIds.size > 0 || mapped.hasUncorrelatedFailure) {
        hasError = true;
        hasNonRetryableError = true;
        appendUnresolved(
          collectUnresolvedCandidates({
            messages: currentChunk.messages,
            candidateMap,
            resolvedMessageIds: mapped.resolvedMessageIds,
            failedMessageIds: mapped.failedMessageIds,
            hasUncorrelatedFailure: mapped.hasUncorrelatedFailure,
            reason: "mapping_failed",
            isRetryable: false,
          })
        );
      }

      chunksCompleted++;

      onProgress?.({
        chunksCompleted,
        totalChunks,
        transactionsSoFar: allResults.length,
        chunkDurationMs,
      });

      chunkIndex++;
    }

    return {
      transactions: allResults,
      hasError,
      isRetryable: hasError ? !hasNonRetryableError : undefined,
      unresolvedCandidates,
    };
  } catch (err: unknown) {
    if (
      (err instanceof Error && err.name === "AbortError") ||
      isAiConsentRequiredError(err)
    ) {
      throw err;
    }

    logger.error(
      "[ai-sms-parser] Unexpected error during parseSmsWithAi",
      new Error("SMS AI parser unexpected failure"),
      {
        candidateCount: candidates.length,
        errorName: err instanceof Error ? err.name : "unknown",
      }
    );
    return {
      transactions: [],
      hasError: true,
      isRetryable: true,
      unresolvedCandidates: candidates.map((candidate) => ({
        candidate,
        reason: "unexpected_failure",
        isRetryable: true,
      })),
    };
  }
}
