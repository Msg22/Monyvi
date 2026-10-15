import type {
  SmsAiAdmissionDecision,
  SmsAiAdmissionInput,
  SmsAiProviderStartDecision,
} from "./sms-ai-safeguard-contract.ts";
import { isSmsAiProviderCallerAbortError } from "./sms-ai/sms-ai-provider.ts";
import type {
  ExecuteSmsProviderInput,
  ParseSmsMessage,
  SmsProviderExecutionResult,
} from "./sms-ai/sms-ai-provider.ts";
export type {
  ExecuteSmsProviderInput,
  ParseSmsMessage,
  ParseSmsProviderTransaction,
  SmsProviderExecutionResult,
} from "./sms-ai/sms-ai-provider.ts";
import {
  buildSmsProviderUserPromptAtEdge,
  estimateSmsRequestInputTokensAtEdge,
  getUtf8ByteLengthAtEdge,
} from "./sms-input-estimator.ts";
import type {
  SmsNegativeOutcomeCandidate,
  SmsNegativeOutcomeReconciliation,
} from "./sms-negative-outcome-handler.ts";
import {
  parseSmsSafeguardPolicy,
  type SmsSafeguardPolicy,
} from "./sms-safeguard-policy.ts";
import type { SmsProviderCompletionStatusAtEdge } from "./sms-provider-completion.ts";
import {
  prepareSmsReviewV2ProviderRequest,
  measureSmsReviewV2ProviderRequest, projectSmsReviewV2Response,
} from "./sms-ai/sms-ai-review-v2.ts";
import type { SmsAiProviderRequest } from "./sms-ai/sms-ai-provider.ts";
import {
  parseSmsRequestBody as parseRequestBody, isRecord,
  type ParseSmsRequestBody, type SmsScanKind,
} from "./sms-ai/sms-ai-request-boundary.ts";
import {
  completeSmsAiWorkWithRetry,
  type CompleteSmsAiWorkInput,
} from "./sms-ai-work-completion.ts";

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const MAX_FUTURE_MESSAGE_SKEW_MS = 5 * 60 * 1000;
const MAX_SCAN_START_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_ROLLING_WINDOW_EDGE_GRACE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export interface SmsAiProcessingOutcomeAtEdge {
  readonly smsFingerprint: string;
  readonly isTerminal: boolean;
}

export interface ResolveSmsScanWindowInput {
  readonly userId: string;
  readonly scanSessionId: string | null;
  readonly scanKind: SmsScanKind;
  readonly requestedScanStartedAtMs: number;
  readonly maxFutureSkewMs: number;
  readonly edgeGraceMs: number;
}

interface ReconcileOutcomesInput {
  readonly userId: string;
  readonly submittedCandidates: readonly SmsNegativeOutcomeCandidate[];
  readonly requestId: string;
  readonly completionStatus: SmsProviderCompletionStatusAtEdge;
  readonly transactions: readonly {
    readonly messageId: string;
    readonly isTrusted: boolean;
  }[];
}

