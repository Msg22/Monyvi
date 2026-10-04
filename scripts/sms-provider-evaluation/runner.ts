import {
  BUILT_IN_SMS_CATEGORY_TREE,
  DEFAULT_SMS_CURRENCIES,
} from "../../supabase/functions/_shared/sms-ai/sms-ai-prompt.ts";
import { computeRequestDigestAtEdge } from "../../supabase/functions/_shared/sms-fingerprint-at-edge.ts";
import { buildSyntheticEvaluationCorpus } from "./corpus.ts";
import { parseProviderInputObservationImport } from "./provider-input-observation.ts";
import { parseRawObservationImport } from "./raw-observation.ts";
import { scoreSmsProviderEvaluation } from "./scorer.ts";
import {
  DEFAULT_EVALUATION_BATCH_SIZE,
  ParseSmsEvaluationResponseSchema,
  STAGING_PARSE_SMS_ENDPOINT,
  STAGING_PROJECT_REF,
  type EvaluationReport,
  type EvaluationRunOptions,
  type EvaluationRunnerDependencies,
  type FinalBatchObservation,
  type RawAttributionManifestEntry,
  type SyntheticEvaluationCase,
} from "./types.ts";

export interface PreparedEvaluationRequest {
  readonly batchId: string;
  readonly caseIds: readonly string[];
  readonly inputIdentity: string;
  readonly url: string;
  readonly init: RequestInit;
}

interface PreparedBatch {
  readonly batchId: string;
  readonly cases: readonly SyntheticEvaluationCase[];
  readonly inputIdentity: string;
  readonly request: PreparedEvaluationRequest;
}

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

function isPositiveInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function validatePinnedEndpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("sms_provider_evaluation_invalid_staging_target");
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hostname !== "yulbcndyssdjicbpmlrk.supabase.co" ||
    url.port !== "" ||
    url.pathname !== "/functions/v1/parse-sms" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.href !== STAGING_PARSE_SMS_ENDPOINT
  ) {
    throw new Error("sms_provider_evaluation_invalid_staging_target");
  }
}

export function validateEvaluationRunOptions(
  options: EvaluationRunOptions
): EvaluationRunOptions {
  if (
    !isPositiveInteger(options.maxCases) ||
    !isPositiveInteger(options.maxRequests)
  ) {
    throw new Error("sms_provider_evaluation_invalid_limit");
  }
  if (
    !options.runId.trim() ||
    options.runId.length > 96 ||
    !Number.isFinite(options.anchorMs)
  ) {
    throw new Error("sms_provider_evaluation_invalid_run");
  }

  if (options.mode === "live") {
    if (
      options.projectRef !== STAGING_PROJECT_REF ||
      options.endpoint !== STAGING_PARSE_SMS_ENDPOINT
    ) {
      throw new Error("sms_provider_evaluation_invalid_staging_target");
    }
    validatePinnedEndpoint(options.endpoint);
    if (!options.accessToken?.trim()) {
      throw new Error("sms_provider_evaluation_access_token_required");
    }
  }

  return options;
}

function chunkCases(
  cases: readonly SyntheticEvaluationCase[]
): readonly (readonly SyntheticEvaluationCase[])[] {
  const batches: SyntheticEvaluationCase[][] = [];
  for (let index = 0; index < cases.length; index += DEFAULT_EVALUATION_BATCH_SIZE) {
    batches.push(cases.slice(index, index + DEFAULT_EVALUATION_BATCH_SIZE));
  }
  return batches;
}

function batchId(index: number): string {
  return "batch-" + String(index + 1).padStart(3, "0");
}

function requestMessages(
  cases: readonly SyntheticEvaluationCase[]
): readonly SyntheticEvaluationCase["message"][] {
  return cases.map(({ message }) => message);
}

async function buildInputIdentity(
  cases: readonly SyntheticEvaluationCase[]
): Promise<string> {
  return computeRequestDigestAtEdge({
    messages: cases.map(({ message }) => ({
      sender: message.sender,
      body: message.body,
      date: message.date,
    })),
  });
}

function requestKey(runId: string, id: string): string {
  return ("sms-eval:" + runId + ":" + id).slice(0, 160);
}

