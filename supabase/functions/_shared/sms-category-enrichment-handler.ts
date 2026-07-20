import type {
  SmsAiAdmissionDecision,
  SmsAiAdmissionInput,
  SmsAiProviderStartDecision,
  SmsAiScanKind,
} from "./sms-ai-safeguard-contract.ts";
import {
  buildSmsCategoryPrompt,
  buildSmsCategoryResponseSchema,
  parseSmsCategoryRequest,
  type SmsCategoryRequest,
  type SmsCategoryResponse,
} from "./sms-category-enrichment-contract.ts";
import { getUtf8ByteLengthAtEdge } from "./sms-input-estimator.ts";
import {
  parseSmsSafeguardPolicy,
  type SmsSafeguardPolicy,
} from "./sms-safeguard-policy.ts";

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const MAX_REQUEST_IDENTITY_LENGTH = 160;
const CONSERVATIVE_BYTES_PER_TOKEN = 3;

interface AuthenticatedUser {
  readonly userId: string;
}

interface CompleteWorkInput {
  readonly requestId: string;
  readonly completedWithProviderError: boolean;
  readonly decisionCode: string;
}

interface SmsCategoryHandlerRequest {
  readonly requestKey: string;
  readonly scanSessionId: string | null;
  readonly scanKind: SmsAiScanKind;
  readonly categoryRequest: SmsCategoryRequest;
}

export interface SmsCategoryRefusalResponse {
  readonly categories: readonly [];
  readonly reason: string;
  readonly availableAt: string | null;
}

export interface SmsCategoryHandlerDependencies {
  readonly authenticate: (
    authHeader: string | null
  ) => Promise<AuthenticatedUser | null>;
  readonly hasConsent: (userId: string) => Promise<boolean>;
  readonly getPolicy: () => unknown;
  readonly isProviderConfigured: boolean;
  readonly reserveWork: (
    input: SmsAiAdmissionInput
  ) => Promise<SmsAiAdmissionDecision>;
  readonly markProviderStarted: (
    requestId: string
  ) => Promise<SmsAiProviderStartDecision>;
  readonly classify: (
    request: SmsCategoryRequest,
    signal: AbortSignal
  ) => Promise<SmsCategoryResponse | null>;
  readonly completeWork: (input: CompleteWorkInput) => Promise<boolean>;
  readonly releaseWork: (
    requestId: string,
    decisionCode: string
  ) => Promise<boolean>;
  readonly logInfo: (...values: readonly unknown[]) => void;
  readonly logError: (...values: readonly unknown[]) => void;
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
  const body: SmsCategoryRefusalResponse = {
    categories: [],
    reason,
    availableAt: availableAt ?? null,
  };
  return jsonResponse(body, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function isIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_REQUEST_IDENTITY_LENGTH
  );
}

function isSmsScanKind(value: unknown): value is SmsAiScanKind {
  return ["initial", "incremental", "history", "live"].includes(String(value));
}

function normalizeMerchant(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function deduplicateMerchants(request: SmsCategoryRequest): SmsCategoryRequest {
  const normalizedMerchants = new Set<string>();
  const merchants = request.merchants.filter(({ merchant }) => {
    const normalizedMerchant = normalizeMerchant(merchant);
    if (normalizedMerchants.has(normalizedMerchant)) return false;
    normalizedMerchants.add(normalizedMerchant);
    return true;
  });
  return { merchants };
}

function parseRequestBody(value: unknown): SmsCategoryHandlerRequest | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "merchants",
      "requestKey",
      "scanKind",
      "scanSessionId",
    ]) ||
    !isIdentity(value.requestKey) ||
    !isSmsScanKind(value.scanKind)
  ) {
    return null;
  }

  const scanSessionId = value.scanSessionId;
  if (
    !(
      (value.scanKind === "live" &&
        (scanSessionId === null || isIdentity(scanSessionId))) ||
      (value.scanKind !== "live" && isIdentity(scanSessionId))
    )
  ) {
    return null;
  }

  const categoryRequest = parseSmsCategoryRequest({
    merchants: value.merchants,
  });
  if (categoryRequest === null) return null;

  return {
    requestKey: value.requestKey,
    scanSessionId: scanSessionId as string | null,
    scanKind: value.scanKind,
    categoryRequest: deduplicateMerchants(categoryRequest),
  };
}

function calculateRequestMetrics(
  rawBody: unknown,
  request: SmsCategoryRequest
): { readonly payloadBytes: number; readonly estimatedInputTokens: number } {
  const prompt = buildSmsCategoryPrompt(request);
  const schema = JSON.stringify(
    buildSmsCategoryResponseSchema(request.merchants.length)
  );
  const providerInputBytes = getUtf8ByteLengthAtEdge(`${prompt}\n${schema}`);
  return {
    payloadBytes: getUtf8ByteLengthAtEdge(JSON.stringify(rawBody)),
    estimatedInputTokens: Math.ceil(
      providerInputBytes / CONSERVATIVE_BYTES_PER_TOKEN
    ),
  };
}

