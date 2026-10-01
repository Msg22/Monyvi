import * as Crypto from "expo-crypto";
import {
  buildCategoryTree,
  buildSyntheticEvaluationCorpus,
  computeSmsFingerprint,
  DEFAULT_EVALUATION_BATCH_SIZE,
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
import { assertExpectedCurrentUser } from "@/services/user-data-access";

export const SMS_PROVIDER_EVALUATION_OWNER_CHANGED =
  "sms_provider_evaluation_owner_changed";
export const SMS_PROVIDER_EVALUATION_UNAVAILABLE =
  "sms_provider_evaluation_unavailable";
export const SMS_PROVIDER_EVALUATION_AUTH_REQUIRED =
  "sms_provider_evaluation_auth_required";

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

export interface SmsProviderEvaluationBatchDetail {
  readonly batchId: string;
  readonly caseIds: readonly string[];
  readonly classification: FinalObservationClassification;
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
  readonly signal: AbortSignal;
  readonly onProgress?: (
    progress: SmsProviderEvaluationProgress
  ) => void | Promise<void>;
}

interface EdgeFunctionResponse {
  readonly data: unknown | null;
  readonly error: unknown;
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
    index += DEFAULT_EVALUATION_BATCH_SIZE
  ) {
    batches.push(cases.slice(index, index + DEFAULT_EVALUATION_BATCH_SIZE));
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
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 413 ||
    status === 429
  );
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
  if (!parsed.success) {
    return {
      runId: input.runId,
      batchId: input.id,
      caseIds: batchCaseIds(input.cases),
      classification: "response_invalid",
      latencyMs: input.latencyMs,
      replayProvenance: "unknown",
    };
  }

  if (parsed.data.completionStatus !== "complete") {
    return {
      runId: input.runId,
      batchId: input.id,
      caseIds: batchCaseIds(input.cases),
      classification: "unresolved",
      latencyMs: input.latencyMs,
      completionStatus: parsed.data.completionStatus,
      transactions: parsed.data.transactions,
      negativeFingerprints: parsed.data.negativeFingerprints,
      terminalFingerprints: parsed.data.terminalFingerprints,
      unresolvedFingerprints: parsed.data.unresolvedFingerprints,
      replayProvenance: "unknown",
    };
  }

  return {
    runId: input.runId,
    batchId: input.id,
    caseIds: batchCaseIds(input.cases),
    classification: "observed",
    latencyMs: input.latencyMs,
    completionStatus: parsed.data.completionStatus,
    transactions: parsed.data.transactions,
    negativeFingerprints: parsed.data.negativeFingerprints,
    terminalFingerprints: parsed.data.terminalFingerprints,
    unresolvedFingerprints: parsed.data.unresolvedFingerprints,
    replayProvenance: "unknown",
  };
}

function buildReport(
  runId: string,
  cases: readonly SyntheticEvaluationCase[],
  observations: readonly FinalBatchObservation[],
  cancelled: boolean
): EvaluationReport {
  return scoreSmsProviderEvaluation({
    runId,
    mode: "live",
    cancelled,
    cases,
    finalObservations: observations,
  });
}

function buildBatchDetails(
  observations: readonly FinalBatchObservation[]
): readonly SmsProviderEvaluationBatchDetail[] {
  return observations.map((observation) => ({
    batchId: observation.batchId,
    caseIds: observation.caseIds,
    classification: observation.classification,
    ...(observation.httpStatus === undefined
      ? {}
      : { httpStatus: observation.httpStatus }),
    ...(observation.refusalReason === undefined
      ? {}
      : { refusalReason: observation.refusalReason }),
    ...(observation.completionStatus === undefined
      ? {}
      : { completionStatus: observation.completionStatus }),
  }));
}

async function emitProgress(
  input: {
    readonly runId: string;
    readonly cases: readonly SyntheticEvaluationCase[];
    readonly observations: readonly FinalBatchObservation[];
    readonly activeBatchNumber: number | null;
    readonly completedBatchCount: number;
    readonly processedCaseCount: number;
    readonly attemptedRequestCount: number;
    readonly totalBatchCount: number;
  },
  onProgress: StartSmsProviderEvaluationInput["onProgress"]
): Promise<SmsProviderEvaluationProgress> {
  const progress: SmsProviderEvaluationProgress = {
    report: buildReport(input.runId, input.cases, input.observations, false),
    batches: buildBatchDetails(input.observations),
    activeBatchNumber: input.activeBatchNumber,
    completedBatchCount: input.completedBatchCount,
    processedCaseCount: input.processedCaseCount,
    attemptedRequestCount: input.attemptedRequestCount,
    totalBatchCount: input.totalBatchCount,
    totalCaseCount: input.cases.length,
  };
  await onProgress?.(progress);
  return progress;
}

function cancelledResult(
  latest: SmsProviderEvaluationProgress,
  runId: string,
  cases: readonly SyntheticEvaluationCase[],
  observations: readonly FinalBatchObservation[]
): SmsProviderEvaluationRunResult {
  return {
    ...latest,
    report: buildReport(runId, cases, observations, true),
    activeBatchNumber: null,
    status: "cancelled",
  };
}

