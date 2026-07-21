import type {
  SmsAiAdmissionDecision,
  SmsAiAdmissionInput,
  SmsAiProviderStartDecision,
} from "./sms-ai-safeguard-contract.ts";
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
// The mobile catalogue currently contains 35 currencies. Keep the structural
// request bound above it so valid app requests are accepted without allowing
// an unbounded dynamic response schema.
const MAX_SUPPORTED_CURRENCIES = 64;
const MAX_MESSAGES_BEFORE_POLICY_EVALUATION = 50;

export interface ParseSmsMessage {
  readonly id: string;
  readonly body: string;
  readonly sender: string;
  readonly date: string;
  readonly smsFingerprint: string;
}

export interface ParseSmsProviderTransaction {
  readonly messageId: string;
  readonly amount: number;
  readonly currency: string;
  readonly type: string;
  readonly counterparty: string;
  readonly date: string;
  readonly categorySystemName: string;
  readonly isAtmWithdrawal?: boolean;
  readonly cardLast4?: string;
  readonly confidenceScore: number;
  readonly isTrusted: boolean;
}

export interface SmsProviderExecutionResult {
  readonly completionStatus: SmsProviderCompletionStatusAtEdge;
  readonly isResponseSchemaValid: boolean;
  readonly transactions: readonly ParseSmsProviderTransaction[];
}

export interface ExecuteSmsProviderInput {
  readonly messages: readonly ParseSmsMessage[];
  readonly categories: string;
  readonly supportedCurrencies: readonly string[];
}

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
  readonly fixedPrompt: string;
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
    lookbackDays: number
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

type SmsScanKind = "initial" | "incremental" | "history" | "live";

interface ParseSmsRequestBody {
  readonly requestKey: string;
  readonly scanSessionId: string | null;
  readonly scanKind: SmsScanKind;
  readonly scanStartedAtMs: number;
  readonly messages: readonly ParseSmsMessage[];
  readonly categories: string;
  readonly supportedCurrencies: readonly string[];
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
  availableAt?: string | null
): Response {
  return jsonResponse(
    {
      transactions: [],
      reason,
      availableAt: availableAt ?? null,
      negativeFingerprints: [],
      terminalFingerprints: [],
      unresolvedFingerprints: [],
    },
    status
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(
  value: unknown,
  maxLength = 100_000
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function parseMessage(value: unknown): ParseSmsMessage | null {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.id, 160) ||
    !isNonEmptyString(value.body) ||
    !isNonEmptyString(value.sender, 500) ||
    !isNonEmptyString(value.date, 100) ||
    !Number.isFinite(Date.parse(value.date)) ||
    !isNonEmptyString(value.smsFingerprint, 256)
  ) {
    return null;
  }
  return {
    id: value.id,
    body: value.body,
    sender: value.sender,
    date: value.date,
    smsFingerprint: value.smsFingerprint,
  };
}

function parseRequestBody(value: unknown): ParseSmsRequestBody | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.messages) ||
    value.messages.length > MAX_MESSAGES_BEFORE_POLICY_EVALUATION
  ) {
    return null;
  }
  if (
    !isNonEmptyString(value.requestKey, 160) ||
    !["initial", "incremental", "history", "live"].includes(
      String(value.scanKind)
    ) ||
    !isNonEmptyString(value.categories) ||
    !Array.isArray(value.supportedCurrencies) ||
    value.supportedCurrencies.length > MAX_SUPPORTED_CURRENCIES ||
    value.supportedCurrencies.some(
      (currency) => !isNonEmptyString(currency, 16)
    )
  ) {
    return null;
  }
  const scanKind = value.scanKind as SmsScanKind;
  const scanSessionId = value.scanSessionId;
  const scanStartedAtMs = Date.parse(String(value.scanStartedAt));
  if (
    !(
      (scanKind === "live" &&
        (scanSessionId === null || isNonEmptyString(scanSessionId, 160))) ||
      (scanKind !== "live" && isNonEmptyString(scanSessionId, 160))
    ) ||
    !Number.isFinite(scanStartedAtMs)
  ) {
    return null;
  }
  const messages = value.messages.map(parseMessage);
  if (messages.some((message) => message === null)) return null;
  const parsedMessages = messages as ParseSmsMessage[];
  const messageIds = new Set(parsedMessages.map((message) => message.id));
  const fingerprints = new Set(
    parsedMessages.map((message) => message.smsFingerprint)
  );
  if (
    messageIds.size !== parsedMessages.length ||
    fingerprints.size !== parsedMessages.length
  ) {
    return null;
  }
  return {
    requestKey: value.requestKey,
    scanSessionId: scanSessionId as string | null,
    scanKind,
    scanStartedAtMs,
    messages: parsedMessages,
    categories: value.categories,
    supportedCurrencies: value.supportedCurrencies as string[],
  };
}

