import "edge-runtime";
import { createClient } from "@supabase/supabase-js";
import { hasActiveAiProcessingConsent } from "../_shared/ai-consent.ts";
import { handleSmsCategoryEnrichmentRequest } from "../_shared/sms-category-enrichment-handler.ts";
import {
  completeSmsAiWork,
  markSmsAiProviderStarted,
  releaseSmsAiWork,
  reserveSmsAiWork,
} from "../_shared/sms-ai-safeguard-service.ts";
import { readSmsSafeguardPolicyFromEnvironment } from "../_shared/sms-safeguard-policy.ts";
import { logSmsAiOperationalResponse } from "../_shared/sms-ai-operational-telemetry.ts";
import { readSmsAiProviderConfig } from "../_shared/sms-ai/sms-ai-provider-config.ts";
import { DeepInfraSmsCategoryProvider } from "../_shared/sms-ai/providers/deepinfra-sms-category-provider.ts";

function getSafeErrorType(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : typeof error;
}

function createServiceClient(): ReturnType<typeof createClient> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase environment is not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

async function verifyAuth(
  authHeader: string | null
): Promise<{ readonly userId: string } | null> {
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await createServiceClient().auth.getUser(token);
  return error || !data.user ? null : { userId: data.user.id };
}

function createSmsCategoryProvider(): DeepInfraSmsCategoryProvider | null {
  try {
    return new DeepInfraSmsCategoryProvider(
      readSmsAiProviderConfig(Deno.env.get),
      {
        logWarn: (...values) => console.warn(...values),
        logError: (...values) => console.error(...values),
      }
    );
  } catch (error: unknown) {
    console.error("[enrich-sms-categories] Provider configuration unavailable", {
      errorType: getSafeErrorType(error),
    });
    return null;
  }
}

const smsCategoryProvider = createSmsCategoryProvider();

Deno.serve(async (request: Request): Promise<Response> => {
  const response = await handleSmsCategoryEnrichmentRequest(request, {
    authenticate: verifyAuth,
    hasConsent: hasActiveAiProcessingConsent,
    getPolicy: () => readSmsSafeguardPolicyFromEnvironment(Deno.env.get),
    isProviderConfigured: smsCategoryProvider !== null,
    reserveWork: (input) => reserveSmsAiWork(createServiceClient(), input),
    markProviderStarted: (requestId, candidateFingerprints) =>
      markSmsAiProviderStarted(
        createServiceClient(),
        requestId,
        candidateFingerprints
      ),
    classify: (body, signal) =>
      smsCategoryProvider
        ? smsCategoryProvider.classify(body, signal)
        : Promise.resolve(null),
    completeWork: (input) => completeSmsAiWork(createServiceClient(), input),
    releaseWork: (requestId, decisionCode) =>
      releaseSmsAiWork(createServiceClient(), requestId, decisionCode),
    logInfo: (...values) => console.log(...values),
    logError: (...values) => console.error(...values),
  });
  await logSmsAiOperationalResponse(
    "sms_category_enrichment",
    response,
    (...values) => console.log(...values)
  );
  return response;
});
