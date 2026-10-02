import * as Crypto from "expo-crypto";
import {
  buildCategoryTree,
  buildSyntheticEvaluationCorpus,
  computeSmsFingerprint,
  ParseSmsEvaluationResponseSchema,
  scoreSmsProviderEvaluation,
  STAGING_SUPABASE_URL,
  type CategoryTreeSource,
  type EvaluationReport,
  type FinalBatchObservation,
  type FinalObservationClassification,
  type SyntheticEvaluationCase,
} from "@monyvi/logic";

import {
  getEdgeFunctionErrorStatus,
  invokeAuthenticatedEdgeFunction,
  isEdgeFunctionAuthenticationError,
} from "@/services/authenticated-edge-function-service";
import { MOBILE_SMS_PROVIDER_EVALUATION_BATCH_SIZE } from "@/constants/sms-provider-evaluation";
import { assertExpectedCurrentUser } from "@/services/user-data-access";

export const SMS_PROVIDER_EVALUATION_OWNER_CHANGED =
  "sms_provider_evaluation_owner_changed";
export const SMS_PROVIDER_EVALUATION_UNAVAILABLE =
  "sms_provider_evaluation_unavailable";
export const SMS_PROVIDER_EVALUATION_AUTH_REQUIRED =
  "sms_provider_evaluation_auth_required";
export const SMS_PROVIDER_EVALUATION_FUNCTION_NAME =
  "sms-provider-evaluation";

const SAFE_REFUSAL_REASONS = new Set([
  "unauthenticated",
  "consent_required",
  "malformed_request",
  "capability_disabled",
  "terminal_outcome",
  "candidate_too_large",
  "request_limit",
  "scan_limit",
  "rolling_limit",
  "burst_limit",
  "history_cooldown",
  "dependency_unavailable",
  "already_processed_result_unavailable",
  "payload_limit",
  "input_token_limit",
  "response_invalid",
  "provider_failed",
  "method_not_allowed",
]);

let lastEvaluationAnchorMs = 0;

export type SmsProviderEvaluationTerminalStatus =
  | "finished"
  | "cancelled"
  | "fatal";

export type SmsProviderEvaluationBatchStatus =
  | "completed"
  | "failed"
  | "running"
  | "cancelled"
  | "not_run";

export interface SmsProviderEvaluationBatchDetail {
  readonly batchId: string;
  readonly batchNumber: number;
  readonly caseIds: readonly string[];
  readonly messageCount: number;
  readonly status: SmsProviderEvaluationBatchStatus;
  readonly classification: FinalObservationClassification;
  readonly elapsedMs?: number;
  readonly httpStatus?: number;
  readonly refusalReason?: string;
  readonly completionStatus?: string;
}

export interface SmsProviderEvaluationProgress {
  readonly report: EvaluationReport;
  readonly batches: readonly SmsProviderEvaluationBatchDetail[];
  readonly activeBatchNumber: number | null;
  readonly completedBatchCount: number;
  readonly processedCaseCount: number;
  readonly attemptedRequestCount: number;
  readonly totalBatchCount: number;
  readonly totalCaseCount: number;
}

export interface SmsProviderEvaluationRunResult
  extends SmsProviderEvaluationProgress {
  readonly status: SmsProviderEvaluationTerminalStatus;
  readonly fatalReason?: string;
}

export interface StartSmsProviderEvaluationInput {
  readonly initiatingUserId: string;
  readonly categories: readonly CategoryTreeSource[];
  readonly supportedCurrencies: readonly string[];
  readonly isAiConsented: boolean;
  readonly signal: AbortSignal;
  readonly onProgress?: (
    progress: SmsProviderEvaluationProgress
  ) => void | Promise<void>;
}

interface EdgeFunctionResponse {
  readonly data: unknown | null;
  readonly error: unknown;
}

interface EvaluationRunContext {
  readonly runId: string;
  readonly anchorMs: number;
  readonly cases: readonly SyntheticEvaluationCase[];
  readonly batches: readonly (readonly SyntheticEvaluationCase[])[];
  readonly observations: readonly FinalBatchObservation[];
  readonly completedBatchCount: number;
  readonly processedCaseCount: number;
  readonly attemptedRequestCount: number;
  readonly latest: SmsProviderEvaluationProgress | null;
  readonly cancelledBatch: {
    readonly batchNumber: number;
    readonly elapsedMs?: number;
  } | null;
}

