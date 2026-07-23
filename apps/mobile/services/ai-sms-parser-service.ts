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

import * as Crypto from "expo-crypto";
import { supabase } from "./supabase";
import { logger } from "@/utils/logger";
import {
  shouldBlockUnsafeSmsParserConfiguration,
  shouldUseFixtureSmsParser,
} from "@/config/e2e-test-config";
import { getSmsSafeguardQaConfig } from "@/config/sms-safeguard-qa-config";
import { assertNotAborted, createAbortError } from "./abort-utils";
import { assertExpectedCurrentUser } from "./user-data-access";
import { USER_DATA_ACCESS_ERROR_CODES } from "./user-data-access-error-codes";

import {
  buildCategoryMap,
  buildCategoryTree,
  clampConfidence,
  normalizeCurrency,
  normalizeType,
  parseCategory,
  type CategoryMap,
  type CategoryTreeSource,
  type ParsedSmsTransaction,
  type SmsMessage,
} from "@monyvi/logic";
import {
  isCapacityRefusalReason,
  isRetryableAiFailure,
  parseAiResponse,
  parseSmsSafeguardRefusal,
  type AiSmsTransaction,
  type ChunkAiResult,
  type SmsSafeguardRefusal,
} from "./ai-sms-parser-response";
import {
  resolveSmsParseTransport,
  type SmsParseTransport,
} from "./sms-parse-transport";

// ---------------------------------------------------------------------------
// Schemas — AI response validation
// ---------------------------------------------------------------------------

/** Result from AI parsing */
export interface AiParseResult {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly hasError?: boolean;
  readonly isRetryable?: boolean;
  readonly unresolvedCandidates?: readonly AiUnresolvedCandidate[];
  readonly durableNegativeFingerprints?: readonly string[];
  readonly terminalFingerprints?: readonly string[];
  readonly oversizedCandidates?: readonly SmsCandidate[];
  readonly availability?: SmsAiAvailability;
}

export type SmsAiAvailabilityReason =
  | "scan_limit"
  | "rolling_limit"
  | "burst_limit"
  | "history_cooldown"
  | "already_processed_result_unavailable";

export interface SmsAiAvailability {
  readonly reason: SmsAiAvailabilityReason;
  readonly availableAt: string | null;
}

export interface SmsAiRequestContext {
  readonly scanSessionId: string | null;
  readonly scanKind: "initial" | "incremental" | "history" | "live";
  readonly scanStartedAtMs?: number;
}

export interface AiUnresolvedCandidate {
  readonly candidate: SmsCandidate;
  readonly reason:
    | "chunk_failed"
    | "mapping_failed"
    | "response_invalid"
    | "unexpected_failure"
    | "capacity_limited";
  readonly isRetryable: boolean;
  readonly retryRequest?: SmsAiRetryRequest;
}

export interface SmsAiRetryRequest {
  readonly requestKey: string;
  readonly requestContext: SmsAiRequestContext;
  readonly candidates: readonly SmsCandidate[];
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

function isParserControlFlowError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    isAiConsentRequiredError(error) ||
    (error instanceof Error &&
      error.message === USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED)
  );
}

function createUnexpectedChunkFailure(
  error: unknown,
  candidateCount: number
): ChunkAiResult {
  logger.error(
    "[ai-sms-parser] Unexpected error during parseSmsWithAi",
    new Error("SMS AI parser unexpected failure"),
    {
      candidateCount,
      errorName: error instanceof Error ? error.name : "unknown",
    }
  );
  return {
    transactions: [],
    hasError: true,
    isRetryable: true,
    hasUncorrelatedFailure: true,
    failureReason: "unexpected_failure",
  };
}

