import "edge-runtime";
import { createClient } from "@supabase/supabase-js";

import { isExcludedBeforeSmsParsingAtEdge } from "../_shared/sms-hard-exclusions.ts";
import {
  createParseSmsHandler,
  type ExecuteSmsProviderInput,
  type ParseSmsMessage,
  type SmsProviderExecutionResult,
} from "../_shared/parse-sms-handler.ts";
import {
  completeSmsAiWork,
  markSmsAiProviderStarted,
  releaseSmsAiWork,
  reserveSmsAiWork,
} from "../_shared/sms-ai-safeguard-service.ts";
import { reconcileSmsNegativeOutcomes } from "../_shared/sms-negative-outcome-handler.ts";
import { getSafeguardQaPolicyAtEdge } from "../_shared/sms-safeguard-qa-policy.ts";
import {
  assertLocalSafeguardQaRuntime,
  parseSafeguardQaRequestMetadata,
} from "../_shared/sms-safeguard-qa-runtime.ts";
import { isLikelyCorruptedSmsText } from "../_shared/sms-text-quality.ts";
import {
  computeRequestDigestAtEdge,
  computeSmsFingerprintAtEdge,
} from "../_shared/sms-fingerprint-at-edge.ts";
import { handleSmsCategoryEnrichmentRequest } from "../_shared/sms-category-enrichment-handler.ts";
import type { SmsCategoryRequest } from "../_shared/sms-category-enrichment-contract.ts";
import {
  executeSafeguardQaProvider,
  parseSafeguardQaProviderOutcome,
  type SafeguardQaProviderOutcome,
} from "../_shared/sms-safeguard-qa-provider.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

function createServiceClient(): ReturnType<typeof createClient> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Local Supabase environment is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

async function authenticate(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data, error } = await createServiceClient().auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

async function authenticateHeader(
  authHeader: string | null
): Promise<{ readonly userId: string } | null> {
  if (!authHeader) return null;
  const request = new Request("http://localhost/sms-safeguard-qa", {
    headers: { authorization: authHeader },
  });
  const userId = await authenticate(request);
  return userId === null ? null : { userId };
}

async function getProcessingOutcomes(
  userId: string,
  fingerprints: readonly string[],
  lookbackDays: number
): Promise<
  readonly { readonly smsFingerprint: string; readonly isTerminal: boolean }[]
> {
  if (fingerprints.length === 0) return [];
  const cutoff = new Date(Date.now() - lookbackDays * DAY_MS).toISOString();
  const { data, error } = await createServiceClient()
    .from("sms_ai_negative_outcomes")
    .select("sms_fingerprint,is_terminal")
    .eq("user_id", userId)
    .eq("deleted", false)
    .or(`is_terminal.eq.true,original_received_at.gte.${cutoff}`)
    .in("sms_fingerprint", [...new Set(fingerprints)]);
  if (error) throw error;
  return (data ?? []).flatMap((row) =>
    typeof row.sms_fingerprint === "string" &&
    typeof row.is_terminal === "boolean"
      ? [
          {
            smsFingerprint: row.sms_fingerprint,
            isTerminal: row.is_terminal,
          },
        ]
      : []
  );
}

function resolveProviderOutcome(
  profileId: string,
  requestedOutcome: unknown
): SafeguardQaProviderOutcome {
  if (requestedOutcome !== undefined) {
    return parseSafeguardQaProviderOutcome(requestedOutcome);
  }
  if (
    profileId === "negative-three-strikes-v1" ||
    profileId === "terminal-fresh-install-v1"
  ) {
    return "omission";
  }
  return profileId === "response-validity-v1"
    ? "invalid-identity"
    : "trusted-success";
}

