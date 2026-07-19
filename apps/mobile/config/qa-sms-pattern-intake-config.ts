import { Platform } from "react-native";

export type QaSmsPatternIntakeUnavailableReason =
  | "unsupported_platform"
  | "release_build"
  | "flag_disabled";

export type QaSmsPatternIntakeAvailability =
  | { readonly isAvailable: true }
  | {
      readonly isAvailable: false;
      readonly reason: QaSmsPatternIntakeUnavailableReason;
    };

interface QaSmsPatternIntakeRuntime {
  readonly platform: string;
  readonly isDevelopment: boolean;
  readonly featureFlag: string | undefined;
}

interface QaSmsPatternIntakeFixtureRuntime {
  readonly testMode: string | undefined;
  readonly fixtureFlag: string | undefined;
}

function readPlatform(): string {
  const platform: unknown = Platform.OS;
  return typeof platform === "string" ? platform : "unsupported";
}

function readDevelopmentMode(): boolean {
  const isDevelopment: unknown = __DEV__;
  return isDevelopment === true;
}

const publicQaSmsPatternIntakeFlag =
  process.env.EXPO_PUBLIC_ENABLE_QA_SMS_PATTERN_INTAKE;

function getDefaultRuntime(): QaSmsPatternIntakeRuntime {
  return {
    platform: readPlatform(),
    isDevelopment: readDevelopmentMode(),
    featureFlag: publicQaSmsPatternIntakeFlag,
  };
}

export function getQaSmsPatternIntakeAvailability(
  runtime: QaSmsPatternIntakeRuntime = getDefaultRuntime()
): QaSmsPatternIntakeAvailability {
  if (runtime.platform !== "android") {
    return { isAvailable: false, reason: "unsupported_platform" };
  }
  if (!runtime.isDevelopment) {
    return { isAvailable: false, reason: "release_build" };
  }
  if (runtime.featureFlag !== "true") {
    return { isAvailable: false, reason: "flag_disabled" };
  }
  return { isAvailable: true };
}

export function isQaSmsPatternIntakeFixtureMode(
  runtime: QaSmsPatternIntakeFixtureRuntime = {
    testMode: process.env.EXPO_PUBLIC_MONYVI_TEST_MODE,
    fixtureFlag: process.env.EXPO_PUBLIC_QA_SMS_PATTERN_INTAKE_FIXTURES,
  }
): boolean {
  return runtime.testMode === "e2e" && runtime.fixtureFlag === "true";
}
