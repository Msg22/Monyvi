import {
  assertSmsAiAdmissionInput,
  parseSmsAiAdmissionDecision,
  parseSmsAiProviderStartDecision,
  type ReconcileSmsAiOutcomesInput,
  type SmsAiAdmissionDecision,
  type SmsAiAdmissionInput,
  type SmsAiProviderStartDecision,
  type SmsSafeguardRpcClient,
} from "./sms-ai-safeguard-contract.ts";
import type { SmsSafeguardPolicy } from "./sms-safeguard-policy.ts";

const MILLISECONDS_PER_SECOND = 1000;

async function callRpc(
  client: SmsSafeguardRpcClient,
  name: string,
  params: Readonly<Record<string, unknown>>
): Promise<unknown> {
  const { data, error } = await client.rpc(name, params);
  if (error) {
    throw new Error(`SMS safeguard RPC failed: ${name}`);
  }
  return data;
}

function toSeconds(milliseconds: number): number {
  return Math.ceil(milliseconds / MILLISECONDS_PER_SECOND);
}

export interface SmsAiAvailability {
  readonly reason: string | null;
  readonly availableAt: string | null;
}

export function getSmsAiAvailability(
  decision: Pick<
    SmsAiAdmissionDecision,
    "accepted" | "decisionCode" | "availableAt"
  >
): SmsAiAvailability {
  return decision.accepted
    ? { reason: null, availableAt: null }
    : { reason: decision.decisionCode, availableAt: decision.availableAt };
}

export interface SmsAiAvailabilitySnapshot {
  readonly serverNow: string;
  readonly rollingAvailableAt: string | null;
  readonly burstAvailableAt: string | null;
  readonly historyCooldownAvailableAt: string | null;
  readonly availableAt: string | null;
  readonly reason: string | null;
}

export interface ReadSmsAiAvailabilityInput {
  readonly userId: string;
  readonly policy: SmsSafeguardPolicy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSingleRpcRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row)) {
    throw new Error("Invalid SMS safeguard availability response");
  }
  return row;
}

function parseNullableString(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") {
    throw new Error(`Invalid SMS safeguard availability field: ${field}`);
  }
  return value;
}

function parseSmsAiAvailabilitySnapshot(
  value: unknown
): SmsAiAvailabilitySnapshot {
  const row = getSingleRpcRow(value);
  if (typeof row.server_now !== "string") {
    throw new Error("Invalid SMS safeguard availability server time");
  }
  const reason = parseNullableString(row.reason, "reason");
  return {
    serverNow: row.server_now,
    rollingAvailableAt: parseNullableString(
      row.rolling_available_at,
      "rolling_available_at"
    ),
    burstAvailableAt: parseNullableString(
      row.burst_available_at,
      "burst_available_at"
    ),
    historyCooldownAvailableAt: parseNullableString(
      row.history_cooldown_available_at,
      "history_cooldown_available_at"
    ),
    availableAt: parseNullableString(row.available_at, "available_at"),
    reason,
  };
}

export async function readSmsAiAvailability(
  client: SmsSafeguardRpcClient,
  input: ReadSmsAiAvailabilityInput
): Promise<SmsAiAvailabilitySnapshot> {
  const data = await callRpc(client, "sms_ai_get_availability", {
    p_user_id: input.userId,
    p_max_units_per_rolling_window:
      input.policy.fullParser.maxUnitsPerRollingWindow,
    p_rolling_window_seconds: toSeconds(
      input.policy.fullParser.rollingWindowMs
    ),
    p_max_provider_starts_per_burst:
      input.policy.fullParser.maxProviderStartsPerBurst,
    p_burst_window_seconds: toSeconds(input.policy.fullParser.burstWindowMs),
    p_history_cooldown_seconds: toSeconds(input.policy.historyCooldownMs),
  });
  return parseSmsAiAvailabilitySnapshot(data);
}

