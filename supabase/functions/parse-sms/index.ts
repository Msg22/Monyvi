/**
 * parse-sms Edge Function
 *
 * Receives a batch of SMS messages from a single client chunk, applies the
 * existing SMS safeguards, and delegates AI parsing through the configured
 * SMS-specific provider boundary.
 *
 * Provider configuration is resolved at module composition time so missing or
 * unsupported configuration fails before request admission/provider accounting.
 *
 * @module parse-sms
 */

import "edge-runtime";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../../packages/db/src/supabase-types.ts";

import { hasActiveAiProcessingConsent } from "../_shared/ai-consent.ts";
import { isExcludedBeforeSmsParsingAtEdge } from "../_shared/sms-hard-exclusions.ts";
import { logSmsAiOperationalResponse } from "../_shared/sms-ai-operational-telemetry.ts";
import {
  completeSmsAiWork,
  markSmsAiProviderStarted,
  releaseSmsAiWork,
  reserveSmsAiWork,
  resolveSmsScanWindowStart,
} from "../_shared/sms-ai-safeguard-service.ts";
import { createConfiguredSmsAiProvider } from "../_shared/sms-ai/sms-ai-provider-factory.ts";
import { isSmsAiProviderResponseOutputCaptureEnabled } from "../_shared/sms-ai/sms-ai-provider-config.ts";
import {
  executeSmsAiProvider,
  type SmsAiProviderDiagnostics,
} from "../_shared/sms-ai/sms-ai-provider-executor.ts";
import {
  buildSmsAiDynamicCategoryContext,
  buildSmsAiResponseSchema,
  buildSmsAiStableSystemPrompt,
} from "../_shared/sms-ai/sms-ai-prompt.ts";
import { reconcileSmsNegativeOutcomes } from "../_shared/sms-negative-outcome-handler.ts";
import {
  createParseSmsHandler,
  type ParseSmsMessage,
} from "../_shared/parse-sms-handler.ts";
import { readSmsSafeguardPolicyFromEnvironment } from "../_shared/sms-safeguard-policy.ts";
import {
  computeRequestDigestAtEdge,
  computeSmsFingerprintAtEdge,
} from "../_shared/sms-fingerprint-at-edge.ts";
import { isLikelyCorruptedSmsText } from "../_shared/sms-text-quality.ts";

function getSafeErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name || "Error";
  }

  return typeof error;
}

/**
 * Verify the JWT from the Authorization header using Supabase client.
 */
async function verifyAuth(
  authHeader: string | null
): Promise<{ userId: string } | null> {
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) return null;
  return { userId: data.user.id };
}

function createServiceClient(): SupabaseClient<Database> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase environment is not configured");
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey);
}

async function getProcessingOutcomes(
  userId: string,
  fingerprints: readonly string[],
  lookbackDays: number,
  referenceNowMs: number
): Promise<
  readonly { readonly smsFingerprint: string; readonly isTerminal: boolean }[]
> {
  if (fingerprints.length === 0) return [];

  const { data, error } = await createServiceClient()
    .from("sms_ai_negative_outcomes")
    .select("sms_fingerprint,is_terminal")
    .eq("user_id", userId)
    .eq("deleted", false)
    .or(
      `is_terminal.eq.true,original_received_at.gte.${new Date(
        referenceNowMs - lookbackDays * 24 * 60 * 60 * 1000
      ).toISOString()}`
    )
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

const isProviderResponseOutputCaptureEnabled =
  isSmsAiProviderResponseOutputCaptureEnabled(Deno.env.get);

const smsAiProvider = createConfiguredSmsAiProvider(Deno.env.get, {
  log: (event, metadata) => {
    console.warn(`[parse-sms] ${event}`, metadata);
  },
  ...(isProviderResponseOutputCaptureEnabled
    ? {
        onResponseOutput: (responseContent: string): void => {
          console.warn("[parse-sms] smsAi.providerResponseOutput", {
            responseContent,
          });
        },
      }
    : {}),
});

const providerRequestDiagnostics: SmsAiProviderDiagnostics | undefined =
  isProviderResponseOutputCaptureEnabled
    ? {
        onRequestInput: (smsMessages): void => {
          console.warn("[parse-sms] smsAi.providerRequestInput", {
            smsMessages,
          });
        },
      }
    : undefined;

const parseSmsHandler = createParseSmsHandler({
  authenticate: async (request) => {
    const auth = await verifyAuth(request.headers.get("authorization"));
    return auth?.userId ?? null;
  },
  hasConsent: hasActiveAiProcessingConsent,
  getPolicy: () => readSmsSafeguardPolicyFromEnvironment(Deno.env.get),
  buildFixedPrompt: buildSmsAiStableSystemPrompt,
  buildCategoryContext: buildSmsAiDynamicCategoryContext,
  buildResponseSchema: (supportedCurrencies) =>
    JSON.stringify(buildSmsAiResponseSchema(supportedCurrencies)),
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
  resolveScanWindowStart: (input) =>
    resolveSmsScanWindowStart(createServiceClient(), input),
  getProcessingOutcomes,
  reserveWork: (input) => reserveSmsAiWork(createServiceClient(), input),
  markProviderStarted: (requestId, candidateFingerprints) =>
    markSmsAiProviderStarted(
      createServiceClient(),
      requestId,
      candidateFingerprints
    ),
  executeProvider: (input) =>
    executeSmsAiProvider(smsAiProvider, input, providerRequestDiagnostics),
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

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    const response = await parseSmsHandler(request);
    await logSmsAiOperationalResponse("sms_full_parse", response, (...values) =>
      console.warn(...values)
    );
    return response;
  } catch (error: unknown) {
    console.error("[parse-sms] Error", {
      errorType: getSafeErrorType(error),
    });
    return new Response(
      JSON.stringify({
        transactions: [],
        reason: "dependency_unavailable",
        negativeFingerprints: [],
        terminalFingerprints: [],
        unresolvedFingerprints: [],
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
