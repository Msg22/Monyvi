import type { SmsAiAvailabilitySnapshot } from "./sms-ai-safeguard-service.ts";

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export interface SmsAiAvailabilityHandlerDependencies {
  readonly authenticate: (request: Request) => Promise<string | null>;
  readonly hasConsent: (userId: string) => Promise<boolean>;
  readonly getAvailability: (
    userId: string
  ) => Promise<SmsAiAvailabilitySnapshot>;
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function unavailableResponse(reason: string, status: number): Response {
  return jsonResponse(
    { serverNow: null, blockers: null, reason, availableAt: null },
    status
  );
}

function toPublicResponse(snapshot: SmsAiAvailabilitySnapshot): Response {
  return jsonResponse(
    {
      serverNow: snapshot.serverNow,
      blockers: {
        rolling: { availableAt: snapshot.rollingAvailableAt },
        burst: { availableAt: snapshot.burstAvailableAt },
        historyCooldown: { availableAt: snapshot.historyCooldownAvailableAt },
      },
      reason: snapshot.reason,
      availableAt: snapshot.availableAt,
    },
    200
  );
}

export async function handleSmsAiAvailabilityRequest(
  request: Request,
  dependencies: SmsAiAvailabilityHandlerDependencies
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return unavailableResponse("method_not_allowed", 405);
  }

  try {
    const userId = await dependencies.authenticate(request);
    if (userId === null) {
      return unavailableResponse("unauthenticated", 401);
    }
    if (!(await dependencies.hasConsent(userId))) {
      return unavailableResponse("consent_required", 403);
    }
    return toPublicResponse(await dependencies.getAvailability(userId));
  } catch {
    return unavailableResponse("dependency_unavailable", 503);
  }
}
