export type SmsHistoryCooldownCapability =
  | "sms_full_parse"
  | "sms_category_enrichment";
export type SmsHistoryCooldownScanKind =
  | "initial"
  | "incremental"
  | "history"
  | "live";

export interface SmsHistoryCooldownInput {
  readonly capability: SmsHistoryCooldownCapability;
  readonly scanKind: SmsHistoryCooldownScanKind;
  readonly serverNow: string;
  readonly existingStartedAt: string | null;
  readonly providerStartedAt: string | null;
  readonly cooldownMs: number;
}

export interface SmsHistoryCooldownState {
  readonly startedAt: string | null;
  readonly availableAt: string | null;
}

function parseTimestamp(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return timestamp;
}

function getEarliestTimestamp(
  first: string | null,
  second: string | null
): string | null {
  if (first === null) {
    return second;
  }
  if (second === null) {
    return first;
  }
  return parseTimestamp(first, "existingStartedAt") <=
    parseTimestamp(second, "providerStartedAt")
    ? first
    : second;
}

export function getSmsHistoryCooldownState(
  input: SmsHistoryCooldownInput
): SmsHistoryCooldownState {
  if (!Number.isSafeInteger(input.cooldownMs) || input.cooldownMs <= 0) {
    throw new Error("cooldownMs must be a positive integer");
  }

  const serverNowMs = parseTimestamp(input.serverNow, "serverNow");
  if (input.existingStartedAt !== null) {
    parseTimestamp(input.existingStartedAt, "existingStartedAt");
  }
  if (input.providerStartedAt !== null) {
    parseTimestamp(input.providerStartedAt, "providerStartedAt");
  }

  const isFirstHistoryProviderStart =
    input.capability === "sms_full_parse" && input.scanKind === "history";
  const startedAt = isFirstHistoryProviderStart
    ? getEarliestTimestamp(input.existingStartedAt, input.providerStartedAt)
    : input.existingStartedAt;

  if (startedAt === null) {
    return { startedAt: null, availableAt: null };
  }

  const availableAtMs =
    parseTimestamp(startedAt, "startedAt") + input.cooldownMs;
  return {
    startedAt,
    availableAt:
      availableAtMs > serverNowMs
        ? new Date(availableAtMs).toISOString()
        : null,
  };
}
