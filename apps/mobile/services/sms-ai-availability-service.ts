import { z } from "zod";

import { invokeAuthenticatedEdgeFunction } from "./authenticated-edge-function-service";

const SmsAiAvailabilityBlockerSchema = z
  .object({
    availableAt: z.string().datetime({ offset: true }).nullable(),
  })
  .passthrough();

const SmsAiAvailabilityResponseSchema = z
  .object({
    serverNow: z.string().datetime({ offset: true }),
    reason: z.string().nullable(),
    availableAt: z.string().datetime({ offset: true }).nullable(),
    blockers: z
      .object({
        historyCooldown: SmsAiAvailabilityBlockerSchema,
      })
      .passthrough(),
  })
  .strict();

export interface SmsAiAvailabilitySnapshot {
  readonly serverNow: string;
  readonly reason: string | null;
  readonly availableAt: string | null;
  readonly historyCooldownAvailableAt: string | null;
}

export async function getSmsAiAvailability(): Promise<SmsAiAvailabilitySnapshot> {
  const response = await invokeAuthenticatedEdgeFunction<unknown>(
    "sms-ai-availability",
    {
      method: "GET",
    }
  );
  if (response.error) {
    throw new Error("SMS AI availability request failed");
  }

  const parsed = SmsAiAvailabilityResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error("Invalid SMS AI availability response");
  }

  return {
    serverNow: parsed.data.serverNow,
    reason: parsed.data.reason,
    availableAt: parsed.data.availableAt,
    historyCooldownAvailableAt:
      parsed.data.blockers.historyCooldown.availableAt,
  };
}
