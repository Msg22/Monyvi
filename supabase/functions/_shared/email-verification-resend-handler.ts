const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;

type VerificationOperation = "register_initial" | "resend";
type ResendDecisionCode =
  | "accepted"
  | "busy"
  | "cooldown"
  | "limit"
  | "not_pending";

interface EmailVerificationReservation {
  readonly accepted: boolean;
  readonly decisionCode: ResendDecisionCode;
  readonly reservationId: string | null;
  readonly availableAt: string | null;
}

interface EmailVerificationResendDependencies {
  readonly pepper: string;
  readonly now: () => Date;
  readonly computeEmailKey?: (
    email: string,
    pepper: string
  ) => Promise<string>;
  readonly registerInitial: (input: {
    readonly email: string;
    readonly emailKey: string;
  }) => Promise<boolean>;
  readonly reserveResend: (input: {
    readonly email: string;
    readonly emailKey: string;
  }) => Promise<EmailVerificationReservation>;
  readonly sendResend: (
    email: string
  ) => Promise<{ readonly success: boolean; readonly errorCode?: string }>;
  readonly finalizeResend: (input: {
    readonly emailKey: string;
    readonly reservationId: string;
  }) => Promise<boolean>;
  readonly releaseResend: (input: {
    readonly emailKey: string;
    readonly reservationId: string;
  }) => Promise<boolean>;
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeVerificationEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isPlausibleEmail(email: string): boolean {
  return (
    email.length >= 3 &&
    email.length <= 320 &&
    email.includes("@") &&
    !/[\s]/.test(email)
  );
}

async function computeEmailVerificationKey(
  normalizedEmail: string,
  pepper: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(normalizedEmail)
  );
  return bytesToHex(new Uint8Array(signature));
}

async function handleEmailVerificationResendRequest(
  request: Request,
  dependencies: EmailVerificationResendDependencies
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ status: "method_not_allowed" }, 405);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ status: "invalid_request" }, 400);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("operation" in payload) ||
    !("email" in payload)
  ) {
    return jsonResponse({ status: "invalid_request" }, 400);
  }

  const operation = (payload as { operation?: unknown }).operation;
  const rawEmail = (payload as { email?: unknown }).email;
  if (
    (operation !== "register_initial" && operation !== "resend") ||
    typeof rawEmail !== "string"
  ) {
    return jsonResponse({ status: "invalid_request" }, 400);
  }

  const normalizedEmail = normalizeVerificationEmail(rawEmail);
  if (!isPlausibleEmail(normalizedEmail)) {
    return jsonResponse({ status: "invalid_request" }, 400);
  }

  if (dependencies.pepper.trim().length < 8) {
    return jsonResponse({ status: "temporary_failure" }, 503);
  }

  const computeKey =
    dependencies.computeEmailKey ?? computeEmailVerificationKey;
  const emailKey = await computeKey(normalizedEmail, dependencies.pepper);

  if (operation === "register_initial") {
    await dependencies.registerInitial({
      email: normalizedEmail,
      emailKey,
    });
    return jsonResponse({ status: "ok" });
  }

  const reservation = await dependencies.reserveResend({
    email: normalizedEmail,
    emailKey,
  });

  if (!reservation.accepted) {
    if (
      reservation.decisionCode === "cooldown" ||
      reservation.decisionCode === "busy" ||
      reservation.decisionCode === "limit"
    ) {
      return jsonResponse({
        status:
          reservation.decisionCode === "limit" ? "limit" : "cooldown",
        retryAt: reservation.availableAt,
      });
    }

    // Deliberately mirror a successful request for an address that is not in a
    // pending-verification state. This prevents the endpoint from becoming a
    // direct account-state enumeration oracle.
    const now = dependencies.now();
    return jsonResponse({
      status: "sent",
      sentAt: now.toISOString(),
      resendAvailableAt: new Date(
        now.getTime() + RESEND_COOLDOWN_MS
      ).toISOString(),
      verificationExpiresAt: new Date(
        now.getTime() + VERIFICATION_CODE_TTL_MS
      ).toISOString(),
    });
  }

  if (!reservation.reservationId) {
    return jsonResponse({ status: "temporary_failure" });
  }

  const sendResult = await dependencies.sendResend(normalizedEmail);
  if (!sendResult.success) {
    await dependencies.releaseResend({
      emailKey,
      reservationId: reservation.reservationId,
    });
    return jsonResponse({ status: "temporary_failure" });
  }

  const finalized = await dependencies.finalizeResend({
    emailKey,
    reservationId: reservation.reservationId,
  });
  if (!finalized) {
    return jsonResponse({ status: "temporary_failure" });
  }

  const now = dependencies.now();
  return jsonResponse({
    status: "sent",
    sentAt: now.toISOString(),
    resendAvailableAt: new Date(
      now.getTime() + RESEND_COOLDOWN_MS
    ).toISOString(),
    verificationExpiresAt: new Date(
      now.getTime() + VERIFICATION_CODE_TTL_MS
    ).toISOString(),
  });
}

export {
  RESEND_COOLDOWN_MS,
  VERIFICATION_CODE_TTL_MS,
  computeEmailVerificationKey,
  handleEmailVerificationResendRequest,
  normalizeVerificationEmail,
};

export type {
  EmailVerificationReservation,
  EmailVerificationResendDependencies,
  ResendDecisionCode,
  VerificationOperation,
};
