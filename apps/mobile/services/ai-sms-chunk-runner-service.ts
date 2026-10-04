/**
 * AI SMS Chunk Runner Service
 *
 * Owns the per-chunk Edge Function invocation, response classification,
 * transaction mapping, and unresolved-candidate correlation helpers for the
 * SMS AI full-parser. Kept separate from the parser orchestration so the
 * parser stays focused on queue/session aggregation and under the project's
 * per-file size guideline.
 */

import {
  buildCategoryTree,
  clampConfidence,
  normalizeCurrency,
  normalizeType,
  parseCategory,
  type CategoryMap,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
import { logger } from "@/utils/logger";
import {
  invokeAuthenticatedEdgeFunction,
  isEdgeFunctionAuthenticationError,
} from "./authenticated-edge-function-service";
import {
  isCapacityRefusalReason,
  isRetryableAiFailure,
  parseAiResponse,
  parseSmsProviderRetry,
  parseSmsSafeguardRefusal,
  type AiSmsTransaction,
  type ChunkAiResult,
  type SmsProviderRetry,
  type SmsSafeguardRefusal,
} from "./ai-sms-parser-response";
import type {
  AiUnresolvedCandidate,
  ParseSmsContext,
  SmsAiAvailability,
  SmsAiRequestContext,
  SmsAiRetryRequest,
  SmsCandidate,
} from "./ai-sms-parser-service";
import { assertNotAborted } from "./abort-utils";
import { assertExpectedCurrentUser } from "./user-data-access";
import { USER_DATA_ACCESS_ERROR_CODES } from "./user-data-access-error-codes";
import {
  createSmsAiRequestKey,
  scopeSmsAiRequestKey,
  type SmsParseTransport,
} from "./sms-parse-transport";

const AI_CONSENT_REQUIRED_STATUS = 403;
const AI_CONSENT_REQUIRED_ERROR_NAME = "AiConsentRequiredError";
export interface ProgressEmissionErrorWrapper {
  readonly __isProgressEmissionError: true;
  readonly originalError: unknown;
}

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

export function isProgressEmissionError(
  error: unknown
): error is ProgressEmissionErrorWrapper {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as ProgressEmissionErrorWrapper).__isProgressEmissionError === true
  );
}

export function tagProgressEmissionError(
  error: unknown
): ProgressEmissionErrorWrapper {
  if (isProgressEmissionError(error)) {
    return error;
  }
  return {
    __isProgressEmissionError: true,
    originalError: error,
  };
}

export function unwrapProgressEmissionError(error: unknown): unknown {
  if (isProgressEmissionError(error)) {
    return error.originalError;
  }
  return error;
}

export function isParserControlFlowError(error: unknown): boolean {
  return (
    isProgressEmissionError(error) ||
    (error instanceof Error && error.name === "AbortError") ||
    isAiConsentRequiredError(error) ||
    isEdgeFunctionAuthenticationError(error) ||
    (error instanceof Error &&
      error.message === USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED)
  );
}

export interface MessagePayload {
  readonly id: string;
  readonly body: string;
  readonly sender: string;
  readonly date: string;
  readonly smsFingerprint: string;
}

export interface ChunkWork {
  readonly messages: readonly MessagePayload[];
  readonly requestKey: string;
}

export interface InvokeParseChunkInput {
  readonly messages: readonly MessagePayload[];
  readonly context: ParseSmsContext;
  readonly requestContext: SmsAiRequestContext;
  readonly requestKey: string;
  readonly transport: SmsParseTransport;
  readonly abortSignal?: AbortSignal;
  readonly expectedUserId?: string;
}

export interface AiMappingResult {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly resolvedMessageIds: ReadonlySet<string>;
  readonly failedMessageIds: ReadonlySet<string>;
  readonly hasUncorrelatedFailure: boolean;
}

export interface ChunkRunInput {
  readonly work: ChunkWork;
  readonly context: ParseSmsContext;
  readonly requestContext: SmsAiRequestContext;
  readonly transport: SmsParseTransport;
  readonly abortSignal: AbortSignal;
  readonly expectedUserId?: string;
  readonly candidateMap: ReadonlyMap<string, SmsCandidate>;
  readonly candidatesByFingerprint: ReadonlyMap<string, SmsCandidate>;
  readonly validCategoryMap: CategoryMap;
}

