interface SmsSafeguardQaScript {
  readonly buildSafeguardQaEnvironment: (
    baseEnvironment: NodeJS.ProcessEnv,
    profileId?: string | null
  ) => NodeJS.ProcessEnv;
  readonly resolveSafeguardQaProfileArgument: (
    args: readonly string[],
    options?: { readonly required?: boolean }
  ) => string | null;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const script =
  require("../../scripts/sms-safeguard-qa.js") as SmsSafeguardQaScript;

describe("SMS safeguard QA launcher", () => {
  test("requires an explicit scenario for app-facing runs", () => {
    expect(() =>
      script.resolveSafeguardQaProfileArgument([], { required: true })
    ).toThrow(/--scenario/i);
    expect(
      script.resolveSafeguardQaProfileArgument(
        ["--scenario", "partial-quota-v1"],
        { required: true }
      )
    ).toBe("partial-quota-v1");
  });

  test("passes the selected profile to Metro without enabling a real provider or inbox", () => {
    expect(
      script.buildSafeguardQaEnvironment(
        { NODE_ENV: "development" },
        "partial-quota-v1"
      )
    ).toMatchObject({
      EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: "partial-quota-v1",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
      EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
      EXPO_PUBLIC_SMS_INBOX_MODE: "fixture",
    });
  });
});