/**
 * Safely parse and validate the Edge Function response.
 * Uses Zod schema validation for each transaction entry.
 * Marks unexpected response shapes as errors so retry-capable callers can
 * recover instead of treating malformed responses as legitimate empty results.
 */
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
  requestContext: SmsAiRequestContext,
  requestKey: string,
  transport: SmsParseTransport,
  abortSignal?: AbortSignal,
  expectedUserId?: string
): Promise<ChunkAiResult> {
  throwIfAborted(abortSignal);
  if (expectedUserId !== undefined) {
    await assertExpectedCurrentUser(expectedUserId);
    throwIfAborted(abortSignal);
  }
  const response = await supabase.functions.invoke(transport.functionName, {
    body: {
      requestKey,
      scanSessionId: requestContext.scanSessionId,
      scanKind: requestContext.scanKind,
      scanStartedAt: new Date(
        requestContext.scanStartedAtMs ?? Date.now()
      ).toISOString(),
      messages: messagesPayload,
      categories: buildCategoryTree(context.categories),
      supportedCurrencies: context.supportedCurrencies,
      ...(transport.qaProfileId === undefined
        ? {}
        : {
            qaProfileId: transport.qaProfileId,
            qaRunId: transport.qaRunId,
          }),
    },
    headers: transport.headers,
    signal: abortSignal,
  });

  if (response.error) {
    // supabase-js wraps non-2xx responses in FunctionsHttpError with a
    // generic message. The actual status + body live on `error.context`
    // (a Response). Read them so we can tell auth (401) apart from
    // payload/runtime errors (4xx/5xx) without guessing.
    let status: number | undefined;
    let bodyLength: number | undefined;
    let refusalMetadata: SmsSafeguardRefusal | undefined;
    const ctx = (response.error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      status = ctx.status;
      try {
        const responseText = await ctx.clone().text();
        bodyLength = responseText.length;
        refusalMetadata = parseSmsSafeguardRefusal(JSON.parse(responseText));
      } catch {
        bodyLength = undefined;
      }
    }

    if (status === AI_CONSENT_REQUIRED_STATUS) {
      throw createAiConsentRequiredError();
    }

    if (
      status === 413 &&
      refusalMetadata !== undefined &&
      !isCapacityRefusalReason(refusalMetadata.reason)
    ) {
      if (messagesPayload.length > 1) {
        return {
          transactions: [],
          hasError: false,
          isRetryable: false,
          shouldSplitForSize: true,
        };
      }
      if (refusalMetadata.sizeScope !== "candidate") {
        return {
          transactions: [],
          hasError: true,
          isRetryable: false,
          hasUncorrelatedFailure: true,
          failureReason: "unexpected_failure",
        };
      }
      return {
        transactions: [],
        hasError: false,
        isRetryable: false,
        oversizedFingerprints: [messagesPayload[0].smsFingerprint],
      };
    }

    if (
      status === 429 &&
      refusalMetadata !== undefined &&
      isCapacityRefusalReason(refusalMetadata.reason)
    ) {
      return {
        transactions: [],
        hasError: true,
        isRetryable: false,
        hasUncorrelatedFailure: true,
        failureReason: "capacity_limited",
        availability: {
          reason: refusalMetadata.reason,
          availableAt: refusalMetadata.availableAt ?? null,
        },
      };
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

  return parseAiResponse(
    response.data,
    new Set(messagesPayload.map((message) => message.smsFingerprint))
  );
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
  readonly smsFingerprint: string;
}

interface ChunkWork {
  readonly messages: readonly MessagePayload[];
  readonly requestKey: string;
}

function collectUnresolvedCandidates(input: {
  readonly messages: readonly MessagePayload[];
  readonly candidateMap: ReadonlyMap<string, SmsCandidate>;
  readonly resolvedMessageIds: ReadonlySet<string>;
  readonly failedMessageIds: ReadonlySet<string>;
  readonly hasUncorrelatedFailure: boolean;
  readonly reason: AiUnresolvedCandidate["reason"];
  readonly isRetryable: boolean;
  readonly retryRequest?: SmsAiRetryRequest;
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
    const isExplicitlyFailed = input.failedMessageIds.has(messageId);
    if (input.resolvedMessageIds.has(messageId) && !isExplicitlyFailed)
      return [];
    const candidate = input.candidateMap.get(messageId);
    return candidate
      ? [
          {
            candidate,
            reason: input.reason,
            isRetryable: input.isRetryable,
            ...(input.isRetryable && input.retryRequest !== undefined
              ? { retryRequest: input.retryRequest }
              : {}),
          },
        ]
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
 * @param expectedUserId - Optional user scope that must still own each request
 * @returns Parsed transactions only (account suggestions derived separately)
 * @throws AbortError when the caller cancels, or AiConsentRequiredError when
 * the existing AI consent gate rejects the request.
 */
export async function parseSmsWithAi(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  onProgress?: (progress: AiParseProgress) => void,
  abortSignal?: AbortSignal,
  expectedUserId?: string,
  requestContext?: SmsAiRequestContext,
  requestKey?: string
): Promise<AiParseResult> {
  const emptyResult: AiParseResult = { transactions: [], hasError: false };
  if (candidates.length === 0) return emptyResult;
  throwIfAborted(abortSignal);

  if (shouldBlockUnsafeSmsParserConfiguration()) {
    logger.warn("aiSmsParser.unsafeConfigurationBlocked", {
      candidateCount: candidates.length,
    });
    return {
      transactions: [],
      hasError: true,
      isRetryable: false,
      unresolvedCandidates: candidates.map((candidate) => ({
        candidate,
        reason: "unexpected_failure",
        isRetryable: false,
      })),
    };
  }

  try {
    const safeguardQaConfig = getSmsSafeguardQaConfig();
    if (!safeguardQaConfig.enabled && shouldUseFixtureSmsParser()) {
      const parseSmsWithFixtureAi = loadFixtureSmsParser();
      return await parseSmsWithFixtureAi(
        candidates,
        context,
        onProgress,
        abortSignal
      );
    }

    const transport = resolveSmsParseTransport(CLIENT_CHUNK_SIZE);

    // Build validation set once for the entire parse session
    const validCategoryMap = buildCategoryMap(context.categories);

    // Build the lookup map: messageId → candidate
    const candidateMap = new Map<string, SmsCandidate>();
    const candidatesByFingerprint = new Map<string, SmsCandidate>();
    const allMessages: readonly MessagePayload[] = candidates.map((c) => {
      candidateMap.set(c.message.id, c);
      candidatesByFingerprint.set(c.smsFingerprint, c);
      return {
        id: c.message.id,
        body: c.message.body,
        sender: c.message.address,
        date: new Date(c.message.date).toISOString(),
        smsFingerprint: c.smsFingerprint,
      };
    });
    const resolvedRequestContext: SmsAiRequestContext = {
      scanSessionId:
        requestContext === undefined
          ? Crypto.randomUUID()
          : requestContext.scanSessionId,
      scanKind: requestContext?.scanKind ?? "incremental",
      scanStartedAtMs: requestContext?.scanStartedAtMs ?? Date.now(),
    };

    // Build a queue of chunks to process. Retry-with-split may add
    // sub-chunks dynamically, so we use a queue instead of index-based loop.

    // Initial chunking
    const chunkQueue: ChunkWork[] = [];
    for (let i = 0; i < allMessages.length; i += transport.chunkSize) {
      chunkQueue.push({
        messages: allMessages.slice(i, i + transport.chunkSize),
        requestKey:
          requestKey !== undefined && allMessages.length <= transport.chunkSize
            ? requestKey
            : Crypto.randomUUID(),
      });
    }

    let totalChunks = chunkQueue.length;
    let chunksCompleted = 0;
    let hasError = false;
    let hasNonRetryableError = false;
    const allResults: ParsedSmsTransaction[] = [];
    const unresolvedCandidates: AiUnresolvedCandidate[] = [];
    const unresolvedFingerprints = new Set<string>();
    const durableNegativeFingerprints = new Set<string>();
    const terminalFingerprints = new Set<string>();
    const oversizedCandidates = new Map<string, SmsCandidate>();
    let availability: SmsAiAvailability | undefined;

    let chunkIndex = 0;
    while (chunkIndex < chunkQueue.length) {
      throwIfAborted(abortSignal);

      // Delay between chunks to avoid Gemini rate limits (skip for first chunk)
      if (chunkIndex > 0) {
        await waitForInterChunkDelay(abortSignal);
      }
      throwIfAborted(abortSignal);

      const currentChunk = chunkQueue[chunkIndex];
      const retryRequest: SmsAiRetryRequest = {
        requestKey: currentChunk.requestKey,
        requestContext: resolvedRequestContext,
        candidates: currentChunk.messages.flatMap((message) => {
          const candidate = candidateMap.get(message.id);
          return candidate ? [candidate] : [];
        }),
      };
      const chunkStartMs = Date.now();

      let chunkResult: ChunkAiResult;
      try {
        chunkResult = await invokeParseChunk(
          currentChunk.messages,
          context,
          resolvedRequestContext,
          currentChunk.requestKey,
          transport,
          abortSignal,
          expectedUserId
        );
      } catch (error: unknown) {
        if (isParserControlFlowError(error)) throw error;
        chunkResult = createUnexpectedChunkFailure(
          error,
          currentChunk.messages.length
        );
      }
      throwIfAborted(abortSignal);
      const chunkDurationMs = Date.now() - chunkStartMs;

      if (chunkResult.shouldSplitForSize === true) {
        const splitIndex = Math.ceil(currentChunk.messages.length / 2);
        const leftMessages = currentChunk.messages.slice(0, splitIndex);
        const rightMessages = currentChunk.messages.slice(splitIndex);
        chunkQueue.splice(
          chunkIndex,
          1,
          { messages: leftMessages, requestKey: Crypto.randomUUID() },
          { messages: rightMessages, requestKey: Crypto.randomUUID() }
        );
        totalChunks++;
        continue;
      }

      const mapped = mapAiTransactions(
        chunkResult.transactions,
        candidateMap,
        validCategoryMap
      );
      allResults.push(...mapped.transactions);
      for (const fingerprint of chunkResult.durableNegativeFingerprints ?? []) {
        durableNegativeFingerprints.add(fingerprint);
      }
      for (const fingerprint of chunkResult.terminalFingerprints ?? []) {
        terminalFingerprints.add(fingerprint);
      }
      for (const fingerprint of chunkResult.oversizedFingerprints ?? []) {
        const oversizedCandidate = candidatesByFingerprint.get(fingerprint);
        if (oversizedCandidate) {
          oversizedCandidates.set(fingerprint, oversizedCandidate);
        }
      }
      if (chunkResult.availability !== undefined) {
        const currentAvailableAt = availability?.availableAt
          ? Date.parse(availability.availableAt)
          : Number.NEGATIVE_INFINITY;
        const nextAvailableAt = chunkResult.availability.availableAt
          ? Date.parse(chunkResult.availability.availableAt)
          : Number.NEGATIVE_INFINITY;
        if (
          availability === undefined ||
          nextAvailableAt > currentAvailableAt
        ) {
          availability = chunkResult.availability;
        }
      }

      const appendUnresolved = (
        values: readonly AiUnresolvedCandidate[]
      ): number => {
        let appendedCount = 0;
        for (const value of values) {
          if (unresolvedFingerprints.has(value.candidate.smsFingerprint))
            continue;
          unresolvedFingerprints.add(value.candidate.smsFingerprint);
          unresolvedCandidates.push(value);
          appendedCount++;
        }
        return appendedCount;
      };

      const metadataRetryRequest =
        chunkResult.retryRequestMode === "fresh"
          ? {
              requestKey: Crypto.randomUUID(),
              requestContext: resolvedRequestContext,
              candidates: (chunkResult.unresolvedFingerprints ?? []).flatMap(
                (fingerprint) => {
                  const candidate = candidatesByFingerprint.get(fingerprint);
                  return candidate ? [candidate] : [];
                }
              ),
            }
          : retryRequest;
      const metadataUnresolved = (
        chunkResult.unresolvedFingerprints ?? []
      ).flatMap((fingerprint) => {
        const candidate = candidatesByFingerprint.get(fingerprint);
        return candidate
          ? [
              {
                candidate,
                reason: "chunk_failed" as const,
                isRetryable: true,
                retryRequest: metadataRetryRequest,
              },
            ]
          : [];
      });
      if (appendUnresolved(metadataUnresolved) > 0) {
        hasError = true;
      }

      if (chunkResult.hasError) {
        const isRetryable = chunkResult.isRetryable !== false;
        const handledMessageIds = new Set(mapped.resolvedMessageIds);
        for (const fingerprint of chunkResult.oversizedFingerprints ?? []) {
          const candidate = candidatesByFingerprint.get(fingerprint);
          if (candidate) handledMessageIds.add(candidate.message.id);
        }
        const appendedCount = appendUnresolved(
          collectUnresolvedCandidates({
            messages: currentChunk.messages,
            candidateMap,
            resolvedMessageIds: handledMessageIds,
            failedMessageIds: new Set(chunkResult.invalidMessageIds ?? []),
            hasUncorrelatedFailure: chunkResult.hasUncorrelatedFailure === true,
            reason: chunkResult.failureReason ?? "chunk_failed",
            isRetryable,
            retryRequest,
          })
        );
        if (appendedCount > 0) {
          hasError = true;
          if (!isRetryable) hasNonRetryableError = true;
        }
      }

      if (mapped.failedMessageIds.size > 0 || mapped.hasUncorrelatedFailure) {
        const appendedCount = appendUnresolved(
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
        if (appendedCount > 0) {
          hasError = true;
          hasNonRetryableError = true;
        }
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
      isRetryable:
        hasError || oversizedCandidates.size > 0
          ? hasError && !hasNonRetryableError
          : undefined,
      unresolvedCandidates,
      durableNegativeFingerprints: [...durableNegativeFingerprints],
      terminalFingerprints: [...terminalFingerprints],
      oversizedCandidates: [...oversizedCandidates.values()],
      availability,
    };
  } catch (err: unknown) {
    if (isParserControlFlowError(err)) {
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

export async function initializeSmsAiScanSession(
  context: ParseSmsContext,
  requestContext: SmsAiRequestContext,
  abortSignal?: AbortSignal,
  expectedUserId?: string
): Promise<void> {
  if (requestContext.scanSessionId === null) return;
  const result = await invokeParseChunk(
    [],
    context,
    requestContext,
    Crypto.randomUUID(),
    resolveSmsParseTransport(CLIENT_CHUNK_SIZE),
    abortSignal,
    expectedUserId
  );
  if (result.hasError) {
    throw new Error("SMS scan session initialization failed");
  }
}
