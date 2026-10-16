import {
  parseVoiceEntitlementPolicy,
  type VoiceEntitlementPolicy,
} from "./voice-ai-safeguard-contract.ts";

export type GetVoiceEntitlementEnvironmentValue = (
  name: string
) => string | undefined;

const VOICE_LEDGER_RETENTION_SECONDS = 35 * 24 * 60 * 60;

function readRequiredValue(
  getEnvironmentValue: GetVoiceEntitlementEnvironmentValue,
  name: string
): string {
  const value = getEnvironmentValue(name);

  if (value === undefined || value.length === 0 || value.trim() !== value) {
    throw new Error(
      `Voice AI policy configuration missing or malformed: ${name}`
    );
  }

  return value;
}

function readRequiredPositiveInteger(
  getEnvironmentValue: GetVoiceEntitlementEnvironmentValue,
  name: string
): number {
  const raw = readRequiredValue(getEnvironmentValue, name);

  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a positive safe integer`);
  }

  return value;
}

/**
 * Provider-independent free-launch entitlement resolver.
 *
 * All operational policy values are required server configuration. Missing,
 * malformed or retention-incompatible configuration fails closed.
 */
export function resolveVoiceEntitlementPolicy(
  getEnvironmentValue: GetVoiceEntitlementEnvironmentValue
): VoiceEntitlementPolicy {
  const dailyLimit = readRequiredPositiveInteger(
    getEnvironmentValue,
    "VOICE_AI_DAILY_LIMIT"
  );
  const burstLimit = readRequiredPositiveInteger(
    getEnvironmentValue,
    "VOICE_AI_BURST_LIMIT"
  );
  const burstWindowSeconds = readRequiredPositiveInteger(
    getEnvironmentValue,
    "VOICE_AI_BURST_WINDOW_SECONDS"
  );
  const reservationLeaseSeconds = readRequiredPositiveInteger(
    getEnvironmentValue,
    "VOICE_AI_RESERVATION_LEASE_SECONDS"
  );
  const policyVersion = readRequiredValue(
    getEnvironmentValue,
    "VOICE_AI_POLICY_VERSION"
  );

  if (burstWindowSeconds > VOICE_LEDGER_RETENTION_SECONDS) {
    throw new Error(
      "VOICE_AI_BURST_WINDOW_SECONDS exceeds the retained accounting horizon"
    );
  }

  return parseVoiceEntitlementPolicy({
    mode: "metered",
    dailyLimit,
    burstLimit,
    burstWindowSeconds,
    reservationLeaseSeconds,
    policyVersion,
    source: "free_launch",
  });
}
