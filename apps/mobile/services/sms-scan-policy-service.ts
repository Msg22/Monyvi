import {
  DEFAULT_SMS_SCAN_POLICY,
  calculateEffectiveScanBoundary,
  type SmsScanPolicy,
  type SmsScanKind,
} from "@monyvi/logic";
import { getSmsSafeguardQaConfig } from "@/config/sms-safeguard-qa-config";

export interface SmsScanCheckpointBoundary {
  readonly boundaryReceivedAtMs: number;
}

interface ResolveSmsScanPolicyInput {
  readonly scanKind: SmsScanKind;
  readonly scanStartedAtMs: number;
  readonly checkpoint?: SmsScanCheckpointBoundary | null;
}

export interface ResolvedSmsScanPolicy {
  readonly scanKind: SmsScanKind;
  readonly scanStartedAtMs: number;
  readonly effectiveMinDate: number;
  readonly policyVersion: number;
  readonly processingPolicyVersion: number;
}

export function getEffectiveSmsScanPolicy(): SmsScanPolicy {
  const safeguardQaConfig = getSmsSafeguardQaConfig();
  if (!safeguardQaConfig.enabled) return DEFAULT_SMS_SCAN_POLICY;
  if (safeguardQaConfig.profileId === null) {
    throw new Error("SMS safeguard QA requires a selected profile.");
  }

  // Development-only policy overrides remain behind the fail-closed QA flag.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const qaRuntime =
    require("./testing/sms-safeguard-qa-runner") as typeof import("./testing/sms-safeguard-qa-runner");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return qaRuntime.getSafeguardQaPolicy(safeguardQaConfig.profileId);
}

export function resolveSmsScanPolicy(
  input: ResolveSmsScanPolicyInput
): ResolvedSmsScanPolicy {
  const policy = getEffectiveSmsScanPolicy();
  return {
    scanKind: input.scanKind,
    scanStartedAtMs: input.scanStartedAtMs,
    effectiveMinDate: calculateEffectiveScanBoundary({
      scanKind: input.scanKind,
      scanStartedAtMs: input.scanStartedAtMs,
      lookbackDays: policy.lookbackDays,
      overlapMs: policy.checkpointOverlapMs,
      checkpoint: input.checkpoint ?? null,
    }),
    policyVersion: policy.version,
    processingPolicyVersion: policy.processingPolicyVersion,
  };
}