export interface ParseSmsHandlerDependencies {
  readonly authenticate: (request: Request) => Promise<string | null>;
  readonly hasConsent: (userId: string) => Promise<boolean>;
  readonly getPolicy: () => unknown;
  readonly buildFixedPrompt: (supportedCurrencies: readonly string[]) => string;
  readonly buildCategoryContext: (categories: string) => string;
  readonly buildResponseSchema: (
    supportedCurrencies: readonly string[]
  ) => string;
  readonly shouldExclude: (message: ParseSmsMessage) => boolean;
  readonly computeFingerprint: (message: ParseSmsMessage) => Promise<string>;
  readonly computeRequestDigest: (body: unknown) => Promise<string>;
  readonly getServerNowMs: () => number;
  readonly resolveScanWindowStart: (
    input: ResolveSmsScanWindowInput
  ) => Promise<number | null>;
  readonly getProcessingOutcomes: (
    userId: string,
    fingerprints: readonly string[],
    lookbackDays: number,
    referenceNowMs: number
  ) => Promise<readonly SmsAiProcessingOutcomeAtEdge[]>;
  readonly reserveWork: (
    input: SmsAiAdmissionInput
  ) => Promise<SmsAiAdmissionDecision>;
  readonly markProviderStarted: (
    requestId: string,
    candidateFingerprints: readonly string[]
  ) => Promise<SmsAiProviderStartDecision>;
  readonly executeProvider: (
    input: ExecuteSmsProviderInput
  ) => Promise<SmsProviderExecutionResult>;
  readonly completeWork: (input: CompleteSmsAiWorkInput) => Promise<boolean>;
  readonly releaseWork: (
    requestId: string,
    decisionCode: string
  ) => Promise<boolean>;
  readonly reconcileOutcomes: (
    input: ReconcileOutcomesInput
  ) => Promise<SmsNegativeOutcomeReconciliation>;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function refusal(
  reason: string,
  status: number,
  availableAt?: string | null,
  metadata: Readonly<Record<string, unknown>> = {}
): Response {
  return jsonResponse(
    {
      transactions: [],
      reason,
      availableAt: availableAt ?? null,
      negativeFingerprints: [],
      terminalFingerprints: [],
      unresolvedFingerprints: [],
      ...metadata,
    },
    status
  );
}

function callerCancelledResponse(): Response {
  return refusal("request_cancelled", 499);
}

function isCallerCancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function prepareReviewProviderRequest(
  body: ParseSmsRequestBody,
  messages: readonly ParseSmsMessage[],
  signal?: AbortSignal
): SmsAiProviderRequest | undefined {
  if (body.reviewContext === undefined) return undefined;
  return prepareSmsReviewV2ProviderRequest({
    reviewContext: body.reviewContext, messages,
    categories: body.categories, supportedCurrencies: body.supportedCurrencies,
    ...(signal === undefined ? {} : { signal }),
  });
}

function calculateRequestMetrics(
  rawBody: unknown,
  body: ParseSmsRequestBody,
  dependencies: ParseSmsHandlerDependencies
): { readonly payloadBytes: number; readonly estimatedInputTokens: number } {
  const reviewPlan = prepareReviewProviderRequest(body, body.messages);
  if (reviewPlan !== undefined) {
    if (!isRecord(rawBody)) throw new Error("Invalid SMS review metrics source");
    return measureSmsReviewV2ProviderRequest({
      requestBody: rawBody, providerRequest: reviewPlan,
    });
  }
  const payloadBytes = getUtf8ByteLengthAtEdge(JSON.stringify(rawBody));
  const estimate = estimateSmsRequestInputTokensAtEdge({
    prompt: dependencies.buildFixedPrompt(body.supportedCurrencies),
    categories: dependencies.buildCategoryContext(body.categories),
    schema: dependencies.buildResponseSchema(body.supportedCurrencies),
    messages: [buildSmsProviderUserPromptAtEdge(body.messages)],
  });
  return { payloadBytes, estimatedInputTokens: estimate.totalTokens };
}

function getSizeScope(
  reason: "payload_limit" | "input_token_limit",
  rawBody: unknown,
  body: ParseSmsRequestBody,
  policy: SmsSafeguardPolicy,
  dependencies: ParseSmsHandlerDependencies
): "batch" | "candidate" | "shared_request" {
  if (body.messages.length > 1) return "batch";
  const emptyBody = { ...body, messages: [] };
  const emptyRawBody = isRecord(rawBody)
    ? { ...rawBody, messages: [] }
    : rawBody;
  const emptyMetrics = calculateRequestMetrics(
    emptyRawBody,
    emptyBody,
    dependencies
  );
  const sharedRequestExceedsLimit =
    reason === "payload_limit"
      ? emptyMetrics.payloadBytes > policy.fullParser.maxPayloadBytes
      : emptyMetrics.estimatedInputTokens >
        policy.fullParser.maxEstimatedInputTokens;
  return sharedRequestExceedsLimit ? "shared_request" : "candidate";
}

async function hasValidCanonicalMessages(
  messages: readonly ParseSmsMessage[],
  lookbackDays: number,
  acceptedScanStartedAtMs: number,
  dependencies: ParseSmsHandlerDependencies
): Promise<boolean> {
  const minimumReceivedAtMs = acceptedScanStartedAtMs - lookbackDays * DAY_MS;
  const maximumReceivedAtMs = acceptedScanStartedAtMs;

  for (const message of messages) {
    const receivedAtMs = Date.parse(message.date);
    if (
      receivedAtMs < minimumReceivedAtMs ||
      receivedAtMs > maximumReceivedAtMs ||
      (await dependencies.computeFingerprint(message)) !==
        message.smsFingerprint
    ) {
      return false;
    }
  }
  return true;
}

function toNegativeCandidates(
  messages: readonly ParseSmsMessage[]
): readonly SmsNegativeOutcomeCandidate[] {
  return messages.map((message) => ({
    messageId: message.id,
    smsFingerprint: message.smsFingerprint,
    originalReceivedAt: message.date,
  }));
}

function partitionProviderReconciliationInput(
  messages: readonly ParseSmsMessage[],
  providerResult: SmsProviderExecutionResult
): {
  readonly reconciliationMessages: readonly ParseSmsMessage[];
  readonly unresolvedFingerprints: readonly string[];
} {
  const invalidMessageIds = new Set(providerResult.invalidMessageIds ?? []);
  const validReturnedMessageIds = new Set(
    providerResult.transactions.map((transaction) => transaction.messageId)
  );
  const hasUncorrelatedInvalidEntries =
    providerResult.hasUncorrelatedInvalidEntries === true;

  const unresolvedFingerprints = messages
    .filter(
      (message) =>
        invalidMessageIds.has(message.id) ||
        (hasUncorrelatedInvalidEntries &&
          !validReturnedMessageIds.has(message.id))
    )
    .map((message) => message.smsFingerprint);
  const unresolvedSet = new Set(unresolvedFingerprints);

  return {
    reconciliationMessages: messages.filter(
      (message) => !unresolvedSet.has(message.smsFingerprint)
    ),
    unresolvedFingerprints: [...unresolvedSet],
  };
}

function completedWithoutProvider(
  terminalFingerprints: readonly string[],
  negativeFingerprints: readonly string[] = []
): Response {
  return jsonResponse({
    transactions: [],
    completionStatus: "complete",
    negativeFingerprints,
    terminalFingerprints,
    unresolvedFingerprints: [],
  });
}

function partialWithoutProvider(
  terminalFingerprints: readonly string[],
  unresolvedFingerprints: readonly string[]
): Response {
  return jsonResponse({
    transactions: [],
    completionStatus: "truncated",
    negativeFingerprints: [],
    terminalFingerprints,
    unresolvedFingerprints,
    retryRequestMode: "fresh",
  });
}

async function safelyReleaseReservation(
  dependencies: ParseSmsHandlerDependencies,
  requestId: string,
  decisionCode: string
): Promise<void> {
  try {
    await dependencies.releaseWork(requestId, decisionCode);
  } catch {
    // Provider execution never started. The reservation lease is the final
    // fallback if the explicit release dependency is unavailable.
  }
}

async function reconcileAmbiguousProviderStart(
  dependencies: ParseSmsHandlerDependencies,
  requestId: string
): Promise<void> {
  const didComplete = await completeSmsAiWorkWithRetry(
    dependencies.completeWork,
    {
      requestId,
      completedWithProviderError: true,
      decisionCode: "provider_start_response_unknown",
    }
  );
  if (!didComplete) {
    await safelyReleaseReservation(
      dependencies,
      requestId,
      "provider_start_failed"
    );
  }
}

async function completeStartedCancellation(
  dependencies: ParseSmsHandlerDependencies,
  requestId: string
): Promise<Response> {
  await completeSmsAiWorkWithRetry(dependencies.completeWork, {
    requestId,
    completedWithProviderError: true,
    decisionCode: "request_cancelled",
  });
  return callerCancelledResponse();
}

async function releaseCancelledReservation(
  dependencies: ParseSmsHandlerDependencies,
  requestId: string
): Promise<Response> {
  await safelyReleaseReservation(dependencies, requestId, "request_cancelled");
  return callerCancelledResponse();
}

async function executeAdmittedWork(input: {
  readonly body: ParseSmsRequestBody;
  readonly userId: string;
  readonly messages: readonly ParseSmsMessage[];
  readonly terminalFingerprints: readonly string[];
  readonly suppressedNegativeFingerprints: readonly string[];
  readonly admission: SmsAiAdmissionDecision;
  readonly reviewProviderRequest?: SmsAiProviderRequest;
  readonly dependencies: ParseSmsHandlerDependencies;
  readonly signal?: AbortSignal;
}): Promise<Response> {
  if (isCallerCancelled(input.signal)) {
    return releaseCancelledReservation(
      input.dependencies,
      input.admission.requestId
    );
  }

  let startDecision: SmsAiProviderStartDecision;
  try {
    startDecision = await input.dependencies.markProviderStarted(
      input.admission.requestId,
      input.messages.map((message) => message.smsFingerprint)
    );
  } catch {
    await reconcileAmbiguousProviderStart(
      input.dependencies,
      input.admission.requestId
    );
    return isCallerCancelled(input.signal)
      ? callerCancelledResponse()
      : refusal("dependency_unavailable", 503);
  }
  if (!startDecision.started) {
    if (isCallerCancelled(input.signal)) {
      return releaseCancelledReservation(
        input.dependencies,
        input.admission.requestId
      );
    }
    if (
      startDecision.decisionCode === "terminal_outcome" &&
      startDecision.terminalFingerprints.length > 0
    ) {
      const terminalFingerprints = [
        ...new Set([
          ...input.terminalFingerprints,
          ...startDecision.terminalFingerprints,
        ]),
      ];
      const terminalSet = new Set(terminalFingerprints);
      return partialWithoutProvider(
        terminalFingerprints,
        input.messages
          .filter((message) => !terminalSet.has(message.smsFingerprint))
          .map((message) => message.smsFingerprint)
      );
    }
    return refusal(startDecision.decisionCode, 429, startDecision.availableAt);
  }

  if (isCallerCancelled(input.signal)) {
    return completeStartedCancellation(
      input.dependencies,
      input.admission.requestId
    );
  }

  let providerResult: SmsProviderExecutionResult;
  try {
    providerResult = await input.dependencies.executeProvider({
      messages: input.messages,
      categories: input.body.categories,
      supportedCurrencies: input.body.supportedCurrencies,
      ...(input.reviewProviderRequest === undefined
        ? {} : { reviewProviderRequest: input.reviewProviderRequest }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  } catch (error: unknown) {
    if (isSmsAiProviderCallerAbortError(error)) {
      return completeStartedCancellation(
        input.dependencies,
        input.admission.requestId
      );
    }
    const didComplete = await completeSmsAiWorkWithRetry(
      input.dependencies.completeWork,
      {
        requestId: input.admission.requestId,
        completedWithProviderError: true,
        decisionCode: "provider_failed",
      }
    );
    if (!didComplete) return refusal("dependency_unavailable", 503);
    return refusal("provider_failed", 502, undefined, {
      retryRequestMode: "fresh",
    });
  }

  if (isCallerCancelled(input.signal)) {
    return completeStartedCancellation(
      input.dependencies,
      input.admission.requestId
    );
  }

  if (!providerResult.isResponseSchemaValid) {
    const didComplete = await completeSmsAiWorkWithRetry(
      input.dependencies.completeWork,
      {
        requestId: input.admission.requestId,
        completedWithProviderError: true,
        decisionCode: "response_invalid",
      }
    );
    if (!didComplete) return refusal("dependency_unavailable", 503);
    return refusal("response_invalid", 502, undefined, {
      retryRequestMode: "fresh",
    });
  }

  const submittedCandidates = toNegativeCandidates(input.messages);
  if (providerResult.completionStatus !== "complete") {
    const didComplete = await completeSmsAiWorkWithRetry(
      input.dependencies.completeWork,
      {
        requestId: input.admission.requestId,
        completedWithProviderError: true,
        decisionCode: providerResult.completionStatus,
      }
    );
    if (!didComplete) return refusal("dependency_unavailable", 503);
    return jsonResponse({
      transactions: [],
      completionStatus: providerResult.completionStatus,
      negativeFingerprints: input.suppressedNegativeFingerprints,
      terminalFingerprints: input.terminalFingerprints,
      unresolvedFingerprints: submittedCandidates.map(
        (candidate) => candidate.smsFingerprint
      ),
      retryRequestMode: "fresh",
    });
  }

  const partition = partitionProviderReconciliationInput(
    input.messages,
    providerResult
  );
  const reconciliationCandidates = toNegativeCandidates(
    partition.reconciliationMessages
  );
  const reconciliationTransactionIds = new Set(
    reconciliationCandidates.map((candidate) => candidate.messageId)
  );
  const reconciliationTransactions = providerResult.transactions
    .filter((transaction) =>
      reconciliationTransactionIds.has(transaction.messageId)
    )
    .map((transaction) => ({
      messageId: transaction.messageId,
      isTrusted: transaction.isTrusted,
    }));

  let reconciliation: SmsNegativeOutcomeReconciliation = {
    status: "reconciled",
    positiveFingerprints: [],
    negativeFingerprints: [],
  };
  if (isCallerCancelled(input.signal)) {
    return completeStartedCancellation(
      input.dependencies,
      input.admission.requestId
    );
  }
  if (reconciliationCandidates.length > 0) {
    try {
      reconciliation = await input.dependencies.reconcileOutcomes({
        userId: input.userId,
        submittedCandidates: reconciliationCandidates,
        requestId: input.admission.requestId,
        completionStatus: providerResult.completionStatus,
        transactions: reconciliationTransactions,
      });
    } catch {
      await completeSmsAiWorkWithRetry(input.dependencies.completeWork, {
        requestId: input.admission.requestId,
        completedWithProviderError: true,
        decisionCode: "outcome_reconciliation_failed",
      });
      return refusal("dependency_unavailable", 503);
    }
    if (reconciliation.status === "ignored") {
      await completeSmsAiWorkWithRetry(input.dependencies.completeWork, {
        requestId: input.admission.requestId,
        completedWithProviderError: true,
        decisionCode: reconciliation.reason,
      });
      return refusal("response_invalid", 502);
    }
  }

  const didComplete = await completeSmsAiWorkWithRetry(
    input.dependencies.completeWork,
    {
      requestId: input.admission.requestId,
      completedWithProviderError: false,
      decisionCode: "complete",
    }
  );
  if (!didComplete) return refusal("dependency_unavailable", 503);

  const financialAndReview = providerResult.reviewContractVersion === "account-review/v2"
    ? projectSmsReviewV2Response(providerResult)
    : { transactions: providerResult.transactions };
  return jsonResponse({
    ...financialAndReview,
    completionStatus: "complete",
    negativeFingerprints: [
      ...new Set([
        ...input.suppressedNegativeFingerprints,
        ...reconciliation.negativeFingerprints,
      ]),
    ],
    terminalFingerprints: input.terminalFingerprints,
    unresolvedFingerprints: partition.unresolvedFingerprints,
    ...(partition.unresolvedFingerprints.length > 0
      ? { retryRequestMode: "fresh" as const }
      : {}),
  });
}

async function handlePost(
  request: Request,
  dependencies: ParseSmsHandlerDependencies
): Promise<Response> {
  const userId = await dependencies.authenticate(request);
  if (userId === null) return refusal("unauthenticated", 401);
  if (!(await dependencies.hasConsent(userId))) {
    return refusal("consent_required", 403);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return refusal("malformed_request", 400);
  }
  const body = parseRequestBody(rawBody);
  if (body === null) {
    return refusal("malformed_request", 400);
  }

  let policy: SmsSafeguardPolicy;
  try {
    policy = parseSmsSafeguardPolicy(dependencies.getPolicy());
  } catch {
    return refusal("dependency_unavailable", 503);
  }
  if (!policy.fullParser.isEnabled) {
    return refusal("capability_disabled", 503);
  }
  if (
    body.scanStartedAtMs >
    dependencies.getServerNowMs() + MAX_SCAN_START_FUTURE_SKEW_MS
  ) {
    return refusal("malformed_request", 400);
  }
  let acceptedScanStartedAtMs: number | null;
  try {
    acceptedScanStartedAtMs = await dependencies.resolveScanWindowStart({
      userId,
      scanSessionId: body.scanSessionId,
      scanKind: body.scanKind,
      requestedScanStartedAtMs: body.scanStartedAtMs,
      maxFutureSkewMs: MAX_SCAN_START_FUTURE_SKEW_MS,
      edgeGraceMs: MAX_ROLLING_WINDOW_EDGE_GRACE_MS,
    });
  } catch {
    return refusal("dependency_unavailable", 503);
  }
  if (acceptedScanStartedAtMs === null) {
    return refusal("malformed_request", 400);
  }
  if (body.messages.length === 0) {
    return completedWithoutProvider([]);
  }
  if (
    !(await hasValidCanonicalMessages(
      body.messages,
      policy.lookbackDays,
      acceptedScanStartedAtMs,
      dependencies
    ))
  ) {
    return refusal("malformed_request", 400);
  }
  if (body.messages.length > policy.fullParser.maxUnitsPerRequest) {
    return refusal("request_limit", 400);
  }

  const metrics = calculateRequestMetrics(rawBody, body, dependencies);
  if (metrics.payloadBytes > policy.fullParser.maxPayloadBytes) {
    return refusal("payload_limit", 413, null, {
      sizeScope: getSizeScope(
        "payload_limit",
        rawBody,
        body,
        policy,
        dependencies
      ),
    });
  }
  if (
    metrics.estimatedInputTokens > policy.fullParser.maxEstimatedInputTokens
  ) {
    return refusal("input_token_limit", 413, null, {
      sizeScope: getSizeScope(
        "input_token_limit",
        rawBody,
        body,
        policy,
        dependencies
      ),
    });
  }

  const locallyEligibleMessages = body.messages.filter(
    (message) => !dependencies.shouldExclude(message)
  );
  if (locallyEligibleMessages.length === 0) return completedWithoutProvider([]);

  let processingOutcomes: readonly SmsAiProcessingOutcomeAtEdge[];
  try {
    processingOutcomes = await dependencies.getProcessingOutcomes(
      userId,
      locallyEligibleMessages.map((message) => message.smsFingerprint),
      policy.lookbackDays,
      acceptedScanStartedAtMs
    );
  } catch {
    return refusal("dependency_unavailable", 503);
  }
  const terminalFingerprints = new Set(
    processingOutcomes
      .filter((outcome) => outcome.isTerminal)
      .map((outcome) => outcome.smsFingerprint)
  );
  const blockedFingerprints = new Set(
    processingOutcomes
      .filter((outcome) => body.scanKind !== "history" || outcome.isTerminal)
      .map((outcome) => outcome.smsFingerprint)
  );
  const messages = locallyEligibleMessages.filter(
    (message) => !blockedFingerprints.has(message.smsFingerprint)
  );
  const terminal = locallyEligibleMessages
    .filter((message) => terminalFingerprints.has(message.smsFingerprint))
    .map((message) => message.smsFingerprint);
  const suppressedNegativeFingerprints = locallyEligibleMessages
    .filter(
      (message) =>
        blockedFingerprints.has(message.smsFingerprint) &&
        !terminalFingerprints.has(message.smsFingerprint)
    )
    .map((message) => message.smsFingerprint);
  if (messages.length === 0) {
    return completedWithoutProvider(terminal, suppressedNegativeFingerprints);
  }

  if (isCallerCancelled(request.signal)) return callerCancelledResponse();

  // This exact provider request is built for the post-exclusion/admitted
  // message subset and reused without changing prompt/schema after admission.
  if (!isRecord(rawBody)) return refusal("malformed_request", 400);
  const reviewProviderRequest = prepareReviewProviderRequest(body, messages, request.signal);
  const admissionMetrics = reviewProviderRequest === undefined
    ? metrics
    : measureSmsReviewV2ProviderRequest({
        requestBody: rawBody,
        providerRequest: reviewProviderRequest,
      });
  if (admissionMetrics.estimatedInputTokens >
      policy.fullParser.maxEstimatedInputTokens) {
    return refusal("input_token_limit", 413, null, { sizeScope: "shared_request" });
  }
  let admission: SmsAiAdmissionDecision;
  try {
    const requestDigest = await dependencies.computeRequestDigest(rawBody);
    if (isCallerCancelled(request.signal)) return callerCancelledResponse();
    admission = await dependencies.reserveWork({
      userId,
      requestKey: body.requestKey,
      capability: "sms_full_parse",
      scanSessionId: body.scanSessionId,
      scanKind: body.scanKind,
      unitCount: messages.length,
      payloadBytes: admissionMetrics.payloadBytes,
      estimatedInputTokens: admissionMetrics.estimatedInputTokens,
      requestDigest,
      candidateFingerprints: messages.map((message) => message.smsFingerprint),
      policy,
    });
  } catch {
    return refusal("dependency_unavailable", 503);
  }
  if (!admission.accepted) {
    return refusal(admission.decisionCode, 429, admission.availableAt);
  }

  return executeAdmittedWork({
    body,
    userId,
    messages,
    terminalFingerprints: terminal,
    suppressedNegativeFingerprints,
    admission,
    ...(reviewProviderRequest === undefined ? {} : { reviewProviderRequest }),
    dependencies,
    signal: request.signal,
  });
}

export function createParseSmsHandler(
  dependencies: ParseSmsHandlerDependencies
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }
    if (request.method !== "POST") return refusal("method_not_allowed", 405);
    return handlePost(request, dependencies);
  };
}
