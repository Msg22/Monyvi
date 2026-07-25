import {
  DEFAULT_SMS_SCAN_POLICY,
  SMS_REFUSAL_PRECEDENCE,
  parseSmsScanPolicy,
} from "../sms-scan-policy";

describe("SMS scan safeguard policy", () => {
  it("uses the approved launch limits", () => {
    expect(DEFAULT_SMS_SCAN_POLICY).toMatchObject({
      version: 1,
      processingPolicyVersion: 1,
      lookbackDays: 30,
      checkpointOverlapMs: 5 * 60 * 1000,
      canSelectCustomRange: false,
      historyRescanEnabled: true,
      historyCooldownMs: 24 * 60 * 60 * 1000,
      reservationLeaseMs: 5 * 60 * 1000,
      negativeStrikeThreshold: 3,
      fullParser: {
        maxUnitsPerRequest: 50,
        maxUnitsPerScan: 200,
        maxUnitsPerRollingWindow: 200,
        maxPayloadBytes: 128 * 1024,
        maxEstimatedInputTokens: 32_000,
        maxProviderStartsPerBurst: 30,
      },
      categoryEnrichment: {
        maxUnitsPerRequest: 20,
        maxUnitsPerRollingWindow: 100,
        maxProviderStartsPerBurst: 30,
      },
    });
  });

  it("rejects malformed or weakened policies", () => {
    expect(() =>
      parseSmsScanPolicy({
        ...DEFAULT_SMS_SCAN_POLICY,
        lookbackDays: 0,
      })
    ).toThrow();
    expect(() =>
      parseSmsScanPolicy({
        ...DEFAULT_SMS_SCAN_POLICY,
        fullParser: {
          ...DEFAULT_SMS_SCAN_POLICY.fullParser,
          maxUnitsPerScan: 49,
        },
      })
    ).toThrow();
  });

  it("keeps refusal ordering deterministic", () => {
    expect(SMS_REFUSAL_PRECEDENCE).toEqual([
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
    ]);
  });
});
