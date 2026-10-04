import { supabase } from "@/services/supabase";

type VerificationResendResult =
  | {
      readonly status: "sent";
      readonly sentAtMs: number;
      readonly resendAvailableAtMs: number;
      readonly verificationExpiresAtMs: number;
    }
  | {
      readonly status: "cooldown" | "limit";
      readonly retryAtMs: number | null;
    }
  | {
      readonly status: "temporary_failure";
    };

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function registerInitialVerificationSend(
  email: string
): Promise<void> {
  try {
    await supabase.functions.invoke("email-verification-resend", {
      body: {
        operation: "register_initial",
        email,
      },
    });
  } catch {
    // Best effort. The server initializes a conservative resend window on the
    // first later resend if initial registration was unavailable.
  }
}

export async function resendVerificationCode(
  email: string
): Promise<VerificationResendResult> {
  try {
    const { data, error } = await supabase.functions.invoke<unknown>(
      "email-verification-resend",
      {
        body: {
          operation: "resend",
          email,
        },
      }
    );

    if (error || !isRecord(data)) {
      return { status: "temporary_failure" };
    }

    if (data.status === "sent") {
      const sentAtMs = parseIsoMs(data.sentAt);
      const resendAvailableAtMs = parseIsoMs(data.resendAvailableAt);
      const verificationExpiresAtMs = parseIsoMs(data.verificationExpiresAt);
      if (
        sentAtMs === null ||
        resendAvailableAtMs === null ||
        verificationExpiresAtMs === null
      ) {
        return { status: "temporary_failure" };
      }

      return {
        status: "sent",
        sentAtMs,
        resendAvailableAtMs,
        verificationExpiresAtMs,
      };
    }

    if (data.status === "cooldown" || data.status === "limit") {
      return {
        status: data.status,
        retryAtMs: parseIsoMs(data.retryAt),
      };
    }

    return { status: "temporary_failure" };
  } catch {
    return { status: "temporary_failure" };
  }
}

export type { VerificationResendResult };