async function handleRequest(request: Request): Promise<Response> {
  assertLocalSafeguardQaRuntime({
    isEnabled: Deno.env.get("SMS_SAFEGUARD_QA_ENABLED"),
    supabaseUrl: Deno.env.get("SUPABASE_URL"),
  });
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-sms-safeguard-qa-run-id",
      },
    });
  }
  const rawBody: unknown = await request.clone().json();
  if (
    typeof rawBody !== "object" ||
    rawBody === null ||
    Array.isArray(rawBody)
  ) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const metadata = parseSafeguardQaRequestMetadata(
    request,
    rawBody as Readonly<Record<string, unknown>>
  );
  const providerOutcome = resolveProviderOutcome(
    metadata.profileId,
    (rawBody as Readonly<Record<string, unknown>>).qaProviderOutcome
  );
  const policy = getSafeguardQaPolicyAtEdge(metadata.profileId);
  if (
    (rawBody as Readonly<Record<string, unknown>>).qaCapability ===
    "category_enrichment"
  ) {
    const body = rawBody as Readonly<Record<string, unknown>>;
    const categoryRequest = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        requestKey: body.requestKey,
        scanSessionId: body.scanSessionId,
        scanKind: body.scanKind,
        merchants: body.merchants,
      }),
    });
    return handleSmsCategoryEnrichmentRequest(categoryRequest, {
      authenticate: authenticateHeader,
      hasConsent: async () => true,
      getPolicy: () => policy,
      isProviderConfigured: true,
      reserveWork: (input) => reserveSmsAiWork(createServiceClient(), input),
      markProviderStarted: (requestId) =>
        markSmsAiProviderStarted(createServiceClient(), requestId),
      classify: async (input: SmsCategoryRequest) => ({
        categories: input.merchants.map((merchant) => ({
          merchantId: merchant.id,
          categorySystemName: "shopping",
          confidence: 0.95,
        })),
      }),
      completeWork: (input) => completeSmsAiWork(createServiceClient(), input),
      releaseWork: (requestId, decisionCode) =>
        releaseSmsAiWork(createServiceClient(), requestId, decisionCode),
      logInfo: () => undefined,
      logError: () => undefined,
    });
  }
  const handler = createParseSmsHandler({
    authenticate,
    hasConsent: async () => true,
    getPolicy: () => policy,
    fixedPrompt: "SMS safeguard QA deterministic provider",
    buildResponseSchema: (currencies) => JSON.stringify({ currencies }),
    shouldExclude: (message: ParseSmsMessage) =>
      isExcludedBeforeSmsParsingAtEdge(message.body) ||
      isLikelyCorruptedSmsText(message.body),
    computeFingerprint: (message) =>
      computeSmsFingerprintAtEdge({
        sender: message.sender,
        body: message.body,
        receivedAtMs: Date.parse(message.date),
      }),
    computeRequestDigest: computeRequestDigestAtEdge,
    getServerNowMs: Date.now,
    getProcessingOutcomes,
    reserveWork: (input) => reserveSmsAiWork(createServiceClient(), input),
    markProviderStarted: (requestId) =>
      markSmsAiProviderStarted(createServiceClient(), requestId),
    executeProvider: (
      input: ExecuteSmsProviderInput
    ): Promise<SmsProviderExecutionResult> =>
      executeSafeguardQaProvider(providerOutcome, input),
    completeWork: (input) => completeSmsAiWork(createServiceClient(), input),
    releaseWork: (requestId, decisionCode) =>
      releaseSmsAiWork(createServiceClient(), requestId, decisionCode),
    reconcileOutcomes: (input) =>
      reconcileSmsNegativeOutcomes({
        client: createServiceClient(),
        userId: input.userId,
        submittedCandidates: input.submittedCandidates,
        envelope: {
          requestId: input.requestId,
          completionStatus: input.completionStatus,
          transactions: input.transactions,
        },
      }),
  });
  return handler(request);
}

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    return await handleRequest(request);
  } catch (error: unknown) {
    console.error("[sms-safeguard-qa] Request refused", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return new Response(JSON.stringify({ error: "Safeguard QA unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
});
