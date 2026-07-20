import {
  REQUIRED_SAFEGUARD_QA_PROFILE_IDS,
  SAFEGUARD_QA_SCENARIOS,
  type SafeguardQaProfileId,
} from "../../../packages/logic/src/sms-safeguards/safeguard-qa-scenarios";

export const SMS_SAFEGUARD_QA_FLAG = "EXPO_PUBLIC_SMS_SAFEGUARD_QA";

export interface SmsSafeguardQaEnvironment {
  readonly NODE_ENV?: string;
  readonly EAS_BUILD_PROFILE?: string;
  readonly EXPO_PUBLIC_RELEASE_BUILD?: string;
  readonly EXPO_PUBLIC_SMS_SAFEGUARD_QA?: string;
  readonly EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER?: string;
  readonly EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX?: string;
  readonly EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE?: string;
  readonly EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID?: string;
}

export interface SmsSafeguardQaConfig {
  readonly enabled: boolean;
  readonly isReleaseBuild: boolean;
  readonly profileId: SafeguardQaProfileId | null;
  readonly runId: string | null;
  readonly providerMode: "simulated";
  readonly inboxMode: "fixture";
  readonly allowProductionFallback: false;
  readonly namespacePrefix: "sms-safeguard-qa:";
}

const DISABLED_CONFIG: SmsSafeguardQaConfig = Object.freeze({
  enabled: false,
  isReleaseBuild: false,
  profileId: null,
  runId: null,
  providerMode: "simulated",
  inboxMode: "fixture",
  allowProductionFallback: false,
  namespacePrefix: "sms-safeguard-qa:",
});

export function isSmsSafeguardQaReleaseBuild(
  environment: SmsSafeguardQaEnvironment = process.env
): boolean {
  return (
    environment.NODE_ENV === "production" ||
    environment.EAS_BUILD_PROFILE === "production" ||
    environment.EXPO_PUBLIC_RELEASE_BUILD === "1" ||
    environment.EXPO_PUBLIC_RELEASE_BUILD === "true"
  );
}

function hasExplicitQaRequest(environment: SmsSafeguardQaEnvironment): boolean {
  return environment.EXPO_PUBLIC_SMS_SAFEGUARD_QA === "true";
}

function hasSafeQaDependencies(
  environment: SmsSafeguardQaEnvironment
): boolean {
  return (
    (environment.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER ?? "simulated") ===
      "simulated" &&
    (environment.EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX ?? "fixture") === "fixture"
  );
}

function parseProfileId(
  value: string | undefined
): SafeguardQaProfileId | null {
  return (
    REQUIRED_SAFEGUARD_QA_PROFILE_IDS.find(
      (profileId) => profileId === value
    ) ?? null
  );
}

export function getSmsSafeguardQaProfile(
  environment: SmsSafeguardQaEnvironment = process.env
): SafeguardQaProfileId | null {
  return parseProfileId(environment.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE);
}

export function getSmsSafeguardQaNowMs(
  fallbackNowMs: number,
  environment: SmsSafeguardQaEnvironment = process.env
): number {
  const config = getSmsSafeguardQaConfig(environment);
  if (!config.enabled || config.profileId === null) return fallbackNowMs;
  return SAFEGUARD_QA_SCENARIOS[config.profileId].fixedNowMs;
}

export function getSmsSafeguardQaConfig(
  environment: SmsSafeguardQaEnvironment = process.env
): SmsSafeguardQaConfig {
  const isReleaseBuild = isSmsSafeguardQaReleaseBuild(environment);
  if (
    !hasExplicitQaRequest(environment) ||
    isReleaseBuild ||
    !hasSafeQaDependencies(environment)
  ) {
    return Object.freeze({ ...DISABLED_CONFIG, isReleaseBuild });
  }

  return Object.freeze({
    ...DISABLED_CONFIG,
    enabled: true,
    isReleaseBuild: false,
    profileId: getSmsSafeguardQaProfile(environment),
    runId: environment.EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID?.trim() || null,
  });
}

interface RequireSmsSafeguardQaConfigOptions {
  readonly requireProfile?: boolean;
}

export function requireSmsSafeguardQaConfig(
  environment: SmsSafeguardQaEnvironment = process.env,
  options: RequireSmsSafeguardQaConfigOptions = {}
): SmsSafeguardQaConfig {
  const isReleaseBuild = isSmsSafeguardQaReleaseBuild(environment);
  if (isReleaseBuild && hasExplicitQaRequest(environment)) {
    throw new Error(
      "SMS safeguard QA is unavailable in release mode; refusing to activate."
    );
  }

  if (
    hasExplicitQaRequest(environment) &&
    !hasSafeQaDependencies(environment)
  ) {
    throw new Error(
      "SMS safeguard QA requires a simulated provider and fixture inbox."
    );
  }

  const requestedProfile = environment.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE;
  const profileId = getSmsSafeguardQaProfile(environment);
  if (requestedProfile !== undefined && profileId === null) {
    throw new Error(`Not a known safeguard QA profile: ${requestedProfile}`);
  }
  if (options.requireProfile !== false && profileId === null) {
    throw new Error(
      "SMS safeguard QA requires a named safeguard profile for app-facing runs."
    );
  }

  const config = getSmsSafeguardQaConfig(environment);
  if (!config.enabled) {
    throw new Error(
      "SMS safeguard QA is disabled; enable it explicitly for a development or test run."
    );
  }
  return config;
}
