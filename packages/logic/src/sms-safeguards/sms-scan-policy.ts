import { z } from "zod";

const capabilityPolicySchema = z
  .object({
    isEnabled: z.boolean(),
    maxUnitsPerRequest: z.number().int().positive(),
    maxUnitsPerRollingWindow: z.number().int().positive(),
    rollingWindowMs: z.number().int().positive(),
    maxProviderStartsPerBurst: z.number().int().positive(),
    burstWindowMs: z.number().int().positive(),
  })
  .strict();

const fullParserPolicySchema = capabilityPolicySchema
  .extend({
    maxUnitsPerScan: z.number().int().positive(),
    maxPayloadBytes: z.number().int().positive(),
    maxEstimatedInputTokens: z.number().int().positive(),
  })
  .refine(
    (value) => value.maxUnitsPerScan >= value.maxUnitsPerRequest,
    "Scan allowance must cover at least one request"
  );

export const smsScanPolicySchema = z
  .object({
    version: z.number().int().positive(),
    processingPolicyVersion: z.number().int().positive(),
    lookbackDays: z.number().int().positive(),
    checkpointOverlapMs: z.number().int().nonnegative(),
    canSelectCustomRange: z.boolean(),
    historyRescanEnabled: z.boolean(),
    historyCooldownMs: z.number().int().positive(),
    reservationLeaseMs: z.number().int().positive(),
    negativeStrikeThreshold: z.number().int().min(2).max(10),
    fullParser: fullParserPolicySchema,
    categoryEnrichment: capabilityPolicySchema,
  })
  .strict();

export type SmsScanPolicy = Readonly<z.infer<typeof smsScanPolicySchema>>;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const DEFAULT_SMS_SCAN_POLICY: SmsScanPolicy = Object.freeze({
  version: 1,
  processingPolicyVersion: 1,
  lookbackDays: 30,
  checkpointOverlapMs: 5 * MINUTE_MS,
  canSelectCustomRange: false,
  historyRescanEnabled: true,
  historyCooldownMs: DAY_MS,
  reservationLeaseMs: 5 * MINUTE_MS,
  negativeStrikeThreshold: 3,
  fullParser: Object.freeze({
    isEnabled: true,
    maxUnitsPerRequest: 50,
    maxUnitsPerScan: 200,
    maxUnitsPerRollingWindow: 200,
    rollingWindowMs: DAY_MS,
    maxPayloadBytes: 128 * 1024,
    maxEstimatedInputTokens: 32_000,
    maxProviderStartsPerBurst: 30,
    burstWindowMs: MINUTE_MS,
  }),
  categoryEnrichment: Object.freeze({
    isEnabled: true,
    maxUnitsPerRequest: 20,
    maxUnitsPerRollingWindow: 100,
    rollingWindowMs: DAY_MS,
    maxProviderStartsPerBurst: 30,
    burstWindowMs: MINUTE_MS,
  }),
});

export const SMS_REFUSAL_PRECEDENCE = Object.freeze([
  "unauthenticated",
  "consent_required",
  "capability_disabled",
  "malformed_request",
  "terminal_outcome",
  "candidate_too_large",
  "request_limit",
  "scan_limit",
  "rolling_limit",
  "burst_limit",
  "history_cooldown",
  "dependency_unavailable",
] as const);

export function parseSmsScanPolicy(value: unknown): SmsScanPolicy {
  return smsScanPolicySchema.parse(value);
}