function calculateRequestMetrics(
  rawBody: unknown,
  body: ParseSmsRequestBody,
  dependencies: ParseSmsHandlerDependencies
): { readonly payloadBytes: number; readonly estimatedInputTokens: number } {
  const payloadBytes = getUtf8ByteLengthAtEdge(JSON.stringify(rawBody));
  const estimate = estimateSmsRequestInputTokensAtEdge({
    prompt: dependencies.fixedPrompt,
    categories: body.categories,
    schema: dependencies.buildResponseSchema(body.supportedCurrencies),
    messages: [buildSmsProviderUserPromptAtEdge(body.messages)],
  });
  return { payloadBytes, estimatedInputTokens: estimate.totalTokens };
}

async function hasValidCanonicalMessages(
  messages: readonly ParseSmsMessage[],
  lookbackDays: number,
  acceptedScanStartedAtMs: number,
  dependencies: ParseSmsHandlerDependencies
): Promise<boolean> {
  const nowMs = dependencies.getServerNowMs();
  const minimumReceivedAtMs = acceptedScanStartedAtMs - lookbackDays * DAY_MS;
  const maximumReceivedAtMs = nowMs + MAX_FUTURE_MESSAGE_SKEW_MS;

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

async function executeAdmittedWork(input: {
  readonly body: ParseSmsRequestBody;
  readonly userId: string;
  readonly messages: readonly ParseSmsMessage[];
  readonly terminalFingerprints: readonly string[];
  readonly suppressedNegativeFingerprints: readonly string[];
  readonly admission: SmsAiAdmissionDecision;
  readonly dependencies: ParseSmsHandlerDependencies;
}): Promise<Response> {
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
    return refusal("dependency_unavailable", 503);
  }
  if (!startDecision.started) {
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

  let providerResult: SmsProviderExecutionResult;
  try {
    providerResult = await input.dependencies.executeProvider({
      messages: input.messages,
      categories: input.body.categories,
      supportedCurrencies: input.body.supportedCurrencies,
    });
  } catch {
    await completeSmsAiWorkWithRetry(input.dependencies.completeWork, {
      requestId: input.admission.requestId,
      completedWithProviderError: true,
      decisionCode: "provider_failed",
    });
    return refusal("provider_failed", 502);
  }

  if (!providerResult.isResponseSchemaValid) {
    await completeSmsAiWorkWithRetry(input.dependencies.completeWork, {
      requestId: input.admission.requestId,
      completedWithProviderError: true,
      decisionCode: "response_invalid",
    });
    return refusal("response_invalid", 502);
  }

  const submittedCandidates = toNegativeCandidates(input.messages);
  if (providerResult.completionStatus !== "complete") {
    await completeSmsAiWorkWithRetry(input.dependencies.completeWork, {
      requestId: input.admission.requestId,
      completedWithProviderError: true,
      decisionCode: providerResult.completionStatus,
    });
    return jsonResponse({
      transactions: [],
      completionStatus: providerResult.completionStatus,
      negativeFingerprints: input.suppressedNegativeFingerprints,
      terminalFingerprints: input.terminalFingerprints,
      unresolvedFingerprints: submittedCandidates.map(
        (candidate) => candidate.smsFingerprint
      ),
    });
  }

  let reconciliation: SmsNegativeOutcomeReconciliation;
  try {
    reconciliation = await input.dependencies.reconcileOutcomes({
      userId: input.userId,
      submittedCandidates,
      requestId: input.admission.requestId,
      completionStatus: providerResult.completionStatus,
      transactions: providerResult.transactions.map((transaction) => ({
        messageId: transaction.messageId,
        isTrusted: transaction.isTrusted,
      })),
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

  const didComplete = await completeSmsAiWorkWithRetry(
    input.dependencies.completeWork,
    {
      requestId: input.admission.requestId,
      completedWithProviderError: false,
      decisionCode: "complete",
    }
  );
  if (!didComplete) return refusal("dependency_unavailable", 503);

  return jsonResponse({
    transactions: providerResult.transactions,
    completionStatus: "complete",
    negativeFingerprints: [
      ...new Set([
        ...input.suppressedNegativeFingerprints,
        ...reconciliation.negativeFingerprints,
      ]),
    ],
    terminalFingerprints: input.terminalFingerprints,
    unresolvedFingerprints: [],
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
  if (body === null || body.messages.length === 0) {
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
    return refusal("payload_limit", 413);
  }
  if (
    metrics.estimatedInputTokens > policy.fullParser.maxEstimatedInputTokens
  ) {
    return refusal("input_token_limit", 413);
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
      policy.lookbackDays
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

  let admission: SmsAiAdmissionDecision;
  try {
    const requestDigest = await dependencies.computeRequestDigest(rawBody);
    admission = await dependencies.reserveWork({
      userId,
      requestKey: body.requestKey,
      capability: "sms_full_parse",
      scanSessionId: body.scanSessionId,
      scanKind: body.scanKind,
      unitCount: messages.length,
      payloadBytes: metrics.payloadBytes,
      estimatedInputTokens: metrics.estimatedInputTokens,
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
    dependencies,
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