interface ProgressEmission {
  readonly context: EvaluationRunContext;
  readonly progress: SmsProviderEvaluationProgress;
}

interface BatchExecutionResult {
  readonly observation?: FinalBatchObservation;
  readonly cancelled: boolean;
  readonly cancelledElapsedMs?: number;
  readonly fatalReason?: string;
}

function createEvaluationError(code: string): Error {
  const error = new Error(code);
  error.name = "SmsProviderEvaluationError";
  return error;
}

export function isSmsProviderEvaluationOwnerChanged(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === SMS_PROVIDER_EVALUATION_OWNER_CHANGED
  );
}

export function isSmsProviderEvaluationRuntimeAvailable(): boolean {
  return (
    __DEV__ &&
    process.env.EXPO_PUBLIC_SUPABASE_URL === STAGING_SUPABASE_URL
  );
}

async function assertPinnedUser(expectedUserId: string): Promise<void> {
  try {
    await assertExpectedCurrentUser(expectedUserId);
  } catch {
    throw createEvaluationError(SMS_PROVIDER_EVALUATION_OWNER_CHANGED);
  }
}

function nextRunAnchorMs(): number {
  const anchorMs = Math.max(Date.now(), lastEvaluationAnchorMs + 1);
  lastEvaluationAnchorMs = anchorMs;
  return anchorMs;
}

function createRunId(anchorMs: number): string {
  return `sms-eval-${anchorMs}-${Crypto.randomUUID()}`;
}

function batchId(index: number): string {
  return `batch-${String(index + 1).padStart(3, "0")}`;
}

function requestKey(runId: string, id: string): string {
  return `sms-eval:${runId}:${id}`.slice(0, 160);
}

function scanSessionId(runId: string): string {
  return `sms-eval:${runId}`.slice(0, 160);
}

function chunkCases(
  cases: readonly SyntheticEvaluationCase[]
): readonly (readonly SyntheticEvaluationCase[])[] {
  const batches: SyntheticEvaluationCase[][] = [];
  for (
    let index = 0;
    index < cases.length;
    index += MOBILE_SMS_PROVIDER_EVALUATION_BATCH_SIZE
  ) {
    batches.push(cases.slice(index, index + MOBILE_SMS_PROVIDER_EVALUATION_BATCH_SIZE));
  }
  return batches;
}

function safeRefusalReason(status: number, value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Readonly<Record<string, unknown>>).reason === "string"
  ) {
    const reason = (value as Readonly<Record<string, unknown>>).reason as string;
    if (SAFE_REFUSAL_REASONS.has(reason)) return reason;
  }
  return `http_${status}`;
}

function isAdmissionStatus(status: number): boolean {
  return status >= 400 && status < 500;
}

function shouldStopAfterAdmission(status: number): boolean {
  return [400, 401, 403, 413, 429].includes(status);
}

