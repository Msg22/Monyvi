import {
  REQUIRED_SAFEGUARD_QA_PROFILE_IDS,
  SAFEGUARD_QA_FIXED_NOW_MS,
  SAFEGUARD_QA_RESET_SCOPES,
  SAFEGUARD_QA_SCENARIOS,
  parseSafeguardQaScenario,
} from "../safeguard-qa-scenarios";

const REQUIRED_PROFILE_IDS = [
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
  "prompt-token-baseline-v1",
] as const;

describe("deterministic SMS safeguard QA scenarios", () => {
  it("provides exactly the named and versioned launch profiles", () => {
    expect(REQUIRED_SAFEGUARD_QA_PROFILE_IDS).toEqual(REQUIRED_PROFILE_IDS);
    expect(Object.keys(SAFEGUARD_QA_SCENARIOS)).toEqual(REQUIRED_PROFILE_IDS);

    for (const id of REQUIRED_PROFILE_IDS) {
      expect(SAFEGUARD_QA_SCENARIOS[id]).toMatchObject({
        id,
        version: 1,
        providerMode: "simulated",
        inboxMode: "fixture",
      });
    }
  });

  it("uses one explicit fixed clock and complete reduced policy boundaries", () => {
    expect(SAFEGUARD_QA_FIXED_NOW_MS).toBe(Date.UTC(2026, 6, 20, 12));

    for (const scenario of Object.values(SAFEGUARD_QA_SCENARIOS)) {
      expect(scenario.fixedNowMs).toBe(SAFEGUARD_QA_FIXED_NOW_MS);
      expect(Object.keys(scenario.policyOverrides)).toEqual([
        "lookbackDays",
        "checkpointOverlapMs",
        "historyCooldownMs",
        "negativeStrikeThreshold",
        "fullParser",
        "categoryEnrichment",
      ]);
      expect(Object.keys(scenario.policyOverrides.fullParser)).toEqual([
        "maxUnitsPerRequest",
        "maxUnitsPerScan",
        "maxUnitsPerRollingWindow",
        "rollingWindowMs",
        "maxPayloadBytes",
        "maxEstimatedInputTokens",
        "maxProviderStartsPerBurst",
        "burstWindowMs",
      ]);
      expect(
        Object.values(scenario.policyOverrides)
          .filter((value) => typeof value === "number")
          .every(Number.isInteger)
      ).toBe(true);
      expect(
        Object.values(scenario.policyOverrides.fullParser).every(
          Number.isInteger
        )
      ).toBe(true);
      expect(
        Object.values(scenario.policyOverrides.categoryEnrichment).every(
          Number.isInteger
        )
      ).toBe(true);
    }
  });

  it("defines targeted overrides for each deterministic safeguard family", () => {
    expect(
      SAFEGUARD_QA_SCENARIOS["cutoff-boundary-v1"].policyOverrides
    ).toMatchObject({ lookbackDays: 1 });
    expect(
      SAFEGUARD_QA_SCENARIOS["checkpoint-overlap-v1"].policyOverrides
    ).toMatchObject({ checkpointOverlapMs: 60_000 });
    expect(
      SAFEGUARD_QA_SCENARIOS["partial-quota-v1"].policyOverrides
    ).toMatchObject({
      fullParser: {
        maxUnitsPerRequest: 2,
        maxUnitsPerScan: 3,
        maxUnitsPerRollingWindow: 3,
      },
    });
    expect(
      SAFEGUARD_QA_SCENARIOS["burst-limit-v1"].policyOverrides
    ).toMatchObject({
      fullParser: {
        maxProviderStartsPerBurst: 1,
        burstWindowMs: 60_000,
      },
    });
    expect(
      SAFEGUARD_QA_SCENARIOS["history-cooldown-v1"].policyOverrides
    ).toMatchObject({ historyCooldownMs: 120_000 });
    expect(
      SAFEGUARD_QA_SCENARIOS["oversized-candidate-v1"].policyOverrides
    ).toMatchObject({
      fullParser: {
        maxPayloadBytes: 64,
        maxEstimatedInputTokens: 16,
      },
    });

    for (const id of [
      "response-validity-v1",
      "negative-three-strikes-v1",
      "terminal-fresh-install-v1",
      "trusted-local-recovery-v1",
      "account-switch-v1",
    ] as const) {
      expect(SAFEGUARD_QA_SCENARIOS[id].policyOverrides).toBeDefined();
    }
    expect(
      SAFEGUARD_QA_SCENARIOS["negative-three-strikes-v1"].policyOverrides
        .negativeStrikeThreshold
    ).toBe(3);
  });

  it("isolates reset state to one unique scenario namespace", () => {
    expect(SAFEGUARD_QA_RESET_SCOPES).toEqual([
      "usage",
      "cooldowns",
      "request-identities",
      "checkpoints",
      "local-outcomes",
      "synchronized-outcomes",
      "fixture-state",
    ]);

    const namespaces = Object.values(SAFEGUARD_QA_SCENARIOS).map(
      ({ reset }) => reset.namespace
    );
    expect(new Set(namespaces).size).toBe(REQUIRED_PROFILE_IDS.length);

    for (const scenario of Object.values(SAFEGUARD_QA_SCENARIOS)) {
      expect(scenario.reset).toEqual({
        mode: "scenario-namespace-only",
        namespace: `sms-safeguard-qa:${scenario.id}`,
        scopes: SAFEGUARD_QA_RESET_SCOPES,
      });
    }
  });

  it("rejects unsafe modes, mismatched versions, and foreign reset namespaces", () => {
    const validScenario = SAFEGUARD_QA_SCENARIOS["cutoff-boundary-v1"];

    expect(() =>
      parseSafeguardQaScenario({
        ...validScenario,
        providerMode: "production",
      })
    ).toThrow();
    expect(() =>
      parseSafeguardQaScenario({ ...validScenario, version: 2 })
    ).toThrow();
    expect(() =>
      parseSafeguardQaScenario({
        ...validScenario,
        reset: {
          ...validScenario.reset,
          namespace: "unrelated-development-data",
        },
      })
    ).toThrow();
    expect(() =>
      parseSafeguardQaScenario({
        ...validScenario,
        reset: {
          ...validScenario.reset,
          scopes: validScenario.reset.scopes.slice(1),
        },
      })
    ).toThrow();
    expect(() =>
      parseSafeguardQaScenario({
        ...validScenario,
        policyOverrides: {
          ...validScenario.policyOverrides,
          fullParser: {
            ...validScenario.policyOverrides.fullParser,
            maxUnitsPerRequest: 3,
            maxUnitsPerScan: 2,
          },
        },
      })
    ).toThrow();
  });

  it("returns deeply frozen parsed scenarios", () => {
    const scenario = parseSafeguardQaScenario(
      SAFEGUARD_QA_SCENARIOS["response-validity-v1"]
    );

    expect(Object.isFrozen(scenario)).toBe(true);
    expect(Object.isFrozen(scenario.policyOverrides)).toBe(true);
    expect(Object.isFrozen(scenario.policyOverrides.fullParser)).toBe(true);
    expect(Object.isFrozen(scenario.reset)).toBe(true);
    expect(Object.isFrozen(scenario.reset.scopes)).toBe(true);
  });
});
