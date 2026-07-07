import { createClient } from "@supabase/supabase-js";

const AI_PROCESSING_CONSENT_VERSION = "2026-07-ai-processing-v1";

interface ProfileConsentRow {
  readonly ai_processing_consent: unknown;
}

interface AiProcessingConsent {
  readonly version?: unknown;
  readonly consentedAt?: unknown;
  readonly revokedAt?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isActiveAiProcessingConsent(consent: unknown): boolean {
  if (!isRecord(consent)) {
    return false;
  }

  const candidate = consent as AiProcessingConsent;
  return (
    candidate.version === AI_PROCESSING_CONSENT_VERSION &&
    typeof candidate.consentedAt === "string" &&
    candidate.consentedAt.trim().length > 0 &&
    candidate.revokedAt === null
  );
}

export async function hasActiveAiProcessingConsent(
  userId: string
): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase environment is not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase
    .from("profiles")
    .select("ai_processing_consent")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const profile = data as ProfileConsentRow | null;
  return isActiveAiProcessingConsent(profile?.ai_processing_consent);
}
