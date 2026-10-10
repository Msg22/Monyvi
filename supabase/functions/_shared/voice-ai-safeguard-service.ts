import { z } from "zod";

import type { Database } from "../../../packages/db/src/supabase-types.ts";
import {
  parseVoiceAvailabilitySnapshot,
  parseVoiceProviderStartDecision,
  parseVoiceQuotaRefusal,
  parseVoiceReservationDecision,
  type VoiceAvailabilitySnapshot,
  type VoiceEntitlementPolicy,
  type VoiceProviderStartDecision,
  type VoiceQuotaRefusal,
  type VoiceReservationDecision,
} from "./voice-ai-safeguard-contract.ts";

type VoiceSafeguardRpcName =
  | "voice_ai_get_availability"
  | "voice_ai_reserve_work"
  | "voice_ai_mark_provider_started"
  | "voice_ai_release_work"
  | "voice_ai_complete_work"
  | "voice_ai_cleanup_expired_requests";

export type VoiceSafeguardFunctionName = Extract<
  keyof Database["public"]["Functions"],
  VoiceSafeguardRpcName
>;

type AssertNoMissingVoiceRpc<T extends never> = T;

export type VoiceSafeguardGeneratedRpcCoverage = AssertNoMissingVoiceRpc<
  Exclude<VoiceSafeguardRpcName, keyof Database["public"]["Functions"]>
>;

type VoiceSafeguardArgs<Name extends VoiceSafeguardFunctionName> =
  Database["public"]["Functions"][Name]["Args"];

export interface VoiceSafeguardRpcClient {
  readonly rpc: <Name extends VoiceSafeguardFunctionName>(
    name: Name,
    params: VoiceSafeguardArgs<Name>
  ) => PromiseLike<{
    readonly data: unknown;
    readonly error: unknown;
  }>;
}

async function callRpc<Name extends VoiceSafeguardFunctionName>(
  client: VoiceSafeguardRpcClient,
  name: Name,
  params: VoiceSafeguardArgs<Name>
): Promise<unknown> {
  const { data, error } = await client.rpc(name, params);
  if (error) {
    throw new Error(`Voice safeguard RPC failed: ${name}`);
  }
  return data;
}

const availabilityRpcRowSchema = z
  .object({
    server_now: z.string(),
    time_zone: z.string(),
    window_started_at: z.string(),
    window_ends_at: z.string(),
    daily_limit: z.number().int().positive().nullable(),
    remaining: z.number().int().nonnegative().nullable(),
    reset_at: z.string().nullable(),
    reason: z.enum(["daily_limit", "burst_limit"]).nullable(),
    available_at: z.string().nullable(),
    burst_available_at: z.string().nullable(),
    policy_version: z.string(),
  })
  .strict();

const availabilityRpcResponseSchema = z.tuple([availabilityRpcRowSchema]);

export interface ReadVoiceAiAvailabilityInput {
  readonly userId: string;
  readonly timeZone: string;
  readonly policy: VoiceEntitlementPolicy;
}

export async function readVoiceAiAvailability(
  client: VoiceSafeguardRpcClient,
  input: ReadVoiceAiAvailabilityInput
): Promise<VoiceAvailabilitySnapshot> {
  const params: VoiceSafeguardArgs<"voice_ai_get_availability"> =
    input.policy.dailyLimit === null
      ? {
          p_user_id: input.userId,
          p_time_zone: input.timeZone,
          p_mode: input.policy.mode,
          p_burst_limit: input.policy.burstLimit,
          p_burst_window_seconds: input.policy.burstWindowSeconds,
          p_policy_version: input.policy.policyVersion,
        }
      : {
          p_user_id: input.userId,
          p_time_zone: input.timeZone,
          p_mode: input.policy.mode,
          p_burst_limit: input.policy.burstLimit,
          p_burst_window_seconds: input.policy.burstWindowSeconds,
          p_policy_version: input.policy.policyVersion,
          p_daily_limit: input.policy.dailyLimit,
        };

  const raw = await callRpc(client, "voice_ai_get_availability", params);
  const [row] = availabilityRpcResponseSchema.parse(raw);

  // Internal SQL window bounds deliberately stay server-only.
  return parseVoiceAvailabilitySnapshot({
    serverNow: row.server_now,
    timeZone: row.time_zone,
    dailyLimit: row.daily_limit,
    remaining: row.remaining,
    resetAt: row.reset_at,
    reason: row.reason,
    availableAt: row.available_at,
    burstAvailableAt: row.burst_available_at,
    policyVersion: row.policy_version,
  });
}

export interface ReserveVoiceAiWorkInput {
  readonly userId: string;
  readonly requestKey: string;
  readonly timeZone: string;
  readonly policy: VoiceEntitlementPolicy;
}