async function errorResponseValue(error: unknown): Promise<unknown> {
  const context = (error as { readonly context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return undefined;
  try {
    const textValue = await context.clone().text();
    return textValue ? (JSON.parse(textValue) as unknown) : null;
  } catch {
    return undefined;
  }
}

function batchCaseIds(
  cases: readonly SyntheticEvaluationCase[]
): readonly string[] {
  return cases.map(({ caseId }) => caseId);
}

function classifySuccessfulResponse(input: {
  readonly runId: string;
  readonly id: string;
  readonly cases: readonly SyntheticEvaluationCase[];
  readonly value: unknown;
  readonly latencyMs: number;
}): FinalBatchObservation {
  const parsed = ParseSmsEvaluationResponseSchema.safeParse(input.value);
  const common = {
    runId: input.runId,
    batchId: input.id,
    caseIds: batchCaseIds(input.cases),
    latencyMs: input.latencyMs,
    replayProvenance: "unknown" as const,
  };
  if (!parsed.success) {
    return { ...common, classification: "response_invalid" };
  }
  if (parsed.data.completionStatus !== "complete") {
    return observationFromParsed(common, parsed.data, "unresolved");
  }
  return observationFromParsed(common, parsed.data, "observed");
}

function observationFromParsed(
  common: Omit<FinalBatchObservation, "classification">,
  parsed: ReturnType<typeof ParseSmsEvaluationResponseSchema.parse>,
  classification: "observed" | "unresolved"
): FinalBatchObservation {
  return {
    ...common,
    classification,
    completionStatus: parsed.completionStatus,
    transactions: parsed.transactions,
    negativeFingerprints: parsed.negativeFingerprints,
    terminalFingerprints: parsed.terminalFingerprints,
    unresolvedFingerprints: parsed.unresolvedFingerprints,
  };
}

function buildReport(
  context: EvaluationRunContext,
  cancelled: boolean
): EvaluationReport {
  return scoreSmsProviderEvaluation({
    runId: context.runId,
    mode: "live",
    cancelled,
    cases: context.cases,
    finalObservations: context.observations,
  });
}

function batchStatusFor(
  observation: FinalBatchObservation | undefined,
  isActive: boolean,
  isCancelled: boolean
): SmsProviderEvaluationBatchStatus {
  if (isCancelled) return "cancelled";
  if (isActive) return "running";
  if (observation === undefined || observation.classification === "unattempted") {
    return "not_run";
  }
  return observation.classification === "observed" ? "completed" : "failed";
}

function buildBatchDetails(
  context: EvaluationRunContext,
  activeBatchNumber: number | null
): readonly SmsProviderEvaluationBatchDetail[] {
  const observations = new Map(
    context.observations.map((observation) => [
      observation.batchId,
      observation,
    ])
  );
  return context.batches.map((batch, index) =>
    buildBatchDetail(context, batch, index, observations, activeBatchNumber)
  );
}

function buildBatchDetail(
  context: EvaluationRunContext,
  batch: readonly SyntheticEvaluationCase[],
  index: number,
  observations: ReadonlyMap<string, FinalBatchObservation>,
  activeBatchNumber: number | null
): SmsProviderEvaluationBatchDetail {
  const batchNumber = index + 1;
  const id = batchId(index);
  const observation = observations.get(id);
  const cancelled = context.cancelledBatch?.batchNumber === batchNumber;
  const elapsedMs = cancelled
    ? context.cancelledBatch?.elapsedMs
    : observation?.latencyMs;
  return {
    batchId: id,
    batchNumber,
    caseIds: batchCaseIds(batch),
    messageCount: batch.length,
    status: batchStatusFor(
      observation,
      activeBatchNumber === batchNumber,
      cancelled
    ),
    classification: observation?.classification ?? "unattempted",
    ...(elapsedMs === undefined ? {} : { elapsedMs }),
    ...(observation?.httpStatus === undefined
      ? {}
      : { httpStatus: observation.httpStatus }),
    ...(observation?.refusalReason === undefined
      ? {}
      : { refusalReason: observation.refusalReason }),
    ...(observation?.completionStatus === undefined
      ? {}
      : { completionStatus: observation.completionStatus }),
  };
}

async function emitProgress(
  context: EvaluationRunContext,
  activeBatchNumber: number | null,
  onProgress: StartSmsProviderEvaluationInput["onProgress"]
): Promise<ProgressEmission> {
  const progress: SmsProviderEvaluationProgress = {
    report: buildReport(context, false),
    batches: buildBatchDetails(context, activeBatchNumber),
    activeBatchNumber,
    completedBatchCount: context.completedBatchCount,
    processedCaseCount: context.processedCaseCount,
    attemptedRequestCount: context.attemptedRequestCount,
    totalBatchCount: context.batches.length,
    totalCaseCount: context.cases.length,
  };
  await onProgress?.(progress);
  return {
    context: { ...context, latest: progress },
    progress,
  };
}

function resultFromContext(
  context: EvaluationRunContext,
  status: SmsProviderEvaluationTerminalStatus,
  fatalReason?: string
): SmsProviderEvaluationRunResult {
  const latest = context.latest;
  if (latest === null) {
    throw new Error("sms_provider_evaluation_progress_unavailable");
  }
  return {
    ...latest,
    report: buildReport(context, status === "cancelled"),
    batches: buildBatchDetails(context, null),
    activeBatchNumber: null,
    status,
    ...(fatalReason === undefined ? {} : { fatalReason }),
  };
}

async function createRunContext(): Promise<EvaluationRunContext> {
  const anchorMs = nextRunAnchorMs();
  const runId = createRunId(anchorMs);
  const cases = await buildSyntheticEvaluationCorpus(
    { runId, anchorMs },
    { computeFingerprint: computeSmsFingerprint }
  );
  return {
    runId,
    anchorMs,
    cases,
    batches: chunkCases(cases),
    observations: [],
    completedBatchCount: 0,
    processedCaseCount: 0,
    attemptedRequestCount: 0,
    latest: null,
    cancelledBatch: null,
  };
}

function createTransportObservation(input: {
  readonly context: EvaluationRunContext;
  readonly id: string;
  readonly batch: readonly SyntheticEvaluationCase[];
  readonly startedAt: number;
}): FinalBatchObservation {
  return {
    runId: input.context.runId,
    batchId: input.id,
    caseIds: batchCaseIds(input.batch),
    classification: "transport_failure",
    latencyMs: Math.max(0, Date.now() - input.startedAt),
    replayProvenance: "unknown",
  };
}

function createAuthFailureObservation(input: {
  readonly context: EvaluationRunContext;
  readonly id: string;
  readonly batch: readonly SyntheticEvaluationCase[];
  readonly startedAt: number;
}): FinalBatchObservation {
  return {
    ...createTransportObservation(input),
    classification: "admission_failure",
    httpStatus: 401,
    refusalReason: "unauthenticated",
  };
}

function throwIfRunCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("sms_provider_evaluation_cancelled");
  }
}

