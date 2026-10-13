import { z } from "zod";

export const VOICE_REQUEST_KEY_MIN_LENGTH = 1;
export const VOICE_REQUEST_KEY_MAX_LENGTH = 160;
export const VOICE_TIME_ZONE_MIN_LENGTH = 1;
export const VOICE_TIME_ZONE_MAX_LENGTH = 128;

const FIXED_OFFSET_TIME_ZONE =
  /^(?:[+-]\d{2}(?::?\d{2})?|(?:UTC|GMT)[+-]\d{1,2}(?::?\d{2})?)$/i;

const isoTimestampSchema = z.string().datetime({ offset: true });
const nullableIsoTimestampSchema = isoTimestampSchema.nullable();

const policyVersionSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.trim() === value && value.length > 0,
    "Expected a non-empty policy version"
  );

export const voiceRequestKeySchema = z
  .string()
  .min(VOICE_REQUEST_KEY_MIN_LENGTH)
  .max(VOICE_REQUEST_KEY_MAX_LENGTH);

function isValidIanaTimeZone(value: string): boolean {
  if (value.trim() !== value || FIXED_OFFSET_TIME_ZONE.test(value)) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export const voiceTimeZoneSchema = z
  .string()
  .min(VOICE_TIME_ZONE_MIN_LENGTH)
  .max(VOICE_TIME_ZONE_MAX_LENGTH)
  .refine(isValidIanaTimeZone, "Expected a valid IANA timezone");

const meteredVoiceEntitlementPolicySchema = z
  .object({
    mode: z.literal("metered"),
    dailyLimit: z.number().int().positive(),
    burstLimit: z.number().int().positive(),
    burstWindowSeconds: z.number().int().positive(),
    reservationLeaseSeconds: z.number().int().positive(),
    policyVersion: policyVersionSchema,
    source: z.enum(["free_launch", "subscription"]),
  })
  .strict();

const unmeteredVoiceEntitlementPolicySchema = z
  .object({
    mode: z.literal("unmetered"),
    dailyLimit: z.null(),
    burstLimit: z.number().int().positive(),
    burstWindowSeconds: z.number().int().positive(),
    reservationLeaseSeconds: z.number().int().positive(),
    policyVersion: policyVersionSchema,
    source: z.literal("subscription"),
  })
  .strict();

export const voiceEntitlementPolicySchema = z.discriminatedUnion("mode", [
  meteredVoiceEntitlementPolicySchema,
  unmeteredVoiceEntitlementPolicySchema,
]);

export type VoiceEntitlementPolicy = z.infer<
  typeof voiceEntitlementPolicySchema
>;

const availabilityReasonSchema = z
  .enum(["daily_limit", "burst_limit"])
  .nullable();

const voiceAvailabilitySnapshotBaseSchema = z
  .object({
    serverNow: isoTimestampSchema,
    timeZone: voiceTimeZoneSchema,
    dailyLimit: z.number().int().positive().nullable(),
    remaining: z.number().int().nonnegative().nullable(),
    resetAt: nullableIsoTimestampSchema,
    reason: availabilityReasonSchema,
    availableAt: nullableIsoTimestampSchema,
    burstAvailableAt: nullableIsoTimestampSchema,
    policyVersion: policyVersionSchema,
  })
  .strict();

type VoiceAvailabilityFields = z.infer<
  typeof voiceAvailabilitySnapshotBaseSchema
>;

function addIssue(
  context: z.RefinementCtx,
  message: string,
  path: readonly PropertyKey[] = []
): void {
  context.addIssue({
    code: "custom",
    message,
    path: [...path],
  });
}

function hasConsistentDailyTriplet(
  value: {
    readonly dailyLimit: number | null;
    readonly remaining: number | null;
    readonly resetAt: string | null;
  },
  context: z.RefinementCtx
): boolean {
  const allNull =
    value.dailyLimit === null &&
    value.remaining === null &&
    value.resetAt === null;

  const allMetered =
    value.dailyLimit !== null &&
    value.remaining !== null &&
    value.resetAt !== null;

  if (!allNull && !allMetered) {
    addIssue(
      context,
      "dailyLimit, remaining and resetAt must be null together",
      ["dailyLimit"]
    );
    return false;
  }

  if (
    allMetered &&
    value.remaining !== null &&
    value.dailyLimit !== null &&
    value.remaining > value.dailyLimit
  ) {
    addIssue(context, "remaining must not exceed dailyLimit", ["remaining"]);
    return false;
  }

  return true;
}

function validateAvailabilitySnapshot(
  value: VoiceAvailabilityFields,
  context: z.RefinementCtx
): void {
  if (!hasConsistentDailyTriplet(value, context)) {
    return;
  }

  if (value.dailyLimit === null) {
    if (value.reason === "daily_limit") {
      addIssue(context, "Unmetered availability cannot be daily limited", [
        "reason",
      ]);
      return;
    }

    if (value.reason === "burst_limit") {
      if (
        value.burstAvailableAt === null ||
        value.availableAt !== value.burstAvailableAt
      ) {
        addIssue(
          context,
          "Burst-limited availability requires its burst boundary",
          ["burstAvailableAt"]
        );
      }
      return;
    }

    if (value.availableAt !== null || value.burstAvailableAt !== null) {
      addIssue(
        context,
        "Available unmetered state cannot expose an unblock boundary",
        ["availableAt"]
      );
    }
    return;
  }

  if (value.remaining === 0) {
    if (
      value.reason !== "daily_limit" ||
      value.resetAt === null ||
      value.availableAt !== value.resetAt ||
      value.burstAvailableAt !== null
    ) {
      addIssue(
        context,
        "Zero remaining requires authoritative daily-limit state",
        ["remaining"]
      );
    }
    return;
  }

  if (value.reason === "daily_limit") {
    addIssue(context, "Daily-limit reason requires zero remaining", ["reason"]);
    return;
  }

  if (value.reason === "burst_limit") {
    if (
      value.burstAvailableAt === null ||
      value.availableAt !== value.burstAvailableAt
    ) {
      addIssue(
        context,
        "Burst-limited availability requires its burst boundary",
        ["burstAvailableAt"]
      );
    }
    return;
  }

  if (value.availableAt !== null || value.burstAvailableAt !== null) {
    addIssue(context, "Available state cannot expose an unblock boundary", [
      "availableAt",
    ]);
  }
}

export const voiceAvailabilitySnapshotSchema =
  voiceAvailabilitySnapshotBaseSchema.superRefine(validateAvailabilitySnapshot);

export type VoiceAvailabilitySnapshot = z.infer<
  typeof voiceAvailabilitySnapshotSchema
>;

const rpcAvailabilityFieldsSchema = z
  .object({
    server_now: isoTimestampSchema,
    time_zone: voiceTimeZoneSchema,
    daily_limit: z.number().int().positive().nullable(),
    remaining: z.number().int().nonnegative().nullable(),
    reset_at: nullableIsoTimestampSchema,
    available_at: nullableIsoTimestampSchema,
    burst_available_at: nullableIsoTimestampSchema,
    policy_version: policyVersionSchema,
  })
  .strict();

type RpcAvailabilityFields = z.infer<typeof rpcAvailabilityFieldsSchema>;

function validateRpcNextAvailability(
  value: RpcAvailabilityFields,
  context: z.RefinementCtx
): void {
  const normalized = {
    dailyLimit: value.daily_limit,
    remaining: value.remaining,
    resetAt: value.reset_at,
  };

  if (!hasConsistentDailyTriplet(normalized, context)) {
    return;
  }

  if (value.daily_limit === null) {
    if (value.burst_available_at === null) {
      if (value.available_at !== null) {
        addIssue(
          context,
          "Unmetered RPC state has an unexplained available_at",
          ["available_at"]
        );
      }
      return;
    }

    if (value.available_at !== value.burst_available_at) {
      addIssue(
        context,
        "Unmetered burst boundary must be authoritative available_at",
        ["available_at"]
      );
    }
    return;
  }

  if (value.remaining === 0) {
    if (
      value.reset_at === null ||
      value.available_at !== value.reset_at ||
      value.burst_available_at !== null
    ) {
      addIssue(
        context,
        "Zero remaining RPC state must expose the daily reset boundary",
        ["remaining"]
      );
    }
    return;
  }

  if (value.burst_available_at !== null) {
    if (value.available_at !== value.burst_available_at) {
      addIssue(context, "Burst boundary must be authoritative available_at", [
        "available_at",
      ]);
    }
    return;
  }

  if (value.available_at !== null) {
    addIssue(context, "RPC state has an unexplained available_at", [
      "available_at",
    ]);
  }
}

const reservationDecisionCodeSchema = z.enum([
  "accepted",
  "daily_limit",
  "burst_limit",
  "already_processed_result_unavailable",
]);

const providerStartDecisionCodeSchema = z.enum([
  "provider_started",
  "daily_limit",
  "burst_limit",
  "reservation_expired",
  "already_processed_result_unavailable",
]);

const rpcAvailabilityShape = rpcAvailabilityFieldsSchema.shape;

export const voiceReservationRpcRowSchema = z
  .object({
    request_id: z.string().uuid(),
    accepted: z.boolean(),
    decision_code: reservationDecisionCodeSchema,
    is_replay: z.boolean(),
    ...rpcAvailabilityShape,
    reservation_expires_at: nullableIsoTimestampSchema,
  })
  .strict()
  .superRefine((value, context): void => {
    validateRpcNextAvailability(value, context);

    if (value.accepted !== (value.decision_code === "accepted")) {
      addIssue(context, "Reservation accepted flag contradicts decision code", [
        "accepted",
      ]);
    }

    if (value.accepted && value.reservation_expires_at === null) {
      addIssue(
        context,
        "Accepted reservation requires an expiration timestamp",
        ["reservation_expires_at"]
      );
    }

    if (!value.accepted && value.reservation_expires_at !== null) {
      addIssue(
        context,
        "Refused reservation cannot retain an expiration timestamp",
        ["reservation_expires_at"]
      );
    }

    if (
      value.decision_code === "already_processed_result_unavailable" &&
      !value.is_replay
    ) {
      addIssue(
        context,
        "Already-processed reservation decision requires replay",
        ["is_replay"]
      );
    }

    if (value.decision_code === "daily_limit") {
      if (value.daily_limit === null || value.remaining !== 0) {
        addIssue(
          context,
          "Daily-limit reservation decision requires zero remaining",
          ["decision_code"]
        );
      }
    }

    if (value.decision_code === "burst_limit") {
      if (
        value.burst_available_at === null ||
        (value.remaining !== null && value.remaining === 0)
      ) {
        addIssue(
          context,
          "Burst-limit reservation decision requires active burst blocking",
          ["decision_code"]
        );
      }
    }
  });

export type VoiceReservationRpcRow = z.infer<
  typeof voiceReservationRpcRowSchema
>;

export const voiceProviderStartRpcRowSchema = z
  .object({
    request_id: z.string().uuid(),
    started: z.boolean(),
    decision_code: providerStartDecisionCodeSchema,
    is_replay: z.boolean(),
    ...rpcAvailabilityShape,
  })
  .strict()
  .superRefine((value, context): void => {
    validateRpcNextAvailability(value, context);

    if (value.started !== (value.decision_code === "provider_started")) {
      addIssue(context, "Provider-start flag contradicts decision code", [
        "started",
      ]);
    }

    if (value.started && value.is_replay) {
      addIssue(context, "New provider start cannot be a replay", ["is_replay"]);
    }

    if (
      value.decision_code === "already_processed_result_unavailable" &&
      !value.is_replay
    ) {
      addIssue(
        context,
        "Already-processed provider-start decision requires replay",
        ["is_replay"]
      );
    }

    if (value.decision_code === "daily_limit") {
      if (value.daily_limit === null || value.remaining !== 0) {
        addIssue(
          context,
          "Daily-limit start decision requires zero remaining",
          ["decision_code"]
        );
      }
    }

    if (value.decision_code === "burst_limit") {
      if (
        value.burst_available_at === null ||
        (value.remaining !== null && value.remaining === 0)
      ) {
        addIssue(
          context,
          "Burst-limit start decision requires active burst blocking",
          ["decision_code"]
        );
      }
    }
  });

export type VoiceProviderStartRpcRow = z.infer<
  typeof voiceProviderStartRpcRowSchema
>;

export const voiceReservationDecisionSchema =
  voiceReservationRpcRowSchema.transform((row) => ({
    requestId: row.request_id,
    accepted: row.accepted,
    decisionCode: row.decision_code,
    isReplay: row.is_replay,
    serverNow: row.server_now,
    timeZone: row.time_zone,
    dailyLimit: row.daily_limit,
    remaining: row.remaining,
    resetAt: row.reset_at,
    availableAt: row.available_at,
    burstAvailableAt: row.burst_available_at,
    reservationExpiresAt: row.reservation_expires_at,
    policyVersion: row.policy_version,
  }));

export type VoiceReservationDecision = z.infer<
  typeof voiceReservationDecisionSchema
>;

export const voiceProviderStartDecisionSchema =
  voiceProviderStartRpcRowSchema.transform((row) => ({
    requestId: row.request_id,
    started: row.started,
    decisionCode: row.decision_code,
    isReplay: row.is_replay,
    serverNow: row.server_now,
    timeZone: row.time_zone,
    dailyLimit: row.daily_limit,
    remaining: row.remaining,
    resetAt: row.reset_at,
    availableAt: row.available_at,
    burstAvailableAt: row.burst_available_at,
    policyVersion: row.policy_version,
  }));

export type VoiceProviderStartDecision = z.infer<
  typeof voiceProviderStartDecisionSchema
>;

export const voiceQuotaRefusalSchema = z
  .object({
    error: z.string().min(1),
    reason: z.enum([
      "daily_limit",
      "burst_limit",
      "already_processed_result_unavailable",
    ]),
    availability: voiceAvailabilitySnapshotSchema,
  })
  .strict()
  .superRefine((value, context): void => {
    if (
      value.reason === "daily_limit" &&
      value.availability.reason !== "daily_limit"
    ) {
      addIssue(context, "Daily refusal requires daily-limit availability", [
        "availability",
        "reason",
      ]);
    }

    if (
      value.reason === "burst_limit" &&
      value.availability.reason !== "burst_limit"
    ) {
      addIssue(context, "Burst refusal requires burst-limit availability", [
        "availability",
        "reason",
      ]);
    }
  });

export type VoiceQuotaRefusal = z.infer<typeof voiceQuotaRefusalSchema>;

const voiceReservationRpcResponseSchema = z.tuple([
  voiceReservationDecisionSchema,
]);

const voiceProviderStartRpcResponseSchema = z.tuple([
  voiceProviderStartDecisionSchema,
]);

export function parseVoiceEntitlementPolicy(
  value: unknown
): VoiceEntitlementPolicy {
  const parsed = voiceEntitlementPolicySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid Voice entitlement policy");
  }
  return parsed.data;
}

export function parseVoiceAvailabilitySnapshot(
  value: unknown
): VoiceAvailabilitySnapshot {
  const parsed = voiceAvailabilitySnapshotSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid Voice availability snapshot");
  }
  return parsed.data;
}

export function parseVoiceReservationDecision(
  value: unknown
): VoiceReservationDecision {
  const parsed = voiceReservationRpcResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid Voice reservation RPC response");
  }
  return parsed.data[0];
}

export function parseVoiceProviderStartDecision(
  value: unknown
): VoiceProviderStartDecision {
  const parsed = voiceProviderStartRpcResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid Voice provider-start RPC response");
  }
  return parsed.data[0];
}

export function parseVoiceQuotaRefusal(value: unknown): VoiceQuotaRefusal {
  const parsed = voiceQuotaRefusalSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid Voice quota refusal");
  }
  return parsed.data;
}
