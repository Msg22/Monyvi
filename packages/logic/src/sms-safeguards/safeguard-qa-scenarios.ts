import { z } from "zod";

export const REQUIRED_SAFEGUARD_QA_PROFILE_IDS = Object.freeze([
  "cutoff-boundary-v1",
  "checkpoint-overlap-v1",
  "partial-quota-v1",
  "rolling-expiry-v1",
  "shared-batch-live-v1",
  "burst-limit-v1",
  "history-cooldown-v1",
  "oversized-candidate-v1",
  "response-validity-v1",
  "negative-three-strikes-v1",
  "terminal-fresh-install-v1",
  "trusted-local-recovery-v1",
  "account-switch-v1",
  "consent-required-v1",
  "prompt-token-baseline-v1",
] as const);

export type SafeguardQaProfileId =
  (typeof REQUIRED_SAFEGUARD_QA_PROFILE_IDS)[number];

export const SAFEGUARD_QA_FIXED_NOW_MS = Date.UTC(2026, 6, 20, 12, 0, 0);

export const SAFEGUARD_QA_RESET_SCOPES = Object.freeze([
  "usage",
  "cooldowns",
  "request-identities",
  "checkpoints",
  "local-outcomes",
  "synchronized-outcomes",
  "fixture-state",
] as const);

