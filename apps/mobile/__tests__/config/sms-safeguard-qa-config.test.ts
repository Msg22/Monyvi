import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getSmsSafeguardQaConfig,
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