async function assertPinnedUserAndActive(
  expectedUserId: string,
  signal: AbortSignal
): Promise<void> {
  await assertPinnedUser(expectedUserId);
  throwIfRunCancelled(signal);
}

async function invokeBatch(
  input: StartSmsProviderEvaluationInput,
  context: EvaluationRunContext,
  batch: readonly SyntheticEvaluationCase[],
  id: string
): Promise<EdgeFunctionResponse> {
  await assertPinnedUserAndActive(input.initiatingUserId, input.signal);
  return invokeAuthenticatedEdgeFunction<unknown>(
    SMS_PROVIDER_EVALUATION_FUNCTION_NAME,
    {
      body: {
        requestKey: requestKey(context.runId, id),
        scanSessionId: scanSessionId(context.runId),
        scanKind: "incremental",
        scanStartedAt: new Date(context.anchorMs).toISOString(),
        messages: batch.map(({ message }) => ({
          id: message.id,
          sender: message.sender,
          body: message.body,
          date: message.date,
          smsFingerprint: message.smsFingerprint,
        })),
        categories: buildCategoryTree(input.categories),
        supportedCurrencies: input.supportedCurrencies,
        syntheticEvaluation: {
          runId: context.runId,
          anchorMs: context.anchorMs,
        },
      },
      signal: input.signal,
    },
    {
      beforeRetry: () =>
        assertPinnedUserAndActive(input.initiatingUserId, input.signal),
    }
  );
}

async function executeBatch(input: {
  readonly runInput: StartSmsProviderEvaluationInput;
  readonly context: EvaluationRunContext;
  readonly batch: readonly SyntheticEvaluationCase[];
  readonly id: string;
}): Promise<BatchExecutionResult> {
  const startedAt = Date.now();
  try {
    const response = await invokeBatch(
      input.runInput,
      input.context,
      input.batch,
      input.id
    );
    await assertPinnedUserAndActive(
      input.runInput.initiatingUserId,
      input.runInput.signal
    );
    return classifyBatchResponse(input, response, startedAt);
  } catch (error: unknown) {
    return classifyBatchError(input, error, startedAt);
  }
}

async function classifyBatchResponse(
  input: {
    readonly runInput: StartSmsProviderEvaluationInput;
    readonly context: EvaluationRunContext;
    readonly batch: readonly SyntheticEvaluationCase[];
    readonly id: string;
  },
  response: EdgeFunctionResponse,
  startedAt: number
): Promise<BatchExecutionResult> {
  if (response.error === null) {
    return {
      cancelled: false,
      observation: classifySuccessfulResponse({
        runId: input.context.runId,
        id: input.id,
        cases: input.batch,
        value: response.data,
        latencyMs: Math.max(0, Date.now() - startedAt),
      }),
    };
  }
  return classifyHttpError(input, response.error, startedAt);
}