const safeguardQaPolicyOverridesSchema = z
  .object({
    lookbackDays: z.number().int().positive(),
    checkpointOverlapMs: z.number().int().nonnegative(),
    historyCooldownMs: z.number().int().positive(),
    negativeStrikeThreshold: z.number().int().min(2).max(10),
    fullParser: z
      .object({
        maxUnitsPerRequest: z.number().int().positive(),
        maxUnitsPerScan: z.number().int().positive(),
        maxUnitsPerRollingWindow: z.number().int().positive(),
        rollingWindowMs: z.number().int().positive(),
        maxPayloadBytes: z.number().int().positive(),
        maxEstimatedInputTokens: z.number().int().positive(),
        maxProviderStartsPerBurst: z.number().int().positive(),
        burstWindowMs: z.number().int().positive(),
      })
      .strict(),
    categoryEnrichment: z
      .object({
        maxUnitsPerRequest: z.number().int().positive(),
        maxUnitsPerRollingWindow: z.number().int().positive(),
        rollingWindowMs: z.number().int().positive(),
        maxProviderStartsPerBurst: z.number().int().positive(),
        burstWindowMs: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()
  .refine(
    ({ fullParser }) =>
      fullParser.maxUnitsPerScan >= fullParser.maxUnitsPerRequest,
    "Scan allowance must cover at least one request"
  );

export type SafeguardQaPolicyOverrides = Readonly<
  z.infer<typeof safeguardQaPolicyOverridesSchema>
>;

const safeguardQaResetSchema = z
  .object({
    mode: z.literal("scenario-namespace-only"),
    namespace: z.string().min(1),
    scopes: z.array(z.enum(SAFEGUARD_QA_RESET_SCOPES)),
  })
  .strict();

const safeguardQaExpectedFirstScanSchema = z
  .object({
    localResultCount: z.number().int().nonnegative(),
    aiResultCount: z.number().int().nonnegative(),
    deferredAiCount: z.number().int().nonnegative(),
    oversizedCount: z.number().int().nonnegative(),
  })
  .strict();

export const safeguardQaScenarioSchema = z
  .object({
    id: z.enum(REQUIRED_SAFEGUARD_QA_PROFILE_IDS),
    version: z.literal(1),
    fixedNowMs: z.literal(SAFEGUARD_QA_FIXED_NOW_MS),
    providerMode: z.literal("simulated"),
    inboxMode: z.literal("fixture"),
    diagnostic: z
      .object({
        purpose: z.string().min(1),
        expectedBoundary: z.string().min(1),
        expectedGuidance: z.string().min(1),
        mustNotHappen: z.string().min(1),
        expectedFirstScan: safeguardQaExpectedFirstScanSchema.optional(),
      })
      .strict(),
    reset: safeguardQaResetSchema,
    policyOverrides: safeguardQaPolicyOverridesSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const expectedNamespace = `sms-safeguard-qa:${value.id}`;
    if (value.reset.namespace !== expectedNamespace) {
      context.addIssue({
        code: "custom",
        message: "Reset namespace must belong to the selected scenario",
        path: ["reset", "namespace"],
      });
    }

    const hasExactResetScopes =
      value.reset.scopes.length === SAFEGUARD_QA_RESET_SCOPES.length &&
      SAFEGUARD_QA_RESET_SCOPES.every(
        (scope, index) => value.reset.scopes[index] === scope
      );
    if (!hasExactResetScopes) {
      context.addIssue({
        code: "custom",
        message: "Reset contract must include every namespaced safeguard store",
        path: ["reset", "scopes"],
      });
    }
  });

export type SafeguardQaScenario = Readonly<
  z.infer<typeof safeguardQaScenarioSchema>
>;

interface FullParserPolicyOverrideInput {
  readonly maxUnitsPerRequest?: number;
  readonly maxUnitsPerScan?: number;
  readonly maxUnitsPerRollingWindow?: number;
  readonly rollingWindowMs?: number;
  readonly maxPayloadBytes?: number;
  readonly maxEstimatedInputTokens?: number;
  readonly maxProviderStartsPerBurst?: number;
  readonly burstWindowMs?: number;
}

interface PolicyOverrideInput {
  readonly lookbackDays?: number;
  readonly checkpointOverlapMs?: number;
  readonly historyCooldownMs?: number;
  readonly negativeStrikeThreshold?: number;
  readonly fullParser?: FullParserPolicyOverrideInput;
  readonly categoryEnrichment?: Readonly<{
    readonly maxUnitsPerRequest?: number;
    readonly maxUnitsPerRollingWindow?: number;
    readonly rollingWindowMs?: number;
    readonly maxProviderStartsPerBurst?: number;
    readonly burstWindowMs?: number;
  }>;
}

const QA_SCENARIO_DIAGNOSTICS: Readonly<
  Record<
    SafeguardQaProfileId,
    Readonly<{
      purpose: string;
      expectedBoundary: string;
      expectedGuidance: string;
      mustNotHappen: string;
      expectedFirstScan?: Readonly<{
        localResultCount: number;
        aiResultCount: number;
        deferredAiCount: number;
        oversizedCount: number;
      }>;
    }>
  >
> = Object.freeze({
  "cutoff-boundary-v1": {
    purpose: "cutoff_boundary",
    expectedBoundary: "cutoff_boundary",
    expectedGuidance: "cutoff_boundary",
    mustNotHappen: "cutoff_boundary",
    expectedFirstScan: {
      localResultCount: 0,
      aiResultCount: 2,
      deferredAiCount: 0,
      oversizedCount: 0,
    },
  },
  "checkpoint-overlap-v1": {
    purpose: "checkpoint_overlap",
    expectedBoundary: "checkpoint_overlap",
    expectedGuidance: "checkpoint_overlap",
    mustNotHappen: "checkpoint_overlap",
    expectedFirstScan: {
      localResultCount: 1,
      aiResultCount: 3,
      deferredAiCount: 0,
      oversizedCount: 0,
    },
  },
  "partial-quota-v1": {
    purpose: "partial_quota",
    expectedBoundary: "scan_limit",
    expectedGuidance: "partial_quota",
    mustNotHappen: "partial_quota",
    expectedFirstScan: {
      localResultCount: 1,
      aiResultCount: 2,
      deferredAiCount: 2,
      oversizedCount: 0,
    },
  },
  "rolling-expiry-v1": {
    purpose: "rolling_expiry",
    expectedBoundary: "rolling_limit",
    expectedGuidance: "rolling_expiry",
    mustNotHappen: "rolling_expiry",
  },
  "shared-batch-live-v1": {
    purpose: "shared_batch_live",
    expectedBoundary: "rolling_limit",
    expectedGuidance: "shared_batch_live",
    mustNotHappen: "shared_batch_live",
  },
  "burst-limit-v1": {
    purpose: "burst_limit",
    expectedBoundary: "burst_limit",
    expectedGuidance: "burst_limit",
    mustNotHappen: "burst_limit",
  },
  "history-cooldown-v1": {
    purpose: "history_cooldown",
    expectedBoundary: "history_cooldown",
    expectedGuidance: "history_cooldown",
    mustNotHappen: "history_cooldown",
  },
  "oversized-candidate-v1": {
    purpose: "oversized_candidate",
    expectedBoundary: "candidate_too_large",
    expectedGuidance: "oversized_candidate",
    mustNotHappen: "oversized_candidate",
    expectedFirstScan: {
      localResultCount: 1,
      aiResultCount: 2,
      deferredAiCount: 0,
      oversizedCount: 1,
    },
  },
  "response-validity-v1": {
    purpose: "response_validity",
    expectedBoundary: "response_validity",
    expectedGuidance: "response_validity",
    mustNotHappen: "response_validity",
  },
  "negative-three-strikes-v1": {
    purpose: "negative_three_strikes",
    expectedBoundary: "negative_three_strikes",
    expectedGuidance: "negative_three_strikes",
    mustNotHappen: "negative_three_strikes",
  },
  "terminal-fresh-install-v1": {
    purpose: "terminal_fresh_install",
    expectedBoundary: "terminal_outcome",
    expectedGuidance: "terminal_fresh_install",
    mustNotHappen: "terminal_fresh_install",
  },
  "trusted-local-recovery-v1": {
    purpose: "trusted_local_recovery",
    expectedBoundary: "trusted_local_recovery",
    expectedGuidance: "trusted_local_recovery",
    mustNotHappen: "trusted_local_recovery",
  },
  "account-switch-v1": {
    purpose: "account_switch",
    expectedBoundary: "account_switch",
    expectedGuidance: "account_switch",
    mustNotHappen: "account_switch",
  },
  "consent-required-v1": {
    purpose: "consent_required",
    expectedBoundary: "consent_required",
    expectedGuidance: "consent_required",
    mustNotHappen: "consent_required",
  },
  "prompt-token-baseline-v1": {
    purpose: "prompt_token_baseline",
    expectedBoundary: "input_token_baseline",
    expectedGuidance: "prompt_token_baseline",
    mustNotHappen: "prompt_token_baseline",
  },
});

const BASE_POLICY_OVERRIDES = {
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

function deepFreeze(value: object): void {
  for (const key of Reflect.ownKeys(value)) {
    const nestedValue: unknown = Reflect.get(value, key);
    if (nestedValue !== null && typeof nestedValue === "object") {
      deepFreeze(nestedValue);
    }
  }
  Object.freeze(value);
}

function createPolicyOverrides(
  overrides: PolicyOverrideInput = {}
): SafeguardQaPolicyOverrides {
  return safeguardQaPolicyOverridesSchema.parse({
    ...BASE_POLICY_OVERRIDES,
    ...overrides,
    fullParser: {
      ...BASE_POLICY_OVERRIDES.fullParser,
      ...overrides.fullParser,
    },
    categoryEnrichment: {
      ...BASE_POLICY_OVERRIDES.categoryEnrichment,
      ...overrides.categoryEnrichment,
    },
  });
}

function createScenario(
  id: SafeguardQaProfileId,
  policyOverrides: PolicyOverrideInput = {}
): SafeguardQaScenario {
  return parseSafeguardQaScenario({
    id,
    version: 1,
    fixedNowMs: SAFEGUARD_QA_FIXED_NOW_MS,
    providerMode: "simulated",
    inboxMode: "fixture",
    diagnostic: QA_SCENARIO_DIAGNOSTICS[id],
    reset: {
      mode: "scenario-namespace-only",
      namespace: `sms-safeguard-qa:${id}`,
      scopes: SAFEGUARD_QA_RESET_SCOPES,
    },
    policyOverrides: createPolicyOverrides(policyOverrides),
  });
}

export const SAFEGUARD_QA_SCENARIOS: Readonly<
  Record<SafeguardQaProfileId, SafeguardQaScenario>
> = Object.freeze({
  "cutoff-boundary-v1": createScenario("cutoff-boundary-v1", {
    lookbackDays: 1,
  }),
  "checkpoint-overlap-v1": createScenario("checkpoint-overlap-v1", {
    checkpointOverlapMs: 60_000,
    fullParser: {
      maxUnitsPerScan: 8,
      maxUnitsPerRollingWindow: 8,
      maxProviderStartsPerBurst: 4,
    },
  }),
  "partial-quota-v1": createScenario("partial-quota-v1", {
    fullParser: {
      maxUnitsPerRequest: 2,
      maxUnitsPerScan: 3,
      maxUnitsPerRollingWindow: 3,
    },
  }),
  "rolling-expiry-v1": createScenario("rolling-expiry-v1", {
    fullParser: {
      rollingWindowMs: 120_000,
      maxProviderStartsPerBurst: 8,
    },
  }),
  "shared-batch-live-v1": createScenario("shared-batch-live-v1", {
    fullParser: { maxUnitsPerRollingWindow: 3 },
  }),
  "burst-limit-v1": createScenario("burst-limit-v1", {
    fullParser: {
      maxProviderStartsPerBurst: 1,
      burstWindowMs: 60_000,
    },
  }),
  "history-cooldown-v1": createScenario("history-cooldown-v1", {
    historyCooldownMs: 120_000,
    fullParser: {
      maxUnitsPerScan: 8,
      maxUnitsPerRollingWindow: 8,
      maxProviderStartsPerBurst: 8,
    },
  }),
  "oversized-candidate-v1": createScenario("oversized-candidate-v1", {
    fullParser: {
      maxPayloadBytes: 8_192,
      maxEstimatedInputTokens: 4_096,
    },
  }),
  "response-validity-v1": createScenario("response-validity-v1", {
    fullParser: {
      maxUnitsPerScan: 16,
      maxUnitsPerRollingWindow: 16,
      maxProviderStartsPerBurst: 16,
    },
  }),
  "negative-three-strikes-v1": createScenario("negative-three-strikes-v1", {
    negativeStrikeThreshold: 3,
  }),
  "terminal-fresh-install-v1": createScenario("terminal-fresh-install-v1"),
  "trusted-local-recovery-v1": createScenario("trusted-local-recovery-v1"),
  "account-switch-v1": createScenario("account-switch-v1"),
  "consent-required-v1": createScenario("consent-required-v1"),
  "prompt-token-baseline-v1": createScenario("prompt-token-baseline-v1", {
    fullParser: {
      maxPayloadBytes: 128,
      maxEstimatedInputTokens: 32,
    },
  }),
});

export function parseSafeguardQaScenario(value: unknown): SafeguardQaScenario {
  const scenario = safeguardQaScenarioSchema.parse(value);
  deepFreeze(scenario);
  return scenario;
}
