/**
 * AI SMS Parser Service
 *
 * Mobile-side service client for the `/parse-sms` Edge Function.
 * Sends filtered SMS candidates to the configured SMS AI provider via Supabase Edge Function
 * and maps the AI response back to `ParsedSmsTransaction` objects.
 *
 * Real transport runs chunks through a shared bounded refilling queue
 * (≤ {@link CONCURRENT_BATCHES} parallel HTTP requests) with immutable partial
 * aggregations and serialized progress. Safeguard QA keeps its sequential
 * request size + delay so QA determinism is unchanged.
 *
 * Falls back to `sms-category-mapper.ts` if the AI call fails.
 *
 * @module ai-sms-parser-service
 */

import * as Crypto from "expo-crypto";
import { logger } from "@/utils/logger";
import {
  shouldBlockUnsafeSmsParserConfiguration,
  shouldUseFixtureSmsParser,
} from "@/config/e2e-test-config";
import { getSmsSafeguardQaConfig } from "@/config/sms-safeguard-qa-config";
import { assertNotAborted, createAbortError } from "./abort-utils";
import { assertExpectedCurrentUser } from "./user-data-access";
import {
  buildCategoryMap,
  type CategoryMap,
  type CategoryTreeSource,
  type ParsedSmsTransaction,
  type SmsMessage,
} from "@monyvi/logic";
import {
  createSmsAiRequestKey,
  resolveSmsParseTransport,
  type SmsParseTransport,
} from "./sms-parse-transport";
import { CONCURRENT_BATCHES } from "@/constants/sms-ai";
import {
  runConcurrentBatchQueue,
  type ConcurrentBatchQueueResult,
  type ConcurrentBatchRun,
} from "./concurrent-batch-queue-service";
import {
  applyChunkResolution,
  applyTerminalCapacity,
  beginChunk,
  buildInitialChunks,
  createInitialAggregationState,
  createRetryRequest,
  createUnexpectedChunkOutcome,
  endChunk,
  invokeParseChunk,
  isParserControlFlowError,
  isProgressEmissionError,
  isRollingCapacityRefusal,
  markCapacityUnresolved,
  runChunk,
  splitWork,
  tagProgressEmissionError,
  unwrapProgressEmissionError,
  type ChunkAggregationState,
  type ChunkRunOutcome,
  type ChunkWork,
  type MessagePayload,
} from "./ai-sms-chunk-runner-service";

export {
  createAiConsentRequiredError,
  isAiConsentRequiredError,
} from "./ai-sms-chunk-runner-service";

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
  readonly categories: readonly CategoryTreeSource[];
  readonly supportedCurrencies: readonly string[];
}

// ---------------------------------------------------------------------------
// Input type — candidate SMS for AI processing
// ---------------------------------------------------------------------------

export interface SmsCandidate {
  readonly message: SmsMessage;
  readonly smsFingerprint: string;
}

// ---------------------------------------------------------------------------

/**
 * Client-side chunk size — messages per Edge Function call.
 */
const CLIENT_CHUNK_SIZE = 15;

/** Delay between chunks (ms) for the sequential QA transport. */
const INTER_CHUNK_DELAY_MS = 2000;

type AiParseProgressCallback = (
  progress: AiParseProgress
) => void | Promise<void>;

/** Callback invoked after each chunk completes (or after a retry resolves). */
export interface AiParseProgress {
  readonly chunksCompleted: number;
  readonly totalChunks: number;
  readonly transactionsSoFar: number;
  readonly completedTransactions: readonly ParsedSmsTransaction[];
  /** Duration of the just-completed chunk in milliseconds. Used for time estimation. */
  readonly chunkDurationMs: number;
  /**
   * Number of chunks currently in flight during real parallel transport.
   * Optional; callers MUST default to 1 (sequential) when absent, so the
   * parallel ETA division only applies to true parallel runs.
   */
  readonly concurrentBatchCount?: number;
}

// ---------------------------------------------------------------------------
// Aggregation session
// ---------------------------------------------------------------------------

type ParseSessionState = ChunkAggregationState;

interface ParseSession {
  state: ParseSessionState;
  pendingWork: Set<ChunkWork>;
  emitChain: Promise<void>;
  emitFailure: unknown;
  onProgress: AiParseProgressCallback | undefined;
  runSignal?: AbortSignal;
  expectedUserId?: string;
}

