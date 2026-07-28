import { getSmsSafeguardQaConfig } from "@/config/sms-safeguard-qa-config";
import { SAFEGUARD_QA_SCENARIOS } from "@monyvi/logic";
import * as Crypto from "expo-crypto";

const SMS_AI_BASE_REQUEST_KEY_MAX_LENGTH = 156;

export function createSmsAiRequestKey(qaRunId?: string): string {
  const requestKey = Crypto.randomUUID();
  const scopedRequestKey =
    qaRunId === undefined ? requestKey : `${qaRunId}:app:${requestKey}`;
  if (scopedRequestKey.length > SMS_AI_BASE_REQUEST_KEY_MAX_LENGTH) {
    throw new Error("SMS AI request identity exceeds the supported boundary.");
  }
  return scopedRequestKey;
}

export async function createFilteredSmsAiRetryRequestKey(
  requestKey: string,
  candidateFingerprints: readonly string[]
): Promise<string> {
  const identity = [
    "sms-ai-filtered-retry-v1",
    requestKey,
    ...[...candidateFingerprints].sort(),
  ].join(":");
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    identity
  );
}

export function scopeSmsAiRequestKey(
  requestKey: string,
  qaRunId?: string
): string {
  const scopedRequestKey =
    qaRunId === undefined || requestKey.startsWith(`${qaRunId}:`)
      ? requestKey
      : `${qaRunId}:app:${requestKey}`;
  if (scopedRequestKey.length > SMS_AI_BASE_REQUEST_KEY_MAX_LENGTH) {
    throw new Error("SMS AI request identity exceeds the supported boundary.");
  }
  return scopedRequestKey;
}

export interface SmsParseTransport {
  readonly functionName: "parse-sms" | "sms-safeguard-qa";
  readonly headers?: Readonly<Record<string, string>>;
  readonly qaProfileId?: string;
  readonly qaRunId?: string;
  readonly chunkSize: number;
}

export function resolveSmsParseTransport(
  defaultChunkSize: number
): SmsParseTransport {
  const safeguardQaConfig = getSmsSafeguardQaConfig();
  if (!safeguardQaConfig.enabled) {
    return {
      functionName: "parse-sms",
      chunkSize: defaultChunkSize,
    };
  }
  if (
    safeguardQaConfig.profileId === null ||
    safeguardQaConfig.runId === null
  ) {
    throw new Error(
      "SMS safeguard QA requires a selected profile and run identity."
    );
  }
  return {
    functionName: "sms-safeguard-qa",
    headers: {
      "x-sms-safeguard-qa-run-id": safeguardQaConfig.runId,
    },
    qaProfileId: safeguardQaConfig.profileId,
    qaRunId: safeguardQaConfig.runId,
    chunkSize:
      SAFEGUARD_QA_SCENARIOS[safeguardQaConfig.profileId].policyOverrides
        .fullParser.maxUnitsPerRequest,
  };
}
