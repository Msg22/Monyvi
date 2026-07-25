import "edge-runtime";
import { createClient } from "@supabase/supabase-js";
import { hasActiveAiProcessingConsent } from "../_shared/ai-consent.ts";
import { handleSmsAiAvailabilityRequest } from "../_shared/sms-ai-availability-handler.ts";
import { readSmsAiAvailability } from "../_shared/sms-ai-safeguard-service.ts";
import { readSmsSafeguardPolicyFromEnvironment } from "../_shared/sms-safeguard-policy.ts";

function createServiceClient(): ReturnType<typeof createClient> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase environment is not configured");
  }
  return createClient(supabaseUrl, serviceKey);
}

async function authenticate(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization");
  if (authorization === null) return null;
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (token.trim().length === 0) return null;
  const { data, error } = await createServiceClient().auth.getUser(token);
  return error === null && data.user !== null ? data.user.id : null;
}

Deno.serve(
  (request: Request): Promise<Response> =>
    handleSmsAiAvailabilityRequest(request, {
      authenticate,
      hasConsent: hasActiveAiProcessingConsent,
      getAvailability: (userId) =>
        readSmsAiAvailability(createServiceClient(), {
          userId,
          policy: readSmsSafeguardPolicyFromEnvironment(Deno.env.get),
        }),
    })
);
