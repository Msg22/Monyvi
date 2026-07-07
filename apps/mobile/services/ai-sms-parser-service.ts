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
  currency: z.string(),
  type: z.string(),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parsed edge function response.
 */
interface ChunkAiResult {
  readonly transactions: readonly AiSmsTransaction[];
  /** True if the Edge Function call failed (not a legitimate empty result). */
  readonly hasError: boolean;
  /** False for permanent failures such as auth/config 4xx responses. */
  readonly isRetryable?: boolean;
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
  };

  if (typeof data !== "object" || data === null) {
    logger.warn("[ai-sms-parser] parseAiResponse: data is not an object", {
      dataType: typeof data,
    });
    return errorResult;
  }

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.transactions)) {
    logger.warn(
      "[ai-sms-parser] parseAiResponse: no 'transactions' array in response",
      { keys: Object.keys(obj) }
    );
    return errorResult;
  }

  const transactions: AiSmsTransaction[] = [];
  let invalidCount = 0;

  for (const raw of obj.transactions) {
    const parsed = AiSmsTransactionSchema.safeParse(raw);
    if (parsed.success) {
      transactions.push(parsed.data);
    } else {
      invalidCount++;
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

  return { transactions, hasError: false };
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

/**
 * Map a batch of validated AI transactions to ParsedSmsTransaction objects.
 */
function mapAiTransactions(
  aiTransactions: readonly AiSmsTransaction[],
  candidateMap: ReadonlyMap<string, SmsCandidate>,
  validCategoryMap: CategoryMap
): ParsedSmsTransaction[] {
  const results: ParsedSmsTransaction[] = [];

  for (const aiTx of aiTransactions) {
    const candidate = candidateMap.get(aiTx.messageId);

    const currency = normalizeCurrency(aiTx.currency);
    if (!candidate) {
      logger.warn("[ai-sms-parser] Unknown messageId, skipping", {
        messageId: aiTx.messageId,
      });
      continue;
    }

    // Filter out untrusted transactions (promotional offers, ambiguous messages)
    if (!aiTx.isTrusted) {
      // PII/privacy: do NOT log the sender address or amount — those are
      // financial identifiers. Log only the parsed messageId and currency
      // enum for correlation and debugging.
      logger.info("[ai-sms-parser] Untrusted transaction, skipping", {
        messageId: aiTx.messageId,
        currency,
      });
      continue;
    }

    // Counterparty guard: must never equal the financial entity
    const counterparty =
      candidate.message.address &&
      aiTx.counterparty.toLowerCase().trim() ===
        candidate.message.address.toLowerCase().trim()
        ? ""
        : aiTx.counterparty;

    const category = parseCategory(aiTx.categorySystemName, validCategoryMap);

    results.push({
      amount: aiTx.amount,
      currency,
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
    });
  }

  return results;
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
    const errorMsg =
      response.error instanceof Error
        ? response.error.message
        : String(response.error);

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
      throw createAbortError("AI processing consent required");
    }

    // PII/privacy: do NOT include the response body. Upstream providers
    // sometimes echo the original SMS text in error responses. Log only
    // the HTTP status, body length, and chunk size for diagnostics.
    logger.error(
      "[ai-sms-parser] parse-sms chunk failed",
      response.error instanceof Error ? response.error : new Error(errorMsg),
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
 * @throws Never — returns empty array on total failure
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
    let hasRetryableError = false;
    const allResults: ParsedSmsTransaction[] = [];

    let chunkIndex = 0;
    while (chunkIndex < chunkQueue.length) {
      throwIfAborted(abortSignal);

      // Delay between chunks to avoid Gemini rate limits (skip for first chunk)
      if (chunkIndex > 0) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, INTER_CHUNK_DELAY_MS)
        );
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

      if (chunkResult.hasError) {
        hasError = true;
        if (chunkResult.isRetryable !== false) {
          hasRetryableError = true;
        }
      }

      // Chunk succeeded (or it's a retry that returned no results — we accept that)
      const mapped = mapAiTransactions(
        chunkResult.transactions,
        candidateMap,
        validCategoryMap
      );
      allResults.push(...mapped);

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
      isRetryable: hasError ? hasRetryableError : undefined,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw err;
    }

    logger.error(
      "[ai-sms-parser] Unexpected error during parseSmsWithAi",
      err,
      { candidateCount: candidates.length }
    );
    return { transactions: [], hasError: true, isRetryable: true };
  }
}
