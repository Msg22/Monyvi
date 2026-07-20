import { z } from "zod";

import { supabase } from "./supabase";

const SmsAiAvailabilityResponseSchema = z
  .object({
    serverNow: z.string().datetime(),
    reason: z.string().nullable(),
    availableAt: z.string().datetime().nullable(),
    blockers: z.unknown(),
  })
  .strict();

export interface SmsAiAvailabilitySnapshot {
  readonly serverNow: string;
  readonly reason: string | null;
  readonly availableAt: string | null;
}

export async function getSmsAiAvailability(): Promise<SmsAiAvailabilitySnapshot> {
  const response = await supabase.functions.invoke("sms-ai-availability", {
    method: "GET",
  });
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
  };
}
