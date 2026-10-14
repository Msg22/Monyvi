import { z } from "zod";

import {
  voiceTimeZoneSchema,
  type VoiceAvailabilitySnapshot,
} from "./voice-ai-safeguard-contract.ts";

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z
  .object({
    timeZone: voiceTimeZoneSchema,
  })
  .strict();

export interface VoiceAiAvailabilityHandlerDependencies {
  readonly authenticate: (request: Request) => Promise<string | null>;
  readonly hasConsent: (userId: string) => Promise<boolean>;
  readonly getAvailability: (
    userId: string,
    timeZone: string
  ) => Promise<VoiceAvailabilitySnapshot>;
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(error: string, status: number): Response {
  return jsonResponse({ error }, status);
}

export async function handleVoiceAiAvailabilityRequest(
  request: Request,
  dependencies: VoiceAiAvailabilityHandlerDependencies
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const userId = await dependencies.authenticate(request);
    if (userId === null) {
      return errorResponse("Unauthorized", 401);
    }

    if (!(await dependencies.hasConsent(userId))) {
      return errorResponse("AI processing consent required", 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Invalid request body", 400);
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("`timeZone` must be a valid IANA timezone.", 400);
    }

    return jsonResponse(
      await dependencies.getAvailability(userId, parsed.data.timeZone),
      200
    );
  } catch {
    return errorResponse("Authoritative voice availability unavailable", 503);
  }
}
