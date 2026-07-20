import type { SmsSafeguardPolicy } from "./sms-safeguard-policy.ts";

export type SmsAiCapability = "sms_full_parse" | "sms_category_enrichment";
export type SmsAiScanKind = "initial" | "incremental" | "history" | "live";

export interface SmsAiAdmissionInput {
  readonly userId: string;
  readonly requestKey: string;
  readonly capability: SmsAiCapability;
  readonly scanSessionId: string | null;
  readonly scanKind: SmsAiScanKind | null;
  readonly unitCount: number;
  readonly payloadBytes: number;
  readonly estimatedInputTokens: number;
  readonly policy: SmsSafeguardPolicy;
}

export interface SmsAiAdmissionDecision {
  readonly requestId: string;
  readonly accepted: boolean;
  readonly decisionCode: string;
  readonly availableAt: string | null;
  readonly isReplay: boolean;
}

export interface SmsAiProviderStartDecision {
  readonly started: boolean;
  readonly decisionCode: string;
}

export interface SmsAiNegativeOutcomeInput {
  readonly smsFingerprint: string;
  readonly originalReceivedAt: string;
}

export interface ReconcileSmsAiOutcomesInput {
  readonly userId: string;
  readonly positiveFingerprints: readonly string[];
  readonly negativeOutcomes: readonly SmsAiNegativeOutcomeInput[];
}

export interface SmsSafeguardRpcClient {
  readonly rpc: (
    name: string,
    params: Readonly<Record<string, unknown>>
  ) => PromiseLike<{ readonly data: unknown; readonly error: unknown }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSingleRpcRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row)) {
    throw new Error("Invalid SMS safeguard RPC response");
  }
  return row;
}

export function parseSmsAiAdmissionDecision(
  value: unknown
): SmsAiAdmissionDecision {
  const row = getSingleRpcRow(value);
  if (
    typeof row.request_id !== "string" ||
    typeof row.accepted !== "boolean" ||
    typeof row.decision_code !== "string" ||
    (row.available_at !== null && typeof row.available_at !== "string") ||
    typeof row.is_replay !== "boolean"
  ) {
    throw new Error("Invalid SMS safeguard admission response");
  }

  return {
    requestId: row.request_id,
    accepted: row.accepted,
    decisionCode: row.decision_code,
    availableAt: row.available_at,
    isReplay: row.is_replay,
  };
}

export function parseSmsAiProviderStartDecision(
  value: unknown
): SmsAiProviderStartDecision {
  const row = getSingleRpcRow(value);
  if (
    typeof row.started !== "boolean" ||
    typeof row.decision_code !== "string"
  ) {
    throw new Error("Invalid SMS safeguard provider-start response");
  }
  return { started: row.started, decisionCode: row.decision_code };
}

export function assertSmsAiAdmissionInput(input: SmsAiAdmissionInput): void {
  const capabilityPolicy =
    input.capability === "sms_full_parse"
      ? input.policy.fullParser
      : input.policy.categoryEnrichment;
  if (
    input.userId.trim().length === 0 ||
    input.requestKey.trim().length === 0 ||
    input.requestKey.length > 160 ||
    !Number.isSafeInteger(input.unitCount) ||
    input.unitCount <= 0 ||
    input.unitCount > capabilityPolicy.maxUnitsPerRequest ||
    !Number.isSafeInteger(input.payloadBytes) ||
    input.payloadBytes < 0 ||
    !Number.isSafeInteger(input.estimatedInputTokens) ||
    input.estimatedInputTokens < 0
  ) {
    throw new Error("Invalid SMS safeguard admission input");
  }
}