export async function reserveSmsAiWork(
  client: SmsSafeguardRpcClient,
  input: SmsAiAdmissionInput
): Promise<SmsAiAdmissionDecision> {
  assertSmsAiAdmissionInput(input);
  const capabilityPolicy =
    input.capability === "sms_full_parse"
      ? input.policy.fullParser
      : input.policy.categoryEnrichment;
  const data = await callRpc(client, "sms_ai_reserve_work_v2", {
    p_user_id: input.userId,
    p_request_key: input.requestKey,
    p_capability: input.capability,
    p_scan_session_id: input.scanSessionId,
    p_scan_kind: input.scanKind,
    p_unit_count: input.unitCount,
    p_payload_bytes: input.payloadBytes,
    p_estimated_input_tokens: input.estimatedInputTokens,
    p_request_digest: input.requestDigest,
    p_candidate_fingerprints: [...new Set(input.candidateFingerprints)],
    p_max_units_per_scan:
      input.capability === "sms_full_parse"
        ? input.policy.fullParser.maxUnitsPerScan
        : 0,
    p_max_units_per_rolling_window: capabilityPolicy.maxUnitsPerRollingWindow,
    p_rolling_window_seconds: toSeconds(capabilityPolicy.rollingWindowMs),
    p_max_provider_starts_per_burst: capabilityPolicy.maxProviderStartsPerBurst,
    p_burst_window_seconds: toSeconds(capabilityPolicy.burstWindowMs),
    p_history_cooldown_seconds:
      input.capability === "sms_full_parse"
        ? toSeconds(input.policy.historyCooldownMs)
        : 0,
    p_reservation_lease_seconds: toSeconds(input.policy.reservationLeaseMs),
  });
  return parseSmsAiAdmissionDecision(data);
}

export async function markSmsAiProviderStarted(
  client: SmsSafeguardRpcClient,
  requestId: string,
  candidateFingerprints: readonly string[]
): Promise<SmsAiProviderStartDecision> {
  const data = await callRpc(client, "sms_ai_mark_provider_started_v3", {
    p_request_id: requestId,
    p_candidate_fingerprints: [...new Set(candidateFingerprints)],
  });
  return parseSmsAiProviderStartDecision(data);
}

export interface ResolveSmsScanWindowStartInput {
  readonly userId: string;
  readonly scanSessionId: string | null;
  readonly scanKind: "initial" | "incremental" | "history" | "live";
  readonly requestedScanStartedAtMs: number;
  readonly maxFutureSkewMs: number;
  readonly edgeGraceMs: number;
}

export async function resolveSmsScanWindowStart(
  client: SmsSafeguardRpcClient,
  input: ResolveSmsScanWindowStartInput
): Promise<number | null> {
  const data = await callRpc(client, "sms_ai_resolve_scan_window", {
    p_user_id: input.userId,
    p_scan_session_id: input.scanSessionId,
    p_scan_kind: input.scanKind,
    p_client_scan_started_at: new Date(
      input.requestedScanStartedAtMs
    ).toISOString(),
    p_max_future_skew_seconds: toSeconds(input.maxFutureSkewMs),
    p_edge_grace_seconds: toSeconds(input.edgeGraceMs),
  });
  const row = getSingleRpcRow(data);
  if (row.accepted_scan_started_at === null) return null;
  if (typeof row.accepted_scan_started_at !== "string") {
    throw new Error("Invalid SMS scan-window response");
  }
  const value = Date.parse(row.accepted_scan_started_at);
  if (!Number.isFinite(value)) {
    throw new Error("Invalid SMS scan-window timestamp");
  }
  return value;
}

export async function releaseSmsAiWork(
  client: SmsSafeguardRpcClient,
  requestId: string,
  decisionCode: string
): Promise<boolean> {
  const data = await callRpc(client, "sms_ai_release_work", {
    p_request_id: requestId,
    p_decision_code: decisionCode,
  });
  return data === true;
}

interface CompleteSmsAiWorkInput {
  readonly requestId: string;
  readonly completedWithProviderError: boolean;
  readonly decisionCode: string;
}

export async function completeSmsAiWork(
  client: SmsSafeguardRpcClient,
  input: CompleteSmsAiWorkInput
): Promise<boolean> {
  const data = await callRpc(client, "sms_ai_complete_work", {
    p_request_id: input.requestId,
    p_completed_with_provider_error: input.completedWithProviderError,
    p_decision_code: input.decisionCode,
  });
  return data === true;
}

export async function reconcileSmsAiOutcomes(
  client: SmsSafeguardRpcClient,
  input: ReconcileSmsAiOutcomesInput
): Promise<void> {
  await callRpc(client, "sms_ai_reconcile_outcomes", {
    p_user_id: input.userId,
    p_positive_fingerprints: [...new Set(input.positiveFingerprints)],
    p_negative_outcomes: input.negativeOutcomes,
    p_strike_threshold: 3,
  });
}
