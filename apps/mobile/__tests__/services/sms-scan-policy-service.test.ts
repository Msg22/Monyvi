import {
  getEffectiveSmsScanPolicy,
  resolveSmsScanPolicy,
} from "@/services/sms-scan-policy-service";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("sms-scan-policy-service", (): void => {
  afterEach((): void => {
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX;
    delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE;
  });

  it.each(["initial", "history"] as const)(
    "bounds %s scans to the rolling 30-day window",
    (scanKind): void => {
      const scanStartedAtMs = 40 * DAY_MS;

      expect(resolveSmsScanPolicy({ scanKind, scanStartedAtMs })).toMatchObject(
        {
          scanKind,
          scanStartedAtMs,
          effectiveMinDate: 10 * DAY_MS,
          policyVersion: 1,
        }
      );
    }
  );

  it("uses the approved overlap for an incremental checkpoint", (): void => {
    expect(
      resolveSmsScanPolicy({
        scanKind: "incremental",
        scanStartedAtMs: 40 * DAY_MS,
        checkpoint: { boundaryReceivedAtMs: 39 * DAY_MS },
      }).effectiveMinDate
    ).toBe(39 * DAY_MS - 5 * 60 * 1000);
  });

  it("never lets checkpoint overlap escape the rolling boundary", (): void => {
    expect(
      resolveSmsScanPolicy({
        scanKind: "incremental",
        scanStartedAtMs: 40 * DAY_MS,
        checkpoint: { boundaryReceivedAtMs: 5 * DAY_MS },
      }).effectiveMinDate
    ).toBe(10 * DAY_MS);
  });

  it("uses the selected QA profile policy only in explicit safeguard mode", (): void => {
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA = "true";
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER = "simulated";
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX = "fixture";
    process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE = "partial-quota-v1";

    expect(getEffectiveSmsScanPolicy().fullParser.maxUnitsPerScan).toBe(3);
    expect(
      resolveSmsScanPolicy({
        scanKind: "initial",
        scanStartedAtMs: 40 * DAY_MS,
      }).effectiveMinDate
    ).toBe(38 * DAY_MS);
  });
});