export async function runSmsProviderEvaluationForCurrentUser(
  input: StartSmsProviderEvaluationInput
): Promise<SmsProviderEvaluationRunResult> {
  if (!isSmsProviderEvaluationRuntimeAvailable()) {
    throw createEvaluationError(SMS_PROVIDER_EVALUATION_UNAVAILABLE);
  }
  if (!input.initiatingUserId.trim()) {
    throw createEvaluationError(SMS_PROVIDER_EVALUATION_AUTH_REQUIRED);
  }
  await assertPinnedUser(input.initiatingUserId);

  const anchorMs = nextRunAnchorMs();
  const runId = createRunId(anchorMs);
  const corpus = await buildSyntheticEvaluationCorpus(
    { runId, anchorMs },
    { computeFingerprint: computeSmsFingerprint }
  );
  const batches = chunkCases(corpus);
  const observations: FinalBatchObservation[] = [];
  let completedBatchCount = 0;
  let processedCaseCount = 0;
  let attemptedRequestCount = 0;

  let latest = await emitProgress(
    {
      runId,
      cases: corpus,
      observations,
      activeBatchNumber: null,
      completedBatchCount,
      processedCaseCount,
      attemptedRequestCount,
      totalBatchCount: batches.length,
    },
    input.onProgress
  );

  for (let index = 0; index < batches.length; index += 1) {
    if (input.signal.aborted) {
      return cancelledResult(latest, runId, corpus, observations);
    }

    const batch = batches[index];
    if (batch === undefined) continue;
    const id = batchId(index);

    await assertPinnedUser(input.initiatingUserId);
    attemptedRequestCount++;
    latest = await emitProgress(
      {
        runId,
        cases: corpus,
        observations,
        activeBatchNumber: index + 1,
        completedBatchCount,
        processedCaseCount,
        attemptedRequestCount,
        totalBatchCount: batches.length,
      },
      input.onProgress
    );

    const startedAt = Date.now();
    let response: EdgeFunctionResponse;

    try {
      response = await invokeAuthenticatedEdgeFunction<unknown>(
        "parse-sms",
        {
          body: {
            requestKey: requestKey(runId, id),
            scanSessionId: scanSessionId(runId),
            scanKind: "incremental",
            scanStartedAt: new Date(anchorMs).toISOString(),
            messages: batch.map(({ message }) => ({
              id: message.id,
              sender: message.sender,
              body: message.body,
              date: message.date,
              smsFingerprint: message.smsFingerprint,
            })),
            categories: buildCategoryTree(input.categories),
            supportedCurrencies: input.supportedCurrencies,
          },
          signal: input.signal,
        },
        {
          beforeRetry: () => assertPinnedUser(input.initiatingUserId),
        }
      );
    } catch (error: unknown) {
      if (isSmsProviderEvaluationOwnerChanged(error)) throw error;
      if (input.signal.aborted) {
        return cancelledResult(latest, runId, corpus, observations);
      }

      if (isEdgeFunctionAuthenticationError(error)) {
        observations.push({
          runId,
          batchId: id,
          caseIds: batchCaseIds(batch),
          classification: "admission_failure",
          httpStatus: 401,
          refusalReason: "unauthenticated",
          latencyMs: Math.max(0, Date.now() - startedAt),
          replayProvenance: "unknown",
        });
        completedBatchCount++;
        processedCaseCount += batch.length;
        const progress = await emitProgress(
          {
            runId,
            cases: corpus,
            observations,
            activeBatchNumber: null,
            completedBatchCount,
            processedCaseCount,
            attemptedRequestCount,
            totalBatchCount: batches.length,
          },
          input.onProgress
        );
        return {
          ...progress,
          status: "fatal",
          fatalReason: "unauthenticated",
        };
      }

      observations.push({
        runId,
        batchId: id,
        caseIds: batchCaseIds(batch),
        classification: "transport_failure",
        latencyMs: Math.max(0, Date.now() - startedAt),
        replayProvenance: "unknown",
      });
      completedBatchCount++;
      processedCaseCount += batch.length;
      await assertPinnedUser(input.initiatingUserId);
      latest = await emitProgress(
        {
          runId,
          cases: corpus,
          observations,
          activeBatchNumber: null,
          completedBatchCount,
          processedCaseCount,
          attemptedRequestCount,
          totalBatchCount: batches.length,
        },
        input.onProgress
      );
      continue;
    }

    await assertPinnedUser(input.initiatingUserId);

    if (response.error !== null) {
      const status = getEdgeFunctionErrorStatus(response.error);
      const value = await errorResponseValue(response.error);
      const effectiveStatus = status ?? 503;
      const admission = status !== undefined && isAdmissionStatus(status);
      const reason = safeRefusalReason(effectiveStatus, value);
      observations.push({
        runId,
        batchId: id,
        caseIds: batchCaseIds(batch),
        classification: admission ? "admission_failure" : "transport_failure",
        ...(status === undefined ? {} : { httpStatus: status }),
        refusalReason: reason,
        latencyMs: Math.max(0, Date.now() - startedAt),
        replayProvenance: "unknown",
      });
      completedBatchCount++;
      processedCaseCount += batch.length;
      latest = await emitProgress(
        {
          runId,
          cases: corpus,
          observations,
          activeBatchNumber: null,
          completedBatchCount,
          processedCaseCount,
          attemptedRequestCount,
          totalBatchCount: batches.length,
        },
        input.onProgress
      );

      if (status !== undefined && admission && shouldStopAfterAdmission(status)) {
        return { ...latest, status: "fatal", fatalReason: reason };
      }
      continue;
    }

    observations.push(
      classifySuccessfulResponse({
        runId,
        id,
        cases: batch,
        value: response.data,
        latencyMs: Math.max(0, Date.now() - startedAt),
      })
    );
    completedBatchCount++;
    processedCaseCount += batch.length;
    latest = await emitProgress(
      {
        runId,
        cases: corpus,
        observations,
        activeBatchNumber: null,
        completedBatchCount,
        processedCaseCount,
        attemptedRequestCount,
        totalBatchCount: batches.length,
      },
      input.onProgress
    );
  }

  await assertPinnedUser(input.initiatingUserId);
  return { ...latest, status: "finished" };
}
