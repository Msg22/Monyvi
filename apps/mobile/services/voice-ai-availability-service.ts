import {
  voiceAvailabilitySnapshotSchema,
  voiceTimeZoneSchema,
  type VoiceAvailabilitySnapshot,
} from "@monyvi/logic";

import {
  getEdgeFunctionErrorStatus,
  invokeAuthenticatedEdgeFunction,
  isEdgeFunctionAuthenticationError,
} from "./authenticated-edge-function-service";

export type VoiceAiAvailabilityErrorKind =
  | "invalid_time_zone"
  | "authentication_required"
  | "consent_required"
  | "unavailable"
  | "invalid_response";

export interface VoiceAiAvailabilityError extends Error {
  readonly kind: VoiceAiAvailabilityErrorKind;
  readonly status?: number;
}

interface VoiceAiAvailabilityRequestOptions {
  readonly signal?: AbortSignal;
}

function createVoiceAiAvailabilityError(
  kind: VoiceAiAvailabilityErrorKind,
  message: string,
  status?: number
): VoiceAiAvailabilityError {
  return Object.assign(new Error(message), {
    name: "VoiceAiAvailabilityError",
    kind,
    status,
  });
}

export function isVoiceAiAvailabilityError(
  error: unknown
): error is VoiceAiAvailabilityError {
  if (
    !(error instanceof Error) ||
    error.name !== "VoiceAiAvailabilityError" ||
    !("kind" in error)
  ) {
    return false;
  }

  return (
    error.kind === "invalid_time_zone" ||
    error.kind === "authentication_required" ||
    error.kind === "consent_required" ||
    error.kind === "unavailable" ||
    error.kind === "invalid_response"
  );
}

function mapHttpFailure(status: number | undefined): VoiceAiAvailabilityError {
  if (status === 400) {
    return createVoiceAiAvailabilityError(
      "invalid_time_zone",
      "Voice availability requires a valid device timezone.",
      status
    );
  }

  if (status === 401) {
    return createVoiceAiAvailabilityError(
      "authentication_required",
      "Authentication is required to check Voice availability.",
      status
    );
  }

  if (status === 403) {
    return createVoiceAiAvailabilityError(
      "consent_required",
      "AI processing consent is required.",
      status
    );
  }

  return createVoiceAiAvailabilityError(
    "unavailable",
    "Voice availability is temporarily unavailable.",
    status
  );
}

export async function getVoiceAiAvailability(
  timeZone: string,
  options: VoiceAiAvailabilityRequestOptions = {}
): Promise<VoiceAvailabilitySnapshot> {
  const parsedTimeZone = voiceTimeZoneSchema.safeParse(timeZone);
  if (!parsedTimeZone.success) {
    throw createVoiceAiAvailabilityError(
      "invalid_time_zone",
      "Voice availability requires a valid device timezone."
    );
  }

  try {
    const response = await invokeAuthenticatedEdgeFunction<unknown>(
      "voice-ai-availability",
      {
        method: "POST",
        body: {
          timeZone: parsedTimeZone.data,
        },
        signal: options.signal,
      }
    );

    if (response.error) {
      throw mapHttpFailure(getEdgeFunctionErrorStatus(response.error));
    }

    const parsedSnapshot = voiceAvailabilitySnapshotSchema.safeParse(
      response.data
    );

    if (!parsedSnapshot.success) {
      throw createVoiceAiAvailabilityError(
        "invalid_response",
        "Voice availability returned an invalid response."
      );
    }

    return parsedSnapshot.data;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    if (isVoiceAiAvailabilityError(error)) {
      throw error;
    }

    if (isEdgeFunctionAuthenticationError(error)) {
      throw createVoiceAiAvailabilityError(
        "authentication_required",
        "Authentication is required to check Voice availability.",
        401
      );
    }

    throw createVoiceAiAvailabilityError(
      "unavailable",
      "Voice availability is temporarily unavailable."
    );
  }
}
