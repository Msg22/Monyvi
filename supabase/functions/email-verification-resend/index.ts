import "edge-runtime";
import { createClient } from "@supabase/supabase-js";

import {
  handleEmailVerificationResendRequest,
  type EmailVerificationReservation,
} from "../_shared/email-verification-resend-handler.ts";

const COOLDOWN_SECONDS = 120;
const WINDOW_SECONDS = 24 * 60 * 60;
const MAX_RESENDS = 3;
const RESERVATION_LEASE_SECONDS = 30;
const DEFAULT_REDIRECT_URL = "monyvi://auth-callback";

function createServiceClient(): ReturnType<typeof createClient> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase environment is not configured");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function registerInitial(input: {
  readonly email: string;
  readonly emailKey: string;
}): Promise<boolean> {
  const client = createServiceClient();
  const { data, error } = await client.rpc(
    "email_verification_register_initial_send",
    {
      p_email_key: input.emailKey,
      p_email: input.email,
    }
  );
  if (error) throw error;
  return data === true;
}

async function reserveResend(input: {
  readonly email: string;
  readonly emailKey: string;
}): Promise<EmailVerificationReservation> {
  const client = createServiceClient();
  const { data, error } = await client.rpc(
    "email_verification_reserve_resend",
    {
      p_email_key: input.emailKey,
      p_email: input.email,
      p_cooldown_seconds: COOLDOWN_SECONDS,
      p_window_seconds: WINDOW_SECONDS,
      p_max_resends: MAX_RESENDS,
      p_reservation_lease_seconds: RESERVATION_LEASE_SECONDS,
    }
  );
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : null;
  if (
    !row ||
    typeof row.accepted !== "boolean" ||
    typeof row.decision_code !== "string"
  ) {
    throw new Error("Invalid resend reservation response");
  }

  return {
    accepted: row.accepted,
    decisionCode: row.decision_code as EmailVerificationReservation["decisionCode"],
    reservationId:
      typeof row.reservation_id === "string" ? row.reservation_id : null,
    availableAt:
      typeof row.available_at === "string" ? row.available_at : null,
  };
}

async function sendResend(
  email: string
): Promise<{ readonly success: boolean; readonly errorCode?: string }> {
  const client = createServiceClient();
  const redirectUrl =
    Deno.env.get("EMAIL_VERIFICATION_REDIRECT_URL")?.trim() ||
    DEFAULT_REDIRECT_URL;
  const { error } = await client.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: redirectUrl,
    },
  });

  return error
    ? { success: false, errorCode: error.code ?? "unknown" }
    : { success: true };
}

async function finalizeResend(input: {
  readonly emailKey: string;
  readonly reservationId: string;
}): Promise<boolean> {
  const client = createServiceClient();
  const { data, error } = await client.rpc(
    "email_verification_finalize_resend",
    {
      p_email_key: input.emailKey,
      p_reservation_id: input.reservationId,
    }
  );
  if (error) throw error;
  return data === true;
}

async function releaseResend(input: {
  readonly emailKey: string;
  readonly reservationId: string;
}): Promise<boolean> {
  const client = createServiceClient();
  const { data, error } = await client.rpc(
    "email_verification_release_resend",
    {
      p_email_key: input.emailKey,
      p_reservation_id: input.reservationId,
    }
  );
  if (error) throw error;
  return data === true;
}

function getLimiterPepper(): string {
  const configured = Deno.env.get("EMAIL_VERIFICATION_LIMITER_PEPPER")?.trim();
  if (configured) {
    return configured;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (supabaseUrl.startsWith("http://")) {
    // Local-only deterministic fallback so Supabase CLI/manual QA works without
    // committing a secret. Hosted deployments use HTTPS and therefore require
    // EMAIL_VERIFICATION_LIMITER_PEPPER.
    return "monyvi-local-email-verification-limiter-v1";
  }

  return "";
}

Deno.serve(async (request: Request): Promise<Response> => {
  try {
    const pepper = getLimiterPepper();
    return await handleEmailVerificationResendRequest(request, {
      pepper,
      now: () => new Date(),
      registerInitial,
      reserveResend,
      sendResend,
      finalizeResend,
      releaseResend,
    });
  } catch {
    return new Response(JSON.stringify({ status: "temporary_failure" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
});