function scanSessionId(runId: string): string {
  return ("sms-eval:" + runId).slice(0, 160);
}

async function prepareBatch(
  options: EvaluationRunOptions,
  cases: readonly SyntheticEvaluationCase[],
  index: number
): Promise<PreparedBatch> {
  const id = batchId(index);
  const inputIdentity = await buildInputIdentity(cases);
  const messages = requestMessages(cases);
  const body = {
    requestKey: requestKey(options.runId, id),
    scanSessionId: scanSessionId(options.runId),
    scanKind: "incremental",
    scanStartedAt: new Date(options.anchorMs).toISOString(),
    messages,
    categories: BUILT_IN_SMS_CATEGORY_TREE.trim(),
    supportedCurrencies: DEFAULT_SMS_CURRENCIES,
  };
  const headers = new Headers({
    "content-type": "application/json",
  });
  if (options.accessToken !== undefined) {
    headers.set("authorization", "Bearer " + options.accessToken);
  }
  if (options.publicApiKey !== undefined) {
    headers.set("apikey", options.publicApiKey);
  }

  return {
    batchId: id,
    cases,
    inputIdentity,
    request: {
      batchId: id,
      caseIds: cases.map(({ caseId }) => caseId),
      inputIdentity,
      url: options.endpoint ?? STAGING_PARSE_SMS_ENDPOINT,
      init: {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        redirect: "error",
        signal: options.signal,
      },
    },
  };
}

function manifestFor(
  batches: readonly PreparedBatch[]
): readonly RawAttributionManifestEntry[] {
  return batches.map((batch) => ({
    batchId: batch.batchId,
    caseIds: batch.cases.map(({ caseId }) => caseId),
    inputIdentity: batch.inputIdentity,
  }));
}

function safeRefusalReason(status: number, value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).reason === "string"
  ) {
    const reason = (value as Record<string, unknown>).reason as string;
    if (SAFE_REFUSAL_REASONS.has(reason)) return reason;
  }
  return "http_" + status;
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

