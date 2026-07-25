import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getSmsSafeguardQaConfig,
  getSmsSafeguardQaFixtureAnchorMs,
  getSmsSafeguardQaNowMs,
  getSmsSafeguardQaProfile,
  requireSmsSafeguardQaConfig,
} from "@/config/sms-safeguard-qa-config";

describe("SMS safeguard QA runtime configuration", () => {
  test("is disabled unless explicitly requested with fixture and simulated modes", () => {
    expect(getSmsSafeguardQaConfig({ NODE_ENV: "development" }).enabled).toBe(
      false
    );
    expect(
      getSmsSafeguardQaConfig({
        NODE_ENV: "development",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: "partial-quota-v1",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: "run-1",
      })
    ).toMatchObject({
      enabled: true,
      profileId: "partial-quota-v1",
      providerMode: "simulated",
      inboxMode: "fixture",
      allowProductionFallback: false,
    });
  });

  test("requires a known versioned profile for app-facing QA mode", () => {
    const baseEnvironment = {
      NODE_ENV: "development",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: "run-1",
    } as const;

    expect(() => requireSmsSafeguardQaConfig(baseEnvironment)).toThrow(
      /named safeguard profile/i
    );
    expect(() =>
      requireSmsSafeguardQaConfig({
        ...baseEnvironment,
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: "invented-profile",
      })
    ).toThrow(/known safeguard QA profile/i);
    expect(
      getSmsSafeguardQaProfile({
        ...baseEnvironment,
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: "partial-quota-v1",
      })
    ).toBe("partial-quota-v1");
  });

  test("rejects run identities that cannot fit inside namespaced Edge request keys", () => {
    const environment = {
      NODE_ENV: "development",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: "partial-quota-v1",
    } as const;

    expect(
      getSmsSafeguardQaConfig({
        ...environment,
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: "r".repeat(96),
      }).enabled
    ).toBe(true);
    expect(() =>
      getSmsSafeguardQaConfig({
        ...environment,
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: "r".repeat(97),
      })
    ).toThrow(/bounded run identity/i);
  });

  test("keeps an app-facing QA scan anchored to the current scan start", () => {
    const scanStartedAtMs = Date.UTC(2030, 0, 1, 12, 0, 0);

    expect(
      getSmsSafeguardQaNowMs(scanStartedAtMs, {
        NODE_ENV: "development",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: "cutoff-boundary-v1",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: "run-1",
      })
    ).toBe(scanStartedAtMs);
  });

  test("keeps fixture timestamps stable for one QA run while later scans use their current start", () => {
    const firstScanStartedAtMs = Date.UTC(2030, 0, 1, 12, 0, 0);
    const secondScanStartedAtMs = firstScanStartedAtMs + 60_000;
    const environment = {
      NODE_ENV: "development",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: "checkpoint-overlap-v1",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: "fixture-anchor-config-test",
    } as const;

    expect(
      getSmsSafeguardQaFixtureAnchorMs(firstScanStartedAtMs, environment)
    ).toBe(firstScanStartedAtMs);
    expect(getSmsSafeguardQaNowMs(secondScanStartedAtMs, environment)).toBe(
      secondScanStartedAtMs
    );
    expect(
      getSmsSafeguardQaFixtureAnchorMs(secondScanStartedAtMs, environment)
    ).toBe(firstScanStartedAtMs);
  });

  test("fails closed in release mode and for non-simulated dependencies", () => {
    expect(() =>
      requireSmsSafeguardQaConfig({
        NODE_ENV: "production",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
      })
    ).toThrow(/release mode/i);

    expect(() =>
      requireSmsSafeguardQaConfig({
        NODE_ENV: "development",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "production",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "device",
      })
    ).toThrow(/simulated provider and fixture inbox/i);

    expect(() =>
      getSmsSafeguardQaConfig({
        NODE_ENV: "production",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
      })
    ).toThrow(/release mode/i);
    expect(() =>
      getSmsSafeguardQaConfig({
        NODE_ENV: "development",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "production",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "device",
      })
    ).toThrow(/simulated provider and fixture inbox/i);
  });

  test("fails closed when an explicitly enabled QA run omits required dependencies", () => {
    const baseEnvironment = {
      NODE_ENV: "development",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: "partial-quota-v1",
    } as const;

    expect(() =>
      getSmsSafeguardQaConfig({
        ...baseEnvironment,
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: "run-1",
      })
    ).toThrow(/simulated provider and fixture inbox/i);
    expect(() =>
      getSmsSafeguardQaConfig({
        ...baseEnvironment,
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: "run-1",
      })
    ).toThrow(/simulated provider and fixture inbox/i);
    expect(() =>
      getSmsSafeguardQaConfig({
        ...baseEnvironment,
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
        EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
      })
    ).toThrow(/run identity/i);
  });

  test("does not import or reference production inbox/provider access", () => {
    const source = readFileSync(
      resolve(__dirname, "../../config/sms-safeguard-qa-config.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/supabase|SmsReader|database|fetch\s*\(/i);
    expect(source).toMatch(/allowProductionFallback:\s*false/);
  });
});
