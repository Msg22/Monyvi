/**
 * Original parse-sms request boundary, extracted cohesively from the Edge
 * handler to make room for v2 pre-admission measurement. No provider/DB calls.
 */
import type { ParseSmsMessage } from "./sms-ai-provider.ts";
import {
  parseSmsReviewV2Context,
  type SmsReviewContext,
} from "./sms-ai-review-v2.ts";

export type SmsScanKind = "initial" | "incremental" | "history" | "live";

export interface ParseSmsRequestBody {
  readonly requestKey: string;
  readonly scanSessionId: string | null;
  readonly scanKind: SmsScanKind;
  readonly scanStartedAtMs: number;
  readonly messages: readonly ParseSmsMessage[];
  readonly categories: string;
  readonly supportedCurrencies: readonly string[];
  readonly reviewContractVersion?: "account-review/v2";
  readonly reviewContext?: SmsReviewContext;
}

// The mobile catalogue currently contains 35 currencies; keep a safe upper bound.
const MAX_SUPPORTED_CURRENCIES = 64;
const MAX_MESSAGES_BEFORE_POLICY_EVALUATION = 50;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(
  value: unknown,
  maxLength = 100_000
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isScanKind(value: unknown): value is SmsScanKind {
  return (
    value === "initial" ||
    value === "incremental" ||
    value === "history" ||
    value === "live"
  );
}

function parseMessage(value: unknown): ParseSmsMessage | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id, 160) ||
    !isNonEmptyString(value.body) ||
    !isNonEmptyString(value.sender, 500) ||
    !isNonEmptyString(value.date, 100) ||
    !Number.isFinite(Date.parse(value.date)) ||
    !isNonEmptyString(value.smsFingerprint, 256)
  )
    return null;
  return {
    id: value.id,
    body: value.body,
    sender: value.sender,
    date: value.date,
    smsFingerprint: value.smsFingerprint,
  };
}

function supportedCurrencies(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_SUPPORTED_CURRENCIES)
    return null;
  const result: string[] = [];
  for (const code of value) {
    if (!isNonEmptyString(code, 16)) return null;
    result.push(code);
  }
  return result;
}

function reviewContextFrom(
  value: Record<string, unknown>,
  currencies: readonly string[]
): SmsReviewContext | null | undefined {
  // Only an absent discriminator opts into the historical v1 branch.
  // A present null/undefined value is malformed v2 intent, not v1.
  if (!Object.hasOwn(value, "reviewContractVersion")) {
    return "reviewContext" in value ? undefined : null;
  }
  const version = value.reviewContractVersion;
  if (typeof version !== "string") return undefined;
  try {
    return parseSmsReviewV2Context({
      reviewContractVersion: version,
      reviewContext: value.reviewContext,
      supportedCurrencies: currencies,
    });
  } catch {
    return undefined;
  }
}

function scanId(
  value: Record<string, unknown>,
  kind: SmsScanKind
): string | null | undefined {
  const raw = value.scanSessionId;
  if (raw === null && kind === "live") return null;
  return isNonEmptyString(raw, 160) ? raw : undefined;
}

/** Strict same legacy fields, plus opt-in closed review context validation. */
export function parseSmsRequestBody(
  value: unknown
): ParseSmsRequestBody | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.messages) ||
    value.messages.length > MAX_MESSAGES_BEFORE_POLICY_EVALUATION ||
    !isNonEmptyString(value.requestKey, 160) ||
    !isScanKind(value.scanKind) ||
    !isNonEmptyString(value.categories)
  )
    return null;
  const currencies = supportedCurrencies(value.supportedCurrencies);
  const sessionId = scanId(value, value.scanKind);
  const started = Date.parse(String(value.scanStartedAt));
  if (
    currencies === null ||
    sessionId === undefined ||
    !Number.isFinite(started)
  )
    return null;
  const messages: ParseSmsMessage[] = [];
  for (const candidate of value.messages) {
    const msg = parseMessage(candidate);
    if (msg === null) return null;
    messages.push(msg);
  }
  if (
    new Set(messages.map((msg) => msg.id)).size !== messages.length ||
    new Set(messages.map((msg) => msg.smsFingerprint)).size !== messages.length
  )
    return null;
  const review = reviewContextFrom(value, currencies);
  if (review === undefined) return null;
  return {
    ...(review === null
      ? {}
      : {
          reviewContractVersion: "account-review/v2" as const,
          reviewContext: review,
        }),
    requestKey: value.requestKey,
    scanSessionId: sessionId,
    scanKind: value.scanKind,
    scanStartedAtMs: started,
    messages,
    categories: value.categories,
    supportedCurrencies: currencies,
  };
}