async function readResponseValue(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function unattemptedObservation(
  runId: string,
  batch: PreparedBatch
): FinalBatchObservation {
  return {
    runId,
    batchId: batch.batchId,
    caseIds: batch.cases.map(({ caseId }) => caseId),
    classification: "unattempted",
    replayProvenance: "unknown",
  };
}

function classifySuccessfulResponse(
  options: EvaluationRunOptions,
  batch: PreparedBatch,
  responseValue: unknown,
  latencyMs: number
): FinalBatchObservation {
  const parsed = ParseSmsEvaluationResponseSchema.safeParse(responseValue);
  if (!parsed.success) {
    return {
      runId: options.runId,
      batchId: batch.batchId,
      caseIds: batch.cases.map(({ caseId }) => caseId),
      classification: "response_invalid",
      latencyMs,
      replayProvenance: "unknown",
    };
  }

  if (parsed.data.completionStatus !== "complete") {
    return {
      runId: options.runId,
      batchId: batch.batchId,
      caseIds: batch.cases.map(({ caseId }) => caseId),
      classification: "unresolved",
      latencyMs,
      completionStatus: parsed.data.completionStatus,
      transactions: parsed.data.transactions,
      negativeFingerprints: parsed.data.negativeFingerprints,
      terminalFingerprints: parsed.data.terminalFingerprints,
      unresolvedFingerprints: parsed.data.unresolvedFingerprints,
      replayProvenance: "unknown",
    };
  }

  return {
    runId: options.runId,
    batchId: batch.batchId,
    caseIds: batch.cases.map(({ caseId }) => caseId),
    classification: "observed",
    latencyMs,
    completionStatus: parsed.data.completionStatus,
    transactions: parsed.data.transactions,
    negativeFingerprints: parsed.data.negativeFingerprints,
    terminalFingerprints: parsed.data.terminalFingerprints,
    unresolvedFingerprints: parsed.data.unresolvedFingerprints,
    replayProvenance: "unknown",
  };
}

async function executeBatch(
  options: EvaluationRunOptions,
  batch: PreparedBatch,
  dependencies: EvaluationRunnerDependencies
): Promise<{
  readonly observation: FinalBatchObservation;
  readonly stop: boolean;
  readonly cancelled: boolean;
}> {
  const startedAt = dependencies.now();
  try {
    const response = await dependencies.fetch(
      batch.request.url,
      batch.request.init
    );
    const value = await readResponseValue(response);
    const latencyMs = Math.max(0, dependencies.now() - startedAt);

    if (!response.ok) {
      const admission = isAdmissionStatus(response.status);
      return {
        observation: {
          runId: options.runId,
          batchId: batch.batchId,
          caseIds: batch.cases.map(({ caseId }) => caseId),
          classification: admission ? "admission_failure" : "transport_failure",
          httpStatus: response.status,
          refusalReason: safeRefusalReason(response.status, value),
          latencyMs,
          replayProvenance: "unknown",
        },
        stop: admission && shouldStopAfterAdmission(response.status),
        cancelled: false,
      };
    }

    return {
      observation: classifySuccessfulResponse(
        options,
        batch,
        value,
        latencyMs
      ),
      stop: false,
      cancelled: false,
    };
  } catch (error: unknown) {
    if (
      options.signal?.aborted === true ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      return {
        observation: unattemptedObservation(options.runId, batch),
        stop: true,
        cancelled: true,
      };
    }

    return {
      observation: {
        runId: options.runId,
        batchId: batch.batchId,
        caseIds: batch.cases.map(({ caseId }) => caseId),
        classification: "transport_failure",
        latencyMs: Math.max(0, dependencies.now() - startedAt),
        replayProvenance: "unknown",
      },
      stop: false,
      cancelled: false,
    };
  }
}

export async function runSmsProviderEvaluation(
  runOptions: EvaluationRunOptions,
  dependencies: EvaluationRunnerDependencies
): Promise<EvaluationReport> {
  const options = validateEvaluationRunOptions(runOptions);
  const corpus = await buildSyntheticEvaluationCorpus({
    runId: options.runId,
    anchorMs: options.anchorMs,
  });
  const selectedCases = corpus.slice(0, options.maxCases);
  const caseBatches = chunkCases(selectedCases);
  const preparedBatches: PreparedBatch[] = [];
  for (let index = 0; index < caseBatches.length; index += 1) {
    const cases = caseBatches[index];
    if (cases === undefined) continue;
    preparedBatches.push(await prepareBatch(options, cases, index));
  }

  const manifest = manifestFor(preparedBatches);
  const expectedBatchInputs = new Map(
    manifest.map((entry) => [
      entry.batchId,
      {
        caseIds: entry.caseIds,
        inputIdentity: entry.inputIdentity,
      },
    ])
  );
  const rawObservations =
    options.rawObservationValue === undefined
      ? undefined
      : parseRawObservationImport({
          value: options.rawObservationValue,
          runId: options.runId,
          expectedBatchInputs,
          cases: selectedCases,
        });
  const providerInputObservations =
    options.providerInputObservationValue === undefined
      ? undefined
      : await parseProviderInputObservationImport({
          value: options.providerInputObservationValue,
          runId: options.runId,
          expectedBatchInputs,
          cases: selectedCases,
        });

  const observations: FinalBatchObservation[] = [];
  let cancelled = options.signal?.aborted === true;
  let stopped = cancelled;

  if (options.mode === "dry-run") {
    observations.push(
      ...preparedBatches.map((batch) =>
        unattemptedObservation(options.runId, batch)
      )
    );
  } else {
    for (let index = 0; index < preparedBatches.length; index += 1) {
      const batch = preparedBatches[index];
      if (batch === undefined) continue;

      if (stopped || index >= options.maxRequests) {
        observations.push(unattemptedObservation(options.runId, batch));
        continue;
      }

      const result = await executeBatch(options, batch, dependencies);
      observations.push(result.observation);
      if (result.cancelled) cancelled = true;
      if (result.stop) stopped = true;
    }
  }

  const report = scoreSmsProviderEvaluation({
    runId: options.runId,
    mode: options.mode,
    cancelled,
    cases: selectedCases,
    finalObservations: observations,
    ...(rawObservations === undefined ? {} : { rawObservations }),
    ...(providerInputObservations === undefined
      ? {}
      : { providerInputObservations }),
  });

  return {
    ...report,
    rawAttributionManifest: manifest,
  };
}
