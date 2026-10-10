import "edge-runtime";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../../packages/db/src/supabase-types.ts";
import { hasActiveAiProcessingConsent } from "../_shared/ai-consent.ts";
import { handleVoiceAiAvailabilityRequest } from "../_shared/voice-ai-availability-handler.ts";
import { resolveVoiceEntitlementPolicy } from "../_shared/voice-ai-entitlement.ts";
import { readVoiceAiAvailability } from "../_shared/voice-ai-safeguard-service.ts";

function createServiceClient(): SupabaseClient<Database> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase environment is not configured");
  }

  return createClient<Database>(supabaseUrl, serviceKey);
}

async function authenticate(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization");
  if (authorization === null) return null;

  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (token.length === 0) return null;

  const { data, error } = await createServiceClient().auth.getUser(token);

  return error === null && data.user !== null ? data.user.id : null;
}

Deno.serve(
  (request: Request): Promise<Response> =>
    handleVoiceAiAvailabilityRequest(request, {
      authenticate,
      hasConsent: hasActiveAiProcessingConsent,
      getAvailability: (userId, timeZone) =>
        readVoiceAiAvailability(createServiceClient(), {
          userId,
          timeZone,
          policy: resolveVoiceEntitlementPolicy(Deno.env.get),
        }),
    })
);
