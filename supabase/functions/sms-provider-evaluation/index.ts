import "edge-runtime";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../../packages/db/src/supabase-types.ts";
import { hasActiveAiProcessingConsent } from "../_shared/ai-consent.ts";
import { createParseSmsHandler } from "../_shared/parse-sms-handler.ts";
import { isExcludedBeforeSmsParsingAtEdge } from "../_shared/sms-hard-exclusions.ts";
import { createConfiguredSmsAiProvider } from "../_shared/sms-ai/sms-ai-provider-factory.ts";
import { executeSmsAiProvider } from "../_shared/sms-ai/sms-ai-provider-executor.ts";
import {
  buildSmsAiDynamicCategoryContext,
  buildSmsAiResponseSchema,
  buildSmsAiStableSystemPrompt,
} from "../_shared/sms-ai/sms-ai-prompt.ts";
import { readSmsSafeguardPolicyFromEnvironment } from "../_shared/sms-safeguard-policy.ts";
import {
  computeRequestDigestAtEdge,
  computeSmsFingerprintAtEdge,
} from "../_shared/sms-fingerprint-at-edge.ts";
import {
  createSyntheticEvaluationLifecycle,
  parseCanonicalSyntheticEvaluationRequest,
  parseSyntheticEvaluationPreflight,
  reconcileSyntheticEvaluationOutcomes,
  toParseSmsCompatibleBody,
  type SyntheticEvaluationRequestBody,
} from "../_shared/sms-synthetic-evaluation-runtime.ts";
import { isLikelyCorruptedSmsText } from "../_shared/sms-text-quality.ts";

const EXPECTED_STAGING_SUPABASE_URL =
  "https://yulbcndyssdjicbpmlrk.supabase.co";
const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function refusal(reason: string, status: number): Response {
  return jsonResponse(
    {
      transactions: [],
      reason,
      availableAt: null,
      negativeFingerprints: [],
      terminalFingerprints: [],
      unresolvedFingerprints: [],
    },
    status
  );
}

function isApprovedStagingRuntime(): boolean {
  return Deno.env.get("SUPABASE_URL") === EXPECTED_STAGING_SUPABASE_URL;
}

function createServiceClient(): SupabaseClient<Database> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase environment is not configured");
  }
  return createClient<Database>(supabaseUrl, supabaseServiceKey);
}

async function verifyAuth(
  authHeader: string | null
): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await createServiceClient().auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

function createSyntheticParseHandler(input: {
  readonly userId: string;
  readonly authorization: string;
  readonly policy: ReturnType<typeof readSmsSafeguardPolicyFromEnvironment>;
}): ReturnType<typeof createParseSmsHandler> {
  const lifecycle = createSyntheticEvaluationLifecycle();
  const provider = createConfiguredSmsAiProvider(Deno.env.get);
  return createParseSmsHandler({
    authenticate: async (request) =>
      request.headers.get("authorization") === input.authorization
        ? input.userId
        : null,
    hasConsent: async (userId) => userId === input.userId,
    getPolicy: () => input.policy,
    buildFixedPrompt: buildSmsAiStableSystemPrompt,
    buildCategoryContext: buildSmsAiDynamicCategoryContext,
    buildResponseSchema: (currencies) =>
      JSON.stringify(buildSmsAiResponseSchema(currencies)),
    shouldExclude: (message) =>
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
    resolveScanWindowStart: async ({ requestedScanStartedAtMs }) =>
      requestedScanStartedAtMs,
    getProcessingOutcomes: async () => [],
    reserveWork: lifecycle.reserveWork,
    markProviderStarted: lifecycle.markProviderStarted,
    executeProvider: (input) => executeSmsAiProvider(provider, input),
    completeWork: lifecycle.completeWork,
    releaseWork: lifecycle.releaseWork,
    reconcileOutcomes: reconcileSyntheticEvaluationOutcomes,
  });
}

type BoundedJsonRead =
  | { readonly status: "ok"; readonly value: unknown }
  | { readonly status: "too_large" }
  | { readonly status: "invalid" };

async function readBoundedJsonBody(
  request: Request,
  maxBytes: number
): Promise<BoundedJsonRead> {
  if (request.body === null) return { status: "invalid" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      return { status: "too_large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      status: "ok",
      value: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    };
  } catch {
    return { status: "invalid" };
  }
}

function createInternalParseRequest(
  request: Request,
  body: SyntheticEvaluationRequestBody
): Request {
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(toParseSmsCompatibleBody(body)),
    signal: request.signal,
  });
}

async function handleRequest(request: Request): Promise<Response> {
  if (!isApprovedStagingRuntime()) {
    return refusal("capability_disabled", 503);
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") return refusal("method_not_allowed", 405);

  const policy = readSmsSafeguardPolicyFromEnvironment(Deno.env.get);
  const rawBody = await readBoundedJsonBody(
    request,
    policy.fullParser.maxPayloadBytes
  );
  if (rawBody.status === "too_large") return refusal("payload_limit", 413);
  if (rawBody.status === "invalid") return refusal("malformed_request", 400);

  const preflight = parseSyntheticEvaluationPreflight(rawBody.value);
  if (
    preflight === null ||
    preflight.messageCount > policy.fullParser.maxUnitsPerRequest
  ) {
    return refusal("malformed_request", 400);
  }

  const authorization = request.headers.get("authorization");
  const userId = await verifyAuth(authorization);
  if (userId === null || authorization === null) {
    return refusal("unauthenticated", 401);
  }
  if (!(await hasActiveAiProcessingConsent(userId))) {
    return refusal("consent_required", 403);
  }

  const body = await parseCanonicalSyntheticEvaluationRequest(rawBody.value);
  if (body === null) return refusal("malformed_request", 400);

  const internalRequest = createInternalParseRequest(request, body);
  return createSyntheticParseHandler({
    userId,
    authorization,
    policy,
  })(internalRequest);
}

function getSafeErrorName(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : typeof error;
}

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    return await handleRequest(request);
  } catch (error: unknown) {
    console.error("[sms-provider-evaluation] requestFailed", {
      errorName: getSafeErrorName(error),
    });
    return refusal("dependency_unavailable", 503);
  }
});
