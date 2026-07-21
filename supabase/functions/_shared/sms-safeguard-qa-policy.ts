import {
  DEFAULT_SMS_SAFEGUARD_POLICY,
  parseSmsSafeguardPolicy,
  type SmsSafeguardPolicy,
} from "./sms-safeguard-policy.ts";

interface QaPolicyOverride {
  readonly lookbackDays?: number;
  readonly checkpointOverlapMs?: number;
  readonly historyCooldownMs?: number;
  readonly negativeStrikeThreshold?: number;
  readonly fullParser?: Partial<SmsSafeguardPolicy["fullParser"]>;
  readonly categoryEnrichment?: Partial<
    SmsSafeguardPolicy["categoryEnrichment"]
  >;
}

const BASE_QA_POLICY_OVERRIDE = {
  lookbackDays: 2,
  checkpointOverlapMs: 30_000,
  historyCooldownMs: 120_000,
  negativeStrikeThreshold: 3,
  fullParser: {
    maxUnitsPerRequest: 2,
    maxUnitsPerScan: 4,
    maxUnitsPerRollingWindow: 4,
    rollingWindowMs: 300_000,
    maxPayloadBytes: 4_096,
    maxEstimatedInputTokens: 1_024,
    maxProviderStartsPerBurst: 2,
    burstWindowMs: 60_000,
  },
  categoryEnrichment: {
    maxUnitsPerRequest: 2,
    maxUnitsPerRollingWindow: 3,
    rollingWindowMs: 300_000,
    maxProviderStartsPerBurst: 2,
    burstWindowMs: 60_000,
  },
} as const;

const PROFILE_OVERRIDES: Readonly<Record<string, QaPolicyOverride>> =
  Object.freeze({
    "cutoff-boundary-v1": { lookbackDays: 1 },
    "checkpoint-overlap-v1": { checkpointOverlapMs: 60_000 },
    "partial-quota-v1": {
      fullParser: {
        maxUnitsPerRequest: 2,
        maxUnitsPerScan: 3,
        maxUnitsPerRollingWindow: 3,
      },
    },
    "rolling-expiry-v1": { fullParser: { rollingWindowMs: 120_000 } },
    "shared-batch-live-v1": {
      fullParser: { maxUnitsPerRollingWindow: 3 },
    },
    "burst-limit-v1": {
      fullParser: {
        maxProviderStartsPerBurst: 1,
        burstWindowMs: 60_000,
      },
    },
    "history-cooldown-v1": {
      historyCooldownMs: 120_000,
      fullParser: {
        maxUnitsPerScan: 8,
        maxUnitsPerRollingWindow: 8,
        maxProviderStartsPerBurst: 8,
      },
    },
    "oversized-candidate-v1": {
      fullParser: { maxPayloadBytes: 512, maxEstimatedInputTokens: 128 },
    },
    "response-validity-v1": {
      fullParser: {
        maxUnitsPerScan: 16,
        maxUnitsPerRollingWindow: 16,
        maxProviderStartsPerBurst: 16,
      },
    },
    "negative-three-strikes-v1": { negativeStrikeThreshold: 3 },
    "terminal-fresh-install-v1": {},
    "trusted-local-recovery-v1": {},
    "account-switch-v1": {},
    "consent-required-v1": {},
    "prompt-token-baseline-v1": {
      fullParser: { maxPayloadBytes: 128, maxEstimatedInputTokens: 32 },
    },
  });

export function getSafeguardQaPolicyAtEdge(
  profileId: string
): SmsSafeguardPolicy {
  const profileOverride = PROFILE_OVERRIDES[profileId];
  if (profileOverride === undefined) {
    throw new Error("SMS safeguard QA profile is not recognized.");
  }
  return parseSmsSafeguardPolicy({
    ...DEFAULT_SMS_SAFEGUARD_POLICY,
    ...BASE_QA_POLICY_OVERRIDE,
    ...profileOverride,
    fullParser: {
      ...DEFAULT_SMS_SAFEGUARD_POLICY.fullParser,
      ...BASE_QA_POLICY_OVERRIDE.fullParser,
      ...profileOverride.fullParser,
    },
    categoryEnrichment: {
      ...DEFAULT_SMS_SAFEGUARD_POLICY.categoryEnrichment,
      ...BASE_QA_POLICY_OVERRIDE.categoryEnrichment,
      ...profileOverride.categoryEnrichment,
    },
  });
}