async function classifyHttpError(
  input: {
    readonly context: EvaluationRunContext;
    readonly batch: readonly SyntheticEvaluationCase[];
    readonly id: string;
  },
  error: unknown,
  startedAt: number
): Promise<BatchExecutionResult> {
  const status = getEdgeFunctionErrorStatus(error);
  const effectiveStatus = status ?? 503;
  const admission = status !== undefined && isAdmissionStatus(status);
  const reason = safeRefusalReason(
    effectiveStatus,
    await errorResponseValue(error)
  );
  return {
    cancelled: false,
    observation: {
      runId: input.context.runId,
      batchId: input.id,
      caseIds: batchCaseIds(input.batch),
      classification: admission ? "admission_failure" : "transport_failure",
      ...(status === undefined ? {} : { httpStatus: status }),
      refusalReason: reason,
      latencyMs: Math.max(0, Date.now() - startedAt),
      replayProvenance: "unknown",
    },
    ...(status !== undefined && admission && shouldStopAfterAdmission(status)
      ? { fatalReason: reason }
      : {}),
  };
}

function classifyBatchError(
  input: {
    readonly runInput: StartSmsProviderEvaluationInput;
    readonly context: EvaluationRunContext;
    readonly batch: readonly SyntheticEvaluationCase[];
    readonly id: string;
  },
  error: unknown,
  startedAt: number
): BatchExecutionResult {
  if (isSmsProviderEvaluationOwnerChanged(error)) throw error;
  if (input.runInput.signal.aborted) {
    return {
      cancelled: true,
      cancelledElapsedMs: Math.max(0, Date.now() - startedAt),
    };
  }
  const observation = isEdgeFunctionAuthenticationError(error)
    ? createAuthFailureObservation({ ...input, startedAt })
    : createTransportObservation({ ...input, startedAt });
  return {
    cancelled: false,
    observation,
    ...(isEdgeFunctionAuthenticationError(error)
      ? { fatalReason: "unauthenticated" }
      : {}),
  };
}

function recordBatch(
  context: EvaluationRunContext,
  batch: readonly SyntheticEvaluationCase[],
  observation: FinalBatchObservation
): EvaluationRunContext {
  return {
    ...context,
    observations: [...context.observations, observation],
    completedBatchCount: context.completedBatchCount + 1,
    processedCaseCount: context.processedCaseCount + batch.length,
  };
}

function recordCancelledBatch(
  context: EvaluationRunContext,
  batchNumber: number,
  elapsedMs: number | undefined
): EvaluationRunContext {
  return {
    ...context,
    cancelledBatch: {
      batchNumber,
      ...(elapsedMs === undefined ? {} : { elapsedMs }),
    },
  };
}

function validateRunInput(input: StartSmsProviderEvaluationInput): void {
  if (!isSmsProviderEvaluationRuntimeAvailable()) {
    throw createEvaluationError(SMS_PROVIDER_EVALUATION_UNAVAILABLE);
  }
  if (!input.initiatingUserId.trim()) {
    throw createEvaluationError(SMS_PROVIDER_EVALUATION_AUTH_REQUIRED);
  }
  if (!input.isAiConsented) {
    throw createEvaluationError("consent_required");
  }
}

async function runPreparedEvaluation(
  input: StartSmsProviderEvaluationInput,
  initialContext: EvaluationRunContext
): Promise<SmsProviderEvaluationRunResult> {
  let context = (
    await emitProgress(initialContext, null, input.onProgress)
  ).context;
  for (let index = 0; index < context.batches.length; index += 1) {
    if (input.signal.aborted) return resultFromContext(context, "cancelled");
    const batch = context.batches[index];
    if (batch === undefined) continue;
    context = {
      ...context,
      attemptedRequestCount: context.attemptedRequestCount + 1,
    };
    context = (
      await emitProgress(context, index + 1, input.onProgress)
    ).context;
    const result = await executeBatch({
      runInput: input,
      context,
      batch,
      id: batchId(index),
    });
    if (result.cancelled) {
      context = recordCancelledBatch(
        context,
        index + 1,
        result.cancelledElapsedMs
      );
      return resultFromContext(context, "cancelled");
    }
    if (result.observation !== undefined) {
      context = recordBatch(context, batch, result.observation);
    }
    await assertPinnedUserAndActive(input.initiatingUserId, input.signal);
    context = (await emitProgress(context, null, input.onProgress)).context;
    if (result.fatalReason !== undefined) {
      return resultFromContext(context, "fatal", result.fatalReason);
    }
  }
  return resultFromContext(context, "finished");
}

export async function runSmsProviderEvaluationForCurrentUser(
  input: StartSmsProviderEvaluationInput
): Promise<SmsProviderEvaluationRunResult> {
  validateRunInput(input);
  await assertPinnedUser(input.initiatingUserId);
  const context = await createRunContext();
  return runPreparedEvaluation(input, context);
}
