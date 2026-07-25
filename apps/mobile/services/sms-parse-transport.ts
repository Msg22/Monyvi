import { getSmsSafeguardQaConfig } from "@/config/sms-safeguard-qa-config";
import { SAFEGUARD_QA_SCENARIOS } from "@monyvi/logic";

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