export async function reserveVoiceAiWork(
  client: VoiceSafeguardRpcClient,
  input: ReserveVoiceAiWorkInput
): Promise<VoiceReservationDecision> {
  const params: VoiceSafeguardArgs<"voice_ai_reserve_work"> =
    input.policy.dailyLimit === null
      ? {
          p_user_id: input.userId,
          p_request_key: input.requestKey,
          p_time_zone: input.timeZone,
          p_mode: input.policy.mode,
          p_burst_limit: input.policy.burstLimit,
          p_burst_window_seconds: input.policy.burstWindowSeconds,
          p_reservation_lease_seconds: input.policy.reservationLeaseSeconds,
          p_policy_version: input.policy.policyVersion,
        }
      : {
          p_user_id: input.userId,
          p_request_key: input.requestKey,
          p_time_zone: input.timeZone,
          p_mode: input.policy.mode,
          p_burst_limit: input.policy.burstLimit,
          p_burst_window_seconds: input.policy.burstWindowSeconds,
          p_reservation_lease_seconds: input.policy.reservationLeaseSeconds,
          p_policy_version: input.policy.policyVersion,
          p_daily_limit: input.policy.dailyLimit,
        };

  return parseVoiceReservationDecision(
    await callRpc(client, "voice_ai_reserve_work", params)
  );
}

export interface MarkVoiceAiProviderStartedInput {
  readonly userId: string;
  readonly requestId: string;
  readonly timeZone: string;
  readonly policy: VoiceEntitlementPolicy;
}

export async function markVoiceAiProviderStarted(
  client: VoiceSafeguardRpcClient,
  input: MarkVoiceAiProviderStartedInput
): Promise<VoiceProviderStartDecision> {
  const params: VoiceSafeguardArgs<"voice_ai_mark_provider_started"> =
    input.policy.dailyLimit === null
      ? {
          p_user_id: input.userId,
          p_request_id: input.requestId,
          p_time_zone: input.timeZone,
          p_mode: input.policy.mode,
          p_burst_limit: input.policy.burstLimit,
          p_burst_window_seconds: input.policy.burstWindowSeconds,
          p_policy_version: input.policy.policyVersion,
        }
      : {
          p_user_id: input.userId,
          p_request_id: input.requestId,
          p_time_zone: input.timeZone,
          p_mode: input.policy.mode,
          p_burst_limit: input.policy.burstLimit,
          p_burst_window_seconds: input.policy.burstWindowSeconds,
          p_policy_version: input.policy.policyVersion,
          p_daily_limit: input.policy.dailyLimit,
        };

  return parseVoiceProviderStartDecision(
    await callRpc(client, "voice_ai_mark_provider_started", params)
  );
}

export async function releaseVoiceAiWork(
  client: VoiceSafeguardRpcClient,
  input: {
    readonly userId: string;
    readonly requestId: string;
    readonly decisionCode: string;
  }
): Promise<boolean> {
  const params: VoiceSafeguardArgs<"voice_ai_release_work"> = {
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_decision_code: input.decisionCode,
  };

  return (await callRpc(client, "voice_ai_release_work", params)) === true;
}

export async function completeVoiceAiWork(
  client: VoiceSafeguardRpcClient,
  input: {
    readonly userId: string;
    readonly requestId: string;
    readonly completedWithProviderError: boolean;
    readonly decisionCode: string;
  }
): Promise<boolean> {
  const params: VoiceSafeguardArgs<"voice_ai_complete_work"> = {
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_completed_with_provider_error: input.completedWithProviderError,
    p_decision_code: input.decisionCode,
  };

  return (await callRpc(client, "voice_ai_complete_work", params)) === true;
}

type DecisionAvailability = Pick<
  VoiceReservationDecision,
  | "serverNow"
  | "timeZone"
  | "dailyLimit"
  | "remaining"
  | "resetAt"
  | "availableAt"
  | "burstAvailableAt"
  | "policyVersion"
>;

export function getVoiceAvailabilityFromDecision(
  decision: DecisionAvailability
): VoiceAvailabilitySnapshot {
  const reason =
    decision.dailyLimit !== null &&
    decision.remaining === 0 &&
    decision.resetAt !== null &&
    decision.availableAt === decision.resetAt &&
    decision.burstAvailableAt === null
      ? "daily_limit"
      : decision.burstAvailableAt !== null &&
          decision.availableAt === decision.burstAvailableAt
        ? "burst_limit"
        : null;

  return parseVoiceAvailabilitySnapshot({
    serverNow: decision.serverNow,
    timeZone: decision.timeZone,
    dailyLimit: decision.dailyLimit,
    remaining: decision.remaining,
    resetAt: decision.resetAt,
    reason,
    availableAt: decision.availableAt,
    burstAvailableAt: decision.burstAvailableAt,
    policyVersion: decision.policyVersion,
  });
}

export function getVoiceQuotaRefusal(
  decision: VoiceReservationDecision | VoiceProviderStartDecision
): VoiceQuotaRefusal {
  const availability = getVoiceAvailabilityFromDecision(decision);

  const reason =
    decision.decisionCode === "daily_limit" &&
    availability.reason === "daily_limit"
      ? "daily_limit"
      : decision.decisionCode === "burst_limit" &&
          availability.reason === "burst_limit"
        ? "burst_limit"
        : "already_processed_result_unavailable";

  return parseVoiceQuotaRefusal({
    error: "Voice request unavailable",
    reason,
    availability,
  });
}