interface ChunkDriverInput {
  readonly workItems: readonly ChunkWork[];
  readonly context: ParseSmsContext;
  readonly resolvedRequestContext: SmsAiRequestContext;
  readonly transport: SmsParseTransport;
  readonly candidateMap: ReadonlyMap<string, SmsCandidate>;
  readonly candidatesByFingerprint: ReadonlyMap<string, SmsCandidate>;
  readonly validCategoryMap: CategoryMap;
  readonly onProgress?: AiParseProgressCallback;
  readonly expectedUserId?: string;
}

function createSession(input: {
  readonly onProgress?: AiParseProgressCallback;
  readonly totalChunks: number;
  readonly runSignal?: AbortSignal;
  readonly expectedUserId?: string;
}): ParseSession {
  return {
    state: createInitialAggregationState(input.totalChunks),
    pendingWork: new Set(),
    emitChain: Promise.resolve(),
    emitFailure: null,
    onProgress: input.onProgress,
    runSignal: input.runSignal,
    expectedUserId: input.expectedUserId,
  };
}

async function emitProgress(
  session: ParseSession,
  deltaTransactions: readonly ParsedSmsTransaction[],
  chunkDurationMs: number
): Promise<void> {
  // Primitive-fidelity exception: emitFailure intentionally preserves non-Error
  // progress values (see primitive-fidelity Gap coverage); it is rethrown as-is.
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  if (session.emitFailure !== null) throw session.emitFailure;
  const snapshot = session.state;
  const progress: AiParseProgress = {
    chunksCompleted: snapshot.chunksCompleted,
    totalChunks: snapshot.totalChunks,
    transactionsSoFar: snapshot.transactions.length,
    completedTransactions: deltaTransactions,
    chunkDurationMs,
    concurrentBatchCount: Math.max(1, snapshot.activeChunkCount),
  };
  session.emitChain = session.emitChain.then(async () => {
    if (typeof session.onProgress !== "function") return;
    if (session.runSignal?.aborted) return;
    if (session.expectedUserId !== undefined) {
      await assertExpectedCurrentUser(session.expectedUserId);
      if (session.runSignal?.aborted) return;
    }
    const emitted = session.onProgress(progress);
    if (emitted !== undefined) await emitted;
  });
  try {
    await session.emitChain;
  } catch (error: unknown) {
    const tagged = tagProgressEmissionError(error);
    if (session.emitFailure === null) session.emitFailure = tagged;
    // Primitive-fidelity exception: tagged progress values (including
    // preserved primitives) are rethrown without Error wrapping.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw tagged;
  }
}

function resultFromState(state: ParseSessionState): AiParseResult {
  return {
    transactions: state.transactions,
    hasError: state.hasError,
    isRetryable:
      state.hasError || state.oversizedCandidates.size > 0
        ? state.hasError && !state.hasNonRetryableError
        : undefined,
    unresolvedCandidates: state.unresolvedCandidates,
    durableNegativeFingerprints: [...state.durableNegativeFingerprints],
    terminalFingerprints: [...state.terminalFingerprints],
    oversizedCandidates: [...state.oversizedCandidates.values()],
    availability: state.availability,
  };
}

// ---------------------------------------------------------------------------
// Chunk construction
// ---------------------------------------------------------------------------

