import {
  getQaSmsPatternIntakeAvailability,
  isQaSmsPatternIntakeFixtureMode,
} from "@/config/qa-sms-pattern-intake-config";

describe("getQaSmsPatternIntakeAvailability", () => {
  it("enables only Android development with the exact feature flag", () => {
    expect(
      getQaSmsPatternIntakeAvailability({
        platform: "android",
        isDevelopment: true,
        featureFlag: "true",
      })
    ).toEqual({ isAvailable: true });
  });

  it.each([
    ["ordinary development", "android", true, undefined, "flag_disabled"],
    ["false flag", "android", true, "false", "flag_disabled"],
    ["iOS", "ios", true, "true", "unsupported_platform"],
    ["release", "android", false, "true", "release_build"],
  ] as const)(
    "fails closed for %s",
    (_label, platform, isDevelopment, featureFlag, reason) => {
      expect(
        getQaSmsPatternIntakeAvailability({
          platform,
          isDevelopment,
          featureFlag,
        })
      ).toEqual({ isAvailable: false, reason });
    }
  );
});

describe("isQaSmsPatternIntakeFixtureMode", () => {
  it("requires both E2E test mode and the exact fixture flag", () => {
    expect(
      isQaSmsPatternIntakeFixtureMode({ testMode: "e2e", fixtureFlag: "true" })
    ).toBe(true);
    expect(
      isQaSmsPatternIntakeFixtureMode({
        testMode: "e2e",
        fixtureFlag: undefined,
      })
    ).toBe(false);
    expect(
      isQaSmsPatternIntakeFixtureMode({
        testMode: undefined,
        fixtureFlag: "true",
      })
    ).toBe(false);
  });
});
