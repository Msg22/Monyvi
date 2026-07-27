import {
  findContiguousDurableCheckpoint,
  type SmsScanKind,
} from "@monyvi/logic";

import {
  loadSmsScanCheckpoint,
  saveSmsScanCheckpoint,
  type SmsScanCheckpoint,
} from "./sms-scan-checkpoint-service";
import { getOversizedSmsFingerprints } from "./sms-oversized-outcome-service";
import { getSmsProcessingOutcomes } from "./sms-processing-outcome-service";
import { getSmsSafeguardQaConfig } from "@/config/sms-safeguard-qa-config";
import { getEffectiveSmsScanPolicy } from "./sms-scan-policy-service";

export type SmsCheckpointOutcome =
  | "saved"
  | "local_excluded"
  | "ai_negative"
  | "candidate_too_large"
  | "future_durable"
  | "trusted_local_match"
  | "draft_suggestion"
  | "unresolved"
  | "cancelled"
  | "failed";

export interface SmsCheckpointMessageState {
  readonly fingerprint: string;
  readonly receivedAtMs: number;
  readonly outcome: SmsCheckpointOutcome;
}

interface LoadSmsScanSafeguardStateInput {
  readonly userId: string;
  readonly scanKind: Exclude<SmsScanKind, "live">;
  readonly scanStartedAtMs: number;
  readonly fingerprints: readonly string[];
  readonly savedFingerprints: ReadonlySet<string>;
  readonly additionalDurableFingerprints?: ReadonlySet<string>;
}

export interface SmsScanSafeguardState {
  readonly checkpoint: SmsScanCheckpoint | null;
  readonly durableKnownFingerprints: ReadonlySet<string>;
  readonly terminalFingerprints: ReadonlySet<string>;
}

interface FinalizeSmsScanCheckpointInput {
  readonly userId: string;
  readonly processingPolicyVersion: number;
  readonly nowMs: number;
  readonly states: readonly SmsCheckpointMessageState[];
}

const DURABLE_OUTCOMES: ReadonlySet<SmsCheckpointOutcome> = new Set([
  "saved",
  "local_excluded",
  "ai_negative",
  "candidate_too_large",
  "future_durable",
  "trusted_local_match",
  "draft_suggestion",
]);

export async function loadSmsScanSafeguardState(
  input: LoadSmsScanSafeguardStateInput
): Promise<SmsScanSafeguardState> {
  const policy = getEffectiveSmsScanPolicy();
  const qaConfig = getSmsSafeguardQaConfig();
  const [checkpoint, processingOutcomes, oversizedFingerprints] =
    await Promise.all([
      loadSmsScanCheckpoint({
        userId: input.userId,
        processingPolicyVersion: policy.processingPolicyVersion,
        nowMs: input.scanStartedAtMs,
      }),
      qaConfig.enabled
        ? Promise.resolve([])
        : getSmsProcessingOutcomes(
            input.fingerprints,
            input.userId,
            input.scanStartedAtMs
          ),
      getOversizedSmsFingerprints({
        userId: input.userId,
        nowMs: input.scanStartedAtMs,
        lookbackDays: policy.lookbackDays,
      }),
    ]);

  const terminalFingerprints = new Set(
    processingOutcomes
      .filter((outcome) => outcome.isTerminal)
      .map((outcome) => outcome.smsFingerprint)
  );
  const durableNegativeFingerprints = processingOutcomes
    .filter((outcome) => input.scanKind !== "history" || outcome.isTerminal)
    .map((outcome) => outcome.smsFingerprint);

  return {
    checkpoint,
    terminalFingerprints,
    durableKnownFingerprints: new Set([
      ...input.savedFingerprints,
      ...oversizedFingerprints,
      ...durableNegativeFingerprints,
      ...(input.additionalDurableFingerprints ?? []),
    ]),
  };
}

export async function finalizeSmsScanCheckpoint(
  input: FinalizeSmsScanCheckpointInput
): Promise<SmsScanCheckpoint | null> {
  const boundary = findContiguousDurableCheckpoint(
    input.states.map((state) => ({
      fingerprint: state.fingerprint,
      receivedAtMs: state.receivedAtMs,
      isDurable: DURABLE_OUTCOMES.has(state.outcome),
    }))
  );
  if (boundary === null) return null;

  return saveSmsScanCheckpoint({
    userId: input.userId,
    processingPolicyVersion: input.processingPolicyVersion,
    boundaryReceivedAtMs: boundary.boundaryReceivedAtMs,
    boundaryFingerprint: boundary.boundaryFingerprint,
    nowMs: input.nowMs,
  });
}