function buildParsePayloads(candidates: readonly SmsCandidate[]): {
  readonly candidateMap: ReadonlyMap<string, SmsCandidate>;
  readonly candidatesByFingerprint: ReadonlyMap<string, SmsCandidate>;
  readonly allMessages: readonly MessagePayload[];
} {
  const candidateMap = new Map<string, SmsCandidate>();
  const candidatesByFingerprint = new Map<string, SmsCandidate>();
  const allMessages: MessagePayload[] = candidates.map((c) => {
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
  return { candidateMap, candidatesByFingerprint, allMessages };
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

function loadFixtureSmsParser(): typeof import("./testing/ai-sms-fixture-parser").parseSmsWithFixtureAi {
  // Scoped lazy-require exception: the QA fixture parser must stay out of the
  // production bundle path and load only on demand; no loader redesign.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fixtureParser =
    require("./testing/ai-sms-fixture-parser") as typeof import("./testing/ai-sms-fixture-parser");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return fixtureParser.parseSmsWithFixtureAi;
}

// ---------------------------------------------------------------------------
// Sequential driver (safeguard QA transport)
// ---------------------------------------------------------------------------

async function runSequentialChunks(
  input: ChunkDriverInput & {
    readonly abortSignal?: AbortSignal;
  }
): Promise<AiParseResult> {
  const session = createSession({
    onProgress: input.onProgress,
    totalChunks: input.workItems.length,
    runSignal: input.abortSignal,
    expectedUserId: input.expectedUserId,
  });
  const chunkQueue: ChunkWork[] = [...input.workItems];
  for (const chunk of chunkQueue) session.pendingWork.add(chunk);

  let chunkIndex = 0;
  while (chunkIndex < chunkQueue.length) {
    throwIfAborted(input.abortSignal);
    if (chunkIndex > 0) {
      await waitForInterChunkDelay(input.abortSignal);
    }
    throwIfAborted(input.abortSignal);

    const work = chunkQueue[chunkIndex];
    session.pendingWork.delete(work);
    const chunkStartMs = Date.now();
    let outcome: ChunkRunOutcome;
    try {
      outcome = await runChunk({
        work,
        context: input.context,
        requestContext: input.resolvedRequestContext,
        transport: input.transport,
        abortSignal: input.abortSignal ?? new AbortController().signal,
        expectedUserId: input.expectedUserId,
        candidateMap: input.candidateMap,
        candidatesByFingerprint: input.candidatesByFingerprint,
        validCategoryMap: input.validCategoryMap,
      });
    } catch (error: unknown) {
      if (isParserControlFlowError(error)) throw error;
      outcome = createUnexpectedChunkOutcome(work, error);
    }
    throwIfAborted(input.abortSignal);
    const chunkDurationMs = Date.now() - chunkStartMs;
    const chunkResult = outcome.chunkResult;

    if (chunkResult.shouldSplitForSize === true) {
      const { left, right } = splitWork(work, input.transport);
      chunkQueue.splice(chunkIndex, 1, left, right);
      session.state = {
        ...session.state,
        totalChunks: session.state.totalChunks + 1,
      };
      continue;
    }

    if (isRollingCapacityRefusal(chunkResult) && work.messages.length > 1) {
      const { left, right } = splitWork(work, input.transport);
      chunkQueue.splice(chunkIndex, 1, left, right);
      session.state = {
        ...session.state,
        totalChunks: session.state.totalChunks + 1,
      };
      continue;
    }

    if (chunkResult.failureReason === "capacity_limited") {
      session.state = applyTerminalCapacity(session.state, {
        work,
        pendingWork: chunkQueue.slice(chunkIndex + 1),
        candidateMap: input.candidateMap,
        availability: chunkResult.availability,
      });
      session.state = {
        ...session.state,
        chunksCompleted: session.state.chunksCompleted + 1,
      };
      await emitProgress(session, outcome.mapped.transactions, chunkDurationMs);
      break;
    }

    const retryRequest = createRetryRequest(
      work,
      input.resolvedRequestContext,
      input.candidateMap
    );
    session.state = applyChunkResolution(session.state, {
      chunkResult,
      mapped: outcome.mapped,
      work,
      candidateMap: input.candidateMap,
      candidatesByFingerprint: input.candidatesByFingerprint,
      retryRequest,
      transport: input.transport,
    });
    session.state = {
      ...session.state,
      chunksCompleted: session.state.chunksCompleted + 1,
    };
    await emitProgress(session, outcome.mapped.transactions, chunkDurationMs);
    chunkIndex += 1;
  }

  await session.emitChain;
  return resultFromState(session.state);
}

// ---------------------------------------------------------------------------
// Concurrent driver (real transport)
// ---------------------------------------------------------------------------

async function handleConcurrentOutcome(input: {
  readonly session: ParseSession;
  readonly run: ConcurrentBatchRun<ChunkWork>;
  readonly work: ChunkWork;
  readonly outcome: ChunkRunOutcome;
  readonly chunkDurationMs: number;
  readonly transport: SmsParseTransport;
  readonly candidateMap: ReadonlyMap<string, SmsCandidate>;
  readonly candidatesByFingerprint: ReadonlyMap<string, SmsCandidate>;
  readonly resolvedRequestContext: SmsAiRequestContext;
}): Promise<void> {
  const { session, run, work, outcome } = input;
  const chunkResult = outcome.chunkResult;

  if (chunkResult.shouldSplitForSize === true) {
    enqueueSplit(session, run, work, input.transport);
    return;
  }

  if (isRollingCapacityRefusal(chunkResult) && work.messages.length > 1) {
    enqueueSplit(session, run, work, input.transport);
    return;
  }

  if (chunkResult.failureReason === "capacity_limited") {
    run.stop();
    session.state = applyTerminalCapacity(session.state, {
      work,
      pendingWork: session.pendingWork,
      candidateMap: input.candidateMap,
      availability: chunkResult.availability,
    });
    session.state = {
      ...session.state,
      chunksCompleted: session.state.chunksCompleted + 1,
    };
    await emitProgress(
      session,
      outcome.mapped.transactions,
      input.chunkDurationMs
    );
    return;
  }

  const retryRequest = createRetryRequest(
    work,
    input.resolvedRequestContext,
    input.candidateMap
  );
  session.state = applyChunkResolution(session.state, {
    chunkResult,
    mapped: outcome.mapped,
    work,
    candidateMap: input.candidateMap,
    candidatesByFingerprint: input.candidatesByFingerprint,
    retryRequest,
    transport: input.transport,
  });
  session.state = {
    ...session.state,
    chunksCompleted: session.state.chunksCompleted + 1,
  };
  await emitProgress(
    session,
    outcome.mapped.transactions,
    input.chunkDurationMs
  );
}

function enqueueSplit(
  session: ParseSession,
  run: ConcurrentBatchRun<ChunkWork>,
  work: ChunkWork,
  transport: SmsParseTransport
): void {
  const { left, right } = splitWork(work, transport);
  session.pendingWork.add(left);
  session.pendingWork.add(right);
  session.state = {
    ...session.state,
    totalChunks: session.state.totalChunks + 1,
  };
  run.enqueue(left);
  run.enqueue(right);
}

async function finalizeFromQueue(
  session: ParseSession,
  queueResult: ConcurrentBatchQueueResult<ChunkWork>,
  runSignal: AbortSignal
): Promise<AiParseResult> {
  try {
    await session.emitChain;
  } catch (error: unknown) {
    if (session.emitFailure === null) {
      session.emitFailure = tagProgressEmissionError(error);
    }
  }
  const firstFailure = queueResult.failed[0];
  // Primitive-fidelity exception: queue failures and preserved progress values
  // are rethrown exactly (including non-Error primitives), never wrapped.
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  if (firstFailure !== undefined) throw firstFailure.error;
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  if (session.emitFailure !== null) throw session.emitFailure;
  if (queueResult.cancelled.length > 0 || runSignal.aborted) {
    throw createAbortError("SMS parse aborted");
  }
  return resultFromState(session.state);
}

async function runConcurrentChunks(
  input: ChunkDriverInput & {
    readonly runSignal: AbortSignal;
    readonly runController: AbortController;
  }
): Promise<AiParseResult> {
  const session = createSession({
    onProgress: input.onProgress,
    totalChunks: input.workItems.length,
    runSignal: input.runSignal,
    expectedUserId: input.expectedUserId,
  });
  for (const chunk of input.workItems) session.pendingWork.add(chunk);

  const process = async (
    work: ChunkWork,
    run: ConcurrentBatchRun<ChunkWork>
  ): Promise<void> => {
    session.pendingWork.delete(work);
    session.state = beginChunk(session.state);
    const chunkStartMs = Date.now();
    try {
      let outcome: ChunkRunOutcome;
      try {
        outcome = await runChunk({
          work,
          context: input.context,
          requestContext: input.resolvedRequestContext,
          transport: input.transport,
          abortSignal: input.runSignal,
          expectedUserId: input.expectedUserId,
          candidateMap: input.candidateMap,
          candidatesByFingerprint: input.candidatesByFingerprint,
          validCategoryMap: input.validCategoryMap,
        });
      } catch (error: unknown) {
        if (isParserControlFlowError(error)) {
          run.stop();
          input.runController.abort();
          throw error;
        }
        outcome = createUnexpectedChunkOutcome(work, error);
      }
      try {
        await handleConcurrentOutcome({
          session,
          run,
          work,
          outcome,
          chunkDurationMs: Date.now() - chunkStartMs,
          transport: input.transport,
          candidateMap: input.candidateMap,
          candidatesByFingerprint: input.candidatesByFingerprint,
          resolvedRequestContext: input.resolvedRequestContext,
        });
      } catch (error: unknown) {
        run.stop();
        input.runController.abort();
        throw error;
      }
    } finally {
      session.state = endChunk(session.state);
    }
  };

  const queueResult = await runConcurrentBatchQueue<ChunkWork>({
    items: input.workItems,
    maxConcurrent: CONCURRENT_BATCHES,
    signal: input.runSignal,
    process,
  });
  if (!input.runSignal.aborted && queueResult.cancelled.length === 0) {
    session.state = markCapacityUnresolved(
      session.state,
      queueResult.notRun,
      input.candidateMap
    );
  }
  return await finalizeFromQueue(session, queueResult, input.runSignal);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse SMS candidates through the AI Edge Function.
 *
 * Real transport chunks candidates into {@link CLIENT_CHUNK_SIZE} groups and
 * runs up to {@link CONCURRENT_BATCHES} chunks concurrently through the shared
 * refilling queue. Safeguard QA stays sequential with its own request size and
 * inter-chunk delay.
 *
 * @param candidates - SMS messages that passed the keyword filter
 * @param context - Client context (categories, currencies)
 * @param onProgress - Optional callback invoked after each chunk completes
 * @param abortSignal - Optional caller cancellation signal
 * @param expectedUserId - Optional user scope that must still own each request
 * @param requestContext - Optional scan identity/kind/start
 * @param requestKey - Optional caller request identity for single-chunk work
 * @returns Parsed transactions only (account suggestions derived separately)
 * @throws AbortError when the caller cancels, or AiConsentRequiredError when
 * the existing AI consent gate rejects the request.
 */
export async function parseSmsWithAi(
  candidates: readonly SmsCandidate[],
  context: ParseSmsContext,
  onProgress?: AiParseProgressCallback,
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
    const validCategoryMap = buildCategoryMap(context.categories);
    const { candidateMap, candidatesByFingerprint, allMessages } =
      buildParsePayloads(candidates);
    const resolvedRequestContext: SmsAiRequestContext = {
      scanSessionId:
        requestContext === undefined
          ? Crypto.randomUUID()
          : requestContext.scanSessionId,
      scanKind: requestContext?.scanKind ?? "incremental",
      scanStartedAtMs: requestContext?.scanStartedAtMs ?? Date.now(),
    };
    const workItems = buildInitialChunks(allMessages, transport, requestKey);

    if (transport.functionName === "sms-safeguard-qa") {
      return await runSequentialChunks({
        workItems,
        context,
        resolvedRequestContext,
        transport,
        candidateMap,
        candidatesByFingerprint,
        validCategoryMap,
        onProgress,
        expectedUserId,
        abortSignal,
      });
    }

    const runController = new AbortController();
    const runSignal = runController.signal;
    const forwardAbort = (): void => runController.abort();
    if (abortSignal?.aborted) {
      runController.abort();
    } else {
      abortSignal?.addEventListener("abort", forwardAbort, { once: true });
    }
    try {
      return await runConcurrentChunks({
        workItems,
        context,
        resolvedRequestContext,
        transport,
        candidateMap,
        candidatesByFingerprint,
        validCategoryMap,
        onProgress,
        expectedUserId,
        runSignal,
        runController,
      });
    } finally {
      abortSignal?.removeEventListener("abort", forwardAbort);
    }
  } catch (err: unknown) {
    if (isProgressEmissionError(err)) {
      throw unwrapProgressEmissionError(err);
    }

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
  const transport = resolveSmsParseTransport(CLIENT_CHUNK_SIZE);
  const result = await invokeParseChunk({
    messages: [],
    context,
    requestContext,
    requestKey: createSmsAiRequestKey(transport.qaRunId),
    transport,
    abortSignal,
    expectedUserId,
  });
  if (result.hasError) {
    throw new Error("SMS scan session initialization failed");
  }
}