async function safelyReleaseReservation(
  dependencies: SmsCategoryHandlerDependencies,
  requestId: string,
  decisionCode: string
): Promise<void> {
  try {
    await dependencies.releaseWork(requestId, decisionCode);
  } catch {
    // The reservation lease remains the fallback when explicit release fails.
  }
}

async function safelyCompleteWork(
  dependencies: SmsCategoryHandlerDependencies,
  input: CompleteWorkInput
): Promise<boolean> {
  try {
    return await dependencies.completeWork(input);
  } catch {
    return false;
  }
}

async function executeAdmittedWork(input: {
  readonly request: Request;
  readonly body: SmsCategoryHandlerRequest;
  readonly admission: SmsAiAdmissionDecision;
  readonly dependencies: SmsCategoryHandlerDependencies;
}): Promise<Response> {
  let startDecision: SmsAiProviderStartDecision;
  try {
    startDecision = await input.dependencies.markProviderStarted(
      input.admission.requestId
    );
  } catch {
    await safelyReleaseReservation(
      input.dependencies,
      input.admission.requestId,
      "provider_start_failed"
    );
    return refusal("dependency_unavailable", 503);
  }

  if (!startDecision.started) {
    return refusal(startDecision.decisionCode, 429);
  }

  let result: SmsCategoryResponse | null;
  try {
    result = await input.dependencies.classify(
      input.body.categoryRequest,
      input.request.signal
    );
  } catch {
    result = null;
  }

  if (result === null) {
    const didComplete = await safelyCompleteWork(input.dependencies, {
      requestId: input.admission.requestId,
      completedWithProviderError: true,
      decisionCode: "provider_failed",
    });
    return didComplete
      ? refusal("provider_failed", 502)
      : refusal("dependency_unavailable", 503);
  }

  const didComplete = await safelyCompleteWork(input.dependencies, {
    requestId: input.admission.requestId,
    completedWithProviderError: false,
    decisionCode: "complete",
  });
  if (!didComplete) return refusal("dependency_unavailable", 503);

  input.dependencies.logInfo(
    "[enrich-sms-categories] Classification completed",
    {
      merchantCount: input.body.categoryRequest.merchants.length,
      resultCount: result.categories.length,
    }
  );
  return jsonResponse(result);
}

async function handlePost(
  request: Request,
  dependencies: SmsCategoryHandlerDependencies
): Promise<Response> {
  let auth: AuthenticatedUser | null;
  try {
    auth = await dependencies.authenticate(
      request.headers.get("authorization")
    );
  } catch {
    return refusal("dependency_unavailable", 503);
  }
  if (auth === null) return refusal("unauthenticated", 401);

  try {
    if (!(await dependencies.hasConsent(auth.userId))) {
      return refusal("consent_required", 403);
    }
  } catch {
    return refusal("dependency_unavailable", 503);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return refusal("malformed_request", 400);
  }
  const body = parseRequestBody(rawBody);
  if (body === null) return refusal("malformed_request", 400);

  let policy: SmsSafeguardPolicy;
  try {
    policy = parseSmsSafeguardPolicy(dependencies.getPolicy());
  } catch {
    return refusal("dependency_unavailable", 503);
  }
  if (!policy.categoryEnrichment.isEnabled) {
    return refusal("capability_disabled", 503);
  }
  if (!dependencies.isProviderConfigured) {
    return refusal("dependency_unavailable", 503);
  }

  const metrics = calculateRequestMetrics(rawBody, body.categoryRequest);
  let admission: SmsAiAdmissionDecision;
  try {
    admission = await dependencies.reserveWork({
      userId: auth.userId,
      requestKey: body.requestKey,
      capability: "sms_category_enrichment",
      scanSessionId: body.scanSessionId,
      scanKind: body.scanKind,
      unitCount: body.categoryRequest.merchants.length,
      payloadBytes: metrics.payloadBytes,
      estimatedInputTokens: metrics.estimatedInputTokens,
      policy,
    });
  } catch {
    return refusal("dependency_unavailable", 503);
  }

  if (!admission.accepted) {
    return refusal(admission.decisionCode, 429, admission.availableAt);
  }

  return executeAdmittedWork({ request, body, admission, dependencies });
}

export async function handleSmsCategoryEnrichmentRequest(
  request: Request,
  dependencies: SmsCategoryHandlerDependencies
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") return refusal("method_not_allowed", 405);

  try {
    return await handlePost(request, dependencies);
  } catch (error: unknown) {
    dependencies.logError("[enrich-sms-categories] Request failed", {
      errorType: error instanceof Error ? error.name || "Error" : typeof error,
    });
    return refusal("dependency_unavailable", 503);
  }
}
