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

function createSyntheticParseHandler(userId: string) {
  const lifecycle = createSyntheticEvaluationLifecycle();
  const provider = createConfiguredSmsAiProvider(Deno.env.get);
  return createParseSmsHandler({
    authenticate: async () => userId,
    hasConsent: hasActiveAiProcessingConsent,
    getPolicy: () => readSmsSafeguardPolicyFromEnvironment(Deno.env.get),
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

async function readCanonicalSyntheticBody(
  request: Request
): Promise<SyntheticEvaluationRequestBody | null> {
  let value: unknown;
  try {
    value = await request.clone().json();
  } catch {
    return null;
  }
  return parseCanonicalSyntheticEvaluationRequest(value);
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

  const userId = await verifyAuth(request.headers.get("authorization"));
  if (userId === null) return refusal("unauthenticated", 401);

  const body = await readCanonicalSyntheticBody(request);
  if (body === null) return refusal("malformed_request", 400);

  const internalRequest = createInternalParseRequest(request, body);
  return createSyntheticParseHandler(userId)(internalRequest);
}

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    return await handleRequest(request);
  } catch {
    return refusal("dependency_unavailable", 503);
  }
});