export interface ChunkRunOutcome {
  readonly work: ChunkWork;
  readonly chunkResult: ChunkAiResult;
  readonly mapped: AiMappingResult;
}

function throwIfAborted(abortSignal?: AbortSignal): void {
  assertNotAborted(abortSignal, "SMS parse aborted");
}

export function createUnexpectedChunkFailure(
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

export function createEmptyMapping(
  _messages: readonly MessagePayload[]
): AiMappingResult {
  return {
    transactions: [],
    resolvedMessageIds: new Set(),
    failedMessageIds: new Set(),
    hasUncorrelatedFailure: false,
  };
}

export function createUnexpectedChunkOutcome(
  work: ChunkWork,
  error: unknown
): ChunkRunOutcome {
  return {
    work,
    chunkResult: createUnexpectedChunkFailure(error, work.messages.length),
    mapped: createEmptyMapping(work.messages),
  };
}

function parseDate(dateStr: string, fallbackMs: number): Date {
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return new Date(fallbackMs);
  }
  return parsed;
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

export function mapAiTransactions(
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

async function retryGuard(input: InvokeParseChunkInput): Promise<void> {
  throwIfAborted(input.abortSignal);
  if (input.expectedUserId !== undefined) {
    await assertExpectedCurrentUser(input.expectedUserId);
    throwIfAborted(input.abortSignal);
  }
}

/**
 * Send a single chunk of messages to the Edge Function.
 * Returns validated AI transactions, or empty results on failure.
 * Throws control-flow errors (abort, consent, auth scope, auth required).
 */
export async function invokeParseChunk(
  input: InvokeParseChunkInput
): Promise<ChunkAiResult> {
  throwIfAborted(input.abortSignal);
  if (input.expectedUserId !== undefined) {
    await assertExpectedCurrentUser(input.expectedUserId);
    throwIfAborted(input.abortSignal);
  }
  const response = await invokeAuthenticatedEdgeFunction<unknown>(
    input.transport.functionName,
    {
      body: {
        requestKey: input.requestKey,
        scanSessionId: input.requestContext.scanSessionId,
        scanKind: input.requestContext.scanKind,
        scanStartedAt: new Date(
          input.requestContext.scanStartedAtMs ?? Date.now()
        ).toISOString(),
        messages: input.messages,
        categories: buildCategoryTree(input.context.categories),
        supportedCurrencies: input.context.supportedCurrencies,
        ...(input.transport.qaProfileId === undefined
          ? {}
          : {
              qaProfileId: input.transport.qaProfileId,
              qaRunId: input.transport.qaRunId,
            }),
      },
      headers: input.transport.headers,
      signal: input.abortSignal,
    },
    {
      beforeRetry: (): Promise<void> => retryGuard(input),
    }
  );

  if (response.error) {
    let status: number | undefined;
    let bodyLength: number | undefined;
    let refusalMetadata: SmsSafeguardRefusal | undefined;
    let providerRetryMetadata: SmsProviderRetry | undefined;
    const ctx = (response.error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      status = ctx.status;
      try {
        const responseText = await ctx.clone().text();
        bodyLength = responseText.length;
        const errorPayload: unknown = JSON.parse(responseText);
        refusalMetadata = parseSmsSafeguardRefusal(errorPayload);
        providerRetryMetadata = parseSmsProviderRetry(errorPayload);
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
      if (input.messages.length > 1) {
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
        oversizedFingerprints: [input.messages[0].smsFingerprint],
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

    logger.error(
      "[ai-sms-parser] parse-sms chunk failed",
      new Error("SMS AI parser request failed"),
      {
        status,
        bodyLength,
        chunkSize: input.messages.length,
      }
    );
    const hasFreshProviderRetry =
      status === 502 && providerRetryMetadata?.retryRequestMode === "fresh";
    return {
      transactions: [],
      hasError: true,
      isRetryable: isRetryableAiFailure(status),
      hasUncorrelatedFailure: true,
      failureReason: "chunk_failed",
      ...(hasFreshProviderRetry ? { retryRequestMode: "fresh" as const } : {}),
    };
  }

  return parseAiResponse(
    response.data,
    new Set(input.messages.map((message) => message.smsFingerprint))
  );
}

/**
 * Run one chunk: invoke the Edge Function, revalidate the pinned user after
 * the response, and map the returned transactions to parsed records.
 */
export async function runChunk(input: ChunkRunInput): Promise<ChunkRunOutcome> {
  const chunkResult = await invokeParseChunk({
    messages: input.work.messages,
    context: input.context,
    requestContext: input.requestContext,
    requestKey: input.work.requestKey,
    transport: input.transport,
    abortSignal: input.abortSignal,
    expectedUserId: input.expectedUserId,
  });
  throwIfAborted(input.abortSignal);
  if (input.expectedUserId !== undefined) {
    await assertExpectedCurrentUser(input.expectedUserId);
    throwIfAborted(input.abortSignal);
  }
  const mapped = mapAiTransactions(
    chunkResult.transactions,
    input.candidateMap,
    input.validCategoryMap
  );
  return { work: input.work, chunkResult, mapped };
}

export function collectUnresolvedCandidates(input: {
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

export function createCapacityLimitedCandidates(
  chunks: readonly ChunkWork[],
  candidateMap: ReadonlyMap<string, SmsCandidate>
): readonly AiUnresolvedCandidate[] {
  return chunks.flatMap(({ messages }) =>
    messages.flatMap(({ id }) => {
      const candidate = candidateMap.get(id);
      return candidate === undefined
        ? []
        : [
            {
              candidate,
              reason: "capacity_limited" as const,
              isRetryable: false,
            },
          ];
    })
  );
}

// ---------------------------------------------------------------------------
// Chunk aggregation (immutable partial results shared by sequential/parallel)
// ---------------------------------------------------------------------------

export interface ChunkAggregationState {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly unresolvedCandidates: readonly AiUnresolvedCandidate[];
  readonly unresolvedFingerprints: ReadonlySet<string>;
  readonly durableNegativeFingerprints: ReadonlySet<string>;
  readonly terminalFingerprints: ReadonlySet<string>;
  readonly oversizedCandidates: ReadonlyMap<string, SmsCandidate>;
  readonly availability?: SmsAiAvailability;
  readonly hasError: boolean;
  readonly hasNonRetryableError: boolean;
  readonly chunksCompleted: number;
  readonly totalChunks: number;
  readonly activeChunkCount: number;
}

export function createInitialAggregationState(
  totalChunks: number
): ChunkAggregationState {
  return {
    transactions: [],
    unresolvedCandidates: [],
    unresolvedFingerprints: new Set(),
    durableNegativeFingerprints: new Set(),
    terminalFingerprints: new Set(),
    oversizedCandidates: new Map(),
    hasError: false,
    hasNonRetryableError: false,
    chunksCompleted: 0,
    totalChunks,
    activeChunkCount: 0,
  };
}

export function beginChunk(
  state: ChunkAggregationState
): ChunkAggregationState {
  return { ...state, activeChunkCount: state.activeChunkCount + 1 };
}

export function endChunk(state: ChunkAggregationState): ChunkAggregationState {
  return {
    ...state,
    activeChunkCount: Math.max(0, state.activeChunkCount - 1),
  };
}

export function buildInitialChunks(
  allMessages: readonly MessagePayload[],
  transport: SmsParseTransport,
  callerRequestKey?: string
): ChunkWork[] {
  const chunks: ChunkWork[] = [];
  for (
    let index = 0;
    index < allMessages.length;
    index += transport.chunkSize
  ) {
    chunks.push({
      messages: allMessages.slice(index, index + transport.chunkSize),
      requestKey:
        callerRequestKey !== undefined &&
        allMessages.length <= transport.chunkSize
          ? scopeSmsAiRequestKey(callerRequestKey, transport.qaRunId)
          : createSmsAiRequestKey(transport.qaRunId),
    });
  }
  return chunks;
}

export function splitWork(
  work: ChunkWork,
  transport: SmsParseTransport
): { readonly left: ChunkWork; readonly right: ChunkWork } {
  const splitIndex = Math.ceil(work.messages.length / 2);
  return {
    left: {
      messages: work.messages.slice(0, splitIndex),
      requestKey: createSmsAiRequestKey(transport.qaRunId),
    },
    right: {
      messages: work.messages.slice(splitIndex),
      requestKey: createSmsAiRequestKey(transport.qaRunId),
    },
  };
}

export function createRetryRequest(
  work: ChunkWork,
  requestContext: SmsAiRequestContext,
  candidateMap: ReadonlyMap<string, SmsCandidate>
): SmsAiRetryRequest {
  return {
    requestKey: work.requestKey,
    requestContext,
    candidates: work.messages.flatMap((message) => {
      const candidate = candidateMap.get(message.id);
      return candidate ? [candidate] : [];
    }),
  };
}

export function isRollingCapacityRefusal(chunkResult: ChunkAiResult): boolean {
  return (
    chunkResult.failureReason === "capacity_limited" &&
    chunkResult.availability?.reason === "rolling_limit"
  );
}

function mergeAvailability(
  current: SmsAiAvailability | undefined,
  nextValue: SmsAiAvailability
): SmsAiAvailability | undefined {
  if (current === undefined) return nextValue;
  const currentAvailableAt = current.availableAt
    ? Date.parse(current.availableAt)
    : Number.NEGATIVE_INFINITY;
  const nextAvailableAt = nextValue.availableAt
    ? Date.parse(nextValue.availableAt)
    : Number.NEGATIVE_INFINITY;
  return nextAvailableAt > currentAvailableAt ? nextValue : current;
}

function appendUnresolved(
  state: ChunkAggregationState,
  values: readonly AiUnresolvedCandidate[]
): { readonly state: ChunkAggregationState; readonly appendedCount: number } {
  let appendedCount = 0;
  const unresolvedCandidates = [...state.unresolvedCandidates];
  const unresolvedFingerprints = new Set(state.unresolvedFingerprints);
  for (const value of values) {
    if (unresolvedFingerprints.has(value.candidate.smsFingerprint)) continue;
    unresolvedFingerprints.add(value.candidate.smsFingerprint);
    unresolvedCandidates.push(value);
    appendedCount += 1;
  }
  return {
    state: { ...state, unresolvedCandidates, unresolvedFingerprints },
    appendedCount,
  };
}

export function applyChunkResolution(
  state: ChunkAggregationState,
  input: {
    readonly chunkResult: ChunkAiResult;
    readonly mapped: AiMappingResult;
    readonly work: ChunkWork;
    readonly candidateMap: ReadonlyMap<string, SmsCandidate>;
    readonly candidatesByFingerprint: ReadonlyMap<string, SmsCandidate>;
    readonly retryRequest: SmsAiRetryRequest;
    readonly transport: SmsParseTransport;
  }
): ChunkAggregationState {
  const {
    chunkResult,
    mapped,
    work,
    candidateMap,
    candidatesByFingerprint,
    retryRequest,
    transport,
  } = input;

  let next: ChunkAggregationState = {
    ...state,
    transactions: [...state.transactions, ...mapped.transactions],
    durableNegativeFingerprints: new Set([
      ...state.durableNegativeFingerprints,
      ...(chunkResult.durableNegativeFingerprints ?? []),
    ]),
    terminalFingerprints: new Set([
      ...state.terminalFingerprints,
      ...(chunkResult.terminalFingerprints ?? []),
    ]),
  };

  for (const fingerprint of chunkResult.oversizedFingerprints ?? []) {
    const candidate = candidatesByFingerprint.get(fingerprint);
    if (candidate) {
      next = {
        ...next,
        oversizedCandidates: new Map([
          ...next.oversizedCandidates,
          [fingerprint, candidate],
        ]),
      };
    }
  }

  if (chunkResult.availability !== undefined) {
    next = {
      ...next,
      availability: mergeAvailability(
        next.availability,
        chunkResult.availability
      ),
    };
  }

  const freshRequestKey =
    chunkResult.retryRequestMode === "fresh"
      ? createSmsAiRequestKey(transport.qaRunId)
      : undefined;

  const metadataRetryRequest =
    freshRequestKey !== undefined
      ? {
          requestKey: freshRequestKey,
          requestContext: retryRequest.requestContext,
          candidates: (chunkResult.unresolvedFingerprints ?? []).flatMap(
            (fingerprint) => {
              const candidate = candidatesByFingerprint.get(fingerprint);
              return candidate ? [candidate] : [];
            }
          ),
        }
      : retryRequest;
  const metadataUnresolved = (chunkResult.unresolvedFingerprints ?? []).flatMap(
    (fingerprint) => {
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
    }
  );
  const metadata = appendUnresolved(next, metadataUnresolved);
  next =
    metadata.appendedCount > 0
      ? { ...metadata.state, hasError: true }
      : metadata.state;

  if (chunkResult.hasError) {
    const isRetryable = chunkResult.isRetryable !== false;
    const handledMessageIds = new Set(mapped.resolvedMessageIds);
    for (const fingerprint of chunkResult.oversizedFingerprints ?? []) {
      const candidate = candidatesByFingerprint.get(fingerprint);
      if (candidate) handledMessageIds.add(candidate.message.id);
    }
    const chunkRetryRequest =
      freshRequestKey !== undefined
        ? {
            ...retryRequest,
            requestKey: freshRequestKey,
          }
        : retryRequest;
    const chunkFailure = appendUnresolved(
      next,
      collectUnresolvedCandidates({
        messages: work.messages,
        candidateMap,
        resolvedMessageIds: handledMessageIds,
        failedMessageIds: new Set(chunkResult.invalidMessageIds ?? []),
        hasUncorrelatedFailure: chunkResult.hasUncorrelatedFailure === true,
        reason: chunkResult.failureReason ?? "chunk_failed",
        isRetryable,
        retryRequest: chunkRetryRequest,
      })
    );
    next = chunkFailure.state;
    if (chunkFailure.appendedCount > 0) {
      next = {
        ...next,
        hasError: true,
        ...(isRetryable ? {} : { hasNonRetryableError: true }),
      };
    }
  }

  if (mapped.failedMessageIds.size > 0 || mapped.hasUncorrelatedFailure) {
    const mapping = appendUnresolved(
      next,
      collectUnresolvedCandidates({
        messages: work.messages,
        candidateMap,
        resolvedMessageIds: mapped.resolvedMessageIds,
        failedMessageIds: mapped.failedMessageIds,
        hasUncorrelatedFailure: mapped.hasUncorrelatedFailure,
        reason: "mapping_failed",
        isRetryable: false,
      })
    );
    next = mapping.state;
    if (mapping.appendedCount > 0) {
      next = { ...next, hasError: true, hasNonRetryableError: true };
    }
  }

  return next;
}

export function applyTerminalCapacity(
  state: ChunkAggregationState,
  input: {
    readonly work: ChunkWork;
    readonly pendingWork: ReadonlySet<ChunkWork> | readonly ChunkWork[];
    readonly candidateMap: ReadonlyMap<string, SmsCandidate>;
    readonly availability?: SmsAiAvailability;
  }
): ChunkAggregationState {
  const withAvailability =
    input.availability === undefined
      ? state
      : {
          ...state,
          availability: mergeAvailability(
            state.availability,
            input.availability
          ),
        };
  return markCapacityUnresolved(
    withAvailability,
    [input.work, ...input.pendingWork],
    input.candidateMap
  );
}

export function markCapacityUnresolved(
  state: ChunkAggregationState,
  works: readonly ChunkWork[],
  candidateMap: ReadonlyMap<string, SmsCandidate>
): ChunkAggregationState {
  const capacityCandidates = createCapacityLimitedCandidates(
    works,
    candidateMap
  );
  const appended = appendUnresolved(state, capacityCandidates);
  return appended.appendedCount > 0
    ? { ...appended.state, hasError: true, hasNonRetryableError: true }
    : appended.state;
}
